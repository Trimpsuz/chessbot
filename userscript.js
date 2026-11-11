// ==UserScript==
// @name        ChessBot
// @namespace   ChessBot
// @match       *://*.chess.com/*
// @grant       none
// @version     2.0.3
// @author      Trimpsuz
// @description ChessBot Userscript
// ==/UserScript==

var oldboard;
let doc = window.document;
let playingAs = null;
var mousePressed = false;
let ws = null;
let reconnectTimer = null;
let sentBoard = null;

function connect() {
  const socket = new WebSocket('ws://127.0.0.1:5678');

  socket.onopen = () => {
    ws = socket;
    console.log('Connected to server');

    // Force the interval to send the current board again after a reconnect
    oldboard = undefined;
    sentBoard = null;

    // Restore the side setting that the server loses when it restarts
    if (playingAs != null) {
      sendToServer(JSON.stringify({ type: 'setting', data: { key: 'side', value: playingAs } }));
    }
  };

  socket.onmessage = handleMessage;

  socket.onclose = () => {
    if (ws === socket) {
      ws = null;
      console.log('Lost connection to server, reconnecting...');
    }

    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 2000);
    }
  };
}

function sendToServer(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}

connect();

document.onmousedown = function (e) {
  if (e.button == 0) {
    mousePressed = true;
  }
};

document.onmouseup = function (e) {
  if (e.button == 0) {
    mousePressed = false;
  }
};

// mouseup does not fire when the window loses focus mid-drag
window.onblur = function () {
  mousePressed = false;
};

// The board can be updated while the tab is hidden, so re-evaluate it on return
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState == 'visible') {
    oldboard = undefined;
  }
});

document.oncontextmenu = function () {
  return false;
};

setInterval(function () {
  //A held piece makes the board snapshot unreliable
  if (mousePressed) {
    return;
  }

  const boardElement = document.getElementsByClassName('board')[0];

  if (!boardElement) {
    return;
  }

  const board = Array.from(boardElement.getElementsByClassName('piece')).map((piece) => piece.getAttribute('class') || '');
  const boardChanged = JSON.stringify(board) != JSON.stringify(oldboard);

  //Build the position every tick: while the tab is in the background the board
  //and the move list can update on different ticks.
  const send = [];

  board.forEach((element) => {
    const classes = element.split(/\s+/);
    const squareClass = classes.find((name) => name.startsWith('square-'));
    const pieceClass = classes.find((name) => /^[wb][pnbrqk]$/.test(name));

    if (!squareClass || !pieceClass) {
      return;
    }

    const coords = squareClass.slice('square-'.length);

    if (!/^[1-8][1-8]$/.test(coords)) {
      return;
    }

    const file = 'abcdefgh'.charAt(Number(coords.charAt(0)) - 1);
    send.push(pieceClass + coords.charAt(1) + file);
  });

  //A snapshot taken mid-animation can be incomplete. Skip it and retry next tick.
  const squares = new Set(send.map((piece) => piece.slice(2)));
  if (!send.some((piece) => piece.startsWith('wk')) || !send.some((piece) => piece.startsWith('bk')) || squares.size != send.length) {
    console.log('Board snapshot incomplete, retrying');
    oldboard = undefined;
    return;
  }

  //Check whose turn it is
  const timestamps = document.getElementsByClassName('timestamps-with-base-time')[0];

  if (!timestamps || timestamps.children.length == 0) {
    return;
  }

  const lastRow = timestamps.children[timestamps.children.length - 1];
  const divs = Array.from(lastRow.children).filter((div) => {
    return !div.classList.contains('time-black') && !div.classList.contains('time-white');
  });

  if (boardChanged) {
    //check if the left mouse button is down, because if the user is holding onto a piece it would not get detected with the board and the board information would be incorrect
    //Board is updated
    console.log('board updated');
    oldboard = board;

    var moveFromIndicator = document.getElementById('moveFromIndicator');
    var moveToIndicator = document.getElementById('moveToIndicator');

    if (moveFromIndicator != null && moveToIndicator != null) {
      moveFromIndicator.remove();
      moveToIndicator.remove();
    }

    var moveFromIndicator1 = document.getElementById('moveFromIndicator1');
    var moveToIndicator1 = document.getElementById('moveToIndicator1');

    if (moveFromIndicator1 != null && moveToIndicator1 != null) {
      moveFromIndicator1.remove();
      moveToIndicator1.remove();
    }

    var moveFromIndicator2 = document.getElementById('moveFromIndicator2');
    var moveToIndicator2 = document.getElementById('moveToIndicator2');

    if (moveFromIndicator2 != null && moveToIndicator2 != null) {
      moveFromIndicator2.remove();
      moveToIndicator2.remove();
    }

    var gameid = document.URL.substring(document.URL.lastIndexOf('/') + 1);

    const coordinates = document.querySelector('.board > svg.coordinates > text:nth-child(8)');

    //Change sides
    if (coordinates && coordinates.textContent == '1' && playingAs != 1) {
      playingAs = 1;
      sendToServer(JSON.stringify({ type: 'setting', data: { key: 'side', value: 1 } }));
      console.log('Playing as white');
    } else if (coordinates && coordinates.textContent == '8' && playingAs != 0) {
      playingAs = 0;
      sendToServer(JSON.stringify({ type: 'setting', data: { key: 'side', value: 0 } }));
      console.log('Playing as black');
    }

    //Check if board is in starting position
    if (
      JSON.stringify(send) ==
      '["br8h","bn8g","bb8f","bk8e","bq8d","bb8c","bn8b","br8a","bp7h","bp7g","bp7f","bp7e","bp7d","bp7c","bp7b","bp7a","wp2h","wp2g","wp2f","wp2e","wp2d","wp2c","wp2b","wp2a","wr1h","wn1g","wb1f","wk1e","wq1d","wb1c","wn1b","wr1a"]'
    ) {
      console.log('New game started');
      sendToServer(JSON.stringify({ type: 'message', data: 'New game started' }));
      playingAs = null;
      sentBoard = null;
    }
  }

  const isOurTurn = (playingAs == 0 && divs.length == 1) || (playingAs == 1 && divs.length == 2);

  //Only send once per position: if the move list updates before the board,
  //wait for the board update instead of sending the previous position.
  if (!isOurTurn || (!boardChanged && JSON.stringify(send) == JSON.stringify(sentBoard))) {
    return;
  }

  //Send board array
  sendToServer(JSON.stringify(send));
  sentBoard = send;
  console.log('it is your turn');
}, 400);

function handleMessage({ data }) {
  var gameid = document.URL.substring(document.URL.lastIndexOf('/') + 1);

  var boardElement = document.getElementsByClassName('board')[0];

  if (JSON.parse(data).type == 'resend') {
    // The server restarted its engine; make the interval send the board again.
    oldboard = undefined;
    sentBoard = null;
    return;
  }

  if (JSON.parse(data).data.key == 'first') {
    key = JSON.parse(data).data.value;
    //replace letters with numbers because chess.com uses only numbers for piece positions
    moveFrom = key.charAt(0).replace('h', '8').replace('g', '7').replace('f', '6').replace('e', '5').replace('d', '4').replace('c', '3').replace('b', '2').replace('a', '1') + key.charAt(1);
    moveTo = key.charAt(2).replace('h', '8').replace('g', '7').replace('f', '6').replace('e', '5').replace('d', '4').replace('c', '3').replace('b', '2').replace('a', '1') + key.charAt(3);

    //set correct correct image for move
    moveFromBorder = 'https://i.imgur.com/T0ke9bC.png';
    moveToBorder = 'https://i.imgur.com/SmmiHsX.png';

    var moveFromElement = document.createElement('div');
    moveFromElement.id = 'moveFromIndicator';
    moveFromElement.style.cssText = `background: url("${moveFromBorder}");background-size: 100% 100%`;
    moveFromElement.classList.add('square-' + moveFrom);
    moveFromElement.classList.add('highlight');

    var moveToElement = document.createElement('div');
    moveToElement.id = 'moveToIndicator';
    moveToElement.style.cssText = `background: url("${moveToBorder}");background-size: 100% 100%`;
    moveToElement.classList.add('square-' + moveTo);
    moveToElement.classList.add('highlight');

    boardElement.append(moveFromElement);
    boardElement.append(moveToElement);
  }

  if (JSON.parse(data).data.key == 'second') {
    key = JSON.parse(data).data.value;
    //replace letters with numbers because chess.com uses only numbers for piece positions
    moveFrom = key.charAt(0).replace('h', '8').replace('g', '7').replace('f', '6').replace('e', '5').replace('d', '4').replace('c', '3').replace('b', '2').replace('a', '1') + key.charAt(1);
    moveTo = key.charAt(2).replace('h', '8').replace('g', '7').replace('f', '6').replace('e', '5').replace('d', '4').replace('c', '3').replace('b', '2').replace('a', '1') + key.charAt(3);

    //set correct correct image for move
    moveFromBorder = 'https://i.imgur.com/Hz5s4O7.png';
    moveToBorder = 'https://i.imgur.com/63vhbt5.png';

    var moveFromElement1 = document.createElement('div');
    moveFromElement1.id = 'moveFromIndicator1';
    moveFromElement1.style.cssText = `background: url("${moveFromBorder}");background-size: 100% 100%`;
    moveFromElement1.classList.add('square-' + moveFrom);
    moveFromElement1.classList.add('highlight');

    var moveToElement1 = document.createElement('div');
    moveToElement1.id = 'moveToIndicator1';
    moveToElement1.style.cssText = `background: url("${moveToBorder}");background-size: 100% 100%`;
    moveToElement1.classList.add('square-' + moveTo);
    moveToElement1.classList.add('highlight');

    boardElement.append(moveFromElement1);
    boardElement.append(moveToElement1);
  }

  if (JSON.parse(data).data.key == 'third') {
    key = JSON.parse(data).data.value;
    //replace letters with numbers because chess.com uses only numbers for piece positions
    moveFrom = key.charAt(0).replace('h', '8').replace('g', '7').replace('f', '6').replace('e', '5').replace('d', '4').replace('c', '3').replace('b', '2').replace('a', '1') + key.charAt(1);
    moveTo = key.charAt(2).replace('h', '8').replace('g', '7').replace('f', '6').replace('e', '5').replace('d', '4').replace('c', '3').replace('b', '2').replace('a', '1') + key.charAt(3);

    //set correct correct image for move
    moveFromBorder = 'https://i.imgur.com/qdEqbeE.png';
    moveToBorder = 'https://i.imgur.com/bWw4LZc.png';

    var moveFromElement2 = document.createElement('div');
    moveFromElement2.id = 'moveFromIndicator2';
    moveFromElement2.style.cssText = `background: url("${moveFromBorder}");background-size: 100% 100%`;
    moveFromElement2.classList.add('square-' + moveFrom);
    moveFromElement2.classList.add('highlight');

    var moveToElement2 = document.createElement('div');
    moveToElement2.id = 'moveToIndicator2';
    moveToElement2.style.cssText = `background: url("${moveToBorder}");background-size: 100% 100%`;
    moveToElement2.classList.add('square-' + moveTo);
    moveToElement2.classList.add('highlight');

    boardElement.append(moveFromElement2);
    boardElement.append(moveToElement2);
  }
}

// ==UserScript==
// @name        ChessBot
// @namespace   ChessBot
// @match       *://*.chess.com/*
// @match       *://*.lichess.org/*
// @grant       none
// @run-at      document-start
// @version     2.1.0
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
let serverHandler = null;

const IS_LICHESS = window.location.hostname.endsWith('lichess.org');
const IS_CHESSCOM = window.location.hostname.endsWith('chess.com');

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

  socket.onmessage = (event) => {
    if (serverHandler) {
      serverHandler(event);
    }
  };

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

if (IS_CHESSCOM) {
  document.addEventListener('mousedown', function (e) {
    if (e.button == 0) {
      mousePressed = true;
    }
  });

  document.addEventListener('mouseup', function (e) {
    if (e.button == 0) {
      mousePressed = false;
    }
  });

  // mouseup does not fire when the window loses focus mid-drag
  window.addEventListener('blur', function () {
    mousePressed = false;
  });

  // The board can be updated while the tab is hidden, so re-evaluate it on return
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState == 'visible') {
      oldboard = undefined;
    }
  });

  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

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

  serverHandler = handleMessage;
}

// Lichess

let lichessActive = false;
let lichessColor = null;

const lichessHintColors = { first: '#ff0100', second: '#ff7f00', third: '#ffeb00' };
const lichessPieceTypes = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };

function clearLichessHints() {
  document.querySelectorAll('.chessbot-hint').forEach((element) => element.remove());
}

function addLichessHintSquare(wrap, square, color, blackAtBottom) {
  const file = 'abcdefgh'.indexOf(square.charAt(0));
  const rank = Number(square.charAt(1)) - 1;
  const element = document.createElement('div');

  element.className = 'chessbot-hint';
  element.style.cssText =
    `position:absolute;width:12.5%;height:12.5%;pointer-events:none;opacity:0.55;z-index:10;background:${color};` +
    `left:${(blackAtBottom ? 7 - file : file) * 12.5}%;top:${(blackAtBottom ? rank : 7 - rank) * 12.5}%;`;

  wrap.appendChild(element);
}

function showLichessHint(key, uci) {
  const wrap = document.querySelector('.main-board .cg-wrap');

  if (!wrap || typeof uci != 'string' || !/^[a-h][1-8][a-h][1-8]/.test(uci)) {
    return;
  }

  const blackAtBottom = wrap.classList.contains('orientation-black');
  const color = lichessHintColors[key] || lichessHintColors.first;

  addLichessHintSquare(wrap, uci.slice(0, 2), color, blackAtBottom);
  addLichessHintSquare(wrap, uci.slice(2, 4), color, blackAtBottom);
}

function getLichessPlayerColor() {
  const clock = document.querySelector('.rclock-bottom');

  if (!clock) {
    return null;
  }

  if (clock.classList.contains('rclock-white')) {
    return 'white';
  }

  if (clock.classList.contains('rclock-black')) {
    return 'black';
  }
}

function setLichessColor() {
  if (lichessColor) {
    return;
  }

  const color = getLichessPlayerColor();

  if (!color) {
    return;
  }

  lichessColor = color;
  playingAs = color == 'white' ? 1 : 0;
  sendToServer(JSON.stringify({ type: 'setting', data: { key: 'side', value: playingAs } }));
}

function getLichessTurnColor() {
  const clock = document.querySelector('.rclock.running');

  if (!clock) {
    return null;
  }

  if (clock.classList.contains('rclock-white')) {
    return 'white';
  }

  if (clock.classList.contains('rclock-black')) {
    return 'black';
  }

  const wrap = document.querySelector('.main-board .cg-wrap');
  const bottom = wrap && wrap.classList.contains('orientation-black') ? 'black' : 'white';

  if (clock.classList.contains('rclock-bottom')) {
    return bottom;
  }

  if (clock.classList.contains('rclock-top')) {
    return bottom == 'white' ? 'black' : 'white';
  }

  return null;
}

function getLichessBoard(wrap) {
  const board = wrap.querySelector('cg-board');

  if (!board) {
    return null;
  }

  const bounds = board.getBoundingClientRect();
  const squareSize = bounds.width / 8;

  if (!squareSize) {
    return null;
  }

  const send = [];
  const squares = new Set();
  let unstable = false;

  board.querySelectorAll('piece').forEach((piece) => {
    if (piece.classList.contains('anim') || piece.classList.contains('dragging')) {
      unstable = true;
      return;
    }

    // A fading piece is a captured piece that is not part of the current position
    if (piece.classList.contains('fading')) {
      return;
    }

    const role = Object.keys(lichessPieceTypes).find((name) => piece.classList.contains(name));
    const color = piece.classList.contains('white') ? 'w' : piece.classList.contains('black') ? 'b' : null;

    if (!role || !color) {
      return;
    }

    const rect = piece.getBoundingClientRect();
    const file = Math.round((rect.left - bounds.left) / squareSize);
    const rank = 8 - Math.round((rect.top - bounds.top) / squareSize);

    if (file < 0 || file > 7 || rank < 1 || rank > 8) {
      unstable = true;
      return;
    }

    const fileChar = 'abcdefgh'.charAt(file);
    send.push(color + lichessPieceTypes[role] + rank + fileChar);
    squares.add(fileChar + rank);
  });

  if (unstable || !send.some((piece) => piece.startsWith('wk')) || !send.some((piece) => piece.startsWith('bk')) || squares.size != send.length) {
    return null;
  }

  return send;
}

function loadLichessPageData() {
  const element = document.getElementById('page-init-data');

  if (!element) {
    return;
  }

  let data;

  try {
    data = JSON.parse(element.textContent).data;
  } catch (error) {
    return;
  }

  if (!data || !data.game || !data.player || !data.game.variant) {
    return;
  }

  if (data.game.variant.key != 'standard' || data.player.spectator) {
    return;
  }

  if (!data.game.status || data.game.status.name != 'started') {
    return;
  }

  lichessActive = true;
  setLichessColor();
}

function handleLichessServerMessage({ data }) {
  let message;

  try {
    message = JSON.parse(data);
  } catch (error) {
    return;
  }

  if (message.type == 'resend') {
    sentBoard = null;
    clearLichessHints();
    return;
  }

  if (!lichessActive || message.type != 'move' || !message.data) {
    return;
  }

  if (document.querySelector('.result-wrap') || getLichessTurnColor() != lichessColor) {
    return;
  }

  showLichessHint(message.data.key, message.data.value);
}

if (IS_LICHESS) {
  serverHandler = handleLichessServerMessage;

  if (document.readyState == 'loading') {
    document.addEventListener('DOMContentLoaded', loadLichessPageData, { once: true });
  } else {
    loadLichessPageData();
  }

  setInterval(function () {
    if (!lichessActive) {
      return;
    }

    if (document.querySelector('.result-wrap')) {
      clearLichessHints();
      return;
    }

    if (!lichessColor) {
      setLichessColor();
      return;
    }

    if (getLichessTurnColor() != lichessColor) {
      clearLichessHints();
      return;
    }

    const wrap = document.querySelector('.main-board .cg-wrap');

    if (!wrap) {
      return;
    }

    const board = getLichessBoard(wrap);

    if (!board || JSON.stringify(board) == JSON.stringify(sentBoard)) {
      return;
    }

    sendToServer(JSON.stringify(board));
    sentBoard = board;
    console.log('it is your turn');
  }, 400);
}

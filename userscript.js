// ==UserScript==
// @name        ChessBot
// @namespace   ChessBot
// @match       *://*.chess.com/*
// @grant       none
// @version     2.0.2
// @author      Trimpsuz
// @description ChessBot Userscript
// ==/UserScript==

var oldboard;
let doc = window.document;
let playingAs = null;
var mousePressed = false;
ws = null;

const connect = (url) => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (err) => reject(err);
  });
};

ws = await connect('ws://127.0.0.1:5678');

async function tryconnect() {
  ws = await connect('ws://127.0.0.1:5678');
}

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

document.oncontextmenu = function () {
  return false;
};

setInterval(function () {
  let send = [];
  var board = Array.from(document.getElementsByClassName('piece'));
  board = board.map((piece) => piece.getAttribute('class'));

  if (JSON.stringify(board) != JSON.stringify(oldboard) && !mousePressed) {
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

    //Change sides
    if (document.querySelector('.board > svg.coordinates > text:nth-child(8)').textContent == '1' && playingAs != 1) {
      playingAs = 1;
      ws.send(JSON.stringify({ type: 'setting', data: { key: 'side', value: 1 } }));
      console.log('Playing as white');
    } else if (document.querySelector('.board > svg.coordinates > text:nth-child(8)').textContent == '8' && playingAs != 0) {
      playingAs = 0;
      ws.send(JSON.stringify({ type: 'setting', data: { key: 'side', value: 0 } }));
      console.log('Playing as black');
    }

    //Clean board array
    board.forEach((element) => {
      if (element.split(' ')[1].charAt(0) == 's') {
        element = element.split(' ')[0] + ' ' + element.split(' ')[2] + ' ' + element.split(' ')[1];
      }

      var spot = element.replace('piece', '').replace('square-', '').replace(/\s+/g, '');

      spot =
        spot.slice(0, -2) +
        spot.charAt(spot.length - 1) +
        spot
          .charAt(spot.length - 2)
          .replace('1', 'a')
          .replace('2', 'b')
          .replace('3', 'c')
          .replace('4', 'd')
          .replace('5', 'e')
          .replace('6', 'f')
          .replace('7', 'g')
          .replace('8', 'h');

      send.push(spot);
    });

    //Check whose turn it is

    let movelist = Array.from(document.getElementsByClassName('move'));

    movelist = movelist.pop();

    let originalDivs = Array.from(movelist.getElementsByTagName('div'));

    let divs = [];

    originalDivs.forEach((div) => {
      if (div.classList.contains('time-black') || div.classList.contains('time-white')) {
        return;
      }
      divs.push(div);
    });

    if (playingAs == 0) {
      //Playing as Black
      if (divs.length == 1) {
        //Send board array
        ws.send(JSON.stringify(send));
        console.log('it is your turn');
      }
    } else if (playingAs == 1) {
      //Playing as White
      if (divs.length == 2) {
        //Send board array
        ws.send(JSON.stringify(send));
        console.log('it is your turn');
      }
    }

    //Check if board is in starting position
    if (
      JSON.stringify(send) ==
      '["br8h","bn8g","bb8f","bk8e","bq8d","bb8c","bn8b","br8a","bp7h","bp7g","bp7f","bp7e","bp7d","bp7c","bp7b","bp7a","wp2h","wp2g","wp2f","wp2e","wp2d","wp2c","wp2b","wp2a","wr1h","wn1g","wb1f","wk1e","wq1d","wb1c","wn1b","wr1a"]'
    ) {
      if (ws.readyState != WebSocket.CONNECTING) {
        tryconnect();
      }
      console.log('New game started');
      ws.send(JSON.stringify({ type: 'message', data: 'New game started' }));
      playingAs = null;
    }
  }
}, 400);

ws.addEventListener('message', ({ data }) => {
  var gameid = document.URL.substring(document.URL.lastIndexOf('/') + 1);

  var boardElement = document.getElementsByClassName('board')[0];

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
});

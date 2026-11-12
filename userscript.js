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

let playingAs = null;
let ws = null;
let reconnectTimer = null;
let sentBoard = null;

const IS_LICHESS = window.location.hostname.endsWith('lichess.org');
const FILES = 'abcdefgh';

function connect() {
  const socket = new WebSocket('ws://127.0.0.1:5678');

  socket.onopen = () => {
    ws = socket;
    console.log('Connected to server');

    // Force the interval to send the current board again after a reconnect
    sentBoard = null;
    site.reset();

    // Restore the side setting that the server loses when it restarts
    if (playingAs != null) {
      sendSetting('side', playingAs);
    }
  };

  socket.onmessage = handleServerMessage;

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

function sendSetting(key, value) {
  sendToServer(JSON.stringify({ type: 'setting', data: { key, value } }));
}

function setPlayingAs(value) {
  if (playingAs == value) {
    return;
  }

  playingAs = value;
  sendSetting('side', value);
}

// Chess.com

let oldboard;
let mousePressed = false;

const chesscomStartPosition =
  '["br8h","bn8g","bb8f","bk8e","bq8d","bb8c","bn8b","br8a","bp7h","bp7g","bp7f","bp7e","bp7d","bp7c","bp7b","bp7a","wp2h","wp2g","wp2f","wp2e","wp2d","wp2c","wp2b","wp2a","wr1h","wn1g","wb1f","wk1e","wq1d","wb1c","wn1b","wr1a"]';

const chesscomHints = {
  first: { suffix: '', from: 'https://i.imgur.com/T0ke9bC.png', to: 'https://i.imgur.com/SmmiHsX.png' },
  second: { suffix: '1', from: 'https://i.imgur.com/Hz5s4O7.png', to: 'https://i.imgur.com/63vhbt5.png' },
  third: { suffix: '2', from: 'https://i.imgur.com/qdEqbeE.png', to: 'https://i.imgur.com/bWw4LZc.png' },
};

function removeChesscomHint(key) {
  const suffix = chesscomHints[key].suffix;
  const from = document.getElementById('moveFromIndicator' + suffix);
  const to = document.getElementById('moveToIndicator' + suffix);

  if (from) {
    from.remove();
  }

  if (to) {
    to.remove();
  }
}

function clearChesscomHints() {
  Object.keys(chesscomHints).forEach(removeChesscomHint);
}

function addChesscomHintSquare(boardElement, id, square, image) {
  // Chess.com uses file+rank numbers for squares, e.g. e4 is square-54
  const element = document.createElement('div');

  element.id = id;
  element.style.cssText = `background: url("${image}");background-size: 100% 100%`;
  element.classList.add('square-' + (FILES.indexOf(square.charAt(0)) + 1) + square.charAt(1));
  element.classList.add('highlight');

  boardElement.append(element);
}

function showChesscomHint(key, uci) {
  const hint = chesscomHints[key];
  const boardElement = document.getElementsByClassName('board')[0];

  if (!hint || !boardElement || !/^[a-h][1-8][a-h][1-8]/.test(uci)) {
    return;
  }

  removeChesscomHint(key);

  addChesscomHintSquare(boardElement, 'moveFromIndicator' + hint.suffix, uci.slice(0, 2), hint.from);
  addChesscomHintSquare(boardElement, 'moveToIndicator' + hint.suffix, uci.slice(2, 4), hint.to);
}

function readChesscomBoard() {
  const boardElement = document.getElementsByClassName('board')[0];

  if (!boardElement) {
    return null;
  }

  const pieces = Array.from(boardElement.getElementsByClassName('piece')).map((piece) => piece.getAttribute('class') || '');
  const boardChanged = JSON.stringify(pieces) != JSON.stringify(oldboard);
  const send = [];

  pieces.forEach((element) => {
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

    send.push(pieceClass + coords.charAt(1) + FILES.charAt(Number(coords.charAt(0)) - 1));
  });

  // A snapshot taken mid-animation can be incomplete. Skip it and retry next tick.
  const squares = new Set(send.map((piece) => piece.slice(2)));

  if (!send.some((piece) => piece.startsWith('wk')) || !send.some((piece) => piece.startsWith('bk')) || squares.size != send.length) {
    console.log('Board snapshot incomplete, retrying');
    oldboard = undefined;
    return null;
  }

  return { pieces, boardChanged, send };
}

function pollChesscom() {
  // A held piece makes the board snapshot unreliable
  if (mousePressed) {
    return null;
  }

  const snapshot = readChesscomBoard();

  if (!snapshot) {
    return null;
  }

  // Check whose turn it is
  const timestamps = document.getElementsByClassName('timestamps-with-base-time')[0];

  if (!timestamps || timestamps.children.length == 0) {
    return null;
  }

  const lastRow = timestamps.children[timestamps.children.length - 1];
  const divs = Array.from(lastRow.children).filter((div) => {
    return !div.classList.contains('time-black') && !div.classList.contains('time-white');
  });

  if (snapshot.boardChanged) {
    console.log('board updated');
    oldboard = snapshot.pieces;

    clearChesscomHints();

    const coordinates = document.querySelector('.board > svg.coordinates > text:nth-child(8)');

    // Change sides
    if (coordinates && coordinates.textContent == '1' && playingAs != 1) {
      setPlayingAs(1);
      console.log('Playing as white');
    } else if (coordinates && coordinates.textContent == '8' && playingAs != 0) {
      setPlayingAs(0);
      console.log('Playing as black');
    }

    // Check if board is in starting position
    if (JSON.stringify(snapshot.send) == chesscomStartPosition) {
      console.log('New game started');
      sendToServer(JSON.stringify({ type: 'message', data: 'New game started' }));
      playingAs = null;
      sentBoard = null;
    }
  }

  const isOurTurn = (playingAs == 0 && divs.length == 1) || (playingAs == 1 && divs.length == 2);

  return isOurTurn ? snapshot.send : null;
}

function initChesscom() {
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
  const file = FILES.indexOf(square.charAt(0));
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
  console.log(clock);

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
  setPlayingAs(color == 'white' ? 1 : 0);
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

    const fileChar = FILES.charAt(file);
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

function handleLichessHint(key, uci) {
  if (!lichessActive || document.querySelector('.result-wrap') || getLichessTurnColor() != lichessColor) {
    return;
  }

  showLichessHint(key, uci);
}

function pollLichess() {
  if (!lichessActive) {
    return null;
  }

  if (document.querySelector('.result-wrap')) {
    clearLichessHints();
    return null;
  }

  if (!lichessColor) {
    setLichessColor();
    return null;
  }

  if (getLichessTurnColor() != lichessColor) {
    clearLichessHints();
    return null;
  }

  const wrap = document.querySelector('.main-board .cg-wrap');

  if (!wrap) {
    return null;
  }

  return getLichessBoard(wrap);
}

function initLichess() {
  if (document.readyState == 'loading') {
    document.addEventListener('DOMContentLoaded', loadLichessPageData, { once: true });
  } else {
    loadLichessPageData();
  }
}

// Shared runtime

const chesscomSite = {
  init: initChesscom,
  poll: pollChesscom,
  reset() {
    oldboard = undefined;
  },
  showHint: showChesscomHint,
};

const lichessSite = {
  init: initLichess,
  poll: pollLichess,
  reset: clearLichessHints,
  showHint: handleLichessHint,
};

const site = IS_LICHESS ? lichessSite : chesscomSite;

function handleServerMessage({ data }) {
  let message;

  try {
    message = JSON.parse(data);
  } catch (error) {
    return;
  }

  if (message.type == 'resend') {
    // The server restarted its engine, make the interval send the board again
    sentBoard = null;
    site.reset();
    return;
  }

  if (message.type == 'move' && message.data) {
    site.showHint(message.data.key, message.data.value);
  }
}

site.init();
connect();

setInterval(function () {
  const board = site.poll();

  // Only send once per position
  if (!board || JSON.stringify(board) == JSON.stringify(sentBoard)) {
    return;
  }

  sendToServer(JSON.stringify(board));
  sentBoard = board;
  console.log('it is your turn');
}, 400);

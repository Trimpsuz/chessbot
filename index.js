import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const spawn = require('child_process').spawn;

const wss = new WebSocketServer({ port: 5678 });
const chess = new Chess();

let engine = null;

function startEngine(restarted = false) {
  const proc = spawn('./engine/engine.exe');
  let stopped = false;
  let outputBuffer = '';

  engine = proc;

  proc.stdin.setEncoding('utf8');

  const restart = (message) => {
    if (stopped) {
      return;
    }

    stopped = true;
    console.error(message + ' Restarting engine...');
    setTimeout(() => startEngine(true), 1000);
  };

  proc.on('error', (err) => restart('Engine error: ' + err.message));
  proc.stdin.on('error', (err) => console.error('Engine stdin error:', err.message));
  proc.on('exit', (code) => restart('Engine exited with code ' + code + '.'));

  proc.stdout.on('data', function (chunk) {
    outputBuffer += chunk.toString('utf8');

    const lines = outputBuffer.split('\n');
    outputBuffer = lines.pop();

    lines.forEach(handleEngineOutput);
  });

  if (restarted) {
    // Make the userscript send the current board again
    broadcastControl('resend');
  }
}

startEngine();

let playingAs = null;

const depth = '6';
const movetime = '45000';

let fen = '';

let promoteTo = '';

console.log('Waiting for connections...');

function sendToClients(message) {
  const data = JSON.stringify(message);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function broadcast(key, value) {
  sendToClients({ type: 'move', data: { key, value } });
}

function broadcastControl(type) {
  sendToClients({ type });
}

function getPieceName(piece) {
  switch (piece) {
    case 'p':
      return 'pawn';
    case 'n':
      return 'knight';
    case 'b':
      return 'bishop';
    case 'r':
      return 'rook';
    case 'q':
      return 'queen';
    case 'k':
      return 'king';
  }
}

function isSupportedBoard(board) {
  const kings = { w: 0, b: 0 };
  const pawns = { w: 0, b: 0 };
  const extra = { w: { n: 0, b: 0, r: 0, q: 0 }, b: { n: 0, b: 0, r: 0, q: 0 } };
  const squares = new Set();

  for (const piece of board) {
    if (typeof piece != 'string' || piece.length != 4) {
      return false;
    }

    const color = piece.charAt(0);
    const type = piece.charAt(1);
    const rank = piece.charAt(2);
    const file = piece.charAt(3);

    if (!'wb'.includes(color) || !'pnbrqk'.includes(type) || rank < '1' || rank > '8' || !'abcdefgh'.includes(file)) {
      return false;
    }

    const square = file + rank;

    if (squares.has(square)) {
      return false;
    }

    squares.add(square);

    if (type == 'k') {
      kings[color]++;
    } else if (type == 'p') {
      pawns[color]++;

      if (rank == '1' || rank == '8') {
        return false;
      }
    } else {
      extra[color][type]++;
    }
  }

  if (kings.w != 1 || kings.b != 1 || pawns.w > 8 || pawns.b > 8) {
    return false;
  }

  for (const color of ['w', 'b']) {
    const pieces = extra[color];
    const additional = Math.max(pieces.n - 2, 0) + Math.max(pieces.b - 2, 0) + Math.max(pieces.r - 2, 0) + Math.max(pieces.q - 1, 0);

    if (additional > 8 - pawns[color]) {
      return false;
    }
  }

  return true;
}

wss.on('connection', (ws) => {
  console.log('New client connected!');

  engine.stdin.cork();
  engine.stdin.write('ucinewgame\n');
  engine.stdin.uncork();

  ws.on('message', (data) => {
    if (data.toString().charAt(0) == '[' && data.toString().charAt(data.toString().length - 1) == ']') {
      //Message contains board data
      const board = JSON.parse(data);

      if (!isSupportedBoard(board)) {
        console.error('Ignoring unsupported board position');
        return;
      }

      chess.clear();

      board.forEach((element) => {
        chess.put({ type: element.charAt(1), color: element.charAt(0) }, reverse(element.charAt(element.length - 2) + element.charAt(element.length - 1)));
      });

      fen = chess.fen();

      if (playingAs == 0) {
        fen = fen.replace(' w ', ' b ');
      }

      const mirror = new Chess();
      mirror.load(fen.replace(/ (w|b) /, (_, side) => (side == 'w' ? ' b ' : ' w ')));

      if (mirror.in_check()) {
        console.error('Ignoring unsupported board position: opponent king can be captured');
        return;
      }

      console.log('Position: ' + fen);

      engine.stdin.cork();
      engine.stdin.write('setoption name MultiPV value 3\n');
      engine.stdin.uncork();

      engine.stdin.cork();
      engine.stdin.write('position fen ' + fen + '\n');
      engine.stdin.uncork();

      engine.stdin.cork();
      engine.stdin.write('go depth ' + depth + '\n');
      engine.stdin.uncork();
    } else if (JSON.parse(data).type == 'setting') {
      //Message contains settings

      if (JSON.parse(data).data.key == 'side') {
        if (playingAs != JSON.parse(data).data.value) {
          playingAs = JSON.parse(data).data.value;

          console.log('\nStockfish on depth ' + depth);
          if (playingAs == 0) {
            //Playing as Black
            console.log('Playing as Black');
          } else if (playingAs == 1) {
            //Playing as White
            console.log('Playing as White');
          }
        }
      }
    } else if (JSON.parse(data).type == 'message') {
      //Message contains generic message

      if (JSON.parse(data).data == 'New game started') {
        playingAs = null;
        promoteTo = '';
        fen = '';

        engine.stdin.cork();
        engine.stdin.write('ucinewgame\n');
        engine.stdin.uncork();

        engine.stdin.cork();
        engine.stdin.write('position startpos\n');
        engine.stdin.uncork();
      }
    }
  });

  ws.on('close', () => {
    console.log('Client has disconnected!');
  });

  ws.on('error', (err) => {
    console.error('Client connection error:', err.message);
  });
});

function reverse(s) {
  return s.split('').reverse().join('');
}

function handleEngineOutput(element) {
  if (element.startsWith('info depth ' + depth)) {
    if (element.split('multipv ').pop().startsWith('2')) {
      //second best move
      broadcast('second', element.split('pv ').pop().split(' ')[0]);
    } else if (element.split('multipv ').pop().startsWith('3')) {
      //third best move
      broadcast('third', element.split('pv ').pop().split(' ')[0]);
    }
  } else if (element.startsWith('bestmove')) {
    const match = element.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
    if (!match) {
      return;
    }

    let bestmove = match[1];
    const piece = chess.get(bestmove.slice(0, 2));

    // The result can belong to an older position if the board was updated mid-search
    if (!piece) {
      return;
    }

    promoteTo = '';

    if (isNaN(bestmove.charAt(bestmove.length - 1))) {
      promoteTo = bestmove.charAt(bestmove.length - 1);
      bestmove = bestmove.slice(0, -1);

      console.log(getPieceName(piece.type) + ` ${bestmove.slice(2, 4)}` + ' Promote To ' + getPieceName(promoteTo));
    } else {
      console.log(getPieceName(piece.type) + ` ${bestmove.slice(2, 4)}`);
    }

    broadcast('first', bestmove);
  }
}

import { WebSocketServer } from 'ws';
import { Chess } from 'chess.js';
import say from 'say';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const spawn = require('child_process').spawn;
const engine = spawn('./engine/engine.exe');
engine.stdin.setEncoding('utf8');

const wss = new WebSocketServer({ port: 5678 });
const chess = new Chess();

let playingAs = null;

const depth = '7';
const movetime = '45000';

let bestmove = '';

let fen = '';

let promoteTo = '';

console.log('Waiting for connections...');

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

wss.on('connection', (ws) => {
  console.log('New client connected!');

  engine.stdin.cork();
  engine.stdin.write('ucinewgame\n');
  engine.stdin.uncork();

  ws.on('message', (data) => {
    if (data.toString().charAt(0) == '[' && data.toString().charAt(data.toString().length - 1) == ']') {
      //Message contains board data
      chess.clear();

      const board = JSON.parse(data);

      board.forEach((element) => {
        chess.put({ type: element.charAt(1), color: element.charAt(0) }, reverse(element.charAt(element.length - 2) + element.charAt(element.length - 1)));
      });

      fen = chess.fen();

      if (playingAs == 0) {
        fen = fen.replace(' w ', ' b ');
      }

      engine.stdin.cork();
      engine.stdin.write('setoption name MultiPV value 3\n');
      engine.stdin.uncork();

      engine.stdin.cork();
      engine.stdin.write('position fen ' + fen + '\n');
      engine.stdin.uncork();

      engine.stdin.cork();
      engine.stdin.write('go depth ' + depth + '\n');
      engine.stdin.uncork();

      engine.stdin.cork();
      engine.stdin.write('d\n');
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
});

function reverse(s) {
  return s.split('').reverse().join('');
}

engine.stdout.on('data', function (msg) {
  msg = msg.toString('utf8');
  let msgs = msg.split('\n');

  for (let index = 0; index < msgs.length; index++) {
    const element = msgs[index];

    if (element.startsWith('info depth ' + depth)) {
      if (element.split('multipv ').pop().startsWith('2')) {
        //second best move

        wss.clients.forEach(function each(client) {
          client.send(JSON.stringify({ type: 'move', data: { key: 'second', value: element.split('pv ').pop().split(' ')[0] } }));
        });
      } else if (element.split('multipv ').pop().startsWith('3')) {
        //third best move

        wss.clients.forEach(function each(client) {
          client.send(JSON.stringify({ type: 'move', data: { key: 'third', value: element.split('pv ').pop().split(' ')[0] } }));
        });
      }
    } else if (element.startsWith('bestmove')) {
      promoteTo = '';
      bestmove = element.split(' ')[1];
      console.log(element);

      if (bestmove == '(none)') {
        return;
      }

      if (isNaN(bestmove.charAt(bestmove.length - 1))) {
        promoteTo = bestmove.charAt(bestmove.length - 1);
        bestmove = bestmove.slice(0, -1);

        console.log(getPieceName(chess.get(bestmove.charAt(0) + bestmove.charAt(1)).type) + ` ${bestmove.charAt(2) + bestmove.charAt(3)}` + ' Promote To ' + getPieceName(promoteTo));
        say.speak(getPieceName(chess.get(bestmove.charAt(0) + bestmove.charAt(1)).type) + ` ${bestmove.charAt(2) + bestmove.charAt(3)}` + ' Promote To ' + getPieceName(promoteTo));
      } else {
        console.log(getPieceName(chess.get(bestmove.charAt(0) + bestmove.charAt(1)).type) + ` ${bestmove.charAt(2) + bestmove.charAt(3)}`);
        say.speak(getPieceName(chess.get(bestmove.charAt(0) + bestmove.charAt(1)).type) + ` ${bestmove.charAt(2) + bestmove.charAt(3)}`);
      }

      wss.clients.forEach(function each(client) {
        client.send(JSON.stringify({ type: 'move', data: { key: 'first', value: bestmove } }));
      });
    }
  }

  if (msg.startsWith('\r')) {
    console.log(msg.split('F')[0]);
  }
});

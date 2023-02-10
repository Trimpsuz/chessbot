# Chess Bot

## A JavaScript-based chess bot for [Chess.com](https://www.chess.com) that suggests moves for you while you play using the Stockfish engine.

### The userscript.js contains the userscript to be ran using an userscript manager like [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/). The index.js file contains the server and is supposed to be ran using NodeJS.

### Usage

- Clone the repository
- Install the dependencies
- Create the 'engine' directory, add the stockfish executable from https://stockfishchess.org/download/ to the it and rename it to 'engine.exe'
- Add the userscript.js to your userscript manager
- Run the index.js file with NodeJS

### Features

- Suggests 3 different moves
- Customizable depth
- Uses the [Stockfish](https://stockfishchess.org/) engine
- Uses a websocket to transfer data between the browser end (userscript) and the server end (NodeJS script)

### TODO

- [ ] Clean up the code
- [ ] Fix bugs
- [ ] Add a config system for easy configuration of depth etc without needing to edit the code
- [ ] Add support for other chess websites, such as [Lichess.org](https://lichess.org)

### License

This project is licensed under the GPLv3 license. See the [LICENSE](LICENSE) file for details.

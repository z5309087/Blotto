const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let gameSettings = null;
let players = {};
let playerNames = {};
let scores = {};
let firstPlayer = null;
let roundNumber = 1;

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    socket.on('joinGame', (playerName) => {
        if (!firstPlayer) {
            firstPlayer = socket.id;
        }
        if (!players[socket.id]) {
            players[socket.id] = { name: playerName, move: null };
            playerNames[socket.id] = playerName;
            scores[socket.id] = { name: playerName, score: 0, wins: 0 };
        }
        socket.emit('waitingForPlayer');
        if (socket.id === firstPlayer) {
            socket.emit('isFirstPlayer');
        } else {
            socket.emit('waitingForGameSettings');
        }
    });

    socket.on('gameSettings', (settings) => {
        if (socket.id === firstPlayer && !gameSettings) {
            gameSettings = settings;
            io.emit('startGame', gameSettings);
        }
    });

    socket.on('makeMove', (move) => {
        if (isValidMove(move, gameSettings.soldiers)) {
            players[socket.id].move = move;
            if (Object.values(players).every(player => player.move !== null)) {
                const results = determineResults(gameSettings, players);
                io.emit('gameResult', results);
                resetMoves();
                roundNumber++;
                io.emit('nextRound', roundNumber);
            }
        } else {
            socket.emit('invalidMove', 'The number of soldiers must sum up to the specified amount.');
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
        delete players[socket.id];
        delete playerNames[socket.id];
        delete scores[socket.id];
        if (Object.keys(players).length === 0) {
            resetGame();
        } else {
            io.emit('playerDisconnected');
        }
    });
});

function isValidMove(move, totalSoldiers) {
    const sum = move.reduce((acc, val) => acc + val, 0);
    return sum === totalSoldiers;
}

function determineResults(settings, players) {
    const playerIDs = Object.keys(players);
    const castles = settings.castles;
    const points = settings.points;
    
    let results = [];
    let crossTable = {};
    let distributions = {};

    playerIDs.forEach(id => {
        crossTable[players[id].name] = {};
        distributions[players[id].name] = players[id].move;
    });

    for (let i = 0; i < playerIDs.length; i++) {
        for (let j = i + 1; j < playerIDs.length; j++) {
            let player1 = playerIDs[i];
            let player2 = playerIDs[j];
            let player1Score = 0;
            let player2Score = 0;

            for (let k = 0; k < castles; k++) {
                if (players[player1].move[k] > players[player2].move[k]) {
                    player1Score += points[k];
                } else if (players[player2].move[k] > players[player1].move[k]) {
                    player2Score += points[k];
                }
            }

            scores[player1].score += player1Score;
            scores[player2].score += player2Score;

            if (player1Score > player2Score) {
                scores[player1].wins += 1;
                crossTable[players[player1].name][players[player2].name] = player1Score;
                crossTable[players[player2].name][players[player1].name] = player2Score;
            } else if (player2Score > player1Score) {
                scores[player2].wins += 1;
                crossTable[players[player1].name][players[player2].name] = player1Score;
                crossTable[players[player2].name][players[player1].name] = player2Score;
            } else {
                crossTable[players[player1].name][players[player2].name] = player1Score;
                crossTable[players[player2].name][players[player1].name] = player2Score;
            }

            results.push({
                player1: scores[player1].name,
                player2: scores[player2].name,
                player1Score,
                player2Score,
                winner: player1Score > player2Score ? scores[player1].name : scores[player2].name
            });
        }
    }

    // Sort scores by wins, then by points
    const sortedScores = Object.values(scores).sort((a, b) => {
        if (b.wins !== a.wins) {
            return b.wins - a.wins;
        }
        return b.score - a.score;
    });

    return { results, scores: sortedScores, crossTable, distributions };
}

function resetMoves() {
    for (let id in players) {
        players[id].move = null;
    }
}

function resetGame() {
    gameSettings = null;
    players = {};
    playerNames = {};
    scores = {};
    firstPlayer = null;
    roundNumber = 1;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

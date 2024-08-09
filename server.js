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
            scores[socket.id] = { name: playerName, totalPercentage: 0, wins: 0, totalScore: 0, roundPercentages: [] };
        }
        socket.emit('waitingForPlayer');
        if (socket.id === firstPlayer) {
            socket.emit('isFirstPlayer');
        } else {
            socket.emit('waitingForGameSettings');
        }
    });

    socket.on('gameSettings', (settings) => {
        if (socket.id === firstPlayer) {
            gameSettings = settings;
            io.emit('startGame', gameSettings);
        }
    });

    socket.on('makeMove', (move) => {
        if (isValidMove(move, gameSettings.soldiers)) {
            players[socket.id].move = move;
            if (Object.values(players).every(player => player.move !== null)) {
                const roundResults = determineRoundResults(gameSettings, players);
                io.emit('roundResult', roundResults);
            }
        } else {
            socket.emit('invalidMove', 'The number of soldiers must sum up to the specified amount.');
        }
    });

    socket.on('nextRound', () => {
        resetMoves();
        roundNumber++;
        io.emit('nextRound', roundNumber);
    });

    socket.on('endGame', () => {
        const finalResults = determineFinalResults();
        io.emit('gameEnded', finalResults);
        resetGame();
    });

    socket.on('updateSettings', (settings) => {
        if (socket.id === firstPlayer) {
            gameSettings = settings;
            io.emit('settingsUpdated', gameSettings);
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

function determineRoundResults(settings, players) {
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
                } else {
                    player1Score += points[k] / 2;
                    player2Score += points[k] / 2;
                }
            }

            // Calculate the points possible for each player this round
            const totalPointsPossible = player1Score + player2Score;
            const player1Percentage = totalPointsPossible ? (player1Score / totalPointsPossible) * 100 : 0;
            const player2Percentage = totalPointsPossible ? (player2Score / totalPointsPossible) * 100 : 0;

            // Store the round percentages
            scores[player1].roundPercentages.push(player1Percentage);
            scores[player2].roundPercentages.push(player2Percentage);

            // Accumulate total score
            scores[player1].totalScore += player1Score;
            scores[player2].totalScore += player2Score;

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

    let roundScores = playerIDs.map(id => ({
        name: scores[id].name,
        score: scores[id].totalScore,
        wins: scores[id].wins
    }));

    // Sort roundScores by wins, then by total score
    roundScores.sort((a, b) => {
        if (b.wins !== a.wins) {
            return b.wins - a.wins;
        }
        return b.score - a.score;
    });

    return { results, crossTable, distributions, roundScores };
}

function determineFinalResults() {
    const sortedScores = Object.values(scores).map(score => {
        const averagePercentage = score.roundPercentages.reduce((acc, val) => acc + val, 0) / score.roundPercentages.length;
        return {
            name: score.name,
            wins: score.wins,
            averagePercentage: averagePercentage.toFixed(2) + '%'
        };
    }).sort((a, b) => {
        if (b.wins !== a.wins) {
            return b.wins - a.wins;
        }
        return parseFloat(b.averagePercentage) - parseFloat(a.averagePercentage);
    });
    return { scores: sortedScores };
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

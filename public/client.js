const socket = io();
let isFirstPlayer = false;

document.getElementById('joinForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const playerName = document.getElementById('playerName').value;
    socket.emit('joinGame', playerName);
    document.getElementById('joinForm').style.display = 'none';
});

socket.on('waitingForPlayer', () => {
    document.getElementById('status').innerText = 'Waiting for more players...';
});

socket.on('isFirstPlayer', () => {
    isFirstPlayer = true;
    document.getElementById('settingsForm').style.display = 'block';
    document.getElementById('status').innerText = 'Enter game settings:';
});

socket.on('waitingForGameSettings', () => {
    document.getElementById('status').innerText = 'Waiting for the first player to set the game settings...';
});

document.getElementById('settingsForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const castles = parseInt(document.getElementById('castles').value);
    const points = document.getElementById('points').value.split(',').map(Number);
    const soldiers = parseInt(document.getElementById('soldiers').value);
    socket.emit('gameSettings', { castles, points, soldiers });
    document.getElementById('settingsForm').style.display = 'none';
});

socket.on('startGame', (settings) => {
    document.getElementById('status').innerText = 'Distribute your soldiers:';
    document.getElementById('moveForm').style.display = 'block';
    const moveForm = document.getElementById('moveForm');
    moveForm.innerHTML = '';
    for (let i = 0; i < settings.castles; i++) {
        moveForm.innerHTML += `<label for="castle${i}">Castle ${i + 1} (${settings.points[i]} points):</label>
        <input type="number" id="castle${i}" name="castle${i}" min="0" max="${settings.soldiers}" required><br>`;
    }
    moveForm.innerHTML += '<button type="submit">Submit</button>';
    moveForm.dataset.soldiers = settings.soldiers;
});

document.getElementById('moveForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const move = [];
    const inputs = document.querySelectorAll('#moveForm input[type="number"]');
    let sum = 0;
    inputs.forEach(input => {
        const value = parseInt(input.value);
        move.push(value);
        sum += value;
    });
    const totalSoldiers = parseInt(document.getElementById('moveForm').dataset.soldiers);
    if (sum === totalSoldiers) {
        socket.emit('makeMove', move);
        document.getElementById('moveForm').style.display = 'none';
        document.getElementById('status').innerText = 'Waiting for other players...';
    } else {
        document.getElementById('status').innerText = `Invalid move: The number of soldiers must sum up to ${totalSoldiers}.`;
    }
});

socket.on('roundResult', (data) => {
    const { results, crossTable, distributions, roundScores } = data;
    const playerNames = Object.keys(crossTable);
    document.getElementById('status').innerHTML = `
        <h2>Round Results</h2>
        <p>Round Scores:</p>
        <ul>
            ${roundScores.map(score => `<li>${score.name}: ${score.score} points, ${score.wins} wins</li>`).join('')}
        </ul>
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    ${playerNames.map(name => `<th>${name}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${playerNames.map(name => `
                    <tr>
                        <td>${name}</td>
                        ${playerNames.map(opponentName => {
                            if (name === opponentName) {
                                return '<td>-</td>';
                            }
                            return `<td>${crossTable[name][opponentName] || 0}</td>`;
                        }).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <h2>Player Distributions</h2>
        ${playerNames.map(name => `
            <p><strong>${name}:</strong> ${distributions[name].join(', ')}</p>
        `).join('')}
        ${isFirstPlayer ? '<button id="updateSettingsButton">Update Settings</button>' : ''}
        ${isFirstPlayer ? '<button id="endGameButton">End Game</button>' : ''}
    `;

    if (isFirstPlayer) {
        document.getElementById('updateSettingsButton').addEventListener('click', () => {
            document.getElementById('settingsForm').style.display = 'block';
            document.getElementById('status').innerText = 'Update game settings:';
        });

        document.getElementById('endGameButton').addEventListener('click', () => {
            socket.emit('endGame');
        });
    }
});

document.getElementById('settingsForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const castles = parseInt(document.getElementById('castles').value);
    const points = document.getElementById('points').value.split(',').map(Number);
    const soldiers = parseInt(document.getElementById('soldiers').value);
    socket.emit('updateSettings', { castles, points, soldiers });
    document.getElementById('settingsForm').style.display = 'none';
});

socket.on('settingsUpdated', (settings) => {
    document.getElementById('status').innerText = 'Game settings updated. Distribute your soldiers:';
    document.getElementById('moveForm').style.display = 'block';
    const moveForm = document.getElementById('moveForm');
    moveForm.innerHTML = '';
    for (let i = 0; i < settings.castles; i++) {
        moveForm.innerHTML += `<label for="castle${i}">Castle ${i + 1} (${settings.points[i]} points):</label>
        <input type="number" id="castle${i}" name="castle${i}" min="0" max="${settings.soldiers}" required><br>`;
    }
    moveForm.innerHTML += '<button type="submit">Submit</button>';
    moveForm.dataset.soldiers = settings.soldiers;
    socket.emit('nextRound'); // Trigger the next round when settings are updated
});

socket.on('invalidMove', (message) => {
    document.getElementById('status').innerText = message;
    document.getElementById('moveForm').style.display = 'block';
});

socket.on('playerDisconnected', () => {
    document.getElementById('status').innerText = 'Opponent disconnected. Game over.';
});

socket.on('nextRound', (roundNumber) => {
    document.getElementById('status').innerText = `Round ${roundNumber}. Distribute your soldiers:`;
    document.getElementById('moveForm').style.display = 'block';
    document.getElementById('moveForm').reset();
});

socket.on('gameEnded', (data) => {
    const { scores } = data;
    document.getElementById('status').innerHTML = `
        <h2>Final Scores</h2>
        <ul>
            ${scores.map(score => `<li>${score.name}: ${score.wins} wins, ${score.averagePercentage} average percentage</li>`).join('')}
        </ul>
        <p>The game has ended. Thank you for playing!</p>
    `;
});

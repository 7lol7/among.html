const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const path = require('path');

let rooms = {};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(express.static(__dirname));

function checkWinConditions(room, roomId) {
    if (!room || !room.players || room.players.length === 0) return;
    
    const alivePlayers = room.players.filter(p => !p.isDead);
    const impostorsAlive = alivePlayers.filter(p => p.isImpostor).length;
    const totalAlive = alivePlayers.length;

    if (impostorsAlive === 0) {
        io.to(roomId).emit('matchEnded', { winner: 'crew' });
    } else if (impostorsAlive === 1 && totalAlive <= 2) {
        io.to(roomId).emit('matchEnded', { winner: 'impostor' });
    } else if (impostorsAlive === 2 && totalAlive <= 4) {
        io.to(roomId).emit('matchEnded', { winner: 'impostor' });
    } else if (impostorsAlive >= (totalAlive - impostorsAlive)) {
        io.to(roomId).emit('matchEnded', { winner: 'impostor' });
    }
}

io.on('connection', (socket) => {
    socket.on('requestRoomList', () => {
        const roomList = Object.values(rooms).map(room => ({
            id: room.id,
            hostName: room.hostName,
            playerCount: room.players.length,
            maxPlayers: room.settings.maxPlayers || 10
        }));
        socket.emit('roomList', roomList);
    });

    socket.on('createRoom', (data) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            id: roomId,
            hostId: socket.id,
            hostName: data.playerName,
            players: [{
                id: socket.id,
                name: data.playerName,
                color: data.playerColor,
                colorName: data.playerColorName,
                x: 1600,
                y: 550,
                isImpostor: false,
                isDead: false,
                inVent: null
            }],
            settings: { maxPlayers: 10 }
        };
        socket.join(roomId);
        socket.emit('roomJoined', {
            roomId: roomId,
            playerId: socket.id,
            roomState: rooms[roomId]
        });
        updateAllRoomLists();
    });

    socket.on('joinRoom', (data) => {
        const room = rooms[data.roomId];
        if (room && room.players.length < (room.settings.maxPlayers || 10)) {
            room.players.push({
                id: socket.id,
                name: data.playerName,
                color: data.playerColor,
                colorName: data.playerColorName,
                x: 1600,
                y: 550,
                isImpostor: false,
                isDead: false,
                inVent: null
            });
            socket.join(data.roomId);
            socket.emit('roomJoined', {
                roomId: data.roomId,
                playerId: socket.id,
                roomState: room
            });
            io.to(data.roomId).emit('roomUpdate', room);
            updateAllRoomLists();
        }
    });

    socket.on('leaveRoom', () => {
        handlePlayerLeave(socket);
    });

    socket.on('disconnect', () => {
        handlePlayerLeave(socket);
    });

    socket.on('startMatch', (data) => {
        const room = rooms[data.roomId];
        if (room && room.hostId === socket.id) {
            room.settings = data.gameSettings;
            
            let impostorIndices = [];
            while (impostorIndices.length < room.settings.numImpostors && impostorIndices.length < room.players.length) {
                let r = Math.floor(Math.random() * room.players.length);
                if (impostorIndices.indexOf(r) === -1) impostorIndices.push(r);
            }
            
            room.players.forEach((p, index) => {
                p.isImpostor = impostorIndices.includes(index);
                p.isDead = false;
            });

            const allTasksPool = [
                { id: 1, x: 1600, y: 400, name: "Cafeteria: Clear Trash", type: "hold" },
                { id: 2, x: 2350, y: 450, name: "Weapons: Clear Asteroids", type: "hold" },
                { id: 3, x: 2850, y: 980, name: "Navigation: Swipe Card", type: "swipe" },
                { id: 4, x: 920, y: 1250, name: "Electrical: Fix Wiring", type: "wires" },
                { id: 5, x: 200, y: 1000, name: "Reactor: Hold System", type: "hold" },
                { id: 6, x: 960, y: 600, name: "MedBay: Submit Scan", type: "hold" },
                { id: 7, x: 1450, y: 1400, name: "Storage: Swipe Entry", type: "swipe" },
                { id: 8, x: 2350, y: 1500, name: "Shields: Fix Wiring", type: "wires" }
            ];
            
            let matchTasks = [];
            let tasksCopy = [...allTasksPool];
            for(let i=0; i<room.settings.numTasks; i++) {
                if(tasksCopy.length === 0) break;
                let randIdx = Math.floor(Math.random() * tasksCopy.length);
                matchTasks.push(tasksCopy.splice(randIdx, 1)[0]);
            }

            io.to(data.roomId).emit('matchStarted', {
                settings: room.settings,
                players: room.players,
                tasksPool: matchTasks
            });
        }
    });

    socket.on('syncPosition', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            let p = room.players.find(player => player.id === socket.id);
            if (p) {
                p.x = data.x;
                p.y = data.y;
                p.inVent = data.inVent;
                io.to(data.roomId).emit('globalPositions', room.players);
            }
        }
    });

    socket.on('killPlayer', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            let victim = room.players.find(p => p.id === data.targetId);
            let killer = room.players.find(p => p.id === socket.id);
            if (victim && killer) {
                victim.isDead = true;
                io.to(data.roomId).emit('playerKilled', {
                    victimId: data.targetId,
                    x: victim.x,
                    y: victim.y,
                    color: victim.color,
                    colorName: victim.colorName
                });
                checkWinConditions(room, data.roomId);
            }
        }
    });

    socket.on('callMeeting', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            room.votes = {};
            io.to(data.roomId).emit('meetingCalled', {
                reason: data.reason,
                currentRoster: room.players
            });
        }
    });

    socket.on('submitVote', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            if (!room.votes) room.votes = {};
            room.votes[data.voterId] = data.targetId;
            
            const alivePlayers = room.players.filter(p => !p.isDead).length;
            if (Object.keys(room.votes).length >= alivePlayers) {
                let tallies = {};
                let highest = 0;
                let ejectedId = null;
                let tie = false;

                for (let vId in room.votes) {
                    let tId = room.votes[vId];
                    if (!tallies[tId]) tallies[tId] = 0;
                    tallies[tId]++;
                    if (tallies[tId] > highest) {
                        highest = tallies[tId];
                        ejectedId = tId;
                        tie = false;
                    } else if (tallies[tId] === highest) {
                        tie = true;
                    }
                }

                let ejectedName = null;
                if (!tie && ejectedId !== 'skip') {
                    let ep = room.players.find(p => p.id === ejectedId);
                    if (ep) {
                        ep.isDead = true;
                        ejectedName = ep.name;
                    }
                }

                io.to(data.roomId).emit('meetingResults', {
                    ejectedId: tie ? null : ejectedId,
                    ejectedName: ejectedName
                });
                
                setTimeout(() => {
                    checkWinConditions(room, data.roomId);
                }, 4000);
            }
        }
    });

    socket.on('triggerSabotage', (data) => {
        io.to(data.roomId).emit('sabotageTriggered', {
            type: data.type,
            duration: data.type === 'lights' ? 15000 : 8000
        });
    });

    function handlePlayerLeave(sk) {
        for (const roomId in rooms) {
            let room = rooms[roomId];
            const pIndex = room.players.findIndex(p => p.id === sk.id);
            if (pIndex !== -1) {
                room.players.splice(pIndex, 1);
                sk.leave(roomId);
                if (room.players.length === 0) {
                    delete rooms[roomId];
                } else {
                    if (room.hostId === sk.id) {
                        room.hostId = room.players[0].id;
                        room.hostName = room.players[0].name;
                    }
                    io.to(roomId).emit('roomUpdate', room);
                    checkWinConditions(room, roomId);
                }
                updateAllRoomLists();
                break;
            }
        }
    }

    function updateAllRoomLists() {
        const roomList = Object.values(rooms).map(room => ({
            id: room.id,
            hostName: room.hostName,
            playerCount: room.players.length,
            maxPlayers: room.settings.maxPlayers || 10
        }));
        io.emit('roomList', roomList);
    }
});

http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

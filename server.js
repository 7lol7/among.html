const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const path = require('path');

// Global memory to store active lobbies
let activeLobbies = {}; 

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Send the current list of lobbies immediately upon connection
    socket.emit('lobbyListUpdate', Object.values(activeLobbies));

    // Listen for a player creating a lobby
    socket.on('createLobby', (data) => {
        const lobbyId = Math.random().toString(36).substring(2, 7).toUpperCase(); // Generates a random 5-letter room code
        
        activeLobbies[lobbyId] = {
            id: lobbyId,
            name: data.lobbyName || `Room ${lobbyId}`,
            host: socket.id,
            players: [socket.id]
        };
        
        socket.join(lobbyId);
        
        // Reply to the creator with their new lobby details
        socket.emit('lobbyCreated', { lobbyId: lobbyId, success: true });
        
        // Broadcast the updated list to everyone browsing games
        io.emit('lobbyListUpdate', Object.values(activeLobbies));
    });

    // Listen for a player explicitly asking to refresh the lobby list
    socket.on('getLobbies', () => {
        socket.emit('lobbyListUpdate', Object.values(activeLobbies));
    });

    // Clean up lobby lists if a host disconnects
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (let id in activeLobbies) {
            if (activeLobbies[id].host === socket.id) {
                delete activeLobbies[id];
            }
        }
        io.emit('lobbyListUpdate', Object.values(activeLobbies));
    });
});

http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

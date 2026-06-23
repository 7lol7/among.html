const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'AMONGUS.html'));
});

io.on('connection', (socket) => {
    
    socket.on('requestRoomList', () => {
        
    });

    socket.on('createRoom', (data) => {
        
    });

    socket.on('joinRoom', (data) => {
        
    });

    socket.on('leaveRoom', () => {
        
    });

    socket.on('startMatch', (data) => {
        
    });

    socket.on('syncPosition', (data) => {
        
    });

    socket.on('callMeeting', (data) => {
        
    });

    socket.on('submitVote', (data) => {
        
    });

    socket.on('killPlayer', (data) => {
        
    });

    socket.on('triggerSabotage', (data) => {
        
    });

    socket.on('taskCompleted', (data) => {
        
    });

    socket.on('disconnect', () => {
        
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

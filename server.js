const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket']
});

const PORT = process.env.PORT || 3000;

// Serve all static files from the current directory
app.use(express.static(path.join(__dirname), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
        res.setHeader('Cache-Control', 'public, max-age=3600');
    }
}));

// Fallback: serve index.html for all routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.io Signaling Logic
io.on('connection', (socket) => {
    console.log(`[Server] New connection: ${socket.id}`);

    socket.on('join-room', (meetingId) => {
        console.log(`[Server] ${socket.id} joining room: ${meetingId}`);
        socket.join(meetingId);

        // Count users in room
        const clients = io.sockets.adapter.rooms.get(meetingId);
        const numClients = clients ? clients.size : 0;
        console.log(`[Server] Room ${meetingId} now has ${numClients} clients`);
    });

    socket.on('join-request', (data) => {
        const { meetingId, guestId, guestName } = data;
        console.log(`[Server] Join request for ${meetingId} from ${guestName} (${socket.id})`);

        // Use io.to() to ensure everyone in that room gets it. Host will filter.
        io.to(meetingId).emit('join-request', {
            guestId,
            guestName,
            socketId: socket.id,
            meetingId
        });
    });

    socket.on('admission-decision', (data) => {
        const { meetingId, guestId, admitted, guestSocketId } = data;
        console.log(`[Server] Adm decision for ${guestId} in ${meetingId}: ${admitted}`);

        io.to(guestSocketId).emit('admission-decision', { admitted, meetingId });

        if (admitted) {
            io.to(meetingId).emit('participant-joined', { guestId, guestName: "Guest" });
        }
    });

    socket.on('chat-message', (data) => {
        const { meetingId, sender, text } = data;
        io.to(meetingId).emit('chat-message', { sender, text });
    });

    socket.on('emoji-reaction', (data) => {
        const { meetingId, emoji, sender } = data;
        io.to(meetingId).emit('emoji-reaction', { emoji, sender });
    });

    socket.on('disconnect', (reason) => {
        console.log(`[Server] ${socket.id} disconnected: ${reason}`);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Meet app running on port ${PORT}`);
});

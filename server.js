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
    console.log('User connected:', socket.id);

    socket.on('join-room', (meetingId) => {
        socket.join(meetingId);
        console.log(`Socket ${socket.id} joined room ${meetingId}`);
    });

    socket.on('join-request', ({ meetingId, guestId, guestName }) => {
        console.log(`Join request from ${guestName} (${guestId}) for room ${meetingId}`);
        // Broadcast join request to the host in that room
        socket.to(meetingId).emit('join-request', { guestId, guestName, socketId: socket.id });
    });

    socket.on('admission-decision', ({ meetingId, guestId, admitted, guestSocketId }) => {
        console.log(`Admission decision for ${guestId} in room ${meetingId}: ${admitted}`);
        // Send decision back to the specific guest
        io.to(guestSocketId).emit('admission-decision', { admitted });

        if (admitted) {
            // Notify others in the room that someone joined
            socket.to(meetingId).emit('participant-joined', { guestId, guestName: "Guest" });
        }
    });

    socket.on('chat-message', ({ meetingId, sender, text }) => {
        console.log(`Chat message in room ${meetingId} from ${sender}: ${text}`);
        socket.to(meetingId).emit('chat-message', { sender, text });
    });

    socket.on('emoji-reaction', ({ meetingId, emoji, sender }) => {
        socket.to(meetingId).emit('emoji-reaction', { emoji, sender });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Meet app running on port ${PORT}`);
});

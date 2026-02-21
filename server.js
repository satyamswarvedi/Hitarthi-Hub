const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling'] // Enalbe polling as fallback
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

// In-memory store for pending admission requests
const pendingRequests = {};

// Socket.io Signaling Logic
io.on('connection', (socket) => {
    console.log(`[Server] New connection: ${socket.id}`);

    socket.on('join-room', (meetingId) => {
        console.log(`[Server] ${socket.id} joined room: ${meetingId}`);
        socket.join(meetingId);

        // Send any pending requests for this room to the newly joined client
        if (pendingRequests[meetingId] && pendingRequests[meetingId].length > 0) {
            console.log(`[Server] Sending ${pendingRequests[meetingId].length} pending requests to ${socket.id}`);
            pendingRequests[meetingId].forEach(req => {
                socket.emit('join-request', req);
            });
        }
    });

    socket.on('join-request', (data) => {
        const { meetingId, guestId, guestName } = data;
        const requestData = {
            guestId,
            guestName,
            socketId: socket.id,
            meetingId,
            timestamp: Date.now()
        };

        console.log(`[Server] Storing request for ${meetingId} from ${guestName}`);

        if (!pendingRequests[meetingId]) pendingRequests[meetingId] = [];
        // Prevent duplicates from same guestId
        pendingRequests[meetingId] = pendingRequests[meetingId].filter(r => r.guestId !== guestId);
        pendingRequests[meetingId].push(requestData);

        io.to(meetingId).emit('join-request', requestData);
    });

    socket.on('admission-decision', (data) => {
        const { meetingId, guestId, admitted, guestSocketId } = data;
        console.log(`[Server] Adm decision in ${meetingId} for ${guestId}: ${admitted}`);

        if (pendingRequests[meetingId]) {
            pendingRequests[meetingId] = pendingRequests[meetingId].filter(r => r.guestId !== guestId);
        }

        io.to(guestSocketId).emit('admission-decision', { admitted, meetingId });

        if (admitted) {
            io.to(meetingId).emit('participant-joined', { guestId, guestName: "Guest" });
        }
    });

    socket.on('chat-message', (data) => {
        io.to(data.meetingId).emit('chat-message', data);
    });

    socket.on('emoji-reaction', (data) => {
        io.to(data.meetingId).emit('emoji-reaction', data);
    });

    socket.on('disconnect', (reason) => {
        console.log(`[Server] ${socket.id} disconnected: ${reason}`);
        // Cleanup pending requests from disconnected sockets
        for (let mId in pendingRequests) {
            pendingRequests[mId] = pendingRequests[mId].filter(r => r.socketId !== socket.id);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Meet app running on port ${PORT}`);
});

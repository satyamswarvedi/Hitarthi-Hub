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

// In-memory store for meeting rooms
const activeMeetings = {};

io.on('connection', (socket) => {
    console.log(`[Server] Connection: ${socket.id}`);

    const broadcastOccupancy = (mid) => {
        const clients = io.sockets.adapter.rooms.get(mid);
        const count = clients ? clients.size : 0;
        io.to(mid).emit('room-occupancy', { count });
        console.log(`[Server] Room ${mid} occupancy: ${count}`);
    };

    socket.on('join-room', (meetingId) => {
        const mid = meetingId.toLowerCase().trim();
        socket.join(mid);
        console.log(`[Server] ${socket.id} joined room: ${mid}`);

        if (!activeMeetings[mid]) {
            activeMeetings[mid] = { pendingGuests: [] };
        }

        // Send all current pending requests to the newly joined socket (e.g. Host)
        if (activeMeetings[mid].pendingGuests.length > 0) {
            console.log(`[Server] Syncing ${activeMeetings[mid].pendingGuests.length} requests to ${socket.id}`);
            activeMeetings[mid].pendingGuests.forEach(guest => {
                socket.emit('join-request', guest);
            });
        }

        broadcastOccupancy(mid);
    });

    socket.on('join-request', (data) => {
        const { meetingId, guestId, guestName } = data;
        const mid = meetingId.toLowerCase().trim();

        const requestData = {
            guestId,
            guestName,
            socketId: socket.id,
            meetingId: mid,
            timestamp: Date.now()
        };

        if (!activeMeetings[mid]) activeMeetings[mid] = { pendingGuests: [] };

        // Remove existing from same person and update
        activeMeetings[mid].pendingGuests = activeMeetings[mid].pendingGuests.filter(g => g.guestId !== guestId);
        activeMeetings[mid].pendingGuests.push(requestData);

        console.log(`[Server] Join request logged for ${mid} from ${guestName}`);

        // Broadcast to everyone in room. Host will pick it up.
        io.to(mid).emit('join-request', requestData);
    });

    socket.on('admission-decision', (data) => {
        const { meetingId, guestId, admitted } = data;
        const mid = meetingId.toLowerCase().trim();

        console.log(`[Server] Admission in ${mid}: ${admitted ? 'ADMIT' : 'DENY'} for ${guestId}`);

        // Cleanup pending store
        if (activeMeetings[mid]) {
            activeMeetings[mid].pendingGuests = activeMeetings[mid].pendingGuests.filter(g => g.guestId !== guestId);
        }

        // CRITICAL: Broadcast to the whole room. Guest filters by guestId.
        // This solves the "stale socket ID" problem.
        io.to(mid).emit('admission-decision', {
            guestId,
            admitted,
            meetingId: mid
        });

        if (admitted) {
            io.to(mid).emit('participant-joined', { guestId, guestName: "User" });
        }
    });

    socket.on('chat-message', (data) => {
        const mid = data.meetingId.toLowerCase().trim();
        io.to(mid).emit('chat-message', data);
    });

    socket.on('emoji-reaction', (data) => {
        const mid = data.meetingId.toLowerCase().trim();
        io.to(mid).emit('emoji-reaction', data);
    });

    socket.on('disconnecting', () => {
        socket.rooms.forEach(room => {
            if (room !== socket.id) {
                setTimeout(() => broadcastOccupancy(room), 200);
            }
        });
    });

    socket.on('disconnect', (reason) => {
        console.log(`[Server] Disconnected: ${socket.id} (${reason})`);
        // Clean up pending requests from this socket
        for (let mid in activeMeetings) {
            activeMeetings[mid].pendingGuests = activeMeetings[mid].pendingGuests.filter(g => g.socketId !== socket.id);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Meet app running on port ${PORT}`);
});

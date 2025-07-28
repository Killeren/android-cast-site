const express = require('express');
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 9000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Create PeerJS server
const server = require('http').createServer(app);
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/peerjs',
    allow_discovery: true
});

// Use PeerJS server
app.use('/peerjs', peerServer);

// Handle peer connections
peerServer.on('connection', (client) => {
    console.log('Client connected:', client.getId());
});

peerServer.on('disconnect', (client) => {
    console.log('Client disconnected:', client.getId());
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`PeerJS server available at /peerjs`);
}); 
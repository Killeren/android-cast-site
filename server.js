const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 9000;

// Create HTTP server
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ message: 'Server is running!', timestamp: new Date().toISOString() });
});

// Status endpoint
app.get('/status', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(), 
        server: 'webrtc-app-firebase', 
        port: PORT, 
        uptime: process.uptime(),
        signaling: 'firebase-firestore'
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`WebRTC application server running on port ${PORT}`);
    console.log(`Server URL: http://localhost:${PORT}`);
    console.log(`Signaling: Firebase/Firestore`);
}); 
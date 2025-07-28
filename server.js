const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 9000;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ 
    server: server,
    perMessageDeflate: false // Disable compression for better performance
});

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
        server: 'webrtc-app', 
        port: PORT, 
        uptime: process.uptime(),
        connections: wss.clients.size
    });
});

// WebSocket signaling server
const peers = new Map(); // Store peer connections
const sessions = new Map(); // Store session information

wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection from:', req.socket.remoteAddress);
    
    let peerId = null;
    let sessionId = null;
    
    // Set up ping/pong to keep connection alive
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message:', data.type, data);
            
            switch (data.type) {
                case 'register':
                    // Register a new peer
                    peerId = data.peerId;
                    sessionId = data.sessionId;
                    
                    peers.set(peerId, {
                        ws: ws,
                        sessionId: sessionId,
                        isSharer: data.isSharer || false,
                        timestamp: Date.now()
                    });
                    
                    if (sessionId) {
                        if (!sessions.has(sessionId)) {
                            sessions.set(sessionId, new Set());
                        }
                        sessions.get(sessionId).add(peerId);
                    }
                    
                    console.log(`Peer ${peerId} registered for session ${sessionId}`);
                    ws.send(JSON.stringify({
                        type: 'registered',
                        peerId: peerId,
                        sessionId: sessionId
                    }));
                    break;
                    
                case 'offer':
                    // Forward offer to target peer
                    const targetPeer = peers.get(data.target);
                    if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
                        targetPeer.ws.send(JSON.stringify({
                            type: 'offer',
                            from: peerId,
                            offer: data.offer
                        }));
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Target peer not found'
                        }));
                    }
                    break;
                    
                case 'answer':
                    // Forward answer to target peer
                    const offerPeer = peers.get(data.target);
                    if (offerPeer && offerPeer.ws.readyState === WebSocket.OPEN) {
                        offerPeer.ws.send(JSON.stringify({
                            type: 'answer',
                            from: peerId,
                            answer: data.answer
                        }));
                    }
                    break;
                    
                case 'ice-candidate':
                    // Forward ICE candidate to target peer
                    const candidatePeer = peers.get(data.target);
                    if (candidatePeer && candidatePeer.ws.readyState === WebSocket.OPEN) {
                        candidatePeer.ws.send(JSON.stringify({
                            type: 'ice-candidate',
                            from: peerId,
                            candidate: data.candidate
                        }));
                    }
                    break;
                    
                case 'list-peers':
                    // List all peers in a session
                    const sessionPeers = sessions.get(data.sessionId);
                    if (sessionPeers) {
                        const peerList = Array.from(sessionPeers).map(id => ({
                            id: id,
                            isSharer: peers.get(id)?.isSharer || false
                        }));
                        ws.send(JSON.stringify({
                            type: 'peer-list',
                            sessionId: data.sessionId,
                            peers: peerList
                        }));
                    } else {
                        ws.send(JSON.stringify({
                            type: 'peer-list',
                            sessionId: data.sessionId,
                            peers: []
                        }));
                    }
                    break;
                    
                case 'ping':
                    // Simple ping/pong for connection testing
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });
    
    ws.on('close', (code, reason) => {
        console.log(`Peer ${peerId} disconnected:`, code, reason);
        
        if (peerId) {
            // Remove from peers
            peers.delete(peerId);
            
            // Remove from session
            if (sessionId && sessions.has(sessionId)) {
                sessions.get(sessionId).delete(peerId);
                if (sessions.get(sessionId).size === 0) {
                    sessions.delete(sessionId);
                }
            }
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Set up ping interval to detect dead connections
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('Terminating dead connection');
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
    });
}, 30000); // Check every 30 seconds

// Clean up old connections periodically
setInterval(() => {
    const now = Date.now();
    for (const [peerId, peer] of peers.entries()) {
        if (now - peer.timestamp > 300000) { // 5 minutes
            console.log(`Cleaning up old peer: ${peerId}`);
            peer.ws.close();
            peers.delete(peerId);
        }
    }
}, 60000); // Check every minute

server.listen(PORT, '0.0.0.0', () => {
    console.log(`WebRTC signaling server running on port ${PORT}`);
    console.log(`Server URL: http://localhost:${PORT}`);
    console.log(`WebSocket URL: ws://localhost:${PORT}`);
    console.log(`HTTPS WebSocket URL: wss://localhost:${PORT}`);
}); 
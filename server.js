const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 9000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        server: 'webrtc-app',
        port: PORT
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Add a test endpoint
app.get('/test', (req, res) => {
    res.json({ message: 'Server is running!', port: PORT });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Access your application at http://localhost:${PORT}`);
    console.log(`🌐 External access: http://35.200.221.49:${PORT}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log(`✅ Test endpoint: http://localhost:${PORT}/test`);
}); 
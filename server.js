const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 9000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access your application at http://localhost:${PORT}`);
    console.log(`Note: PeerJS server should be running separately on port 9001`);
}); 
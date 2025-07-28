# WebRTC Screen Sharing Application

A real-time screen sharing application built with WebRTC and PeerJS that allows users to share their screen with other devices across different browsers.

## Features

- **Real-time screen sharing**: Share your screen with another device instantly
- **Cross-browser compatibility**: Works across different browsers and devices
- **Simple interface**: Easy-to-use interface with session ID generation
- **Secure connections**: Uses WebRTC with TURN/STUN servers for NAT traversal
- **Responsive design**: Works on desktop and mobile devices

## Recent Updates (Cross-Browser Fixes)

The application has been updated to resolve cross-browser connectivity issues:

### Key Changes:
1. **Dynamic PeerJS configuration**: Now uses the current hostname instead of hardcoded IP
2. **Enhanced STUN/TURN servers**: Added multiple STUN servers and both TCP/UDP TURN servers
3. **Better error handling**: Improved error messages and connection debugging
4. **HTTPS support**: Proper handling of secure connections
5. **Connection monitoring**: Added disconnection/reconnection handling

### Technical Improvements:
- Uses `window.location.hostname` for dynamic server detection
- Added multiple STUN servers for better connectivity
- Enhanced TURN server configuration with both TCP and UDP
- Added comprehensive logging for debugging connection issues

## Quick Start

1. **Deploy to GCP**: Follow the [Deployment Guide](DEPLOYMENT.md)
2. **Generate Session ID**: Click "Generate ID" to create a unique session
3. **Share Screen**: Click "Share Screen" and allow screen capture
4. **View Screen**: On another device, enter the session ID and click "View Screen"

## Troubleshooting Cross-Browser Issues

### If you can't view from another browser:

1. **Check browser console** for WebRTC errors
2. **Verify HTTPS**: WebRTC requires HTTPS in production
3. **Check TURN server**: Ensure your TURN server is running and accessible
4. **Firewall settings**: Make sure ports 80, 443, and 3478 are open
5. **Network connectivity**: Test if both browsers can reach the server

### Common Error Messages:
- `"Screen sharer not found"`: Check the session ID is correct
- `"Connection timeout"`: Network or firewall issues
- `"PeerJS error"`: Check server logs and browser console

## Development

### Local Development:
```bash
npm install
npm start
```

### Server Requirements:
- Node.js 16+
- Express.js
- PeerJS server
- TURN server (recommended)

## Architecture

- **Frontend**: HTML5, CSS3, JavaScript
- **Signaling**: PeerJS server for WebRTC signaling
- **Media**: WebRTC for peer-to-peer video streaming
- **NAT Traversal**: STUN/TURN servers for connectivity

## Security

- HTTPS required for production
- TURN server authentication
- Session-based connections
- No persistent data storage

## License

MIT License
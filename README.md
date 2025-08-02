# WebRTC Screen Sharing Application

A real-time screen sharing application built with WebRTC and Firebase/Firestore that allows users to share their screen with other devices across different browsers.

## Features

- **Real-time screen sharing**: Share your screen with another device instantly
- **Cross-browser compatibility**: Works across different browsers and devices
- **Simple interface**: Easy-to-use interface with session ID generation
- **Secure connections**: Uses WebRTC with TURN/STUN servers for NAT traversal
- **Firebase signaling**: Uses Firebase/Firestore for reliable signaling
- **Responsive design**: Works on desktop and mobile devices

## Recent Updates (Firebase Migration)

The application has been migrated from WebSocket signaling to Firebase/Firestore signaling:

### Key Changes:
1. **Firebase/Firestore signaling**: Replaced WebSocket server with Firebase Firestore
2. **Real-time updates**: Uses Firestore's real-time listeners for signaling
3. **Scalable architecture**: No need to maintain WebSocket server infrastructure
4. **Better reliability**: Firebase provides automatic reconnection and offline support
5. **Simplified deployment**: Only need to serve static files

### Technical Improvements:
- Uses Firebase Firestore for session management
- Real-time ICE candidate exchange via Firestore subcollections
- Automatic cleanup of session listeners
- Better error handling and connection state management

## Quick Start

1. **Set up Firebase**: Follow the [Firebase Setup Guide](FIREBASE_SETUP.md)
2. **Install dependencies**: `npm install`
3. **Start the server**: `npm start`
4. **Generate Session ID**: Click "Generate ID" to create a unique session
5. **Share Screen**: Click "Share Screen" and allow screen capture
6. **View Screen**: On another device, enter the session ID and click "View Screen"

## Firebase Setup

Before running the application, you need to set up Firebase:

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Firestore Database
3. Get your Firebase configuration
4. Update `firebase-config.js` with your configuration
5. Set up Firestore security rules

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for detailed instructions.

## Troubleshooting

### If you can't view from another browser:

1. **Check browser console** for Firebase errors
2. **Verify Firebase setup**: Ensure your Firebase configuration is correct
3. **Check Firestore rules**: Make sure read/write access is enabled
4. **Verify HTTPS**: WebRTC requires HTTPS in production
5. **Check TURN server**: Ensure your TURN server is running and accessible

### Common Error Messages:
- `"Firebase not initialized"`: Check your Firebase configuration
- `"Session not found"`: Check the session ID is correct
- `"Permission denied"`: Check Firestore security rules
- `"Connection timeout"`: Network or firewall issues

## Development

### Local Development:
```bash
npm install
npm start
```

### Server Requirements:
- Node.js 16+
- Express.js
- Firebase project (for signaling)

## Architecture

- **Frontend**: HTML5, CSS3, JavaScript (ES6 modules)
- **Signaling**: Firebase Firestore for WebRTC signaling
- **Media**: WebRTC for peer-to-peer video streaming
- **NAT Traversal**: STUN/TURN servers for connectivity

## Security

- HTTPS required for production
- TURN server authentication
- Session-based connections
- No persistent data storage (sessions are temporary)
- Firestore security rules for access control

## Deployment

### Firebase Hosting (Recommended):
1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Initialize: `firebase init hosting`
4. Deploy: `firebase deploy`

### Traditional Hosting:
1. Set up your Firebase project
2. Upload files to your web server
3. Ensure HTTPS is enabled
4. Configure your domain

## License

MIT License
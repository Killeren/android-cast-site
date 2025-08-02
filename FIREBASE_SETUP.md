# Firebase Setup for WebRTC Screen Sharing

This guide will help you set up Firebase/Firestore for the WebRTC screen sharing application.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter a project name (e.g., "webrtc-screen-share")
4. Choose whether to enable Google Analytics (optional)
5. Click "Create project"

## Step 2: Enable Firestore Database

1. In your Firebase project console, go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" for development (you can secure it later)
4. Select a location for your database (choose the closest to your users)
5. Click "Done"

## Step 3: Get Firebase Configuration

1. In your Firebase project console, go to "Project settings" (gear icon)
2. Scroll down to "Your apps" section
3. Click "Add app" and select the web icon (</>)
4. Register your app with a nickname (e.g., "webrtc-app")
5. Copy the Firebase configuration object

## Step 4: Update Firebase Configuration

Replace the placeholder configuration in `firebase-config.js` with your actual Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id"
};
```

## Step 5: Set Up Firestore Security Rules

In your Firebase console, go to Firestore Database > Rules and update the rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to castSessions collection
    match /castSessions/{sessionId} {
      allow read, write: if true; // For development - secure this for production
    }
    
    // Allow access to ICE candidates subcollections
    match /castSessions/{sessionId}/{document=**} {
      allow read, write: if true; // For development - secure this for production
    }
  }
}
```

**Note:** For production, you should implement proper authentication and security rules.

## Step 6: Install Dependencies

Run the following command to install Firebase:

```bash
npm install
```

## Step 7: Test the Application

1. Start the server: `npm start`
2. Open your browser to `http://localhost:9000`
3. Generate a session ID and try sharing your screen
4. Open another browser tab/window and join the same session

## Firestore Data Structure

The application creates the following Firestore structure:

```
castSessions/
  {sessionId}/
    - sessionId: string
    - createdAt: timestamp
    - status: string
    - offer: { type: string, sdp: string }
    - answer: { type: string, sdp: string }
    - sharerActive: boolean
    - viewerActive: boolean
    - lastUpdated: timestamp
    offerCandidates/
      - {candidateId}/
        - candidate: string
        - sdpMLineIndex: number
        - sdpMid: string
    answerCandidates/
      - {candidateId}/
        - candidate: string
        - sdpMLineIndex: number
        - sdpMid: string
```

## Production Considerations

1. **Security Rules**: Implement proper Firestore security rules
2. **Authentication**: Add user authentication if needed
3. **Rate Limiting**: Consider implementing rate limiting
4. **Data Cleanup**: Set up Cloud Functions to clean up old sessions
5. **Monitoring**: Enable Firebase Analytics and Crashlytics

## Troubleshooting

### Common Issues:

1. **"Firebase not initialized"**: Check your Firebase configuration
2. **"Permission denied"**: Check Firestore security rules
3. **"Session not found"**: Make sure the session ID is correct
4. **"Network error"**: Check your internet connection and Firebase project settings

### Debug Tips:

1. Check browser console for Firebase errors
2. Verify Firestore rules allow read/write access
3. Ensure your Firebase project is in the correct region
4. Check that all Firebase services are enabled

## Security Best Practices

For production deployment:

1. **Implement Authentication**: Use Firebase Auth
2. **Secure Firestore Rules**: Only allow authenticated users
3. **Rate Limiting**: Prevent abuse
4. **Data Retention**: Automatically delete old sessions
5. **HTTPS**: Always use HTTPS in production

Example secure Firestore rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /castSessions/{sessionId} {
      allow read, write: if request.auth != null;
    }
  }
}
``` 
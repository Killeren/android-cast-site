// WebRTC Screen Sharing Application
// Using native WebRTC with Firebase/Firestore signaling

import { db } from './firebase-config.js';
import { 
    collection, 
    doc, 
    addDoc, 
    setDoc, 
    getDoc, 
    onSnapshot, 
    deleteDoc,
    query,
    where,
    getDocs
} from "firebase/firestore";

let peerConnection = null;
let currentSessionId = null;
let localStream = null;
let remoteStream = null;
let isSharing = false;
let isViewing = false;
let isFallbackMode = false;
let sessionDoc = null;
let offerCandidates = null;
let answerCandidates = null;
let unsubscribeOfferCandidates = null;
let unsubscribeAnswerCandidates = null;
let unsubscribeSession = null;

// DOM elements
const sessionIdInput = document.getElementById('sessionId');
const generateIdBtn = document.getElementById('generateId');
const startShareBtn = document.getElementById('startShare');
const viewScreenBtn = document.getElementById('viewScreen');
const statusDiv = document.getElementById('status');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// ICE servers configuration with multiple fallback options
const iceServers = {
    iceServers: [
        // Primary STUN servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // Additional STUN servers for better connectivity
        { urls: 'stun:stun.stunprotocol.org:3478' },
        { urls: 'stun:stun.voiparound.com:3478' },
        { urls: 'stun:stun.voipbuster.com:3478' },
        { urls: 'stun:stun.voipstunt.com:3478' },
        { urls: 'stun:stun.voxgratia.org:3478' },
        {
            urls: 'turn:35.200.221.49:3478?transport=udp',
            username: 'peeruser',
            credential: 'peerpass123'
        },
        {
            urls: 'turn:35.200.221.49:3478?transport=tcp',
            username: 'peeruser',
            credential: 'peerpass123'
        }
    ]
};

console.log('ICE servers configuration (enhanced STUN):', iceServers);

// Test ICE server connectivity
async function testIceServers() {
    try {
        const testConnection = new RTCPeerConnection(iceServers);
        console.log('Created test peer connection with ICE servers');
        
        let candidateCount = 0;
        
        testConnection.onicecandidate = function(event) {
            if (event.candidate) {
                candidateCount++;
                console.log(`Test ICE candidate ${candidateCount} generated:`, event.candidate.type, event.candidate.protocol, event.candidate.address);
            } else {
                console.log('Test ICE gathering complete. Total candidates:', candidateCount);
                if (candidateCount === 0) {
                    console.warn('No ICE candidates generated! This indicates a network connectivity issue.');
                }
            }
        };
        
        testConnection.onicegatheringstatechange = function() {
            console.log('Test ICE gathering state:', testConnection.iceGatheringState);
        };
        
        // Create a dummy offer to trigger ICE gathering
        const offer = await testConnection.createOffer();
        await testConnection.setLocalDescription(offer);
        console.log('Test offer created to trigger ICE gathering');
        
        // Clean up after 10 seconds to allow more time for candidates
        setTimeout(() => {
            testConnection.close();
            console.log('Test connection closed');
        }, 10000);
        
    } catch (error) {
        console.error('Error testing ICE servers:', error);
    }
}

// Initialize Firebase connection
function initializeFirebase() {
    console.log('Initializing Firebase connection');
    updateStatus('Connected to Firebase', 'connected');
}

// Create a new session in Firestore
async function createSession(sessionId) {
    try {
        console.log('Creating session in Firestore:', sessionId);
        
        // Create session document
        sessionDoc = doc(db, 'castSessions', sessionId);
        
        // Create subcollections for ICE candidates
        offerCandidates = collection(sessionDoc, 'offerCandidates');
        answerCandidates = collection(sessionDoc, 'answerCandidates');
        
        // Initialize session document
        await setDoc(sessionDoc, {
            sessionId: sessionId,
            createdAt: new Date(),
            status: 'active'
        });
        
        console.log('Session created successfully');
        return true;
    } catch (error) {
        console.error('Error creating session:', error);
        updateStatus(`Error creating session: ${error.message}`, 'error');
        return false;
    }
}

// Join an existing session
async function joinSession(sessionId) {
    try {
        console.log('Joining session in Firestore:', sessionId);
        
        sessionDoc = doc(db, 'castSessions', sessionId);
        offerCandidates = collection(sessionDoc, 'offerCandidates');
        answerCandidates = collection(sessionDoc, 'answerCandidates');
        
        // Check if session exists
        const sessionSnapshot = await getDoc(sessionDoc);
        if (!sessionSnapshot.exists()) {
            throw new Error('Session not found');
        }
        
        console.log('Session joined successfully');
        return true;
    } catch (error) {
        console.error('Error joining session:', error);
        updateStatus(`Error joining session: ${error.message}`, 'error');
        return false;
    }
}

// Clean up session listeners
function cleanupSessionListeners() {
    if (unsubscribeOfferCandidates) {
        unsubscribeOfferCandidates();
        unsubscribeOfferCandidates = null;
    }
    if (unsubscribeAnswerCandidates) {
        unsubscribeAnswerCandidates();
        unsubscribeAnswerCandidates = null;
    }
    if (unsubscribeSession) {
        unsubscribeSession();
        unsubscribeSession = null;
    }
}

// Start screen sharing (sharer role)
async function startScreenShare() {
    try {
        updateStatus('Requesting screen share permission...', 'waiting');
        
        // Check browser compatibility
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            throw new Error('Screen sharing is not supported in this browser. Please use Chrome, Firefox, or Safari.');
        }
        
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            throw new Error('Screen sharing requires HTTPS. Please access this site via HTTPS.');
        }
        
        // Get screen stream
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always'
            },
            audio: false
        });
        
        // Display local video
        localVideo.srcObject = localStream;
        
        // Get session ID
        const sessionId = sessionIdInput.value.trim();
        if (!sessionId) {
            throw new Error('Please enter a session ID');
        }
        
        currentSessionId = sessionId;
        
        // Create session in Firestore
        const sessionCreated = await createSession(sessionId);
        if (!sessionCreated) {
            throw new Error('Failed to create session');
        }
        
        updateStatus(`Sharing screen with ID: ${sessionId}. Waiting for viewer...`, 'waiting');
        isSharing = true;
        
        startShareBtn.textContent = 'Stop Sharing';
        startShareBtn.classList.remove('btn--primary');
        startShareBtn.classList.add('btn--secondary');
        
        // Set up peer connection for sharer
        await setupSharerConnection();
        
        console.log('Screen sharing started');
        
    } catch (error) {
        console.error('Error starting screen share:', error);
        updateStatus(`Error starting screen share: ${error.message}`, 'error');
        stopScreenShare();
    }
}

// Set up peer connection for sharer
async function setupSharerConnection() {
    try {
        // Create peer connection
        peerConnection = new RTCPeerConnection(iceServers);
        console.log('Created peer connection for sharer');
        
        // Add local stream tracks
        localStream.getTracks().forEach(track => {
            console.log('Adding track to peer connection:', track.kind, track.id);
            peerConnection.addTrack(track, localStream);
        });
        
        // Set up ICE candidate handling
        peerConnection.onicecandidate = async function(event) {
            if (event.candidate) {
                console.log('Sending ICE candidate from sharer:', event.candidate);
                try {
                    await addDoc(offerCandidates, event.candidate.toJSON());
                } catch (error) {
                    console.error('Error adding offer candidate:', error);
                }
            } else {
                console.log('ICE candidate gathering complete for sharer');
            }
        };
        
        // Set up connection state monitoring
        peerConnection.onconnectionstatechange = function() {
            console.log('Sharer connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                updateStatus('WebRTC connection established!', 'connected');
            } else if (peerConnection.connectionState === 'failed') {
                updateStatus('WebRTC connection failed', 'error');
            } else if (peerConnection.connectionState === 'disconnected') {
                updateStatus('WebRTC connection disconnected', 'error');
            }
        };
        
        peerConnection.oniceconnectionstatechange = function() {
            console.log('Sharer ICE connection state:', peerConnection.iceConnectionState);
        };
        
        // Create offer
        const offer = await peerConnection.createOffer();
        console.log('Created offer SDP:', offer.sdp.substring(0, 200) + '...');
        await peerConnection.setLocalDescription(offer);
        console.log('Set local offer description');
        
        // Save offer to Firestore
        await setDoc(sessionDoc, { 
            offer: { type: offer.type, sdp: offer.sdp },
            sharerActive: true,
            lastUpdated: new Date()
        }, { merge: true });
        console.log('Saved offer to Firestore');
        
        // Listen for answer
        unsubscribeSession = onSnapshot(sessionDoc, async (snapshot) => {
            const data = snapshot.data();
            if (data && data.answer && !peerConnection.currentRemoteDescription) {
                console.log('Received answer from viewer');
                try {
                    const answer = new RTCSessionDescription(data.answer);
                    await peerConnection.setRemoteDescription(answer);
                    console.log('Set remote answer description');
                } catch (error) {
                    console.error('Error setting remote answer:', error);
                }
            }
        });
        
        // Listen for answer ICE candidates
        unsubscribeAnswerCandidates = onSnapshot(answerCandidates, async (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    try {
                        const candidate = new RTCIceCandidate(change.doc.data());
                        await peerConnection.addIceCandidate(candidate);
                        console.log('Added answer ICE candidate');
                    } catch (error) {
                        console.error('Error adding answer ICE candidate:', error);
                    }
                }
            });
        });
        
    } catch (error) {
        console.error('Error setting up sharer connection:', error);
        updateStatus(`Error setting up connection: ${error.message}`, 'error');
    }
}

// Start viewing screen (viewer role)
async function startViewing() {
    try {
        updateStatus('Connecting to screen share...', 'waiting');
        
        // Get session ID
        const sessionId = sessionIdInput.value.trim();
        if (!sessionId) {
            throw new Error('Please enter a session ID');
        }
        
        currentSessionId = sessionId;
        
        // Join session in Firestore
        const sessionJoined = await joinSession(sessionId);
        if (!sessionJoined) {
            throw new Error('Failed to join session');
        }
        
        updateStatus('Connecting to screen sharer...', 'waiting');
        
        // Set up peer connection for viewer
        await setupViewerConnection();
        
    } catch (error) {
        console.error('Error viewing screen:', error);
        updateStatus(`Error viewing screen: ${error.message}`, 'error');
        stopViewing();
    }
}

// Set up peer connection for viewer
async function setupViewerConnection() {
    try {
        // Create peer connection
        peerConnection = new RTCPeerConnection(iceServers);
        console.log('Created peer connection for viewer');
        
        // Set up track handling
        peerConnection.ontrack = function(event) {
            console.log('Received remote stream:', event.streams);
            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteStream = event.streams[0];
                isViewing = true;
                updateStatus('Connected! Receiving screen share...', 'connected');
                
                viewScreenBtn.textContent = 'Stop Viewing';
                viewScreenBtn.classList.remove('btn--outline');
                viewScreenBtn.classList.add('btn--secondary');
                
                // Add event listeners to video element
                remoteVideo.onloadedmetadata = function() {
                    console.log('Remote video metadata loaded');
                    remoteVideo.play().then(() => {
                        console.log('Remote video started playing');
                    }).catch(error => {
                        console.error('Error playing remote video:', error);
                    });
                };
                
                remoteVideo.onplay = function() {
                    console.log('Remote video is playing');
                };
                
                remoteVideo.onerror = function(error) {
                    console.error('Remote video error:', error);
                };
            } else {
                console.error('No streams in track event');
            }
        };
        
        // Set up ICE candidate handling
        peerConnection.onicecandidate = async function(event) {
            if (event.candidate) {
                console.log('Sending ICE candidate from viewer:', event.candidate);
                try {
                    await addDoc(answerCandidates, event.candidate.toJSON());
                } catch (error) {
                    console.error('Error adding answer candidate:', error);
                }
            } else {
                console.log('ICE candidate gathering complete for viewer');
            }
        };
        
        // Set up connection state monitoring
        peerConnection.onconnectionstatechange = function() {
            console.log('Viewer connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                updateStatus('WebRTC connection established!', 'connected');
            } else if (peerConnection.connectionState === 'failed') {
                updateStatus('WebRTC connection failed', 'error');
            } else if (peerConnection.connectionState === 'disconnected') {
                updateStatus('WebRTC connection disconnected', 'error');
            }
        };
        
        peerConnection.oniceconnectionstatechange = function() {
            console.log('Viewer ICE connection state:', peerConnection.iceConnectionState);
        };
        
        // Get the offer from Firestore
        const sessionSnapshot = await getDoc(sessionDoc);
        const sessionData = sessionSnapshot.data();
        
        if (!sessionData || !sessionData.offer) {
            throw new Error('No offer found in session');
        }
        
        console.log('Retrieved offer from Firestore');
        
        // Set remote description (offer)
        const offerDesc = new RTCSessionDescription(sessionData.offer);
        await peerConnection.setRemoteDescription(offerDesc);
        console.log('Set remote offer description');
        
        // Create and set local description (answer)
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log('Created and set local answer');
        
        // Save answer to Firestore
        await setDoc(sessionDoc, { 
            answer: { type: answer.type, sdp: answer.sdp },
            viewerActive: true,
            lastUpdated: new Date()
        }, { merge: true });
        console.log('Saved answer to Firestore');
        
        // Listen for offer ICE candidates
        unsubscribeOfferCandidates = onSnapshot(offerCandidates, async (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    try {
                        const candidate = new RTCIceCandidate(change.doc.data());
                        await peerConnection.addIceCandidate(candidate);
                        console.log('Added offer ICE candidate');
                    } catch (error) {
                        console.error('Error adding offer ICE candidate:', error);
                    }
                }
            });
        });
        
    } catch (error) {
        console.error('Error setting up viewer connection:', error);
        updateStatus(`Error setting up connection: ${error.message}`, 'error');
    }
}

// Stop screen sharing
function stopScreenShare() {
    cleanupSessionListeners();
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    localVideo.srcObject = null;
    isSharing = false;
    
    startShareBtn.textContent = 'Share Screen';
    startShareBtn.classList.remove('btn--secondary');
    startShareBtn.classList.add('btn--primary');
    
    updateStatus('Screen sharing stopped');
    console.log('Screen sharing stopped');
}

// Stop viewing screen
function stopViewing() {
    cleanupSessionListeners();
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    remoteVideo.srcObject = null;
    isViewing = false;
    
    viewScreenBtn.textContent = 'View Screen';
    viewScreenBtn.classList.remove('btn--secondary');
    viewScreenBtn.classList.add('btn--outline');
    
    updateStatus('Stopped viewing screen share');
    console.log('Stopped viewing screen share');
}

// Update status message
function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    console.log('Status:', message);
}

// Generate random session ID
function generateSessionId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    sessionIdInput.value = result;
    updateStatus(`Session ID generated: ${result}`);
}

// Check browser compatibility
function checkBrowserCompatibility() {
    const isHTTPS = location.protocol === 'https:' || location.hostname === 'localhost';
    const hasScreenShare = navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
    const userAgent = navigator.userAgent.toLowerCase();
    const isChrome = userAgent.includes('chrome') && !userAgent.includes('edg');
    const isFirefox = userAgent.includes('firefox');
    const isSafari = userAgent.includes('safari') && !userAgent.includes('chrome');
    const isEdge = userAgent.includes('edg');
    const isModernBrowser = isChrome || isFirefox || isSafari || isEdge;
    
    console.log('Browser compatibility:', {
        isHTTPS,
        userAgent: navigator.userAgent,
        isChrome,
        isFirefox,
        hasScreenShare,
        isModernBrowser
    });
    
    if (!isHTTPS) {
        updateStatus('⚠️ HTTPS required for screen sharing. Please access via HTTPS.', 'warning');
    } else if (!hasScreenShare) {
        updateStatus('⚠️ Screen sharing not supported in this browser. Please use Chrome, Firefox, or Safari.', 'warning');
    } else if (!isModernBrowser) {
        updateStatus('⚠️ Please use a modern browser for best compatibility.', 'warning');
    } else {
        updateStatus('✅ Browser compatible for screen sharing');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    console.log('WebRTC Screen Share App loaded');
    
    // Check browser compatibility
    checkBrowserCompatibility();
    
    // Test ICE servers
    testIceServers();
    
    // Initialize Firebase
    initializeFirebase();
    
    // Generate initial session ID
    generateSessionId();
    
    // Set up event listeners
    generateIdBtn.addEventListener('click', generateSessionId);
    
    startShareBtn.addEventListener('click', function() {
        if (isSharing) {
            stopScreenShare();
        } else {
            startScreenShare();
        }
    });
    
    viewScreenBtn.addEventListener('click', function() {
        if (isViewing) {
            stopViewing();
        } else {
            startViewing();
        }
    });
    
    // Handle session ID input
    sessionIdInput.addEventListener('input', function() {
        const sessionId = this.value.trim();
        if (sessionId.length === 6) {
            updateStatus('Ready to connect');
        } else {
            updateStatus('Enter a 6-character session ID');
        }
    });
});

// WebRTC Screen Sharing Application
// Using native WebRTC with Firebase/Firestore signaling

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBu2EE29vWABYqIdrkc71aLEvYbdT3KIkU",
    authDomain: "my-webrtc-app-charan.firebaseapp.com",
    projectId: "my-webrtc-app-charan",
    storageBucket: "my-webrtc-app-charan.appspot.com",
    messagingSenderId: "991396321713",
    appId: "1:991396321713:web:f530e9cebdd324818c4590",
    measurementId: "G-ZPYPY8TE58"
};

// Initialize Firebase
let db = null;

let peerConnection = null;
let currentSessionId = null;
let localStream = null;
let remoteStream = null;
let isSharing = false;
let isViewing = false;
let isVideoCall = false;
let isAudioCall = false;
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
const startVideoCallBtn = document.getElementById('startVideoCall');
const joinVideoCallBtn = document.getElementById('joinVideoCall');
const startAudioCallBtn = document.getElementById('startAudioCall');
const joinAudioCallBtn = document.getElementById('joinAudioCall');
const statusDiv = document.getElementById('status');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const currentModeSpan = document.getElementById('currentMode');

// ICE servers configuration with multiple fallback options
const iceServers = {
    iceServers: [
        // Primary STUN servers
        { urls: [ "stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478" ] },
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

// Debug function to check video element status
function debugVideoElement(videoElement, label) {
    console.log(`=== ${label} Video Debug ===`);
    console.log('Video element:', videoElement);
    console.log('srcObject:', videoElement.srcObject);
    console.log('currentSrc:', videoElement.currentSrc);
    console.log('readyState:', videoElement.readyState);
    console.log('videoWidth:', videoElement.videoWidth);
    console.log('videoHeight:', videoElement.videoHeight);
    console.log('paused:', videoElement.paused);
    console.log('ended:', videoElement.ended);
    console.log('display style:', videoElement.style.display);
    console.log('visibility:', videoElement.style.visibility);
    console.log('opacity:', videoElement.style.opacity);
    console.log('=======================');
}

// Initialize Firebase connection
function initializeFirebase() {
    try {
        if (typeof firebase !== 'undefined') {
            // Initialize Firebase
            firebase.initializeApp(firebaseConfig);
            
            // Initialize Firestore
            db = firebase.firestore();
            
            console.log('Firebase initialized successfully');
            updateStatus('Connected to Firebase', 'connected');
            return true;
        } else {
            console.error('Firebase CDN not loaded');
            updateStatus('Firebase not loaded. Please check your connection.', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        updateStatus('Error connecting to Firebase', 'error');
        return false;
    }
}

// Create a new session in Firestore
async function createSession(sessionId, mode = 'screen-share') {
    try {
        console.log('Creating session in Firestore:', sessionId, 'mode:', mode);
        
        // Create session document
        sessionDoc = db.collection('castSessions').doc(sessionId);
        
        // Create subcollections for ICE candidates
        offerCandidates = sessionDoc.collection('offerCandidates');
        answerCandidates = sessionDoc.collection('answerCandidates');
        
        // Initialize session document
        await sessionDoc.set({
            sessionId: sessionId,
            mode: mode,
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
        
        sessionDoc = db.collection('castSessions').doc(sessionId);
        offerCandidates = sessionDoc.collection('offerCandidates');
        answerCandidates = sessionDoc.collection('answerCandidates');
        
        // Check if session exists
        const sessionSnapshot = await sessionDoc.get();
        if (!sessionSnapshot.exists) {
            throw new Error('Session not found');
        }
        
        const sessionData = sessionSnapshot.data();
        console.log('Session mode:', sessionData.mode);
        
        console.log('Session joined successfully');
        return sessionData.mode;
    } catch (error) {
        console.error('Error joining session:', error);
        updateStatus(`Error joining session: ${error.message}`, 'error');
        return null;
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

// Update mode indicator
function updateModeIndicator(mode) {
    currentModeSpan.textContent = mode;
    currentModeSpan.className = 'mode-badge';
    
    if (mode === 'Screen Sharing') {
        currentModeSpan.classList.add('sharing');
    } else if (mode === 'Video Call') {
        currentModeSpan.classList.add('video-call');
    } else if (mode === 'Audio Call') {
        currentModeSpan.classList.add('audio-call');
    } else if (mode === 'Connected') {
        currentModeSpan.classList.add('active');
    }
}

// Disable/enable buttons
function disableButtons(disabled) {
    const buttons = [startShareBtn, viewScreenBtn, startVideoCallBtn, joinVideoCallBtn, startAudioCallBtn, joinAudioCallBtn];
    buttons.forEach(btn => {
        btn.disabled = disabled;
    });
}

// Start screen sharing
async function startScreenShare() {
    const sessionId = sessionIdInput.value.trim();
    if (!sessionId) {
        alert('Please enter or generate a session ID');
        return;
    }
    
    if (isSharing) {
        stopAllConnections();
        return;
    }
    
    try {
        updateStatus('Requesting screen capture...', 'waiting');
        disableButtons(true);
        
        // Request screen capture with audio
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                displaySurface: 'monitor'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });
        
        console.log('Screen capture stream obtained:', localStream);
        console.log('Screen stream tracks:', localStream.getTracks());
        
        // Check if audio track is available
        const audioTracks = localStream.getAudioTracks();
        const videoTracks = localStream.getVideoTracks();
        
        console.log('Audio tracks:', audioTracks.length);
        console.log('Video tracks:', videoTracks.length);
        
        if (audioTracks.length > 0) {
            console.log('Audio track found:', audioTracks[0].label);
            updateStatus('Screen sharing with audio enabled', 'connected');
        } else {
            console.log('No audio track in screen capture');
            updateStatus('Screen sharing (video only)', 'connected');
        }
        
        localVideo.srcObject = localStream;
        
        // Create session and setup connection
        const sessionCreated = await createSession(sessionId, 'screen-share');
        if (sessionCreated) {
            await setupSharerConnection();
        }
        
        isSharing = true;
        startShareBtn.textContent = 'Stop Sharing';
        startShareBtn.classList.remove('btn--primary');
        startShareBtn.classList.add('btn--secondary');
        updateModeIndicator('sharing');
        
        // Handle stream end
        localStream.getVideoTracks()[0].addEventListener('ended', () => {
            console.log('Screen share ended by user');
            stopAllConnections();
        });
        
        if (audioTracks.length > 0) {
            audioTracks[0].addEventListener('ended', () => {
                console.log('Screen audio ended');
            });
        }
        
    } catch (error) {
        console.error('Error starting screen share:', error);
        updateStatus(`Failed to start screen share: ${error.message}`, 'error');
        stopAllConnections();
    } finally {
        disableButtons(false);
    }
}

// Start video call
async function startVideoCall() {
    const sessionId = sessionIdInput.value.trim();
    if (!sessionId) {
        alert('Please enter or generate a session ID');
        return;
    }
    
    if (isSharing || isVideoCall || isAudioCall) {
        stopAllConnections();
        return;
    }
    
    try {
        updateStatus('Requesting camera and microphone...', 'waiting');
        disableButtons(true);
        
        // Get user media for video call (bidirectional)
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        console.log('Video call stream obtained:', localStream);
        console.log('Video call stream tracks:', localStream.getTracks());
        
        localVideo.srcObject = localStream;
        
        // Debug local video setup
        console.log('Setting local video srcObject for caller');
        debugVideoElement(localVideo, 'Caller Local Video Setup');
        
        // Ensure local video is properly configured
        localVideo.muted = true; // Mute local video to prevent feedback
        localVideo.autoplay = true;
        localVideo.playsInline = true;
        localVideo.style.display = 'block';
        localVideo.style.width = '100%';
        localVideo.style.height = 'auto';
        localVideo.style.visibility = 'visible';
        localVideo.style.opacity = '1';
        
        // Add event listeners to local video element
        localVideo.onloadedmetadata = function() {
            console.log('Caller local video metadata loaded');
            console.log('Caller local video dimensions:', localVideo.videoWidth, 'x', localVideo.videoHeight);
            debugVideoElement(localVideo, 'Caller Local Video After Metadata');
        };
        
        localVideo.onplay = function() {
            console.log('Caller local video is playing');
            debugVideoElement(localVideo, 'Caller Local Video On Play');
        };
        
        localVideo.onerror = function(error) {
            console.error('Caller local video error:', error);
        };
        
        // Create session and setup connection
        const sessionCreated = await createSession(sessionId, 'video-call');
        if (sessionCreated) {
            await setupSharerConnection();
        }
        
        isVideoCall = true;
        startVideoCallBtn.textContent = 'End Video Call';
        startVideoCallBtn.classList.remove('btn--primary');
        startVideoCallBtn.classList.add('btn--secondary');
        updateModeIndicator('video-call');
        
        updateStatus('Video call started. Waiting for peer...', 'waiting');
        
        // Handle stream end
        localStream.getVideoTracks()[0].addEventListener('ended', () => {
            console.log('Video track ended');
            stopAllConnections();
        });
        
        localStream.getAudioTracks()[0].addEventListener('ended', () => {
            console.log('Audio track ended');
            stopAllConnections();
        });
        
    } catch (error) {
        console.error('Error starting video call:', error);
        updateStatus(`Failed to start video call: ${error.message}`, 'error');
        stopAllConnections();
    } finally {
        disableButtons(false);
    }
}

// Start audio call
async function startAudioCall() {
    const sessionId = sessionIdInput.value.trim();
    if (!sessionId) {
        alert('Please enter or generate a session ID');
        return;
    }
    
    if (isSharing || isVideoCall || isAudioCall) {
        stopAllConnections();
        return;
    }
    
    try {
        updateStatus('Requesting microphone...', 'waiting');
        disableButtons(true);
        
        // Get user media for audio call (bidirectional)
        localStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100
            }
        });
        
        console.log('Audio call stream obtained:', localStream);
        console.log('Audio call stream tracks:', localStream.getTracks());
        
        localVideo.srcObject = localStream;
        
        // Debug local video setup for audio call
        console.log('Setting local video srcObject for audio caller');
        debugVideoElement(localVideo, 'Audio Caller Local Video Setup');
        
        // Ensure local video is properly configured (will be blank for audio-only)
        localVideo.muted = true; // Mute local video to prevent feedback
        localVideo.autoplay = true;
        localVideo.playsInline = true;
        localVideo.style.display = 'block';
        localVideo.style.width = '100%';
        localVideo.style.height = 'auto';
        localVideo.style.visibility = 'visible';
        localVideo.style.opacity = '1';
        
        // Add event listeners to local video element
        localVideo.onloadedmetadata = function() {
            console.log('Audio caller local video metadata loaded');
            console.log('Audio caller local video dimensions:', localVideo.videoWidth, 'x', localVideo.videoHeight);
            debugVideoElement(localVideo, 'Audio Caller Local Video After Metadata');
        };
        
        localVideo.onplay = function() {
            console.log('Audio caller local video is playing');
            debugVideoElement(localVideo, 'Audio Caller Local Video On Play');
        };
        
        localVideo.onerror = function(error) {
            console.error('Audio caller local video error:', error);
        };
        
        // Create session and setup connection
        const sessionCreated = await createSession(sessionId, 'audio-call');
        if (sessionCreated) {
            await setupSharerConnection();
        }
        
        isAudioCall = true;
        startAudioCallBtn.textContent = 'End Audio Call';
        startAudioCallBtn.classList.remove('btn--primary');
        startAudioCallBtn.classList.add('btn--secondary');
        updateModeIndicator('audio-call');
        
        updateStatus('Audio call started. Waiting for peer...', 'waiting');
        
        // Handle stream end
        localStream.getAudioTracks()[0].addEventListener('ended', () => {
            console.log('Audio track ended');
            stopAllConnections();
        });
        
    } catch (error) {
        console.error('Error starting audio call:', error);
        updateStatus(`Failed to start audio call: ${error.message}`, 'error');
        stopAllConnections();
    } finally {
        disableButtons(false);
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
        
        // Set up track handling for incoming stream (bidirectional calls)
        peerConnection.ontrack = function(event) {
            console.log('=== SHARER ONTRACK EVENT ===');
            console.log('Sharer received remote stream:', event.streams);
            console.log('Sharer stream tracks:', event.streams[0]?.getTracks());
            console.log('Track event details:', event);
            console.log('Track kind:', event.track?.kind);
            console.log('Track id:', event.track?.id);
            console.log('============================');
            
            if (event.streams && event.streams[0]) {
                const remoteStream = event.streams[0];
                console.log('Sharer setting remote video srcObject');
                console.log('Sharer remote stream tracks:', remoteStream.getTracks());
                
                // Debug video element before setting stream
                debugVideoElement(remoteVideo, 'Sharer Before Setting Stream');
                
                // Set the remote video source
                remoteVideo.srcObject = remoteStream;
                
                // Store the remote stream
                window.remoteStream = remoteStream;
                
                // Ensure video element is properly configured
                remoteVideo.muted = false;
                remoteVideo.autoplay = true;
                remoteVideo.playsInline = true;
                remoteVideo.style.display = 'block';
                remoteVideo.style.width = '100%';
                remoteVideo.style.height = 'auto';
                remoteVideo.style.visibility = 'visible';
                remoteVideo.style.opacity = '1';
                
                // Add event listeners to video element
                remoteVideo.onloadedmetadata = function() {
                    console.log('Sharer remote video metadata loaded');
                    console.log('Sharer video dimensions:', remoteVideo.videoWidth, 'x', remoteVideo.videoHeight);
                    debugVideoElement(remoteVideo, 'Sharer After Metadata Loaded');
                    
                    remoteVideo.play().then(() => {
                        console.log('Sharer remote video started playing');
                        console.log('Sharer video element srcObject:', remoteVideo.srcObject);
                        console.log('Sharer video element currentSrc:', remoteVideo.currentSrc);
                        debugVideoElement(remoteVideo, 'Sharer After Play Started');
                    }).catch(error => {
                        console.error('Sharer error playing remote video:', error);
                    });
                };
                
                remoteVideo.onplay = function() {
                    console.log('Sharer remote video is playing');
                    console.log('Sharer video element readyState:', remoteVideo.readyState);
                    debugVideoElement(remoteVideo, 'Sharer On Play Event');
                };
                
                remoteVideo.onerror = function(error) {
                    console.error('Sharer remote video error:', error);
                };
                
                // Debug video element after setup
                debugVideoElement(remoteVideo, 'Sharer After Setup');
                
                console.log('Sharer remote video element updated');
            } else {
                console.error('Sharer: No streams in track event');
            }
        };
        
        // Set up ICE candidate handling
        peerConnection.onicecandidate = async function(event) {
            if (event.candidate) {
                console.log('Sending ICE candidate from sharer:', event.candidate);
                try {
                    await offerCandidates.add(event.candidate.toJSON());
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
                updateModeIndicator('Connected');
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
        await sessionDoc.set({ 
            offer: { type: offer.type, sdp: offer.sdp },
            sharerActive: true,
            lastUpdated: new Date()
        }, { merge: true });
        console.log('Saved offer to Firestore');
        
        // Listen for answer
        unsubscribeSession = sessionDoc.onSnapshot(async (snapshot) => {
            const data = snapshot.data();
            console.log('Sharer received session update:', data);
            
            if (data && data.answer && !peerConnection.currentRemoteDescription) {
                console.log('Received answer from viewer');
                try {
                    const answer = new RTCSessionDescription(data.answer);
                    await peerConnection.setRemoteDescription(answer);
                    console.log('Set remote answer description');
                    
                    // Now that we have the answer, the viewer's stream should come through
                    console.log('Waiting for viewer stream...');
                } catch (error) {
                    console.error('Error setting remote answer:', error);
                }
            }
        });
        
        // Listen for answer ICE candidates
        unsubscribeAnswerCandidates = answerCandidates.onSnapshot(async (snapshot) => {
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

// Start viewing screen
async function startViewing() {
    const sessionId = sessionIdInput.value.trim();
    if (!sessionId) {
        alert('Please enter a session ID');
        return;
    }
    
    if (isSharing || isVideoCall || isAudioCall) {
        stopAllConnections();
        return;
    }
    
    try {
        updateStatus('Joining screen share...', 'waiting');
        disableButtons(true);
        
        // Join session and setup connection (no local media needed for screen viewing)
        const sessionJoined = await joinSession(sessionId);
        if (sessionJoined) {
            await setupViewerConnection(sessionJoined);
        }
        
        isViewing = true;
        viewScreenBtn.textContent = 'Leave Viewing';
        viewScreenBtn.classList.remove('btn--outline');
        viewScreenBtn.classList.add('btn--secondary');
        updateModeIndicator('viewing');
        
        updateStatus('Joined screen share. Connecting...', 'waiting');
        
    } catch (error) {
        console.error('Error joining screen share:', error);
        updateStatus(`Failed to join screen share: ${error.message}`, 'error');
        stopAllConnections();
    } finally {
        disableButtons(false);
    }
}

// Join video call
async function joinVideoCall() {
    const sessionId = sessionIdInput.value.trim();
    if (!sessionId) {
        alert('Please enter a session ID');
        return;
    }
    
    if (isSharing || isVideoCall || isAudioCall) {
        stopAllConnections();
        return;
    }
    
    try {
        updateStatus('Joining video call...', 'waiting');
        disableButtons(true);
        
        // Get local media for bidirectional video call
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        console.log('Local video call stream obtained:', localStream);
        console.log('Local video call stream tracks:', localStream.getTracks());
        
        localVideo.srcObject = localStream;
        
        // Debug local video setup for viewer
        console.log('Setting local video srcObject for video call viewer');
        debugVideoElement(localVideo, 'Video Call Viewer Local Video Setup');
        
        // Ensure local video is properly configured
        localVideo.muted = true; // Mute local video to prevent feedback
        localVideo.autoplay = true;
        localVideo.playsInline = true;
        localVideo.style.display = 'block';
        localVideo.style.width = '100%';
        localVideo.style.height = 'auto';
        localVideo.style.visibility = 'visible';
        localVideo.style.opacity = '1';
        
        // Add event listeners to local video element
        localVideo.onloadedmetadata = function() {
            console.log('Video call viewer local video metadata loaded');
            console.log('Video call viewer local video dimensions:', localVideo.videoWidth, 'x', localVideo.videoHeight);
            debugVideoElement(localVideo, 'Video Call Viewer Local Video After Metadata');
        };
        
        localVideo.onplay = function() {
            console.log('Video call viewer local video is playing');
            debugVideoElement(localVideo, 'Video Call Viewer Local Video On Play');
        };
        
        localVideo.onerror = function(error) {
            console.error('Video call viewer local video error:', error);
        };
        
        // Join session and setup connection
        const sessionJoined = await joinSession(sessionId);
        if (sessionJoined) {
            await setupViewerConnection(sessionJoined);
        }
        
        isVideoCall = true;
        joinVideoCallBtn.textContent = 'Leave Video Call';
        joinVideoCallBtn.classList.remove('btn--outline');
        joinVideoCallBtn.classList.add('btn--secondary');
        updateModeIndicator('video-call');
        
        updateStatus('Joined video call. Connecting...', 'waiting');
        
        // Handle stream end
        localStream.getVideoTracks()[0].addEventListener('ended', () => {
            console.log('Local video track ended');
            stopAllConnections();
        });
        
        localStream.getAudioTracks()[0].addEventListener('ended', () => {
            console.log('Local audio track ended');
            stopAllConnections();
        });
        
    } catch (error) {
        console.error('Error joining video call:', error);
        updateStatus(`Failed to join video call: ${error.message}`, 'error');
        stopAllConnections();
    } finally {
        disableButtons(false);
    }
}

// Join audio call
async function joinAudioCall() {
    const sessionId = sessionIdInput.value.trim();
    if (!sessionId) {
        alert('Please enter a session ID');
        return;
    }
    
    if (isSharing || isVideoCall || isAudioCall) {
        stopAllConnections();
        return;
    }
    
    try {
        updateStatus('Joining audio call...', 'waiting');
        disableButtons(true);
        
        // Get local media for bidirectional audio call
        localStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100
            }
        });
        
        console.log('Local audio call stream obtained:', localStream);
        console.log('Local audio call stream tracks:', localStream.getTracks());
        
        localVideo.srcObject = localStream;
        
        // Debug local video setup for audio call viewer
        console.log('Setting local video srcObject for audio call viewer');
        debugVideoElement(localVideo, 'Audio Call Viewer Local Video Setup');
        
        // Ensure local video is properly configured (will be blank for audio-only)
        localVideo.muted = true; // Mute local video to prevent feedback
        localVideo.autoplay = true;
        localVideo.playsInline = true;
        localVideo.style.display = 'block';
        localVideo.style.width = '100%';
        localVideo.style.height = 'auto';
        localVideo.style.visibility = 'visible';
        localVideo.style.opacity = '1';
        
        // Add event listeners to local video element
        localVideo.onloadedmetadata = function() {
            console.log('Audio call viewer local video metadata loaded');
            console.log('Audio call viewer local video dimensions:', localVideo.videoWidth, 'x', localVideo.videoHeight);
            debugVideoElement(localVideo, 'Audio Call Viewer Local Video After Metadata');
        };
        
        localVideo.onplay = function() {
            console.log('Audio call viewer local video is playing');
            debugVideoElement(localVideo, 'Audio Call Viewer Local Video On Play');
        };
        
        localVideo.onerror = function(error) {
            console.error('Audio call viewer local video error:', error);
        };
        
        // Join session and setup connection
        const sessionJoined = await joinSession(sessionId);
        if (sessionJoined) {
            await setupViewerConnection(sessionJoined);
        }
        
        isAudioCall = true;
        joinAudioCallBtn.textContent = 'Leave Audio Call';
        joinAudioCallBtn.classList.remove('btn--outline');
        joinAudioCallBtn.classList.add('btn--secondary');
        updateModeIndicator('audio-call');
        
        updateStatus('Joined audio call. Connecting...', 'waiting');
        
        // Handle stream end
        localStream.getAudioTracks()[0].addEventListener('ended', () => {
            console.log('Local audio track ended');
            stopAllConnections();
        });
        
    } catch (error) {
        console.error('Error joining audio call:', error);
        updateStatus(`Failed to join audio call: ${error.message}`, 'error');
        stopAllConnections();
    } finally {
        disableButtons(false);
    }
}

// Set up viewer connection (bidirectional for calls)
async function setupViewerConnection(mode) {
    try {
        console.log('Setting up viewer connection. Mode:', mode);

        // Create peer connection for viewer
        peerConnection = new RTCPeerConnection(iceServers);
        console.log('Created peer connection for viewer');

        // Set up track handling for incoming stream (i.e., what we receive from sharer)
        peerConnection.ontrack = function(event) {
            console.log('Received remote stream:', event.streams);
            if (event.streams && event.streams[0]) {
                const remoteStreamObj = event.streams[0];
                console.log('Setting remote video srcObject');
                debugVideoElement(remoteVideo, 'Before Setting Stream');
                remoteVideo.srcObject = remoteStreamObj;
                window.remoteStream = remoteStreamObj;

                // Ensure video element is properly configured
                remoteVideo.muted = false;
                remoteVideo.autoplay = true;
                remoteVideo.playsInline = true;
                remoteVideo.style.display = 'block';
                remoteVideo.style.width = '100%';
                remoteVideo.style.height = 'auto';
                remoteVideo.style.visibility = 'visible';
                remoteVideo.style.opacity = '1';
                isViewing = true;
                updateStatus('Connected! Receiving stream...', 'connected');
                updateModeIndicator('Connected');

                remoteVideo.onloadedmetadata = function() {
                    console.log('Remote video metadata loaded');
                    debugVideoElement(remoteVideo, 'After Metadata Loaded');
                    remoteVideo.play().then(() => {
                        debugVideoElement(remoteVideo, 'After Play Started');
                    }).catch(error => {
                        console.error('Error playing remote video:', error);
                    });
                };
                remoteVideo.onplay = function() {
                    debugVideoElement(remoteVideo, 'On Play Event');
                };
                remoteVideo.onerror = function(error) {
                    console.error('Remote video error:', error);
                };
                debugVideoElement(remoteVideo, 'After Setup');
                console.log('Remote video element updated');
            } else {
                console.error('No streams in track event');
            }
        };

        // ICE candidate sending from viewer side
        peerConnection.onicecandidate = function(event) {
            if (event.candidate) {
                console.log('Sending ICE candidate from viewer:', event.candidate);
                answerCandidates.add(event.candidate.toJSON());
            }
        };

        // Monitor connection/ICE state
        peerConnection.onconnectionstatechange = function() {
            console.log('Viewer connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                updateStatus('WebRTC connection established!', 'connected');
            } else if (peerConnection.connectionState === 'failed') {
                updateStatus('Connection failed', 'error');
            }
        };
        peerConnection.oniceconnectionstatechange = function() {
            console.log('Viewer ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'connected') {
                console.log('ICE candidate gathering complete for viewer');
            }
        };

        // ===== FIRESTORE SIGNALING LOGIC =====
        const sessionSnapshot = await sessionDoc.get();
        if (sessionSnapshot.exists) {
            const sessionData = sessionSnapshot.data();
            console.log('Retrieved offer from Firestore');
            if (sessionData.offer) {
                const offerDesc = new RTCSessionDescription(sessionData.offer);
                console.log('Set remote offer description');
                await peerConnection.setRemoteDescription(offerDesc);

                // *** KEY PART FOR BIDIRECTIONAL: Add local tracks before createAnswer! ***
                if (mode === 'video-call' || mode === 'audio-call') {
                    console.log('Setting up bidirectional call - adding local stream. Mode=', mode);
                    if (localStream) {
                        localStream.getTracks().forEach(track => {
                            console.log('Adding local track to peer connection:', track.kind, track.id);
                            peerConnection.addTrack(track, localStream);
                        });
                        console.log('All local tracks added to peer connection for bidirectional call');
                        setTimeout(() => {
                            console.log('Peer connection senders:', peerConnection.getSenders());
                            console.log('Peer connection transceivers:', peerConnection.getTransceivers());
                        }, 1000);
                    } else {
                        console.error('No local stream available for bidirectional call');
                    }
                } else {
                    console.log('Not a bidirectional call (screen sharing), skipping local stream addition. Mode=', mode);
                }

                // --- Create and set local answer SPD ---
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                console.log('Created and set local answer');
                console.log('Answer SDP:', answer.sdp.substring(0, 200) + '...');

                // Print senders debug after adding tracks
                console.log('Local tracks in peer connection after answer creation:');
                peerConnection.getSenders().forEach(sender => {
                    console.log('Sender track:', sender.track?.kind, sender.track?.id);
                });

                // --- Save answer to Firestore ---
                await sessionDoc.update({
                    answer: {
                        type: answer.type,
                        sdp: answer.sdp
                    },
                    viewerActive: true,
                    lastUpdated: new Date()
                });
                console.log('Saved answer to Firestore');

                // Listen for offer ICE candidates
                offerCandidates.onSnapshot(snapshot => {
                    snapshot.docChanges().forEach(change => {
                        if (change.type === 'added') {
                            const candidate = new RTCIceCandidate(change.doc.data());
                            peerConnection.addIceCandidate(candidate);
                            console.log('Added offer ICE candidate');
                        }
                    });
                });
            } else {
                updateStatus('No offer found in session', 'error');
            }
        } else {
            updateStatus('Session not found', 'error');
        }
    } catch (error) {
        console.error('Error setting up viewer connection:', error);
        updateStatus(`Connection error: ${error.message}`, 'error');
    }
}


// Stop all connections
function stopAllConnections() {
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
    remoteVideo.srcObject = null;
    
    // Reset all states
    isSharing = false;
    isViewing = false;
    isVideoCall = false;
    isAudioCall = false;
    
    // Reset button states
    startShareBtn.textContent = 'Share Screen';
    startShareBtn.classList.remove('btn--secondary');
    startShareBtn.classList.add('btn--primary');
    
    viewScreenBtn.textContent = 'View Screen';
    viewScreenBtn.classList.remove('btn--secondary');
    viewScreenBtn.classList.add('btn--outline');
    
    startVideoCallBtn.textContent = 'Video Call';
    startVideoCallBtn.classList.remove('btn--secondary');
    startVideoCallBtn.classList.add('btn--primary');
    
    joinVideoCallBtn.textContent = 'Join Video Call';
    joinVideoCallBtn.classList.remove('btn--secondary');
    joinVideoCallBtn.classList.add('btn--outline');
    
    startAudioCallBtn.textContent = 'Audio Call';
    startAudioCallBtn.classList.remove('btn--secondary');
    startAudioCallBtn.classList.add('btn--primary');
    
    joinAudioCallBtn.textContent = 'Join Audio Call';
    joinAudioCallBtn.classList.remove('btn--secondary');
    joinAudioCallBtn.classList.add('btn--outline');
    
    updateModeIndicator('No active mode');
    updateStatus('All connections stopped');
    console.log('All connections stopped');
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
    const hasUserMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
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
        hasUserMedia,
        isModernBrowser
    });
    
    if (!isHTTPS) {
        updateStatus('⚠️ HTTPS required for WebRTC features. Please access via HTTPS.', 'warning');
    } else if (!hasScreenShare || !hasUserMedia) {
        updateStatus('⚠️ WebRTC features not supported in this browser. Please use Chrome, Firefox, or Safari.', 'warning');
    } else if (!isModernBrowser) {
        updateStatus('⚠️ Please use a modern browser for best compatibility.', 'warning');
    } else {
        updateStatus('✅ Browser compatible for all WebRTC features');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    console.log('WebRTC Screen Share & Calls App loaded');
    
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
            stopAllConnections();
        } else {
            startScreenShare();
        }
    });
    
    viewScreenBtn.addEventListener('click', function() {
        if (isViewing) {
            stopAllConnections();
        } else {
            startViewing();
        }
    });
    
    startVideoCallBtn.addEventListener('click', function() {
        if (isVideoCall) {
            stopAllConnections();
        } else {
            startVideoCall();
        }
    });
    
    joinVideoCallBtn.addEventListener('click', function() {
        if (isViewing) {
            stopAllConnections();
        } else {
            joinVideoCall();
        }
    });
    
    startAudioCallBtn.addEventListener('click', function() {
        if (isAudioCall) {
            stopAllConnections();
        } else {
            startAudioCall();
        }
    });
    
    joinAudioCallBtn.addEventListener('click', function() {
        if (isViewing) {
            stopAllConnections();
        } else {
            joinAudioCall();
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

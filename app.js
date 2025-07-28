// WebRTC Screen Sharing Application
// Using native WebRTC with custom signaling server

let peerConnection = null;
let signalingSocket = null;
let currentSessionId = null;
let myPeerId = null;
let localStream = null;
let remoteStream = null;
let isSharing = false;
let isViewing = false;
let isFallbackMode = false; // Track if we're in fallback mode

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
            urls: 'turn:YOUR_GCP_EXTERNAL_IP:3478?transport=udp',
            username: 'peeruser',
            credential: 'peerpass123'
        },
        {
            urls: 'turn:YOUR_GCP_EXTERNAL_IP:3478?transport=tcp',
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

// Initialize WebSocket connection to signaling server
function connectSignaling() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const wsUrl = `${protocol}//${host}:${port}`;
    
    console.log('Connecting to signaling server:', wsUrl);
    
    signalingSocket = new WebSocket(wsUrl);
    
    signalingSocket.onopen = function() {
        console.log('Connected to signaling server');
        updateStatus('Connected to signaling server', 'connected');
        
        // Send a ping to keep connection alive
        setInterval(() => {
            if (signalingSocket && signalingSocket.readyState === WebSocket.OPEN) {
                signalingSocket.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000); // Send ping every 30 seconds
    };
    
    signalingSocket.onmessage = function(event) {
        const message = JSON.parse(event.data);
        console.log('Received signaling message:', message);
        
        switch (message.type) {
            case 'registered':
                console.log('Registered with signaling server:', message);
                myPeerId = message.peerId;
                break;
                
            case 'offer':
                handleOffer(message);
                break;
                
            case 'answer':
                handleAnswer(message);
                break;
                
            case 'ice-candidate':
                handleIceCandidate(message);
                break;
                
            case 'peer-list':
                handlePeerList(message);
                break;
                
            case 'error':
                console.error('Signaling error:', message.message);
                updateStatus(`Signaling error: ${message.message}`, 'error');
                break;
                
            case 'pong':
                console.log('Received pong from server');
                break;
        }
    };
    
    signalingSocket.onclose = function(event) {
        console.log('Disconnected from signaling server:', event.code, event.reason);
        updateStatus('Disconnected from signaling server', 'error');
        
        // Try to reconnect after a delay
        setTimeout(() => {
            if (!isSharing && !isViewing) {
                console.log('Attempting to reconnect to signaling server...');
                connectSignaling();
            }
        }, 3000);
    };
    
    signalingSocket.onerror = function(error) {
        console.error('WebSocket error:', error);
        updateStatus('Connection error', 'error');
    };
}

// Register with signaling server
function registerWithServer(sessionId, isSharer = false) {
    if (signalingSocket && signalingSocket.readyState === WebSocket.OPEN) {
        const message = {
            type: 'register',
            peerId: `peer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            sessionId: sessionId,
            isSharer: isSharer
        };
        
        console.log('Registering with server:', message);
        signalingSocket.send(JSON.stringify(message));
    }
}

// Handle incoming offer
async function handleOffer(message) {
    console.log('Handling offer from:', message.from);
    
    try {
        // Create peer connection for viewer
        peerConnection = new RTCPeerConnection(iceServers);
        
        // Set up event handlers
        peerConnection.ontrack = function(event) {
            console.log('Received remote stream:', event.streams);
            console.log('Stream tracks:', event.streams[0].getTracks());
            
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
        
        peerConnection.onicecandidate = function(event) {
            if (event.candidate) {
                console.log('Sending ICE candidate:', event.candidate);
                signalingSocket.send(JSON.stringify({
                    type: 'ice-candidate',
                    target: message.from,
                    candidate: event.candidate
                }));
            } else {
                console.log('ICE candidate gathering complete');
            }
        };
        
        peerConnection.onconnectionstatechange = function() {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                updateStatus('WebRTC connection established!', 'connected');
            } else if (peerConnection.connectionState === 'failed') {
                updateStatus('WebRTC connection failed', 'error');
            } else if (peerConnection.connectionState === 'disconnected') {
                updateStatus('WebRTC connection disconnected', 'error');
            }
        };
        
        peerConnection.oniceconnectionstatechange = function() {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'connected') {
                console.log('ICE connection established!');
            } else if (peerConnection.iceConnectionState === 'failed') {
                console.log('ICE connection failed');
            } else if (peerConnection.iceConnectionState === 'checking') {
                console.log('ICE connection checking...');
            } else if (peerConnection.iceConnectionState === 'disconnected') {
                console.log('ICE connection disconnected');
            }
        };
        
        peerConnection.onicegatheringstatechange = function() {
            console.log('ICE gathering state:', peerConnection.iceGatheringState);
        };
        
        // Set remote description
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
        console.log('Set remote description successfully');
        
        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log('Created and set local answer');
        
        // Send answer
        signalingSocket.send(JSON.stringify({
            type: 'answer',
            target: message.from,
            answer: answer
        }));
        console.log('Sent answer to peer');
        
    } catch (error) {
        console.error('Error handling offer:', error);
        updateStatus(`Error handling offer: ${error.message}`, 'error');
    }
}

// Handle incoming answer
async function handleAnswer(message) {
    console.log('Handling answer from:', message.from);
    console.log('Answer SDP:', message.answer.sdp.substring(0, 200) + '...');
    console.log('Current peer connection state:', peerConnection ? peerConnection.connectionState : 'null');
    console.log('Fallback mode:', isFallbackMode);
    
    try {
        if (peerConnection && peerConnection.connectionState !== 'closed') {
            // Check if we're in fallback mode and the connection is in the right state
            if (isFallbackMode) {
                console.log('Processing answer in fallback mode');
                console.log('Current connection state:', peerConnection.connectionState);
                console.log('Current ICE connection state:', peerConnection.iceConnectionState);
                
                // In fallback mode, we can accept answers in various states
                if (peerConnection.connectionState === 'have-local-offer' || 
                    peerConnection.connectionState === 'new' ||
                    peerConnection.connectionState === 'have-local-pranswer') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
                    console.log('Set remote answer successfully in fallback mode');
                } else {
                    console.warn('Peer connection in unexpected state for fallback answer:', peerConnection.connectionState);
                    // Try to set the answer anyway
                    try {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
                        console.log('Set remote answer successfully despite unexpected state');
                    } catch (error) {
                        console.error('Failed to set remote answer in fallback mode:', error);
                        updateStatus('Connection state error. Please try again.', 'error');
                    }
                }
            } else {
                // Normal mode
                await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
                console.log('Set remote answer successfully');
            }
        } else {
            console.error('Peer connection is not available or closed');
            updateStatus('Connection lost. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error handling answer:', error);
        updateStatus(`Error handling answer: ${error.message}`, 'error');
    }
}

// Handle ICE candidate
async function handleIceCandidate(message) {
    console.log('Handling ICE candidate from:', message.from);
    console.log('ICE candidate:', message.candidate);
    console.log('Current peer connection state:', peerConnection ? peerConnection.connectionState : 'null');
    
    try {
        if (peerConnection && peerConnection.connectionState !== 'closed') {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
            console.log('Successfully added ICE candidate');
        } else {
            console.error('Peer connection is not available or closed for ICE candidate');
        }
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
    }
}

// Handle peer list
function handlePeerList(message) {
    console.log('Available peers:', message.peers);
    
    if (message.peers.length > 0) {
        const sharer = message.peers.find(peer => peer.isSharer);
        if (sharer) {
            console.log('Found sharer:', sharer.id);
            console.log('Current role - isSharing:', isSharing, 'isViewing:', isViewing);
            callPeer(sharer.id);
        } else {
            updateStatus('No sharer found in session', 'error');
        }
    } else {
        updateStatus('No peers found in session', 'error');
    }
}

// Call a peer
async function callPeer(targetPeerId) {
    console.log('Calling peer:', targetPeerId);
    console.log('Current role - isSharing:', isSharing, 'isViewing:', isViewing);
    
    // Reset fallback mode flag
    isFallbackMode = false;
    
    try {
        // Create peer connection
        console.log('Creating peer connection with ICE servers:', iceServers);
        peerConnection = new RTCPeerConnection(iceServers);
        console.log('Peer connection created successfully');
        
        // Add local stream only if we're the sharer
        if (localStream && isSharing) {
            console.log('Local stream tracks:', localStream.getTracks());
            localStream.getTracks().forEach(track => {
                console.log('Adding track to peer connection:', track.kind, track.id);
                peerConnection.addTrack(track, localStream);
            });
            console.log('Added local stream tracks to peer connection');
        } else if (!isSharing) {
            console.log('Viewer mode - no local stream needed');
        } else {
            console.error('No local stream available for sharer');
            return;
        }
        
        // Set up event handlers
        peerConnection.onicecandidate = function(event) {
            if (event.candidate) {
                console.log('Sending ICE candidate:', event.candidate);
                console.log('Candidate type:', event.candidate.type);
                console.log('Candidate protocol:', event.candidate.protocol);
                console.log('Candidate address:', event.candidate.address);
                signalingSocket.send(JSON.stringify({
                    type: 'ice-candidate',
                    target: targetPeerId,
                    candidate: event.candidate
                }));
            } else {
                console.log('ICE candidate gathering complete');
            }
        };
        
        peerConnection.onconnectionstatechange = function() {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                updateStatus('WebRTC connection established!', 'connected');
            } else if (peerConnection.connectionState === 'failed') {
                updateStatus('WebRTC connection failed', 'error');
            } else if (peerConnection.connectionState === 'disconnected') {
                updateStatus('WebRTC connection disconnected', 'error');
            }
        };
        
        peerConnection.oniceconnectionstatechange = function() {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'connected') {
                console.log('ICE connection established!');
            } else if (peerConnection.iceConnectionState === 'failed') {
                console.log('ICE connection failed');
            } else if (peerConnection.iceConnectionState === 'checking') {
                console.log('ICE connection checking...');
            } else if (peerConnection.iceConnectionState === 'disconnected') {
                console.log('ICE connection disconnected');
            }
        };
        
        peerConnection.onicegatheringstatechange = function() {
            console.log('ICE gathering state:', peerConnection.iceGatheringState);
        };
        
        // Create offer
        const offer = await peerConnection.createOffer();
        console.log('Created offer SDP:', offer.sdp.substring(0, 200) + '...');
        await peerConnection.setLocalDescription(offer);
        console.log('Created and set local offer');
        
        // Send offer
        signalingSocket.send(JSON.stringify({
            type: 'offer',
            target: targetPeerId,
            offer: offer
        }));
        console.log('Sent offer to peer');
        
        // Set up connection timeout
        setTimeout(() => {
            if (peerConnection && peerConnection.iceConnectionState !== 'connected') {
                console.log('Connection timeout - ICE state:', peerConnection.iceConnectionState);
                
                // Check if any ICE candidates were generated
                if (peerConnection.iceConnectionState === 'new') {
                    console.warn('No ICE candidates generated. Trying fallback approach...');
                    updateStatus('Network connectivity issue. Trying alternative connection method...', 'error');
                    
                    // Set fallback mode flag
                    isFallbackMode = true;
                    
                    // Close the original connection
                    peerConnection.close();
                    
                    // Try multiple fallback configurations
                    const fallbackConfigs = [
                        // Fallback 1: Single Google STUN
                        {
                            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                        },
                        // Fallback 2: Alternative STUN servers
                        {
                            iceServers: [
                                { urls: 'stun:stun.stunprotocol.org:3478' },
                                { urls: 'stun:stun.voiparound.com:3478' }
                            ]
                        },
                        // Fallback 3: Minimal configuration
                        {
                            iceServers: []
                        }
                    ];
                    
                    let fallbackIndex = 0;
                    
                    function tryNextFallback() {
                        if (fallbackIndex >= fallbackConfigs.length) {
                            console.error('All fallback configurations failed');
                            updateStatus('Unable to establish connection. Please check your network.', 'error');
                            return;
                        }
                        
                        const fallbackConfig = fallbackConfigs[fallbackIndex];
                        console.log(`Trying fallback configuration ${fallbackIndex + 1}:`, fallbackConfig);
                        
                        // Create a new peer connection with fallback servers
                        peerConnection = new RTCPeerConnection(fallbackConfig);
                        console.log('Created fallback peer connection');
                        console.log('Initial fallback connection state:', peerConnection.connectionState);
                        
                        // Set up the same event handlers
                        peerConnection.onicecandidate = function(event) {
                            if (event.candidate) {
                                console.log('Fallback ICE candidate:', event.candidate.type, event.candidate.protocol);
                                signalingSocket.send(JSON.stringify({
                                    type: 'ice-candidate',
                                    target: targetPeerId,
                                    candidate: event.candidate
                                }));
                            } else {
                                console.log('Fallback ICE candidate gathering complete');
                            }
                        };
                        
                        peerConnection.onconnectionstatechange = function() {
                            console.log('Fallback connection state changed:', peerConnection.connectionState);
                            if (peerConnection.connectionState === 'connected') {
                                updateStatus('WebRTC connection established!', 'connected');
                            } else if (peerConnection.connectionState === 'failed') {
                                console.log('Fallback configuration failed, trying next...');
                                fallbackIndex++;
                                tryNextFallback();
                            }
                        };
                        
                        peerConnection.oniceconnectionstatechange = function() {
                            console.log('Fallback ICE connection state changed:', peerConnection.iceConnectionState);
                        };
                        
                        // Set up ontrack for viewer
                        if (!isSharing) {
                            peerConnection.ontrack = function(event) {
                                console.log('Received remote stream from fallback connection');
                                if (event.streams && event.streams[0]) {
                                    remoteVideo.srcObject = event.streams[0];
                                    remoteStream = event.streams[0];
                                    isViewing = true;
                                    updateStatus('Connected! Receiving screen share...', 'connected');
                                    
                                    viewScreenBtn.textContent = 'Stop Viewing';
                                    viewScreenBtn.classList.remove('btn--outline');
                                    viewScreenBtn.classList.add('btn--secondary');
                                }
                            };
                        }
                        
                        // Add local stream only if we're the sharer
                        if (localStream && isSharing) {
                            console.log('Adding local stream to fallback connection');
                            localStream.getTracks().forEach(track => {
                                console.log('Adding track to fallback connection:', track.kind, track.id);
                                peerConnection.addTrack(track, localStream);
                            });
                        }
                        
                        // Try to create a new offer with fallback servers
                        peerConnection.createOffer().then(offer => {
                            console.log('Created fallback offer:', offer.sdp.substring(0, 200) + '...');
                            return peerConnection.setLocalDescription(offer);
                        }).then(() => {
                            console.log('Set local fallback offer');
                            console.log('Fallback connection state after setLocalDescription:', peerConnection.connectionState);
                            // Wait a moment for the state to update
                            setTimeout(() => {
                                signalingSocket.send(JSON.stringify({
                                    type: 'offer',
                                    target: targetPeerId,
                                    offer: peerConnection.localDescription
                                }));
                                console.log('Sent fallback offer');
                            }, 100);
                        }).catch(error => {
                            console.error('Fallback offer creation failed:', error);
                            fallbackIndex++;
                            tryNextFallback();
                        });
                    }
                    
                    // Start with the first fallback configuration
                    tryNextFallback();
                    
                } else {
                    updateStatus('Connection timeout. Please try again.', 'error');
                }
            }
        }, 10000); // 10 second timeout
        
    } catch (error) {
        console.error('Error calling peer:', error);
        updateStatus(`Error calling peer: ${error.message}`, 'error');
    }
}

// Start screen sharing
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
        
        // Register as sharer
        registerWithServer(sessionId, true);
        
        updateStatus(`Sharing screen with ID: ${sessionId}. Waiting for viewer...`, 'waiting');
        isSharing = true;
        
        startShareBtn.textContent = 'Stop Sharing';
        startShareBtn.classList.remove('btn--primary');
        startShareBtn.classList.add('btn--secondary');
        
        console.log('Screen sharing started');
        
    } catch (error) {
        console.error('Error starting screen share:', error);
        updateStatus(`Error starting screen share: ${error.message}`, 'error');
        stopScreenShare();
    }
}

// Stop screen sharing
function stopScreenShare() {
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

// Start viewing screen
async function startViewing() {
    try {
        updateStatus('Connecting to screen share...', 'waiting');
        
        // Get session ID
        const sessionId = sessionIdInput.value.trim();
        if (!sessionId) {
            throw new Error('Please enter a session ID');
        }
        
        currentSessionId = sessionId;
        
        // Register as viewer
        registerWithServer(sessionId, false);
        
        updateStatus('Calling screen sharer...', 'waiting');
        
        // Wait a bit for registration, then request peer list
        setTimeout(() => {
            if (signalingSocket && signalingSocket.readyState === WebSocket.OPEN) {
                signalingSocket.send(JSON.stringify({
                    type: 'list-peers',
                    sessionId: sessionId
                }));
            }
        }, 1000);
        
    } catch (error) {
        console.error('Error viewing screen:', error);
        updateStatus(`Error viewing screen: ${error.message}`, 'error');
        stopViewing();
    }
}

// Stop viewing screen
function stopViewing() {
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
    
    // Connect to signaling server
    connectSignaling();
    
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

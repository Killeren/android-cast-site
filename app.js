/**
 * WebRTC Screen Sharing Application using PeerJS
 * This app allows one device to share its screen with another device
 */
// Global variables
let peer = null;
let localStream = null;
let currentCall = null;
let isSharing = false;
let isViewing = false;
// DOM elements
const sessionIdInput = document.getElementById('sessionId');
const generateIdBtn = document.getElementById('generateId');
const startShareBtn = document.getElementById('startShare');
const viewScreenBtn = document.getElementById('viewScreen');
const statusDiv = document.getElementById('status');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
/**
 * Initialize the application when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    // Check browser compatibility
    checkBrowserCompatibility();
    
    // Add event listeners to buttons
    generateIdBtn.addEventListener('click', generateSessionId);
    startShareBtn.addEventListener('click', startScreenShare);
    viewScreenBtn.addEventListener('click', viewScreen);
    
    // Add input validation
    sessionIdInput.addEventListener('input', validateSessionId);
    
    updateStatus('Ready to connect');
});
/**
 * Generate a random 6-digit session ID
 */
function generateSessionId() {
    // Generate a random 6-character alphanumeric string
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let sessionId = '';
    
    for (let i = 0; i < 6; i++) {
        sessionId += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    sessionIdInput.value = sessionId;
    updateStatus('Session ID generated: ' + sessionId);
}
/**
 * Validate session ID input (6 characters, alphanumeric)
 */
function validateSessionId() {
    const value = sessionIdInput.value.toUpperCase();
    sessionIdInput.value = value.slice(0, 6); // Limit to 6 characters
}
/**
 * Start screen sharing (sender mode)
 */
async function startScreenShare() {
    const sessionId = sessionIdInput.value.trim();
    
    // Validate session ID before proceeding
    if (!sessionId) {
        alert('Please enter or generate a session ID');
        return;
    }
    
    if (isSharing) {
        stopScreenShare();
        return;
    }
    
    try {
        updateStatus('Requesting screen share permission...', 'waiting');
        disableButtons(true);
        
        // Check if screen sharing is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            throw new Error('Screen sharing is not supported in this browser. Please use Chrome, Firefox, or Safari.');
        }
        
        // Check if we're on HTTPS (required for screen sharing)
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            throw new Error('Screen sharing requires HTTPS. Please access this site via HTTPS.');
        }
        
        // Request screen capture
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always",
                displaySurface: "monitor"
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });
        
        // Show local stream
        localVideo.srcObject = localStream;
        updateStatus('Screen capture started. Waiting for viewer...', 'waiting');
        
        // Initialize PeerJS connection
        peer = new Peer(sessionId, {
            host: '0.peerjs.com',
            port: 443,
            path: '/',
            secure: true,
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                {
                  urls: 'turn:35.200.221.49:3478?transport=tcp',
                  username: 'peeruser',
                  credential: 'peerpass123'
                },
                {
                  urls: 'turn:35.200.221.49:3478?transport=udp',
                  username: 'peeruser',
                  credential: 'peerpass123'
                }
              ]
            }
        });
        
        // Handle peer connection events
        peer.on('open', function(id) {
            updateStatus(`Sharing screen with ID: ${id}. Waiting for viewer...`, 'waiting');
            isSharing = true;
            startShareBtn.textContent = 'Stop Sharing';
            startShareBtn.classList.remove('btn--primary');
            startShareBtn.classList.add('btn--secondary');
            console.log('Peer connection opened with ID:', id);
            console.log('Sharer is ready to receive calls');
        });
        
        // Handle incoming calls from viewers
        peer.on('call', function(call) {
            updateStatus('Viewer connected! Answering call...', 'waiting');
            console.log('Incoming call from viewer:', call);
            console.log('Call metadata:', call.metadata);
            
            try {
                // Answer the call with our screen stream
                call.answer(localStream);
                currentCall = call;
                console.log('Call answered successfully');
                
                // Handle call events
                call.on('stream', function(remoteStream) {
                    // Viewers don't typically send video back, but handle it just in case
                    console.log('Received stream from viewer');
                });
                
                call.on('close', function() {
                    updateStatus('Viewer disconnected', 'waiting');
                    console.log('Call closed by viewer');
                    if (isSharing) {
                        updateStatus(`Still sharing screen with ID: ${sessionIdInput.value}. Waiting for new viewer...`, 'waiting');
                    }
                });
                
                call.on('error', function(err) {
                    console.error('Call error:', err);
                    updateStatus(`Call error: ${err.message}`, 'error');
                });
                
                updateStatus('Connected to viewer!', 'connected');
            } catch (error) {
                console.error('Error answering call:', error);
                updateStatus(`Error answering call: ${error.message}`, 'error');
            }
        });
        
        // Handle peer errors
        peer.on('error', function(err) {
            console.error('PeerJS error:', err);
            updateStatus(`Connection error: ${err.message}`, 'error');
            stopScreenShare();
        });
        
        // Handle peer disconnection
        peer.on('disconnected', function() {
            console.log('Peer disconnected');
            updateStatus('Connection lost. Reconnecting...', 'error');
        });
        
        peer.on('reconnected', function() {
            console.log('Peer reconnected');
            updateStatus('Connection restored', 'connected');
        });
        
        // Handle when screen share is stopped by user
        localStream.getVideoTracks()[0].addEventListener('ended', function() {
            updateStatus('Screen sharing stopped by user');
            stopScreenShare();
        });
        
    } catch (error) {
        console.error('Error starting screen share:', error);
        
        // Provide specific error messages
        if (error.name === 'NotAllowedError') {
            updateStatus('Screen sharing permission denied. Please allow screen sharing and try again.', 'error');
        } else if (error.name === 'NotSupportedError') {
            updateStatus('Screen sharing is not supported in this browser. Please use Chrome, Firefox, or Safari.', 'error');
        } else if (error.message.includes('HTTPS')) {
            updateStatus('Screen sharing requires HTTPS. Please access this site via HTTPS.', 'error');
        } else {
            updateStatus(`Failed to start screen sharing: ${error.message}`, 'error');
        }
        
        stopScreenShare();
    } finally {
        disableButtons(false);
    }
}
/**
 * Stop screen sharing
 */
function stopScreenShare() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (currentCall) {
        currentCall.close();
        currentCall = null;
    }
    
    if (peer) {
        peer.destroy();
        peer = null;
    }
    
    localVideo.srcObject = null;
    isSharing = false;
    
    startShareBtn.textContent = 'Share Screen';
    startShareBtn.classList.remove('btn--secondary');
    startShareBtn.classList.add('btn--primary');
    
    updateStatus('Screen sharing stopped');
}
/**
 * View screen from another device (receiver mode)
 */
function viewScreen() {
    const sessionId = sessionIdInput.value.trim();
    
    // Validate session ID before proceeding
    if (!sessionId) {
        alert('Please enter the session ID you want to connect to');
        return;
    }
    
    if (isViewing) {
        stopViewing();
        return;
    }
    
    try {
        updateStatus('Connecting to screen share...', 'waiting');
        disableButtons(true);
        
        // Generate unique viewer ID
        const viewerId = 'viewer-' + Math.random().toString(36).slice(2, 8);
        
        // Initialize PeerJS connection
        peer = new Peer(viewerId, {
            host: '0.peerjs.com',
            port: 443,
            path: '/',
            secure: true,
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                {
                  urls: 'turn:35.200.221.49:3478?transport=tcp',
                  username: 'peeruser',
                  credential: 'peerpass123'
                },
                {
                  urls: 'turn:35.200.221.49:3478?transport=udp',
                  username: 'peeruser',
                  credential: 'peerpass123'
                }
              ]
            }
        });
        
        // Handle peer connection events
        peer.on('open', function(id) {
            updateStatus(`Calling screen sharer (${sessionId})...`, 'waiting');
            console.log('Viewer peer opened with ID:', id);
            console.log('Target sharer ID:', sessionId);
            console.log('PeerJS server connection established');
            
            // Add a small delay to ensure the sharer is ready
            setTimeout(() => {
                attemptCall();
            }, 2000); // Wait 2 seconds before trying to call
        });
        
        // Function to attempt the call with retry logic
        function attemptCall(retryCount = 0) {
            console.log(`Attempting call to sharer (attempt ${retryCount + 1})`);
            console.log('Session ID:', sessionId);
            console.log('Peer object:', peer);
            console.log('Peer ID:', peer.id);
            console.log('Peer connection state:', peer.connection ? peer.connection.connectionState : 'No connection');
            
            try {
                // Check if peer is connected
                if (!peer.id) {
                    console.error('Peer not connected yet');
                    if (retryCount < 3) {
                        console.log(`Retrying call in 2 seconds... (attempt ${retryCount + 1})`);
                        setTimeout(() => {
                            attemptCall(retryCount + 1);
                        }, 2000);
                    } else {
                        updateStatus('Peer not connected. Please try again.', 'error');
                        stopViewing();
                    }
                    return;
                }
                
                // Validate session ID format
                if (!sessionId || sessionId.length !== 6) {
                    console.error('Invalid session ID format');
                    updateStatus('Invalid session ID. Please check the session ID.', 'error');
                    stopViewing();
                    return;
                }
                
                console.log('Attempting to call sharer with session ID:', sessionId);
                
                // Test if peer.call method exists
                if (typeof peer.call !== 'function') {
                    console.error('peer.call is not a function');
                    updateStatus('PeerJS connection error. Please refresh and try again.', 'error');
                    stopViewing();
                    return;
                }
                
                // Call the screen sharer
                currentCall = peer.call(sessionId, null); // No stream from viewer
                
                if (currentCall) {
                    console.log('Call initiated to sharer:', sessionId);
                    console.log('Call object:', currentCall);
                    
                    // Handle incoming stream from screen sharer
                    currentCall.on('stream', function(remoteStream) {
                        updateStatus('Connected! Receiving screen share...', 'connected');
                        console.log('Received stream from sharer');
                        remoteVideo.srcObject = remoteStream;
                        isViewing = true;
                        
                        viewScreenBtn.textContent = 'Stop Viewing';
                        viewScreenBtn.classList.remove('btn--outline');
                        viewScreenBtn.classList.add('btn--secondary');
                    });
                    
                    // Handle call end
                    currentCall.on('close', function() {
                        updateStatus('Screen share ended');
                        console.log('Call closed by sharer');
                        stopViewing();
                    });
                    
                    // Handle call errors
                    currentCall.on('error', function(err) {
                        console.error('Call error:', err);
                        
                        // Retry if it's a peer-unavailable error and we haven't retried too many times
                        if (err.type === 'peer-unavailable' && retryCount < 3) {
                            console.log(`Retrying call in 2 seconds... (attempt ${retryCount + 1})`);
                            setTimeout(() => {
                                attemptCall(retryCount + 1);
                            }, 2000);
                        } else {
                            updateStatus(`Call failed: ${err.message}`, 'error');
                            stopViewing();
                        }
                    });
                } else {
                    console.error('Failed to create call - peer.call returned null');
                    console.log('Peer state:', {
                        id: peer.id,
                        destroyed: peer.destroyed,
                        disconnected: peer.disconnected
                    });
                    
                    // Check if this might be a session ID issue
                    if (retryCount === 0) {
                        console.log('First attempt failed. This might be because:');
                        console.log('1. The sharer is not actually sharing with this session ID');
                        console.log('2. The session ID is incorrect');
                        console.log('3. The sharer is not connected to the PeerJS server');
                        console.log('4. The PeerJS server is not working properly');
                    }
                    
                    // Retry if we haven't retried too many times
                    if (retryCount < 3) {
                        console.log(`Retrying call in 2 seconds... (attempt ${retryCount + 1})`);
                        setTimeout(() => {
                            attemptCall(retryCount + 1);
                        }, 2000);
                    } else {
                        updateStatus('Failed to create call. Please check that the sharer is active and the session ID is correct.', 'error');
                        stopViewing();
                    }
                }
            } catch (error) {
                console.error('Error creating call:', error);
                
                // Retry if we haven't retried too many times
                if (retryCount < 3) {
                    console.log(`Retrying call in 2 seconds... (attempt ${retryCount + 1})`);
                    setTimeout(() => {
                        attemptCall(retryCount + 1);
                    }, 2000);
                } else {
                    updateStatus(`Call creation error: ${error.message}`, 'error');
                    stopViewing();
                }
            }
        }
        
        // Handle peer errors
        peer.on('error', function(err) {
            console.error('PeerJS error:', err);
            console.log('Error details:', {
                type: err.type,
                message: err.message,
                peer: err.peer
            });
            
            if (err.type === 'peer-unavailable') {
                updateStatus('Screen sharer not found. Please check the session ID.', 'error');
            } else if (err.type === 'network') {
                updateStatus('Network error. Please check your internet connection.', 'error');
            } else if (err.type === 'server-error') {
                updateStatus('PeerJS server error. Please try again later.', 'error');
            } else {
                updateStatus(`Connection error: ${err.message}`, 'error');
            }
            
            stopViewing();
        });
        
        // Handle peer disconnection
        peer.on('disconnected', function() {
            console.log('Viewer peer disconnected');
            updateStatus('Connection lost. Reconnecting...', 'error');
        });
        
        peer.on('reconnected', function() {
            console.log('Viewer peer reconnected');
            updateStatus('Connection restored', 'connected');
        });
        
        // Timeout if connection takes too long
        setTimeout(() => {
            if (!isViewing && peer) {
                updateStatus('Connection timeout. Please try again.', 'error');
                stopViewing();
            }
        }, 10000);
        
    } catch (error) {
        console.error('Error viewing screen:', error);
        updateStatus('Failed to connect to screen share', 'error');
        stopViewing();
    } finally {
        disableButtons(false);
    }
}
/**
 * Stop viewing screen share
 */
function stopViewing() {
    if (currentCall) {
        currentCall.close();
        currentCall = null;
    }
    
    if (peer) {
        peer.destroy();
        peer = null;
    }
    
    remoteVideo.srcObject = null;
    isViewing = false;
    
    viewScreenBtn.textContent = 'View Screen';
    viewScreenBtn.classList.remove('btn--secondary');
    viewScreenBtn.classList.add('btn--outline');
    
    updateStatus('Stopped viewing screen share');
}
/**
 * Update status message with optional styling
 */
function updateStatus(message, type = '') {
    statusDiv.textContent = message;
    
    // Remove all status classes
    statusDiv.classList.remove('connected', 'error', 'waiting');
    
    // Add appropriate class based on type
    if (type) {
        statusDiv.classList.add(type);
    }
    
    console.log('Status:', message);
}
/**
 * Disable/enable buttons during connection attempts
 */
function disableButtons(disabled) {
    generateIdBtn.disabled = disabled;
    
    if (!isSharing) {
        startShareBtn.disabled = disabled;
    }
    
    if (!isViewing) {
        viewScreenBtn.disabled = disabled;
    }
}
/**
 * Clean up connections when page is unloaded
 */
window.addEventListener('beforeunload', function() {
    if (isSharing) {
        stopScreenShare();
    }
    
    if (isViewing) {
        stopViewing();
    }
});

/**
 * Check browser compatibility for screen sharing
 */
function checkBrowserCompatibility() {
    const isHTTPS = location.protocol === 'https:' || location.hostname === 'localhost';
    const hasScreenShare = navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
    const userAgent = navigator.userAgent.toLowerCase();
    
    // More flexible browser detection
    const isChrome = userAgent.includes('chrome') && !userAgent.includes('edg');
    const isFirefox = userAgent.includes('firefox');
    const isSafari = userAgent.includes('safari') && !userAgent.includes('chrome');
    const isEdge = userAgent.includes('edg');
    const isModernBrowser = isChrome || isFirefox || isSafari || isEdge;
    
    console.log('Browser compatibility:', {
        isHTTPS,
        hasScreenShare,
        userAgent: navigator.userAgent,
        isChrome,
        isFirefox,
        isSafari,
        isEdge,
        isModernBrowser
    });
    
    if (!isHTTPS) {
        updateStatus('⚠️ HTTPS required for screen sharing. Please access via HTTPS.', 'warning');
    } else if (!hasScreenShare) {
        updateStatus('⚠️ Screen sharing not supported in this browser. Use Chrome, Firefox, Safari, or Edge.', 'warning');
    } else if (!isModernBrowser) {
        updateStatus('⚠️ For best experience, use Chrome, Firefox, Safari, or Edge.', 'warning');
    } else {
        updateStatus('✅ Browser compatible for screen sharing', 'connected');
    }
}

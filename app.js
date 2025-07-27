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
        
        // Request screen capture
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        
        // Show local stream
        localVideo.srcObject = localStream;
        updateStatus('Screen capture started. Waiting for viewer...', 'waiting');
        
        // Initialize PeerJS connection
        peer = new Peer(sessionId, {
            host: 'YOUR_PUBLIC_IP', // e.g., '203.0.113.10'
            port: 9000,
            path: '/',
            secure: false,
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
                // Add TURN servers here if needed
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
        });
        
        // Handle incoming calls from viewers
        peer.on('call', function(call) {
            updateStatus('Viewer connected! Answering call...', 'waiting');
            
            // Answer the call with our screen stream
            call.answer(localStream);
            currentCall = call;
            
            // Handle call events
            call.on('stream', function(remoteStream) {
                // Viewers don't typically send video back, but handle it just in case
                console.log('Received stream from viewer');
            });
            
            call.on('close', function() {
                updateStatus('Viewer disconnected', 'waiting');
                if (isSharing) {
                    updateStatus(`Still sharing screen with ID: ${sessionIdInput.value}. Waiting for new viewer...`, 'waiting');
                }
            });
            
            updateStatus('Connected to viewer!', 'connected');
        });
        
        // Handle peer errors
        peer.on('error', function(err) {
            console.error('PeerJS error:', err);
            updateStatus(`Connection error: ${err.message}`, 'error');
            stopScreenShare();
        });
        
        // Handle when screen share is stopped by user
        localStream.getVideoTracks()[0].addEventListener('ended', function() {
            updateStatus('Screen sharing stopped by user');
            stopScreenShare();
        });
        
    } catch (error) {
        console.error('Error starting screen share:', error);
        updateStatus('Failed to start screen sharing. Please try again.', 'error');
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
            host: 'YOUR_PUBLIC_IP', // e.g., '203.0.113.10'
            port: 9000,
            path: '/',
            secure: false,
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
                // Add TURN servers here if needed
              ]
            }
        });
        
        // Handle peer connection events
        peer.on('open', function(id) {
            updateStatus(`Calling screen sharer (${sessionId})...`, 'waiting');
            
            // Call the screen sharer
            currentCall = peer.call(sessionId, null); // No stream from viewer
            
            if (currentCall) {
                // Handle incoming stream from screen sharer
                currentCall.on('stream', function(remoteStream) {
                    updateStatus('Connected! Receiving screen share...', 'connected');
                    remoteVideo.srcObject = remoteStream;
                    isViewing = true;
                    
                    viewScreenBtn.textContent = 'Stop Viewing';
                    viewScreenBtn.classList.remove('btn--outline');
                    viewScreenBtn.classList.add('btn--secondary');
                });
                
                // Handle call end
                currentCall.on('close', function() {
                    updateStatus('Screen share ended');
                    stopViewing();
                });
                
                // Handle call errors
                currentCall.on('error', function(err) {
                    console.error('Call error:', err);
                    updateStatus(`Call failed: ${err.message}`, 'error');
                    stopViewing();
                });
            }
        });
        
        // Handle peer errors
        peer.on('error', function(err) {
            console.error('PeerJS error:', err);
            
            if (err.type === 'peer-unavailable') {
                updateStatus('Screen sharer not found. Please check the session ID.', 'error');
            } else {
                updateStatus(`Connection error: ${err.message}`, 'error');
            }
            
            stopViewing();
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

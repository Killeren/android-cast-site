# WebRTC Screen Sharing Application - Production Deployment Guide

This comprehensive guide covers the complete deployment of the WebRTC screen sharing application on an Ubuntu/Debian VM, including all necessary components for production use.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [HTTPS/TLS Certificate Setup](#https-tls-certificate-setup)
4. [Nginx Reverse Proxy Configuration](#nginx-reverse-proxy-configuration)
5. [Firewall Configuration](#firewall-configuration)
6. [TURN Server Setup (coturn)](#turn-server-setup)
7. [Application Deployment](#application-deployment)
8. [SSL Certificate Renewal](#ssl-certificate-renewal)
9. [Production Configuration](#production-configuration)
10. [Health Checks](#health-checks)
11. [Verification Steps](#verification-steps)
12. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04 LTS or Debian 11+
- **RAM**: 2GB minimum (4GB recommended for production)
- **CPU**: 2 cores minimum
- **Storage**: 20GB minimum
- **Network**: Public IP address with DNS A record pointing to your domain

### Domain Requirements
- A registered domain name (e.g., `yourdomain.com`)
- DNS A record pointing to your VM's public IP
- Optional: Subdomain for TURN server (e.g., `turn.yourdomain.com`)

## Server Setup

### 1. Update System
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ufw software-properties-common
```

### 2. Install Node.js (Latest LTS)
```bash
# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 3. Install PM2 for Process Management
```bash
sudo npm install -g pm2

# Configure PM2 to start on boot
sudo pm2 startup systemd -u $USER --hp $HOME
```

### 4. Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

## HTTPS/TLS Certificate Setup

### 1. Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Obtain SSL Certificate
```bash
# Replace yourdomain.com with your actual domain
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

## Nginx Reverse Proxy Configuration

### 1. Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/webrtc-app
```

### 2. Add the following configuration:
```nginx
# HTTP redirect to HTTPS
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # WebSocket proxy settings
    location / {
        proxy_pass http://localhost:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket specific settings
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_connect_timeout 86400;
        
        # Disable buffering for WebSocket
        proxy_buffering off;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:9000/health;
        access_log off;
    }

    # Static file caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 3. Enable the site
```bash
sudo ln -s /etc/nginx/sites-available/webrtc-app /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

## Firewall Configuration

### 1. Configure UFW (Uncomplicated Firewall)
```bash
# Reset UFW to defaults
sudo ufw --force reset

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (adjust port if needed)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow TURN server ports
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
sudo ufw allow 49152:65535/udp  # TURN relay ports

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status verbose
```

## TURN Server Setup (coturn)

### 1. Install coturn
```bash
sudo apt install -y coturn
```

### 2. Configure coturn
```bash
sudo cp /etc/turnserver.conf /etc/turnserver.conf.backup
sudo nano /etc/turnserver.conf
```

### 3. Add the following configuration:
```conf
# TURN server configuration
listening-port=3478
tls-listening-port=5349

# External IP (replace with your actual public IP)
external-ip=YOUR_PUBLIC_IP

# Internal IP (replace with your actual private IP)
listening-ip=YOUR_PRIVATE_IP
relay-ip=YOUR_PRIVATE_IP

# Realm
realm=yourdomain.com

# Authentication
use-auth-secret
static-auth-secret=your-turn-secret-key-here

# SSL certificates (will be created by certbot)
cert=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/yourdomain.com/privkey.pem

# Logging
log-file=/var/log/turn.log
simple-log

# Limits
total-quota=100
bps-capacity=0
stale-nonce

# Relay settings
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.0.0.0-192.0.0.255
denied-peer-ip=192.0.2.0-192.0.2.255
denied-peer-ip=192.88.99.0-192.88.99.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=198.18.0.0-198.19.255.255
denied-peer-ip=198.51.100.0-198.51.100.255
denied-peer-ip=203.0.113.0-203.0.113.255
denied-peer-ip=240.0.0.0-255.255.255.255

# Enable TURN server
sudo systemctl enable coturn
```

### 4. Create systemd service override
```bash
sudo mkdir -p /etc/systemd/system/coturn.service.d
sudo nano /etc/systemd/system/coturn.service.d/override.conf
```

### 5. Add service override:
```ini
[Service]
ExecStart=
ExecStart=/usr/bin/turnserver -c /etc/turnserver.conf --daemon --pidfile /run/turnserver/turnserver.pid --no-stdout-log --simple-log --log-file /var/log/turn.log
```

### 6. Start coturn
```bash
sudo systemctl daemon-reload
sudo systemctl start coturn
sudo systemctl enable coturn
```

## Application Deployment

### 1. Clone and Setup Application
```bash
# Create application directory
mkdir -p ~/webrtc-app
cd ~/webrtc-app

# Copy your application files
# (Assuming you have the files locally)
# Or clone from repository if available
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Create Production Environment File
```bash
nano ~/webrtc-app/.env
```

### 4. Add production configuration:
```bash
# Server Configuration
PORT=9000
NODE_ENV=production

# TURN Server Configuration
TURN_SECRET=your-turn-secret-key-here
TURN_USERNAME=webrtc-user
TURN_PASSWORD=webrtc-pass-123

# Domain Configuration
DOMAIN=yourdomain.com
```

### 5. Update ICE servers configuration
Create `~/webrtc-app/config/production.js`:
```javascript
module.exports = {
    iceServers: {
        iceServers: [
            // Primary STUN servers
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            
            // Production TURN servers
            {
                urls: 'turn:yourdomain.com:3478',
                username: 'webrtc-user',
                credential: 'webrtc-pass-123'
            },
            {
                urls: 'turn:yourdomain.com:3478?transport=tcp',
                username: 'webrtc-user',
                credential: 'webrtc-pass-123'
            },
            {
                urls: 'turns:yourdomain.com:5349',
                username: 'webrtc-user',
                credential: 'webrtc-pass-123'
            },
            {
                urls: 'turns:yourdomain.com:5349?transport=tcp',
                username: 'webrtc-user',
                credential: 'webrtc-pass-123'
            }
        ]
    }
};
```

### 6. Update server.js for production
Add this to your server.js:
```javascript
// Load production config if available
let iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

if (process.env.NODE_ENV === 'production') {
    try {
        const productionConfig = require('./config/production.js');
        iceServers = productionConfig.iceServers;
        console.log('Loaded production ICE servers configuration');
    } catch (error) {
        console.log('Using default ICE servers configuration');
    }
}
```

### 7. Start Application with PM2
```bash
# Start application
pm2 start server.js --name webrtc-app --env production

# Save PM2 process list
pm2 save

# Setup PM2 startup
pm2 startup
```

## SSL Certificate Renewal

### 1. Create renewal hook for coturn
```bash
sudo nano /etc/letsencrypt/renewal-hooks/deploy/coturn-restart
```

### 2. Add renewal script:
```bash
#!/bin/bash
systemctl reload coturn
```

### 3. Make executable:
```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/coturn-restart
```

### 4. Test renewal:
```bash
sudo certbot renew --dry-run
```

## Production Configuration

### 1. Create systemd service for application
```bash
sudo nano /etc/systemd/system/webrtc-app.service
```

### 2. Add service configuration:
```ini
[Unit]
Description=WebRTC Screen Sharing Application
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/webrtc-app
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=9000

[Install]
WantedBy=multi-user.target
```

### 3. Enable and start service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable webrtc-app
sudo systemctl start webrtc-app
```

## Health Checks

### 1. Application Health Check
The application includes built-in health check endpoints:

- **HTTP Health Check**: `https://yourdomain.com/health`
- **WebSocket Test**: `wss://yourdomain.com/` (connect via WebSocket)

### 2. Create monitoring script
```bash
nano ~/monitor-health.sh
```

### 3. Add monitoring script:
```bash
#!/bin/bash
# Health check script for WebRTC app

DOMAIN="yourdomain.com"
LOG_FILE="/var/log/webrtc-health.log"

check_http() {
    response=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN/health)
    if [ $response -eq 200 ]; then
        echo "$(date): HTTP health check OK" >> $LOG_FILE
    else
        echo "$(date): HTTP health check FAILED (status: $response)" >> $LOG_FILE
    fi
}

check_websocket() {
    timeout 5 bash -c "</dev/tcp/$DOMAIN/443" && \
    echo "$(date): WebSocket port accessible" >> $LOG_FILE || \
    echo "$(date): WebSocket port NOT accessible" >> $LOG_FILE
}

check_turn() {
    timeout 5 bash -c "</dev/tcp/$DOMAIN/3478" && \
    echo "$(date): TURN server accessible" >> $LOG_FILE || \
    echo "$(date): TURN server NOT accessible" >> $LOG_FILE
}

# Run checks
check_http
check_websocket
check_turn
```

### 4. Make executable and add to cron:
```bash
chmod +x ~/monitor-health.sh
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/ubuntu/monitor-health.sh") | crontab -
```

## Verification Steps

### 1. Check all services
```bash
# Check application
sudo systemctl status webrtc-app
pm2 status

# Check nginx
sudo systemctl status nginx
sudo nginx -t

# Check coturn
sudo systemctl status coturn
sudo netstat -tulnp | grep turnserver

# Check firewall
sudo ufw status verbose
```

### 2. Test connectivity
```bash
# Test HTTP
curl -I https://yourdomain.com/health

# Test WebSocket
wscat -c wss://yourdomain.com

# Test TURN server
turnutils_uclient -u webrtc-user -w webrtc-pass-123 yourdomain.com
```

### 3. Browser testing
1. Open `https://yourdomain.com` in browser
2. Check browser console for any errors
3. Test screen sharing functionality
4. Verify WebRTC connection establishment

### 4. Network testing
```bash
# Test from external network
curl -I https://yourdomain.com/health

# Test TURN server connectivity
nmap -p 3478,5349 yourdomain.com
```

## Troubleshooting

### Common Issues and Solutions

#### 1. WebRTC Connection Failed
- **Check TURN server**: Ensure coturn is running and accessible
- **Verify firewall**: Confirm ports 3478/5349 are open
- **Check ICE servers**: Verify TURN credentials in client configuration

#### 2. SSL Certificate Issues
- **Renew certificates**: `sudo certbot renew --force-renewal`
- **Check certificate validity**: `openssl x509 -in /etc/letsencrypt/live/yourdomain.com/cert.pem -text -noout`

#### 3. WebSocket Connection Issues
- **Check nginx configuration**: Ensure WebSocket upgrade headers are properly configured
- **Verify application logs**: `pm2 logs webrtc-app`

#### 4. Screen Sharing Not Working
- **HTTPS requirement**: Ensure site is accessed via HTTPS
- **Browser permissions**: Check browser screen sharing permissions
- **Check browser console**: Look for any JavaScript errors

### Log Locations
- **Application logs**: `pm2 logs webrtc-app`
- **Nginx logs**: `/var/log/nginx/`
- **TURN logs**: `/var/log/turn.log`
- **System logs**: `journalctl -u webrtc-app`

### Performance Monitoring
```bash
# Monitor system resources
htop

# Monitor network connections
ss -tulnp

# Monitor TURN server
sudo tail -f /var/log/turn.log
```

## Security Considerations

1. **Regular Updates**: Keep system packages updated
2. **Firewall**: Only open necessary ports
3. **SSL**: Use strong SSL configuration
4. **Authentication**: Implement proper authentication for TURN server
5. **Rate Limiting**: Consider implementing rate limiting in nginx
6. **Monitoring**: Set up alerts for service failures

## Backup Strategy

1. **SSL Certificates**: Backup `/etc/letsencrypt/`
2. **Application**: Backup application directory
3. **Configuration**: Backup nginx and coturn configurations
4. **Logs**: Implement log rotation

## Next Steps

1. Set up monitoring (Prometheus/Grafana)
2. Implement user authentication
3. Add session management
4. Set up CDN for static assets
5. Implement rate limiting
6. Add analytics and usage tracking

---

**Note**: Replace `yourdomain.com`, `YOUR_PUBLIC_IP`, and `YOUR_PRIVATE_IP` with your actual values throughout this guide.
# GCP Deployment Guide

## Prerequisites
- Google Cloud Platform account
- Node.js 16+ installed on your GCP instance
- Domain name (optional but recommended)

## Step 1: Set up GCP Instance

1. Create a Compute Engine instance:
   ```bash
   gcloud compute instances create webrtc-server \
     --zone=us-central1-a \
     --machine-type=e2-medium \
     --image-family=debian-11 \
     --image-project=debian-cloud \
     --tags=http-server,https-server
   ```

2. Create firewall rules:
   ```bash
   gcloud compute firewall-rules create allow-webrtc \
     --allow tcp:80,tcp:443,tcp:9000 \
     --target-tags=http-server \
     --source-ranges=0.0.0.0/0
   ```

## Step 2: Install Dependencies

SSH into your instance and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Clone your repository
git clone https://github.com/Killeren/android-cast-site.git
cd android-cast-site

# Install dependencies
npm install
```

## Step 3: Configure the Application

1. Update the TURN server configuration in `app.js` with your GCP instance's external IP:
   ```javascript
   // Replace 35.200.221.49 with your actual GCP instance IP
   {
     urls: 'turn:YOUR_GCP_IP:3478?transport=tcp',
     username: 'peeruser',
     credential: 'peerpass123'
   }
   ```

2. Set up a TURN server (optional but recommended for NAT traversal):
   ```bash
   # Install coturn
   sudo apt install coturn

   # Configure coturn
   sudo nano /etc/turnserver.conf
   ```

   Add this configuration:
   ```
   listening-port=3478
   external-ip=YOUR_GCP_IP
   realm=your-domain.com
   server-name=your-domain.com
   user-quota=12
   total-quota=1200
   authentication-method=long-term
   user=peeruser:peerpass123
   ```

## Step 4: Deploy with PM2

```bash
# Start the application with PM2
pm2 start server.js --name "webrtc-app"

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
```

## Step 5: Set up HTTPS (Recommended)

1. Install Certbot:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. Install Nginx:
   ```bash
   sudo apt install nginx
   ```

3. Configure Nginx:
   ```bash
   sudo nano /etc/nginx/sites-available/webrtc
   ```

   Add this configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:9000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

4. Enable the site and get SSL certificate:
   ```bash
   sudo ln -s /etc/nginx/sites-available/webrtc /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   sudo certbot --nginx -d your-domain.com
   ```

## Step 6: Test the Application

1. Open your browser and navigate to `https://your-domain.com`
2. Generate a session ID on one browser
3. Try to view the screen from another browser using the same session ID

## Troubleshooting

### Common Issues:

1. **Connection fails between browsers**:
   - Check that your TURN server is running: `sudo systemctl status coturn`
   - Verify firewall rules allow traffic on port 3478
   - Check browser console for WebRTC errors

2. **PeerJS connection issues**:
   - Ensure the PeerJS server is running: `pm2 status`
   - Check logs: `pm2 logs webrtc-app`
   - Verify the `/peerjs` endpoint is accessible

3. **HTTPS issues**:
   - WebRTC requires HTTPS in production
   - Check SSL certificate: `sudo certbot certificates`
   - Verify Nginx configuration: `sudo nginx -t`

### Debug Commands:

```bash
# Check application status
pm2 status
pm2 logs webrtc-app

# Check TURN server
sudo systemctl status coturn
sudo netstat -tlnp | grep 3478

# Check firewall
sudo ufw status
gcloud compute firewall-rules list

# Test connectivity
curl -I http://localhost:9000/health
```

## Security Considerations

1. **Firewall**: Only open necessary ports (80, 443, 3478)
2. **TURN credentials**: Use strong, unique credentials
3. **HTTPS**: Always use HTTPS in production
4. **Rate limiting**: Consider implementing rate limiting for the PeerJS server
5. **Monitoring**: Set up monitoring for your application

## Performance Optimization

1. **Load balancing**: For high traffic, consider using a load balancer
2. **CDN**: Use a CDN for static assets
3. **Caching**: Implement caching for static files
4. **Monitoring**: Use Google Cloud Monitoring to track performance 
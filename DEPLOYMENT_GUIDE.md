# Deployment Guide for WebRTC Screen Sharing App

This guide covers deploying your WebRTC application to both Firebase Hosting and Google Cloud Platform (GCP).

## Option 1: Firebase Hosting (Recommended)

Firebase Hosting is the easiest option since you're already using Firebase for signaling.

### Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Step 2: Login to Firebase

```bash
firebase login
```

### Step 3: Initialize Firebase (if not already done)

```bash
firebase init hosting
```

When prompted:
- Choose "Use an existing project"
- Select your project: `my-webrtc-app-charan`
- Public directory: `.` (current directory)
- Configure as single-page app: `Yes`
- Don't overwrite index.html: `No`

### Step 4: Deploy to Firebase

```bash
firebase deploy
```

Your app will be available at: `https://my-webrtc-app-charan.web.app`

### Step 5: Set up Custom Domain (Optional)

1. Go to Firebase Console > Hosting
2. Click "Add custom domain"
3. Follow the DNS configuration instructions

## Option 2: Google Cloud Platform (GCP)

### Method A: App Engine (Recommended for GCP)

#### Step 1: Create app.yaml

Create a file called `app.yaml` in your project root:

```yaml
runtime: nodejs18
service: webrtc-app

handlers:
  - url: /static
    static_dir: .
    secure: always
    
  - url: /.*
    script: auto
    secure: always

env_variables:
  NODE_ENV: production
  PORT: 8080
```

#### Step 2: Install Google Cloud CLI

```bash
# Download and install from: https://cloud.google.com/sdk/docs/install
gcloud init
```

#### Step 3: Deploy to App Engine

```bash
gcloud app deploy
```

### Method B: Compute Engine VM

#### Step 1: Create VM Instance

```bash
gcloud compute instances create webrtc-app \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=debian-11 \
  --image-project=debian-cloud \
  --tags=http-server,https-server
```

#### Step 2: Set up Firewall Rules

```bash
gcloud compute firewall-rules create allow-http \
  --allow tcp:80 \
  --target-tags=http-server \
  --description="Allow HTTP traffic"

gcloud compute firewall-rules create allow-https \
  --allow tcp:443 \
  --target-tags=https-server \
  --description="Allow HTTPS traffic"
```

#### Step 3: SSH into VM and Deploy

```bash
gcloud compute ssh webrtc-app --zone=us-central1-a
```

Then on the VM:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone your repository
git clone https://github.com/Killeren/android-cast-site.git
cd android-cast-site

# Install dependencies
npm install

# Start with PM2
pm2 start server.js --name webrtc-app
pm2 startup
pm2 save
```

### Method C: Cloud Run (Serverless)

#### Step 1: Create Dockerfile

Create a file called `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8080

CMD ["npm", "start"]
```

#### Step 2: Deploy to Cloud Run

```bash
# Build and deploy
gcloud run deploy webrtc-app \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

## Option 3: Traditional Web Hosting

If you have a traditional web hosting service:

1. Upload all files to your web server
2. Ensure HTTPS is enabled
3. Configure your domain to point to the hosting
4. Make sure your Firebase project is set up correctly

## Post-Deployment Steps

### 1. Set up Firestore Security Rules

In your Firebase Console, go to Firestore Database > Rules and update:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /castSessions/{sessionId} {
      allow read, write: if true; // For development
    }
    match /castSessions/{sessionId}/{document=**} {
      allow read, write: if true; // For development
    }
  }
}
```

### 2. Enable HTTPS (Required for WebRTC)

- **Firebase Hosting**: HTTPS is automatically enabled
- **App Engine**: HTTPS is automatically enabled
- **Compute Engine**: Set up SSL certificate
- **Cloud Run**: HTTPS is automatically enabled

### 3. Test Your Deployment

1. Open your deployed URL
2. Generate a session ID
3. Share your screen
4. Open another browser/device and join the session
5. Verify screen sharing works

## Environment Variables

For production, you might want to set environment variables:

```bash
# For Compute Engine or App Engine
export NODE_ENV=production
export PORT=8080
```

## Monitoring and Maintenance

### Firebase Hosting
- Monitor usage in Firebase Console
- Set up custom domain if needed
- Enable analytics for insights

### GCP
- Use Cloud Monitoring for App Engine/Cloud Run
- Set up alerts for Compute Engine
- Monitor costs in Cloud Console

## Troubleshooting

### Common Issues:

1. **"Firebase not initialized"**: Check your Firebase configuration
2. **"Permission denied"**: Verify Firestore security rules
3. **"HTTPS required"**: Ensure your deployment uses HTTPS
4. **"CORS errors"**: Check domain configuration in Firebase Console

### Debug Steps:

1. Check browser console for errors
2. Verify Firebase project settings
3. Test locally before deploying
4. Check deployment logs

## Cost Optimization

### Firebase Hosting:
- Free tier: 10GB storage, 360MB/day transfer
- Paid: $0.026/GB storage, $0.15/GB transfer

### GCP:
- App Engine: Free tier available
- Cloud Run: Pay per request
- Compute Engine: Pay for VM usage

## Security Best Practices

1. **Enable HTTPS** on all deployments
2. **Set up proper Firestore rules** for production
3. **Use environment variables** for sensitive data
4. **Regular security updates** for dependencies
5. **Monitor access logs** for suspicious activity

## Quick Commands Summary

### Firebase Hosting:
```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

### GCP App Engine:
```bash
gcloud app deploy
```

### GCP Cloud Run:
```bash
gcloud run deploy webrtc-app --source .
```

### GCP Compute Engine:
```bash
gcloud compute instances create webrtc-app --zone=us-central1-a
gcloud compute ssh webrtc-app --zone=us-central1-a
```

Choose the deployment method that best fits your needs and budget! 
// Firebase configuration for WebRTC signaling
// Replace with your actual Firebase project configuration

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

export { db }; 
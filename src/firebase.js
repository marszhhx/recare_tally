import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
// Replace with your actual Firebase config from the Firebase Console
const firebaseConfig = {
  apiKey: 'AIzaSyB2C2N-YtRhtDjarFH1aIINF2F8XtV_13o',
  authDomain: 'recare-tally.firebaseapp.com',
  projectId: 'recare-tally',
  storageBucket: 'recare-tally.firebasestorage.app',
  messagingSenderId: '909249479741',
  appId: '1:909249479741:web:c9818f2f14da86ef9d9654',
  measurementId: 'G-TPZDSYL2L1',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };

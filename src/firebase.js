// src/firebase.js
import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyASaRiykF8Hpcn2ssQ2wfNRGKb6UPMeHRU",
  authDomain: "option-dashboard-data.firebaseapp.com",
  projectId: "option-dashboard-data",
  storageBucket: "option-dashboard-data.firebasestorage.app",
  messagingSenderId: "653555280833",
  appId: "1:653555280833:web:b4c741b22aa2943a28dd40"
};

const app = initializeApp(firebaseConfig);
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
if (appCheckSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
export const functions = getFunctions(app, "us-central1");
export const db = getFirestore(app);

console.log("Firebase initialized for project:", firebaseConfig.projectId);

import "./firebase"; // ensure initializeApp runs first
import {
  getAuth,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signOut
} from "firebase/auth";

import { startSync, stopSync } from "./sync/runSync";

const auth = getAuth();
const googleProvider = new GoogleAuthProvider();

export function startAuth(onReady) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("Signed in as", user.uid, user.email);

      // Start background sync for this user
      startSync(user.uid);

      // Fire the UI callback
      if (typeof onReady === "function") onReady(user);
    } else {
      // Stop any running sync when there's no authenticated user
      stopSync();

      console.log("No user signed in, signing in anonymously…");
      await signInAnonymously(auth);
    }
  });
}

export async function signInWithGooglePopup() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("Google sign-in success", result.user.uid, result.user.email);
    return result.user;
  } catch (err) {
    console.error("Google sign-in popup failed:", err);
    throw err;
  }
}

export async function signInWithGoogleRedirect() {
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (err) {
    console.error("Google sign-in redirect failed:", err);
    throw err;
  }
}

export async function signOutUser() {
  try {
    // stop sync proactively on explicit sign-out
    stopSync();
    await signOut(auth);
    console.log("Signed out");
  } catch (err) {
    console.error("Sign out failed:", err);
  }
}

export { auth, googleProvider };

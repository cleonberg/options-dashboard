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

import { stopSync } from "./sync/runSync";

const auth = getAuth();
const googleProvider = new GoogleAuthProvider();

export function startAuth(onReady) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("Signed in as", user.uid, user.email);
      if (typeof onReady === "function") onReady(user);
      return;
    }

    console.log("No user signed in, signing in anonymously…");
    if (typeof onReady === "function") onReady(null);

    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.error("Anonymous sign-in failed:", err);
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
    stopSync();
    await signOut(auth);
    console.log("Signed out");
  } catch (err) {
    console.error("Sign out failed:", err);
  }
}

export { auth, googleProvider };
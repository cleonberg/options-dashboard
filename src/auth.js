import "./firebase"; // ensure initializeApp runs first
import { getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from "firebase/auth";

const auth = getAuth();
const googleProvider = new GoogleAuthProvider();

// Optional: request additional scopes
// googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');

export function startAuth(onReady) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("Signed in as", user.uid, user.email);

      // Fire the UI callback
      if (typeof onReady === "function") onReady(user);

    } else {
      console.log("No user signed in, signing in anonymously…");
      await signInAnonymously(auth);
    }
  });
}

export async function signInWithGooglePopup() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    // result.user contains the signed-in user
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
    // After redirect, onAuthStateChanged will fire with the user
  } catch (err) {
    console.error("Google sign-in redirect failed:", err);
    throw err;
  }
}

export async function signOutUser() {
  try {
    await signOut(auth);
    console.log("Signed out");
  } catch (err) {
    console.error("Sign out failed:", err);
  }
}

export { auth, googleProvider };

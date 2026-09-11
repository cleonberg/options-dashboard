import React from "react";
import { signInWithGooglePopup, signInWithGoogleRedirect, signOutUser } from "../auth";

export default function GoogleSignIn({ useRedirect = false }) {
  return (
    <div className = "button-group">
      <button onClick={() => (useRedirect ? signInWithGoogleRedirect() : signInWithGooglePopup())}>
        Sign in with Google
      </button>
      <button onClick={() => signOutUser()}>Sign out</button>
    </div>
  );
}

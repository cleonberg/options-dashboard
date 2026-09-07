import { auth, googleProvider } from "../auth.js";
import { signInWithPopup, signInAnonymously } from "firebase/auth";

export default function Header() {
  const user = auth.currentUser;

  async function signIn() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Sign-in failed:", err);
    }
  }

  async function signInAnon() {
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.error("Anonymous sign-in failed:", err);
    }
  }

  return (
    <div className="app-header">
      <div className="header-left">
        <h2>Options Dashboard</h2>
      </div>

      <div className="header-right">
        {!user && (
          <div className="user-info">
            <span className="offline-status">Not signed in</span>
            <button className="signout-btn" onClick={signIn}>
              Sign in
            </button>
            <button className="signout-btn" onClick={signInAnon}>
              Anonymous
            </button>
          </div>
        )}

        {user && user.isAnonymous && (
          <div className="user-info">
            {/* <span className="online-dot"></span> */}
            {/* <span className="user-email">Anonymous User</span> */}
            <button className="signout-btn" onClick={signIn}>
              Sign-in
            </button>
            {/* <button className="signout-btn" onClick={() => auth.signOut()}> */}
              {/* Sign out */}
            {/* </button> */}
          </div>
        )}

        {user && !user.isAnonymous && (
          <div className="user-info">
            <span className="online-dot"></span>
            <span className="user-email">{user.email}</span>
            <button className="signout-btn" onClick={() => auth.signOut()}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

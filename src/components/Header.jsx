import { auth, googleProvider, signInWithGooglePopup, signOutUser } from "../auth.js";
import { useState } from "react";

export default function Header({ syncStatus, lastSync, dirtyCount, syncNow }) {
  const user = auth.currentUser;
  const [open, setOpen] = useState(false);

  function toggleMenu() {
    setOpen(!open);
  }

  return (
    <div className="app-header">
        <div className="header-left">
            <h2>Options Dashboard</h2>
        </div>

        <div className="header-right">

            {/* Sync Now stays visible */}
            <button className="sync-btn" onClick={syncNow}>
                Sync Now
            </button>

            {/* User Dropdown */}
            <div className="user-dropdown">
                <div className="user-trigger" onClick={toggleMenu}>
                <span className="online-dot"></span>
                <span className="user-email">
                    {user
                    ? user.isAnonymous
                        ? "Anonymous User"
                        : user.email
                    : "Not signed in"}
                </span>
                <span className="caret">▾</span>
                </div>

                {open && (
                <div className="dropdown-menu">

                    {/* Sync info inside dropdown */}
                    <div className="dropdown-section">
                    <div className="dropdown-label">Sync Status</div>
                    <div>{syncStatus === "syncing" && "⟳ Syncing…"}</div>
                    <div>{syncStatus === "synced" && "✔ Synced"}</div>
                    <div>{syncStatus === "pending" && "⚠ Pending"}</div>
                    <div>Dirty: {dirtyCount}</div>
                    {lastSync && <div>Last sync: {lastSync.toLocaleTimeString()}</div>}
                    </div>
                    {/* Auth options */}
                    {!user && (
                    <>
                        <button onClick={signInWithGooglePopup}>Sign in with Google</button>
                        <button onClick={() => auth.signInAnonymously()}>
                        Anonymous Sign-in
                        </button>
                    </>
                    )}

                    {user && user.isAnonymous && (
                    <>
                        <button onClick={signInWithGooglePopup}>Upgrade to Google</button>
                        <button onClick={signOutUser}>Sign out</button>
                    </>
                    )}

                    {user && !user.isAnonymous && (
                    <>
                        <div className="dropdown-email">{user.email}</div>
                        <button onClick={signOutUser}>Sign out</button>
                    </>
                    )}
                </div>
                )}
            </div>
            </div>

    </div>
  );
}

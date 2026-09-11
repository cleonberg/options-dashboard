import { auth, googleProvider, signInWithGooglePopup, signOutUser } from "../auth.js";
import { useState } from "react";

export default function Header({ syncStatus, lastSync, dirtyCount, syncNow }) {
  const user = auth.currentUser;
  const [open, setOpen] = useState(false);

  function toggleMenu() {
    setOpen(!open);
  }

  const handleSyncClick = () => {
    if (typeof syncNow === "function") {
      syncNow();
    }
    setOpen(false); // Closes the dropdown after clicking sync
  };

  return (
    <div className="app-header">
      <div className="header-left">
        <h2>Options Dashboard</h2>
      </div>

      <div className="header-right">
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

                {/* Sync Now button placed right below the status details */}
                <button 
                  style={{ marginTop: "8px", width: "100%" }}
                  onClick={handleSyncClick}
                >
                  Sync Now
                </button>
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
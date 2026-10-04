import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
    auth,
    signInWithGooglePopup,
    signOutUser
} from "../auth.js";
import logo from "../assets/pwa-192x192.png";

export default function Header({
    syncStatus,
    lastSync,
    dirtyCount,
    syncNow,
    setActiveTab,
}) {
    const [user, setUser] = useState(auth.currentUser);
    const [open, setOpen] = useState(false);

    useEffect(() => onAuthStateChanged(auth, setUser), []);

    const accountName = user
        ? user.isAnonymous
            ? "Anonymous User"
            : user.displayName?.trim() ||
              user.email?.split("@")[0] ||
              "Google User"
        : "Not signed in";

    const avatarInitial = accountName.charAt(0).toUpperCase();

    const handleSyncClick = () => {
        if (typeof syncNow === "function") {
            syncNow();
        }
        setOpen(false);
    };

    const handleAnonymousSignIn = () => {
        signInAnonymously(auth).catch((error) => {
            console.error("Anonymous sign-in failed:", error);
        });
        setOpen(false);
    };

    const handleSignOut = () => {
        setOpen(false);
        signOutUser();
    };

    return (
        <header className="app-header">
            <div className="header-left">
                <img src={logo} alt="" aria-hidden="true" />
                <h2>ThetaTracker</h2>
            </div>

            <div className="header-right">
                <div className="user-dropdown">
                    <button
                        type="button"
                        className="user-trigger"
                        onClick={() => setOpen((isOpen) => !isOpen)}
                        aria-label={`Account: ${accountName}`}
                        aria-expanded={open}
                        aria-controls="account-menu"
                        title={accountName}
                    >
                        <span className="user-avatar" aria-hidden="true">
                          {avatarInitial}
                        </span>
                        <span className="user-name">{accountName}</span>
                        <span className="caret" aria-hidden="true">▾</span>
                    </button>

                    {open && (
                        <div className="dropdown-menu" id="account-menu">
                            <div className="dropdown-section">
                                <div className="dropdown-label">
                                    {accountName}
                                </div>
                                {user?.email && (
                                    <div className="dropdown-email">
                                        {user.email}
                                    </div>
                                )}
                            </div>

                            <div className="dropdown-section">
                                <div className="dropdown-label">Sync Status</div>
                                <div>
                                    {syncStatus === "syncing" && "⟳ Syncing…"}
                                </div>
                                <div>
                                    {syncStatus === "synced" && "✔ Synced"}
                                </div>
                                <div>
                                    {syncStatus === "pending" && "⚠ Pending"}
                                </div>
                                <div>Dirty: {dirtyCount}</div>
                                {lastSync && (
                                    <div>
                                        Last sync: {lastSync.toLocaleTimeString()}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    className="sync-now-button"
                                    onClick={handleSyncClick}
                                >
                                    Sync Now
                                </button>
                            </div>

                            <button
                              type="button"
                              className="settings-menu-item"
                              onClick={() => {
                                setActiveTab("settings");
                                setOpen(false);
                              }}
                            >
                              Settings
                            </button>

                            {!user && (
                                <>
                                    <button
                                        type="button"
                                        onClick={signInWithGooglePopup}
                                    >
                                        Sign in with Google
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAnonymousSignIn}
                                    >
                                        Anonymous Sign-in
                                    </button>
                                </>
                            )}

                            {user?.isAnonymous && (
                                <>
                                    <button
                                        type="button"
                                        onClick={signInWithGooglePopup}
                                    >
                                        Upgrade to Google
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSignOut}
                                    >
                                        Sign out
                                    </button>
                                </>
                            )}

                            {user && !user.isAnonymous && (
                                <button
                                    type="button"
                                    onClick={handleSignOut}
                                >
                                    Sign out
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
import { auth } from "../auth.js";

export default function Header() {
  const user = auth.currentUser;

  return (
    <div className="app-header">
      <div className="header-left">
        <h2>Options Dashboard</h2>
      </div>

      <div className="header-right">
        {user ? (
          <div className="user-info">
            <span className="online-dot"></span>
            <span className="user-email">{user.email}</span>
            <button
              className="signout-btn"
              onClick={() => auth.signOut()}
            >
              Sign out
            </button>
          </div>
        ) : (
          <span className="offline-status">Not signed in</span>
        )}
      </div>
    </div>
  );
}

import React from "react";

const RECOVERY_KEY = "app-recovery-attempt";
const MAX_RECOVERY_ATTEMPTS = 1;

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] caught error", error, info);

    const attempts = Number(sessionStorage.getItem(RECOVERY_KEY) || 0);

    if (attempts < MAX_RECOVERY_ATTEMPTS) {
      sessionStorage.setItem(RECOVERY_KEY, String(attempts + 1));

      setTimeout(() => {
        window.location.reload();
      }, 250);
    } else {
      sessionStorage.removeItem(RECOVERY_KEY);
    }
  }

  componentDidMount() {
    sessionStorage.removeItem(RECOVERY_KEY);
  }

  render() {
    if (this.state.error) {
      const attempts = Number(
        sessionStorage.getItem(RECOVERY_KEY) || 0
      );

      if (attempts <= MAX_RECOVERY_ATTEMPTS) {
        return <div className="card">Recovering…</div>;
      }

      return (
        <div className="card" style={{ margin: "24px", textAlign: "center" }}>
          <p>Something went wrong loading the app.</p>
          <button onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
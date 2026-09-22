import React from "react";

// Catches render-time errors (e.g. useLiveQuery rethrows when IndexedDB
// closes after the PWA is backgrounded) so the app shows a recoverable
// screen instead of going blank.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] caught error", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ margin: "24px", textAlign: "center" }}>
          <p>Something went wrong loading the app.</p>
          <button onClick={this.handleReload}>Reload</button>
        </div>
      );
    }

    return this.props.children;
  }
}

import React from "react";

export default function TabBar({ activeTab, setActiveTab }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "trades", label: "Trades" },
    { id: "account", label: "Accounts" },
    { id: "settings", label: "Settings" }
  ];

  return (
    <div className="tabs">
      {tabs.map(t => (
        <button
          key={t.id}
          data-tab-id={t.id}
          className={`tab-button ${activeTab === t.id ? "active" : ""}`}
          onClick={() => setActiveTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

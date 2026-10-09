import React from "react";

const BADGE_COLORS = [
  { background: "#1e3a8a", border: "#60a5fa" },
  { background: "#14532d", border: "#4ade80" },
  { background: "#713f12", border: "#facc15" },
  { background: "#701a75", border: "#e879f9" },
  { background: "#7f1d1d", border: "#f87171" },
  { background: "#164e63", border: "#22d3ee" },
  { background: "#4c1d95", border: "#a78bfa" },
  { background: "#365314", border: "#a3e635" },
];

function getAccountInitials(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => Array.from(word)[0])
      .join("")
      .toUpperCase();
  }

  return Array.from(words[0] || "?")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getStableColorIndex(id) {
  let hash = 0;
  for (const character of String(id)) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash % BADGE_COLORS.length;
}

export default function CampaignAccountBadge({ account, accountId }) {
  const accountName = account?.name || (
    account ? "Unnamed account" : accountId ? "Unknown account" : "Unassigned"
  );
  const initials = account
    ? getAccountInitials(accountName)
    : accountId
      ? "?"
      : "—";
  const color = account
    ? BADGE_COLORS[getStableColorIndex(account.id)]
    : { background: "#334155", border: "#94a3b8" };

  return (
    <span
      className="campaign-account-badge"
      role="img"
      aria-label={`Account: ${accountName}`}
      title={accountName}
      style={{
        backgroundColor: color.background,
        borderColor: color.border,
      }}
    >
      {initials}
    </span>
  );
}

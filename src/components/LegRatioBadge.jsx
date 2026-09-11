import React from "react";

export default function LegRatioBadge({ legs }) {
  if (!legs || legs.length === 0) return null;
  const closedCount = legs.filter(l => !l.isOpen).length;
  const totalCount = legs.length;

  return (
    <span className="leg-ratio-badge">
      {closedCount}/{totalCount} Closed
    </span>
  );
}
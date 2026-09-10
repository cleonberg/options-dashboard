import React from "react";
import LegRow from "./LegRow.jsx";

export default function LegTable({ legs, uid, reloadAll }) {
  return (
    <div className="leg-list">
      {legs.map(leg => (
        <LegRow
          key={leg.id}
          leg={leg}
          uid={uid}
          reloadAll={reloadAll}
        />
      ))}
    </div>
  );
}

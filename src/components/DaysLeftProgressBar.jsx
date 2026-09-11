import React from "react";

export default function DaysLeftProgressBar({ daysLeft, maxDays = 45 }) {
  if (daysLeft == null || isNaN(daysLeft)) return <span>-</span>;

  const validDays = Math.max(0, daysLeft);
  const percentage = Math.min(100, Math.max(0, (validDays / maxDays) * 100));

  let colorClass = "progress-normal";
  if (validDays <= 7) {
    colorClass = "progress-danger";
  } else if (validDays <= 21) {
    colorClass = "progress-warning";
  }

  return (
    <div className="progress-container">
      <div className="progress-bar-wrapper">
        <div
          className={`progress-bar-fill ${colorClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span style={{ fontSize: "12px", minWidth: "42px", fontWeight: 500 }}>
        {daysLeft <= 0 ? "Expired" : `${daysLeft}d`}
      </span>
    </div>
  );
}
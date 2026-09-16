// DurationProgressBar.jsx
import React from "react";

export default function DurationProgressBar({ durationDays }) {
  // Choose a baseline max duration for full bar width (e.g., 45 days).
  const maxDaysBenchmark = 45; 
  const percentage = Math.min(100, Math.max(5, (durationDays / maxDaysBenchmark) * 100));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
        <span style={{ fontWeight: "500", color: "#9fb3ff" }}>
          {durationDays} {durationDays === 1 ? "day" : "days"}
        </span>
      </div>
      <div 
        style={{ 
          width: "100%", 
          height: "6px", 
          backgroundColor: "rgba(255, 255, 255, 0.1)", 
          borderRadius: "3px",
          overflow: "hidden" 
        }}
      >
        <div 
          style={{ 
            width: `${percentage}%`, 
            height: "100%", 
            backgroundColor: "#38bdf8", 
            borderRadius: "3px",
            transition: "width 0.3s ease" 
          }} 
        />
      </div>
    </div>
  );
}
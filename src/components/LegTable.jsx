// LegTable.jsx
import React from "react"; 
import LegRow from "./LegRow.jsx";

export default function LegTable({ legs, campaigns = [], uid, reloadAll }) { 
  return ( 
    <div className="leg-list"> 
      {legs.map(leg => ( 
        <LegRow 
          key={leg.id} 
          leg={leg} 
          campaigns={campaigns} // ⭐ NEW: Pass down to LegRow
          uid={uid} 
          reloadAll={reloadAll} 
        /> 
      ))} 
    </div> 
  ); 
}
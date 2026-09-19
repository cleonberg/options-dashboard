import React, { useState } from "react";

// Helper: Get local YYYY-MM-DD date without UTC timezone rollover
const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function LegForm({ selectedCampaign, onAddLeg }) {
  const [type, setType] = useState("sell_put");
  const [qty, setQty] = useState("");
  const [strike, setStrike] = useState("");
  const [expiry, setExpiry] = useState("");
  const [openPrice, setOpenPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [openDate, setOpenDate] = useState(getLocalDateStr());

  if (!selectedCampaign) {
    return <div className="card">No campaign selected.</div>;
  }

  const isOption = !type.includes("stock");

  async function submit(e) {
    e.preventDefault();

    if (!qty || !openPrice || (isOption && (!strike || !expiry))) {
      alert("Please complete all required fields.");
      return;
    }

    const leg = {
      campaignId: selectedCampaign.id,
      ticker: selectedCampaign.ticker,
      type,
      qty: Number(qty),
      strike: isOption ? Number(strike) : null,
      expiry: isOption ? expiry : null,
      openPrice: Number(openPrice),
      closePrice: null,
      closeDate: null,
      isOpen: true,
      notes,
      openDate, // FIXED: Passes clean YYYY-MM-DD string consistently
    };

    await onAddLeg(leg);

    // Reset form
    setQty("");
    setStrike("");
    setExpiry("");
    setOpenPrice("");
    setNotes("");
    setOpenDate(getLocalDateStr());
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Add Leg</h3>

      <div className="form-row">
        <select
          className="input"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="sell_call">Sell Call</option>
          <option value="sell_put">Sell Put</option>
          <option value="buy_call">Buy Call</option>
          <option value="buy_put">Buy Put</option>
          <option value="buy_stock">Buy Stock</option>
          <option value="sell_stock">Sell Stock</option>
          <option value="assignment_put">Assignment (Put)</option>
          <option value="assignment_call">Assignment (Call)</option>
        </select>

        <input
          className="input"
          placeholder="Qty"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />

        {isOption && (
          <>
            <input
              className="input"
              placeholder="Strike"
              value={strike}
              onChange={(e) => setStrike(e.target.value)}
            />

            <input
              className="input"
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </>
        )}

        <input
          className="input"
          placeholder="Open price"
          value={openPrice}
          onChange={(e) => setOpenPrice(e.target.value)}
        />
      </div>

      <div className="form-row">
        <input
          className="input"
          type="date"
          value={openDate}
          onChange={(e) => setOpenDate(e.target.value)}
        />

        <input
          className="input"
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <button type="submit">Add Leg</button>
    </form>
  );
}
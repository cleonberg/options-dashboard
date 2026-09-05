import React, { useState } from "react";

export default function LegForm({ selectedCampaign, onAddLeg }) {
  const [type, setType] = useState("sell_put");
  const [qty, setQty] = useState("");
  const [strike, setStrike] = useState("");
  const [expiry, setExpiry] = useState("");
  const [openPrice, setOpenPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [openDate, setOpenDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  if (!selectedCampaign) {
    return <div className="card">No campaign selected.</div>;
  }

  async function submit(e) {
    if (!qty || !strike || !expiry || !openPrice) {
      alert("Please complete all fields before adding a leg.");
      return;
    }

    e.preventDefault();

    const leg = {
      campaignId: selectedCampaign.id,
      ticker: selectedCampaign.ticker,
      type,
      qty: Number(qty),
      strike,
      expiry,
      openPrice: Number(openPrice),
      closePrice: 0,
      isOpen: true,
      notes,
      openDate: openDate ? new Date(openDate).toISOString() : new Date().toISOString(),
      closeDate: null
    };

    await onAddLeg(leg);

    setQty("");
    setStrike("");
    setExpiry("");
    setOpenPrice("");
    setNotes("");
    setOpenDate(new Date().toISOString().slice(0, 10));
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Add Leg</h3>

      <div className="form-row">
        <select
          className="input"
          value={type}
          onChange={e => setType(e.target.value)}
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
          onChange={e => setQty(e.target.value)}
        />

        <input
          className="input"
          placeholder="Strike"
          value={strike}
          onChange={e => setStrike(e.target.value)}
        />

        <input
          className="input"
          type="date"
          value={expiry}
          onChange={e => setExpiry(e.target.value)}
        />

        <input
          className="input"
          placeholder="Open price"
          value={openPrice}
          onChange={e => setOpenPrice(e.target.value)}
        />
      </div>

      <div className="form-row">
        <input
          className="input"
          type="date"
          value={openDate}
          onChange={e => setOpenDate(e.target.value)}
        />

        <input
          className="input"
          placeholder="Notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <button type="submit">Add Leg</button>
    </form>
  );
}

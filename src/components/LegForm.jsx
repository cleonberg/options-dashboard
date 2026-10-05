import { useState } from "react";

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
    <form className="card leg-form" onSubmit={submit}>
      <h3>Add Leg</h3>

      <div className="leg-form-fields">
        <div className="leg-form-field">
          <label htmlFor="leg-type">Type</label>
          <select
            id="leg-type"
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
        </div>

        <div className="leg-form-field">
          <label htmlFor="leg-qty">Qty</label>
          <input
            id="leg-qty"
            className="input"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>

        {isOption && (
          <>
            <div className="leg-form-field">
              <label htmlFor="leg-strike">Strike</label>
              <input
                id="leg-strike"
                className="input"
                value={strike}
                onChange={(e) => setStrike(e.target.value)}
              />
            </div>

            <div className="leg-form-field">
              <label htmlFor="leg-expiry">Expiry</label>
              <input
                id="leg-expiry"
                className="input"
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="leg-form-field">
          <label htmlFor="leg-open-price">Open price</label>
          <input
            id="leg-open-price"
            className="input"
            value={openPrice}
            onChange={(e) => setOpenPrice(e.target.value)}
          />
        </div>

        <div className="leg-form-field">
          <label htmlFor="leg-open-date">Open date</label>
          <input
            id="leg-open-date"
            className="input"
            type="date"
            value={openDate}
            onChange={(e) => setOpenDate(e.target.value)}
          />
        </div>

        <div className="leg-form-field leg-form-field--notes">
          <label htmlFor="leg-notes">Notes</label>
          <input
            id="leg-notes"
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <button type="submit">Add Leg</button>
    </form>
  );
}
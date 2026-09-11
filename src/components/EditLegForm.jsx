import React, { useState, useEffect } from "react";
import { editLeg } from "../sync/sync.js";

export default function EditLegForm({
  editingLeg,
  setEditingLeg,
  uid,
  onSubmitEdit // optional
}) {
  const [qty, setQty] = useState("");
  const [strike, setStrike] = useState("");
  const [expiry, setExpiry] = useState("");
  const [openPrice, setOpenPrice] = useState("");
  const [closePrice, setClosePrice] = useState("");
  const [notes, setNotes] = useState("");
  const [openDate, setOpenDate] = useState("");
  const [closeDate, setCloseDate] = useState("");

  useEffect(() => {
    if (editingLeg) {
      setQty(editingLeg.qty);
      setStrike(editingLeg.strike);
      setExpiry(editingLeg.expiry);
      setOpenPrice(editingLeg.openPrice);
      setClosePrice(editingLeg.closePrice || "");
      setNotes(editingLeg.notes || "");

      setOpenDate(
        editingLeg.openDate
          ? editingLeg.openDate.slice(0, 10)
          : new Date().toISOString().slice(0, 10)
      );

      setCloseDate(
        editingLeg.closeDate ? editingLeg.closeDate.slice(0, 10) : ""
      );
    }
  }, [editingLeg]);

  if (!editingLeg) return null;

  async function submit(e) {
    e.preventDefault();

    const updated = {
      ...editingLeg,
      qty: Number(qty),
      strike,
      expiry,
      openPrice: Number(openPrice),
      closePrice: Number(closePrice || 0),
      notes,
      openDate: openDate
        ? new Date(openDate).toISOString()
        : editingLeg.openDate,
      closeDate: closeDate
        ? new Date(closeDate).toISOString()
        : editingLeg.closeDate
    };

    // ✨ reloadAll is completely gone from this call.
    // editLeg updates Dexie -> useLiveQuery instantly updates the UI!
    await editLeg(uid, updated);

    if (onSubmitEdit) {
      await onSubmitEdit(updated);
    }

    // Closes the form smoothly without blowing away the parent row state
    setEditingLeg(null);
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Edit Leg #{editingLeg.id}</h3>

      <div className="form-row">
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

        <input
          className="input"
          placeholder="Close price"
          value={closePrice}
          onChange={e => setClosePrice(e.target.value)}
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
          type="date"
          value={closeDate}
          onChange={e => setCloseDate(e.target.value)}
        />

        <input
          className="input"
          placeholder="Notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <button type="submit">Save Changes</button>

      <button
        type="button"
        className="secondary"
        style={{ marginLeft: 8 }}
        onClick={() => setEditingLeg(null)}
      >
        Cancel
      </button>
    </form>
  );
}
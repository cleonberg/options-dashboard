// This is a temporary file to adjust date formats in the database

import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { dbLocal } from "../db/dexie";

function sanitizeDateStr(val) {
  if (!val) return null;
  if (typeof val === "number" || (!isNaN(Number(val)) && !String(val).includes("-") && !String(val).includes("/"))) {
    const d = new Date(Number(val));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  if (str.includes("T")) return str.split("T")[0];
  if (str.includes("/")) {
    const [m, d, y] = str.split("/");
    if (m && d && y) {
      let year = y.trim();
      if (year.length === 2) {
        year = Number(year) < 70 ? `20${year.padStart(2, "0")}` : `19${year.padStart(2, "0")}`;
      } else {
        year = year.padStart(4, "0");
      }
      return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }
  if (str.startsWith("00")) return `20${str.slice(2)}`;
  return str;
}

export async function migrateLegDates(uid, { dryRun = true } = {}) {
  if (!uid) throw new Error("migrateLegDates requires uid");
  const allLegs = await dbLocal.legs.toArray();
  const plan = [];
  let count = 0;

  for (const leg of allLegs) {
    const cleanedOpen = sanitizeDateStr(leg.openDate);
    const cleanedClose = sanitizeDateStr(leg.closeDate);
    const cleanedExpiry = sanitizeDateStr(leg.expiry || leg.Expiration);

    if (cleanedOpen !== leg.openDate || cleanedClose !== leg.closeDate || cleanedExpiry !== leg.expiry) {
      plan.push({
        id: leg.id,
        open: `${leg.openDate} ➔ ${cleanedOpen}`,
        close: `${leg.closeDate} ➔ ${cleanedClose}`,
        expiry: `${leg.expiry || leg.Expiration} ➔ ${cleanedExpiry}`,
      });

      if (!dryRun) {
        const updated = {
          ...leg,
          openDate: cleanedOpen,
          closeDate: cleanedClose,
          expiry: cleanedExpiry,
          dirty: true,
          updatedAt: Date.now(),
        };
        await dbLocal.legs.put(updated);
        await setDoc(doc(db, "users", uid, "legs", leg.id), { ...updated, dirty: false }, { merge: true });
      }
      count++;
    }
  }

  if (dryRun) {
    console.group(`[migrateLegDates DRY RUN] ${count} of ${allLegs.length} legs flagged for update:`);
    console.table(plan);
    console.groupEnd();
  } else {
    console.log(`[migrateLegDates] Committed updates for ${count} legs.`);
  }

  return { totalChecked: allLegs.length, wouldModify: count, plan };
}
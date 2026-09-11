// src/sync/errorUtils.js
export function classifyError(err) {
  const code = (err?.code || err?.message || "").toString().toLowerCase();
  if (!navigator.onLine) return { type: "network", transient: true, reason: "offline" };
  if (code.includes("permission-denied")) return { type: "permission", transient: false, reason: "permission-denied" };
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) return { type: "network", transient: true, reason: "unavailable" };
  if (code.includes("not-found") || code.includes("404")) return { type: "not-found", transient: false, reason: "not-found" };
  if (code.includes("blocked_by_client") || code.includes("err_blocked_by_client")) return { type: "network", transient: true, reason: "blocked_by_client" };
  return { type: "unknown", transient: false, reason: code || "unknown" };
}

/**
 * Wrap an error with classification for callers to inspect.
 * Returns a new Error with .original and .classification properties.
 */
export function wrapError(err, prefix = "") {
  const classification = classifyError(err);
  const wrapped = new Error(`${prefix}${classification.reason || "error"}`);
  wrapped.original = err;
  wrapped.classification = classification;
  return wrapped;
}

import { httpsCallable } from "firebase/functions";
import { auth } from "./auth.js";
import { functions } from "./firebase.js";

const refreshAccountMarksCallable = httpsCallable(
  functions,
  "refreshAccountMarks",
  { timeout: 60000 }
);

export async function refreshAccountMarks(positions) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sign in before refreshing quotes.");
  }

  await user.getIdToken();
  const result = await refreshAccountMarksCallable({ positions });
  return result.data;
}

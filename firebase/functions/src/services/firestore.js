/**
 * Firestore Admin SDK setup
 * NOTE: Only importing what this project actually uses.
 */

const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// Firestore collections
const inviteTokensCollection = db.collection("invites");

/**
 * Retrieve an invite token record.
 *
 * CONFIRMED SAFE CHANGE (already in your code):
 * - doc id === token, so we can do doc(token).get()
 *
 * Returns:
 *  - null if not found
 *  - { Id, data } if found
 */
async function firestoreRetrieve(token = "") {
  const trimmedToken = String(token || "").trim();

  if (!trimmedToken) {
    logger.warn("firestoreRetrieve called with empty token");
    return null;
  }

  const snap = await inviteTokensCollection.doc(trimmedToken).get();

  if (!snap.exists) {
    logger.info("Token not found", { token: trimmedToken });
    return null;
  }

  return { Id: snap.id, data: snap.data() };
}

module.exports = { db, inviteTokensCollection, firestoreRetrieve };

/**
 * Entry point for Cloud Functions
 */
const { onRequest } = require("firebase-functions/v2/https");
const { app } = require("./src/app.js");

// Export Cloud Function handler (v2) with secrets
exports.api = onRequest({ secrets: ["ADMIN_USER", "ADMIN_PASS"] }, app);

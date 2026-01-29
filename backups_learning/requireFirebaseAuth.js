const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// If you already initializeApp() elsewhere, do NOT call it again.
// Otherwise uncomment:
// admin.initializeApp();

function requireFirebaseAuth(allowedEmails = []) {
  return async (req, res, next) => {
    try {
      const authHeader = String(req.headers.authorization || "");
      if (!authHeader.startsWith("Bearer ")) {
        res.status(401).send("Missing Bearer token");
        return;
      }

      const idToken = authHeader.slice("Bearer ".length).trim();
      const decoded = await admin.auth().verifyIdToken(idToken);

      const email = decoded.email || "";
      const emailVerified = !!decoded.email_verified;

      if (!emailVerified) {
        res.status(403).send("Email not verified");
        return;
      }

      if (allowedEmails.length && !allowedEmails.includes(email)) {
        res.status(403).send("Not authorized");
        return;
      }

      // Attach user info if you want
      req.user = decoded;
      return next();
    } catch (err) {
      logger.warn("Auth failed", { err });
      res.status(401).send("Invalid token");
    }
  };
}

module.exports = { requireFirebaseAuth };

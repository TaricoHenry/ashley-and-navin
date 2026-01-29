/**
 * Public token routes
 * (logic preserved; only change: usedAt now returns null when unused)
 */

const express = require("express");
const logger = require("firebase-functions/logger");
const globals = require("../../globals");

//importing rate limit fucntion
const { rateLimit } = require("../middleware/rateLimit");


const { db, firestoreRetrieve } = require("../services/firestore");
const { FieldValue } = require("firebase-admin/firestore");
const { validateRsvpPayload, normalizeRsvpPayload } = require("../utils/rsvp");

const router = express.Router();

/**
 * Get the status of a token (and shape the API response).
 * USER REQUEST:
 * token, guestName, route, valid, usedAt: null
 */
async function getTokenStatus(token = "") {
  const tokenRecord = await firestoreRetrieve(token);

  if (tokenRecord == null) {
    return {
      status: 404,
      body: { message: globals.tokenNotFoundMessage },
    };
  }

  const usedAt = tokenRecord.data.usedAt || null;

  return {
    status: 200,
    Id: tokenRecord.Id,
    body: {
      token: token,
      guestName: tokenRecord.data.guestName,
      route: tokenRecord.data.route,
      valid: usedAt ? false : true,
      usedAt: usedAt, // ✅ null when unused
      message: usedAt ? globals.invalidTokenMessage : globals.validTokenMessage,
    },
  };
}

/**
 * GET /v1/token/:tokenId/status
 * Returns token id, status and data.
 */
router.get("/token/:tokenId/status", async (req, res) => {
  logger.info("Token status endpoint hit", { url: req.originalUrl });

  const { status, body } = await getTokenStatus(req.params.tokenId);
  res.status(status).send(body);
});

/**
 * GET /v1/token/:tokenId/resolve
 * Redirects to different URLs based on token validity.
 */
router.get("/token/:tokenId/resolve", async (req, res) => {
  logger.info("Token resolve endpoint hit", { url: req.originalUrl });

  const token = req.params.tokenId;
  const tokenStatus = await getTokenStatus(token);

  if (tokenStatus.status == 200 && tokenStatus.body.valid == true) {
    res.redirect(globals.fullWeddingInviteURL);
    return;
  }

  res.redirect(globals.receptionOnlyURL);
});

/**
 * POST /v1/token/:tokenId/reply
 * Accepts RSVP payload, validates it, writes to Firestore, and marks token as used.
 *
 * - Returns 404 if token not found
 * - Returns 410 if token exists but was already used
 * - Writes response as responses/{token} to avoid guestName collisions
 */
router.post("/token/:tokenId/reply",
  rateLimit({ windowMs: 5 * 60_000, max: 10, keyPrefix: "reply" }),
  async (req, res) => {
    const token = req.params.tokenId;

    // Normalize the body first
    req.body = normalizeRsvpPayload(req.body);

    // Validate request body
    const validationError = validateRsvpPayload(req.body);
    if (validationError) {
      logger.warn("RSVP payload validation failed", {
        token,
        status: validationError.status,
        message: validationError.message,
      });

      res.status(validationError.status).send({ message: validationError.message });
      return;
    }

    // Grab the values from the request body
    const { rsvp, allergies, allergyDescription, songRequest } = req.body;

    // Retrieve the token record status
    const tokenRecord = await getTokenStatus(token);

    // Token doesn't exist
    if (tokenRecord.status != 200) {
      logger.warn("Reply attempted with missing token", { token });
      res.status(tokenRecord.status).send({ message: tokenRecord.body.message });
      return;
    }

    // Token exists but already used
    if (tokenRecord.body.valid != true) {
      logger.warn("Reply attempted with already-used token", { token });
      res.status(410).send({ message: tokenRecord.body.message });
      return;
    }

    // Token is valid: safe to accept RSVP
    const { guestName, route } = tokenRecord.body;

    const data = {
      token,
      guestName,
      rsvp,
      route,
      allergies,
      allergyDescription,
      songRequest,
      submittedAt: FieldValue.serverTimestamp(),
    };

    logger.debug("Prepared RSVP data for write", { token, route });

    try {
      // Store by token to avoid guestName collisions
      await db.collection("responses").doc(token).set(data, { merge: true });

      // Mark invite as used
      await db.collection("invites").doc(tokenRecord.Id).update({
        usedAt: FieldValue.serverTimestamp(),
      });

      logger.info("RSVP saved and token marked used", { token, guestName });

      res.status(201).send({
        recordId: token,
        firestoreCollection: "responses",
        message: globals.newRecordwrittenScussfully,
      });
    } catch (error) {
      logger.error("Failed to save RSVP", { token, error });

      res.status(500).send({
        recordId: token,
        firestoreCollection: "responses",
        message: globals.recordWriteNotSuncessful,
        error: {
          message: error?.message || "Unknown error",
          code: error?.code || null,
        },
      });
    }

    return;
  });

module.exports = router;

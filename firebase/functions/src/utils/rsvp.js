/**
 * RSVP validation + normalization helpers
 * (kept exactly as your current logic)
 */

const globals = require("../../globals");

function validateRsvpPayload(body = {}) {
  // Reject unknown fields (catches typos like "allerguseh")
  const allowedKeys = new Set(globals.replyPayloadAllowedKeys);

  const unknownKeys = Object.keys(body).filter((k) => !allowedKeys.has(k));
  if (unknownKeys.length > 0) {
    return { status: 400, message: `Unknown field(s): ${unknownKeys.join(", ")}` };
  }

  const { rsvp, allergies, allergyDescription, songRequest } = body;

  // RSVP is required and must be "yes" or "no"
  if (!rsvp || !["yes", "no"].includes(rsvp)) {
    return { status: 400, message: "Invalid RSVP value. Must be 'yes' or 'no'." };
  }

  // allergies must be boolean if provided
  if (allergies !== undefined && typeof allergies !== "boolean") {
    return { status: 400, message: "Allergies must be a boolean value." };
  }

  // allergyDescription required only when allergies === true
  if (allergies === true) {
    if (
      !allergyDescription ||
      typeof allergyDescription !== "string" ||
      allergyDescription.trim() === ""
    ) {
      return { status: 400, message: "Allergy description is required when allergies are true." };
    }
  }

  // songRequest must be a string if provided
  if (songRequest !== undefined && typeof songRequest !== "string") {
    return { status: 400, message: "Song request must be a string." };
  }

  return null;
}

function normalizeRsvpPayload(body = {}) {
  const normalized = { ...body };

  // Normalize RSVP
  if (typeof normalized.rsvp === "string") {
    normalized.rsvp = normalized.rsvp.trim().toLowerCase();
  }

  // Trim known string fields
  for (const key of ["allergyDescription", "songRequest"]) {
    if (typeof normalized[key] === "string") {
      const trimmed = normalized[key].trim();
      normalized[key] = trimmed === "" ? undefined : trimmed;
    }
  }

  return normalized;
}

module.exports = { validateRsvpPayload, normalizeRsvpPayload };

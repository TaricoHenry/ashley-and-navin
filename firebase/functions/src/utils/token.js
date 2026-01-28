/**
 * Token rules:
 * - 6-character alphanumeric
 * - Used as Firestore doc id in invites + responses
 */

const INVITE_BASE_URL = "https://ash-wedding/token";
const TOKEN_REGEX = /^[A-Za-z0-9]{6}$/;

function isValidToken(token = "") {
  return TOKEN_REGEX.test(String(token || "").trim());
}

function buildInviteUrl(token = "") {
  const t = String(token || "").trim();
  return `${INVITE_BASE_URL}/${t}`;
}

function generateToken6() {
  // Alphanumeric 6 chars
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

module.exports = {
  INVITE_BASE_URL,
  TOKEN_REGEX,
  isValidToken,
  buildInviteUrl,
  generateToken6,
};

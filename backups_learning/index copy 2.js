/**
 * Firebase Cloud Functions (v2) + Express API
 * Ashley Wedding Website
 *
 * Endpoints:
 * [GET]  /v1/token/:tokenId/status   -> returns token status + values
 * [GET]  /v1/token/:tokenId/resolve  -> redirects based on token validity
 * [POST] /v1/token/:tokenId/reply    -> stores RSVP + marks token used
 *
 * Admin (Basic Auth):
 * [GET]  /v1/admin                   -> admin dashboard (view/edit/export)
 * [GET]  /v1/admin/data              -> returns { invites, responses }
 * [POST] /v1/admin/invites           -> create new invite doc (docId = token)
 * [PATCH]/v1/admin/:collection/:id   -> update fields on invites/responses doc
 */

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });
const express = require("express");

const globals = require("../firebase/functions/globals");

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// setting up admin accesss
const { defineString } = require("firebase-functions/params");
const ADMIN_USER = defineString("ADMIN_USER");
const ADMIN_PASS = defineString("ADMIN_PASS");

// Initialize Admin SDK app + Firestore client
initializeApp();
const db = getFirestore();

// Firestore collections
const inviteTokensCollection = db.collection("invites");

/**
 * Basic Auth guard for /admin endpoints
 */
function requireBasicAuth(req, res) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Wedding Admin"');
    res.status(401).send("Authentication required");
    return false;
  }

  const decoded = Buffer.from(auth.split(" ")[1], "base64").toString();
  const [user, pass] = decoded.split(":");

  if (user !== ADMIN_USER.value() || pass !== ADMIN_PASS.value()) {
    res.set("WWW-Authenticate", 'Basic realm="Wedding Admin"');
    res.status(401).send("Invalid credentials");
    return false;
  }

  return true;
}

/**
 * Retrieve an invite token record.
 * Doc ID === token (confirmed), so doc(token).get() is cheapest.
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

/**
 * Get the status of a token (and shape the API response).
 *
 * USER REQUEST:
 * - Return fields like:
 *   token, guestName, route, valid, usedAt: null (when unused)
 *
 * Returns:
 *  - { status: 404, body: {...} }
 *  - { status: 200, Id, body: {...} }
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
      usedAt: usedAt, 
      message: usedAt ? globals.invalidTokenMessage : globals.validTokenMessage,
    },
  };
}

/**
 * Validates POST /reply request body
 * Returns:
 *  - null if valid
 *  - { status, message } if invalid
 */
function validateRsvpPayload(body = {}) {
  // Reject unknown fields (catches typos like "allerguseh")
  const allowedKeys = new Set(globals.replyPayloadAllowedKeys);

  const unknownKeys = Object.keys(body).filter((k) => !allowedKeys.has(k));
  if (unknownKeys.length > 0) {
    return { status: 400, message: `Unknown field(s): ${unknownKeys.join(", ")}` };
  }

  const { rsvp, allergies, allergyDescription, songRequest } = body;

  if (!rsvp || !["yes", "no"].includes(rsvp)) {
    return { status: 400, message: "Invalid RSVP value. Must be 'yes' or 'no'." };
  }

  if (allergies !== undefined && typeof allergies !== "boolean") {
    return { status: 400, message: "Allergies must be a boolean value." };
  }

  if (allergies === true) {
    if (
      !allergyDescription ||
      typeof allergyDescription !== "string" ||
      allergyDescription.trim() === ""
    ) {
      return { status: 400, message: "Allergy description is required when allergies are true." };
    }
  }

  if (songRequest !== undefined && typeof songRequest !== "string") {
    return { status: 400, message: "Song request must be a string." };
  }

  return null;
}

/**
 * Normalizes / cleans the payload
 * - rsvp lowercased + trimmed
 * - trims known string fields
 * - converts empty strings to `undefined` for those fields
 */
function normalizeRsvpPayload(body = {}) {
  const normalized = { ...body };

  if (typeof normalized.rsvp === "string") {
    normalized.rsvp = normalized.rsvp.trim().toLowerCase();
  }

  for (const key of ["allergyDescription", "songRequest"]) {
    if (typeof normalized[key] === "string") {
      const trimmed = normalized[key].trim();
      normalized[key] = trimmed === "" ? undefined : trimmed;
    }
  }

  return normalized;
}

/**
 * Local dev server port (only used locally)
 */
const port = 5999;

// Express app setup
const app = express();
app.use(cors);
app.use(express.json());

// Versioned API router
const apiV1 = express.Router();

/* =========================
   ADMIN ROUTES (Basic Auth)
   ========================= */

/**
 * Admin: get all invites + responses
 */
apiV1.get("/admin/data", async (req, res) => {
  if (!requireBasicAuth(req, res)) return;

  const invitesSnap = await db.collection("invites").get();
  const responsesSnap = await db.collection("responses").get();

  res.send({
    invites: invitesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    responses: responsesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
});

/**
 * Admin: update doc fields
 */
apiV1.patch("/admin/:collection/:id", async (req, res) => {
  if (!requireBasicAuth(req, res)) return;

  const { collection, id } = req.params;

  if (!["invites", "responses"].includes(collection)) {
    res.status(400).send("Invalid collection");
    return;
  }

  await db.collection(collection).doc(id).update(req.body);
  res.send({ ok: true });
});

/**
 * Admin: create a new invite document (docId = token)
 */
apiV1.post("/admin/invites", async (req, res) => {
  if (!requireBasicAuth(req, res)) return;

  const body = req.body || {};
  const token = String(body.token || body.id || "").trim();

  if (!token) {
    res.status(400).send({ message: "token is required" });
    return;
  }

  const ref = db.collection("invites").doc(token);
  const existing = await ref.get();
  if (existing.exists) {
    res.status(409).send({ message: "Invite already exists", token });
    return;
  }

  const { token: _t, id: _id, ...rest } = body;

  await ref.set({
    ...rest,
    token, // optional, but handy
    createdAt: FieldValue.serverTimestamp(),
    usedAt: null,
  });

  res.status(201).send({ ok: true, id: token });
});

/**
 * Admin dashboard page (plain HTML)
 * Note: uses relative fetch paths (./admin/data) so it works under the function URL.
 */
apiV1.get("/admin", (req, res) => {
  if (!requireBasicAuth(req, res)) return;

  res.set("Content-Type", "text/html");
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Wedding Admin</title>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h2 { margin-top: 40px; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th, td { border: 1px solid #ccc; padding: 6px; font-size: 14px; vertical-align: top; }
    th { background: #f3f3f3; position: sticky; top: 0; }
    td[contenteditable] { background: #fffbe6; }
    td[contenteditable]:focus { outline: 2px solid #ffd54f; }
    button { margin-right: 10px; }
    .muted { color: #777; font-size: 12px; }
    .box { margin: 10px 0; padding: 10px; border: 1px solid #ddd; }
    input { margin-right: 10px; }
  </style>
</head>
<body>

<h1>Wedding Admin Dashboard</h1>
<p class="muted">Click a cell to edit. Changes save automatically on blur. Exports generate CSV from what you see.</p>

<h2>Invites</h2>

<div class="box">
  <b>Add Invite</b>
  <p class="muted">Token is the document id (and should be unique). Guest name + route are optional.</p>
  <input id="newToken" placeholder="token (doc id)" />
  <input id="newGuestName" placeholder="guestName" />
  <input id="newRoute" placeholder="route (A/B/etc)" />
  <button onclick="addInvite()">Add</button>
  <span id="addInviteMsg" class="muted"></span>
</div>

<button onclick="exportCSV('invites')">Export Invites CSV</button>
<table id="invites"></table>

<h2>Responses</h2>
<button onclick="exportCSV('responses')">Export Responses CSV</button>
<table id="responses"></table>

<script>
async function loadData() {
  const res = await fetch("./admin/data");
  if (!res.ok) {
    alert("Failed to load admin data");
    return;
  }
  const data = await res.json();
  renderTable("invites", data.invites);
  renderTable("responses", data.responses);
}

// basic formatting so timestamps don't show as [object Object] in cells
function formatCellValue(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderTable(tableId, rows) {
  const table = document.getElementById(tableId);
  table.innerHTML = "";

  if (!rows || rows.length === 0) {
    table.innerHTML = "<tr><td>No data</td></tr>";
    return;
  }

  // union columns so table doesn't break if docs have different fields
  const colSet = new Set();
  rows.forEach(r => Object.keys(r || {}).forEach(k => colSet.add(k)));
  const columns = Array.from(colSet);

  // Header
  const header = document.createElement("tr");
  columns.forEach(col => {
    const th = document.createElement("th");
    th.innerText = col;
    header.appendChild(th);
  });
  table.appendChild(header);

  // Rows
  rows.forEach(row => {
    const tr = document.createElement("tr");

    columns.forEach(col => {
      const td = document.createElement("td");
      td.innerText = formatCellValue(row[col]);

      // Don't let people edit doc id
      td.contentEditable = col !== "id";

      td.onblur = async () => {
        if (col === "id") return;
        await saveCell(tableId, row.id, col, td.innerText);
      };

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}

async function saveCell(collection, id, field, value) {
  await fetch("./admin/" + collection + "/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: value })
  });
}

function exportCSV(tableId) {
  const table = document.getElementById(tableId);
  const rows = [...table.querySelectorAll("tr")];

  const csv = rows.map(row =>
    [...row.children].map(cell =>
      '"' + cell.innerText.replace(/"/g, '""') + '"'
    ).join(",")
  ).join("\\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = tableId + ".csv";
  a.click();
}

async function addInvite() {
  const token = document.getElementById("newToken").value.trim();
  const guestName = document.getElementById("newGuestName").value.trim();
  const route = document.getElementById("newRoute").value.trim();
  const msg = document.getElementById("addInviteMsg");

  msg.innerText = "";

  if (!token) {
    msg.innerText = "Token is required.";
    return;
  }

  const payload = { token };
  if (guestName) payload.guestName = guestName;
  if (route) payload.route = route;

  const res = await fetch("./admin/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    msg.innerText = data.message || "Failed to add invite";
    return;
  }

  msg.innerText = "Invite created!";
  document.getElementById("newToken").value = "";
  document.getElementById("newGuestName").value = "";
  document.getElementById("newRoute").value = "";

  await loadData();
}

loadData();
</script>

</body>
</html>
`);
});

/* =========================
   PUBLIC TOKEN ROUTES
   ========================= */

/**
 * GET /v1/token/:tokenId/status
 */
apiV1.get("/token/:tokenId/status", async (req, res) => {
  logger.info("Token status endpoint hit", { url: req.originalUrl });

  const { status, body } = await getTokenStatus(req.params.tokenId);
  res.status(status).send(body);
});

/**
 * GET /v1/token/:tokenId/resolve
 */
apiV1.get("/token/:tokenId/resolve", async (req, res) => {
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
 */
apiV1.post("/token/:tokenId/reply", async (req, res) => {
  const token = req.params.tokenId;

  req.body = normalizeRsvpPayload(req.body);

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

  const { rsvp, allergies, allergyDescription, songRequest } = req.body;

  const tokenRecord = await getTokenStatus(token);

  if (tokenRecord.status != 200) {
    logger.warn("Reply attempted with missing token", { token });
    res.status(tokenRecord.status).send({ message: tokenRecord.body.message });
    return;
  }

  if (tokenRecord.body.valid != true) {
    logger.warn("Reply attempted with already-used token", { token });
    res.status(410).send({ message: tokenRecord.body.message });
    return;
  }

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
    await db.collection("responses").doc(token).set(data, { merge: true });

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

// Mount routes under /v1
app.use("/v1", apiV1);

/**
 * Local-only server start (not used in deployed Cloud Functions)
 */
if (process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    logger.info("Express app is running locally", { url: `http://localhost:${port}` });
  });
}

// Export Cloud Function handler
exports.api = onRequest(app);

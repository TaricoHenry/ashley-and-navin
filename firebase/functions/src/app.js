/**
 * This file contains:
 * Firebase Cloud Functions (v2) + Express API
 * for Ashley Wedding Website
 *
 * It has three main endpoints:
 * [GET]  /token/:tokenId/status  --> returns token record status and values
 * [GET]  /token/:tokenId/resolve --> checks token status and does some routing
 * [POST] /token/:tokenId/reply   --> accepts parameters, writes to `responses`, and marks the token as used
 *
 * Admin (Basic Auth):
 * [GET]   /admin                 --> admin dashboard (view/edit/export/add)
 * [GET]   /admin/data            --> returns { invites, responses }
 * [POST]  /admin/invites         --> create new invite doc (docId = token)
 * [PATCH] /admin/:collection/:id --> update fields on invites/responses doc
 */

const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });
const express = require("express");

// Express app setup
const app = express();
app.use(cors);
app.use(express.json());

// Versioned API router
const apiV1 = express.Router();

// Routes
const adminRoutes = require("./routes/admin");
const tokenRoutes = require("./routes/token");

// Mount routes under /v1
apiV1.use(adminRoutes);
apiV1.use(tokenRoutes);
app.use("/v1", apiV1);

/**
 * Local dev server port
 * NOTE: We will only listen locally (not in deployed Cloud Functions)
 */
const port = 5999;

/**
 * Only run app.listen locally.
 * In deployed Cloud Functions, onRequest(app) runs the server for you.
 */
if (process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    logger.info("Express app is running locally", { url: `http://localhost:${port}` });
  });
}

module.exports = { app };

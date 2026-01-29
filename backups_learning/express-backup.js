const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// --------------------
// BASE PATH: /api/v1
// --------------------
const apiV1 = express.Router();


 //GET /api/v1/token/:token/status

apiV1.get("/token/:token/status", async (req, res) => {
  const { token } = req.params;

  try {
    const tokenDoc = await db.collection("tokens").doc(token).get();

    if (!tokenDoc.exists) {
      return res.status(404).json({
        valid: false,
        message: "Token not found",
      });
    }

    const data = tokenDoc.data();

    if (data.usedAt) {
      return res.status(200).json({
        valid: false,
        usedAt: data.usedAt,
        message: "Token already used",
      });
    }

    return res.status(200).json({
      valid: true,
      usedAt: null,
      message: "Token is valid",
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

// mount versioned API
app.use("/api/v1", apiV1);

// export firebase function
exports.api = onRequest({ cors: true }, app);

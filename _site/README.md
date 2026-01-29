### Architecture for project Ash-wedding


Website hosting:
git pages




Backend
- Firebase
-- Firestore is the core DB

--- cloud fucntion s serve as the ESB




backup of funcitons:


const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// GET /validate?t=TOKEN
// endpoint to validate the token based on values in the database
exports.validate = onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      const token = String(req.query.t || "").trim();
      if (!token) return res.status(400).json({ valid: false, reason: "missing" });

      const ref = db.collection("invites").doc(token);
      const snap = await ref.get();

      if (!snap.exists) return res.status(404).json({ valid: false, reason: "invalid" });

      const data = snap.data();
      if (data.usedAt) return res.status(410).json({ valid: false, reason: "used" });

      return res.json({
        valid: true,
        guestName: data.guestName || null,
        route: data.route || "A",
      });
    } catch (e) {
      logger.error(e);
      return res.status(500).json({ valid: false, reason: "server_error" });
    }
  });
});








/*


// POST /submit  body: { token, rsvp, dietary, notes }
exports.submit = onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });

      const token = String(req.body?.token || "").trim();
      const rsvp = String(req.body?.rsvp || "").toLowerCase(); // "yes" / "no"
      const dietary = String(req.body?.dietary || "").trim();
      const notes = String(req.body?.notes || "").trim();

      if (!token) return res.status(400).json({ ok: false, reason: "missing_token" });
      if (!["yes", "no"].includes(rsvp)) return res.status(400).json({ ok: false, reason: "bad_rsvp" });

      const inviteRef = db.collection("invites").doc(token);
      const responsesRef = db.collection("responses").doc();

      await db.runTransaction(async (tx) => {
        const inviteSnap = await tx.get(inviteRef);
        if (!inviteSnap.exists) throw Object.assign(new Error("invalid"), { code: "invalid" });

        const invite = inviteSnap.data();
        if (invite.usedAt) throw Object.assign(new Error("used"), { code: "used" });

        tx.set(responsesRef, {
          token,
          submittedAt: admin.firestore.FieldValue.serverTimestamp(),
          guestName: invite.guestName || null,
          route: invite.route || "A",
          rsvp,
          dietary,
          notes,
        });

        tx.update(inviteRef, {
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return res.json({ ok: true });
    } catch (e) {
      logger.error(e);
      if (e.code === "invalid") return res.status(404).json({ ok: false, reason: "invalid" });
      if (e.code === "used") return res.status(410).json({ ok: false, reason: "used" });
      return res.status(500).json({ ok: false, reason: "server_error" });
    }
  });
});*/





const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const express = require("express");

//Reference to globals
const globals = require("./globals");



//admin.initializeApp();
//const db = admin.firestore();


// settting up firestore access
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue, Filter } = require('firebase-admin/firestore');
const { firestore } = require("firebase-functions/v1");

// initialize the application
initializeApp();
const db = getFirestore();


// access the invites token collection
const inviteTokensCollection = db.collection('invites');

// function to query firbase DB for token record and return it
async function firestoreRetrieve(token = "") {
    const TokenRecord = await inviteTokensCollection.where('token', '==', token).limit(1).get();
    console.log(TokenRecord);

    if (TokenRecord.empty == true) {
        console.log("No db exist");
        return null;
    }
    
    console.log("db exists");
    var tokenRecordData = TokenRecord.docs[0].data();
    console.log(tokenRecordData)

    return(tokenRecordData);
}

//function to return status of a token
async function getTokenStatus (token = ""){
    let tokenRecord = await firestoreRetrieve(token);

    if (tokenRecord == null){
            return {
            status : 404,
            body: {
            message: globals.tokenNotFoundMessage
            }
        };
    }
    //assemble response body
    return {
            status : 200,
            body: {
            token: token,
            guestName: tokenRecord.guestName,
            route: tokenRecord.route,
            valid: tokenRecord.usedAt? false : true,
            usedAt: tokenRecord.usedAt,
            message: tokenRecord.usedAt? globals.invalidTokenMessage : globals.validTokenMessage
            }
    };
}



//firestoreRetrieve(this.token = "key123");
// set up port for local testing of express application
const port = 5999;


// set up instance of express class
const app = express();
app.use(cors);
app.use(express.json());


// Set up basepath
const apiV1 = express.Router();


apiV1.get("/token/:tokenId/status", async (req, res) => {
  console.log("Token validate endpoint hit:", req.originalUrl);

  //let token = req.params.tokenId;
  //let tokenRecord = await firestoreRetrieve(token);
  //console.log(tokenRecord.name);
  const {status, body} = await getTokenStatus(req.params.tokenId);
  res.status(status);
  res.send(body);
});

apiV1.get("/token/:tokenId/resolve", async (req, res) => {
    console.log("Token resolve endpoint hit:", req.originalUrl);
    let token = req.params.tokenId;

    let tokenStatus = await getTokenStatus(token);

    if(tokenStatus.status == 200 & tokenStatus.body.valid == true){
        res.redirect(globals.fullWeddingInviteURL);
        return;
    }

    res.redirect(globals.receptionOnlyURL);

})


apiV1.post("/token/:tokenId/reply", async (req, res) => {
    const token = req.params.tokenId;

    //grab the values from the request body
    const {rsvp, allergies, allergyDescription, songRequest} = req.body;

    // Retrieveing the token record document
    let tokenRecord = await getTokenStatus(token);


    // Early exit due to invalid token
    if(tokenRecord.status != 200 || tokenRecord.body.valid != true){
        res.send(tokenRecord.body.message)
        return
    }

    // Grab the guestName and route from token record
    const { guestName, route} = tokenRecord.body;


    //temporarily grabbing the date. will move to firebase time function
    let submittedAt = new Date();

    // Set up data for firestore record
    const data=  {
            token,
            guestName,
            rsvp,
            route,
            allergies,
            allergyDescription,
            songRequest,
            submittedAt: submittedAt
        }
    
    
    
    console.log(data);
    

    // Lets push to the firestore collection
    try {
    const addToFS = await db.collection('responses').doc(guestName).set( data, { merge: true });
    
    res.status(201);
    res.send(
        {
            recordId: guestName,
            firestoreCollection: "responses",
            message: globals.newRecordwrittenScussfully
    })
    console.log(addToFS);
    }catch (error){
        res.status (500);
        console.log("Failed to save RSVP:", error);
        res.send(
        {
            recordId: guestName,
            firestoreCollection: "responses",
            message: globals.recordWriteNotSuncessful
         })

    }

    return;
})


app.listen(port, () => {
    console.log("Express app is running on http://localhost:%s", port);
});

app.use("/v1", apiV1);

exports.api = onRequest(app);



1) Unused imports:
   - admin (firebase-admin) is imported but not used.
   - logger imported but you mostly use console.log.
   - applicationDefault, cert, Timestamp, Filter, firestore(v1) are unused.

2) Cloud Functions + app.listen:
   - Typically remove app.listen() in deployed functions.
   - Consider running listen() only when running locally.

3) Token lookup strategy:
   - You query invites where token == value. If doc id could be token, doc(token).get() is simpler and cheaper.

4) Status codes consistency:
   - In POST /reply, invalid token path returns a message but does NOT set an HTTP error status.
   - (Could lead to clients thinking request succeeded.)

5) Document IDs:
   - responses.doc(guestName) can overwrite if names collide.
   - Consider doc(token) or auto-id.

6) Logging:
   - Prefer logger.info/error for Cloud Functions (structured logging) vs console.log.

7) Security:
   - Consider validating permissions per token.route (e.g., which routes can access which endpoints).
   - Add rate limiting on POST to prevent abuse (you already mentioned this goal).

8) Minor style:
   - Prefer === over == for comparisons (consistency + fewer surprises).
   - Use const/let instead of var (you already use let/const elsewhere).
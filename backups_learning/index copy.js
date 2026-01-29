const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const express = require("express");

//Reference to globals
const globals = require("../firebase/functions/globals");



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
    var data = TokenRecord.docs[0].data();
    var Id = TokenRecord.docs[0].id;
    console.log(Id)

    return{Id, data};
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
            Id: tokenRecord.Id,
            body: {
            token: token,
            guestName: tokenRecord.data.guestName,
            route: tokenRecord.data.route,
            valid: tokenRecord.data.usedAt? false : true,
            usedAt: tokenRecord.data.usedAt,
            message: tokenRecord.data.usedAt? globals.invalidTokenMessage : globals.validTokenMessage
            }
    };
}


/**
 * Validates POST /reply request body
 * Returns:
 *  - null if valid
 *  - { status, message } if invalid
 */
function validateRsvpPayload(body = {}) {
  // 1) Reject unknown fields (catches typos like "allerguseh")
  const allowedKeys = new Set(globals.replyPayloadAllowedKeys);

  const unknownKeys = Object.keys(body).filter((k) => !allowedKeys.has(k));
  if (unknownKeys.length > 0) {
    return {
      status: 400,
      message: `Unknown field(s): ${unknownKeys.join(", ")}`,
    };
  }

  const { rsvp, allergies, allergyDescription, songRequest } = body;

  // RSVP is required and must be "yes" or "no"
  if (!rsvp || !["yes", "no"].includes(rsvp)) {
    return {
      status: 400,
      message: "Invalid RSVP value. Must be 'yes' or 'no'.",
    };
  }

  // allergies must be boolean if provided
  if (allergies !== undefined && typeof allergies !== "boolean") {
    return {
      status: 400,
      message: "Allergies must be a boolean value.",
    };
  }

  // allergyDescription required only when allergies === true
  if (allergies === true) {
    if (
      !allergyDescription ||
      typeof allergyDescription !== "string" ||
      allergyDescription.trim() === ""
    ) {
      return {
        status: 400,
        message: "Allergy description is required when allergies are true.",
      };
    }
  }

  // songRequest must be a string if provided
  if (songRequest !== undefined && typeof songRequest !== "string") {
    return {
      status: 400,
      message: "Song request must be a string.",
    };
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

    if(tokenStatus.status == 200 && tokenStatus.body.valid == true){
        res.redirect(globals.fullWeddingInviteURL);
        return;
    }

    res.redirect(globals.receptionOnlyURL);

})


apiV1.post("/token/:tokenId/reply", async (req, res) => {
    const token = req.params.tokenId;

    //normailize the body first
    req.body = normalizeRsvpPayload(req.body);

    // Validate request body
  const validationError = validateRsvpPayload(req.body);
  if (validationError) {
    res.status(validationError.status);
    res.send({ message: validationError.message });
    return;
  }

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
    const data =  {
            token,
            guestName,
            rsvp,
            route,
            allergies,
            allergyDescription,
            songRequest,
            submittedAt: FieldValue.serverTimestamp()
        }
    
    
    
    console.log(data);
    

    // Lets push to the firestore collection
    try {
    const addToFS = await db.collection('responses').doc(guestName).set( data, { merge: true });
    
    const updateInvite = await db.collection('invites').doc(tokenRecord.Id).update( {
        usedAt: FieldValue.serverTimestamp(),
      });
    res.status(201);
    res.send(
        {
            recordId: guestName,
            firestoreCollection: "responses",
            message: globals.newRecordwrittenScussfully
    })
    console.log(addToFS, updateInvite);
    }catch (error){
        res.status (500);
        console.log("Failed to save RSVP:", error);
        res.send(
        {
            recordId: guestName,
            firestoreCollection: "responses",
            message: globals.recordWriteNotSuncessful,
            error: error
         })

    }

    return;
})


app.listen(port, () => {
    console.log("Express app is running on http://localhost:%s", port);
});

app.use("/v1", apiV1);

exports.api = onRequest(app);

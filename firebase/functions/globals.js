//Declaring global constants
const validTokenMessage = "Token is valid";
const invalidTokenMessage = "Token is NOT valid";
const tokenNotFoundMessage ="Token not found";
const fullWeddingInviteURL = "https://youtube.com"
const receptionOnlyURL = "https://twitch.com";
const newRecordwrittenScussfully = "Record written successfully to firestore db";
const recordWriteNotSuncessful = "Record NOT written to firestore db";
const inviteBaseUrl= "https://ash-wedding/token";
const replyPayloadAllowedKeys = [
    "rsvp",
    "allergies",
    "allergyDescription",
    "songRequest",
  ]


module.exports = {
  validTokenMessage,
  invalidTokenMessage,
  tokenNotFoundMessage,
  fullWeddingInviteURL,
  receptionOnlyURL,
  newRecordwrittenScussfully,
  recordWriteNotSuncessful,
  replyPayloadAllowedKeys,
  inviteBaseUrl
};
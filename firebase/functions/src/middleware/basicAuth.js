/**
 * Basic Auth guard for /admin endpoints
 * Uses Cloud Functions v2 secrets via process.env
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

  const ADMIN_USER = process.env.ADMIN_USER;
  const ADMIN_PASS = process.env.ADMIN_PASS;

  // If secrets are not set in the environment, fail closed
  if (!ADMIN_USER || !ADMIN_PASS) {
    res.status(500).send("Admin credentials not configured");
    return false;
  }

  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    res.set("WWW-Authenticate", 'Basic realm="Wedding Admin"');
    res.status(401).send("Invalid credentials");
    return false;
  }

  return true;
}

module.exports = { requireBasicAuth };

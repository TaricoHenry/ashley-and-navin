/**
 * Simple in-memory rate limiter (no dependencies).
 * NOTE: In-memory means limits reset on deploy/cold start and won't be shared across instances.
 * For a wedding site this is usually fine and fast to ship.
 */

function rateLimit({ windowMs = 60_000, max = 30, keyPrefix = "rl" } = {}) {
  // Map<key, { count: number, resetAt: number }>
  const store = new Map();

  return (req, res, next) => {
    try {
      const now = Date.now();

      // A reasonable client identifier:
      // - Prefer X-Forwarded-For (Cloud Functions sits behind proxies)
      // - Fall back to req.ip
      const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
      const ip = xff || req.ip || "unknown";

      const key = `${keyPrefix}:${ip}:${req.method}:${req.baseUrl}${req.path}`;

      const entry = store.get(key);
      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        res.set("X-RateLimit-Limit", String(max));
        res.set("X-RateLimit-Remaining", String(max - 1));
        res.set("X-RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));
        return next();
      }

      entry.count += 1;

      res.set("X-RateLimit-Limit", String(max));
      res.set("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
      res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

      if (entry.count > max) {
        res.status(429).send({
          message: "Too many requests. Please try again shortly.",
        });
        return;
      }

      return next();
    } catch (e) {
      // Fail open if limiter errors (do not block requests because of limiter bug)
      return next();
    }
  };
}

module.exports = { rateLimit };

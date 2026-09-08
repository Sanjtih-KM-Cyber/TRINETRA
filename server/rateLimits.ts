import rateLimit from "express-rate-limit";

// Rate limiting is a production edge concern: active only when
// NODE_ENV=production so dev loops, demos and the integration suite
// never trip over their own logins.
const prodOnly = () => process.env.NODE_ENV !== "production";

/** Brute-force guard on the VPN credential channel. */
export const vpnAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: prodOnly,
  message: { error: "Too many VPN attempts", message: "Rate limit exceeded. Retry after 15 minutes." },
});

/** Brute-force guard on officer sign-in / access requests. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: prodOnly,
  message: { error: "Too many auth attempts", message: "Rate limit exceeded. Retry after 15 minutes." },
});

/** General API abuse guard (excludes heavy LLM/streaming endpoints by design). */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: prodOnly,
  message: { error: "Rate limit exceeded", message: "Slow down and retry shortly." },
});

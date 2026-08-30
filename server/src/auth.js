import { config } from "./config.js";

/**
 * Validates a given token against the configured server AUTH_TOKEN.
 * If no AUTH_TOKEN is configured, access is granted (open local dev mode).
 */
export function verifyToken(providedToken) {
  if (!config.authToken) return true; // Auth disabled
  if (!providedToken) return false;
  return providedToken === config.authToken;
}

/**
 * Express middleware for authenticating REST API requests.
 * Supports:
 * - Authorization: Bearer <token> header
 * - Query parameter: ?token=<token>
 * - Custom header: x-api-token: <token>
 */
export function authMiddleware(req, res, next) {
  if (!config.authToken) return next();

  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.headers["x-api-token"]) {
    token = req.headers["x-api-token"];
  } else if (req.query && req.query.token) {
    token = String(req.query.token);
  }

  if (!verifyToken(token)) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized: Invalid or missing authentication token",
      code: "unauthorized"
    });
  }

  next();
}

/**
 * WebSocket upgrade / client verification token check helper.
 */
export function verifyWsAuth(req) {
  if (!config.authToken) return true;

  try {
    const url = new URL(req.url, "http://localhost");
    const tokenQuery = url.searchParams.get("token");
    if (tokenQuery && verifyToken(tokenQuery)) return true;

    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ") && verifyToken(authHeader.slice(7).trim())) {
      return true;
    }

    const xApiToken = req.headers["x-api-token"];
    if (xApiToken && verifyToken(xApiToken)) return true;
  } catch {}

  return false;
}

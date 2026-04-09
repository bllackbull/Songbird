export function createSessionHelpers({
  getSession,
  touchSession,
  isProduction,
}) {
  const parseCookies = (req) => {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return {};

    return cookieHeader.split(";").reduce((acc, cookie) => {
      const [name, ...rest] = cookie.trim().split("=");
      if (!name) return acc;

      acc[name] = decodeURIComponent(rest.join("="));

      return acc;
    }, {});
  };

  const isHttpsRequest = (req) => {
    if (!req) return false;
    if (req.secure) return true;

    const proto = String(req.headers?.["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim()
      .toLowerCase();

    return proto === "https";
  };

  const shouldUseSecureCookie = (req) => {
    // Only mark cookies Secure on actual HTTPS requests.
    // This keeps local HTTP development working even if APP_ENV is production.
    return isProduction && isHttpsRequest(req);
  };

  const setSessionCookie = (req, res, token) => {
    const parts = [
      `sid=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=1209600",
    ];

    if (shouldUseSecureCookie(req)) {
      parts.push("Secure");
    }

    res.setHeader("Set-Cookie", parts.join("; "));
  };

  const clearSessionCookie = (req, res) => {
    const parts = ["sid=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];

    if (shouldUseSecureCookie(req)) {
      parts.push("Secure");
    }

    res.setHeader("Set-Cookie", parts.join("; "));
  };

  const getSessionFromRequest = (req) => {
    const cookies = parseCookies(req);
    if (!cookies.sid) return null;

    const session = getSession(cookies.sid);

    if (session) {
      touchSession(cookies.sid);
    }

    return session;
  };

  const requireSession = (req, res) => {
    const session = getSessionFromRequest(req);

    if (!session) {
      res.status(401).json({ error: "Not authenticated." });
      return null;
    }

    return session;
  };

  const requireSessionUsernameMatch = (res, session, suppliedUsername) => {
    const supplied = String(suppliedUsername || "")
      .trim()
      .toLowerCase();

    if (supplied && supplied !== String(session.username || "").toLowerCase()) {
      res
        .status(403)
        .json({ error: "Username does not match authenticated user." });
      return false;
    }

    return true;
  };

  return {
    parseCookies,
    isHttpsRequest,
    shouldUseSecureCookie,
    setSessionCookie,
    clearSessionCookie,
    getSessionFromRequest,
    requireSession,
    requireSessionUsernameMatch,
  };
}

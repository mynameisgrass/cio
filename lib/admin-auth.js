import crypto from "node:crypto";

export const HARD_LOCK_PASSWORD = "grass";
export const ADMIN_COOKIE_NAME = "bigcio_admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "bigcio-grass-session-v1";

function toBuffer(value) {
  return Buffer.from(String(value || ""), "utf8");
}

function signPayload(payload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

export function comparePassword(inputPassword) {
  const left = toBuffer(String(inputPassword || ""));
  const right = toBuffer(HARD_LOCK_PASSWORD);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export function createSessionToken(nowMs = Date.now()) {
  const issuedAt = Math.floor(nowMs / 1000);
  const nonce = crypto.randomBytes(12).toString("hex");
  const payload = `${issuedAt}.${nonce}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token, nowMs = Date.now()) {
  if (!token || typeof token !== "string") {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [issuedAtText, nonce, signature] = parts;
  const payload = `${issuedAtText}.${nonce}`;
  const expectedSignature = signPayload(payload);

  const left = toBuffer(signature);
  const right = toBuffer(expectedSignature);

  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return false;
  }

  const issuedAt = Number(issuedAtText);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
    return false;
  }

  const ageSeconds = Math.floor(nowMs / 1000) - issuedAt;
  return ageSeconds >= 0 && ageSeconds <= SESSION_MAX_AGE_SECONDS;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  };
}

export function isRequestSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    return origin === requestOrigin;
  } catch {
    return false;
  }
}

export function hasValidAdminSessionFromRequest(request) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value || "";
  return verifySessionToken(token);
}

import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  comparePassword,
  createSessionToken,
  getSessionCookieOptions,
  isRequestSameOrigin
} from "../../../../lib/admin-auth";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 5 * 60 * 1000;
const attemptsByClient = new Map();

function getClientKey(request) {
  const xForwardedFor = request.headers.get("x-forwarded-for") || "";
  const firstIp = xForwardedFor.split(",")[0]?.trim();
  const userAgent = request.headers.get("user-agent") || "unknown-agent";
  return `${firstIp || "unknown-ip"}::${userAgent.slice(0, 120)}`;
}

function pruneExpired(nowMs) {
  for (const [key, record] of attemptsByClient.entries()) {
    if ((record.blockedUntil || 0) < nowMs - WINDOW_MS && (record.lastAttemptAt || 0) < nowMs - WINDOW_MS) {
      attemptsByClient.delete(key);
    }
  }
}

function getOrCreateRecord(clientKey) {
  if (!attemptsByClient.has(clientKey)) {
    attemptsByClient.set(clientKey, {
      count: 0,
      firstAt: Date.now(),
      lastAttemptAt: 0,
      blockedUntil: 0
    });
  }

  return attemptsByClient.get(clientKey);
}

function checkRateLimit(clientKey, nowMs) {
  const record = getOrCreateRecord(clientKey);

  if (record.blockedUntil && record.blockedUntil > nowMs) {
    return {
      blocked: true,
      retryAfterMs: record.blockedUntil - nowMs
    };
  }

  if (record.firstAt + WINDOW_MS < nowMs) {
    record.count = 0;
    record.firstAt = nowMs;
    record.blockedUntil = 0;
  }

  return { blocked: false, retryAfterMs: 0 };
}

function registerFailedAttempt(clientKey, nowMs) {
  const record = getOrCreateRecord(clientKey);

  if (record.firstAt + WINDOW_MS < nowMs) {
    record.count = 0;
    record.firstAt = nowMs;
    record.blockedUntil = 0;
  }

  record.count += 1;
  record.lastAttemptAt = nowMs;

  if (record.count >= MAX_ATTEMPTS) {
    record.blockedUntil = nowMs + BLOCK_MS;
  }
}

function clearAttempts(clientKey) {
  attemptsByClient.delete(clientKey);
}

export async function POST(request) {
  if (!isRequestSameOrigin(request)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Yêu cầu không hợp lệ (sai origin)."
      },
      { status: 403 }
    );
  }

  const nowMs = Date.now();
  pruneExpired(nowMs);

  const clientKey = getClientKey(request);
  const rateState = checkRateLimit(clientKey, nowMs);
  if (rateState.blocked) {
    return NextResponse.json(
      {
        ok: false,
        message: "Bạn nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút."
      },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const password = typeof body?.password === "string" ? body.password : "";

    if (!comparePassword(password)) {
      registerFailedAttempt(clientKey, nowMs);
      return NextResponse.json(
        {
          ok: false,
          message: "Mật khẩu không đúng."
        },
        { status: 401 }
      );
    }

    clearAttempts(clientKey);

    const response = NextResponse.json({
      ok: true,
      message: "Đăng nhập thành công."
    });

    response.cookies.set(ADMIN_COOKIE_NAME, createSessionToken(), getSessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Không đọc được dữ liệu đăng nhập."
      },
      { status: 400 }
    );
  }
}

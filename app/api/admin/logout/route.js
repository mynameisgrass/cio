import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, isRequestSameOrigin } from "../../../../lib/admin-auth";

export const runtime = "nodejs";

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

  const response = NextResponse.json({
    ok: true,
    message: "Đã đăng xuất."
  });

  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });

  return response;
}

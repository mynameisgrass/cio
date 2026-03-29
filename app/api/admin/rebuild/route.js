import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { hasValidAdminSessionFromRequest, isRequestSameOrigin } from "../../../../lib/admin-auth";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const CATALOG_FILE = path.join(process.cwd(), "data", "catalog.json");

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      message: "Phiên đăng nhập admin không hợp lệ."
    },
    { status: 401 }
  );
}

function ensureAuthorized(request) {
  if (!hasValidAdminSessionFromRequest(request)) {
    return unauthorized();
  }

  return null;
}

function invalidOrigin() {
  return NextResponse.json(
    {
      ok: false,
      message: "Yêu cầu không hợp lệ (sai origin)."
    },
    { status: 403 }
  );
}

function readStats() {
  if (!fs.existsSync(CATALOG_FILE)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(CATALOG_FILE, "utf8");
    const data = JSON.parse(raw);
    return data.stats || null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  if (!isRequestSameOrigin(request)) {
    return invalidOrigin();
  }

  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Trên Vercel không nên rebuild bằng cách ghi file local. Hãy build lại từ source hoặc dùng storage ngoài."
      },
      { status: 501 }
    );
  }

  const authError = ensureAuthorized(request);
  if (authError) {
    return authError;
  }

  try {
    const result = await execFileAsync(process.execPath, ["scripts/build-data.mjs"], {
      cwd: process.cwd(),
      maxBuffer: 4 * 1024 * 1024
    });

    return NextResponse.json({
      ok: true,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      stats: readStats()
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "Re-index thất bại.",
        stdout: error?.stdout || "",
        stderr: error?.stderr || ""
      },
      { status: 500 }
    );
  }
}

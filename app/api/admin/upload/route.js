import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { hasValidAdminSessionFromRequest, isRequestSameOrigin } from "../../../../lib/admin-auth";

export const runtime = "nodejs";

const ROOT_DIR = process.cwd();
const GUIDE_DIR = path.join(ROOT_DIR, "guidesnpdf");
const ASSETS_DIR = path.join(GUIDE_DIR, "assets");
const DATA_DIR = path.join(ROOT_DIR, "data");
const METADATA_FILE = path.join(DATA_DIR, "upload-metadata.json");

function sanitizeFileName(name) {
  return String(name || "upload.bin")
    .replace(/[\\/]/g, "_")
    .replace(/[<>:\"|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function sanitizeText(value, max = 120) {
  return String(value || "")
    .replace(/[\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function parsePeopleList(value) {
  const items = String(value || "")
    .split(/[\n,;|]/g)
    .map((item) => sanitizeText(item, 80))
    .filter(Boolean);

  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

function decodeHeaderText(request, headerName, max = 120) {
  const raw = request.headers.get(headerName) || "";
  if (!raw) {
    return "";
  }

  try {
    return sanitizeText(decodeURIComponent(raw), max);
  } catch {
    return sanitizeText(raw, max);
  }
}

function decodeHeaderLongText(request, headerName) {
  const raw = request.headers.get(headerName) || "";
  if (!raw) {
    return "";
  }

  try {
    return String(decodeURIComponent(raw));
  } catch {
    return String(raw);
  }
}

async function readMetadata() {
  try {
    const raw = await fs.readFile(METADATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid metadata file");
    }

    return {
      version: 1,
      updatedAt: parsed.updatedAt || "",
      entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {}
    };
  } catch {
    return {
      version: 1,
      updatedAt: "",
      entries: {}
    };
  }
}

async function writeMetadata(metadata) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(METADATA_FILE, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

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

export async function POST(request) {
  if (!isRequestSameOrigin(request)) {
    return invalidOrigin();
  }

  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Trên Vercel, upload vào local disk không bền vững. Hãy dùng home server hoặc object storage (R2/S3)."
      },
      { status: 501 }
    );
  }

  const authError = ensureAuthorized(request);
  if (authError) {
    return authError;
  }

  try {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    const isBinaryUpload = contentType.includes("application/octet-stream");

    let target = "assets";
    let uploadedBy = "";
    let madeBy = "";
    let contributors = [];
    const incoming = [];

    if (isBinaryUpload) {
      target = request.headers.get("x-upload-target") === "html" ? "html" : "assets";
      uploadedBy = decodeHeaderText(request, "x-uploaded-by", 80);
      madeBy = decodeHeaderText(request, "x-made-by", 80);
      contributors = parsePeopleList(decodeHeaderLongText(request, "x-contributors"));

      const incomingName = decodeHeaderText(request, "x-upload-name", 180);
      const safeName = sanitizeFileName(incomingName || "upload.bin");
      const bytes = Buffer.from(await request.arrayBuffer());

      if (!bytes.length) {
        return NextResponse.json(
          {
            ok: false,
            message: "Tệp tải lên đang rỗng."
          },
          { status: 400 }
        );
      }

      incoming.push({
        name: safeName,
        bytes
      });
    } else {
      const formData = await request.formData();
      target = formData.get("target") === "html" ? "html" : "assets";
      uploadedBy = sanitizeText(formData.get("uploadedBy"), 80);
      madeBy = sanitizeText(formData.get("madeBy"), 80);
      contributors = parsePeopleList(formData.get("contributors"));

      const formFiles = formData
        .getAll("files")
        .filter((item) => item && typeof item.arrayBuffer === "function");

      for (const file of formFiles) {
        const safeName = sanitizeFileName(file.name);
        const bytes = Buffer.from(await file.arrayBuffer());

        incoming.push({
          name: safeName,
          bytes
        });
      }
    }

    const targetPath = target === "html" ? GUIDE_DIR : ASSETS_DIR;
    const uploadedAt = new Date().toISOString();

    if (!incoming.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "Không có tệp nào được gửi lên."
        },
        { status: 400 }
      );
    }

    await fs.mkdir(targetPath, { recursive: true });
    const metadata = await readMetadata();

    const saved = [];
    for (const file of incoming) {
      const safeName = sanitizeFileName(file.name);
      const outputPath = path.join(targetPath, safeName);
      const bytes = file.bytes;
      await fs.writeFile(outputPath, bytes);

      saved.push({
        name: safeName,
        size: bytes.byteLength
      });

      const metadataKey = target === "assets" ? `assets/${safeName}` : safeName;
      if (!metadata.entries[metadataKey]) {
        metadata.entries[metadataKey] = {
          uploaders: [],
          makers: [],
          contributors: [],
          history: []
        };
      }

      const entry = metadata.entries[metadataKey];
      entry.uploaders = Array.from(new Set([...(entry.uploaders || []), uploadedBy].filter(Boolean)));
      entry.makers = Array.from(new Set([...(entry.makers || []), madeBy].filter(Boolean)));
      entry.contributors = Array.from(
        new Set([...(entry.contributors || []), ...contributors].filter(Boolean))
      );

      entry.history = [
        ...(entry.history || []),
        {
          uploadedAt,
          uploadedBy: uploadedBy || "",
          madeBy: madeBy || "",
          contributors,
          size: bytes.byteLength,
          target,
          name: safeName
        }
      ].slice(-80);
    }

    metadata.updatedAt = uploadedAt;
    await writeMetadata(metadata);

    return NextResponse.json({
      ok: true,
      target,
      targetPath: target === "html" ? "guidesnpdf" : "guidesnpdf/assets",
      savedCount: saved.length,
      saved,
      metadata: {
        uploadedBy: uploadedBy || null,
        madeBy: madeBy || null,
        contributors
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "Upload thất bại."
      },
      { status: 500 }
    );
  }
}

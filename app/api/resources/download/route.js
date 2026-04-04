import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getResources } from "../../../../lib/data";
import { getRepoContents, getRepoInfo, normalizeResourcePath } from "../../../../lib/github";

export const runtime = "nodejs";

const MAX_FILES = 600;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;
const RAW_HEADERS = {
  Accept: "application/vnd.github.raw",
  "User-Agent": "bigcio-community-site"
};

function sanitizeFileName(value) {
  return String(value || "download")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "download";
}

function getDownloadFileName(resource, folderPath) {
  const repoName = sanitizeFileName(resource?.repo || resource?.id || "repo");
  const normalizedPath = normalizeResourcePath(folderPath);

  if (!normalizedPath) {
    return `${repoName}-root.zip`;
  }

  const lastPart = normalizedPath.split("/").filter(Boolean).pop() || "folder";
  return `${repoName}-${sanitizeFileName(lastPart)}.zip`;
}

function createError(message, status = 400) {
  return NextResponse.json({ message }, { status });
}

function getPathInZip(entryPath, rootPath) {
  const normalizedRoot = normalizeResourcePath(rootPath);
  const normalizedEntry = normalizeResourcePath(entryPath);

  if (!normalizedRoot) {
    return normalizedEntry;
  }

  if (normalizedEntry.startsWith(`${normalizedRoot}/`)) {
    return normalizedEntry.slice(normalizedRoot.length + 1);
  }

  return normalizedEntry.split("/").pop() || normalizedEntry;
}

async function collectFolderFiles(resource, folderPath) {
  const normalizedFolderPath = normalizeResourcePath(folderPath);
  const files = [];

  async function walkFromPath(pathValue) {
    const contentsRes = await getRepoContents(resource, pathValue);
    if (!contentsRes.ok) {
      throw new Error(contentsRes.error || "Cannot read repository contents");
    }

    const entries = contentsRes.data?.entries || [];

    for (const entry of entries) {
      if (entry.type === "dir") {
        await walkFromPath(entry.path);
        continue;
      }

      if (entry.type !== "file" || !entry.downloadUrl) {
        continue;
      }

      files.push(entry);

      if (files.length > MAX_FILES) {
        throw new Error(`Folder too large (more than ${MAX_FILES} files)`);
      }
    }
  }

  const firstRes = await getRepoContents(resource, normalizedFolderPath);
  if (!firstRes.ok) {
    throw new Error(firstRes.error || "Cannot access selected path");
  }

  if (firstRes.data?.isSingleFile) {
    const single = firstRes.data.entries?.[0];
    if (!single || single.type !== "file" || !single.downloadUrl) {
      throw new Error("Selected path is not downloadable");
    }
    files.push(single);
    return {
      rootPath: normalizedFolderPath,
      files
    };
  }

  for (const entry of firstRes.data?.entries || []) {
    if (entry.type === "dir") {
      await walkFromPath(entry.path);
      continue;
    }

    if (entry.type === "file" && entry.downloadUrl) {
      files.push(entry);
      if (files.length > MAX_FILES) {
        throw new Error(`Folder too large (more than ${MAX_FILES} files)`);
      }
    }
  }

  return {
    rootPath: normalizedFolderPath,
    files
  };
}

async function buildFolderZipBuffer(resource, folderPath) {
  const { rootPath, files } = await collectFolderFiles(resource, folderPath);

  if (!files.length) {
    throw new Error("No downloadable files found in selected folder");
  }

  const zip = new JSZip();
  let totalBytes = 0;

  for (const entry of files) {
    const response = await fetch(entry.downloadUrl, { headers: RAW_HEADERS, cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${entry.path}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    totalBytes += bytes.byteLength;

    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("Folder too large to zip (over 120MB)");
    }

    const zipPath = getPathInZip(entry.path, rootPath);
    zip.file(zipPath, bytes);
  }

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const resourceId = url.searchParams.get("resourceId") || "";
  const type = (url.searchParams.get("type") || "folder").toLowerCase();
  const pathParam = normalizeResourcePath(url.searchParams.get("path") || "");

  const resource = getResources().find((item) => item.id === resourceId);
  if (!resource) {
    return createError("Resource not found", 404);
  }

  if (type === "repo") {
    const repoInfoRes = await getRepoInfo(resource);
    const branch = repoInfoRes.ok ? String(repoInfoRes.data?.default_branch || "main") : "main";
    const downloadUrl = `https://github.com/${encodeURIComponent(resource.owner)}/${encodeURIComponent(resource.repo)}/archive/refs/heads/${encodeURIComponent(branch)}.zip`;
    return NextResponse.redirect(downloadUrl, 302);
  }

  try {
    const zipBuffer = await buildFolderZipBuffer(resource, pathParam);
    const fileName = getDownloadFileName(resource, pathParam);

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return createError(error?.message || "Unable to build zip", 500);
  }
}

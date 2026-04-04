const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "bigcio-community-site"
};

const REVALIDATE_SECONDS = 900;

function normalizePath(pathValue) {
  return String(pathValue || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function appendQuery(url, key, value) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
}

async function githubRequest(url) {
  if (!url) {
    return {
      ok: false,
      status: 0,
      error: "Missing GitHub API URL"
    };
  }

  try {
    const response = await fetch(url, {
      headers: GITHUB_HEADERS,
      next: { revalidate: REVALIDATE_SECONDS }
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: json?.message || `GitHub API failed (${response.status})`
      };
    }

    return {
      ok: true,
      status: response.status,
      data: json
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Cannot reach GitHub API"
    };
  }
}

function buildContentsUrl(resource, repoPath) {
  const base = String(resource?.api?.contents || "").replace(/\/+$/g, "");
  const normalizedPath = normalizePath(repoPath);

  if (!base) {
    return "";
  }

  if (!normalizedPath) {
    return base;
  }

  const encodedPath = normalizedPath.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${base}/${encodedPath}`;
}

export function splitPath(pathValue) {
  return normalizePath(pathValue)
    .split("/")
    .filter(Boolean);
}

export function normalizeResourcePath(pathValue) {
  return normalizePath(pathValue);
}

export async function getRepoInfo(resource) {
  const owner = String(resource?.owner || "").trim();
  const repo = String(resource?.repo || "").trim();
  if (!owner || !repo) {
    return {
      ok: false,
      status: 0,
      error: "Invalid owner/repo"
    };
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return githubRequest(url);
}

export async function getRepoReleases(resource, perPage = 10) {
  const base = String(resource?.api?.releases || "").trim();
  const url = appendQuery(base, "per_page", perPage);
  return githubRequest(url);
}

export async function getRepoContents(resource, repoPath = "") {
  const normalizedPath = normalizePath(repoPath);
  const url = buildContentsUrl(resource, normalizedPath);
  const response = await githubRequest(url);

  if (!response.ok) {
    return response;
  }

  const raw = response.data;
  const entries = Array.isArray(raw) ? raw : [raw].filter(Boolean);

  const mappedEntries = entries
    .map((entry) => ({
      name: String(entry?.name || ""),
      path: String(entry?.path || ""),
      type: String(entry?.type || "file"),
      size: Number(entry?.size || 0),
      htmlUrl: String(entry?.html_url || ""),
      downloadUrl: String(entry?.download_url || ""),
      apiUrl: String(entry?.url || "")
    }))
    .filter((entry) => entry.name && entry.path)
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "dir" ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });

  return {
    ok: true,
    status: response.status,
    data: {
      path: normalizedPath,
      isSingleFile: !Array.isArray(raw),
      entries: mappedEntries
    }
  };
}

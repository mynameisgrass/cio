import fs from "node:fs";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "data", "catalog.json");
const RESOURCES_FILE = path.join(process.cwd(), "data", "resources.json");

let cache = null;
let cacheMtimeMs = 0;

function parseGitHubRepo(repoUrl) {
  if (!repoUrl) {
    return { owner: "", repo: "" };
  }

  try {
    const url = new URL(repoUrl);
    const parts = url.pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
    const owner = parts[0] || "";
    const repo = (parts[1] || "").replace(/\.git$/i, "");
    return { owner, repo };
  } catch {
    return { owner: "", repo: "" };
  }
}

function hydrateResource(resource) {
  const repoUrl = String(resource?.repoUrl || "").trim();
  const { owner, repo } = parseGitHubRepo(repoUrl);
  const baseApi = owner && repo ? `https://api.github.com/repos/${owner}/${repo}` : "";

  return {
    ...resource,
    owner,
    repo,
    api: {
      releases: resource?.api?.releases || (baseApi ? `${baseApi}/releases` : ""),
      latestRelease: resource?.api?.latestRelease || (baseApi ? `${baseApi}/releases/latest` : ""),
      contents: resource?.api?.contents || (baseApi ? `${baseApi}/contents` : "")
    }
  };
}

function readCatalog() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(
      "Missing data/catalog.json. Run \"npm run prepare:data\" before starting the app."
    );
  }

  const stat = fs.statSync(DATA_FILE);
  if (cache && stat.mtimeMs === cacheMtimeMs) {
    return cache;
  }

  const raw = fs.readFileSync(DATA_FILE, "utf8");
  cache = JSON.parse(raw);
  cacheMtimeMs = stat.mtimeMs;
  return cache;
}

export function getCatalog() {
  return readCatalog();
}

export function getFiles() {
  return readCatalog().files || [];
}

export function getChannels() {
  return readCatalog().channels || [];
}

export function getPeople() {
  return readCatalog().people || [];
}

export function getFileBySlug(slug) {
  return getFiles().find((file) => file.slug === slug) || null;
}

export function getResources() {
  if (!fs.existsSync(RESOURCES_FILE)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(RESOURCES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const repos = Array.isArray(parsed?.repos) ? parsed.repos : [];
    return repos.map((resource) => hydrateResource(resource));
  } catch {
    return [];
  }
}

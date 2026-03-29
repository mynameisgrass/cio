import fs from "node:fs";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "data", "catalog.json");

let cache = null;
let cacheMtimeMs = 0;

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

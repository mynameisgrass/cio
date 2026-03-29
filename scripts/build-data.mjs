import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { load } from "cheerio";

const ROOT_DIR = process.cwd();
const SOURCE_DIR = path.join(ROOT_DIR, "guidesnpdf");
const SOURCE_ASSETS_DIR = path.join(SOURCE_DIR, "assets");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const PUBLIC_ASSETS_DIR = path.join(PUBLIC_DIR, "assets");
const PUBLIC_ARCHIVE_DIR = path.join(PUBLIC_DIR, "archive");
const DATA_DIR = path.join(ROOT_DIR, "data");
const OUTPUT_FILE = path.join(DATA_DIR, "catalog.json");
const MANUAL_METADATA_FILE = path.join(DATA_DIR, "upload-metadata.json");

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

const TAG_DEFINITIONS = [
  {
    id: "fx-580vnx",
    label: "fx-580VN X",
    kind: "model",
    patterns: [/\b(?:fx[-\s]?)?580vn[-\s]?x\b/i]
  },
  {
    id: "fx-880btg",
    label: "fx-880BTG",
    kind: "model",
    patterns: [/\b(?:fx[-\s]?)?880btg\b/i, /\bfx[-\s]?880\b/i]
  },
  {
    id: "fx-570vn-plus",
    label: "fx-570VN Plus",
    kind: "model",
    patterns: [/\b(?:fx[-\s]?)?570vn[-\s]?plus\b/i]
  },
  {
    id: "fx-570vn-plus-2nd",
    label: "fx-570VN Plus 2nd",
    kind: "model",
    patterns: [/\b570vn[-\s]?plus[-\s]?2nd\b/i, /\b2nd[-\s]?edition\b/i]
  },
  {
    id: "fx-991",
    label: "fx-991",
    kind: "model",
    patterns: [/\bfx[-\s]?991\b/i, /\b991(?:ex|cn)?\b/i]
  },
  {
    id: "resources",
    label: "Resources",
    kind: "group",
    patterns: [/\bresources?\b/i]
  },
  {
    id: "rom",
    label: "ROM",
    kind: "group",
    patterns: [/\brom\b/i]
  },
  {
    id: "files",
    label: "Files",
    kind: "group",
    patterns: [/\bfiles\b/i, /📁/u]
  },
  {
    id: "other",
    label: "Other",
    kind: "group",
    patterns: [/\bother\b/i]
  }
];

const TAG_BY_ID = new Map(TAG_DEFINITIONS.map((tag) => [tag.id, tag]));

const ARCHIVE_AVATAR_STYLE = [
  "<style id=\"bigcio-avatar-fix\">",
  "  .chatlog__avatar-fallback {",
  "    display: inline-flex;",
  "    align-items: center;",
  "    justify-content: center;",
  "    width: 40px;",
  "    height: 40px;",
  "    border-radius: 999px;",
  "    background: linear-gradient(145deg, #d9f7df, #a7e0b5);",
  "    color: #1f5f37;",
  "    font-size: 14px;",
  "    font-weight: 700;",
  "    font-family: Segoe UI, Tahoma, sans-serif;",
  "    text-transform: uppercase;",
  "  }",
  "",
  "  .chatlog__reply .chatlog__avatar-fallback {",
  "    width: 20px;",
  "    height: 20px;",
  "    font-size: 10px;",
  "  }",
  "</style>"
].join("\n");

const ARCHIVE_AVATAR_SCRIPT = [
  "<script id=\"bigcio-avatar-fix-script\">",
  "  (function () {",
  "    function getInitial(img) {",
  "      var message = img.closest('.chatlog__message');",
  "      var author = message ? message.querySelector('.chatlog__author, .chatlog__reply-author') : null;",
  "      var text = author ? author.textContent : '';",
  "      var clean = (text || '').trim();",
  "      return clean ? clean.charAt(0).toUpperCase() : '?';",
  "    }",
  "",
  "    function applyFallback(img) {",
  "      if (!img || img.dataset.bigcioAvatarFixed === '1') {",
  "        return;",
  "      }",
  "",
  "      img.dataset.bigcioAvatarFixed = '1';",
  "      var placeholder = document.createElement('span');",
  "      placeholder.className = 'chatlog__avatar-fallback';",
  "      placeholder.textContent = getInitial(img);",
  "",
  "      var width = img.getAttribute('width');",
  "      var height = img.getAttribute('height');",
  "      if (width) {",
  "        placeholder.style.width = width + 'px';",
  "      }",
  "      if (height) {",
  "        placeholder.style.height = height + 'px';",
  "      }",
  "",
  "      img.replaceWith(placeholder);",
  "    }",
  "",
  "    function watch(img) {",
  "      if (!img) {",
  "        return;",
  "      }",
  "",
  "      img.addEventListener('error', function () {",
  "        applyFallback(img);",
  "      }, { once: true });",
  "",
  "      var src = (img.getAttribute('src') || '').trim();",
  "      if (!src) {",
  "        applyFallback(img);",
  "      }",
  "    }",
  "",
  "    var avatars = document.querySelectorAll('img.chatlog__avatar, img.chatlog__reply-avatar');",
  "    avatars.forEach(watch);",
  "  })();",
  "</script>"
].join("\n");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeIdentity(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function cleanMention(value) {
  const mention = normalizeWhitespace(value).replace(/^@+/, "").trim();
  return mention;
}

function shortHash(value, length = 8) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, length);
}

function slugify(value) {
  const base = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return base || "item";
}

function normalizeChannelName(value) {
  const source = normalizeWhitespace(value).replace(/\.html$/i, "");
  return source
    .replace(/^HACK\s+CASIO\s+-\s+GUIDES\s+CASIO\s+-\s+/i, "")
    .replace(/\s*\[[^\]]+\]\s*$/g, "")
    .trim();
}

function countFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  let count = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(fullPath);
    } else {
      count += 1;
    }
  }

  return count;
}

function toPublicPath(href) {
  const clean = normalizeWhitespace(href).replace(/\\/g, "/").replace(/^\.\//, "");

  if (/^https?:\/\//i.test(clean)) {
    return clean;
  }

  return clean.startsWith("/") ? clean : `/${clean}`;
}

function extractMediaName($anchor) {
  const href = normalizeWhitespace($anchor.attr("href") || "");
  const image = $anchor.find("img.chatlog__attachment-media").first();
  const title = normalizeWhitespace(image.attr("title") || "");
  const match = title.match(/^Image:\s*(.+?)\s*\(/i);

  if (match?.[1]) {
    return normalizeWhitespace(match[1]);
  }

  return normalizeWhitespace(path.basename(href));
}

function extractMediaSize($anchor) {
  const image = $anchor.find("img.chatlog__attachment-media").first();
  const title = normalizeWhitespace(image.attr("title") || "");
  const match = title.match(/\(([^)]+)\)\s*$/);

  return match?.[1] ? normalizeWhitespace(match[1]) : "";
}

function sortText(values) {
  return [...values].sort((a, b) => collator.compare(a, b));
}

function uniqueText(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized) {
      continue;
    }

    const identity = normalizeIdentity(normalized);
    if (seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    result.push(normalized);
  }

  return result;
}

function parseListText(value) {
  return uniqueText(
    String(value || "")
      .split(/[\n,;|]/g)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function inferTagIds(text) {
  const source = String(text || "");
  const result = new Set();

  for (const definition of TAG_DEFINITIONS) {
    if (definition.patterns.some((pattern) => pattern.test(source))) {
      result.add(definition.id);
    }
  }

  return result;
}

function sortTagIds(tagIds) {
  const source = new Set(tagIds || []);
  return TAG_DEFINITIONS.filter((tag) => source.has(tag.id)).map((tag) => tag.id);
}

function mergeManualRecords(...records) {
  const uploaders = [];
  const makers = [];
  const contributors = [];

  for (const record of records) {
    if (!record) {
      continue;
    }

    uploaders.push(...(record.uploaders || []));
    makers.push(...(record.makers || []));
    contributors.push(...(record.contributors || []));
  }

  return {
    uploaders: uniqueText(uploaders),
    makers: uniqueText(makers),
    contributors: uniqueText(contributors)
  };
}

function loadUploadMetadata() {
  if (!fs.existsSync(MANUAL_METADATA_FILE)) {
    return {
      byPath: new Map(),
      byName: new Map()
    };
  }

  try {
    const raw = fs.readFileSync(MANUAL_METADATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const entries = parsed?.entries && typeof parsed.entries === "object" ? parsed.entries : {};

    const byPath = new Map();
    const byNameTemp = new Map();

    for (const [key, value] of Object.entries(entries)) {
      const normalizedPath = normalizeIdentity(key);
      const cleaned = {
        uploaders: uniqueText(value?.uploaders || []),
        makers: uniqueText(value?.makers || []),
        contributors: uniqueText(value?.contributors || [])
      };

      byPath.set(normalizedPath, cleaned);

      const basename = normalizeIdentity(path.basename(key));
      if (!byNameTemp.has(basename)) {
        byNameTemp.set(basename, []);
      }
      byNameTemp.get(basename).push(cleaned);
    }

    const byName = new Map();
    for (const [name, records] of byNameTemp.entries()) {
      byName.set(name, mergeManualRecords(...records));
    }

    return {
      byPath,
      byName
    };
  } catch {
    return {
      byPath: new Map(),
      byName: new Map()
    };
  }
}

function getManualMetadataForHref(manualMetadata, href) {
  const pathKey = normalizeIdentity(href);
  const nameKey = normalizeIdentity(path.basename(href));
  const byPath = manualMetadata.byPath.get(pathKey);
  const byName = manualMetadata.byName.get(nameKey);
  return mergeManualRecords(byPath, byName);
}

function patchArchiveHtml(sourceHtml) {
  let output = sourceHtml;

  // Exported HTML files use relative assets/ paths; after moving into /archive they must be absolute.
  output = output.replace(/([=("'])assets\//g, "$1/assets/");

  if (!output.includes("bigcio-avatar-fix")) {
    if (output.includes("</head>")) {
      output = output.replace("</head>", `${ARCHIVE_AVATAR_STYLE}\n</head>`);
    } else {
      output = `${ARCHIVE_AVATAR_STYLE}\n${output}`;
    }
  }

  if (!output.includes("bigcio-avatar-fix-script")) {
    if (output.includes("</body>")) {
      output = output.replace("</body>", `${ARCHIVE_AVATAR_SCRIPT}\n</body>`);
    } else {
      output = `${output}\n${ARCHIVE_AVATAR_SCRIPT}`;
    }
  }

  return output;
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error("Missing source folder: guidesnpdf");
  }

  ensureDir(PUBLIC_DIR);
  ensureDir(DATA_DIR);

  if (fs.existsSync(SOURCE_ASSETS_DIR)) {
    fs.rmSync(PUBLIC_ASSETS_DIR, { recursive: true, force: true });
    fs.cpSync(SOURCE_ASSETS_DIR, PUBLIC_ASSETS_DIR, { recursive: true });
  }

  fs.rmSync(PUBLIC_ARCHIVE_DIR, { recursive: true, force: true });
  ensureDir(PUBLIC_ARCHIVE_DIR);

  const htmlFiles = fs
    .readdirSync(SOURCE_DIR)
    .filter((name) => name.toLowerCase().endsWith(".html"))
    .sort((a, b) => collator.compare(a, b));

  const manualMetadata = loadUploadMetadata();

  const channels = [];
  const filesByKey = new Map();

  for (const htmlFile of htmlFiles) {
    const htmlPath = path.join(SOURCE_DIR, htmlFile);
    const htmlSource = fs.readFileSync(htmlPath, "utf8");
    const $ = load(htmlSource);

    const title = normalizeWhitespace($("title").first().text()) || htmlFile;
    const channelName = normalizeChannelName(title) || normalizeChannelName(htmlFile);
    const channelTagIds = inferTagIds(`${channelName} ${htmlFile}`);
    if (!channelTagIds.size) {
      channelTagIds.add("other");
    }

    const channelId = `${slugify(channelName)}-${shortHash(htmlFile, 6)}`;
    const archiveFileName = `${slugify(path.basename(htmlFile, ".html"))}-${shortHash(htmlFile, 8)}.html`;
    const archiveHtml = patchArchiveHtml(htmlSource);
    fs.writeFileSync(path.join(PUBLIC_ARCHIVE_DIR, archiveFileName), archiveHtml, "utf8");

    const channel = {
      id: channelId,
      name: channelName,
      sourceHtml: htmlFile,
      archivePath: `/archive/${archiveFileName}`,
      fileIds: new Set(),
      tagIds: channelTagIds,
      messageCount: 0
    };

    channels.push(channel);

    $(".chatlog__message-group").each((_, groupNode) => {
      const $group = $(groupNode);
      const firstAuthor = $group
        .find("> .chatlog__message-container > .chatlog__message > .chatlog__message-primary > .chatlog__header .chatlog__author")
        .first();

      const fallbackAuthor = normalizeWhitespace(firstAuthor.text()) || "Unknown";
      const fallbackHandle = normalizeWhitespace(firstAuthor.attr("title") || fallbackAuthor);

      $group.find("> .chatlog__message-container").each((__, containerNode) => {
        const $container = $(containerNode);
        channel.messageCount += 1;

        const ownAuthor = $container
          .find("> .chatlog__message > .chatlog__message-primary > .chatlog__header .chatlog__author")
          .first();

        const ownerName = normalizeWhitespace(ownAuthor.text()) || fallbackAuthor;
        const ownerHandle = normalizeWhitespace(ownAuthor.attr("title") || fallbackHandle || ownerName);
        const messageIdRaw = normalizeWhitespace($container.attr("data-message-id") || $container.attr("id") || "");
        const messageId = messageIdRaw.replace(/^chatlog__message-container-/, "");

        const timestamp = normalizeWhitespace(
          $container
            .find("> .chatlog__message > .chatlog__message-primary > .chatlog__header .chatlog__timestamp")
            .first()
            .attr("title") || $container.find(".chatlog__short-timestamp").first().attr("title") || ""
        );

        const mentions = new Set();
        $container.find(".chatlog__content .chatlog__markdown-mention").each((___, mentionNode) => {
          const $mention = $(mentionNode);
          const text = normalizeWhitespace($mention.text());
          const titleText = normalizeWhitespace($mention.attr("title") || "");
          const mention = cleanMention(text || titleText);

          const normalizedMention = normalizeIdentity(mention);
          const isChannelMention = mention.startsWith("#");
          const isBroadcastMention = normalizedMention === "everyone" || normalizedMention === "here";

          if (mention && !isChannelMention && !isBroadcastMention) {
            mentions.add(mention);
          }
        });

        const attachments = [];

        $container.find(".chatlog__attachment-generic").each((___, genericNode) => {
          const $generic = $(genericNode);
          const $link = $generic.find(".chatlog__attachment-generic-name a").first();
          const href = normalizeWhitespace($link.attr("href") || "");

          if (!href) {
            return;
          }

          const displayName = normalizeWhitespace($link.text()) || normalizeWhitespace(path.basename(href));
          const sizeText = normalizeWhitespace($generic.find(".chatlog__attachment-generic-size").first().text());

          attachments.push({
            href,
            displayName,
            sizeText,
            sourceType: "generic"
          });
        });

        $container.find("> .chatlog__message > .chatlog__message-primary > .chatlog__attachment > a[href]").each((___, mediaNode) => {
          const $anchor = $(mediaNode);
          const href = normalizeWhitespace($anchor.attr("href") || "");

          if (!href) {
            return;
          }

          if (attachments.some((item) => normalizeIdentity(item.href) === normalizeIdentity(href))) {
            return;
          }

          attachments.push({
            href,
            displayName: extractMediaName($anchor),
            sizeText: extractMediaSize($anchor),
            sourceType: "media"
          });
        });

        for (const attachment of attachments) {
          const href = normalizeWhitespace(attachment.href).replace(/\\/g, "/").replace(/^\.\//, "");

          if (!href) {
            continue;
          }

          const normalizedKey = href.toLowerCase();
          const name = attachment.displayName || path.basename(href);
          const extension = path.extname(name || href).replace(/^\./, "").toLowerCase();
          const referenceMentions = sortText([...mentions]);

          if (!filesByKey.has(normalizedKey)) {
            filesByKey.set(normalizedKey, {
              id: `file-${shortHash(`${normalizedKey}-${name}`, 10)}`,
              slug: `${slugify(name)}-${shortHash(normalizedKey, 6)}`,
              name,
              href,
              publicPath: toPublicPath(href),
              extension,
              sizeText: attachment.sizeText || "",
              sourceType: attachment.sourceType,
              channels: new Set(),
              owners: new Set(),
              contributors: new Set(),
              tagIds: new Set(),
              references: []
            });
          }

          const fileEntry = filesByKey.get(normalizedKey);

          if (!fileEntry.sizeText && attachment.sizeText) {
            fileEntry.sizeText = attachment.sizeText;
          }

          fileEntry.channels.add(channel.id);
          if (ownerName) {
            fileEntry.owners.add(ownerName);
          }

          for (const tagId of channel.tagIds) {
            fileEntry.tagIds.add(tagId);
          }

          for (const tagId of inferTagIds(`${name} ${href}`)) {
            fileEntry.tagIds.add(tagId);
          }

          for (const mention of referenceMentions) {
            fileEntry.contributors.add(mention);
          }

          const sourceMessageUrl = messageId
            ? `${channel.archivePath}#chatlog__message-container-${messageId}`
            : channel.archivePath;

          fileEntry.references.push({
            channelId: channel.id,
            owner: ownerName,
            ownerHandle,
            messageId,
            timestamp,
            mentions: referenceMentions,
            sourceMessageUrl
          });

          channel.fileIds.add(fileEntry.id);
        }
      });
    });
  }

  const channelById = new Map(channels.map((channel) => [channel.id, channel]));

  const files = [...filesByKey.values()]
    .map((entry) => {
      const manual = getManualMetadataForHref(manualMetadata, entry.href);

      const owners = sortText([...entry.owners]);
      const ownerSet = new Set(owners.map((name) => normalizeIdentity(name)));
      const contributors = sortText(uniqueText([...entry.contributors, ...manual.contributors])).filter(
        (name) => !ownerSet.has(normalizeIdentity(name))
      );

      const uploaders = sortText(manual.uploaders);
      const makers = sortText(manual.makers);

      const tagIds = new Set(entry.tagIds);
      if (!tagIds.size) {
        tagIds.add("other");
      }
      const sortedTagIds = sortTagIds(tagIds);
      const tags = sortedTagIds.map((tagId) => TAG_BY_ID.get(tagId)?.label || tagId);
      const channels = sortText(
        [...entry.channels].map((channelId) => channelById.get(channelId)?.name || channelId)
      );

      return {
        id: entry.id,
        slug: entry.slug,
        name: entry.name,
        href: entry.href,
        publicPath: entry.publicPath,
        extension: entry.extension,
        isPdf: entry.extension === "pdf",
        sizeText: entry.sizeText,
        sourceType: entry.sourceType,
        channels,
        channelIds: sortText([...entry.channels]),
        tagIds: sortedTagIds,
        tags,
        primaryTagId: sortedTagIds[0] || "other",
        primaryTag: tags[0] || "Other",
        owners,
        uploaders,
        makers,
        contributors,
        ownerAndContributors: sortText([...new Set([...owners, ...contributors])]),
        searchText: normalizeIdentity(
          [
            entry.name,
            entry.href,
            ...channels,
            ...tags,
            ...owners,
            ...uploaders,
            ...makers,
            ...contributors
          ].join(" | ")
        ),
        references: entry.references
      };
    })
    .sort((a, b) => collator.compare(a.name, b.name));

  const peopleMap = new Map();
  for (const file of files) {
    for (const owner of file.owners) {
      const key = normalizeIdentity(owner);
      if (!peopleMap.has(key)) {
        peopleMap.set(key, { name: owner, ownedFiles: 0, contributedFiles: 0, files: new Set() });
      }
      const person = peopleMap.get(key);
      person.name = owner;
      person.ownedFiles += 1;
      person.files.add(file.id);
    }

    for (const uploader of file.uploaders || []) {
      const key = normalizeIdentity(uploader);
      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          name: uploader,
          ownedFiles: 0,
          contributedFiles: 0,
          uploadedFiles: 0,
          madeFiles: 0,
          files: new Set()
        });
      }
      const person = peopleMap.get(key);
      person.name = uploader;
      person.uploadedFiles += 1;
      person.files.add(file.id);
    }

    for (const maker of file.makers || []) {
      const key = normalizeIdentity(maker);
      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          name: maker,
          ownedFiles: 0,
          contributedFiles: 0,
          uploadedFiles: 0,
          madeFiles: 0,
          files: new Set()
        });
      }
      const person = peopleMap.get(key);
      person.name = maker;
      person.madeFiles += 1;
      person.files.add(file.id);
    }

    for (const contributor of file.contributors) {
      const key = normalizeIdentity(contributor);
      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          name: contributor,
          ownedFiles: 0,
          contributedFiles: 0,
          uploadedFiles: 0,
          madeFiles: 0,
          files: new Set()
        });
      }
      const person = peopleMap.get(key);
      person.name = contributor;
      person.contributedFiles += 1;
      person.files.add(file.id);
    }
  }

  const people = [...peopleMap.values()]
    .map((person) => ({
      name: person.name,
      ownedFiles: person.ownedFiles,
      contributedFiles: person.contributedFiles,
      uploadedFiles: person.uploadedFiles || 0,
      madeFiles: person.madeFiles || 0,
      totalFiles: person.files.size
    }))
    .sort((a, b) => b.totalFiles - a.totalFiles || collator.compare(a.name, b.name));

  const finalizedChannels = channels
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      sourceHtml: channel.sourceHtml,
      archivePath: channel.archivePath,
      tagIds: sortTagIds(channel.tagIds),
      tags: sortTagIds(channel.tagIds).map((tagId) => TAG_BY_ID.get(tagId)?.label || tagId),
      messageCount: channel.messageCount,
      fileCount: channel.fileIds.size,
      fileIds: sortText([...channel.fileIds])
    }))
    .sort((a, b) => collator.compare(a.name, b.name));

  const tags = TAG_DEFINITIONS.map((definition) => {
    const channelCount = finalizedChannels.filter((channel) => channel.tagIds.includes(definition.id)).length;
    const fileCount = files.filter((file) => file.tagIds.includes(definition.id)).length;

    return {
      id: definition.id,
      label: definition.label,
      kind: definition.kind,
      channelCount,
      fileCount
    };
  })
    .filter((tag) => tag.channelCount > 0 || tag.fileCount > 0)
    .sort((a, b) => b.fileCount - a.fileCount || collator.compare(a.label, b.label));

  const stats = {
    htmlFiles: htmlFiles.length,
    sourceAssets: countFilesRecursive(SOURCE_ASSETS_DIR),
    publicAssets: countFilesRecursive(PUBLIC_ASSETS_DIR),
    indexedFiles: files.length,
    indexedPdfFiles: files.filter((file) => file.isPdf).length,
    tagCount: tags.length,
    manualMetadataEntries: manualMetadata.byPath.size,
    uniquePeople: people.length,
    generatedFrom: "guidesnpdf"
  };

  const output = {
    generatedAt: new Date().toISOString(),
    stats,
    channels: finalizedChannels,
    tags,
    files,
    people
  };

  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    `[catalog] HTML: ${stats.htmlFiles}, indexed files: ${stats.indexedFiles}, PDFs: ${stats.indexedPdfFiles}`
  );
}

main();

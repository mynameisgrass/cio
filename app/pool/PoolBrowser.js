"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Fuse from "fuse.js";

export default function PoolBrowser({ files, tags, initialTag, initialQuery }) {
  const [query, setQuery] = useState(initialQuery || "");
  const [activeTag, setActiveTag] = useState(initialTag || "all");
  const [fileType, setFileType] = useState("all");
  const [sortMode, setSortMode] = useState("smart");

  const extensions = useMemo(() => {
    const values = new Set();
    files.forEach((file) => {
      if (file.extension) {
        values.add(file.extension.toLowerCase());
      }
    });

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const fuse = useMemo(() => {
    return new Fuse(files, {
      includeScore: true,
      threshold: 0.36,
      ignoreLocation: true,
      minMatchCharLength: 2,
      keys: [
        { name: "name", weight: 0.42 },
        { name: "tags", weight: 0.2 },
        { name: "channels", weight: 0.12 },
        { name: "owners", weight: 0.1 },
        { name: "contributors", weight: 0.08 },
        { name: "makers", weight: 0.05 },
        { name: "uploaders", weight: 0.03 }
      ]
    });
  }, [files]);

  const visibleFiles = useMemo(() => {
    const text = query.trim();
    let result = files;
    const searchScoreById = new Map();

    if (text.length >= 2) {
      const hits = fuse.search(text);
      result = hits.map((item) => item.item);
      hits.forEach((item) => {
        searchScoreById.set(item.item.id, item.score ?? 1);
      });
    } else if (text.length === 1) {
      const lower = text.toLowerCase();
      result = files.filter((file) => file.searchText?.includes(lower));
    }

    result = result.filter((file) => {
      if (activeTag !== "all" && !file.tagIds?.includes(activeTag)) {
        return false;
      }

      if (fileType !== "all" && file.extension !== fileType) {
        return false;
      }

      return true;
    });

    function smartScore(file) {
      const contributorPoints = (file.contributors?.length || 0) * 4;
      const makerPoints = (file.makers?.length || 0) * 3;
      const uploaderPoints = (file.uploaders?.length || 0) * 2;
      const ownerPoints = file.owners?.length || 0;
      const pdfBonus = file.isPdf ? 1 : 0;
      const relevance = searchScoreById.has(file.id)
        ? (1 - (searchScoreById.get(file.id) ?? 1)) * 10
        : 0;

      return contributorPoints + makerPoints + uploaderPoints + ownerPoints + pdfBonus + relevance;
    }

    if (sortMode === "name-asc") {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base" }));
    } else if (sortMode === "name-desc") {
      result = [...result].sort((a, b) => b.name.localeCompare(a.name, "vi", { sensitivity: "base" }));
    } else {
      result = [...result].sort((a, b) => {
        const scoreDiff = smartScore(b) - smartScore(a);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        return a.name.localeCompare(b.name, "vi", { sensitivity: "base" });
      });
    }

    return result;
  }, [query, files, activeTag, fileType, sortMode, fuse]);

  return (
    <section className="stack gap-md reveal delay-1">
      <div className="pool-controls">
        <div className="pool-search">
          <label htmlFor="pool-search-input">Tìm kiếm (fuzzy)</label>
          <input
            id="pool-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên file, owner, contributor, tag..."
          />
        </div>

        <div className="pool-selectors">
          <label htmlFor="pool-file-type">Định dạng</label>
          <select
            id="pool-file-type"
            value={fileType}
            onChange={(event) => setFileType(event.target.value)}
          >
            <option value="all">Tất cả</option>
            {extensions.map((extension) => (
              <option key={extension} value={extension}>
                .{extension}
              </option>
            ))}
          </select>
        </div>

        <div className="pool-selectors">
          <label htmlFor="pool-sort-mode">Sắp xếp</label>
          <select
            id="pool-sort-mode"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value)}
          >
            <option value="smart">Thông minh (AI gợi ý)</option>
            <option value="name-asc">Tên A-Z</option>
            <option value="name-desc">Tên Z-A</option>
          </select>
        </div>
      </div>

      <div className="tag-list">
        <button
          type="button"
          className={`tag-chip ${activeTag === "all" ? "active" : ""}`}
          onClick={() => setActiveTag("all")}
        >
          Tất cả ({files.length})
        </button>
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className={`tag-chip ${activeTag === tag.id ? "active" : ""}`}
            onClick={() => setActiveTag(tag.id)}
          >
            {tag.label} ({tag.fileCount})
          </button>
        ))}
      </div>

      <p className="pool-meta">
        Đang hiển thị {visibleFiles.length}/{files.length} file
        {activeTag !== "all" ? ` | tag: ${activeTag}` : ""}
        {fileType !== "all" ? ` | type: .${fileType}` : ""}
      </p>

      <div className="card-grid">
        {visibleFiles.map((file) => (
          <article key={file.id} className="file-card">
            <div className="file-card-head">
              <h3>
                <Link href={`/files/${file.slug}`}>{file.name}</Link>
              </h3>
              {file.isPdf ? <span className="badge">PDF</span> : null}
            </div>

            <p>
              <strong>Tags:</strong> {file.tags?.join(", ") || "Không có"}
            </p>
            <p>
              <strong>Chủ sở hữu:</strong> {file.owners?.join(", ") || "Chưa rõ"}
            </p>
            <p>
              <strong>Contributors:</strong>{" "}
              {file.contributors?.length ? file.contributors.join(", ") : "Không có"}
            </p>
            <p>
              <strong>Người upload:</strong> {file.uploaders?.join(", ") || "Chưa khai báo"}
            </p>
            <p>
              <strong>Người tạo:</strong> {file.makers?.join(", ") || "Chưa khai báo"}
            </p>

            <div className="file-card-actions">
              <a href={file.publicPath} target="_blank" rel="noreferrer">
                Mở tệp
              </a>
              <Link href={`/files/${file.slug}`}>Chi tiết</Link>
            </div>
          </article>
        ))}

        {!visibleFiles.length ? (
          <article className="file-card">
            <h3>Không tìm thấy kết quả phù hợp</h3>
            <p>Thử đổi từ khóa, bỏ bớt bộ lọc, hoặc chọn tag khác.</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}

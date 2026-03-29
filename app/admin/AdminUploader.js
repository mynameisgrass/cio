"use client";

import { useMemo, useState } from "react";

function formatBytes(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function AdminUploader() {
  const [target, setTarget] = useState("assets");
  const [uploadedBy, setUploadedBy] = useState("");
  const [madeBy, setMadeBy] = useState("");
  const [contributorsText, setContributorsText] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [message, setMessage] = useState("");
  const [log, setLog] = useState("");

  const totalSize = useMemo(() => {
    return files.reduce((sum, file) => sum + (file.size || 0), 0);
  }, [files]);

  async function handleUpload(event) {
    event.preventDefault();

    if (!files.length) {
      setMessage("Bạn chưa chọn tệp nào.");
      return;
    }

    try {
      setUploading(true);
      setMessage("");

      const allSaved = [];
      let resolvedTargetPath = target === "html" ? "guidesnpdf" : "guidesnpdf/assets";
      let resolvedMetadata = {
        uploadedBy: uploadedBy || null,
        madeBy: madeBy || null,
        contributors: contributorsText
          .split(/[\n,;|]/g)
          .map((item) => item.trim())
          .filter(Boolean)
      };

      for (const file of files) {
          const response = await fetch("/api/admin/upload/", {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "x-upload-target": target,
              "x-upload-name": encodeURIComponent(file.name),
              "x-uploaded-by": encodeURIComponent(uploadedBy),
              "x-made-by": encodeURIComponent(madeBy),
              "x-contributors": encodeURIComponent(contributorsText)
            },
            body: await file.arrayBuffer()
          });

        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.message || "Upload thất bại");
        }

        resolvedTargetPath = data.targetPath || resolvedTargetPath;
        resolvedMetadata = data.metadata || resolvedMetadata;
        allSaved.push(...(data.saved || []));
      }

      const summary = allSaved.map((entry) => `- ${entry.name} (${formatBytes(entry.size)})`).join("\n");

      const metadataSummary = [
        `Uploader: ${resolvedMetadata?.uploadedBy || "(không có)"}`,
        `Maker: ${resolvedMetadata?.madeBy || "(không có)"}`,
        `Contributors: ${(resolvedMetadata?.contributors || []).join(", ") || "(không có)"}`
      ].join("\n");

      setMessage(`Upload thành công ${allSaved.length} tệp vào ${resolvedTargetPath}.`);
      setLog(`${metadataSummary}\n\n${summary}`);
      setFiles([]);
    } catch (error) {
      setMessage(error.message || "Upload thất bại.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRebuild() {
    try {
      setRebuilding(true);
      setMessage("");

      const response = await fetch("/api/admin/rebuild/", {
        method: "POST"
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Re-index thất bại");
      }

      setMessage(
        `Re-index xong. Index được ${data.stats?.indexedFiles ?? "?"} tệp, ${data.stats?.indexedPdfFiles ?? "?"} file PDF.`
      );
      setLog([data.stdout || "", data.stderr || ""].filter(Boolean).join("\n").trim());
    } catch (error) {
      setMessage(error.message || "Re-index thất bại.");
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <div className="admin-grid">
      <form className="admin-form" onSubmit={handleUpload}>
        <label htmlFor="target">Vị trí upload</label>
        <select id="target" value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="assets">guidesnpdf/assets (PDF, DOCX, TXT, images...)</option>
          <option value="html">guidesnpdf (HTML channel exports)</option>
        </select>

        <label htmlFor="uploadedBy">Người upload</label>
        <input
          id="uploadedBy"
          type="text"
          value={uploadedBy}
          onChange={(event) => setUploadedBy(event.target.value)}
          placeholder="Ví dụ: ShakePeare"
        />

        <label htmlFor="madeBy">Người tạo (maker)</label>
        <input
          id="madeBy"
          type="text"
          value={madeBy}
          onChange={(event) => setMadeBy(event.target.value)}
          placeholder="Ví dụ: Thiêu Phóng"
        />

        <label htmlFor="contributors">Contributors (tách bằng dấu phẩy hoặc xuống dòng)</label>
        <textarea
          id="contributors"
          rows={4}
          value={contributorsText}
          onChange={(event) => setContributorsText(event.target.value)}
          placeholder="Ví dụ: User A, User B"
        />

        <label htmlFor="files">Chọn tệp</label>
        <input
          id="files"
          type="file"
          multiple
          onChange={(event) => setFiles(Array.from(event.target.files || []))}
        />

        <p className="muted">
          Đã chọn {files.length} tệp, tổng {formatBytes(totalSize)}.
        </p>

        <div className="hero-actions">
          <button type="submit" className="button button-main" disabled={uploading || rebuilding}>
            {uploading ? "Đang upload..." : "Upload"}
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={handleRebuild}
            disabled={uploading || rebuilding}
          >
            {rebuilding ? "Đang re-index..." : "Re-index catalog"}
          </button>
        </div>

        {message ? <div className="admin-alert">{message}</div> : null}
      </form>

      <div className="admin-help">
        <h3>Quy trình nhanh</h3>
        <p>1) Điền thông tin người upload, người tạo, contributors.</p>
        <p>2) Upload tệp mới vào đúng mục.</p>
        <p>3) Bấm Re-index catalog để cập nhật dữ liệu.</p>
        <p>4) Refresh trang Thư viện, Pool, Đóng góp để thấy kết quả mới.</p>

        <h3>Log</h3>
        <div className="admin-log">{log || "Chưa có log."}</div>
      </div>
    </div>
  );
}

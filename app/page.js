import Link from "next/link";
import { getCatalog } from "../lib/data";

function formatNumber(value) {
  return new Intl.NumberFormat("vi-VN").format(value || 0);
}

export default function HomePage() {
  const catalog = getCatalog();
  const files = catalog.files || [];
  const channels = catalog.channels || [];
  const tags = (catalog.tags || []).filter((tag) => tag.fileCount > 0);
  const people = catalog.people || [];
  const firstPdf = files.find((file) => file.isPdf);

  const featuredFiles = [...files]
    .sort((a, b) => {
      if (a.isPdf !== b.isPdf) {
        return Number(b.isPdf) - Number(a.isPdf);
      }
      return b.ownerAndContributors.length - a.ownerAndContributors.length;
    })
    .slice(0, 32);

  return (
    <div className="stack gap-xl">
      <section className="hero reveal">
        <div>
          <p className="eyebrow">Cộng Đồng Mod Casio</p>
          <h1>Thư viện tài liệu, model tags và người đóng góp trong một giao diện</h1>
          <p className="hero-copy">
            Hệ thống đọc các kênh HTML đã export, index attachment trong assets, map owner,
            contributor, uploader, maker và tách theo category tags như 580VN X, 880BTG, 570VN Plus.
          </p>

          <div className="hero-actions">
            <Link href="/pool" className="button button-main">
              Mở Pool tìm kiếm
            </Link>
            <Link href="/contributors" className="button button-ghost">
              Mở bảng đóng góp
            </Link>
            <a href={firstPdf ? firstPdf.publicPath : "/contributors"} className="button button-ghost">
              Mở nhanh một file PDF
            </a>
          </div>
        </div>

        <div className="hero-panel">
          <h2>Thống kê nhanh</h2>
          <div className="stat-grid">
            <article>
              <span>Số tệp đã index</span>
              <strong>{formatNumber(catalog.stats?.indexedFiles)}</strong>
            </article>
            <article>
              <span>Số guide PDF</span>
              <strong>{formatNumber(catalog.stats?.indexedPdfFiles)}</strong>
            </article>
            <article>
              <span>Số kênh</span>
              <strong>{formatNumber(channels.length)}</strong>
            </article>
            <article>
              <span>Số thành viên</span>
              <strong>{formatNumber(people.length)}</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="stack gap-md reveal delay-1">
        <div className="section-head">
          <h2>Category tags</h2>
          <Link href="/pool">Tất cả trong Pool</Link>
        </div>

        <div className="tag-list">
          {tags.map((tag) => (
            <Link key={tag.id} href={`/pool?tag=${encodeURIComponent(tag.id)}`} className="tag-chip link-chip">
              {tag.label} ({tag.fileCount})
            </Link>
          ))}
        </div>
      </section>

      <section className="stack gap-md reveal delay-2">
        <div className="section-head">
          <h2>Tệp nổi bật</h2>
          <Link href="/contributors">Xem map owner + contributor</Link>
        </div>

        <div className="card-grid">
          {featuredFiles.map((file) => (
            <article key={file.id} className="file-card">
              <div className="file-card-head">
                <h3>
                  <Link href={`/files/${file.slug}`}>{file.name}</Link>
                </h3>
                {file.isPdf ? <span className="badge">PDF</span> : null}
              </div>

              <p>
                <strong>Chủ sở hữu:</strong> {file.owners.join(", ") || "Chưa rõ"}
              </p>
              <p>
                <strong>Người đóng góp:</strong>{" "}
                {file.contributors.length ? file.contributors.join(", ") : "Không có mention"}
              </p>
              <p>
                <strong>Kênh:</strong> {file.channels.join(", ") || "Chưa rõ"}
              </p>
              <p>
                <strong>Tags:</strong> {file.tags?.join(", ") || "Không có"}
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
        </div>
      </section>

      <section className="stack gap-md reveal delay-2">
        <div className="section-head">
          <h2>Độ phủ theo kênh</h2>
        </div>

        <div className="channel-grid">
          {channels.map((channel) => (
            <article key={channel.id} className="channel-card">
              <h3>{channel.name}</h3>
              <p>
                <strong>Tags:</strong> {channel.tags?.join(", ") || "Không có"}
              </p>
              <p>{channel.fileCount} tệp đã index</p>
              <p>{channel.messageCount} tin nhắn đã quét</p>
              <a href={channel.archivePath} target="_blank" rel="noreferrer">
                Mở HTML gốc
              </a>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

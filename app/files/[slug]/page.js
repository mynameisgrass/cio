import Link from "next/link";
import { notFound } from "next/navigation";
import { getFileBySlug, getFiles } from "../../../lib/data";

export const dynamicParams = false;

export function generateStaticParams() {
  return getFiles().map((file) => ({ slug: file.slug }));
}

export function generateMetadata({ params }) {
  const file = getFileBySlug(params.slug);

  if (!file) {
    return {
      title: "Không tìm thấy tệp"
    };
  }

  return {
    title: file.name
  };
}

export default function FileDetailPage({ params }) {
  const file = getFileBySlug(params.slug);

  if (!file) {
    notFound();
  }

  return (
    <div className="stack gap-lg">
      <section className="reveal">
        <p className="eyebrow">Chi Tiết Tệp</p>
        <h1>{file.name}</h1>
        <p className="hero-copy">
          <strong>Chủ sở hữu:</strong> {file.owners.join(", ") || "Chưa rõ"}
          <br />
          <strong>Người đóng góp:</strong>{" "}
          {file.contributors.length ? file.contributors.join(", ") : "Không có mention"}
          <br />
          <strong>Người upload:</strong> {file.uploaders?.join(", ") || "Chưa khai báo"}
          <br />
          <strong>Người tạo:</strong> {file.makers?.join(", ") || "Chưa khai báo"}
          <br />
          <strong>Tags:</strong> {file.tags?.join(", ") || "Không có"}
          <br />
          <strong>Định dạng:</strong> {file.extension || "Chưa rõ"}
          {file.sizeText ? (
            <>
              <br />
              <strong>Dung lượng:</strong> {file.sizeText}
            </>
          ) : null}
        </p>

        <div className="hero-actions">
          <a href={file.publicPath} target="_blank" rel="noreferrer" className="button button-main">
            Mở tệp
          </a>
          <Link href="/contributors" className="button button-ghost">
            Về bảng đóng góp
          </Link>
        </div>
      </section>

      <section className="stack gap-md reveal delay-1">
        <div className="section-head">
          <h2>Owner + Contributors</h2>
        </div>

        <article className="file-card">
          <p>
            {file.ownerAndContributors.length
              ? file.ownerAndContributors.join(", ")
              : "Tin nhắn này không có metadata đóng góp"}
          </p>
          <p>
            <strong>Xuất hiện trong các kênh:</strong> {file.channels.join(", ") || "Chưa rõ"}
          </p>
        </article>
      </section>

      <section className="stack gap-md reveal delay-2">
        <div className="section-head">
          <h2>Tin nhắn nguồn</h2>
        </div>

        <div className="card-grid">
          {file.references.map((reference, index) => (
            <article key={`${file.id}-${reference.messageId || index}`} className="file-card">
              <p>
                <strong>ID kênh:</strong> {reference.channelId}
              </p>
              <p>
                <strong>Chủ sở hữu:</strong> {reference.owner || "Chưa rõ"}
              </p>
              <p>
                <strong>Mention:</strong>{" "}
                {reference.mentions?.length ? reference.mentions.join(", ") : "Không có"}
              </p>
              <p>
                <strong>Thời gian:</strong> {reference.timestamp || "Chưa rõ"}
              </p>
              <a href={reference.sourceMessageUrl} target="_blank" rel="noreferrer">
                Mở tin nhắn trong HTML gốc
              </a>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

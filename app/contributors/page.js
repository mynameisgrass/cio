import Link from "next/link";
import { getFiles } from "../../lib/data";

export const metadata = {
  title: "Đóng góp"
};

export default function ContributorsPage() {
  const files = getFiles()
    .filter((file) => file.owners.length || file.contributors.length)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  return (
    <div className="stack gap-lg">
      <section className="reveal">
        <p className="eyebrow">Bảng Đóng Góp</p>
        <h1>File -&gt; Owner + Contributors</h1>
        <p className="hero-copy">
          Mỗi dòng dưới đây được tạo từ tin nhắn HTML gốc. Nếu tin nhắn có mention thì các tên đó
          sẽ được tính là người đóng góp cho tệp. Ngoài ra bảng này còn hiển uploader/maker từ trang
          admin.
        </p>
      </section>

      <section className="table-shell reveal delay-1">
        <table className="matrix-table">
          <thead>
            <tr>
              <th>Tep</th>
              <th>Owner + Contributors</th>
              <th>Uploader + Maker</th>
              <th>Tags</th>
              <th>Kênh</th>
            </tr>
          </thead>

          <tbody>
            {files.map((file) => (
              <tr key={file.id}>
                <td data-label="Tệp">
                  <div className="cell-file">
                    <Link href={`/files/${file.slug}`}>{file.name}</Link>
                    {file.isPdf ? <span className="badge">PDF</span> : null}
                  </div>
                </td>

                <td data-label="Owner + Contributors">
                  {file.ownerAndContributors.length
                    ? file.ownerAndContributors.join(", ")
                    : "Tin nhắn này không có metadata đóng góp"}
                </td>

                <td data-label="Uploader + Maker">
                  Uploader: {file.uploaders?.join(", ") || "Chưa khai báo"}
                  <br />
                  Maker: {file.makers?.join(", ") || "Chưa khai báo"}
                </td>

                <td data-label="Tags">{file.tags?.join(", ") || "Không có"}</td>

                <td data-label="Kênh">{file.channels.join(", ") || "Chưa rõ"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

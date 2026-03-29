import Link from "next/link";

export default function NotFound() {
  return (
    <section className="stack gap-md reveal">
      <p className="eyebrow">Không Tìm Thấy</p>
      <h1>Không tồn tại trang tệp này</h1>
      <p className="hero-copy">Slug này không có trong dữ liệu catalog đã tạo.</p>
      <p>
        <Link href="/">Quay lại thư viện</Link>
      </p>
    </section>
  );
}

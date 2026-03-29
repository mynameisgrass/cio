import PoolBrowser from "./PoolBrowser";
import { getCatalog } from "../../lib/data";

export const metadata = {
  title: "Pool tìm kiếm"
};

export default function PoolPage({ searchParams }) {
  const catalog = getCatalog();
  const files = catalog.files || [];
  const tags = catalog.tags || [];

  const initialTag = typeof searchParams?.tag === "string" ? searchParams.tag : "all";
  const initialQuery = typeof searchParams?.q === "string" ? searchParams.q : "";

  return (
    <div className="stack gap-lg">
      <section className="reveal">
        <p className="eyebrow">Pool Tìm Kiếm</p>
        <h1>Toàn bộ file trong một nơi</h1>
        <p className="hero-copy">
          Đây là pool tổng hợp tất cả file đã index. Bạn có thể tìm theo fuzzy search, lọc theo tag
          (580VN X, 880BTG, 570VN Plus...), lọc theo định dạng và sắp xếp thông minh.
        </p>
      </section>

      <PoolBrowser files={files} tags={tags} initialTag={initialTag} initialQuery={initialQuery} />
    </div>
  );
}

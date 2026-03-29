import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminUploader from "../AdminUploader";
import AdminLogoutButton from "../AdminLogoutButton";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "../../../lib/admin-auth";

export const metadata = {
  title: "Bảng điều khiển Admin"
};

export default function AdminPanelPage() {
  const isVercel = Boolean(process.env.VERCEL);
  const cookieStore = cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value || "";
  const loggedIn = verifySessionToken(token);

  if (!loggedIn) {
    redirect("/admin");
  }

  return (
    <div className="stack gap-lg">
      <section className="reveal">
        <p className="eyebrow">Bảng Quản Trị</p>
        <h1>/admin/panel: upload HTML, assets và metadata người đóng góp</h1>
        <p className="hero-copy">
          Bạn đã đăng nhập. Tại đây có thể upload thêm tệp vào home server, gắn metadata người
          upload/người tạo/contributors, rồi re-index catalog.
        </p>

        <div className="hero-actions">
          <AdminLogoutButton />
        </div>
      </section>

      <section className="admin-alert reveal delay-1">
        <strong>Mật khẩu hard-lock:</strong> đăng nhập bằng mật khẩu <strong>grass</strong>, sau đó
        hệ thống cấp session cookie bảo mật (httpOnly + sameSite strict).
      </section>

      {isVercel ? (
        <section className="admin-alert reveal delay-2">
          <strong>Lưu ý Vercel:</strong> hệ thống tệp local là tạm thời, upload sẽ không bền vững.
          Nếu cần lưu lâu dài, hãy dùng home server hoặc object storage ngoài (R2/S3).
        </section>
      ) : null}

      <section className="admin-panel reveal delay-2">
        <h2>Upload và cập nhật dữ liệu</h2>
        <p className="muted">
          Chọn mục tiêu upload: HTML channel export hoặc file trong assets. Điền metadata người
          upload, người tạo, contributors. Sau đó bấm "Re-index" để cập nhật data/catalog.json.
        </p>

        <AdminUploader />
      </section>

      <section className="admin-help reveal delay-2">
        <h3>Gợi ý lưu trữ khi Vercel/GitHub thiếu dung lượng</h3>
        <p>
          1) Home server + Tailscale Funnel: lưu toàn bộ assets trên ổ cứng nhà bạn, truy cập ngoài
          qua 1 cổng Funnel.
        </p>
        <p>
          2) Cloudflare R2: phù hợp file lớn, trả phí theo dung lượng thực tế, có thể map domain
          riêng cho assets.
        </p>
        <p>
          3) Tách metadata và assets: Next.js phục vụ catalog, còn PDF/ZIP phục vụ từ storage ngoài.
        </p>
      </section>
    </div>
  );
}

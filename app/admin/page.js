import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminLoginForm from "./AdminLoginForm";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "../../lib/admin-auth";

export const metadata = {
  title: "Đăng nhập Admin"
};

export default function AdminPage() {
  const cookieStore = cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value || "";
  const loggedIn = verifySessionToken(token);

  if (loggedIn) {
    redirect("/admin/panel");
  }

  return (
    <div className="stack gap-lg">
      <section className="reveal">
        <p className="eyebrow">Đăng Nhập Quản Trị</p>
        <h1>/admin: vui lòng đăng nhập trước khi vào trang quản trị</h1>
        <p className="hero-copy">
          Sau khi đăng nhập thành công, bạn sẽ được chuyển sang <strong>/admin/panel</strong> để
          upload tệp, gắn metadata và re-index dữ liệu.
        </p>
      </section>

      <section className="admin-panel reveal delay-2">
        <h2>Xác thực quản trị</h2>
        <p className="muted">
          Bảo mật đã được tăng cường: chỉ session hợp lệ mới gọi được API upload/rebuild.
        </p>

        <AdminLoginForm />
      </section>
    </div>
  );
}

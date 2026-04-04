import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: {
    default: "archievecio",
    template: "%s | archievecio"
  },
  description:
    "Hcasio Archieve: kho tài liệu cộng đồng được tạo từ HTML đã xuất, có thông tin chủ sở hữu và người đóng góp cho từng tệp."
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <div className="bg-orb orb-one" aria-hidden="true" />
        <div className="bg-orb orb-two" aria-hidden="true" />

        <header className="site-header">
          <Link href="/" className="brand">
            Hcasio Archieve
          </Link>

          <nav className="site-nav" aria-label="Điều hướng chính">
            <Link href="/">Thư viện</Link>
            <Link href="/pool">Pool</Link>
            <Link href="/contributors">Đóng góp</Link>
            <Link href="/resources">Resources</Link>
            <Link href="/admin">Admin</Link>
          </nav>
        </header>

        <main className="page-shell">{children}</main>

        <footer className="site-footer">
          Dữ liệu được tạo từ các tệp HTML xuất ra trong guidesnpdf.
        </footer>
      </body>
    </html>
  );
}

# Hcasio Archieve (Next.js)

Trang web tổng hợp tài liệu cộng đồng từ các tệp HTML export trong `guidesnpdf/`.

## Tính năng

- Quét toàn bộ `guidesnpdf/*.html`
- Index attachment (PDF/DOCX/TXT/image...) trong `guidesnpdf/assets`
- Map thông tin owner + contributor (mention) cho từng tệp
- Trang contributors hiển theo mẫu: `File -> Owner + Contributors`
- Trang `Pool` có fuzzy search + lọc tag + sắp xếp thông minh (AI gợi ý)
- Copy `guidesnpdf/assets` sang `public/assets`
- Copy HTML gốc sang `public/archive`
- Có fallback avatar cho message thiếu ảnh avatar
- Có khu admin đăng nhập riêng để upload/re-index (home server)

## Lệnh cần dùng

```bash
npm install
npm run dev
```

Build production:

```bash
npm run build
npm run start
```

## Data pipeline

`npm run prepare:data` chạy `scripts/build-data.mjs` để tạo `data/catalog.json`.

Script sẽ:

1. Đọc tất cả tệp HTML trong `guidesnpdf`
2. Trích xuất attachment trong message
3. Lấy owner từ tác giả message
4. Lấy contributor từ mention trong nội dung
5. Ghi catalog JSON để site sử dụng

## Khu admin và bảo mật

Luồng hiện tại:

1. Vào `/admin` để đăng nhập
2. Đăng nhập thành công sẽ chuyển sang `/admin/panel`
3. Chỉ session hợp lệ mới gọi được API upload/rebuild

Biện pháp bảo mật đã có:

- Mật khẩu hard-lock: `grass`
- Session cookie `httpOnly` + `sameSite=strict`
- Ký HMAC token session ở server
- API admin kiểm tra `same-origin`
- Login có chống brute-force cơ bản (rate limit theo client)

Có thể tăng cường thêm:

- Đặt `ADMIN_SESSION_SECRET` trong `.env.local`

Ví dụ:

```bash
ADMIN_SESSION_SECRET=thay_secret_rieng_cua_ban
```

## Deploy Vercel và lưu trữ

Vercel phù hợp để phát hành nhanh UI/catalog, nhưng upload local trong route handler không bền vững.

Nếu cần lưu file lớn nhiều:

1. Dùng home server + Tailscale Funnel
2. Hoặc dùng object storage ngoài (Cloudflare R2/S3)
3. Tách metadata và assets để giảm dung lượng trên GitHub/Vercel

## Home server (dùng /admin tốt nhất)

1. `npm run build`
2. `npm run start`
3. Mở 1 cổng cho app, expose qua Tailscale Funnel

## Ghi chú

- Mỗi lần thêm/sửa export HTML hoặc assets, chạy lại `npm run prepare:data`
- Nếu đổi quy tắc parser, sửa trong `scripts/build-data.mjs`

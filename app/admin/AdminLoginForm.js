"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      const response = await fetch("/api/admin/login/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Đăng nhập thất bại.");
      }

      setMessage("Đăng nhập thành công, đang chuyển vào trang quản trị...");
      router.push("/admin/panel");
      router.refresh();
    } catch (error) {
      setMessage(error.message || "Đăng nhập thất bại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <label htmlFor="admin-password">Mật khẩu quản trị</label>
      <input
        id="admin-password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Nhập mật khẩu"
        autoComplete="current-password"
      />

      <div className="hero-actions">
        <button type="submit" className="button button-main" disabled={loading}>
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </div>

      {message ? <div className="admin-alert">{message}</div> : null}
    </form>
  );
}

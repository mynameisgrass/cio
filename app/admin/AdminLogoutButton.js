"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    try {
      setLoading(true);
      await fetch("/api/admin/logout/", {
        method: "POST"
      });
    } finally {
      router.push("/admin");
      router.refresh();
      setLoading(false);
    }
  }

  return (
    <button type="button" className="button button-ghost" onClick={handleLogout} disabled={loading}>
      {loading ? "Đang đăng xuất..." : "Đăng xuất"}
    </button>
  );
}

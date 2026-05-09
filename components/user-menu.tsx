"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserMenuProps {
  username: string;
}

export function UserMenu({ username }: UserMenuProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 font-mono text-xs">
      <span className="text-muted">
        signed as <span className="text-text">{username}</span>
      </span>
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        className="rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted transition hover:border-deny hover:text-deny disabled:opacity-40"
      >
        {pending ? "…" : "logout"}
      </button>
    </div>
  );
}

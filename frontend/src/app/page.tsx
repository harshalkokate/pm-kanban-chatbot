"use client";

import { useState, useEffect } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { fetchMe, logout as apiLogout, type User } from "@/lib/auth";

export default function Home() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (user === undefined) return null;

  if (!user) {
    return (
      <LoginForm
        onLogin={() => {
          fetchMe().then((u) => setUser(u));
        }}
      />
    );
  }

  return (
    <KanbanBoard
      username={user.username}
      onLogout={async () => {
        await apiLogout();
        setUser(null);
      }}
    />
  );
}

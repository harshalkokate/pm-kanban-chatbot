"use client";

import { useState, useEffect } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { clearSession, getSession } from "@/lib/auth";

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthenticated(getSession());
  }, []);

  if (authenticated === null) return null;

  if (!authenticated) {
    return <LoginForm onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <KanbanBoard
      onLogout={() => {
        clearSession();
        setAuthenticated(false);
      }}
    />
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession, homePathForRole } from "@/lib/session.js";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    router.replace(session ? homePathForRole(session.role) : "/login");
  }, [router]);

  return null;
}

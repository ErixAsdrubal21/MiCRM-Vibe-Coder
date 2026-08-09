"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useSession, homePathForRole } from "@/lib/session.js";

export default function Home() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const session = useSession();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (session) router.replace(homePathForRole(session.role));
  }, [isLoading, isAuthenticated, session, router]);

  return null;
}

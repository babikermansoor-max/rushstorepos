import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export type AppRole = "owner" | "manager" | "cashier" | "warehouse";

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, username, phone, is_approved, branch_id, branches(id, name)")
          .eq("id", userId!)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
      ]);
      const roleList = (roles ?? []).map((r) => r.role as AppRole);
      const role: AppRole = roleList.includes("owner")
        ? "owner"
        : roleList.includes("manager")
          ? "manager"
          : "cashier";
      return {
        profile,
        role,
        isAdmin: role === "owner" || role === "manager",
        isOwner: role === "owner",
        isApproved: profile?.is_approved ?? false,
      };
    },
  });
}

import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  LayoutGrid,
  ShoppingCart,
  Undo2,
  Package,
  Wrench,
  BarChart3,
  ClipboardList,
  Users,
  LogOut,
  Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSession } from "@/hooks/useSession";
import { ROLE_LABELS } from "@/lib/format";

const NAV = [
  { to: "/dashboard", label: "لوحة التحكم", icon: LayoutGrid, admin: false },
  { to: "/pos", label: "نقطة البيع", icon: ShoppingCart, admin: false },
  { to: "/returns", label: "المرتجعات", icon: Undo2, admin: false },
  { to: "/inventory", label: "المخزون", icon: Package, admin: false },
  { to: "/repairs", label: "الإصلاحات", icon: Wrench, admin: false },
  { to: "/reports", label: "التقارير", icon: BarChart3, admin: false },
  { to: "/stock-report", label: "تقرير المخزن", icon: ClipboardList, admin: false },
  { to: "/users", label: "الموظفين والفروع", icon: Users, admin: true },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { data } = useProfile(user?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const name = data?.profile?.full_name || user?.email?.split("@")[0] || "مستخدم";
  const branch = (data?.profile as { branches?: { name: string } } | undefined)?.branches?.name;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
          <div className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Store className="size-5" />
          </div>
          <div>
            <p className="text-base font-bold leading-tight">Rush Store</p>
            <p className="text-xs text-sidebar-foreground/60">منفذ الإدارة</p>
          </div>
        </div>

        <div className="border-b border-sidebar-border p-3">
          <div className="mb-2 rounded-lg bg-sidebar-accent/60 px-3 py-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-xs text-sidebar-foreground/60">
              {ROLE_LABELS[data?.role ?? "cashier"]}
              {branch ? ` · ${branch}` : ""}
            </p>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-destructive"
          >
            <LogOut className="size-4" />
            تسجيل الخروج
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.filter((n) => !n.admin || data?.isAdmin).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className:
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold bg-sidebar-accent text-sidebar-primary",
              }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>

      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <div className="grid size-8 place-items-center rounded-lg bg-secondary text-primary">
              <Store className="size-4" />
            </div>
            <span className="font-bold">Rush Store</span>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            {branch ?? "الفرع الرئيسي"}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-medium sm:block">{name}</span>
            <div className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-bold text-primary">
              {name.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2 md:hidden">
          {NAV.filter((n) => !n.admin || data?.isAdmin).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground"
              activeProps={{
                className: "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold bg-secondary text-primary",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

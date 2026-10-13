import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppLayout";
import { useProfile, useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "سجل العمليات — Rush Store" },
      { name: "description", content: "سجل العمليات الحساسة في نظام Rush Store للمالك." },
      { property: "og:title", content: "سجل العمليات — Rush Store" },
      { property: "og:description", content: "متابعة التعديلات والحذف والصلاحيات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditPage,
});

const TABLES: Record<string, string> = {
  user_roles: "الصلاحيات",
  profiles: "الموظفين",
  products: "المنتجات",
  stock: "المخزون",
  sales: "الفواتير",
  phone_sales: "فواتير الهواتف",
  phones: "الهواتف",
  expenses: "المنصرفات",
  returns: "المرتجعات",
  app_settings: "سعر الصرف",
  branches: "الفروع",
};
const ACTIONS: Record<string, string> = { INSERT: "إضافة", UPDATE: "تعديل", DELETE: "حذف" };

function diff(o: Record<string, unknown> | null, n: Record<string, unknown> | null) {
  if (!o) return n ? Object.entries(n).filter(([k]) => !["id", "created_at"].includes(k)).map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
  if (!n) return Object.entries(o).filter(([k]) => ["name", "title", "full_name", "invoice_no", "model", "role", "total"].includes(k)).map(([k, v]) => `${k}: ${v}`).join(" · ");
  return Object.keys(n)
    .filter((k) => k !== "updated_at" && JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => `${k}: ${o[k] ?? "—"} ← ${n[k] ?? "—"}`)
    .join(" · ");
}

function AuditPage() {
  const { user } = useSession();
  const { data: me } = useProfile(user?.id);
  const [table, setTable] = useState("");

  const { data: staff } = useQuery({
    queryKey: ["staff_directory"],
    queryFn: async () => (await supabase.rpc("staff_directory")).data ?? [],
  });
  const { data, isLoading } = useQuery({
    queryKey: ["audit", table],
    enabled: !!me?.isOwner,
    queryFn: async () => {
      let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300);
      if (table) q = q.eq("table_name", table);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  if (!me?.isOwner)
    return (
      <div className="surface p-8 text-center">
        <h1 className="text-lg font-bold">لا تملك صلاحية الوصول</h1>
        <p className="mt-1 text-sm text-muted-foreground">سجل العمليات للمالك فقط.</p>
      </div>
    );

  const nameOf = (id: string | null) => staff?.find((s) => s.id === id)?.full_name ?? (id ? "—" : "النظام");

  return (
    <div>
      <PageHeader
        title="سجل العمليات"
        subtitle="كل تعديل أو حذف حساس — لا يمكن لأحد تعديله أو مسحه"
        action={
          <select className="rounded-lg border border-border bg-card px-3 py-2 text-sm" value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">كل الأقسام</option>
            {Object.entries(TABLES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        }
      />
      <div className="surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-muted-foreground">
            <tr>
              <th className="p-3 text-start">الوقت</th>
              <th className="p-3 text-start">الموظف</th>
              <th className="p-3 text-start">القسم</th>
              <th className="p-3 text-start">العملية</th>
              <th className="p-3 text-start">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">جارٍ التحميل...</td></tr>}
            {data?.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">لا توجد عمليات</td></tr>}
            {data?.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap p-3" dir="ltr">{new Date(r.created_at).toLocaleString("en-GB")}</td>
                <td className="p-3">{nameOf(r.actor_id)}</td>
                <td className="p-3">{TABLES[r.table_name] ?? r.table_name}</td>
                <td className={`p-3 font-semibold ${r.action === "DELETE" ? "text-destructive" : ""}`}>{ACTIONS[r.action] ?? r.action}</td>
                <td className="max-w-md break-words p-3 text-xs text-muted-foreground" dir="ltr">
                  {diff(r.old_data as Record<string, unknown> | null, r.new_data as Record<string, unknown> | null)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

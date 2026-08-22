import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Receipt, Boxes, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppLayout";
import { formatDate, formatNumber, formatSDG, PAYMENT_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم — Rush Store" },
      { name: "description", content: "ملخص مبيعات اليوم وطرق الدفع وحركة المتجر." },
      { property: "og:title", content: "لوحة التحكم — Rush Store" },
      { property: "og:description", content: "ملخص مبيعات اليوم وطرق الدفع وحركة المتجر." },
    ],
  }),
  component: Dashboard,
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const since = startOfToday();
      const [sales, items, lowStock] = await Promise.all([
        supabase.from("sales").select("id, total, payment_method, created_at").gte("created_at", since),
        supabase.from("sale_items").select("quantity, sale_id, sales!inner(created_at)").gte("sales.created_at", since),
        supabase.from("stock").select("quantity, products(name), branches(name)").lte("quantity", 5).order("quantity"),
      ]);
      const list = sales.data ?? [];
      const total = list.reduce((s, r) => s + Number(r.total), 0);
      const units = (items.data ?? []).reduce((s, r) => s + Number(r.quantity), 0);
      const byMethod: Record<string, number> = { cash: 0, bankak: 0 };
      list.forEach((r) => {
        byMethod[r.payment_method] = (byMethod[r.payment_method] ?? 0) + Number(r.total);
      });
      return {
        total,
        count: list.length,
        units,
        avg: list.length ? total / list.length : 0,
        byMethod,
        lowStock: lowStock.data ?? [],
      };
    },
  });

  const cards = [
    { label: "مبيعاتي اليوم", value: formatSDG(data?.total ?? 0), icon: DollarSign },
    { label: "الفواتير", value: formatNumber(data?.count ?? 0), icon: Receipt },
    { label: "الوحدات المباعة", value: formatNumber(data?.units ?? 0), icon: Boxes },
    { label: "متوسط الفاتورة", value: formatSDG(data?.avg ?? 0), icon: Activity },
  ];

  const totalPay = (data?.byMethod["cash"] ?? 0) + (data?.byMethod["bankak"] ?? 0);

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        subtitle={formatDate(new Date())}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
                <c.icon className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold">{isLoading ? "…" : c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="surface p-5">
          <h2 className="font-bold">طرق الدفع اليوم</h2>
          <div className="mt-4 space-y-4">
            {(["cash", "bankak"] as const).map((m) => {
              const value = data?.byMethod[m] ?? 0;
              const pct = totalPay ? Math.round((value / totalPay) * 100) : 0;
              return (
                <div key={m}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium">{PAYMENT_LABELS[m]}</span>
                    <span className="text-muted-foreground">
                      {formatSDG(value)} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={m === "cash" ? "h-full bg-primary" : "h-full bg-secondary"}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface p-5">
          <h2 className="font-bold">نواقص المخزون</h2>
          <p className="text-sm text-muted-foreground">منتجات كميتها 5 أو أقل</p>
          <div className="mt-4 space-y-2">
            {(data?.lowStock ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">لا توجد نواقص</p>
            )}
            {(data?.lowStock ?? []).slice(0, 6).map((row, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <span className="font-medium">
                  {(row as { products?: { name: string } }).products?.name ?? "—"}
                </span>
                <span className="text-muted-foreground">
                  {(row as { branches?: { name: string } }).branches?.name} · {row.quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

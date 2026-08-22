import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppLayout";
import { PAYMENT_LABELS, formatDateTime, formatNumber, formatSDG } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "التقارير — Rush Store" },
      { name: "description", content: "تقارير المبيعات والأرباح وأفضل المنتجات خلال أي فترة زمنية." },
      { property: "og:title", content: "التقارير — Rush Store" },
      { property: "og:description", content: "تقارير المبيعات والأرباح وأفضل المنتجات." },
    ],
  }),
  component: Reports,
});

function isoDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function Reports() {
  const [from, setFrom] = useState(isoDay(-30));
  const [to, setTo] = useState(isoDay());

  const { data, isLoading } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: async () => {
      const start = new Date(`${from}T00:00:00`).toISOString();
      const end = new Date(`${to}T23:59:59`).toISOString();
      const [{ data: sales }, { data: items }] = await Promise.all([
        supabase
          .from("sales")
          .select("id, invoice_number, total, payment_method, created_at, branches(name)")
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false }),
        supabase
          .from("sale_items")
          .select("product_name, quantity, unit_price, sales!inner(created_at)")
          .gte("sales.created_at", start)
          .lte("sales.created_at", end),
      ]);
      return { sales: sales ?? [], items: items ?? [] };
    },
  });

  const sales = data?.sales ?? [];
  const total = sales.reduce((s, r) => s + Number(r.total), 0);
  const cash = sales.filter((s) => s.payment_method === "cash").reduce((s, r) => s + Number(r.total), 0);
  const bankak = total - cash;

  const topMap = new Map<string, { qty: number; total: number }>();
  for (const it of data?.items ?? []) {
    const cur = topMap.get(it.product_name) ?? { qty: 0, total: 0 };
    cur.qty += it.quantity;
    cur.total += Number(it.unit_price) * it.quantity;
    topMap.set(it.product_name, cur);
  }
  const top = [...topMap.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);

  return (
    <div>
      <PageHeader title="التقارير" subtitle="المبيعات والأداء خلال الفترة المحددة" />

      <div className="surface mb-4 flex flex-wrap items-end gap-4 p-4">
        <div className="space-y-1.5">
          <Label>من</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>إلى</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="إجمالي المبيعات" value={formatSDG(total)} highlight />
        <Stat label="عدد الفواتير" value={formatNumber(sales.length)} />
        <Stat label="نقدي" value={formatSDG(cash)} />
        <Stat label="بنكك" value={formatSDG(bankak)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-4 lg:col-span-2">
          <h2 className="mb-3 font-bold">الفواتير</h2>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-3 font-medium">الفاتورة</th>
                  <th className="p-3 font-medium">الفرع</th>
                  <th className="p-3 font-medium">الدفع</th>
                  <th className="p-3 font-medium">الإجمالي</th>
                  <th className="p-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      جارٍ التحميل...
                    </td>
                  </tr>
                )}
                {!isLoading && sales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      لا توجد مبيعات في هذه الفترة
                    </td>
                  </tr>
                )}
                {sales.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="p-3 font-semibold" dir="ltr">
                      {s.invoice_number}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {(s.branches as { name: string } | null)?.name ?? "—"}
                    </td>
                    <td className="p-3">{PAYMENT_LABELS[s.payment_method] ?? s.payment_method}</td>
                    <td className="p-3 font-bold text-gold">{formatSDG(Number(s.total))}</td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDateTime(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="surface p-4">
          <h2 className="mb-3 font-bold">الأكثر مبيعاً</h2>
          <ul className="space-y-3">
            {top.length === 0 && <li className="text-sm text-muted-foreground">لا توجد بيانات</li>}
            {top.map(([name, v]) => (
              <li key={name} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-semibold">{name}</p>
                  <p className="text-xs text-muted-foreground">{formatNumber(v.qty)} قطعة</p>
                </div>
                <span className="font-bold text-gold">{formatSDG(v.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? "text-gold" : ""}`}>{value}</p>
    </div>
  );
}

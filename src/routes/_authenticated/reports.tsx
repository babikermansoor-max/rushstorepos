import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RequireAdmin } from "@/components/AppLayout";
import { ReceiptDialog, type ReceiptData } from "@/components/Receipt";
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
  component: () => (
    <RequireAdmin>
      <Reports />
    </RequireAdmin>
  ),
});

function isoDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function Reports() {
  const [from, setFrom] = useState(isoDay(-30));
  const [to, setTo] = useState(isoDay());
  const [branch, setBranch] = useState("all");

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () =>
      (await supabase.from("branches").select("id, name, is_main").order("is_main", { ascending: false })).data ?? [],
  });

  const { data, isLoading } = useQuery({
    queryKey: ["reports", from, to, branch],
    queryFn: async () => {
      const start = new Date(`${from}T00:00:00`).toISOString();
      const end = new Date(`${to}T23:59:59`).toISOString();
      let salesQ = supabase
        .from("sales")
        .select(
          "id, invoice_no, total, payment_method, created_at, branch_id, cashier_id, customer_name, branches(name)",
        )
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });
      let itemsQ = supabase
        .from("sale_items")
        .select(
          "sale_id, product_id, product_name, quantity, unit_price, unit_cost, sales!inner(created_at, branch_id)",
        )
        .gte("sales.created_at", start)
        .lte("sales.created_at", end);
      let retQ = supabase
        .from("returns")
        .select("product_id, amount, quantity, created_at, branch_id")
        .gte("created_at", start)
        .lte("created_at", end);
      let expQ = supabase.from("expenses").select("amount, spent_at, branch_id").gte("spent_at", from).lte("spent_at", to);
      if (branch !== "all") {
        salesQ = salesQ.eq("branch_id", branch);
        itemsQ = itemsQ.eq("sales.branch_id", branch);
        retQ = retQ.eq("branch_id", branch);
        expQ = expQ.eq("branch_id", branch);
      }
      const [{ data: sales }, { data: items }, { data: rets }, { data: exps }] = await Promise.all([
        salesQ,
        itemsQ,
        retQ,
        expQ,
      ]);
      const { data: prods } = await supabase.from("products").select("id, cost_price");
      const cashierIds = [...new Set((sales ?? []).map((s) => s.cashier_id).filter(Boolean))] as string[];
      const { data: profs } = cashierIds.length
        ? await supabase.from("profiles").select("id, full_name, username").in("id", cashierIds)
        : { data: [] as { id: string; full_name: string; username: string | null }[] };
      return {
        sales: sales ?? [],
        items: items ?? [],
        returns: rets ?? [],
        expenses: exps ?? [],
        costs: new Map((prods ?? []).map((p) => [p.id, Number(p.cost_price)])),
        names: new Map((profs ?? []).map((p) => [p.id, p.full_name || p.username || "—"])),
      };
    },
  });

  const sales = data?.sales ?? [];
  const total = sales.reduce((s, r) => s + Number(r.total), 0);
  const cash = sales.filter((s) => s.payment_method === "cash").reduce((s, r) => s + Number(r.total), 0);
  const bankak = total - cash;
  const returned = (data?.returns ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const netSales = total - returned;
  const expenses = (data?.expenses ?? []).reduce((s, r) => s + Number(r.amount), 0);
  // تكلفة وقت البيع إن وُجدت، وإلا التكلفة الحالية للمنتج
  const unitCostOf = (productId: string | null, stored?: number | null) =>
    Number(stored ?? 0) || (productId ? (data?.costs.get(productId) ?? 0) : 0);
  const cogs = (data?.items ?? []).reduce(
    (s, it) => s + Number(it.quantity) * unitCostOf(it.product_id, it.unit_cost),
    0,
  );
  // متوسط تكلفة الوحدة المباعة لكل منتج، لخصم تكلفة المرتجع الذي عاد للمخزن
  const soldUnitCost = new Map<string, { qty: number; cost: number }>();
  for (const it of data?.items ?? []) {
    if (!it.product_id) continue;
    const cur = soldUnitCost.get(it.product_id) ?? { qty: 0, cost: 0 };
    cur.qty += Number(it.quantity);
    cur.cost += Number(it.quantity) * unitCostOf(it.product_id, it.unit_cost);
    soldUnitCost.set(it.product_id, cur);
  }
  const returnsCost = (data?.returns ?? []).reduce((s, r) => {
    const agg = r.product_id ? soldUnitCost.get(r.product_id) : undefined;
    const unit = agg && agg.qty > 0 ? agg.cost / agg.qty : unitCostOf(r.product_id ?? null, 0);
    return s + Number(r.quantity) * unit;
  }, 0);
  const netCogs = Math.max(0, cogs - returnsCost);
  const grossProfit = netSales - netCogs;
  const netProfit = grossProfit - expenses;


  const topMap = new Map<string, { qty: number; total: number }>();
  for (const it of data?.items ?? []) {
    const cur = topMap.get(it.product_name) ?? { qty: 0, total: 0 };
    cur.qty += it.quantity;
    cur.total += Number(it.unit_price) * it.quantity;
    topMap.set(it.product_name, cur);
  }
  const top = [...topMap.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);

  const invoices = useMemo(() => {
    const itemsBySale = new Map<string, { name: string; qty: number; price: number }[]>();
    for (const it of data?.items ?? []) {
      const list = itemsBySale.get(it.sale_id) ?? [];
      list.push({ name: it.product_name, qty: Number(it.quantity), price: Number(it.unit_price) });
      itemsBySale.set(it.sale_id, list);
    }
    return (data?.sales ?? []).map<ReceiptData & { id: string }>((s) => ({
      id: s.id,
      invoiceNo: s.invoice_no,
      createdAt: s.created_at,
      branch: (s.branches as { name: string } | null)?.name ?? "—",
      cashier: data?.names.get(s.cashier_id ?? "") ?? "—",
      customer: s.customer_name,
      paymentMethod: s.payment_method,
      items: itemsBySale.get(s.id) ?? [],
      total: Number(s.total),
    }));
  }, [data]);

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);


  return (
    <div>
      <PageHeader
        title="التقارير"
        subtitle={from === to ? `تقرير يوم ${from}` : `من ${from} إلى ${to}`}
      />

      <div className="surface mb-4 flex flex-wrap items-end gap-4 p-4">
        <div className="space-y-1.5">
          <Label>من</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>إلى</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>الفرع</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          >
            <option value="all">كل الفروع</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "اليوم", from: isoDay(), to: isoDay() },
            { label: "أمس", from: isoDay(-1), to: isoDay(-1) },
            { label: "آخر 7 أيام", from: isoDay(-6), to: isoDay() },
            { label: "هذا الشهر", from: `${isoDay().slice(0, 8)}01`, to: isoDay() },
          ].map((p) => {
            const active = from === p.from && to === p.to;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setFrom(p.from);
                  setTo(p.to);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setTo(from)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
          >
            يوم واحد
          </button>
        </div>
      </div>


      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="إجمالي المبيعات" value={formatSDG(total)} highlight />
        <Stat label="المرتجعات" value={formatSDG(returned)} />
        <Stat label="صافي المبيعات" value={formatSDG(netSales)} highlight />
        <Stat label="عدد الفواتير" value={formatNumber(sales.length)} />
        <Stat label="نقدي" value={formatSDG(cash)} />
        <Stat label="بنكك" value={formatSDG(bankak)} />
        <Stat label="تكلفة المبيعات" value={formatSDG(netCogs)} />
        <Stat label="مجمل الربح" value={formatSDG(grossProfit)} />
        <Stat label="المصروفات" value={formatSDG(expenses)} />
        <Stat label="صافي الربح" value={formatSDG(netProfit)} highlight />
      </div>



      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-4 lg:col-span-2">
          <h2 className="font-bold">الفواتير</h2>
          <p className="mb-3 text-sm text-muted-foreground">اضغط على الفاتورة لعرضها وطباعتها</p>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-3 font-medium">رقم الفاتورة</th>
                  <th className="p-3 font-medium">التاريخ</th>
                  <th className="p-3 font-medium">الفرع</th>
                  <th className="p-3 font-medium">الحساب الذي باع</th>
                  <th className="p-3 font-medium">الدفع</th>
                  <th className="p-3 font-medium">الأصناف</th>
                  <th className="p-3 font-medium">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      جارٍ التحميل...
                    </td>
                  </tr>
                )}
                {!isLoading && invoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      لا توجد فواتير في هذه الفترة
                    </td>
                  </tr>
                )}
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => setReceipt(inv)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted"
                  >
                    <td className="p-3 font-bold" dir="ltr">
                      #{inv.invoiceNo}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDateTime(inv.createdAt)}</td>
                    <td className="p-3 text-muted-foreground">{inv.branch}</td>
                    <td className="p-3">{inv.cashier}</td>
                    <td className="p-3">{PAYMENT_LABELS[inv.paymentMethod] ?? inv.paymentMethod}</td>
                    <td className="p-3">{formatNumber(inv.items.length)}</td>
                    <td className="p-3 font-bold text-gold">{formatSDG(inv.total)}</td>
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

      <ReceiptDialog data={receipt} open={!!receipt} onOpenChange={(v) => !v && setReceipt(null)} autoPrint={false} />
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

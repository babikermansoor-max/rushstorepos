import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppLayout";
import { formatDate, formatNumber, formatSDG } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/stock-report")({
  head: () => ({
    meta: [
      { title: "تقرير المخزن — Rush Store" },
      { name: "description", content: "تقرير شامل لكميات وقيمة المخزون في كل فرع مع النواقص والأرباح المتوقعة." },
      { property: "og:title", content: "تقرير المخزن — Rush Store" },
      { property: "og:description", content: "قيمة المخزون والنواقص والأرباح المتوقعة لكل فرع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockReport,
});

type Row = {
  quantity: number;
  branch_id: string;
  products: { id: string; name: string; barcode: string | null; cost_price: number; sale_price: number; is_active: boolean; categories: { name: string } | null } | null;
  branches: { id: string; name: string } | null;
};

function StockReport() {
  const [branch, setBranch] = useState("all");
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("id, name").order("name")).data ?? [],
  });

  const { data, isLoading } = useQuery({
    queryKey: ["stock-report"],
    queryFn: async () =>
      ((
        await supabase
          .from("stock")
          .select(
            "quantity, branch_id, products(id, name, barcode, cost_price, sale_price, is_active, categories(name)), branches(id, name)",
          )
      ).data ?? []) as unknown as Row[],
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => r.products)
      .filter((r) => branch === "all" || r.branch_id === branch)
      .filter((r) => !onlyLow || r.quantity <= 5)
      .filter(
        (r) =>
          !q ||
          r.products!.name.toLowerCase().includes(q) ||
          (r.products!.barcode ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.quantity - b.quantity);
  }, [data, branch, search, onlyLow]);

  const totals = rows.reduce(
    (acc, r) => {
      const qty = Number(r.quantity);
      acc.qty += qty;
      acc.cost += qty * Number(r.products!.cost_price);
      acc.sale += qty * Number(r.products!.sale_price);
      if (qty <= 0) acc.out += 1;
      else if (qty <= 5) acc.low += 1;
      return acc;
    },
    { qty: 0, cost: 0, sale: 0, low: 0, out: 0 },
  );

  return (
    <div>
      <PageHeader
        title="تقرير المخزن"
        subtitle={`جرد الكميات والقيمة — ${formatDate(new Date())}`}
        action={
          <Button variant="outline" onClick={() => window.print()} className="no-print gap-2">
            <Printer className="size-4" />
            طباعة
          </Button>
        }
      />

      <div className="surface no-print mb-4 flex flex-wrap items-end gap-4 p-4">
        <div className="space-y-1.5">
          <Label>الفرع</Label>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">كل الفروع</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-52 flex-1 space-y-1.5">
          <Label>بحث</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم المنتج أو الباركود" />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="size-4" />
          النواقص فقط (5 أو أقل)
        </label>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="عدد الأصناف" value={formatNumber(rows.length)} />
        <Stat label="إجمالي القطع" value={formatNumber(totals.qty)} />
        <Stat label="قيمة المخزون (تكلفة)" value={formatSDG(totals.cost)} />
        <Stat label="قيمة البيع المتوقعة" value={formatSDG(totals.sale)} highlight />
        <Stat label="الربح المتوقع" value={formatSDG(totals.sale - totals.cost)} highlight />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Stat label="أصناف شارفت على النفاد" value={formatNumber(totals.low)} />
        <Stat label="أصناف نفدت" value={formatNumber(totals.out)} />
      </div>

      <div className="surface p-4">
        <h2 className="mb-3 font-bold">تفاصيل الجرد</h2>
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-3 font-medium">المنتج</th>
                <th className="p-3 font-medium">التصنيف</th>
                <th className="p-3 font-medium">الفرع</th>
                <th className="p-3 font-medium">الكمية</th>
                <th className="p-3 font-medium">التكلفة</th>
                <th className="p-3 font-medium">قيمة التكلفة</th>
                <th className="p-3 font-medium">قيمة البيع</th>
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
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    لا توجد بيانات
                  </td>
                </tr>
              )}
              {rows.map((r, i) => {
                const p = r.products!;
                const qty = Number(r.quantity);
                return (
                  <tr key={`${p.id}-${r.branch_id}-${i}`} className="border-b border-border/60 last:border-0">
                    <td className="p-3 font-semibold">
                      {p.name}
                      {p.barcode && (
                        <span className="block text-xs font-normal text-muted-foreground" dir="ltr">
                          {p.barcode}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{p.categories?.name ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{r.branches?.name ?? "—"}</td>
                    <td className="p-3">
                      <span
                        className={
                          qty <= 0
                            ? "rounded-md bg-destructive/15 px-2 py-0.5 font-bold text-destructive"
                            : qty <= 5
                              ? "rounded-md bg-secondary px-2 py-0.5 font-bold text-primary"
                              : "font-bold"
                        }
                      >
                        {formatNumber(qty)}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{formatSDG(Number(p.cost_price))}</td>
                    <td className="p-3">{formatSDG(qty * Number(p.cost_price))}</td>
                    <td className="p-3 font-bold text-gold">{formatSDG(qty * Number(p.sale_price))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

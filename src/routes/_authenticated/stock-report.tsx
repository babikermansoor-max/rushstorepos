import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppLayout";
import { useProfile, useSession } from "@/hooks/useSession";
import { formatDate, formatNumber, formatSDG } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  cost_price: number;
  sale_price: number;
  categories: { name: string } | null;
};

type StockRow = { quantity: number; branch_id: string; product_id: string };

type Line = {
  key: string;
  product: Product;
  branchId: string | null;
  branchName: string;
  quantity: number;
  missing: boolean;
};

type MovementItem = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  sales: {
    id: string;
    created_at: string;
    cashier_id: string | null;
    branch_id: string | null;
    payment_method: string;
  };
};

function isoDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function StockReport() {
  const { user } = useSession();
  const { data: me } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [branch, setBranch] = useState("all");
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", branch_id: "", quantity: "" });
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState(isoDay(-30));
  const [to, setTo] = useState(isoDay());

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("id, name").order("name")).data ?? [],
  });

  const { data: products } = useQuery({
    queryKey: ["products-basic"],
    queryFn: async () =>
      ((
        await supabase
          .from("products")
          .select("id, name, barcode, cost_price, sale_price, categories(name)")
          .eq("is_active", true)
          .order("name")
      ).data ?? []) as unknown as Product[],
  });

  const { data: stock, isLoading } = useQuery({
    queryKey: ["stock-report"],
    queryFn: async () =>
      ((await supabase.from("stock").select("quantity, branch_id, product_id")).data ?? []) as StockRow[],
  });

  const { data: movement } = useQuery({
    queryKey: ["stock-movement", from, to],
    queryFn: async () => {
      const start = new Date(`${from}T00:00:00`).toISOString();
      const end = new Date(`${to}T23:59:59`).toISOString();
      const [{ data: items }, { data: profiles }] = await Promise.all([
        supabase
          .from("sale_items")
          .select(
            "product_id, product_name, quantity, unit_price, sales!inner(id, created_at, cashier_id, branch_id, payment_method)",
          )
          .gte("sales.created_at", start)
          .lte("sales.created_at", end),
        supabase.from("profiles").select("id, full_name"),
      ]);
      return {
        items: (items ?? []) as unknown as MovementItem[],
        names: new Map((profiles ?? []).map((p) => [p.id, p.full_name])),
      };
    },
  });

  const soldByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of movement?.items ?? []) {
      if (!it.product_id) continue;
      if (branch !== "all" && it.sales.branch_id !== branch) continue;
      map.set(it.product_id, (map.get(it.product_id) ?? 0) + Number(it.quantity));
    }
    return map;
  }, [movement, branch]);

  const movementRows = useMemo(() => {
    const branchName = (id: string | null) => (branches ?? []).find((b) => b.id === id)?.name ?? "—";
    const map = new Map<
      string,
      { date: string; branch: string; seller: string; invoices: Set<string>; units: number; cash: number; bankak: number }
    >();
    for (const it of movement?.items ?? []) {
      const s = it.sales;
      if (branch !== "all" && s.branch_id !== branch) continue;
      const day = s.created_at.slice(0, 10);
      const seller = movement?.names.get(s.cashier_id ?? "") ?? "—";
      const key = `${day}|${s.branch_id}|${s.cashier_id}`;
      const cur =
        map.get(key) ??
        { date: day, branch: branchName(s.branch_id), seller, invoices: new Set<string>(), units: 0, cash: 0, bankak: 0 };
      cur.invoices.add(s.id);
      cur.units += Number(it.quantity);
      const value = Number(it.quantity) * Number(it.unit_price);
      if (s.payment_method === "cash") cur.cash += value;
      else cur.bankak += value;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [movement, branches, branch]);

  const lines = useMemo<Line[]>(() => {
    const prods = products ?? [];
    const stk = stock ?? [];
    const branchName = (id: string) => (branches ?? []).find((b) => b.id === id)?.name ?? "—";
    const out: Line[] = [];

    if (branch === "all") {
      for (const p of prods) {
        const mine = stk.filter((s) => s.product_id === p.id);
        if (mine.length === 0) {
          out.push({ key: p.id, product: p, branchId: null, branchName: "غير مضاف للمخزن", quantity: 0, missing: true });
        } else {
          for (const s of mine) {
            out.push({
              key: `${p.id}-${s.branch_id}`,
              product: p,
              branchId: s.branch_id,
              branchName: branchName(s.branch_id),
              quantity: Number(s.quantity),
              missing: false,
            });
          }
        }
      }
    } else {
      for (const p of prods) {
        const s = stk.find((x) => x.product_id === p.id && x.branch_id === branch);
        out.push({
          key: `${p.id}-${branch}`,
          product: p,
          branchId: branch,
          branchName: branchName(branch),
          quantity: s ? Number(s.quantity) : 0,
          missing: !s,
        });
      }
    }
    return out;
  }, [products, stock, branches, branch]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines
      .filter((r) => !onlyLow || r.quantity <= 5)
      .filter(
        (r) => !q || r.product.name.toLowerCase().includes(q) || (r.product.barcode ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.quantity - b.quantity);
  }, [lines, search, onlyLow]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.qty += r.quantity;
      acc.cost += r.quantity * Number(r.product.cost_price);
      acc.sale += r.quantity * Number(r.product.sale_price);
      if (r.missing) acc.missing += 1;
      if (r.quantity <= 0) acc.out += 1;
      else if (r.quantity <= 5) acc.low += 1;
      return acc;
    },
    { qty: 0, cost: 0, sale: 0, low: 0, out: 0, missing: 0 },
  );

  function openAdd(productId?: string, branchId?: string | null) {
    setForm({
      product_id: productId ?? "",
      branch_id: branchId ?? (branch !== "all" ? branch : (me?.profile?.branch_id ?? "")),
      quantity: "",
    });
    setOpen(true);
  }

  async function addStock(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(form.quantity);
    if (!form.product_id || !form.branch_id || !qty) {
      toast.error("اختر المنتج والفرع والكمية");
      return;
    }
    setSaving(true);
    try {
      const current = (stock ?? []).find((s) => s.product_id === form.product_id && s.branch_id === form.branch_id);
      const next = (current ? Number(current.quantity) : 0) + qty;
      const { error } = await supabase
        .from("stock")
        .upsert({ product_id: form.product_id, branch_id: form.branch_id, quantity: next });
      if (error) throw error;
      toast.success(`تمت إضافة ${formatNumber(qty)} قطعة — الرصيد الآن ${formatNumber(next)}`);
      setOpen(false);
      setForm({ product_id: "", branch_id: "", quantity: "" });
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّرت الإضافة");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="تقرير المخزن"
        subtitle={`جرد الكميات والقيمة — ${formatDate(new Date())}`}
        action={
          <div className="no-print flex gap-2">
            <Button variant="outline" onClick={() => window.print()} className="gap-2">
              <Printer className="size-4" />
              طباعة
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" onClick={() => openAdd()}>
                  <PackagePlus className="size-4" />
                  إضافة مخزون
                </Button>
              </DialogTrigger>
              <DialogContent dir="rtl">
                <DialogHeader>
                  <DialogTitle>إضافة كمية للمخزن</DialogTitle>
                </DialogHeader>
                <form onSubmit={addStock} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>المنتج</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={form.product_id}
                      onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                      required
                    >
                      <option value="">اختر المنتج</option>
                      {(products ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>الفرع</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={form.branch_id}
                      onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                      required
                    >
                      <option value="">اختر الفرع</option>
                      {(branches ?? []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>الكمية المضافة</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      required
                    />
                    <p className="text-xs text-muted-foreground">تُضاف إلى الرصيد الحالي للمنتج في الفرع المحدد.</p>
                  </div>
                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? "جارٍ الحفظ..." : "إضافة"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
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
        <div className="space-y-1.5">
          <Label>من تاريخ</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>إلى تاريخ</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="أصناف شارفت على النفاد" value={formatNumber(totals.low)} />
        <Stat label="أصناف نفدت" value={formatNumber(totals.out)} />
        <Stat label="أصناف غير مضافة للمخزن" value={formatNumber(totals.missing)} />
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
                <th className="no-print p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    جارٍ التحميل...
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    لا توجد بيانات
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/60 last:border-0">
                  <td className="p-3 font-semibold">
                    {r.product.name}
                    {r.product.barcode && (
                      <span className="block text-xs font-normal text-muted-foreground" dir="ltr">
                        {r.product.barcode}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{r.product.categories?.name ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{r.branchName}</td>
                  <td className="p-3">
                    <span
                      className={
                        r.quantity <= 0
                          ? "rounded-md bg-destructive/15 px-2 py-0.5 font-bold text-destructive"
                          : r.quantity <= 5
                            ? "rounded-md bg-secondary px-2 py-0.5 font-bold text-primary"
                            : "font-bold"
                      }
                    >
                      {formatNumber(r.quantity)}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{formatSDG(Number(r.product.cost_price))}</td>
                  <td className="p-3">{formatSDG(r.quantity * Number(r.product.cost_price))}</td>
                  <td className="p-3 font-bold text-gold">{formatSDG(r.quantity * Number(r.product.sale_price))}</td>
                  <td className="no-print p-3">
                    <Button size="sm" variant="outline" onClick={() => openAdd(r.product.id, r.branchId)}>
                      إضافة كمية
                    </Button>
                  </td>
                </tr>
              ))}
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

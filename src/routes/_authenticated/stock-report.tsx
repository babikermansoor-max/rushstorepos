import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppLayout";
import { useProfile, useSession } from "@/hooks/useSession";
import { formatDate, formatNumber, formatSDG } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ReceiptDialog, type ReceiptData } from "@/components/Receipt";

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
  category_id: string | null;
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
    invoice_no: number;
    customer_name: string | null;
    total: number;
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
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [productOpen, setProductOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    barcode: "",
    category_id: "",
    cost_price: "",
    sale_price: "",
    quantity: "",
    branch_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [editRow, setEditRow] = useState<Line | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    barcode: "",
    category_id: "",
    cost_price: "",
    sale_price: "",
    quantity: "",
  });
  const [productDetail, setProductDetail] = useState<{ id: string; name: string } | null>(null);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [repSearch, setRepSearch] = useState("");
  const [repCat, setRepCat] = useState("الكل");
  const [from, setFrom] = useState(isoDay(-30));
  const [to, setTo] = useState(isoDay());

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("id, name").order("name")).data ?? [],
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id, name").order("name")).data ?? [],
  });

  const { data: products } = useQuery({
    queryKey: ["products-basic"],
    queryFn: async () =>
      ((
        await supabase
          .from("products")
          .select("id, name, barcode, cost_price, sale_price, category_id, categories(name)")
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
            "product_id, product_name, quantity, unit_price, sales!inner(id, created_at, cashier_id, branch_id, payment_method, invoice_no, customer_name, total)",
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

  const invoices = useMemo(() => {
    const branchName = (id: string | null) => (branches ?? []).find((b) => b.id === id)?.name ?? "—";
    const map = new Map<string, ReceiptData & { date: string; branchId: string | null }>();
    for (const it of movement?.items ?? []) {
      const s = it.sales;
      if (branch !== "all" && s.branch_id !== branch) continue;
      const cur =
        map.get(s.id) ??
        {
          invoiceNo: s.invoice_no,
          createdAt: s.created_at,
          branch: branchName(s.branch_id),
          cashier: movement?.names.get(s.cashier_id ?? "") ?? "—",
          customer: s.customer_name,
          paymentMethod: s.payment_method,
          items: [] as { name: string; qty: number; price: number }[],
          total: Number(s.total),
          date: s.created_at.slice(0, 10),
          branchId: s.branch_id,
        };
      cur.items.push({ name: it.product_name, qty: Number(it.quantity), price: Number(it.unit_price) });
      map.set(s.id, cur);
    }
    return [...map.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [movement, branches, branch]);

  // تقرير الأصناف: المباع والإيراد والربح لكل صنف خلال الفترة
  const productReport = useMemo(() => {
    const costOf = (id: string) => Number((products ?? []).find((p) => p.id === id)?.cost_price ?? 0);
    const map = new Map<
      string,
      { id: string; name: string; units: number; revenue: number; cost: number; invoices: Set<string> }
    >();
    for (const it of movement?.items ?? []) {
      const s = it.sales;
      if (branch !== "all" && s.branch_id !== branch) continue;
      const id = it.product_id ?? `x-${it.product_name}`;
      const cur = map.get(id) ?? { id, name: it.product_name, units: 0, revenue: 0, cost: 0, invoices: new Set<string>() };
      const qty = Number(it.quantity);
      cur.units += qty;
      cur.revenue += qty * Number(it.unit_price);
      cur.cost += qty * (it.product_id ? costOf(it.product_id) : 0);
      cur.invoices.add(s.id);
      map.set(id, cur);
    }
    return [...map.values()].sort((a, b) => b.units - a.units);
  }, [movement, branch, products]);

  // أسعار الشراء والبيع لكل منتج
  const priceOf = (id: string) => {
    const p = (products ?? []).find((x) => x.id === id);
    return { cost: Number(p?.cost_price ?? 0), sale: Number(p?.sale_price ?? 0) };
  };

  // تجميع تقرير الأصناف حسب الفئة — يعرض كل منتجات الفئة (حتى غير المباعة) كما في نقاط البيع
  const categoryReport = useMemo(() => {
    const stk = stock ?? [];
    const stockOf = (id: string) =>
      branch === "all"
        ? stk.filter((s) => s.product_id === id).reduce((a, r) => a + Number(r.quantity), 0)
        : Number(stk.find((s) => s.product_id === id && s.branch_id === branch)?.quantity ?? 0);
    const statsOf = new Map(productReport.map((p) => [p.id, p]));

    type Item = {
      id: string;
      name: string;
      barcode: string | null;
      stock: number;
      units: number;
      revenue: number;
      cost: number;
      invoices: Set<string>;
    };
    const map = new Map<string, { name: string; items: Item[] }>();
    const push = (catName: string, item: Item) => {
      const cur = map.get(catName) ?? { name: catName, items: [] };
      cur.items.push(item);
      map.set(catName, cur);
    };

    for (const p of products ?? []) {
      const st = statsOf.get(p.id);
      push(p.categories?.name ?? "بدون فئة", {
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        stock: stockOf(p.id),
        units: st?.units ?? 0,
        revenue: st?.revenue ?? 0,
        cost: st?.cost ?? 0,
        invoices: st?.invoices ?? new Set<string>(),
      });
    }
    // منتجات محذوفة ظهرت في المبيعات فقط
    for (const p of productReport) {
      if (!p.id.startsWith("x-")) continue;
      push("بدون فئة", {
        id: p.id,
        name: p.name,
        barcode: null,
        stock: 0,
        units: p.units,
        revenue: p.revenue,
        cost: p.cost,
        invoices: p.invoices,
      });
    }

    return [...map.values()]
      .map((c) => ({
        ...c,
        items: c.items.sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, "ar")),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [productReport, products, stock, branch]);

  // فئات تقرير الأصناف + البحث
  const reportCatNames = useMemo(
    () => ["الكل", ...categoryReport.map((c) => c.name)],
    [categoryReport],
  );

  const filteredCategoryReport = useMemo(() => {
    const q = repSearch.trim().toLowerCase();
    return categoryReport
      .filter((c) => repCat === "الكل" || c.name === repCat)
      .map((c) => ({
        ...c,
        items: q
          ? c.items.filter(
              (p) =>
                p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q),
            )
          : c.items,
      }))
      .filter((c) => c.items.length > 0);
  }, [categoryReport, repCat, repSearch]);


  // فواتير صنف محدد
  const productInvoices = useMemo(() => {
    if (!productDetail) return [];
    const branchName = (id: string | null) => (branches ?? []).find((b) => b.id === id)?.name ?? "—";
    return (movement?.items ?? [])
      .filter((it) => (it.product_id ?? `x-${it.product_name}`) === productDetail.id)
      .filter((it) => branch === "all" || it.sales.branch_id === branch)
      .map((it) => ({
        saleId: it.sales.id,
        invoiceNo: it.sales.invoice_no,
        createdAt: it.sales.created_at,
        branch: branchName(it.sales.branch_id),
        seller: movement?.names.get(it.sales.cashier_id ?? "") ?? "—",
        qty: Number(it.quantity),
        price: Number(it.unit_price),
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [productDetail, movement, branches, branch]);


  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      const cost = Number(form.cost_price || 0);
      const price = Number(form.sale_price || 0);
      if (price <= 0) throw new Error("أدخل سعر بيع صحيح");
      if (price < cost) throw new Error("سعر البيع أقل من سعر الشراء");
      const { data: product, error } = await supabase
        .from("products")
        .insert({
          name: form.name.trim(),
          barcode: form.barcode.trim() || null,
          category_id: form.category_id || null,
          cost_price: cost,
          sale_price: price,
        })
        .select("id")
        .single();
      if (error) {
        throw new Error(error.code === "23505" ? "هذا الباركود مستخدم لمنتج آخر" : error.message);
      }

      const branch = form.branch_id || me?.profile?.branch_id;
      const qty = Math.floor(Number(form.quantity || 0));
      if (branch && qty > 0) {
        const { error: stockError } = await supabase
          .from("stock")
          .upsert({ product_id: product.id, branch_id: branch, quantity: qty });
        if (stockError) throw stockError;
      }
      toast.success("تمت إضافة المنتج");
      setProductOpen(false);
      setForm({ name: "", barcode: "", category_id: "", cost_price: "", sale_price: "", quantity: "", branch_id: "" });
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّرت الإضافة");
    }
  }

  function openEdit(row: Line) {
    setEditRow(row);
    setEditForm({
      name: row.product.name,
      barcode: row.product.barcode ?? "",
      category_id: row.product.category_id ?? "",
      cost_price: String(row.product.cost_price ?? ""),
      sale_price: String(row.product.sale_price ?? ""),
      quantity: String(row.quantity),
    });
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    const cost = Number(editForm.cost_price || 0);
    const price = Number(editForm.sale_price || 0);
    if (!editForm.name.trim()) {
      toast.error("أدخل اسم المنتج");
      return;
    }
    if (price <= 0) {
      toast.error("أدخل سعر بيع صحيح");
      return;
    }
    if (price < cost) {
      toast.error("سعر البيع أقل من سعر الشراء");
      return;
    }
    const qty = Math.floor(Number(editForm.quantity || 0));
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("أدخل كمية صحيحة");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("products")
      .update({
        name: editForm.name.trim(),
        barcode: editForm.barcode.trim() || null,
        category_id: editForm.category_id || null,
        cost_price: cost,
        sale_price: price,
      })
      .eq("id", editRow.product.id);
    if (error) {
      setSaving(false);
      toast.error(error.code === "23505" ? "هذا الباركود مستخدم لمنتج آخر" : error.message);
      return;
    }

    const target = editRow.branchId || (branch !== "all" ? branch : me?.profile?.branch_id) || null;
    if (target && qty !== editRow.quantity) {
      const { error: stockError } = await supabase
        .from("stock")
        .upsert({ product_id: editRow.product.id, branch_id: target, quantity: qty }, { onConflict: "product_id,branch_id" });
      if (stockError) {
        setSaving(false);
        toast.error(stockError.message);
        return;
      }
    }
    setSaving(false);
    toast.success("تم حفظ التعديلات");
    setEditRow(null);
    queryClient.invalidateQueries();
  }


  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = catName.trim();
    if (!name) return;
    setSaving(true);
    const { error } = await supabase.from("categories").insert({ name });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("تمت إضافة الصنف");
      setCatName("");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
  }

  async function renameCategory(id: string, current: string) {
    const v = window.prompt("اسم الصنف", current);
    if (!v || v.trim() === current) return;
    const { error } = await supabase.from("categories").update({ name: v.trim() }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("تم التعديل");
      queryClient.invalidateQueries();
    }
  }

  async function deleteCategory(id: string) {
    if (!window.confirm("حذف هذا الصنف؟")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("تم الحذف");
      queryClient.invalidateQueries();
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
            {me?.isAdmin && (
              <>
                <Dialog open={productOpen} onOpenChange={setProductOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="size-4" />
                      منتج جديد
                    </Button>
                  </DialogTrigger>
                  <DialogContent dir="rtl">
                    <DialogHeader>
                      <DialogTitle>إضافة منتج</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={addProduct} className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>اسم المنتج</Label>
                        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>الباركود</Label>
                          <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>الصنف</Label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={form.category_id}
                            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                          >
                            <option value="">بدون</option>
                            {(categories ?? []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>سعر الشراء</Label>
                          <Input
                            type="number"
                            value={form.cost_price}
                            onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>سعر البيع</Label>
                          <Input
                            type="number"
                            value={form.sale_price}
                            onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>الكمية الابتدائية</Label>
                          <Input
                            type="number"
                            value={form.quantity}
                            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>الفرع</Label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={form.branch_id}
                            onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                          >
                            <option value="">فرعي الحالي</option>
                            {(branches ?? []).map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <Button type="submit" className="w-full">
                        حفظ المنتج
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
                <Dialog open={catOpen} onOpenChange={setCatOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Tags className="size-4" />
                      إدارة الأصناف
                    </Button>
                  </DialogTrigger>
                  <DialogContent dir="rtl">
                    <DialogHeader>
                      <DialogTitle>إدارة الأصناف</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={addCategory} className="flex gap-2">
                      <Input
                        value={catName}
                        onChange={(e) => setCatName(e.target.value)}
                        placeholder="اسم صنف جديد"
                        required
                      />
                      <Button type="submit" disabled={saving}>
                        إضافة
                      </Button>
                    </form>
                    <div className="max-h-72 space-y-1 overflow-auto">
                      {(categories ?? []).length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">لا توجد أصناف</p>
                      )}
                      {(categories ?? []).map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <span className="font-medium">{c.name}</span>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => renameCategory(c.id, c.name)}>
                              تعديل
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteCategory(c.id)}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
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

      <div className="surface mb-4 p-4">
        <h2 className="font-bold">حركة الصرف من المخزن</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          الكميات المباعة حسب التاريخ والحساب الذي باع — من {from} إلى {to}
        </p>
        <div className="max-h-[24rem] overflow-auto">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-3 font-medium">التاريخ</th>
                <th className="p-3 font-medium">الفرع</th>
                <th className="p-3 font-medium">الحساب الذي باع</th>
                <th className="p-3 font-medium">الفواتير</th>
                <th className="p-3 font-medium">القطع المصروفة</th>
                <th className="p-3 font-medium">نقدي</th>
                <th className="p-3 font-medium">بنكك</th>
                <th className="p-3 font-medium">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {movementRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    لا توجد حركة في هذه الفترة
                  </td>
                </tr>
              )}
              {movementRows.map((m, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td className="p-3 font-semibold">{formatDate(new Date(`${m.date}T00:00:00`))}</td>
                  <td className="p-3 text-muted-foreground">{m.branch}</td>
                  <td className="p-3">{m.seller}</td>
                  <td className="p-3">{formatNumber(m.invoices.size)}</td>
                  <td className="p-3 font-bold">{formatNumber(m.units)}</td>
                  <td className="p-3 text-muted-foreground">{formatSDG(m.cash)}</td>
                  <td className="p-3 text-muted-foreground">{formatSDG(m.bankak)}</td>
                  <td className="p-3 font-bold text-gold">{formatSDG(m.cash + m.bankak)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface mb-4 p-4">
        <h2 className="font-bold">تقرير الأصناف</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          ابحث بالاسم أو الباركود واختر الفئة — من {from} إلى {to}
        </p>

        <input
          value={repSearch}
          onChange={(e) => setRepSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الباركود…"
          className="mb-3 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-gold"
        />
        <div className="mb-4 flex flex-wrap gap-2">
          {reportCatNames.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRepCat(n)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                repCat === n
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/70"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="max-h-[24rem] overflow-auto">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-3 font-medium">الصنف / المنتج</th>
                <th className="p-3 font-medium">سعر الشراء</th>
                <th className="p-3 font-medium">سعر البيع</th>
                <th className="p-3 font-medium">القطع المباعة</th>
                <th className="p-3 font-medium">عدد الفواتير</th>
                <th className="p-3 font-medium">الإيراد</th>
                <th className="p-3 font-medium">التكلفة</th>
                <th className="p-3 font-medium">الربح</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategoryReport.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    لا توجد نتائج في هذه الفترة
                  </td>
                </tr>
              )}
              {filteredCategoryReport.map((c) => {
                const expanded = openCats[c.name] || repSearch.trim().length > 0;
                const units = c.items.reduce((s, p) => s + p.units, 0);
                const revenue = c.items.reduce((s, p) => s + p.revenue, 0);
                const cost = c.items.reduce((s, p) => s + p.cost, 0);
                const invoices = new Set(c.items.flatMap((p) => [...p.invoices])).size;
                return (
                <Fragment key={c.name}>
                  <tr
                    onClick={() => setOpenCats((s) => ({ ...s, [c.name]: !s[c.name] }))}
                    className="cursor-pointer border-b border-border/60 bg-secondary/30 hover:bg-secondary/60"
                  >
                    <td className="p-3 font-bold">
                      <span className="ml-2 text-muted-foreground">{expanded ? "▾" : "▸"}</span>
                      {c.name}
                      <span className="mr-2 text-xs text-muted-foreground">({c.items.length} منتج)</span>
                    </td>
                    <td className="p-3 text-muted-foreground">—</td>
                    <td className="p-3 text-muted-foreground">—</td>
                    <td className="p-3 font-bold">{formatNumber(units)}</td>
                    <td className="p-3 text-muted-foreground">{formatNumber(invoices)}</td>
                    <td className="p-3 font-bold text-gold">{formatSDG(revenue)}</td>
                    <td className="p-3 text-muted-foreground">{formatSDG(cost)}</td>
                    <td className="p-3 font-bold">{formatSDG(revenue - cost)}</td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-border/60">
                      <td colSpan={8} className="p-3">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                          {c.items.map((p) => {
                            const pr = priceOf(p.id);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setProductDetail({ id: p.id, name: p.name })}
                                className="flex flex-col gap-1 rounded-xl border border-border bg-background p-3 text-right transition-colors hover:border-gold"
                              >
                                <span className="line-clamp-2 text-sm font-bold">{p.name}</span>
                                {p.barcode && (
                                  <span className="text-[11px] text-muted-foreground" dir="ltr">
                                    {p.barcode}
                                  </span>
                                )}
                                <span className="text-sm font-bold text-gold">{formatSDG(pr.sale)}</span>
                                <span className="text-[11px] text-muted-foreground">
                                  شراء: {formatSDG(pr.cost)}
                                </span>
                                <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                                  <span className="rounded-full bg-secondary px-2 py-0.5">
                                    المخزون: {formatNumber(p.stock)}
                                  </span>
                                  <span className="rounded-full bg-secondary px-2 py-0.5">
                                    المباع: {formatNumber(p.units)}
                                  </span>
                                  <span className="rounded-full bg-secondary px-2 py-0.5">
                                    فواتير: {formatNumber(p.invoices.size)}
                                  </span>
                                </div>
                                <span className="text-[11px] text-muted-foreground">
                                  إيراد: {formatSDG(p.revenue)} — ربح: {formatSDG(p.revenue - p.cost)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}

                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>


      <div className="surface mb-4 p-4">
        <h2 className="font-bold">الفواتير</h2>
        <p className="mb-3 text-sm text-muted-foreground">اضغط على الفاتورة لعرضها وطباعتها</p>
        <div className="max-h-[24rem] overflow-auto">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-3 font-medium">رقم الفاتورة</th>
                <th className="p-3 font-medium">التاريخ</th>
                <th className="p-3 font-medium">الفرع</th>
                <th className="p-3 font-medium">الحساب الذي باع</th>
                <th className="p-3 font-medium">الأصناف</th>
                <th className="p-3 font-medium">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    لا توجد فواتير في هذه الفترة
                  </td>
                </tr>
              )}
              {invoices.map((inv) => (
                <tr
                  key={String(inv.invoiceNo)}
                  onClick={() => setReceipt(inv)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-secondary/50"
                >
                  <td className="p-3 font-bold">#{inv.invoiceNo}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(new Date(inv.createdAt))}</td>
                  <td className="p-3 text-muted-foreground">{inv.branch}</td>
                  <td className="p-3">{inv.cashier}</td>
                  <td className="p-3">{formatNumber(inv.items.length)}</td>
                  <td className="p-3 font-bold text-gold">{formatSDG(inv.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                <th className="p-3 font-medium">المباع بالفترة</th>
                <th className="p-3 font-medium">التكلفة</th>
                <th className="p-3 font-medium">قيمة التكلفة</th>
                <th className="p-3 font-medium">قيمة البيع</th>
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
                    <div className="flex items-center gap-2">
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
                      {me?.isAdmin && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline hover:text-gold"
                          onClick={() => openEdit(r)}
                        >
                          تعديل المنتج
                        </button>
                      )}
                    </div>
                  </td>

                  <td className="p-3 text-muted-foreground">{formatNumber(soldByProduct.get(r.product.id) ?? 0)}</td>
                  <td className="p-3 text-muted-foreground">{formatSDG(Number(r.product.cost_price))}</td>
                  <td className="p-3">{formatSDG(r.quantity * Number(r.product.cost_price))}</td>
                  <td className="p-3 font-bold text-gold">{formatSDG(r.quantity * Number(r.product.sale_price))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!editRow} onOpenChange={(v) => !v && setEditRow(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المنتج</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveProduct} className="space-y-3">
            <div className="space-y-1.5">
              <Label>اسم المنتج</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الباركود</Label>
                <Input value={editForm.barcode} onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>الصنف</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={editForm.category_id}
                  onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
                >
                  <option value="">بدون</option>
                  {(categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>سعر الشراء</Label>
                <Input
                  type="number"
                  value={editForm.cost_price}
                  onChange={(e) => setEditForm({ ...editForm, cost_price: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>سعر البيع</Label>
                <Input
                  type="number"
                  value={editForm.sale_price}
                  onChange={(e) => setEditForm({ ...editForm, sale_price: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>الكمية ({editRow?.branchName})</Label>
              <Input
                type="number"
                min={0}
                value={editForm.quantity}
                onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              حفظ التعديلات
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!productDetail} onOpenChange={(v) => !v && setProductDetail(null)}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>فواتير الصنف: {productDetail?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[24rem] overflow-auto">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 font-medium">الفاتورة</th>
                  <th className="p-2 font-medium">التاريخ</th>
                  <th className="p-2 font-medium">الفرع</th>
                  <th className="p-2 font-medium">الحساب الذي باع</th>
                  <th className="p-2 font-medium">الكمية</th>
                  <th className="p-2 font-medium">السعر</th>
                  <th className="p-2 font-medium">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {productInvoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      لا توجد فواتير
                    </td>
                  </tr>
                )}
                {productInvoices.map((r, i) => (
                  <tr
                    key={`${r.saleId}-${i}`}
                    onClick={() => {
                      const inv = invoices.find((x) => x.invoiceNo === r.invoiceNo);
                      if (inv) setReceipt(inv);
                    }}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-secondary/50"
                  >
                    <td className="p-2 font-bold">#{r.invoiceNo}</td>
                    <td className="p-2 text-muted-foreground">{formatDate(new Date(r.createdAt))}</td>
                    <td className="p-2 text-muted-foreground">{r.branch}</td>
                    <td className="p-2">{r.seller}</td>
                    <td className="p-2 font-bold">{formatNumber(r.qty)}</td>
                    <td className="p-2 text-muted-foreground">{formatSDG(r.price)}</td>
                    <td className="p-2 font-bold text-gold">{formatSDG(r.qty * r.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

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

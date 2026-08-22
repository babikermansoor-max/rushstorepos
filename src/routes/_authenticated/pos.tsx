import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Minus, Trash2, ShoppingCart, Check, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSession } from "@/hooks/useSession";
import { PageHeader } from "@/components/AppLayout";
import { ReceiptDialog, type ReceiptData } from "@/components/Receipt";
import { formatSDG } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "نقطة البيع — Rush Store" },
      { name: "description", content: "شاشة البيع السريع: مسح الباركود، بحث فوري، سلة، فاتورة رقمية قابلة للطباعة." },
      { property: "og:title", content: "نقطة البيع — Rush Store" },
      { property: "og:description", content: "بيع سريع بالباركود مع فاتورة رقمية محفوظة في قاعدة البيانات." },
    ],
  }),
  component: POS,
});

type CartLine = { id: string; name: string; price: number; qty: number; stock: number };
type ProductRow = { id: string; name: string; barcode: string | null; sale_price: number; category_id: string | null; stock: number };

function POS() {
  const { user } = useSession();
  const { data: me } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const branchId = me?.profile?.branch_id ?? null;

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("");
  const [method, setMethod] = useState<"cash" | "bankak">("cash");
  const [paid, setPaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id, name").order("name")).data ?? [],
  });

  const { data: products } = useQuery({
    queryKey: ["pos-products", branchId],
    queryFn: async (): Promise<ProductRow[]> => {
      const { data } = await supabase
        .from("products")
        .select("id, name, barcode, sale_price, category_id, stock(quantity, branch_id)")
        .eq("is_active", true)
        .order("name");
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        sale_price: Number(p.sale_price),
        category_id: p.category_id,
        stock:
          (p.stock as { quantity: number; branch_id: string }[] | null)?.find(
            (s) => s.branch_id === branchId,
          )?.quantity ?? 0,
      }));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter(
      (p) =>
        (category === "all" || p.category_id === category) &&
        (!q || p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q)),
    );
  }, [products, search, category]);

  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const units = cart.reduce((s, l) => s + l.qty, 0);

  function addToCart(p: ProductRow, qty = 1) {
    setCart((prev) => {
      const found = prev.find((l) => l.id === p.id);
      const nextQty = (found?.qty ?? 0) + qty;
      if (p.stock > 0 && nextQty > p.stock) {
        toast.warning(`الكمية المتاحة من ${p.name}: ${p.stock}`);
      }
      if (found) return prev.map((l) => (l.id === p.id ? { ...l, qty: nextQty } : l));
      return [...prev, { id: p.id, name: p.name, price: p.sale_price, qty, stock: p.stock }];
    });
  }

  // مسح الباركود / بحث سريع: Enter يضيف المطابق مباشرة
  function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim().toLowerCase();
    if (!q) return;
    const list = products ?? [];
    const match =
      list.find((p) => (p.barcode ?? "").toLowerCase() === q) ??
      (filtered.length === 1 ? filtered[0] : undefined) ??
      list.find((p) => p.name.toLowerCase() === q);
    if (!match) {
      toast.error("لا يوجد منتج مطابق");
      return;
    }
    addToCart(match);
    setSearch("");
    scanRef.current?.focus();
  }

  function setQty(id: string, delta: number) {
    setCart((prev) =>
      prev.flatMap((l) => (l.id === id ? (l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }]) : [l])),
    );
  }

  function setQtyExact(id: string, value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    setCart((prev) => prev.map((l) => (l.id === id ? { ...l, qty: Math.floor(value) } : l)));
  }

  async function checkout() {
    if (!cart.length || !user) return;
    setBusy(true);
    try {
      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          branch_id: branchId,
          cashier_id: user.id,
          customer_name: customer || null,
          total,
          payment_method: method,
        })
        .select("id, invoice_no, created_at")
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from("sale_items").insert(
        cart.map((l) => ({
          sale_id: sale.id,
          product_id: l.id,
          product_name: l.name,
          quantity: l.qty,
          unit_price: l.price,
        })),
      );
      if (itemsError) throw itemsError;

      setReceipt({
        invoiceNo: sale.invoice_no,
        createdAt: sale.created_at,
        branch: (me?.profile as { branches?: { name: string } } | undefined)?.branches?.name ?? null,
        cashier: me?.profile?.full_name || user.email || null,
        customer: customer || null,
        paymentMethod: method,
        items: cart.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
        total,
        paid: method === "cash" && paid ? Number(paid) : null,
      });
      setReceiptOpen(true);

      toast.success(`تم إتمام البيع — فاتورة رقم ${sale.invoice_no}`);
      setCart([]);
      setCustomer("");
      setPaid("");
      setSearch("");
      queryClient.invalidateQueries();
      scanRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر إتمام البيع");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div>
      <PageHeader title="نقطة البيع" subtitle="اختر المنتجات ثم أتمم الفاتورة" />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="surface p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث عن منتج أو باركود..."
              className="pr-9"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setCategory("all")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                category === "all" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              الكل
            </button>
            {(categories ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  category === c.id ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="rounded-xl border border-border bg-card p-4 text-right transition-all hover:border-primary hover:shadow-panel"
              >
                <p className="font-semibold leading-tight">{p.name}</p>
                <p className="mt-2 text-lg font-bold text-gold">{formatSDG(Number(p.sale_price))}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.stock > 0 ? `متوفر: ${p.stock}` : "نفد المخزون"}
                </p>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-muted-foreground">لا توجد منتجات</p>
            )}
          </div>
        </div>

        <div className="surface flex h-fit flex-col p-4 lg:sticky lg:top-24">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <ShoppingCart className="size-4 text-primary" />
            <h2 className="font-bold">السلة</h2>
            <span className="mr-auto text-sm text-muted-foreground">{cart.length} صنف</span>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto py-3">
            {cart.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">السلة فارغة</p>
            )}
            {cart.map((l) => (
              <div key={l.id} className="rounded-lg bg-muted/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{l.name}</p>
                  <button onClick={() => setCart((c) => c.filter((x) => x.id !== l.id))}>
                    <Trash2 className="size-4 text-destructive" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQty(l.id, -1)} className="grid size-7 place-items-center rounded-md bg-card">
                      <Minus className="size-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{l.qty}</span>
                    <button onClick={() => setQty(l.id, 1)} className="grid size-7 place-items-center rounded-md bg-card">
                      <Plus className="size-3" />
                    </button>
                  </div>
                  <span className="text-sm font-bold">{formatSDG(l.price * l.qty)}</span>
                </div>
              </div>
            ))}
          </div>

          <Input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="اسم العميل (اختياري)"
            className="mb-3"
          />

          <div className="mb-3 grid grid-cols-2 gap-2">
            {(["cash", "bankak"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                  method === m ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card"
                }`}
              >
                {m === "cash" ? "نقدي" : "بنكك"}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-border py-3">
            <span className="text-sm text-muted-foreground">الإجمالي</span>
            <span className="text-2xl font-extrabold">{formatSDG(total)}</span>
          </div>

          <Button onClick={checkout} disabled={!cart.length || busy} className="w-full py-6 text-base font-bold">
            <Check className="size-4" />
            {busy ? "جارٍ الحفظ..." : "إتمام البيع"}
          </Button>
        </div>
      </div>
    </div>
  );
}

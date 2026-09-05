import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSession } from "@/hooks/useSession";
import { PageHeader } from "@/components/AppLayout";
import { formatDateTime, formatSDG } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/returns")({
  head: () => ({
    meta: [
      { title: "المرتجعات — Rush Store" },
      { name: "description", content: "تسجيل مرتجعات العملاء وإرجاع الكميات للمخزون تلقائياً." },
      { property: "og:title", content: "المرتجعات — Rush Store" },
      { property: "og:description", content: "تسجيل مرتجعات العملاء وإرجاع الكميات للمخزون." },
    ],
  }),
  component: Returns,
});

function Returns() {
  const { user } = useSession();
  const { data: me } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", quantity: "1", amount: "", reason: "" });
  const [unitPrice, setUnitPrice] = useState(0);

  const [barcode, setBarcode] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products-basic"],
    queryFn: async () =>
      (await supabase.from("products").select("id, name, sale_price, barcode").order("name")).data ?? [],
  });

  // سعر البيع الفعلي لآخر فاتورة بيع لهذا المنتج، وإلا سعر البيع الحالي
  async function lastSoldPrice(productId: string, fallback: number) {
    const { data } = await supabase
      .from("sale_items")
      .select("unit_price, sales!inner(created_at)")
      .eq("product_id", productId)
      .order("created_at", { ascending: false, referencedTable: "sales" })
      .limit(1);
    const price = Number((data ?? [])[0]?.unit_price ?? 0);
    return price > 0 ? price : fallback;
  }

  async function selectProduct(productId: string, addOne = false) {
    const found = (products ?? []).find((p) => p.id === productId);
    if (!found) return;
    const unit = await lastSoldPrice(found.id, Number(found.sale_price));
    setUnitPrice(unit);
    setForm((f) => {
      const same = f.product_id === found.id;
      const qty = addOne ? (same ? Math.floor(Number(f.quantity || 1)) + 1 : 1) : Math.max(1, Math.floor(Number(f.quantity || 1)));
      return { ...f, product_id: found.id, quantity: String(qty), amount: String(unit * qty) };
    });
  }

  function changeQuantity(value: string) {
    const qty = Math.max(1, Math.floor(Number(value || 1)));
    setForm((f) => ({ ...f, quantity: value, amount: unitPrice > 0 ? String(unitPrice * qty) : f.amount }));
  }

  async function scanBarcode(code: string) {
    const v = code.trim();
    if (!v) return;
    const found = (products ?? []).find((p) => (p.barcode ?? "").trim() === v);
    if (!found) {
      toast.error("لا يوجد منتج بهذا الباركود");
      return;
    }
    await selectProduct(found.id, true);
    setBarcode("");
    toast.success(`تمت إضافة ${found.name}`);
  }




  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () =>
      (await supabase.from("branches").select("id, name, is_main").order("is_main", { ascending: false })).data ?? [],
  });


  const { data: rows, isLoading } = useQuery({
    queryKey: ["returns"],
    queryFn: async () =>
      (
        await supabase
          .from("returns")
          .select("id, product_name, quantity, amount, reason, created_at, branches(name)")
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? [],
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const product = (products ?? []).find((p) => p.id === form.product_id);
    if (!product || !user) return;
    const qty = Math.floor(Number(form.quantity || 1));
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("أدخل كمية صحيحة");
      return;
    }
    const branchId = me?.profile?.branch_id ?? (branches ?? [])[0]?.id ?? null;
    if (!branchId) {
      toast.error("لا يوجد فرع محدد لإرجاع الكمية إليه");
      return;
    }
    const { error } = await supabase.from("returns").insert({
      product_id: product.id,
      product_name: product.name,
      branch_id: branchId,
      quantity: qty,
      amount: Number(form.amount || Number(product.sale_price) * qty),
      reason: form.reason || null,
      created_by: user.id,
    });

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم تسجيل المرتجع وإرجاع الكمية للمخزون");
    setOpen(false);
    setForm({ product_id: "", quantity: "1", amount: "", reason: "" });
    setBarcode("");
    queryClient.invalidateQueries();
  }

  return (
    <div>
      <PageHeader
        title="المرتجعات"
        subtitle="إرجاع المنتجات وإعادتها للمخزون"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> مرتجع جديد
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>تسجيل مرتجع</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>الباركود</Label>
                  <Input
                    autoFocus
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void scanBarcode(barcode);
                      }
                    }}
                    placeholder="امسح الباركود ثم Enter"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>المنتج</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.product_id}
                    onChange={(e) => void selectProduct(e.target.value)}
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>الكمية</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.quantity}
                      onChange={(e) => changeQuantity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>المبلغ المسترد</Label>
                    <Input
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder="تلقائي حسب سعر البيع"
                    />
                    {unitPrice > 0 && (
                      <p className="text-xs text-muted-foreground">
                        سعر القطعة {formatSDG(unitPrice)} — المتوقع{" "}
                        {formatSDG(unitPrice * Math.max(1, Math.floor(Number(form.quantity || 1))))}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>السبب</Label>
                  <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                </div>
                <Button type="submit" className="w-full">
                  حفظ المرتجع
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="surface overflow-x-auto p-4">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="p-3 font-medium">المنتج</th>
              <th className="p-3 font-medium">الكمية</th>
              <th className="p-3 font-medium">المبلغ</th>
              <th className="p-3 font-medium">السبب</th>
              <th className="p-3 font-medium">الفرع</th>
              <th className="p-3 font-medium">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  جارٍ التحميل...
                </td>
              </tr>
            )}
            {(rows ?? []).length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  لا توجد مرتجعات
                </td>
              </tr>
            )}
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="p-3 font-semibold">{r.product_name}</td>
                <td className="p-3">{r.quantity}</td>
                <td className="p-3 text-destructive">{formatSDG(Number(r.amount))}</td>
                <td className="p-3 text-muted-foreground">{r.reason ?? "—"}</td>
                <td className="p-3 text-muted-foreground">
                  {(r.branches as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="p-3 text-muted-foreground">{formatDateTime(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSession } from "@/hooks/useSession";
import { PageHeader } from "@/components/AppLayout";
import { formatNumber, formatSDG } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "المخزون والجرد — Rush Store" },
      { name: "description", content: "جرد المنتجات وتصحيح الكميات في كل فرع مع الأسعار." },
      { property: "og:title", content: "المخزون والجرد — Rush Store" },
      { property: "og:description", content: "جرد المنتجات وتصحيح الكميات في الفروع." },
    ],
  }),
  component: Inventory,
});

type ProductRow = {
  id: string;
  name: string;
  barcode: string | null;
  cost_price: number;
  sale_price: number;
  categories: { name: string } | null;
  stock: { quantity: number; branch_id: string }[];
};

function Inventory() {
  const { user } = useSession();
  const { data: me } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("id, name").order("name")).data ?? [],
  });

  useEffect(() => {
    if (branch) return;
    const preferred = me?.profile?.branch_id ?? branches?.[0]?.id;
    if (preferred) setBranch(preferred);
  }, [branch, branches, me?.profile?.branch_id]);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () =>
      ((
        await supabase
          .from("products")
          .select("id, name, barcode, cost_price, sale_price, categories(name), stock(quantity, branch_id)")
          .order("name")
      ).data ?? []) as unknown as ProductRow[],
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products ?? [])
      .filter((p) => !term || p.name.toLowerCase().includes(term) || (p.barcode ?? "").includes(search.trim()))
      .map((p) => ({
        ...p,
        recorded: p.stock.find((s) => s.branch_id === branch)?.quantity ?? 0,
      }));
  }, [products, search, branch]);

  const changed = rows.filter((r) => {
    const raw = counts[r.id];
    if (raw === undefined || raw === "") return false;
    const v = Math.floor(Number(raw));
    return Number.isFinite(v) && v >= 0 && v !== r.recorded;
  });

  async function saveCount() {
    if (!branch || changed.length === 0) return;
    setSaving(true);
    const { error } = await supabase.from("stock").upsert(
      changed.map((r) => ({
        product_id: r.id,
        branch_id: branch,
        quantity: Math.floor(Number(counts[r.id])),
      })),
      { onConflict: "product_id,branch_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`تم حفظ الجرد لـ ${changed.length} منتج`);
    setCounts({});
    queryClient.invalidateQueries();
  }

  return (
    <div>
      <PageHeader title="المخزون والجرد" subtitle="إدخال الكمية الفعلية ومقارنتها بالمسجل" />

      <div className="surface p-4">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الباركود..."
              className="pr-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label>الفرع</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setCounts({});
              }}
            >
              {(branches ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          {me?.isAdmin && (
            <Button onClick={saveCount} disabled={saving || changed.length === 0}>
              حفظ الجرد {changed.length > 0 ? `(${changed.length})` : ""}
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-3 font-medium">المنتج</th>
                <th className="p-3 font-medium">الصنف</th>
                <th className="p-3 font-medium">الشراء</th>
                <th className="p-3 font-medium">البيع</th>
                <th className="p-3 font-medium">المسجل</th>
                <th className="p-3 font-medium">الفعلي</th>
                <th className="p-3 font-medium">الفرق</th>
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
                    لا توجد منتجات
                  </td>
                </tr>
              )}
              {rows.map((p) => {
                const raw = counts[p.id];
                const actual = raw === undefined || raw === "" ? null : Math.floor(Number(raw));
                const diff = actual === null || !Number.isFinite(actual) ? null : actual - p.recorded;
                return (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="p-3">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {p.barcode ?? "—"}
                      </p>
                    </td>
                    <td className="p-3 text-muted-foreground">{p.categories?.name ?? "—"}</td>
                    <td className="p-3">{formatSDG(Number(p.cost_price))}</td>
                    <td className="p-3 font-semibold text-gold">{formatSDG(Number(p.sale_price))}</td>
                    <td className="p-3 font-semibold">{formatNumber(p.recorded)}</td>
                    <td className="p-3">
                      {me?.isAdmin ? (
                        <Input
                          type="number"
                          min={0}
                          className="h-9 w-24"
                          placeholder={String(p.recorded)}
                          value={raw ?? ""}
                          onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {diff === null || diff === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            diff > 0 ? "bg-primary/15 text-primary" : "bg-destructive/10 text-destructive"
                          }`}
                          dir="ltr"
                        >
                          {diff > 0 ? "+" : ""}
                          {diff}
                        </span>
                      )}
                    </td>
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

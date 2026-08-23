import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSession } from "@/hooks/useSession";
import { PageHeader } from "@/components/AppLayout";
import { formatSDG } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "المخزون — Rush Store" },
      { name: "description", content: "إدارة المنتجات والكميات في كل فرع مع الأسعار والأرباح." },
      { property: "og:title", content: "المخزون — Rush Store" },
      { property: "og:description", content: "إدارة المنتجات والكميات في كل فرع." },
    ],
  }),
  component: Inventory,
});

function Inventory() {
  const { user } = useSession();
  const { data: me } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");


  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id, name").order("name")).data ?? [],
  });
  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("id, name").order("name")).data ?? [],
  });
  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () =>
      (
        await supabase
          .from("products")
          .select("id, name, barcode, cost_price, sale_price, categories(name), stock(quantity, branches(name))")
          .order("name")
      ).data ?? [],
  });

  const rows = (products ?? []).filter(
    (p) =>
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode ?? "").includes(search),
  );


  async function updateStock(productId: string, branchName: string, quantity: number) {
    const branch = (branches ?? []).find((b) => b.name === branchName);
    if (!branch) return;
    const { error } = await supabase
      .from("stock")
      .upsert({ product_id: productId, branch_id: branch.id, quantity });
    if (error) toast.error(error.message);
    else {
      toast.success("تم تحديث الكمية");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  }

  return (
    <div>
      <PageHeader
        title="المخزون"
        subtitle="المنتجات والكميات في الفروع"
      />


      <div className="surface p-4">
        <div className="relative mb-4">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الباركود..."
            className="pr-9"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-3 font-medium">المنتج</th>
                <th className="p-3 font-medium">الصنف</th>
                <th className="p-3 font-medium">الشراء</th>
                <th className="p-3 font-medium">البيع</th>
                <th className="p-3 font-medium">الكميات</th>
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
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0">
                  <td className="p-3">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {p.barcode ?? "—"}
                    </p>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {(p.categories as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="p-3">{formatSDG(Number(p.cost_price))}</td>
                  <td className="p-3 font-semibold text-gold">{formatSDG(Number(p.sale_price))}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {((p.stock as { quantity: number; branches: { name: string } | null }[]) ?? []).map((s, i) => (
                        <span
                          key={i}
                          className={`rounded-full px-2.5 py-1 text-xs ${
                            s.quantity <= 5 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.branches?.name}: {s.quantity}
                          {me?.isAdmin && (
                            <button
                              className="mr-2 underline"
                              onClick={() => {
                                const v = window.prompt("الكمية الجديدة", String(s.quantity));
                                if (v !== null && s.branches) updateStock(p.id, s.branches.name, Number(v));
                              }}
                            >
                              تعديل
                            </button>
                          )}
                        </span>
                      ))}
                      {((p.stock as unknown[]) ?? []).length === 0 && (
                        <span className="text-xs text-muted-foreground">لا يوجد مخزون</span>
                      )}
                    </div>
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

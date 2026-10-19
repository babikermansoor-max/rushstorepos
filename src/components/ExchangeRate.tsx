import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDateTime, formatSDG } from "@/lib/format";

export function useAedRate() {
  return useQuery({
    queryKey: ["aed-rate"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("aed_rate, updated_at").eq("id", true).maybeSingle();
      return { rate: Number(data?.aed_rate ?? 0), updatedAt: data?.updated_at ?? null };
    },
  });
}

export function aedToSdg(aed: number, rate: number) {
  return Math.round(Number(aed || 0) * Number(rate || 0) * 100) / 100;
}

export function ExchangeRateDialog() {
  const queryClient = useQueryClient();
  const { data } = useAedRate();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const current = data?.rate ?? 0;
  const typed = Number(value);
  const nextRate = value.trim() !== "" && Number.isFinite(typed) && typed > 0 ? typed : current;

  async function save(reprice: boolean) {
    if (!(nextRate > 0)) {
      toast.error("أدخل سعر صرف صحيح");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ id: true, aed_rate: nextRate }, { onConflict: "id" });
      if (error) throw error;

      if (reprice) {
        const { data: rows, error: readErr } = await supabase
          .from("products")
          .select("id, cost_price_aed, sale_price_aed")
          .or("cost_price_aed.gt.0,sale_price_aed.gt.0");
        if (readErr) throw readErr;
        const list = rows ?? [];
        for (let i = 0; i < list.length; i += 100) {
          const chunk = list.slice(i, i + 100);
          const results = await Promise.all(
            chunk.map((p) => {
              const costAed = Number(p.cost_price_aed || 0);
              const saleAed = Number(p.sale_price_aed || 0);
              const patch: { cost_price?: number; sale_price?: number } = {};
              if (costAed > 0) patch.cost_price = aedToSdg(costAed, nextRate);
              if (saleAed > 0) patch.sale_price = aedToSdg(saleAed, nextRate);
              return supabase.from("products").update(patch).eq("id", p.id);
            }),
          );
          const failed = results.find((r) => r.error);
          if (failed?.error) throw failed.error;
        }
        const { data: phs, error: phErr } = await supabase
          .from("phones")
          .select("id, cost_price_aed, sale_price_aed")
          .eq("status", "available")
          .or("cost_price_aed.gt.0,sale_price_aed.gt.0");
        if (phErr) throw phErr;
        const phList = phs ?? [];
        for (let i = 0; i < phList.length; i += 100) {
          const results = await Promise.all(
            phList.slice(i, i + 100).map((p) => {
              const patch: { cost_price?: number; sale_price?: number } = {};
              if (Number(p.cost_price_aed) > 0) patch.cost_price = aedToSdg(Number(p.cost_price_aed), nextRate);
              if (Number(p.sale_price_aed) > 0) patch.sale_price = aedToSdg(Number(p.sale_price_aed), nextRate);
              return supabase.from("phones").update(patch).eq("id", p.id);
            }),
          );
          const failed = results.find((r) => r.error);
          if (failed?.error) throw failed.error;
        }
        toast.success(`تم تحديث سعر الصرف وإعادة تسعير ${list.length} منتج و${phList.length} هاتف`);
      } else {
        toast.success("تم حفظ سعر الصرف");
      }
      setValue("");
      setOpen(false);
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Coins className="size-4" />
          سعر الصرف {current > 0 ? `(${current})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>سعر صرف الدرهم</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/60 p-3 text-sm">
            <p>
              السعر الحالي: <span className="font-bold text-gold">{current > 0 ? `${current} ج.س / درهم` : "غير محدد"}</span>
            </p>
            {data?.updatedAt && (
              <p className="mt-1 text-xs text-muted-foreground">آخر تحديث: {formatDateTime(data.updatedAt)}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>سعر الدرهم بالجنيه</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={current ? String(current) : "مثال: 750"}
            />
            <p className="text-xs text-muted-foreground">
              1 درهم = {formatSDG(nextRate)} — تُحسب تكلفة كل منتج = التكلفة بالدرهم × سعر الصرف
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => save(true)} disabled={busy} className="w-full">
              {busy ? "جارٍ..." : "حفظ وإعادة التسعير"}
            </Button>
            <Button variant="outline" onClick={() => save(false)} disabled={busy} className="w-full">
              حفظ فقط
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            «إعادة التسعير» تحدّث سعر الشراء وسعر البيع بالجنيه لكل المنتجات (زيادة أو نقصاناً) على أساس قيمتها بالدرهم.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

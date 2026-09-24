import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSession } from "@/hooks/useSession";
import { PageHeader, RequireAdmin } from "@/components/AppLayout";
import { formatDateTime, formatSDG, REPAIR_STATUS_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/repairs")({
  head: () => ({
    meta: [
      { title: "الإصلاحات — Rush Store" },
      { name: "description", content: "استلام أجهزة الصيانة ومتابعة حالتها حتى التسليم للعميل." },
      { property: "og:title", content: "الإصلاحات — Rush Store" },
      { property: "og:description", content: "متابعة أجهزة الصيانة من الاستلام حتى التسليم." },
    ],
  }),
  component: Repairs,
});

const STATUSES = ["received", "in_progress", "done", "delivered", "cancelled"] as const;

function Repairs() {
  const { user } = useSession();
  const { data: me } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [form, setForm] = useState({ customer_name: "", phone: "", device: "", issue: "", cost: "" });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["repairs"],
    queryFn: async () =>
      (
        await supabase
          .from("repairs")
          .select("id, customer_name, phone, device, issue, status, cost, created_at")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const list = (rows ?? []).filter((r) => filter === "all" || r.status === filter);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("repairs").insert({
      customer_name: form.customer_name,
      phone: form.phone || null,
      device: form.device,
      issue: form.issue || null,
      cost: Number(form.cost || 0),
      branch_id: me?.profile?.branch_id ?? null,
      created_by: user.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم استلام الجهاز");
    setOpen(false);
    setForm({ customer_name: "", phone: "", device: "", issue: "", cost: "" });
    queryClient.invalidateQueries({ queryKey: ["repairs"] });
  }

  async function changeStatus(id: string, status: string) {
    const { error } = await supabase
      .from("repairs")
      .update({ status: status as (typeof STATUSES)[number], updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else queryClient.invalidateQueries({ queryKey: ["repairs"] });
  }

  return (
    <div>
      <PageHeader
        title="الإصلاحات"
        subtitle="أجهزة الصيانة وحالتها"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> استلام جهاز
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>استلام جهاز للصيانة</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>اسم العميل</Label>
                    <Input
                      value={form.customer_name}
                      onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>الهاتف</Label>
                    <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>الجهاز</Label>
                  <Input value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label>العطل</Label>
                  <Textarea value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>التكلفة المتوقعة</Label>
                  <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                </div>
                <Button type="submit" className="w-full">
                  حفظ
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {["all", ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              filter === s ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {s === "all" ? "الكل" : REPAIR_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>}
        {!isLoading && list.length === 0 && (
          <p className="surface p-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
            لا توجد أجهزة
          </p>
        )}
        {list.map((r) => (
          <div key={r.id} className="surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold">{r.device}</p>
                <p className="text-sm text-muted-foreground">{r.customer_name}</p>
                {r.phone && (
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {r.phone}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                {REPAIR_STATUS_LABELS[r.status]}
              </span>
            </div>
            {r.issue && <p className="mt-3 text-sm text-muted-foreground">{r.issue}</p>}
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="font-bold text-gold">{formatSDG(Number(r.cost))}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
            </div>
            <select
              className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={r.status}
              onChange={(e) => changeStatus(r.id, e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {REPAIR_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

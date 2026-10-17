import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSession } from "@/hooks/useSession";
import { PageHeader } from "@/components/AppLayout";
import { formatSDG, PAYMENT_LABELS, PAYMENT_METHODS, type PaymentMethod } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "المنصرفات — Rush Store" },
      { name: "description", content: "تسجيل ومتابعة منصرفات المحل اليومية حسب البند والفرع وطريقة الدفع." },
      { property: "og:title", content: "المنصرفات — Rush Store" },
      { property: "og:description", content: "قائمة منصرفات المحل مع الإجماليات حسب البند والفترة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Expenses,
});

const CATEGORIES = ["عام", "إيجار", "كهرباء", "مرتبات", "مواصلات", "صيانة", "تسويق", "أخرى"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function Expenses() {
  const { user } = useSession();
  const { data: me } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const branchId = me?.profile?.branch_id ?? null;
  const isAdmin = !!me?.isAdmin;

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(today());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("عام");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [spentAt, setSpentAt] = useState(today());

  const { data: rows } = useQuery({
    queryKey: ["expenses", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, title, category, amount, payment_method, notes, spent_at, created_by")
        .gte("spent_at", from)
        .lte("spent_at", to)
        .order("spent_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = useMemo(() => (rows ?? []).reduce((s, r) => s + Number(r.amount), 0), [rows]);
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) map.set(r.category, (map.get(r.category) ?? 0) + Number(r.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  async function addExpense() {
    const value = Number(amount);
    if (!title.trim()) {
      toast.error("أدخل وصف المنصرف");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("أدخل مبلغاً صحيحاً");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("expenses").insert({
        title: title.trim(),
        category,
        amount: value,
        payment_method: method,
        notes: notes.trim() || null,
        spent_at: spentAt,
        branch_id: branchId,
        created_by: user!.id,
      });
      if (error) throw error;
      toast.success("تم تسجيل المنصرف");
      setTitle("");
      setAmount("");
      setNotes("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر حفظ المنصرف");
    } finally {
      setBusy(false);
    }
  }

  async function removeExpense(id: string) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      toast.error("تعذّر الحذف");
      return;
    }
    toast.success("تم حذف المنصرف");
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
  }

  return (
    <div>
      <PageHeader
        title="المنصرفات"
        subtitle="تسجيل ومتابعة مصروفات المحل"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              منصرف جديد
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تسجيل منصرف</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="وصف المنصرف" />
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      category === c ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="المبلغ"
              />
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      method === m ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card"
                    }`}
                  >
                    {PAYMENT_LABELS[m]}
                  </button>
                ))}
              </div>
              <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات (اختياري)" />
              <Button onClick={addExpense} disabled={busy} className="w-full">
                {busy ? "جارٍ الحفظ..." : "حفظ المنصرف"}
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        }
      />

      <div className="surface mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">من</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">إلى</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
        <div className="mr-auto flex items-center gap-2 rounded-xl bg-muted px-4 py-3">
          <Wallet className="size-4 text-gold" />
          <span className="text-sm text-muted-foreground">إجمالي المنصرفات</span>
          <span className="text-xl font-extrabold">{formatSDG(total)}</span>
        </div>
      </div>

      {byCategory.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {byCategory.map(([c, v]) => (
            <div key={c} className="surface p-4">
              <p className="text-sm text-muted-foreground">{c}</p>
              <p className="mt-1 text-lg font-bold">{formatSDG(v)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-right text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">التاريخ</th>
              <th className="p-3 font-medium">الوصف</th>
              <th className="p-3 font-medium">البند</th>
              <th className="p-3 font-medium">الدفع</th>
              <th className="p-3 font-medium">المبلغ</th>
              {isAdmin && <th className="p-3 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-b border-border/60">
                <td className="p-3" dir="ltr">
                  {r.spent_at}
                </td>
                <td className="p-3 font-medium">
                  {r.title}
                  {r.notes && <span className="block text-xs text-muted-foreground">{r.notes}</span>}
                </td>
                <td className="p-3 text-muted-foreground">{r.category}</td>
                <td className="p-3 text-muted-foreground">{PAYMENT_LABELS[r.payment_method] ?? r.payment_method}</td>
                <td className="p-3 font-bold">{formatSDG(Number(r.amount))}</td>
                {isAdmin && (
                  <td className="p-3">
                    <button onClick={() => removeExpense(r.id)} aria-label="حذف">
                      <Trash2 className="size-4 text-destructive" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {(rows ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد منصرفات في هذه الفترة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

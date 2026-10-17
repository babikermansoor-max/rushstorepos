import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Smartphone, Repeat } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSession } from "@/hooks/useSession";
import { PageHeader } from "@/components/AppLayout";
import { ReceiptDialog, type ReceiptData } from "@/components/Receipt";
import { PAYMENT_LABELS, PAYMENT_METHODS, type PaymentMethod, formatDateTime, formatSDG } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/phones")({
  head: () => ({
    meta: [
      { title: "الهواتف — Rush Store" },
      { name: "description", content: "بيع الهواتف الجديدة والمستعملة برقم IMEI مع الاستبدال ودفع الفرق." },
      { property: "og:title", content: "الهواتف — Rush Store" },
      { property: "og:description", content: "مخزون وبيع واستبدال الهواتف الجديدة والمستعملة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Phones,
});

type Phone = {
  id: string;
  branch_id: string;
  imei: string;
  brand: string;
  model: string;
  storage: string | null;
  color: string | null;
  condition: "new" | "used";
  grade: string | null;
  battery_health: number | null;
  seller_name: string | null;
  seller_phone: string | null;
  notes: string | null;
  cost_price: number;
  sale_price: number;
  status: "available" | "sold";
  branches?: { name: string } | null;
};

const GRADES = ["ممتاز", "جيد جداً", "جيد", "مقبول"];
const sel = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function phoneTitle(p: Pick<Phone, "brand" | "model" | "storage" | "color">) {
  return [p.brand, p.model, p.storage, p.color].filter(Boolean).join(" ");
}

function Phones() {
  const { user } = useSession();
  const { data: me } = useProfile(user?.id);
  const [tab, setTab] = useState<"stock" | "sell" | "invoices">("stock");

  const { data: phones = [] } = useQuery({
    queryKey: ["phones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("phones")
        .select("*, branches(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Phone[];
    },
  });

  return (
    <div>
      <PageHeader title="الهواتف" subtitle="بيع الهواتف الجديدة والمستعملة مع الاستبدال" />
      <div className="mb-4 flex gap-2">
        {(
          [
            ["stock", "مخزون الهواتف"],
            ["sell", "بيع هاتف"],
            ["invoices", "فواتير الهواتف"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
              tab === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "stock" && <StockTab phones={phones} isAdmin={!!me?.isAdmin} isOwner={!!me?.isOwner} branchId={me?.profile?.branch_id ?? null} />}
      {tab === "sell" && <SellTab phones={phones.filter((p) => p.status === "available")} me={me} />}
      {tab === "invoices" && <InvoicesTab isAdmin={!!me?.isAdmin} />}
    </div>
  );
}

/* ---------------- مخزون الهواتف ---------------- */

const emptyForm = {
  imei: "", brand: "", model: "", storage: "", color: "", condition: "new" as "new" | "used",
  grade: "", battery_health: "", seller_name: "", seller_phone: "", notes: "", cost_price: "", sale_price: "",
};

function StockTab({ phones, isAdmin, isOwner, branchId }: { phones: Phone[]; isAdmin: boolean; isOwner: boolean; branchId: string | null }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cond, setCond] = useState<"all" | "new" | "used">("all");
  const [status, setStatus] = useState<"all" | "available" | "sold">("available");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const list = phones.filter((p) => {
    if (cond !== "all" && p.condition !== cond) return false;
    if (status !== "all" && p.status !== status) return false;
    const s = q.trim().toLowerCase();
    return !s || p.imei.includes(s) || phoneTitle(p).toLowerCase().includes(s);
  });

  function openNew() { setEditId(null); setF(emptyForm); setOpen(true); }
  function openEdit(p: Phone) {
    setEditId(p.id);
    setF({
      imei: p.imei, brand: p.brand, model: p.model, storage: p.storage ?? "", color: p.color ?? "",
      condition: p.condition, grade: p.grade ?? "", battery_health: p.battery_health?.toString() ?? "",
      seller_name: p.seller_name ?? "", seller_phone: p.seller_phone ?? "", notes: p.notes ?? "",
      cost_price: String(p.cost_price), sale_price: String(p.sale_price),
    });
    setOpen(true);
  }

  async function save(): Promise<void> {
    if (!f.imei.trim() || !f.model.trim()) return void toast.error("أدخل IMEI والموديل");
    const bh = f.battery_health ? Number(f.battery_health) : null;
    if (bh != null && (bh < 0 || bh > 100)) return void toast.error("نسبة البطارية بين 0 و100");
    const used = f.condition === "used";
    const row = {
      imei: f.imei.trim(), brand: f.brand.trim(), model: f.model.trim(),
      storage: f.storage.trim() || null, color: f.color.trim() || null, condition: f.condition,
      grade: used ? f.grade || null : null, battery_health: used ? bh : null,
      seller_name: used ? f.seller_name.trim() || null : null, seller_phone: used ? f.seller_phone.trim() || null : null,
      notes: f.notes.trim() || null, cost_price: Number(f.cost_price) || 0, sale_price: Number(f.sale_price) || 0,
    };
    setBusy(true);
    const { error } = editId
      ? await supabase.from("phones").update(row).eq("id", editId)
      : await supabase.from("phones").insert({ ...row, branch_id: branchId!, created_by: (await supabase.auth.getUser()).data.user?.id ?? null });
    setBusy(false);
    if (error) return void toast.error(error.code === "23505" ? "رقم IMEI مسجل مسبقاً في هذا الفرع" : error.message);
    toast.success("تم الحفظ");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["phones"] });
  }

  async function remove(p: Phone): Promise<void> {
    if (!confirm(`حذف ${phoneTitle(p)}؟`)) return;
    const { error } = await supabase.from("phones").delete().eq("id", p.id);
    if (error) return void toast.error("لا يمكن حذف جهاز مرتبط بفاتورة");
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["phones"] });
  }

  const avail = phones.filter((p) => p.status === "available");
  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="surface p-4"><p className="text-xs text-muted-foreground">أجهزة متاحة</p><p className="text-xl font-bold">{avail.length}</p></div>
        <div className="surface p-4"><p className="text-xs text-muted-foreground">جديد / مستعمل</p><p className="text-xl font-bold">{avail.filter((p) => p.condition === "new").length} / {avail.filter((p) => p.condition === "used").length}</p></div>
        {isAdmin && <div className="surface p-4"><p className="text-xs text-muted-foreground">قيمة المخزون (شراء)</p><p className="text-xl font-bold text-gold">{formatSDG(avail.reduce((s, p) => s + Number(p.cost_price), 0))}</p></div>}
      </div>

      <div className="surface mb-4 flex flex-wrap items-center gap-2 p-3">
        <Input placeholder="بحث بالـ IMEI أو الموديل" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select className={`${sel} w-auto`} value={cond} onChange={(e) => setCond(e.target.value as typeof cond)}>
          <option value="all">الكل</option><option value="new">جديد</option><option value="used">مستعمل</option>
        </select>
        <select className={`${sel} w-auto`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="available">متاح</option><option value="sold">مباع</option><option value="all">الكل</option>
        </select>
        {isAdmin && <Button onClick={openNew} className="ms-auto"><Plus className="size-4" /> إضافة جهاز</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => (
          <div key={p.id} className="surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Smartphone className="size-5 text-primary" />
                <p className="font-bold">{phoneTitle(p)}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.condition === "new" ? "bg-primary/15 text-primary" : "bg-secondary text-foreground"}`}>
                {p.condition === "new" ? "جديد" : "مستعمل"}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">IMEI: {p.imei}</p>
            {p.condition === "used" && (
              <p className="mt-1 text-xs text-muted-foreground">
                {p.grade && `الحالة: ${p.grade}`}{p.battery_health != null && ` · البطارية ${p.battery_health}%`}
                {p.seller_name && ` · البائع: ${p.seller_name}`}{p.seller_phone && ` (${p.seller_phone})`}
              </p>
            )}
            {p.notes && <p className="mt-1 text-xs text-muted-foreground">ملاحظات: {p.notes}</p>}
            {isOwner && p.branches?.name && <p className="mt-1 text-xs text-muted-foreground">الفرع: {p.branches.name}</p>}
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-gold">{formatSDG(p.sale_price)}</p>
                {isAdmin && <p className="text-xs text-muted-foreground">شراء: {formatSDG(p.cost_price)}</p>}
              </div>
              <div className="flex items-center gap-1">
                {p.status === "sold" && <span className="text-xs font-semibold text-destructive">مباع</span>}
                {isAdmin && <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>}
                {isOwner && <Button size="icon" variant="ghost" onClick={() => remove(p)}><Trash2 className="size-4" /></Button>}
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">لا توجد أجهزة</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "تعديل جهاز" : "إضافة جهاز"}</DialogTitle></DialogHeader>
          <PhoneFields f={f} setF={setF} withSeller withPrices />
          <Button onClick={save} disabled={busy}>حفظ</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PhoneFields({
  f, setF, withSeller, withPrices, fixedUsed,
}: {
  f: typeof emptyForm;
  setF: (v: typeof emptyForm) => void;
  withSeller?: boolean;
  withPrices?: boolean;
  fixedUsed?: boolean;
}) {
  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const used = fixedUsed || f.condition === "used";
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 space-y-1"><Label>IMEI *</Label><Input value={f.imei} onChange={set("imei")} inputMode="numeric" /></div>
      <div className="space-y-1"><Label>الماركة</Label><Input value={f.brand} onChange={set("brand")} placeholder="Apple" /></div>
      <div className="space-y-1"><Label>الموديل *</Label><Input value={f.model} onChange={set("model")} placeholder="iPhone 13" /></div>
      <div className="space-y-1"><Label>السعة</Label><Input value={f.storage} onChange={set("storage")} placeholder="128GB" /></div>
      <div className="space-y-1"><Label>اللون</Label><Input value={f.color} onChange={set("color")} /></div>
      {!fixedUsed && (
        <div className="col-span-2 space-y-1"><Label>النوع</Label>
          <select className={sel} value={f.condition} onChange={set("condition")}><option value="new">جديد</option><option value="used">مستعمل</option></select>
        </div>
      )}
      {used && (
        <>
          <div className="space-y-1"><Label>الحالة</Label>
            <select className={sel} value={f.grade} onChange={set("grade")}><option value="">—</option>{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
          </div>
          <div className="space-y-1"><Label>نسبة البطارية %</Label><Input type="number" min={0} max={100} value={f.battery_health} onChange={set("battery_health")} /></div>
          {withSeller && (
            <>
              <div className="space-y-1"><Label>اسم البائع</Label><Input value={f.seller_name} onChange={set("seller_name")} /></div>
              <div className="space-y-1"><Label>هاتف البائع</Label><Input value={f.seller_phone} onChange={set("seller_phone")} /></div>
            </>
          )}
        </>
      )}
      <div className="col-span-2 space-y-1"><Label>ملاحظات وعيوب</Label><Input value={f.notes} onChange={set("notes")} /></div>
      {withPrices && (
        <>
          <div className="space-y-1"><Label>سعر الشراء</Label><Input type="number" value={f.cost_price} onChange={set("cost_price")} /></div>
          <div className="space-y-1"><Label>سعر البيع</Label><Input type="number" value={f.sale_price} onChange={set("sale_price")} /></div>
        </>
      )}
    </div>
  );
}

/* ---------------- بيع هاتف ---------------- */

type Me = ReturnType<typeof useProfile>["data"];

function SellTab({ phones, me }: { phones: Phone[]; me: Me }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [phone, setPhone] = useState<Phone | null>(null);
  const [price, setPrice] = useState("");
  const [customer, setCustomer] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tradeIn, setTradeIn] = useState(false);
  const [t, setT] = useState({ ...emptyForm, condition: "used" as const });
  const [tValue, setTValue] = useState("");
  const [tResale, setTResale] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return phones.slice(0, 12);
    return phones.filter((p) => p.imei.includes(s) || phoneTitle(p).toLowerCase().includes(s)).slice(0, 12);
  }, [q, phones]);

  const salePrice = Number(price) || 0;
  const tradeVal = tradeIn ? Number(tValue) || 0 : 0;
  const diff = salePrice - tradeVal;

  function pick(p: Phone) { setPhone(p); setPrice(String(p.sale_price)); setQ(""); }

  async function submit(): Promise<void> {
    if (!phone) return void toast.error("اختر الجهاز");
    if (salePrice <= 0) return void toast.error("أدخل سعر البيع");
    if (tradeIn) {
      if (!t.imei.trim() || !t.model.trim()) return void toast.error("أدخل IMEI وموديل جهاز الزبون");
      if (tradeVal <= 0) return void toast.error("أدخل قيمة تقييم جهاز الزبون");
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_phone_sale", {
      p_phone_id: phone.id,
      p_price: salePrice,
      p_customer: customer.trim(),
      p_customer_phone: custPhone.trim(),
      p_method: method,
      p_trade_in: tradeIn
        ? { ...t, value: tradeVal, sale_price: Number(tResale) || tradeVal }
        : (null as unknown as Record<string, never>),
    });
    setBusy(false);
    if (error) return void toast.error(error.message);
    const r = data?.[0];
    const items = [{ name: `${phoneTitle(phone)} (${phone.condition === "new" ? "جديد" : "مستعمل"}) — IMEI ${phone.imei}`, qty: 1, price: salePrice }];
    setReceipt({
      invoiceNo: `P-${r?.invoice_no}`,
      createdAt: r?.created_at ?? new Date().toISOString(),
      branch: (me?.profile as { branches?: { name: string } } | undefined)?.branches?.name ?? null,
      cashier: me?.profile?.full_name ?? null,
      customer: [customer, custPhone].filter(Boolean).join(" — ") || null,
      paymentMethod: method,
      items,
      ...(tradeIn ? { adjustments: [{ label: `استبدال: ${phoneTitle(t)} — IMEI ${t.imei}`, amount: -tradeVal }] } : {}),
      total: diff,
    });
    toast.success("تم البيع");
    setPhone(null); setPrice(""); setCustomer(""); setCustPhone(""); setTradeIn(false);
    setT({ ...emptyForm, condition: "used" }); setTValue(""); setTResale("");
    qc.invalidateQueries({ queryKey: ["phones"] });
    qc.invalidateQueries({ queryKey: ["phone-sales"] });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="surface p-4">
        <h2 className="mb-2 font-bold">1. اختيار الجهاز</h2>
        <Input autoFocus placeholder="امسح أو اكتب IMEI / الموديل" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) pick(matches[0]); }} />
        <div className="mt-3 max-h-80 space-y-2 overflow-auto">
          {matches.map((p) => (
            <button key={p.id} onClick={() => pick(p)}
              className={`w-full rounded-lg border p-3 text-right ${phone?.id === p.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>
              <div className="flex justify-between"><span className="font-semibold">{phoneTitle(p)}</span><span className="text-gold">{formatSDG(p.sale_price)}</span></div>
              <p className="text-xs text-muted-foreground">{p.condition === "new" ? "جديد" : `مستعمل${p.grade ? ` · ${p.grade}` : ""}${p.battery_health != null ? ` · ${p.battery_health}%` : ""}`} · IMEI {p.imei}</p>
            </button>
          ))}
          {matches.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد جهاز متاح</p>}
        </div>
      </div>

      <div className="surface space-y-3 p-4">
        <h2 className="font-bold">2. تفاصيل البيع</h2>
        {phone ? <p className="rounded-lg bg-secondary p-2 text-sm">{phoneTitle(phone)} — IMEI {phone.imei}</p> : <p className="text-sm text-muted-foreground">لم يتم اختيار جهاز</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>سعر البيع</Label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div className="space-y-1"><Label>طريقة الدفع</Label>
            <select className={sel} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>اسم الزبون</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
          <div className="space-y-1"><Label>هاتف الزبون</Label><Input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} /></div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm font-semibold">
          <input type="checkbox" checked={tradeIn} onChange={(e) => setTradeIn(e.target.checked)} />
          <Repeat className="size-4 text-primary" /> استبدال — الزبون يسلّم جهازه ويدفع الفرق
        </label>

        {tradeIn && (
          <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
            <p className="text-sm font-semibold">بيانات جهاز الزبون</p>
            <PhoneFields f={t} setF={(v) => setT({ ...v, condition: "used" })} fixedUsed />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>قيمة التقييم *</Label><Input type="number" value={tValue} onChange={(e) => setTValue(e.target.value)} /></div>
              {me?.isAdmin && <div className="space-y-1"><Label>سعر إعادة البيع</Label><Input type="number" value={tResale} onChange={(e) => setTResale(e.target.value)} placeholder="اختياري" /></div>}
            </div>
          </div>
        )}

        <div className="space-y-1 rounded-lg bg-secondary p-3 text-sm">
          <div className="flex justify-between"><span>سعر الجهاز</span><span>{formatSDG(salePrice)}</span></div>
          {tradeIn && <div className="flex justify-between"><span>قيمة جهاز الزبون</span><span>− {formatSDG(tradeVal)}</span></div>}
          {diff >= 0
            ? <div className="flex justify-between text-base font-extrabold"><span>المطلوب من الزبون</span><span className="text-gold">{formatSDG(diff)}</span></div>
            : <div className="flex justify-between text-base font-extrabold"><span>المستحق للزبون (يُدفع له)</span><span className="text-gold">{formatSDG(-diff)}</span></div>}
        </div>
        <Button className="w-full" onClick={submit} disabled={busy || !phone}>إتمام البيع وطباعة الفاتورة</Button>
      </div>

      <ReceiptDialog data={receipt} open={!!receipt} onOpenChange={(v) => !v && setReceipt(null)} />
    </div>
  );
}

/* ---------------- فواتير الهواتف ---------------- */

function InvoicesTab({ isAdmin }: { isAdmin: boolean }) {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const { data: rows = [] } = useQuery({
    queryKey: ["phone-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("phone_sales")
        .select("*, branches(name), phone:phones!phone_sales_phone_id_fkey(imei, brand, model, storage, color, condition), trade:phones!phone_sales_trade_in_phone_id_fkey(imei, brand, model, storage, color)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  function toReceipt(r: (typeof rows)[number]): ReceiptData {
    const p = r.phone as Phone | null;
    const tr = r.trade as Phone | null;
    return {
      invoiceNo: `P-${r.invoice_no}`,
      createdAt: r.created_at,
      branch: (r.branches as { name: string } | null)?.name ?? null,
      customer: [r.customer_name, r.customer_phone].filter(Boolean).join(" — ") || null,
      paymentMethod: r.payment_method,
      items: [{ name: p ? `${phoneTitle(p)} — IMEI ${p.imei}` : "هاتف", qty: 1, price: Number(r.sale_price) }],
      ...(tr ? { adjustments: [{ label: `استبدال: ${phoneTitle(tr)} — IMEI ${tr.imei}`, amount: -Number(r.trade_in_value) }] } : {}),
      total: Number(r.amount_paid),
    };
  }

  return (
    <div className="surface overflow-auto p-4">
      <table className="w-full text-right text-sm">
        <thead className="text-muted-foreground">
          <tr><th className="py-2">#</th><th>التاريخ</th><th>الجهاز</th><th>الزبون</th><th>السعر</th><th>استبدال</th><th>المدفوع</th>{isAdmin && <th>الربح</th>}</tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = r.phone as Phone | null;
            return (
              <tr key={r.id} onClick={() => setReceipt(toReceipt(r))} className="cursor-pointer border-t border-border hover:bg-muted">
                <td className="py-2 font-bold">P-{r.invoice_no}</td>
                <td className="text-xs">{formatDateTime(r.created_at)}</td>
                <td>{p ? phoneTitle(p) : "—"}</td>
                <td>{r.customer_name ?? "—"}</td>
                <td>{formatSDG(r.sale_price)}</td>
                <td>{Number(r.trade_in_value) ? formatSDG(r.trade_in_value) : "—"}</td>
                <td className="font-semibold">{formatSDG(r.amount_paid)}</td>
                {isAdmin && <td className="text-gold">{formatSDG(Number(r.sale_price) - Number(r.unit_cost))}</td>}
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">لا توجد فواتير</td></tr>}
        </tbody>
      </table>
      <ReceiptDialog data={receipt} open={!!receipt} onOpenChange={(v) => !v && setReceipt(null)} autoPrint={false} />
    </div>
  );
}

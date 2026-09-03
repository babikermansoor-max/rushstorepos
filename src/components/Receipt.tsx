import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatSDG, PAYMENT_LABELS } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import rushLogo from "@/assets/rush-logo.jpg.asset.json";
import rushLogoPrint from "@/assets/rush-logo-print.png.asset.json";

export type ReceiptData = {
  invoiceNo: number | string;
  createdAt: string;
  branch?: string | null;
  cashier?: string | null;
  customer?: string | null;
  paymentMethod: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  paid?: number | null;
};

function applyThermalPage() {
  document.documentElement.setAttribute("data-paper", "80");
  let el = document.getElementById("receipt-page-style") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "receipt-page-style";
    document.head.appendChild(el);
  }
  // طابعة حرارية 80mm (المساحة القابلة للطباعة 72mm) وأقصى طول 3276mm
  el.textContent = `@media print { @page { size: 80mm 3276mm; margin: 0; } }`;
}


function ReceiptBody({ data, printMode }: { data: ReceiptData; printMode?: boolean }) {
  const change = data.paid != null ? data.paid - data.total : null;
  return (
    <div
      dir="rtl"
      id={printMode ? "receipt-print" : undefined}
      className={
        printMode
          ? "text-sm"
          : "rounded-lg border border-border bg-card p-4 text-sm"
      }
    >
      <div className="text-center">
        <p className="text-lg font-extrabold">Rush Store</p>
        <p className="text-xs text-muted-foreground">{data.branch ?? "الفرع الرئيسي"}</p>
      </div>

      <div className="mt-3 space-y-1 border-y border-dashed border-border py-2 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>رقم الفاتورة</span>
          <span className="font-bold text-foreground">#{data.invoiceNo}</span>
        </div>
        <div className="flex justify-between">
          <span>التاريخ</span>
          <span>{formatDateTime(data.createdAt)}</span>
        </div>
        {data.cashier && (
          <div className="flex justify-between">
            <span>الكاشير</span>
            <span>{data.cashier}</span>
          </div>
        )}
        {data.customer && (
          <div className="flex justify-between">
            <span>العميل</span>
            <span>{data.customer}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>طريقة الدفع</span>
          <span>{PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod}</span>
        </div>
      </div>

      <table className="mt-2 w-full text-right text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1 font-medium">الصنف</th>
            <th className="py-1 font-medium">كمية</th>
            <th className="py-1 font-medium">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it, i) => (
            <tr key={i} className="border-t border-border/60">
              <td className="py-1.5">{it.name}</td>
              <td className="py-1.5">{it.qty}</td>
              <td className="py-1.5">{formatSDG(it.qty * it.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 border-t border-dashed border-border pt-2">
        <div className="flex justify-between text-base font-extrabold">
          <span>الإجمالي</span>
          <span className="text-gold">{formatSDG(data.total)}</span>
        </div>
        {change != null && (
          <>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>المدفوع</span>
              <span>{formatSDG(data.paid ?? 0)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>الباقي</span>
              <span>{formatSDG(Math.max(change, 0))}</span>
            </div>
          </>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">شكراً لتسوقكم معنا</p>

      <div className="mt-2 flex justify-center">
        <img
          src={printMode ? rushLogoPrint.url : rushLogo.url}
          alt="Rush Store"
          className={printMode ? "receipt-logo-print h-14 w-auto object-contain" : "h-14 w-auto rounded-md object-contain"}
        />
      </div>
    </div>
  );
}

export function ReceiptDialog({
  data,
  open,
  onOpenChange,
  autoPrint = true,
}: {
  data: ReceiptData | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  autoPrint?: boolean;
}) {
  const [printLogoReady, setPrintLogoReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    applyThermalPage();
  }, []);


  // Preload the print logo so the thermal-receipt image is cached before printing.
  useEffect(() => {
    const img = new Image();
    img.src = rushLogoPrint.url;
    img.onload = () => setPrintLogoReady(true);
    img.onerror = () => setPrintLogoReady(true);
  }, []);

  useEffect(() => {
    if (!open || !data || !autoPrint) return;
    const t = window.setTimeout(() => window.print(), printLogoReady ? 350 : 1400);
    return () => window.clearTimeout(t);
  }, [open, data, autoPrint, printLogoReady]);

  if (!data) return null;

  return (
    <>
      {mounted &&
        open &&
        createPortal(
          <div id="receipt-print-root">
            <ReceiptBody data={data} printMode />
          </div>,
          document.body,
        )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="size-4 text-gold" /> تمت العملية بنجاح
            </DialogTitle>
          </DialogHeader>

          <ReceiptBody data={data} />

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>مقاس الورق:</span>
            {(["58", "72", "80", "auto"] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setPaper(w)}
                className={`rounded-md border px-2 py-1 ${
                  paper === w ? "border-gold text-gold" : "border-border"
                }`}
              >
                {w === "auto" ? "حسب الطابعة" : `${w} مم`}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => window.print()} className="flex-1">
              <Printer className="size-4" /> طباعة
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              إغلاق
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

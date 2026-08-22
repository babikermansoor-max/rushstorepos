export function formatSDG(value: number): string {
  const n = Number(value || 0);
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ج.س`;
}

export function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString("en-US");
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${d.toLocaleDateString("ar-EG")} — ${d.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "نقدي",
  bankak: "بنكك",
};

export const ROLE_LABELS: Record<string, string> = {
  owner: "المالك",
  manager: "مدير",
  cashier: "موظف مبيعات",
};

export const REPAIR_STATUS_LABELS: Record<string, string> = {
  received: "تم الاستلام",
  in_progress: "قيد الإصلاح",
  done: "جاهز للتسليم",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

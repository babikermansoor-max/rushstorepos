import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Store, ShoppingCart, Package, Wrench, BarChart3 } from "lucide-react";
import { useProfile, useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rush Store — نظام إدارة محلات الهواتف" },
      {
        name: "description",
        content:
          "نظام متكامل لإدارة المحل: نقطة بيع سريعة، متابعة المخزون، مرتجعات، صيانة الأجهزة، تقارير وصلاحيات الموظفين.",
      },
      { property: "og:title", content: "Rush Store — نظام إدارة محلات الهواتف" },
      {
        property: "og:description",
        content: "نقطة بيع، مخزون، مرتجعات، صيانة وتقارير في نظام واحد بالعربية.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: ShoppingCart, title: "نقطة البيع", text: "فاتورة في ثوانٍ مع بحث بالباركود ودفع نقدي أو بنكك." },
  { icon: Package, title: "المخزون", text: "كميات كل منتج في كل فرع مع تنبيه النواقص." },
  { icon: Wrench, title: "الإصلاحات", text: "استلام الأجهزة ومتابعة حالتها حتى التسليم." },
  { icon: BarChart3, title: "التقارير", text: "مبيعات اليوم، طرق الدفع، الأكثر مبيعاً والأرباح." },
];

function Landing() {
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate({ to: session ? "/dashboard" : "/auth", replace: true });
  }, [loading, session, navigate]);


  return (
    <div className="min-h-screen bg-secondary text-secondary-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Store className="size-5" />
          </div>
          <div>
            <p className="font-bold leading-tight">Rush Store</p>
            <p className="text-xs text-secondary-foreground/60">نظام إدارة المتجر</p>
          </div>
        </div>
        <Link
          to="/auth"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          دخول النظام
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 text-center">
        <p className="mx-auto w-fit rounded-full border border-primary/40 px-4 py-1 text-xs text-primary">
          بالعربية · بالجنيه السوداني
        </p>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-tight md:text-5xl">
          نظام كامل لإدارة محلك — <span className="text-gold">بيع، مخزون، صيانة وتقارير</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-secondary-foreground/70">
          كل ما يحتاجه المحل في مكان واحد، بصلاحيات للموظفين وتعدد فروع.
        </p>
        <Link
          to="/auth"
          className="mt-8 inline-flex rounded-xl bg-primary px-7 py-3 font-bold text-primary-foreground shadow-gold"
        >
          ابدأ الآن
        </Link>

        <div className="mt-14 grid gap-4 text-right sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <f.icon className="mb-3 size-6 text-primary" />
              <h2 className="font-bold">{f.title}</h2>
              <p className="mt-1 text-sm text-secondary-foreground/65">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

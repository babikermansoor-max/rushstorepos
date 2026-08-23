import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { normalizeUsername, usernameToEmail } from "@/lib/username";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — Rush Store" },
      { name: "description", content: "دخول موظفي المتجر إلى نظام Rush Store لإدارة المبيعات والمخزون." },
      { property: "og:title", content: "تسجيل الدخول — Rush Store" },
      { property: "og:description", content: "دخول موظفي المتجر إلى نظام إدارة Rush Store." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const handle = normalizeUsername(username);
    if (handle.length < 3) {
      toast.error("اسم المستخدم يجب أن يكون 3 أحرف إنجليزية/أرقام على الأقل");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: usernameToEmail(handle),
          password,
        });
        if (error) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
        toast.success("تم تسجيل الدخول");
        navigate({ to: "/dashboard", replace: true });
      } else {
        if (phone.trim().length < 6) {
          toast.error("أدخل رقم هاتف صحيح");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: usernameToEmail(handle),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: handle, phone: phone.trim(), full_name: fullName.trim() || handle },
          },
        });
        if (error) {
          throw new Error(
            error.message.toLowerCase().includes("already")
              ? "اسم المستخدم مستخدم بالفعل"
              : error.message,
          );
        }
        await supabase.auth.signOut();
        setPending(true);
        setPassword("");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <div className="grid min-h-screen place-items-center bg-secondary px-4 py-10">
        <div className="w-full max-w-md rounded-2xl bg-card p-7 text-center shadow-panel">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
            <Store className="size-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold">تم إرسال طلب التسجيل</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            حسابك بانتظار موافقة المالك. سيتم تفعيله بعد الاعتماد ثم يمكنك تسجيل الدخول باسم المستخدم وكلمة المرور.
          </p>
          <Button
            className="mt-6 w-full"
            onClick={() => {
              setPending(false);
              setMode("login");
            }}
          >
            العودة لتسجيل الدخول
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-secondary px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-card p-7 shadow-panel">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
            <Store className="size-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Rush Store</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login" ? "سجّل دخولك لإدارة المتجر" : "أنشئ حساب موظف جديد — يحتاج موافقة المالك"}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">الاسم الكامل</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="username">اسم المستخدم</Label>
            <Input
              id="username"
              dir="ltr"
              autoComplete="username"
              placeholder="ahmed"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input
                id="phone"
                dir="ltr"
                type="tel"
                inputMode="tel"
                placeholder="09xxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "جارٍ..." : mode === "login" ? "دخول" : "إرسال طلب التسجيل"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "login" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
          <button
            type="button"
            className="font-semibold text-foreground underline"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "إنشاء حساب" : "تسجيل الدخول"}
          </button>
        </p>
      </div>
    </div>
  );
}

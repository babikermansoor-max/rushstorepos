import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, KeyRound, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSession, type AppRole } from "@/hooks/useSession";
import { PageHeader } from "@/components/AppLayout";
import { ROLE_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { setStaffPassword } from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "الموظفين والفروع — Rush Store" },
      { name: "description", content: "إدارة صلاحيات الموظفين وتوزيعهم على فروع المحل." },
      { property: "og:title", content: "الموظفين والفروع — Rush Store" },
      { property: "og:description", content: "إدارة صلاحيات الموظفين والفروع." },
    ],
  }),
  component: UsersPage,
});

const ROLES: AppRole[] = ["owner", "manager", "cashier"];

function UsersPage() {
  const { user } = useSession();
  const { data: me, isLoading: meLoading } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [branchName, setBranchName] = useState("");
  const [open, setOpen] = useState(false);
  const [pwUser, setPwUser] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const changePassword = useServerFn(setStaffPassword);

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("id, name, is_main").order("name")).data ?? [],
  });

  const { data: staff } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, username, phone, is_approved, branch_id, branches(name)")
          .order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (profiles ?? []).map((p) => {
        const list = (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole);
        const role: AppRole = list.includes("owner") ? "owner" : list.includes("manager") ? "manager" : "cashier";
        return { ...p, role };
      });
    },
  });

  if (meLoading) return <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>;
  if (!me?.isAdmin)
    return (
      <div className="surface p-8 text-center">
        <h1 className="text-lg font-bold">لا تملك صلاحية الوصول</h1>
        <p className="mt-1 text-sm text-muted-foreground">هذه الصفحة مخصصة للمالك والمدير فقط.</p>
      </div>
    );

  async function addBranch(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("branches").insert({ name: branchName });
    if (error) toast.error(error.message);
    else {
      toast.success("تمت إضافة الفرع");
      setBranchName("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    }
  }

  async function setRole(userId: string, role: AppRole) {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast.error(error.message);
    else {
      toast.success("تم تحديث الصلاحية");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    }
  }

  async function setApproved(userId: string, approved: boolean) {
    const { error } = await supabase.from("profiles").update({ is_approved: approved }).eq("id", userId);
    if (error) toast.error(error.message);
    else {
      toast.success(approved ? "تم اعتماد الحساب" : "تم إيقاف الحساب");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwUser) return;
    try {
      await changePassword({ data: { userId: pwUser.id, password: newPassword } });
      toast.success("تم تغيير كلمة المرور");
      setPwUser(null);
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تغيير كلمة المرور");
    }
  }

  async function setBranch(userId: string, branchId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ branch_id: branchId || null })
      .eq("id", userId);
    if (error) toast.error(error.message);
    else {
      toast.success("تم تحديث الفرع");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    }
  }

  return (
    <div>
      <PageHeader
        title="الموظفين والفروع"
        subtitle="الصلاحيات وتوزيع الموظفين"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> فرع جديد
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة فرع</DialogTitle>
              </DialogHeader>
              <form onSubmit={addBranch} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>اسم الفرع</Label>
                  <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full">
                  حفظ
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface overflow-x-auto p-4 lg:col-span-2">
          <h2 className="mb-3 font-bold">الموظفون</h2>
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-3 font-medium">الاسم</th>
                <th className="p-3 font-medium">الصلاحية</th>
                <th className="p-3 font-medium">الفرع</th>
              </tr>
            </thead>
            <tbody>
              {(staff ?? []).map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="p-3 font-semibold">{s.full_name || "بدون اسم"}</td>
                  <td className="p-3">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={s.role}
                      onChange={(e) => setRole(s.id, e.target.value as AppRole)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={s.branch_id ?? ""}
                      onChange={(e) => setBranch(s.id, e.target.value)}
                    >
                      <option value="">بدون فرع</option>
                      {(branches ?? []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {(staff ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-muted-foreground">
                    لا يوجد موظفون
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="surface p-4">
          <h2 className="mb-3 font-bold">الفروع</h2>
          <ul className="space-y-2">
            {(branches ?? []).map((b) => (
              <li key={b.id} className="rounded-lg bg-muted px-3 py-2">
                <p className="font-semibold">{b.name}</p>
                {b.is_main && <p className="text-xs text-muted-foreground">الفرع الرئيسي</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

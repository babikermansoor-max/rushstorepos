import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, KeyRound, Check, X, UserPlus, Trash2 } from "lucide-react";
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
import { setStaffPassword, createStaffAccount, deleteStaffAccount } from "@/lib/staff.functions";


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

const ROLES: AppRole[] = ["owner", "manager", "warehouse", "cashier"];

function UsersPage() {
  const { user } = useSession();
  const { data: me, isLoading: meLoading } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [branchName, setBranchName] = useState("");
  const [open, setOpen] = useState(false);
  const [pwUser, setPwUser] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const changePassword = useServerFn(setStaffPassword);
  const createAccount = useServerFn(createStaffAccount);
  const deleteAccount = useServerFn(deleteStaffAccount);
  const [accOpen, setAccOpen] = useState(false);
  const [accBusy, setAccBusy] = useState(false);
  const emptyAcc = {
    username: "",
    password: "",
    fullName: "",
    phone: "",
    role: "owner" as AppRole,
    branchId: "",
  };
  const [acc, setAcc] = useState(emptyAcc);


  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("id, name, is_main").order("name")).data ?? [],
  });

  const { data: staff } = useQuery({
    queryKey: ["staff", me?.isOwner, me?.profile?.branch_id],
    enabled: !!me,
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, username, phone, is_approved, branch_id, branches(name)")
          .order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (profiles ?? [])
        .filter((p) => me?.isOwner || p.branch_id === me?.profile?.branch_id)
        .map((p) => {
        const list = (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole);
        const role: AppRole = list.includes("owner")
          ? "owner"
          : list.includes("manager")
            ? "manager"
            : list.includes("warehouse")
              ? "warehouse"
              : "cashier";
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
    const { error: delError } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delError) {
      toast.error(delError.message);
      return;
    }
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

  async function removeStaff(userId: string, name: string) {
    if (!confirm(`هل أنت متأكد من حذف الموظف (${name})؟\nستبقى فواتيره السابقة محفوظة.`)) return;
    try {
      await deleteAccount({ data: { userId } });
      toast.success("تم حذف الموظف");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر حذف الموظف");
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

  async function submitAccount(e: React.FormEvent) {
    e.preventDefault();
    setAccBusy(true);
    try {
      await createAccount({
        data: {
          username: acc.username,
          password: acc.password,
          fullName: acc.fullName,
          phone: acc.phone,
          role: acc.role,
          branchId: acc.branchId || null,
        },
      });
      toast.success("تم إنشاء الحساب");
      setAcc(emptyAcc);
      setAccOpen(false);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر إنشاء الحساب");
    } finally {
      setAccBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="الموظفين والفروع"
        subtitle="الصلاحيات وتوزيع الموظفين"
        action={
          <div className="flex gap-2">
            {me.isOwner && (
              <Dialog open={accOpen} onOpenChange={setAccOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <UserPlus className="size-4" /> حساب مالك
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle>إضافة حساب</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={submitAccount} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>الاسم الكامل</Label>
                      <Input
                        value={acc.fullName}
                        onChange={(e) => setAcc({ ...acc, fullName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>اسم المستخدم</Label>
                      <Input
                        dir="ltr"
                        value={acc.username}
                        onChange={(e) => setAcc({ ...acc, username: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>رقم الهاتف</Label>
                      <Input
                        dir="ltr"
                        value={acc.phone}
                        onChange={(e) => setAcc({ ...acc, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>كلمة المرور</Label>
                      <Input
                        dir="ltr"
                        minLength={6}
                        value={acc.password}
                        onChange={(e) => setAcc({ ...acc, password: e.target.value })}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>الصلاحية</Label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={acc.role}
                          onChange={(e) => setAcc({ ...acc, role: e.target.value as AppRole })}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>الفرع</Label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={acc.branchId}
                          onChange={(e) => setAcc({ ...acc, branchId: e.target.value })}
                        >
                          <option value="">الفرع الافتراضي</option>
                          {(branches ?? []).map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={accBusy}>
                      {accBusy ? "جارٍ..." : "إنشاء الحساب"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {me.isOwner && (
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
            )}
          </div>
        }
      />


      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface overflow-x-auto p-4 lg:col-span-2">
          <h2 className="mb-3 font-bold">الموظفون</h2>
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-3 font-medium">الاسم</th>
                <th className="p-3 font-medium">اسم المستخدم</th>
                <th className="p-3 font-medium">الهاتف</th>
                <th className="p-3 font-medium">الحالة</th>
                <th className="p-3 font-medium">الصلاحية</th>
                <th className="p-3 font-medium">الفرع</th>
                <th className="p-3 font-medium">كلمة المرور</th>
              </tr>
            </thead>
            <tbody>
              {(staff ?? []).map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="p-3 font-semibold">{s.full_name || "بدون اسم"}</td>
                  <td className="p-3 text-muted-foreground" dir="ltr">
                    {s.username ?? "—"}
                  </td>
                  <td className="p-3 text-muted-foreground" dir="ltr">
                    {s.phone ?? "—"}
                  </td>
                  <td className="p-3">
                    {s.is_approved ? (
                      <Button size="sm" variant="outline" onClick={() => setApproved(s.id, false)}>
                        <Check className="size-4 text-primary" /> معتمد
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setApproved(s.id, true)}>
                        <X className="size-4" /> اعتماد
                      </Button>
                    )}
                  </td>
                  <td className="p-3">
                    {me.isOwner ? (
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
                    ) : (
                      <span className="text-sm">{ROLE_LABELS[s.role]}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {me.isOwner ? (
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
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {(s.branches as { name: string } | null)?.name ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {me.isOwner ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPwUser({ id: s.id, name: s.full_name || s.username || "" })}
                        >
                          <KeyRound className="size-4" /> تغيير
                        </Button>
                        {s.id !== user?.id && (
                          <Button
                            size="sm"
                            variant="destructive"
                            aria-label="حذف الموظف"
                            onClick={() => removeStaff(s.id, s.full_name || s.username || "")}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">للمالك فقط</span>
                    )}
                  </td>
                </tr>
              ))}
              {(staff ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
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

      <Dialog open={!!pwUser} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تغيير كلمة مرور {pwUser?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitPassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label>كلمة المرور الجديدة</Label>
              <Input
                type="text"
                dir="ltr"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              حفظ
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>

  );
}

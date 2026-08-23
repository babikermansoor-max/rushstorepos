import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeUsername, usernameToEmail } from "@/lib/username";

type NewStaff = {
  username: string;
  password: string;
  fullName?: string;
  phone?: string;
  role: "owner" | "manager" | "cashier";
  branchId?: string | null;
};

/** Owner-only: create a staff (or owner) account, approved immediately. */
export const createStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NewStaff) => {
    const username = normalizeUsername(input?.username ?? "");
    if (username.length < 3) throw new Error("اسم المستخدم قصير جداً");
    if (!input?.password || input.password.length < 6) throw new Error("كلمة المرور قصيرة جداً");
    if (!["owner", "manager", "cashier"].includes(input?.role)) throw new Error("صلاحية غير صالحة");
    return { ...input, username };
  })
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isOwner) throw new Error("هذه العملية للمالك فقط");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(data.username),
      password: data.password,
      email_confirm: true,
      user_metadata: {
        username: data.username,
        full_name: data.fullName?.trim() || data.username,
        phone: data.phone?.trim() || null,
      },
    });
    if (error) {
      throw new Error(
        error.message.toLowerCase().includes("already") ? "اسم المستخدم مستخدم بالفعل" : error.message,
      );
    }
    const userId = created.user!.id;

    await supabaseAdmin
      .from("profiles")
      .update({
        is_approved: true,
        full_name: data.fullName?.trim() || data.username,
        phone: data.phone?.trim() || null,
        ...(data.branchId ? { branch_id: data.branchId } : {}),
      })
      .eq("id", userId);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (roleError) throw new Error(roleError.message);

    return { ok: true, userId };
  });


/** Owner-only: set a staff member's password. */
export const setStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password: string }) => {
    if (!input?.userId) throw new Error("مستخدم غير صالح");
    if (!input?.password || input.password.length < 6) throw new Error("كلمة المرور قصيرة جداً");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isOwner) throw new Error("هذه العملية للمالك فقط");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

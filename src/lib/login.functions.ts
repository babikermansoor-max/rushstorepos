import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { normalizeUsername, usernameToEmail } from "@/lib/username";

/**
 * Server-side sign-in with progressive throttling per username and per IP.
 * No hard lockout: a legit user only waits a capped delay, never blocked permanently.
 */
export const secureSignIn = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string }) => {
    const username = normalizeUsername(input?.username ?? "");
    if (username.length < 3 || !input?.password || input.password.length > 200) {
      throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
    }
    return { username, password: input.password };
  })
  .handler(async ({ data }) => {
    const ip =
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: wait } = await supabaseAdmin.rpc("login_wait_seconds", {
      _username: data.username,
      _ip: ip,
    });
    if ((wait ?? 0) > 0) {
      return { ok: false as const, waitSeconds: wait as number };
    }

    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: res, error } = await client.auth.signInWithPassword({
      email: usernameToEmail(data.username),
      password: data.password,
    });

    await supabaseAdmin
      .from("login_attempts")
      .insert({ username: data.username, ip, success: !error });

    if (error || !res.session) {
      // Constant small delay to slow automated guessing.
      await new Promise((r) => setTimeout(r, 400));
      return { ok: false as const, waitSeconds: 0 };
    }
    return {
      ok: true as const,
      access_token: res.session.access_token,
      refresh_token: res.session.refresh_token,
    };
  });

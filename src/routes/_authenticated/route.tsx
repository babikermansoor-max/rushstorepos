import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Clock } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useProfile, useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, user, loading } = useSession();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useProfile(user?.id);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  if (loading || !session || meLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (me && !me.isApproved) {
    return (
      <div className="grid min-h-screen place-items-center bg-secondary px-4">
        <div className="w-full max-w-md rounded-2xl bg-card p-7 text-center shadow-panel">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
            <Clock className="size-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold">حسابك بانتظار الاعتماد</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            تم استلام طلبك، وسيقوم المالك بتفعيل الحساب وتحديد صلاحياتك.
          </p>
          <Button
            variant="outline"
            className="mt-6 w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth", replace: true });
            }}
          >
            تسجيل الخروج
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

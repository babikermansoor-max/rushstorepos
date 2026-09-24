-- Repairs: owners/managers only
DROP POLICY IF EXISTS "insert repairs" ON public.repairs;
DROP POLICY IF EXISTS "read repairs" ON public.repairs;
DROP POLICY IF EXISTS "update repairs" ON public.repairs;
CREATE POLICY "admin insert repairs" ON public.repairs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND created_by = auth.uid() AND public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "admin read repairs" ON public.repairs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "admin update repairs" ON public.repairs FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id))
  WITH CHECK (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id));

-- Expenses: cashier sees only own entries
DROP POLICY IF EXISTS "read expenses" ON public.expenses;
CREATE POLICY "read expenses" ON public.expenses FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id)));

-- Profiles: cashier sees only own profile
DROP POLICY IF EXISTS "read profiles" ON public.profiles;
CREATE POLICY "read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));

-- Sales reads: cashier limited to own branch (needed for returns), admins per branch
DROP POLICY IF EXISTS "read sales" ON public.sales;
CREATE POLICY "read sales" ON public.sales FOR SELECT TO authenticated
  USING (cashier_id = auth.uid() OR public.can_access_branch(auth.uid(), branch_id));
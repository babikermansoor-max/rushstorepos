
-- helper: current user's branch
CREATE OR REPLACE FUNCTION public.current_branch(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT branch_id FROM public.profiles WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.can_access_branch(_user_id uuid, _branch uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id)
      OR (_branch IS NOT NULL AND _branch = public.current_branch(_user_id));
$$;

-- SALES
DROP POLICY IF EXISTS "read sales" ON public.sales;
CREATE POLICY "read sales" ON public.sales FOR SELECT TO authenticated
USING (cashier_id = auth.uid() OR public.can_access_branch(auth.uid(), branch_id));

DROP POLICY IF EXISTS "insert sales" ON public.sales;
CREATE POLICY "insert sales" ON public.sales FOR INSERT TO authenticated
WITH CHECK (cashier_id = auth.uid() AND public.can_access_branch(auth.uid(), branch_id));

-- SALE ITEMS
DROP POLICY IF EXISTS "read sale items" ON public.sale_items;
CREATE POLICY "read sale items" ON public.sale_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id
  AND (s.cashier_id = auth.uid() OR public.can_access_branch(auth.uid(), s.branch_id))));

DROP POLICY IF EXISTS "insert sale items" ON public.sale_items;
CREATE POLICY "insert sale items" ON public.sale_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id
  AND s.cashier_id = auth.uid()));

-- RETURNS
DROP POLICY IF EXISTS "read returns" ON public.returns;
CREATE POLICY "read returns" ON public.returns FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.can_access_branch(auth.uid(), branch_id));

DROP POLICY IF EXISTS "insert returns" ON public.returns;
CREATE POLICY "insert returns" ON public.returns FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND public.can_access_branch(auth.uid(), branch_id));

-- REPAIRS
DROP POLICY IF EXISTS "read repairs" ON public.repairs;
CREATE POLICY "read repairs" ON public.repairs FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.can_access_branch(auth.uid(), branch_id));

DROP POLICY IF EXISTS "insert repairs" ON public.repairs;
CREATE POLICY "insert repairs" ON public.repairs FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND public.can_access_branch(auth.uid(), branch_id));

DROP POLICY IF EXISTS "update repairs" ON public.repairs;
CREATE POLICY "update repairs" ON public.repairs FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.can_access_branch(auth.uid(), branch_id))
WITH CHECK (created_by = auth.uid() OR public.can_access_branch(auth.uid(), branch_id));

-- STOCK
DROP POLICY IF EXISTS "read stock" ON public.stock;
CREATE POLICY "read stock" ON public.stock FOR SELECT TO authenticated
USING (public.can_access_branch(auth.uid(), branch_id));

DROP POLICY IF EXISTS "update stock" ON public.stock;
CREATE POLICY "update stock" ON public.stock FOR UPDATE TO authenticated
USING (public.can_access_branch(auth.uid(), branch_id))
WITH CHECK (public.can_access_branch(auth.uid(), branch_id));

DROP POLICY IF EXISTS "write stock" ON public.stock;
CREATE POLICY "write stock" ON public.stock FOR INSERT TO authenticated
WITH CHECK (public.can_access_branch(auth.uid(), branch_id));

-- PROFILES
DROP POLICY IF EXISTS "read profiles" ON public.profiles;
CREATE POLICY "read profiles" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin(auth.uid())
   OR (branch_id IS NOT NULL AND branch_id = public.current_branch(auth.uid())));

-- USER ROLES: owners only, no self-assignment
DROP POLICY IF EXISTS "read roles" ON public.user_roles;
CREATE POLICY "read roles" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin insert roles" ON public.user_roles;
CREATE POLICY "owner insert roles" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'owner') AND user_id <> auth.uid());

DROP POLICY IF EXISTS "admin update roles" ON public.user_roles;
CREATE POLICY "owner update roles" ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'owner') AND user_id <> auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'owner') AND user_id <> auth.uid());

DROP POLICY IF EXISTS "owner delete roles" ON public.user_roles;
CREATE POLICY "owner delete roles" ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'owner') AND user_id <> auth.uid());

-- Lock down internal SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_return_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_sale_item_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_negative_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_branch(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_branch(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_branch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid) TO authenticated;

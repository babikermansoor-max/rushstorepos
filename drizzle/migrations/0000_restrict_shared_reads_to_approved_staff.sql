DROP POLICY IF EXISTS "read categories" ON public.categories;
CREATE POLICY "read categories" ON public.categories FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "read products" ON public.products;
CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "read branches" ON public.branches;
CREATE POLICY "read branches" ON public.branches FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "read app settings" ON public.app_settings;
CREATE POLICY "read app settings" ON public.app_settings FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
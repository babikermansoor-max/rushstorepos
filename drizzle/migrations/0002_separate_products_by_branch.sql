ALTER TABLE public.products ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.categories ADD COLUMN branch_id uuid REFERENCES public.branches(id);

UPDATE public.products p SET branch_id = COALESCE(
  (SELECT s.branch_id FROM public.stock s WHERE s.product_id = p.id ORDER BY s.quantity DESC LIMIT 1),
  (SELECT id FROM public.branches ORDER BY is_main DESC, created_at LIMIT 1));
UPDATE public.categories SET branch_id = (SELECT id FROM public.branches ORDER BY is_main DESC, created_at LIMIT 1);

ALTER TABLE public.products ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.categories ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_barcode_key;
DROP INDEX IF EXISTS public.products_barcode_unique;
CREATE UNIQUE INDEX products_branch_barcode_unique ON public.products (branch_id, barcode) WHERE barcode IS NOT NULL;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
CREATE UNIQUE INDEX categories_branch_name_unique ON public.categories (branch_id, name);
CREATE INDEX products_branch_idx ON public.products (branch_id);

CREATE OR REPLACE FUNCTION public.set_default_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN NEW.branch_id := public.current_branch(auth.uid()); END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_default_branch() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_products_branch BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_default_branch();
CREATE TRIGGER trg_categories_branch BEFORE INSERT ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_default_branch();

CREATE OR REPLACE FUNCTION public.check_product_branch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = NEW.category_id AND c.branch_id = NEW.branch_id) THEN
    RAISE EXCEPTION 'الصنف لا يتبع نفس فرع المنتج';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_check_product_branch BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.check_product_branch();

CREATE OR REPLACE FUNCTION public.check_stock_branch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.branch_id = NEW.branch_id) THEN
    RAISE EXCEPTION 'المنتج لا يتبع هذا الفرع';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_check_stock_branch BEFORE INSERT ON public.stock FOR EACH ROW EXECUTE FUNCTION public.check_stock_branch();

DROP POLICY IF EXISTS "read products" ON public.products;
DROP POLICY IF EXISTS "admin insert products" ON public.products;
DROP POLICY IF EXISTS "admin update products" ON public.products;
DROP POLICY IF EXISTS "owner delete products" ON public.products;
CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated USING (public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "admin insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "admin update products" ON public.products FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id)) WITH CHECK (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "owner delete products" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "read categories" ON public.categories;
DROP POLICY IF EXISTS "admin insert categories" ON public.categories;
DROP POLICY IF EXISTS "admin update categories" ON public.categories;
CREATE POLICY "read categories" ON public.categories FOR SELECT TO authenticated USING (public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "admin insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "admin update categories" ON public.categories FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id)) WITH CHECK (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id));

CREATE OR REPLACE FUNCTION public.create_sale(p_branch uuid, p_customer text, p_method payment_method, p_items jsonb)
 RETURNS TABLE(sale_id uuid, invoice_no bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid(); v_branch uuid := p_branch; v_total numeric := 0; v_avail int; it jsonb;
  v_id uuid; v_no bigint; v_at timestamptz; v_pid uuid; v_qty int; v_price numeric; v_list numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'الفاتورة فارغة'; END IF;
  IF v_branch IS NULL THEN v_branch := public.current_branch(v_user); END IF;
  IF v_branch IS NULL THEN RAISE EXCEPTION 'لا يوجد فرع محدد'; END IF;
  IF NOT public.can_access_branch(v_user, v_branch) THEN RAISE EXCEPTION 'لا تملك صلاحية الوصول لهذا الفرع'; END IF;

  FOR it IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := (it->>'quantity')::int; v_price := (it->>'unit_price')::numeric; v_pid := NULLIF(it->>'product_id','')::uuid;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;
    IF v_price IS NULL OR v_price < 0 THEN RAISE EXCEPTION 'سعر غير صالح'; END IF;
    IF v_pid IS NULL THEN RAISE EXCEPTION 'يجب اختيار منتج من القائمة'; END IF;
    SELECT p.sale_price INTO v_list FROM public.products p WHERE p.id = v_pid AND p.is_active AND p.branch_id = v_branch;
    IF v_list IS NULL THEN RAISE EXCEPTION 'المنتج غير موجود في هذا الفرع أو غير مفعّل'; END IF;
    v_total := v_total + v_qty * v_price;
    SELECT s.quantity INTO v_avail FROM public.stock s WHERE s.product_id = v_pid AND s.branch_id = v_branch FOR UPDATE;
    IF COALESCE(v_avail, 0) < v_qty THEN RAISE EXCEPTION 'الكمية غير كافية للمنتج %', COALESCE(it->>'product_name',''); END IF;
  END LOOP;

  INSERT INTO public.sales (branch_id, cashier_id, customer_name, total, payment_method)
  VALUES (v_branch, v_user, NULLIF(p_customer, ''), v_total, p_method)
  RETURNING sales.id, sales.invoice_no, sales.created_at INTO v_id, v_no, v_at;

  INSERT INTO public.sale_items (sale_id, product_id, product_name, quantity, unit_price, unit_cost)
  SELECT v_id, NULLIF(x->>'product_id','')::uuid, x->>'product_name', (x->>'quantity')::int, (x->>'unit_price')::numeric,
         COALESCE((SELECT p.cost_price FROM public.products p WHERE p.id = NULLIF(x->>'product_id','')::uuid), 0)
  FROM jsonb_array_elements(p_items) x;

  RETURN QUERY SELECT v_id, v_no, v_at;
END;
$function$;
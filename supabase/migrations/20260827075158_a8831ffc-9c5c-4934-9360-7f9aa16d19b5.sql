CREATE OR REPLACE FUNCTION public.create_sale(p_branch uuid, p_customer text, p_method payment_method, p_items jsonb)
RETURNS TABLE(sale_id uuid, invoice_no bigint, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_branch uuid := p_branch;
  v_total numeric := 0;
  v_avail int;
  it jsonb;
  v_id uuid;
  v_no bigint;
  v_at timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'الفاتورة فارغة'; END IF;

  IF v_branch IS NULL THEN
    SELECT b.id INTO v_branch FROM public.branches b ORDER BY b.is_main DESC, b.created_at LIMIT 1;
  END IF;
  IF v_branch IS NULL THEN RAISE EXCEPTION 'لا يوجد فرع محدد'; END IF;

  IF NOT public.can_access_branch(v_user, v_branch) THEN
    RAISE EXCEPTION 'لا تملك صلاحية الوصول لهذا الفرع';
  END IF;

  FOR it IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF (it->>'quantity')::int <= 0 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;
    v_total := v_total + (it->>'quantity')::int * (it->>'unit_price')::numeric;
    IF NULLIF(it->>'product_id','') IS NOT NULL THEN
      SELECT s.quantity INTO v_avail FROM public.stock s
      WHERE s.product_id = (it->>'product_id')::uuid AND s.branch_id = v_branch
      FOR UPDATE;
      IF COALESCE(v_avail, 0) < (it->>'quantity')::int THEN
        RAISE EXCEPTION 'الكمية غير كافية للمنتج %', COALESCE(it->>'product_name','');
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.sales (branch_id, cashier_id, customer_name, total, payment_method)
  VALUES (v_branch, v_user, NULLIF(p_customer, ''), v_total, p_method)
  RETURNING sales.id, sales.invoice_no, sales.created_at INTO v_id, v_no, v_at;

  INSERT INTO public.sale_items (sale_id, product_id, product_name, quantity, unit_price)
  SELECT v_id,
         NULLIF(x->>'product_id','')::uuid,
         x->>'product_name',
         (x->>'quantity')::int,
         (x->>'unit_price')::numeric
  FROM jsonb_array_elements(p_items) x;

  RETURN QUERY SELECT v_id, v_no, v_at;
END;
$function$;

DROP POLICY IF EXISTS "write stock" ON public.stock;
CREATE POLICY "write stock" ON public.stock FOR INSERT TO authenticated
  WITH CHECK (public.can_access_branch(auth.uid(), branch_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "update stock" ON public.stock;
CREATE POLICY "update stock" ON public.stock FOR UPDATE TO authenticated
  USING (public.can_access_branch(auth.uid(), branch_id) AND public.is_admin(auth.uid()))
  WITH CHECK (public.can_access_branch(auth.uid(), branch_id) AND public.is_admin(auth.uid()));
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
  v_pid uuid;
  v_qty int;
  v_price numeric;
  v_list numeric;
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
    v_qty := (it->>'quantity')::int;
    v_price := (it->>'unit_price')::numeric;
    v_pid := NULLIF(it->>'product_id','')::uuid;

    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;
    IF v_price IS NULL OR v_price < 0 THEN RAISE EXCEPTION 'سعر غير صالح'; END IF;
    IF v_pid IS NULL THEN RAISE EXCEPTION 'يجب اختيار منتج من القائمة'; END IF;

    SELECT p.sale_price INTO v_list FROM public.products p WHERE p.id = v_pid AND p.is_active;
    IF v_list IS NULL THEN RAISE EXCEPTION 'المنتج غير موجود أو غير مفعّل'; END IF;

    v_total := v_total + v_qty * v_price;

    SELECT s.quantity INTO v_avail FROM public.stock s
    WHERE s.product_id = v_pid AND s.branch_id = v_branch
    FOR UPDATE;
    IF COALESCE(v_avail, 0) < v_qty THEN
      RAISE EXCEPTION 'الكمية غير كافية للمنتج %', COALESCE(it->>'product_name','');
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
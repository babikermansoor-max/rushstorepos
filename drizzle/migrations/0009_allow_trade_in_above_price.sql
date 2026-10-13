CREATE OR REPLACE FUNCTION public.create_phone_sale(
  p_phone_id uuid, p_price numeric, p_customer text, p_customer_phone text,
  p_method public.payment_method, p_trade_in jsonb)
RETURNS TABLE(sale_id uuid, invoice_no bigint, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_ph public.phones%ROWTYPE; v_tid uuid; v_tval numeric := 0;
  v_id uuid; v_no bigint; v_at timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF p_price IS NULL OR p_price < 0 THEN RAISE EXCEPTION 'سعر غير صالح'; END IF;
  SELECT * INTO v_ph FROM public.phones WHERE id = p_phone_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الجهاز غير موجود'; END IF;
  IF NOT public.can_access_branch(v_user, v_ph.branch_id) THEN RAISE EXCEPTION 'لا تملك صلاحية الوصول لهذا الفرع'; END IF;
  IF v_ph.status <> 'available' THEN RAISE EXCEPTION 'الجهاز مباع مسبقاً'; END IF;

  IF p_trade_in IS NOT NULL AND COALESCE(p_trade_in->>'imei','') <> '' THEN
    v_tval := COALESCE((p_trade_in->>'value')::numeric, 0);
    IF v_tval < 0 THEN RAISE EXCEPTION 'قيمة الاستبدال غير صالحة'; END IF;
    IF EXISTS (SELECT 1 FROM public.phones WHERE branch_id = v_ph.branch_id AND imei = p_trade_in->>'imei' AND status = 'available') THEN
      RAISE EXCEPTION 'جهاز الاستبدال موجود في المخزون بالفعل'; END IF;
    INSERT INTO public.phones (branch_id, imei, brand, model, storage, color, condition, grade, battery_health,
      seller_name, seller_phone, notes, cost_price, sale_price, created_by)
    VALUES (v_ph.branch_id, p_trade_in->>'imei', COALESCE(p_trade_in->>'brand',''), COALESCE(NULLIF(p_trade_in->>'model',''),'غير محدد'),
      NULLIF(p_trade_in->>'storage',''), NULLIF(p_trade_in->>'color',''), 'used', NULLIF(p_trade_in->>'grade',''),
      NULLIF(p_trade_in->>'battery_health','')::int, NULLIF(p_customer,''), NULLIF(p_customer_phone,''),
      NULLIF(p_trade_in->>'notes',''), v_tval, COALESCE(NULLIF(p_trade_in->>'sale_price','')::numeric, v_tval), v_user)
    ON CONFLICT (branch_id, imei) DO UPDATE SET status = 'available', condition = 'used', cost_price = EXCLUDED.cost_price,
      sale_price = EXCLUDED.sale_price, grade = EXCLUDED.grade, battery_health = EXCLUDED.battery_health,
      seller_name = EXCLUDED.seller_name, seller_phone = EXCLUDED.seller_phone, notes = EXCLUDED.notes
    RETURNING id INTO v_tid;
  END IF;

  UPDATE public.phones SET status = 'sold' WHERE id = v_ph.id;
  INSERT INTO public.phone_sales (branch_id, phone_id, customer_name, customer_phone, sale_price, unit_cost,
    trade_in_phone_id, trade_in_value, amount_paid, payment_method, cashier_id)
  VALUES (v_ph.branch_id, v_ph.id, NULLIF(p_customer,''), NULLIF(p_customer_phone,''), p_price, v_ph.cost_price,
    v_tid, v_tval, p_price - v_tval, p_method, v_user)
  RETURNING phone_sales.id, phone_sales.invoice_no, phone_sales.created_at INTO v_id, v_no, v_at;
  RETURN QUERY SELECT v_id, v_no, v_at;
END; $$;
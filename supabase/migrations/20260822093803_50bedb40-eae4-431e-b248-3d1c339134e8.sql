-- 1) Prevent duplicate barcodes (keep first, clear the rest)
UPDATE public.products p SET barcode = NULL
WHERE barcode IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.products q
  WHERE q.barcode = p.barcode AND q.created_at < p.created_at
);
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique
  ON public.products (barcode) WHERE barcode IS NOT NULL;

-- 2) Never allow negative stock
CREATE OR REPLACE FUNCTION public.prevent_negative_stock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.quantity < 0 THEN
    RAISE EXCEPTION 'الكمية في المخزون لا تكفي';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_negative_stock ON public.stock;
CREATE TRIGGER trg_prevent_negative_stock
BEFORE INSERT OR UPDATE ON public.stock
FOR EACH ROW EXECUTE FUNCTION public.prevent_negative_stock();

-- 3) Atomic sale creation with stock validation
CREATE OR REPLACE FUNCTION public.create_sale(
  p_branch uuid,
  p_customer text,
  p_method payment_method,
  p_items jsonb
)
RETURNS TABLE (sale_id uuid, invoice_no bigint, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

REVOKE ALL ON FUNCTION public.create_sale(uuid, text, payment_method, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, text, payment_method, jsonb) TO authenticated;
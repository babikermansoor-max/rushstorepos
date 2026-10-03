CREATE TYPE public.phone_condition AS ENUM ('new','used');
CREATE TYPE public.phone_status AS ENUM ('available','sold');
CREATE SEQUENCE public.phone_invoice_seq START 1;

CREATE TABLE public.phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  imei text NOT NULL,
  brand text NOT NULL DEFAULT '',
  model text NOT NULL,
  storage text,
  color text,
  condition public.phone_condition NOT NULL DEFAULT 'new',
  grade text,
  battery_health int,
  seller_name text,
  seller_phone text,
  notes text,
  cost_price numeric NOT NULL DEFAULT 0,
  sale_price numeric NOT NULL DEFAULT 0,
  status public.phone_status NOT NULL DEFAULT 'available',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, imei)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phones TO authenticated;
GRANT ALL ON public.phones TO service_role;
ALTER TABLE public.phones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read phones" ON public.phones FOR SELECT TO authenticated USING (public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "admin insert phones" ON public.phones FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "admin update phones" ON public.phones FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id)) WITH CHECK (public.is_admin(auth.uid()) AND public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "owner delete phones" ON public.phones FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE TRIGGER trg_phones_branch BEFORE INSERT ON public.phones FOR EACH ROW EXECUTE FUNCTION public.set_default_branch();
CREATE TRIGGER trg_phones_updated BEFORE UPDATE ON public.phones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.phone_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no bigint NOT NULL DEFAULT nextval('public.phone_invoice_seq'),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  phone_id uuid NOT NULL REFERENCES public.phones(id),
  customer_name text,
  customer_phone text,
  sale_price numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  trade_in_phone_id uuid REFERENCES public.phones(id),
  trade_in_value numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  cashier_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.phone_sales TO authenticated;
GRANT ALL ON public.phone_sales TO service_role;
ALTER TABLE public.phone_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read phone sales" ON public.phone_sales FOR SELECT TO authenticated USING ((cashier_id = auth.uid()) OR public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "owner delete phone sales" ON public.phone_sales FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

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
  IF v_tval > p_price THEN RAISE EXCEPTION 'قيمة جهاز الزبون أكبر من سعر الجهاز'; END IF;

  UPDATE public.phones SET status = 'sold' WHERE id = v_ph.id;
  INSERT INTO public.phone_sales (branch_id, phone_id, customer_name, customer_phone, sale_price, unit_cost,
    trade_in_phone_id, trade_in_value, amount_paid, payment_method, cashier_id)
  VALUES (v_ph.branch_id, v_ph.id, NULLIF(p_customer,''), NULLIF(p_customer_phone,''), p_price, v_ph.cost_price,
    v_tid, v_tval, p_price - v_tval, p_method, v_user)
  RETURNING phone_sales.id, phone_sales.invoice_no, phone_sales.created_at INTO v_id, v_no, v_at;
  RETURN QUERY SELECT v_id, v_no, v_at;
END; $$;
REVOKE ALL ON FUNCTION public.create_phone_sale(uuid, numeric, text, text, public.payment_method, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_phone_sale(uuid, numeric, text, text, public.payment_method, jsonb) TO authenticated;
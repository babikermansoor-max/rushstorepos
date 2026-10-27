-- Rush Store full schema (generated from project migrations, in order)
-- Run on a fresh self-hosted Supabase database.

-- ==== supabase/migrations/20260822084804_6f8d1ed5-c134-409b-9813-87c3dba3e1b7.sql ====
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('owner','manager','cashier');
CREATE TYPE public.payment_method AS ENUM ('cash','bankak');
CREATE TYPE public.repair_status AS ENUM ('received','in_progress','done','delivered','cancelled');

-- BRANCHES
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_main boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','manager'));
$$;

-- CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  barcode text UNIQUE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  cost_price numeric(14,2) NOT NULL DEFAULT 0,
  sale_price numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- STOCK
CREATE TABLE public.stock (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, branch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock TO authenticated;
GRANT ALL ON public.stock TO service_role;
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;

-- SALES
CREATE SEQUENCE public.invoice_seq START 1000;
GRANT USAGE, SELECT ON SEQUENCE public.invoice_seq TO authenticated, service_role;

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no bigint NOT NULL DEFAULT nextval('public.invoice_seq'),
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  cashier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text,
  total numeric(14,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- RETURNS
CREATE TABLE public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL DEFAULT '',
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.returns TO authenticated;
GRANT ALL ON public.returns TO service_role;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

-- REPAIRS
CREATE TABLE public.repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone text,
  device text NOT NULL,
  issue text,
  status public.repair_status NOT NULL DEFAULT 'received',
  cost numeric(14,2) NOT NULL DEFAULT 0,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repairs TO authenticated;
GRANT ALL ON public.repairs TO service_role;
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "read branches" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write branches" ON public.branches FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin update branches" ON public.branches FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "owner delete branches" ON public.branches FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE POLICY "read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "owner delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE POLICY "read categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin update categories" ON public.categories FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "owner delete categories" ON public.categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin update products" ON public.products FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "owner delete products" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE POLICY "read stock" ON public.stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "write stock" ON public.stock FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update stock" ON public.stock FOR UPDATE TO authenticated USING (true);
CREATE POLICY "owner delete stock" ON public.stock FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE POLICY "read sales" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (cashier_id = auth.uid());
CREATE POLICY "owner delete sales" ON public.sales FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE POLICY "read sale items" ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert sale items" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "owner delete sale items" ON public.sale_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE POLICY "read returns" ON public.returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert returns" ON public.returns FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "owner delete returns" ON public.returns FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE POLICY "read repairs" ON public.repairs FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert repairs" ON public.repairs FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "update repairs" ON public.repairs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "owner delete repairs" ON public.repairs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

-- NEW USER TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_branch uuid;
  v_count int;
BEGIN
  SELECT id INTO v_branch FROM public.branches WHERE is_main ORDER BY created_at LIMIT 1;
  INSERT INTO public.profiles (id, full_name, branch_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), v_branch);

  SELECT count(*) INTO v_count FROM public.user_roles;
  IF v_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cashier');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- STOCK MOVEMENT TRIGGERS
CREATE OR REPLACE FUNCTION public.apply_sale_item_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_branch uuid;
BEGIN
  SELECT branch_id INTO v_branch FROM public.sales WHERE id = NEW.sale_id;
  IF NEW.product_id IS NOT NULL AND v_branch IS NOT NULL THEN
    INSERT INTO public.stock (product_id, branch_id, quantity)
    VALUES (NEW.product_id, v_branch, -NEW.quantity)
    ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = public.stock.quantity - NEW.quantity;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sale_item_stock AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.apply_sale_item_stock();

CREATE OR REPLACE FUNCTION public.apply_return_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.branch_id IS NOT NULL THEN
    INSERT INTO public.stock (product_id, branch_id, quantity)
    VALUES (NEW.product_id, NEW.branch_id, NEW.quantity)
    ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = public.stock.quantity + NEW.quantity;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_return_stock AFTER INSERT ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.apply_return_stock();

-- SEED
INSERT INTO public.branches (id, name, is_main) VALUES
  ('11111111-1111-1111-1111-111111111111','الفرع الرئيسي', true),
  ('22222222-2222-2222-2222-222222222222','فرع السوق العربي', false);

INSERT INTO public.categories (id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','هواتف'),
  ('aaaaaaaa-0000-0000-0000-000000000002','إكسسوارات'),
  ('aaaaaaaa-0000-0000-0000-000000000003','قطع غيار');

INSERT INTO public.products (id, name, barcode, category_id, cost_price, sale_price) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001','iPhone 13','1000001','aaaaaaaa-0000-0000-0000-000000000001', 520000, 600000),
  ('bbbbbbbb-0000-0000-0000-000000000002','Samsung Galaxy A15','1000002','aaaaaaaa-0000-0000-0000-000000000001', 250000, 300000),
  ('bbbbbbbb-0000-0000-0000-000000000003','Type-C Cable','1000003','aaaaaaaa-0000-0000-0000-000000000002', 1200, 2000),
  ('bbbbbbbb-0000-0000-0000-000000000004','شاحن سريع 25W','1000004','aaaaaaaa-0000-0000-0000-000000000002', 6000, 9500),
  ('bbbbbbbb-0000-0000-0000-000000000005','شاشة iPhone 13','1000005','aaaaaaaa-0000-0000-0000-000000000003', 85000, 120000);

INSERT INTO public.stock (product_id, branch_id, quantity) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', 6),
  ('bbbbbbbb-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111', 9),
  ('bbbbbbbb-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111', 46),
  ('bbbbbbbb-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111', 18),
  ('bbbbbbbb-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111', 4),
  ('bbbbbbbb-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222', 20);
-- ==== supabase/migrations/20260822084818_628b7eac-8ccd-427d-8ef4-ea9570b98930.sql ====
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_sale_item_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_return_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
-- ==== supabase/migrations/20260822093803_50bedb40-eae4-431e-b248-3d1c339134e8.sql ====
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
-- ==== supabase/migrations/20260822094039_743c171c-f67e-4305-91eb-445c255a1bdd.sql ====
DROP TRIGGER IF EXISTS trg_prevent_negative_stock ON public.stock;
CREATE TRIGGER trg_prevent_negative_stock
BEFORE UPDATE ON public.stock
FOR EACH ROW EXECUTE FUNCTION public.prevent_negative_stock();
-- ==== supabase/migrations/20260822094109_e6f9fa3a-5737-4685-be3a-88bfcd2df1ec.sql ====
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.sales WHERE invoice_no = 1008;
  IF v_id IS NOT NULL THEN
    UPDATE public.stock st SET quantity = st.quantity + si.quantity
    FROM public.sale_items si
    WHERE si.sale_id = v_id AND st.product_id = si.product_id
      AND st.branch_id = (SELECT branch_id FROM public.sales WHERE id = v_id);
    DELETE FROM public.sale_items WHERE sale_id = v_id;
    DELETE FROM public.sales WHERE id = v_id;
  END IF;
END $$;
-- ==== supabase/migrations/20260823093040_52135656-bd77-4d31-9115-f882ca3a3230.sql ====

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

-- ==== supabase/migrations/20260823094857_1b9bb948-7b3f-4f1d-97d7-fc2ff6c5416b.sql ====
-- profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

-- existing users stay active
UPDATE public.profiles SET is_approved = true WHERE is_approved = false;
UPDATE public.profiles p
   SET username = lower(split_part(u.email, '@', 1))
  FROM auth.users u
 WHERE u.id = p.id AND p.username IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (lower(username)) WHERE username IS NOT NULL;

-- approval helper
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_approved FROM public.profiles WHERE id = _user_id), false);
$$;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated, service_role;

-- branch access now requires an approved account
CREATE OR REPLACE FUNCTION public.can_access_branch(_user_id uuid, _branch uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_approved(_user_id)
     AND (public.is_admin(_user_id)
          OR (_branch IS NOT NULL AND _branch = public.current_branch(_user_id)));
$$;

-- signup handler: username / phone / pending approval
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_branch uuid;
  v_count int;
  v_username text;
BEGIN
  SELECT id INTO v_branch FROM public.branches WHERE is_main ORDER BY created_at LIMIT 1;
  v_username := lower(COALESCE(NULLIF(NEW.raw_user_meta_data->>'username',''), split_part(NEW.email,'@',1)));
  SELECT count(*) INTO v_count FROM public.user_roles;

  INSERT INTO public.profiles (id, full_name, username, phone, branch_id, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), v_username),
    v_username,
    NULLIF(NEW.raw_user_meta_data->>'phone',''),
    v_branch,
    v_count = 0
  );

  IF v_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cashier');
  END IF;
  RETURN NEW;
END;
$$;

-- users cannot approve themselves or change their handle
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
      RAISE EXCEPTION 'غير مسموح بتغيير حالة الاعتماد';
    END IF;
    IF NEW.username IS DISTINCT FROM OLD.username THEN
      RAISE EXCEPTION 'غير مسموح بتغيير اسم المستخدم';
    END IF;
    IF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
      RAISE EXCEPTION 'غير مسموح بتغيير الفرع';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_profile_fields() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();
-- ==== supabase/migrations/20260823094916_b69905eb-e1e0-4049-b56b-bb499fd25e8c.sql ====
REVOKE EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated;
-- ==== supabase/migrations/20260823094928_70b2a7df-04b3-4953-9a98-583a95248bc2.sql ====
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_profile_fields() FROM anon;
-- ==== supabase/migrations/20260825111418_3f4f617e-7e6e-4015-ac89-16b3d1cf399c.sql ====

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _user_id IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN false
  ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _user_id IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN false
  ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','manager')) END;
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _user_id IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN false
  ELSE COALESCE((SELECT is_approved FROM public.profiles WHERE id = _user_id), false) END;
$$;

CREATE OR REPLACE FUNCTION public.current_branch(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _user_id IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN NULL
  ELSE (SELECT branch_id FROM public.profiles WHERE id = _user_id) END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_branch(_user_id uuid, _branch uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _user_id IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN false
  ELSE public.is_approved(_user_id)
       AND (public.is_admin(_user_id)
            OR (_branch IS NOT NULL AND _branch = public.current_branch(_user_id))) END;
$$;

-- ==== supabase/migrations/20260827075158_a8831ffc-9c5c-4934-9360-7f9aa16d19b5.sql ====
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
-- ==== supabase/migrations/20260827113955_e8f78785-a6ce-4946-a8e9-2f0fe79aa3fb.sql ====
-- 1) Remove direct insert paths so all sales go through the validated RPC
DROP POLICY IF EXISTS "insert sales" ON public.sales;
DROP POLICY IF EXISTS "insert sale items" ON public.sale_items;

-- 2) Harden create_sale: validate price integrity against products.sale_price
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
  v_is_admin boolean;
  v_pid uuid;
  v_qty int;
  v_price numeric;
  v_list numeric;
  v_min numeric;
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

  v_is_admin := public.is_admin(v_user);

  FOR it IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := (it->>'quantity')::int;
    v_price := (it->>'unit_price')::numeric;
    v_pid := NULLIF(it->>'product_id','')::uuid;

    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;
    IF v_price IS NULL OR v_price < 0 THEN RAISE EXCEPTION 'سعر غير صالح'; END IF;

    IF v_pid IS NULL THEN
      RAISE EXCEPTION 'يجب اختيار منتج من القائمة';
    END IF;

    SELECT p.sale_price INTO v_list FROM public.products p WHERE p.id = v_pid AND p.is_active;
    IF v_list IS NULL THEN RAISE EXCEPTION 'المنتج غير موجود أو غير مفعّل'; END IF;

    IF v_price > v_list THEN
      RAISE EXCEPTION 'السعر أعلى من سعر البيع المعتمد للمنتج %', COALESCE(it->>'product_name','');
    END IF;

    IF NOT v_is_admin THEN
      v_min := v_list * 0.5;
      IF v_price < v_min THEN
        RAISE EXCEPTION 'الخصم يتجاوز الحد المسموح به للمنتج %', COALESCE(it->>'product_name','');
      END IF;
    END IF;

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
-- ==== supabase/migrations/20260830153155_aa560f1e-b409-4fe1-935d-ad407b13d677.sql ====
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'عام',
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payment_method payment_method NOT NULL DEFAULT 'cash',
  notes text,
  branch_id uuid REFERENCES public.branches(id),
  created_by uuid REFERENCES auth.users(id),
  spent_at date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read expenses" ON public.expenses FOR SELECT TO authenticated
USING ((created_by = auth.uid()) OR public.can_access_branch(auth.uid(), branch_id));

CREATE POLICY "insert expenses" ON public.expenses FOR INSERT TO authenticated
WITH CHECK ((created_by = auth.uid()) AND public.can_access_branch(auth.uid(), branch_id));

CREATE POLICY "admin update expenses" ON public.expenses FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admin delete expenses" ON public.expenses FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX expenses_spent_at_idx ON public.expenses (spent_at DESC);
-- ==== supabase/migrations/20260901120343_c79a6f5e-03d4-49bf-9754-a200ddc1af77.sql ====
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
-- ==== supabase/migrations/20260903090802_6fbed092-3650-4a1f-a49a-a6d2d05c6f6b.sql ====
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price_aed numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true,
  aed_rate numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT app_settings_singleton CHECK (id)
);

GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read app settings" ON public.app_settings
FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin insert app settings" ON public.app_settings
FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admin update app settings" ON public.app_settings
FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (id, aed_rate) VALUES (true, 0) ON CONFLICT (id) DO NOTHING;
-- ==== supabase/migrations/20260903091708_316c7904-d742-474d-9e0f-590b15d17961.sql ====
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sale_price_aed numeric NOT NULL DEFAULT 0;

UPDATE public.products SET cost_price_aed = round(cost_price / 1700.0, 4) WHERE cost_price_aed = 0 AND cost_price > 0;
UPDATE public.products SET sale_price_aed = round(sale_price / 1700.0, 4) WHERE sale_price_aed = 0 AND sale_price > 0;

INSERT INTO public.app_settings (id, aed_rate) VALUES (true, 1700)
ON CONFLICT (id) DO UPDATE SET aed_rate = CASE WHEN public.app_settings.aed_rate > 0 THEN public.app_settings.aed_rate ELSE 1700 END;
-- ==== supabase/migrations/20260903095006_a1e243b5-df06-42ca-bc7b-80db2f0115f1.sql ====
-- Sales and sale_items must only be written through public.create_sale (SECURITY DEFINER)
REVOKE INSERT, UPDATE ON public.sales FROM authenticated, anon;
REVOKE INSERT, UPDATE ON public.sale_items FROM authenticated, anon;

-- app_settings is a singleton config row; deletion is never allowed from the app
REVOKE DELETE ON public.app_settings FROM authenticated, anon;
-- ==== supabase/migrations/20260904144905_995391e5-3971-4f06-81dc-2767bd9336ec.sql ====
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_cost numeric NOT NULL DEFAULT 0;

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

  INSERT INTO public.sale_items (sale_id, product_id, product_name, quantity, unit_price, unit_cost)
  SELECT v_id,
         NULLIF(x->>'product_id','')::uuid,
         x->>'product_name',
         (x->>'quantity')::int,
         (x->>'unit_price')::numeric,
         COALESCE((SELECT p.cost_price FROM public.products p WHERE p.id = NULLIF(x->>'product_id','')::uuid), 0)
  FROM jsonb_array_elements(p_items) x;

  RETURN QUERY SELECT v_id, v_no, v_at;
END;
$function$;
-- ==== drizzle/migrations/0000_restrict_shared_reads_to_approved_staff.sql ====
DROP POLICY IF EXISTS "read categories" ON public.categories;
CREATE POLICY "read categories" ON public.categories FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "read products" ON public.products;
CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "read branches" ON public.branches;
CREATE POLICY "read branches" ON public.branches FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
DROP POLICY IF EXISTS "read app settings" ON public.app_settings;
CREATE POLICY "read app settings" ON public.app_settings FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
-- ==== drizzle/migrations/0001_cashier_scope.sql ====
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
-- ==== drizzle/migrations/0002_separate_products_by_branch.sql ====
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
-- ==== drizzle/migrations/0003_phones_section.sql ====
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
-- ==== drizzle/migrations/0004_restrict_manager_to_own_branch.sql ====
CREATE OR REPLACE FUNCTION public.can_access_branch(_user_id uuid, _branch uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN false
  ELSE public.is_approved(_user_id)
       AND (public.has_role(_user_id, 'owner')
            OR (_branch IS NOT NULL AND _branch = public.current_branch(_user_id))) END;
$$;
-- ==== drizzle/migrations/0005_add_warehouse_role.sql ====
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'warehouse';
-- ==== drizzle/migrations/0006_staff_directory_function.sql ====
CREATE OR REPLACE FUNCTION public.staff_directory()
RETURNS TABLE(id uuid, full_name text, username text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, p.username
  FROM public.profiles p
  WHERE public.is_approved(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.staff_directory() TO authenticated;
-- ==== drizzle/migrations/0007_login_throttle.sql ====
CREATE TABLE public.login_attempts (
  id bigserial PRIMARY KEY,
  username text NOT NULL,
  ip text NOT NULL,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.login_attempts TO service_role;
GRANT USAGE ON SEQUENCE public.login_attempts_id_seq TO service_role;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX login_attempts_user_idx ON public.login_attempts (username, created_at DESC);
CREATE INDEX login_attempts_ip_idx ON public.login_attempts (ip, created_at DESC);

-- Returns seconds the caller must wait before another attempt (0 = allowed).
CREATE OR REPLACE FUNCTION public.login_wait_seconds(_username text, _ip text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u_fail int; ip_fail int; u_last timestamptz; ip_last timestamptz; w_u int := 0; w_ip int := 0;
BEGIN
  SELECT count(*), max(created_at) INTO u_fail, u_last FROM login_attempts
   WHERE username = _username AND NOT success AND created_at > now() - interval '30 minutes'
     AND created_at > coalesce((SELECT max(created_at) FROM login_attempts WHERE username=_username AND success), '-infinity');
  SELECT count(*), max(created_at) INTO ip_fail, ip_last FROM login_attempts
   WHERE ip = _ip AND NOT success AND created_at > now() - interval '30 minutes';
  IF u_fail >= 5 THEN
    w_u := least(900, (power(2, least(u_fail - 5, 10)) * 15)::int) - extract(epoch FROM now() - u_last)::int;
  END IF;
  IF ip_fail >= 20 THEN
    w_ip := least(1800, (power(2, least(ip_fail - 20, 10)) * 30)::int) - extract(epoch FROM now() - ip_last)::int;
  END IF;
  RETURN greatest(0, w_u, w_ip);
END $$;
REVOKE ALL ON FUNCTION public.login_wait_seconds(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_wait_seconds(text, text) TO service_role;
-- ==== drizzle/migrations/0008_audit_log.sql ====
CREATE TABLE public.audit_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  action text NOT NULL,
  row_id text,
  branch_id uuid,
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read audit" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));
CREATE INDEX audit_log_created_idx ON public.audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.write_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb := to_jsonb(COALESCE(NEW, OLD));
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) - 'updated_at' = to_jsonb(OLD) - 'updated_at' THEN RETURN NEW; END IF;
  INSERT INTO public.audit_log (table_name, action, row_id, branch_id, actor_id, old_data, new_data)
  VALUES (TG_TABLE_NAME, TG_OP, COALESCE(r->>'id', r->>'product_id'),
    NULLIF(r->>'branch_id','')::uuid, auth.uid(),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.write_audit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_profiles AFTER UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_products AFTER UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_stock AFTER UPDATE OR DELETE ON public.stock FOR EACH ROW WHEN (current_setting('audit.skip', true) IS DISTINCT FROM 'on') EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_sales AFTER DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_phone_sales AFTER DELETE ON public.phone_sales FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_phones AFTER UPDATE OR DELETE ON public.phones FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_expenses AFTER UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_returns AFTER INSERT ON public.returns FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_app_settings AFTER UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.write_audit();
CREATE TRIGGER audit_branches AFTER INSERT OR UPDATE OR DELETE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.write_audit();
-- ==== drizzle/migrations/0009_allow_trade_in_above_price.sql ====
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
-- ==== drizzle/migrations/0010_add_payment_methods_fawry_okash.sql ====
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'fawry'; ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'okash';
-- ==== drizzle/migrations/0011_phones_aed_prices.sql ====
ALTER TABLE public.phones ADD COLUMN cost_price_aed numeric NOT NULL DEFAULT 0, ADD COLUMN sale_price_aed numeric NOT NULL DEFAULT 0;
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
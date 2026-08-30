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
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
-- Sales and sale_items must only be written through public.create_sale (SECURITY DEFINER)
REVOKE INSERT, UPDATE ON public.sales FROM authenticated, anon;
REVOKE INSERT, UPDATE ON public.sale_items FROM authenticated, anon;

-- app_settings is a singleton config row; deletion is never allowed from the app
REVOKE DELETE ON public.app_settings FROM authenticated, anon;
DROP TRIGGER IF EXISTS trg_prevent_negative_stock ON public.stock;
CREATE TRIGGER trg_prevent_negative_stock
BEFORE UPDATE ON public.stock
FOR EACH ROW EXECUTE FUNCTION public.prevent_negative_stock();
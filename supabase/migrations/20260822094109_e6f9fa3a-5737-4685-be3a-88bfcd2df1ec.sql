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
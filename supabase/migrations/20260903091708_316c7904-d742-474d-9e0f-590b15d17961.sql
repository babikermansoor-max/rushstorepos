ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sale_price_aed numeric NOT NULL DEFAULT 0;

UPDATE public.products SET cost_price_aed = round(cost_price / 1700.0, 4) WHERE cost_price_aed = 0 AND cost_price > 0;
UPDATE public.products SET sale_price_aed = round(sale_price / 1700.0, 4) WHERE sale_price_aed = 0 AND sale_price > 0;

INSERT INTO public.app_settings (id, aed_rate) VALUES (true, 1700)
ON CONFLICT (id) DO UPDATE SET aed_rate = CASE WHEN public.app_settings.aed_rate > 0 THEN public.app_settings.aed_rate ELSE 1700 END;
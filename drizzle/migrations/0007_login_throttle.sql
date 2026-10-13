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
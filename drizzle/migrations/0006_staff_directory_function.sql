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
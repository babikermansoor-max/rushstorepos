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
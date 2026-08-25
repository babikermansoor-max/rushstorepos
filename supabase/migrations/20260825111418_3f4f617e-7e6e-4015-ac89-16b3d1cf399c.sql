
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _user_id IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN false
  ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _user_id IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN false
  ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','manager')) END;
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _user_id IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN false
  ELSE COALESCE((SELECT is_approved FROM public.profiles WHERE id = _user_id), false) END;
$$;

CREATE OR REPLACE FUNCTION public.current_branch(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _user_id IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN NULL
  ELSE (SELECT branch_id FROM public.profiles WHERE id = _user_id) END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_branch(_user_id uuid, _branch uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _user_id IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN false
  ELSE public.is_approved(_user_id)
       AND (public.is_admin(_user_id)
            OR (_branch IS NOT NULL AND _branch = public.current_branch(_user_id))) END;
$$;

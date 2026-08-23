-- profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

-- existing users stay active
UPDATE public.profiles SET is_approved = true WHERE is_approved = false;
UPDATE public.profiles p
   SET username = lower(split_part(u.email, '@', 1))
  FROM auth.users u
 WHERE u.id = p.id AND p.username IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (lower(username)) WHERE username IS NOT NULL;

-- approval helper
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_approved FROM public.profiles WHERE id = _user_id), false);
$$;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated, service_role;

-- branch access now requires an approved account
CREATE OR REPLACE FUNCTION public.can_access_branch(_user_id uuid, _branch uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_approved(_user_id)
     AND (public.is_admin(_user_id)
          OR (_branch IS NOT NULL AND _branch = public.current_branch(_user_id)));
$$;

-- signup handler: username / phone / pending approval
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_branch uuid;
  v_count int;
  v_username text;
BEGIN
  SELECT id INTO v_branch FROM public.branches WHERE is_main ORDER BY created_at LIMIT 1;
  v_username := lower(COALESCE(NULLIF(NEW.raw_user_meta_data->>'username',''), split_part(NEW.email,'@',1)));
  SELECT count(*) INTO v_count FROM public.user_roles;

  INSERT INTO public.profiles (id, full_name, username, phone, branch_id, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), v_username),
    v_username,
    NULLIF(NEW.raw_user_meta_data->>'phone',''),
    v_branch,
    v_count = 0
  );

  IF v_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cashier');
  END IF;
  RETURN NEW;
END;
$$;

-- users cannot approve themselves or change their handle
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
      RAISE EXCEPTION 'غير مسموح بتغيير حالة الاعتماد';
    END IF;
    IF NEW.username IS DISTINCT FROM OLD.username THEN
      RAISE EXCEPTION 'غير مسموح بتغيير اسم المستخدم';
    END IF;
    IF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
      RAISE EXCEPTION 'غير مسموح بتغيير الفرع';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_profile_fields() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();
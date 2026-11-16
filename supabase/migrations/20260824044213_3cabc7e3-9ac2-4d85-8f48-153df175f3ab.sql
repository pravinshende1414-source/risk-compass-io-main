CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION app_private.can_write_research(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','researcher'))
$$;

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_write_research(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_write_research(uuid) TO authenticated, service_role;

DROP POLICY audit_select ON public.audit_logs;
CREATE POLICY audit_select ON public.audit_logs FOR SELECT USING ((user_id = auth.uid()) OR app_private.has_role(auth.uid(), 'admin'));

DROP POLICY disease_delete ON public.disease_predictions;
CREATE POLICY disease_delete ON public.disease_predictions FOR DELETE USING (app_private.has_role(auth.uid(), 'admin'));
DROP POLICY disease_insert ON public.disease_predictions;
CREATE POLICY disease_insert ON public.disease_predictions FOR INSERT WITH CHECK (app_private.can_write_research(auth.uid()));
DROP POLICY disease_update ON public.disease_predictions;
CREATE POLICY disease_update ON public.disease_predictions FOR UPDATE USING (app_private.can_write_research(auth.uid())) WITH CHECK (app_private.can_write_research(auth.uid()));

DROP POLICY measurements_delete ON public.health_measurements;
CREATE POLICY measurements_delete ON public.health_measurements FOR DELETE USING (app_private.has_role(auth.uid(), 'admin'));
DROP POLICY measurements_update ON public.health_measurements;
CREATE POLICY measurements_update ON public.health_measurements FOR UPDATE USING (app_private.can_write_research(auth.uid())) WITH CHECK (app_private.can_write_research(auth.uid()));
DROP POLICY measurements_write ON public.health_measurements;
CREATE POLICY measurements_write ON public.health_measurements FOR INSERT WITH CHECK (app_private.can_write_research(auth.uid()));

DROP POLICY patients_delete ON public.patients;
CREATE POLICY patients_delete ON public.patients FOR DELETE USING (app_private.has_role(auth.uid(), 'admin'));
DROP POLICY patients_insert ON public.patients;
CREATE POLICY patients_insert ON public.patients FOR INSERT WITH CHECK (app_private.can_write_research(auth.uid()));
DROP POLICY patients_update ON public.patients;
CREATE POLICY patients_update ON public.patients FOR UPDATE USING (app_private.can_write_research(auth.uid())) WITH CHECK (app_private.can_write_research(auth.uid()));

DROP POLICY profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING ((id = auth.uid()) OR app_private.has_role(auth.uid(), 'admin'));

DROP POLICY risk_delete ON public.risk_predictions;
CREATE POLICY risk_delete ON public.risk_predictions FOR DELETE USING (app_private.has_role(auth.uid(), 'admin'));
DROP POLICY risk_insert ON public.risk_predictions;
CREATE POLICY risk_insert ON public.risk_predictions FOR INSERT WITH CHECK (app_private.can_write_research(auth.uid()));
DROP POLICY risk_update ON public.risk_predictions;
CREATE POLICY risk_update ON public.risk_predictions FOR UPDATE USING (app_private.can_write_research(auth.uid())) WITH CHECK (app_private.can_write_research(auth.uid()));

DROP POLICY user_roles_select_own ON public.user_roles;
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT USING ((user_id = auth.uid()) OR app_private.has_role(auth.uid(), 'admin'));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.can_write_research(uuid);

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'researcher', 'analyst');

-- Profiles ("users")
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.can_write_research(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'researcher')
  )
$$;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'analyst')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Patients (synthetic / anonymized only)
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_code TEXT NOT NULL UNIQUE,
  age INTEGER NOT NULL CHECK (age >= 0 AND age <= 120),
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other', 'unspecified')),
  height_cm NUMERIC(5,1) CHECK (height_cm > 0 AND height_cm < 260),
  weight_kg NUMERIC(5,1) CHECK (weight_kg > 0 AND weight_kg < 400),
  bmi NUMERIC(4,1),
  blood_pressure TEXT,
  heart_rate INTEGER CHECK (heart_rate > 0 AND heart_rate < 300),
  glucose NUMERIC(6,2),
  cholesterol NUMERIC(6,2),
  smoking_status TEXT CHECK (smoking_status IN ('never', 'former', 'current', 'unknown')),
  exercise_level TEXT CHECK (exercise_level IN ('none', 'low', 'moderate', 'high')),
  family_history BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER patients_updated_at BEFORE UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "patients_select" ON public.patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "patients_insert" ON public.patients FOR INSERT TO authenticated
  WITH CHECK (public.can_write_research(auth.uid()));
CREATE POLICY "patients_update" ON public.patients FOR UPDATE TO authenticated
  USING (public.can_write_research(auth.uid())) WITH CHECK (public.can_write_research(auth.uid()));
CREATE POLICY "patients_delete" ON public.patients FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Health measurements
CREATE TABLE public.health_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  measurement_type TEXT NOT NULL,
  value NUMERIC(10,2) NOT NULL,
  unit TEXT,
  measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_measurements TO authenticated;
GRANT ALL ON public.health_measurements TO service_role;
ALTER TABLE public.health_measurements ENABLE ROW LEVEL SECURITY;
CREATE INDEX health_measurements_patient_idx ON public.health_measurements(patient_id, measurement_date);

CREATE POLICY "measurements_select" ON public.health_measurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "measurements_write" ON public.health_measurements FOR INSERT TO authenticated
  WITH CHECK (public.can_write_research(auth.uid()));
CREATE POLICY "measurements_update" ON public.health_measurements FOR UPDATE TO authenticated
  USING (public.can_write_research(auth.uid())) WITH CHECK (public.can_write_research(auth.uid()));
CREATE POLICY "measurements_delete" ON public.health_measurements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Risk predictions
CREATE TABLE public.risk_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  overall_risk NUMERIC(5,2) NOT NULL CHECK (overall_risk >= 0 AND overall_risk <= 100),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high', 'critical')),
  prediction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_name TEXT NOT NULL DEFAULT 'baseline-placeholder',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_predictions TO authenticated;
GRANT ALL ON public.risk_predictions TO service_role;
ALTER TABLE public.risk_predictions ENABLE ROW LEVEL SECURITY;
CREATE INDEX risk_predictions_patient_idx ON public.risk_predictions(patient_id, prediction_date DESC);

CREATE POLICY "risk_select" ON public.risk_predictions FOR SELECT TO authenticated USING (true);
CREATE POLICY "risk_insert" ON public.risk_predictions FOR INSERT TO authenticated
  WITH CHECK (public.can_write_research(auth.uid()));
CREATE POLICY "risk_update" ON public.risk_predictions FOR UPDATE TO authenticated
  USING (public.can_write_research(auth.uid())) WITH CHECK (public.can_write_research(auth.uid()));
CREATE POLICY "risk_delete" ON public.risk_predictions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Disease predictions
CREATE TABLE public.disease_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID NOT NULL REFERENCES public.risk_predictions(id) ON DELETE CASCADE,
  disease_name TEXT NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disease_predictions TO authenticated;
GRANT ALL ON public.disease_predictions TO service_role;
ALTER TABLE public.disease_predictions ENABLE ROW LEVEL SECURITY;
CREATE INDEX disease_predictions_prediction_idx ON public.disease_predictions(prediction_id);

CREATE POLICY "disease_select" ON public.disease_predictions FOR SELECT TO authenticated USING (true);
CREATE POLICY "disease_insert" ON public.disease_predictions FOR INSERT TO authenticated
  WITH CHECK (public.can_write_research(auth.uid()));
CREATE POLICY "disease_update" ON public.disease_predictions FOR UPDATE TO authenticated
  USING (public.can_write_research(auth.uid())) WITH CHECK (public.can_write_research(auth.uid()));
CREATE POLICY "disease_delete" ON public.disease_predictions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX audit_logs_user_idx ON public.audit_logs(user_id, timestamp DESC);

CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Synthetic demo data (NOT real patient information)
INSERT INTO public.patients
  (patient_code, age, gender, height_cm, weight_kg, bmi, blood_pressure, heart_rate, glucose, cholesterol, smoking_status, exercise_level, family_history)
VALUES
  ('SYN-0001', 34, 'female', 165.0, 58.0, 21.3, '112/72', 68, 88.00, 172.00, 'never', 'high', false),
  ('SYN-0002', 47, 'male', 178.0, 92.0, 29.0, '138/86', 78, 108.00, 214.00, 'former', 'low', true),
  ('SYN-0003', 61, 'male', 172.0, 84.0, 28.4, '148/92', 82, 126.00, 238.00, 'current', 'none', true),
  ('SYN-0004', 29, 'female', 160.0, 54.0, 21.1, '108/70', 65, 84.00, 158.00, 'never', 'moderate', false),
  ('SYN-0005', 55, 'other', 170.0, 78.0, 27.0, '132/84', 74, 101.00, 205.00, 'never', 'low', false),
  ('SYN-0006', 68, 'female', 158.0, 71.0, 28.4, '152/94', 86, 134.00, 246.00, 'former', 'none', true),
  ('SYN-0007', 41, 'male', 181.0, 79.0, 24.1, '122/78', 70, 92.00, 186.00, 'never', 'high', false),
  ('SYN-0008', 37, 'female', 167.0, 82.0, 29.4, '129/83', 76, 105.00, 199.00, 'current', 'low', true),
  ('SYN-0009', 52, 'male', 175.0, 88.0, 28.7, '141/88', 80, 118.00, 227.00, 'current', 'none', false),
  ('SYN-0010', 24, 'female', 163.0, 55.0, 20.7, '106/68', 62, 82.00, 149.00, 'never', 'high', false),
  ('SYN-0011', 59, 'female', 161.0, 68.0, 26.2, '136/85', 77, 112.00, 218.00, 'former', 'moderate', true),
  ('SYN-0012', 45, 'male', 176.0, 74.0, 23.9, '124/79', 72, 95.00, 191.00, 'never', 'moderate', false);

INSERT INTO public.health_measurements (patient_id, measurement_type, value, unit, measurement_date)
SELECT p.id, m.mtype, m.mvalue, m.munit, CURRENT_DATE - (m.days_ago || ' days')::interval
FROM public.patients p
CROSS JOIN LATERAL (
  VALUES
    ('heart_rate', p.heart_rate::numeric, 'bpm', 1),
    ('glucose', p.glucose, 'mg/dL', 7),
    ('cholesterol', p.cholesterol, 'mg/dL', 14),
    ('weight', p.weight_kg, 'kg', 21)
) AS m(mtype, mvalue, munit, days_ago);

INSERT INTO public.risk_predictions (patient_id, overall_risk, risk_level, model_name)
SELECT p.id,
  LEAST(95, GREATEST(4, (p.age * 0.6 + (p.bmi - 20) * 2 + CASE WHEN p.family_history THEN 8 ELSE 0 END)))::numeric(5,2),
  CASE
    WHEN (p.age * 0.6 + (p.bmi - 20) * 2) < 25 THEN 'low'
    WHEN (p.age * 0.6 + (p.bmi - 20) * 2) < 45 THEN 'moderate'
    WHEN (p.age * 0.6 + (p.bmi - 20) * 2) < 65 THEN 'high'
    ELSE 'critical'
  END,
  'synthetic-demo-heuristic'
FROM public.patients p;

INSERT INTO public.disease_predictions (prediction_id, disease_name, risk_score)
SELECT r.id, d.name, LEAST(99, GREATEST(2, r.overall_risk * d.factor))::numeric(5,2)
FROM public.risk_predictions r
CROSS JOIN (VALUES ('Cardiovascular disease', 1.0), ('Type 2 diabetes', 0.8), ('Hypertension', 0.9)) AS d(name, factor);

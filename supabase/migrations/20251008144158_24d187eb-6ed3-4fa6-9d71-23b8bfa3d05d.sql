-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('PATIENT', 'HOSPITAL_STAFF', 'AMBULANCE_DRIVER', 'ADMIN');

-- Create enum for ambulance status
CREATE TYPE public.ambulance_status AS ENUM ('AVAILABLE', 'EN_ROUTE', 'BUSY', 'OFFLINE', 'MAINTENANCE');

-- Create enum for request status
CREATE TYPE public.request_status AS ENUM ('REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'CANCELLED');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create hospitals table
CREATE TABLE public.hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  phone TEXT NOT NULL,
  capacity INTEGER DEFAULT 50,
  available_beds INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ambulances table
CREATE TABLE public.ambulances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number TEXT NOT NULL UNIQUE,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  driver_name TEXT,
  driver_phone TEXT,
  status ambulance_status DEFAULT 'AVAILABLE',
  current_latitude DECIMAL(10, 8),
  current_longitude DECIMAL(11, 8),
  hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create medical_profiles table
CREATE TABLE public.medical_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  blood_group TEXT,
  allergies TEXT[],
  chronic_conditions TEXT[],
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create requests table
CREATE TABLE public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pickup_latitude DECIMAL(10, 8) NOT NULL,
  pickup_longitude DECIMAL(11, 8) NOT NULL,
  pickup_address TEXT,
  hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  assigned_ambulance_id UUID REFERENCES public.ambulances(id) ON DELETE SET NULL,
  status request_status DEFAULT 'REQUESTED',
  eta_seconds INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ambulance_locations table for GPS tracking
CREATE TABLE public.ambulance_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambulance_id UUID REFERENCES public.ambulances(id) ON DELETE CASCADE NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  speed DECIMAL(5, 2),
  heading DECIMAL(5, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulance_locations ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'ADMIN'));

-- RLS Policies for hospitals
CREATE POLICY "Anyone can view hospitals" ON public.hospitals FOR SELECT USING (true);
CREATE POLICY "Staff and admins can manage hospitals" ON public.hospitals FOR ALL USING (
  public.has_role(auth.uid(), 'ADMIN') OR public.has_role(auth.uid(), 'HOSPITAL_STAFF')
);

-- RLS Policies for ambulances
CREATE POLICY "Anyone can view ambulances" ON public.ambulances FOR SELECT USING (true);
CREATE POLICY "Drivers can update their ambulance" ON public.ambulances FOR UPDATE USING (
  auth.uid() = driver_id OR public.has_role(auth.uid(), 'HOSPITAL_STAFF') OR public.has_role(auth.uid(), 'ADMIN')
);
CREATE POLICY "Staff and admins can manage ambulances" ON public.ambulances FOR ALL USING (
  public.has_role(auth.uid(), 'ADMIN') OR public.has_role(auth.uid(), 'HOSPITAL_STAFF')
);

-- RLS Policies for medical_profiles
CREATE POLICY "Patients can view own medical profile" ON public.medical_profiles FOR SELECT USING (auth.uid() = patient_id);
CREATE POLICY "Staff can view all medical profiles" ON public.medical_profiles FOR SELECT USING (
  public.has_role(auth.uid(), 'HOSPITAL_STAFF') OR public.has_role(auth.uid(), 'AMBULANCE_DRIVER') OR public.has_role(auth.uid(), 'ADMIN')
);
CREATE POLICY "Patients can manage own medical profile" ON public.medical_profiles FOR ALL USING (auth.uid() = patient_id);

-- RLS Policies for requests
CREATE POLICY "Patients can view own requests" ON public.requests FOR SELECT USING (auth.uid() = patient_id);
CREATE POLICY "Staff can view all requests" ON public.requests FOR SELECT USING (
  public.has_role(auth.uid(), 'HOSPITAL_STAFF') OR public.has_role(auth.uid(), 'AMBULANCE_DRIVER') OR public.has_role(auth.uid(), 'ADMIN')
);
CREATE POLICY "Patients can create requests" ON public.requests FOR INSERT WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "Staff can update requests" ON public.requests FOR UPDATE USING (
  public.has_role(auth.uid(), 'HOSPITAL_STAFF') OR public.has_role(auth.uid(), 'ADMIN')
);

-- RLS Policies for ambulance_locations
CREATE POLICY "Anyone can view ambulance locations" ON public.ambulance_locations FOR SELECT USING (true);
CREATE POLICY "Drivers can insert their locations" ON public.ambulance_locations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.ambulances WHERE id = ambulance_id AND driver_id = auth.uid())
);
CREATE POLICY "Staff can manage locations" ON public.ambulance_locations FOR ALL USING (
  public.has_role(auth.uid(), 'HOSPITAL_STAFF') OR public.has_role(auth.uid(), 'ADMIN')
);

-- Enable realtime for ambulance locations and requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.ambulance_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ambulances;

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ambulances_updated_at BEFORE UPDATE ON public.ambulances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_medical_profiles_updated_at BEFORE UPDATE ON public.medical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_requests_updated_at BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone'
  );
  
  -- Default role is PATIENT
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'PATIENT');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert seed data for hospitals
INSERT INTO public.hospitals (name, address, latitude, longitude, phone, capacity, available_beds) VALUES
  ('City General Hospital', '123 Main St, Downtown', 40.7128, -74.0060, '+1-555-0101', 100, 85),
  ('Mercy Medical Center', '456 Oak Ave, Midtown', 40.7589, -73.9851, '+1-555-0102', 150, 120),
  ('St. Mary''s Hospital', '789 Pine Rd, Uptown', 40.7831, -73.9712, '+1-555-0103', 80, 60),
  ('Community Health Center', '321 Elm St, Westside', 40.7489, -73.9680, '+1-555-0104', 60, 45),
  ('Memorial Hospital', '654 Maple Dr, Eastside', 40.7282, -73.9942, '+1-555-0105', 120, 95);

-- Insert seed data for ambulances
INSERT INTO public.ambulances (vehicle_number, driver_name, driver_phone, status, current_latitude, current_longitude) VALUES
  ('AMB-001', 'John Smith', '+1-555-1001', 'AVAILABLE', 40.7128, -74.0060),
  ('AMB-002', 'Sarah Johnson', '+1-555-1002', 'AVAILABLE', 40.7589, -73.9851),
  ('AMB-003', 'Mike Wilson', '+1-555-1003', 'AVAILABLE', 40.7831, -73.9712),
  ('AMB-004', 'Emily Brown', '+1-555-1004', 'EN_ROUTE', 40.7489, -73.9680),
  ('AMB-005', 'David Lee', '+1-555-1005', 'AVAILABLE', 40.7282, -73.9942),
  ('AMB-006', 'Lisa Garcia', '+1-555-1006', 'AVAILABLE', 40.7412, -73.9897),
  ('AMB-007', 'Robert Martinez', '+1-555-1007', 'OFFLINE', 40.7580, -73.9855),
  ('AMB-008', 'Jennifer Taylor', '+1-555-1008', 'AVAILABLE', 40.7200, -74.0000);
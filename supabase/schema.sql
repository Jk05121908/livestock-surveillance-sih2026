-- Supabase schema for livestock-surveillance-sih2026
-- Run this in Supabase SQL Editor (https://supabase.com Dashboard > SQL Editor)
-- Project: free tier is fine
-- After running, create Storage bucket 'report-photos' (public) via Storage > New bucket

-- Enable UUID generation (pgcrypto is usually enabled, but ensure)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE farmers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  village TEXT,
  block TEXT,
  herd_size INT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID REFERENCES farmers(id),
  animal_type TEXT NOT NULL,
  symptoms JSONB,
  notes TEXT,
  photo_url TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  risk_level TEXT DEFAULT 'pending',
  escalated BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE vets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  village TEXT,
  block TEXT,
  specialty TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id),
  assigned_vet_id UUID REFERENCES vets(id),
  status TEXT DEFAULT 'assigned',
  confirmed_disease TEXT,
  treatment TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE vaccinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id TEXT,
  farmer_id UUID REFERENCES farmers(id),
  vaccine_type TEXT,
  date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Storage bucket 'report-photos' (public) must be created manually:
-- Supabase Dashboard > Storage > New bucket > Name: report-photos, Public: true
-- Alternatively via SQL (if allowed):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('report-photos', 'report-photos', true)
-- ON CONFLICT (id) DO NOTHING;

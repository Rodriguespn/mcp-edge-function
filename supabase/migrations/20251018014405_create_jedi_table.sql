CREATE TABLE jedi (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  rank TEXT,
  lightsaber_color TEXT,
  force_sensitivity INTEGER CHECK (force_sensitivity >= 0 AND force_sensitivity <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add an index on name for faster lookups
CREATE INDEX idx_jedi_name ON jedi(name);

-- Add RLS (Row Level Security) policies
ALTER TABLE jedi ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access" ON jedi
  FOR SELECT
  USING (true);

-- Allow authenticated users to insert
CREATE POLICY "Allow authenticated insert" ON jedi
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update their own records
CREATE POLICY "Allow authenticated update" ON jedi
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to delete
CREATE POLICY "Allow authenticated delete" ON jedi
  FOR DELETE
  USING (auth.role() = 'authenticated');

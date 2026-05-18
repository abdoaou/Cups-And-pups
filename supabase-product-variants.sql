-- Run in Supabase SQL editor (or: node run-supabase-migration.js)

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT NULL;

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active';

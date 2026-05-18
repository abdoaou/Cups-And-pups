-- Run in Supabase SQL editor so GET /api/v1/product-variants works.
-- Fixes: column "attributes" does not exist

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT NULL;

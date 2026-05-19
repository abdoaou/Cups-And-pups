-- Category id 2 is the coffee MENU parent (MENU_PARENT_CATEGORY_ID=2).
-- It was wrongly named "Iced Coffee" with parent_id = 2 (self). This fixes that.

BEGIN;

UPDATE categories
SET
  name = 'Coffee',
  slug = 'coffee',
  parent_id = NULL,
  description = COALESCE(NULLIF(TRIM(description), ''), 'Coffee menu')
WHERE id = 2;

INSERT INTO categories (parent_id, name, slug, description, status)
SELECT 2, 'Iced Coffee', 'iced-coffee', 'Cold coffee and iced drinks', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE parent_id = 2 AND slug = 'iced-coffee' AND id <> 2
);

UPDATE products p
SET category_id = iced.id
FROM categories iced
WHERE iced.parent_id = 2
  AND iced.slug = 'iced-coffee'
  AND iced.id <> 2
  AND p.category_id = 2
  AND (
    p.name ILIKE '%iced%'
    OR p.name ILIKE '%cold brew%'
    OR COALESCE(p.slug, '') ILIKE '%iced%'
  );

COMMIT;

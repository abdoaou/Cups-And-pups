const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const root = __dirname;
const envText = fs.readFileSync(path.join(root, "railway.env"), "utf8");
const match = envText.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("DATABASE_URL not found in railway.env");
  process.exit(1);
}

const statements = [
  fs.readFileSync(path.join(root, "supabase-product-variants.sql"), "utf8"),
  `ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;`,
  `ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`,
  `ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`,
  `ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active';`
];

(async () => {
  const client = new Client({ connectionString: match[1].trim() });
  await client.connect();

  for (const sql of statements) {
    await client.query(sql);
  }

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants'
    ORDER BY ordinal_position
  `);
  console.log("product_variants columns:", cols.rows.map((r) => r.column_name).join(", "));
  await client.end();
})().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});

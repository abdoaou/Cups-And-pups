const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const root = __dirname;
const envPath = path.join(root, "railway.env");
if (!fs.existsSync(envPath)) {
  console.error("railway.env not found — add DATABASE_URL to run this fix.");
  process.exit(1);
}

const envText = fs.readFileSync(envPath, "utf8");
const match = envText.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("DATABASE_URL not found in railway.env");
  process.exit(1);
}

const sql = fs.readFileSync(path.join(root, "supabase-fix-coffee-parent.sql"), "utf8");

(async () => {
  const client = new Client({ connectionString: match[1].trim() });
  await client.connect();
  await client.query(sql);

  const rows = await client.query(
    `SELECT id, name, parent_id, slug FROM categories ORDER BY id`
  );
  console.log("Categories after fix:");
  for (const r of rows.rows) {
    console.log(`  #${r.id}  ${r.name}  parent_id=${r.parent_id ?? "null"}  (${r.slug})`);
  }

  await client.end();
  console.log("Done.");
})().catch((err) => {
  console.error("Fix failed:", err.message);
  process.exit(1);
});

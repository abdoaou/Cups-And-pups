const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envText = fs.readFileSync(path.join(__dirname, "railway.env"), "utf8");
const match = envText.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("DATABASE_URL not found in railway.env");
  process.exit(1);
}

/** product_id → [{ name, price, stock }] */
const SAMPLES = {
  76: [
    { name: "Medium", price: 2.0, stock: 50 },
    { name: "Large", price: 3.0, stock: 50 }
  ],
  77: [
    { name: "Medium", price: 3.0, stock: 50 },
    { name: "Large", price: 4.0, stock: 50 }
  ]
};

(async () => {
  const client = new Client({ connectionString: match[1].trim() });
  await client.connect();

  for (const [productId, sizes] of Object.entries(SAMPLES)) {
    await client.query(
      `DELETE FROM product_variants WHERE product_id = $1`,
      [productId]
    );
    for (const s of sizes) {
      const sku = `p${productId}-${s.name.toLowerCase().replace(/\s+/g, "-")}`;
      await client.query(
        `INSERT INTO product_variants (product_id, name, sku, price, stock, status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [productId, s.name, sku, s.price, s.stock]
      );
    }
    console.log(`Product ${productId}: ${sizes.map((s) => s.name).join(", ")}`);
  }

  await client.end();
  console.log("Done. Refresh the menu and open Espresso or Double Espresso.");
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

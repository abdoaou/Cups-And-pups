const { Pool } = require("pg");

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

function rowToJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    website_id: row.website_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    image: row.image,
    status: row.status === true ? "active" : "inactive",
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}

function websiteIdFrom(req) {
  return Number(req.query.websiteId || req.headers["x-website-id"] || 0) || null;
}

function mountParentCategoriesRoutes(app) {
  const db = getPool();
  if (!db) return false;

  app.get("/api/v1/parent-categories", async (req, res) => {
    try {
      const wid = websiteIdFrom(req);
      const params = [];
      let sql = `SELECT * FROM parent_categories`;
      if (wid) {
        sql += ` WHERE website_id = $1`;
        params.push(wid);
      }
      sql += ` ORDER BY id`;
      const { rows } = await db.query(sql, params);
      res.json({
        success: true,
        message: "Parent categories fetched successfully",
        data: rows.map(rowToJson)
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/v1/parent-categories/:id", async (req, res) => {
    try {
      const { rows } = await db.query(`SELECT * FROM parent_categories WHERE id = $1`, [
        Number(req.params.id)
      ]);
      if (!rows[0]) {
        return res.status(404).json({ success: false, message: "Parent category not found" });
      }
      res.json({
        success: true,
        message: "Parent category fetched successfully",
        data: rowToJson(rows[0])
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/v1/parent-categories", requireAuth, async (req, res) => {
    try {
      const { name, slug, description, image, status, website_id } = req.body || {};
      if (!String(name || "").trim()) {
        return res.status(400).json({ success: false, message: "Name is required" });
      }
      const wid = Number(website_id || websiteIdFrom(req) || 1);
      const active = status !== "inactive" && status !== false;
      const { rows } = await db.query(
        `INSERT INTO parent_categories (website_id, name, slug, description, image, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          wid,
          String(name).trim(),
          String(slug || name)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-"),
          description || null,
          image || null,
          active
        ]
      );
      res.status(201).json({
        success: true,
        message: "Parent category created",
        data: rowToJson(rows[0])
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put("/api/v1/parent-categories/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, slug, description, image, status } = req.body || {};
      const active = status !== "inactive" && status !== false;
      const { rows } = await db.query(
        `UPDATE parent_categories
         SET name = COALESCE($2, name),
             slug = COALESCE($3, slug),
             description = $4,
             image = $5,
             status = $6,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          name != null ? String(name).trim() : null,
          slug != null ? String(slug).trim() : null,
          description ?? null,
          image ?? null,
          active
        ]
      );
      if (!rows[0]) {
        return res.status(404).json({ success: false, message: "Parent category not found" });
      }
      res.json({
        success: true,
        message: "Parent category updated",
        data: rowToJson(rows[0])
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete("/api/v1/parent-categories/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const inUse = await db.query(
        `SELECT COUNT(*)::int AS n FROM categories WHERE parent_id = $1`,
        [id]
      );
      if (inUse.rows[0]?.n > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete: subcategories still use this parent"
        });
      }
      const { rowCount } = await db.query(`DELETE FROM parent_categories WHERE id = $1`, [id]);
      if (!rowCount) {
        return res.status(404).json({ success: false, message: "Parent category not found" });
      }
      res.json({ success: true, message: "Parent category deleted" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return true;
}

module.exports = { mountParentCategoriesRoutes, getPool };

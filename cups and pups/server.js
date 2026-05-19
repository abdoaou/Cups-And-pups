require("dotenv").config();
const fs = require("fs");
const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { mountParentCategoriesRoutes } = require("./lib/parent-categories-db");

if (!process.env.DATABASE_URL) {
  const railwayEnv = path.join(__dirname, "..", "railway.env");
  if (fs.existsSync(railwayEnv)) require("dotenv").config({ path: railwayEnv });
}

const app = express();
const port = Number(process.env.PORT || 3000);
const adminPath = process.env.ADMIN_PATH || "/hidden-admin";

app.use(express.json({ limit: "2mb" }));
const parentCategoriesFromDb = mountParentCategoriesRoutes(app);
function servedFromDatabase(pathname) {
  return (
    parentCategoriesFromDb &&
    (pathname === "/api/v1/parent-categories" || pathname.startsWith("/api/v1/parent-categories/"))
  );
}

/** Forward /api and /uploads to Railway (keep full path — mounting at /api strips it by default). */
const apiTarget = (process.env.API_PROXY_TARGET || "https://abnodejsapi-production.up.railway.app").replace(/\/$/, "");
app.use(
  createProxyMiddleware({
    target: apiTarget,
    changeOrigin: true,
    pathFilter: (pathname) => {
      if (servedFromDatabase(pathname)) return false;
      return (
        pathname === "/api" ||
        pathname.startsWith("/api/") ||
        pathname.startsWith("/uploads")
      );
    }
  })
);

app.use(express.static(path.join(__dirname)));

app.get(adminPath, (_, res) => {
  res.sendFile(path.join(__dirname, "hidden-admin.html"));
});

app.get("*", (req, res, next) => {
  if (req.path.includes(".")) return next();
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Static server running at http://localhost:${port}`);
  console.log(`Hidden admin route: ${adminPath}`);
  console.log(`Proxying /api and /uploads to ${apiTarget}`);
  if (parentCategoriesFromDb) {
    console.log("Parent categories: serving from parent_categories table (DATABASE_URL)");
  }
});

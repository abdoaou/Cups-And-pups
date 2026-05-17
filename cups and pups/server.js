require("dotenv").config();
const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const port = Number(process.env.PORT || 3000);
const adminPath = process.env.ADMIN_PATH || "/hidden-admin";

/** Forward /api and /uploads to Railway (keep full path — mounting at /api strips it by default). */
const apiTarget = (process.env.API_PROXY_TARGET || "https://abnodejsapi-production.up.railway.app").replace(/\/$/, "");
app.use(
  createProxyMiddleware({
    target: apiTarget,
    changeOrigin: true,
    pathFilter: (pathname) =>
      pathname === "/api" ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/uploads")
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
});

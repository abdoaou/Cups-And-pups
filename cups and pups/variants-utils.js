/**
 * Load rows from product_variants and merge by product_id.
 * Requires AbNodejsApi GET /api/v1/product-variants (see supabase-product-variants.sql).
 */
(function () {
  const VARIANT_SIZE_ORDER = ["small", "medium", "large"];

  function field(item, ...keys) {
    for (const key of keys) {
      if (item[key] !== undefined && item[key] !== null) return item[key];
    }
    return undefined;
  }

  function variantSortKey(name) {
    const n = String(name || "").toLowerCase();
    const idx = VARIANT_SIZE_ORDER.findIndex((s) => n.includes(s));
    return idx >= 0 ? idx : VARIANT_SIZE_ORDER.length + n.charCodeAt(0);
  }

  function parseAttributes(raw) {
    if (raw === null || raw === undefined || raw === "") return {};
    if (typeof raw === "object" && !Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  function variantProductId(row) {
    return field(row, "product_id", "productId", "ProductId");
  }

  function normalizeVariantFromRow(v) {
    const name = String(field(v, "name", "Name", "variant_name", "variantName") || "").trim();
    if (!name) return null;
    const stock = Number(field(v, "stock", "Stock") ?? 0);
    const price = Number(field(v, "sale_price", "salePrice", "SalePrice", "price", "Price") || 0);
    const variables = parseAttributes(field(v, "attributes", "Attributes", "variables", "Variables"));
    const status = String(field(v, "status", "Status") || "active").toLowerCase();
    return {
      id: String(field(v, "id", "Id") ?? name.toLowerCase().replace(/\s+/g, "-")),
      name,
      price,
      stock,
      sku: field(v, "sku", "Sku", "SKU") || "",
      variables,
      soldOut: stock <= 0 || status === "inactive" || status === "sold_out"
    };
  }

  function listVariantItems(data) {
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data)) return data;
    return [];
  }

  function formatVariantLabel(v, moneyFormatter) {
    const fmt = moneyFormatter || ((n) => `$${Number(n || 0).toFixed(2)}`);
    const vars = v.variables || {};
    const extra = Object.entries(vars)
      .filter(([, val]) => val !== null && val !== undefined && String(val).trim() !== "")
      .map(([key, val]) => `${key}: ${val}`)
      .join(", ");
    const pricePart = fmt(v.price);
    return extra ? `${v.name} (${extra}) — ${pricePart}` : `${v.name} — ${pricePart}`;
  }

  async function fetchProductVariantsMap(request, options = {}) {
    const map = new Map();
    const productId = options.productId;
    const query = new URLSearchParams({ limit: String(options.limit || 500) });
    if (productId) query.set("product_id", String(productId));

    try {
      const data = await request(`/product-variants?${query.toString()}`);
      const items = listVariantItems(data);
      for (const row of items) {
        const pid = variantProductId(row);
        if (!pid) continue;
        const normalized = normalizeVariantFromRow(row);
        if (!normalized) continue;
        const key = String(pid);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(normalized);
      }
      for (const list of map.values()) {
        list.sort((a, b) => variantSortKey(a.name) - variantSortKey(b.name));
      }
    } catch (err) {
      console.warn("product_variants:", err.message || err);
    }
    return map;
  }

  function mergeIntoProduct(product, variantMap) {
    const fromTable = variantMap.get(String(product.id)) || [];
    const embedded = Array.isArray(product.variants) ? product.variants : [];
    const variants = embedded.length ? embedded : fromTable;
    const soldOut =
      variants.length > 0
        ? variants.every((v) => v.soldOut)
        : Boolean(product.soldOut);
    return {
      ...product,
      variants,
      hasVariants: variants.length > 1,
      soldOut
    };
  }

  async function syncProductVariants(apiFn, productId, variants) {
    const pid = Number(productId);
    if (!pid) return;

    let existing = [];
    try {
      const data = await apiFn(`/product-variants?product_id=${pid}`);
      existing = listVariantItems(data);
    } catch {
      existing = [];
    }

    for (const row of existing) {
      const id = field(row, "id", "Id");
      if (id) await apiFn(`/product-variants/${id}`, { method: "DELETE" });
    }

    for (const v of variants) {
      const name = String(v.name || "").trim();
      if (!name) continue;
      await apiFn("/product-variants", {
        method: "POST",
        body: JSON.stringify({
          product_id: pid,
          name,
          price: Number(v.price) || 0,
          stock: Number(v.stock) ?? 0,
          sku: v.sku || null,
          status: "active"
        })
      });
    }
  }

  window.ProductVariants = {
    field,
    variantSortKey,
    normalizeVariantFromRow,
    fetchProductVariantsMap,
    mergeIntoProduct,
    syncProductVariants,
    formatVariantLabel
  };
})();

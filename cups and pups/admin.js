const state = {
  token: localStorage.getItem("admin_token") || "",
  currentUser: JSON.parse(localStorage.getItem("admin_user") || "null"),
  products: [],
  categories: [],
  parentCategories: [],
  productPage: 1,
  productPageSize: 10,
  productTotal: 0,
  productSearch: "",
  productStatus: "",
  modalSaveHandler: null
};

const RAILWAY_API_URL = "https://abnodejsapi-production.up.railway.app";
const TAB_TITLES = {
  dashboard: ["Dashboard", "Overview of your cafe catalog"],
  products: ["Products", "Create, edit, and delete menu items with size variants"],
  parentCategories: [
    "Parent categories",
    "Coffee menu (id 2), Pet shop (id 3) — subcategories link to these"
  ],
  categories: ["Subcategories", "Hot Coffee, Desserts, etc. — each must have a parent menu"]
};

function defaultApiBaseUrl() {
  if (window.API_BASE_URL) return String(window.API_BASE_URL).replace(/\/$/, "");
  const stored = localStorage.getItem("petcafe_api_base");
  if (stored) return stored.replace(/\/$/, "");
  return RAILWAY_API_URL;
}

const API_BASE_URL = (window.API_BASE_URL || localStorage.getItem("petcafe_api_base") || defaultApiBaseUrl()).replace(/\/$/, "");
const API_PREFIX = (window.API_PREFIX || localStorage.getItem("petcafe_api_prefix") || "/api/v1").replace(/\/$/, "");
const WEBSITE_ID = Number(window.WEBSITE_ID || localStorage.getItem("petcafe_website_id") || 1);
const MENU_PARENT_CATEGORY_ID = Number(window.MENU_PARENT_CATEGORY_ID || 2);
const PETS_PARENT_CATEGORY_ID = Number(window.PETS_PARENT_CATEGORY_ID || 3);

const el = {
  loginView: document.getElementById("loginView"),
  dashboardView: document.getElementById("dashboardView"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  logoutBtn: document.getElementById("logoutBtn"),
  sidebarUser: document.getElementById("sidebarUser"),
  websiteBadge: document.getElementById("websiteBadge"),
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),
  dashboardTab: document.getElementById("dashboardTab"),
  productsTab: document.getElementById("productsTab"),
  parentCategoriesTab: document.getElementById("parentCategoriesTab"),
  categoriesTab: document.getElementById("categoriesTab"),
  toastHost: document.getElementById("toastHost"),
  crudModal: document.getElementById("crudModal"),
  crudModalTitle: document.getElementById("crudModalTitle"),
  crudModalBody: document.getElementById("crudModalBody"),
  crudModalSave: document.getElementById("crudModalSave")
};

function apiUrl(endpoint) {
  return `${API_BASE_URL}${API_PREFIX}${endpoint}`;
}

function websiteIdOf() {
  if (WEBSITE_ID) return WEBSITE_ID;
  const fromUser = Number(state.currentUser?.websiteId ?? state.currentUser?.website_id ?? 0);
  if (fromUser) return fromUser;
  return Number(localStorage.getItem("admin_website_id") || 0);
}

function withWebsiteQuery(path) {
  const wid = websiteIdOf();
  if (!wid) return path;
  return `${path}${path.includes("?") ? "&" : "?"}websiteId=${wid}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function field(item, ...keys) {
  for (const k of keys) {
    if (item[k] !== undefined && item[k] !== null) return item[k];
  }
  return undefined;
}

function listItems(data) {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data)) return data;
  return [];
}

function listMeta(data) {
  return data?.meta || data?.pagination || {};
}

function mediaUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  if (raw.startsWith("/")) return `${API_BASE_URL}${raw}`;
  return raw;
}

/** Trim form text; always include in JSON. */
function formOptionalField(id) {
  return String(document.getElementById(id)?.value ?? "").trim();
}

/** API clears image when body has "image": "" or null; omitting image keeps the existing URL. */
function formImageField(id) {
  const value = formOptionalField(id);
  return value === "" ? "" : value;
}

function fmtDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function fmtMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function showToast(message, type = "info") {
  if (!el.toastHost) return;
  const node = document.createElement("div");
  node.className = `toast toast-${type}`;
  node.textContent = message;
  el.toastHost.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

function syncTokenFromStorage() {
  state.token = localStorage.getItem("admin_token") || state.token || "";
}

function extractTokenFromResponse(raw) {
  if (!raw || typeof raw !== "object") return "";
  return raw.accessToken || raw.token || raw.data?.accessToken || raw.data?.token || "";
}

function extractAdminFromResponse(raw) {
  if (!raw || typeof raw !== "object") return null;
  return raw.admin || raw.user || raw.data?.admin || raw.data?.user || null;
}

function clearSession(message = "") {
  state.token = "";
  state.currentUser = null;
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  localStorage.removeItem("admin_website_id");
  el.dashboardView?.classList.add("hidden");
  el.loginView?.classList.remove("hidden");
  if (message) el.loginError.textContent = message;
}

function requireAuth() {
  syncTokenFromStorage();
  if (!state.token) {
    throw new Error("You must be logged in to save product sizes.");
  }
}

async function api(path, options = {}) {
  syncTokenFromStorage();
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const wid = websiteIdOf();
  if (wid && !path.startsWith("/auth/")) headers["x-website-id"] = String(wid);

  const response = await fetch(apiUrl(path), { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  let raw = null;
  if (contentType.includes("application/json")) {
    raw = await response.json();
  }

  if (response.status === 401) {
    clearSession("Session expired. Please log in again.");
    throw new Error("Unauthorized — please log in again.");
  }

  if (!response.ok) {
    const msg = raw?.message || raw?.error || `Request failed (${response.status})`;
    const validation =
      Array.isArray(raw?.errors) && raw.errors.length
        ? `: ${raw.errors.map((e) => e.msg || e.message).join(", ")}`
        : "";
    throw new Error(msg + validation);
  }

  if (raw && typeof raw === "object" && "success" in raw && "data" in raw) return raw.data;
  return raw;
}

function normalizeCategory(row) {
  return {
    id: field(row, "id", "Id"),
    name: field(row, "name", "Name") || "",
    slug: field(row, "slug", "Slug") || "",
    description: field(row, "description", "Description") || "",
    image: mediaUrl(field(row, "image", "Image", "image_url")),
    parentId: field(row, "parent_id", "parentId", "ParentCategoryId") ?? null,
    status: String(field(row, "status", "Status") ?? "active")
  };
}

function normalizeParentCategory(row) {
  const statusRaw = field(row, "status", "Status");
  const active = statusRaw === true || statusRaw === "active" || statusRaw === 1;
  return {
    id: field(row, "id", "Id"),
    name: field(row, "name", "Name") || "",
    slug: field(row, "slug", "Slug") || "",
    description: field(row, "description", "Description") || "",
    image: mediaUrl(field(row, "image", "Image")),
    websiteId: field(row, "website_id", "websiteId", "WebsiteId"),
    status: active ? "active" : "inactive"
  };
}

function normalizeVariantRow(v) {
  if (window.ProductVariants) return window.ProductVariants.normalizeVariantFromRow(v);
  const name = String(field(v, "name", "Name") || "").trim();
  if (!name) return null;
  return {
    id: field(v, "id", "Id"),
    name,
    price: Number(field(v, "sale_price", "salePrice", "price", "Price") || 0),
    stock: Number(field(v, "stock", "Stock") ?? 0),
    sku: field(v, "sku", "Sku", "SKU") || "",
    variables: {}
  };
}

function normalizeProduct(row) {
  const variantsRaw =
    field(row, "variants", "Variants", "product_variants", "productVariants", "product_varients") || [];
  const variants = Array.isArray(variantsRaw)
    ? variantsRaw.map((v) => normalizeVariantRow(v)).filter(Boolean)
    : [];
  return {
    id: field(row, "id", "Id"),
    name: field(row, "name", "Name") || "",
    description: field(row, "description", "Description", "short_description") || "",
    categoryId: field(row, "category_id", "categoryId", "CategoryId"),
    price: Number(field(row, "price", "Price", "sale_price") || 0),
    stock: Number(field(row, "stock", "Stock") ?? 0),
    sku: field(row, "sku", "Sku", "SKU") || "",
    image: mediaUrl(field(row, "image", "Image", "image_url", "imageUrl")),
    status: String(field(row, "status", "Status") ?? "active"),
    featured: Boolean(field(row, "featured", "Featured")),
    variants,
    hasVariants: variants.length > 1,
    raw: row
  };
}

function categoryNameById(id) {
  const parent = state.parentCategories.find((p) => String(p.id) === String(id));
  if (parent) return parent.name;
  const cat = state.categories.find((c) => String(c.id) === String(id));
  return cat?.name || (id ? `#${id}` : "—");
}

function parentCategories() {
  return state.parentCategories;
}

function childCategories() {
  return state.categories.filter((c) => c.parentId != null && c.parentId !== "");
}

function formatVariantSummary(product) {
  const v = product.variants || [];
  if (!v.length) return "One size (base price)";
  if (v.length === 1) {
    const vars = v[0].variables || {};
    const extra = Object.keys(vars).length
      ? ` (${Object.entries(vars)
          .map(([k, val]) => `${k}: ${val}`)
          .join(", ")})`
      : "";
    return `${v[0].name}${extra} ${fmtMoney(v[0].price)}`;
  }
  return v
    .map((x) => {
      const vars = x.variables || {};
      const extra = Object.keys(vars).length
        ? ` (${Object.entries(vars)
            .map(([k, val]) => `${k}: ${val}`)
            .join(", ")})`
        : "";
      return `${x.name}${extra} ${fmtMoney(x.price)}`;
    })
    .join(" · ");
}

function openModal(title, bodyHtml, onSave) {
  state.modalSaveHandler = onSave;
  el.crudModalTitle.textContent = title;
  el.crudModalBody.innerHTML = bodyHtml;
  el.crudModal.classList.remove("hidden");
}

function closeModal() {
  el.crudModal.classList.add("hidden");
  state.modalSaveHandler = null;
  el.crudModalBody.innerHTML = "";
}

el.crudModalSave.addEventListener("click", async () => {
  if (!state.modalSaveHandler) return;
  try {
    el.crudModalSave.disabled = true;
    await state.modalSaveHandler();
    closeModal();
  } catch (err) {
    showToast(err.message || "Save failed", "error");
  } finally {
    el.crudModalSave.disabled = false;
  }
});

document.querySelectorAll("[data-close-modal]").forEach((node) => {
  node.addEventListener("click", closeModal);
});

function setPageHeader(tab) {
  const [title, subtitle] = TAB_TITLES[tab] || ["Admin", ""];
  el.pageTitle.textContent = title;
  el.pageSubtitle.textContent = subtitle;
}

function tabSwitching() {
  document.querySelectorAll(".sidebar [data-tab]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".sidebar [data-tab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.remove("active"));
      const tab = btn.dataset.tab;
      document.getElementById(`${tab}Tab`).classList.add("active");
      setPageHeader(tab);
      if (tab === "dashboard") await loadDashboard();
      if (tab === "products") await loadProducts();
      if (tab === "parentCategories") await loadParentCategories();
      if (tab === "categories") await loadCategories();
    });
  });
}

async function loadCategoriesData() {
  const data = await api(withWebsiteQuery("/categories?limit=100&page=1"));
  state.categories = listItems(data).map(normalizeCategory);
  return state.categories;
}

async function loadParentCategoriesData() {
  const data = await api(withWebsiteQuery("/parent-categories?limit=100"));
  state.parentCategories = listItems(data).map(normalizeParentCategory);
  return state.parentCategories;
}

async function loadDashboard() {
  const [productData] = await Promise.all([
    api(withWebsiteQuery("/products?page=1&limit=5")),
    loadCategoriesData().catch(() => []),
    loadParentCategoriesData().catch(() => [])
  ]);

  const items = listItems(productData).map(normalizeProduct);
  const meta = listMeta(productData);
  const productTotal = Number(meta.total ?? items.length);
  const categoryTotal = state.categories.length;
  const activeProducts = items.filter((p) => p.status === "active").length;
  const featuredProducts = items.filter((p) => p.featured).length;

  el.dashboardTab.innerHTML = `
    <div class="cards">
      <article class="stat-card">
        <p class="stat-label">Products</p>
        <h3 class="stat-value">${productTotal}</h3>
      </article>
      <article class="stat-card">
        <p class="stat-label">Categories</p>
        <h3 class="stat-value">${categoryTotal}</h3>
      </article>
      <article class="stat-card">
        <p class="stat-label">Active (sample)</p>
        <h3 class="stat-value">${activeProducts}</h3>
      </article>
      <article class="stat-card">
        <p class="stat-label">Featured (sample)</p>
        <h3 class="stat-value">${featuredProducts}</h3>
      </article>
    </div>
    <section class="panel">
      <div class="panel-head">
        <h2>Recent products</h2>
        <button type="button" class="btn-secondary btn-sm" data-goto-products>New product</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${items.length
              ? items
                  .map(
                    (p) => `
              <tr>
                <td>${p.image ? `<img class="thumb" src="${escapeHtml(p.image)}" alt="" />` : "—"}</td>
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td>${escapeHtml(categoryNameById(p.categoryId))}</td>
                <td>${fmtMoney(p.price)}</td>
                <td><span class="pill pill-${p.status}">${escapeHtml(p.status)}</span></td>
              </tr>`
                  )
                  .join("")
              : `<tr><td colspan="5" class="empty-cell">No products yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Quick actions</h2></div>
      <div class="quick-actions">
        <button type="button" class="btn-primary" data-goto-products>Manage products</button>
        <button type="button" class="btn-secondary" data-goto-categories>Manage categories</button>
        <a class="btn-secondary" href="/menu.html" target="_blank" rel="noopener">Preview menu</a>
      </div>
    </section>`;

  el.dashboardTab.querySelector("[data-goto-products]")?.addEventListener("click", () => gotoTab("products"));
  el.dashboardTab.querySelectorAll("[data-goto-products]").forEach((b) =>
    b.addEventListener("click", () => gotoTab("products"))
  );
  el.dashboardTab.querySelector("[data-goto-categories]")?.addEventListener("click", () => gotoTab("categories"));
}

function gotoTab(tab) {
  document.querySelector(`.sidebar [data-tab="${tab}"]`)?.click();
}

function variantRowsHtml(variants) {
  const rows = (variants || []).slice(0, 8);
  return rows
    .map(
      (v, i) => `
    <div class="variant-row" data-variant-index="${i}">
      <input class="v-name" placeholder="Size name" value="${escapeHtml(v.name)}" />
      <input class="v-price" type="number" step="0.01" placeholder="Price" value="${Number(v.price) || 0}" />
      <input class="v-stock" type="number" placeholder="Stock" value="${Number(v.stock) || 0}" />
      <input class="v-sku" placeholder="SKU" value="${escapeHtml(v.sku || "")}" />
      <button type="button" class="btn-danger btn-sm variant-row-remove" title="Remove this size" aria-label="Remove size">✕</button>
    </div>`
    )
    .join("");
}

function readVariantsFromForm() {
  return Array.from(document.querySelectorAll(".variant-row"))
    .map((row) => ({
      name: row.querySelector(".v-name")?.value.trim(),
      price: Number(row.querySelector(".v-price")?.value || 0),
      stock: Number(row.querySelector(".v-stock")?.value || 0),
      sku: row.querySelector(".v-sku")?.value.trim() || undefined
    }))
    .filter((v) => v.name);
}

function productFormHtml(product = null) {
  const p = product || {};
  const hasMultiple = (p.variants?.length || 0) > 0 || p.hasVariants;
  const variants = p.variants || [];
  const categoryOptions = childCategories()
    .map((c) => {
      const parentLabel = categoryNameById(c.parentId);
      return `<option value="${c.id}" ${String(c.id) === String(p.categoryId) ? "selected" : ""}>${escapeHtml(c.name)} (${escapeHtml(parentLabel)})</option>`;
    })
    .join("");

  return `
    <div class="form-grid">
      <label class="field-label">Name</label>
      <input id="fName" value="${escapeHtml(p.name || "")}" required />
      <label class="field-label">Description</label>
      <textarea id="fDesc" rows="3">${escapeHtml(p.description || "")}</textarea>
      <label class="field-label">Category</label>
      <select id="fCategory"><option value="">— Select —</option>${categoryOptions}</select>
      <label class="field-label">Price (used when no sizes, or as base)</label>
      <input id="fPrice" type="number" step="0.01" value="${Number(p.price) || 0}" />
      <label class="field-label">Stock (product-level)</label>
      <input id="fStock" type="number" value="${Number(p.stock) || 0}" />
      <label class="field-label">SKU</label>
      <input id="fSku" value="${escapeHtml(p.sku || "")}" />
      <label class="field-label">Image URL</label>
      <div class="image-url-row">
        <input id="fImage" value="${escapeHtml(p.image || "")}" placeholder="https://..." />
        <button type="button" class="btn-secondary btn-sm" id="clearProductImage">Clear image</button>
      </div>
      <p class="muted form-hint">Leave empty and save to remove the image (sends image as empty string to the API).</p>
      <label class="field-label">Status</label>
      <select id="fStatus">
        <option value="active" ${p.status === "active" ? "selected" : ""}>active</option>
        <option value="inactive" ${p.status === "inactive" ? "selected" : ""}>inactive</option>
      </select>
      <label class="checkbox-row"><input id="fFeatured" type="checkbox" ${p.featured ? "checked" : ""} /> Featured on home</label>
      <label class="checkbox-row"><input id="fHasSizes" type="checkbox" ${hasMultiple ? "checked" : ""} /> This product has multiple sizes</label>
      <div id="variantsBlock" class="variants-block ${hasMultiple ? "" : "hidden"}">
        <p class="field-label muted">Add only sizes you sell (e.g. Small and Large — no Medium required).</p>
        <div id="variantRows">${variantRowsHtml(variants)}</div>
        <button type="button" class="btn-secondary btn-sm" id="addVariantRow">+ Add size</button>
      </div>
    </div>`;
}

function bindProductFormControls() {
  const toggle = document.getElementById("fHasSizes");
  const block = document.getElementById("variantsBlock");
  toggle?.addEventListener("change", () => {
    block?.classList.toggle("hidden", !toggle.checked);
    if (toggle.checked && !document.querySelector(".variant-row")) {
      document.getElementById("variantRows").innerHTML = variantRowsHtml([
        { name: "Small", price: 0, stock: 50, sku: "" },
        { name: "Large", price: 0, stock: 50, sku: "" }
      ]);
    }
  });
  document.getElementById("clearProductImage")?.addEventListener("click", () => {
    const input = document.getElementById("fImage");
    if (input) input.value = "";
  });
  bindVariantRowControls();
}

function bindVariantRowControls() {
  const host = document.getElementById("variantRows");
  host?.addEventListener("click", (e) => {
    const btn = e.target.closest(".variant-row-remove");
    if (!btn || !host.contains(btn)) return;
    btn.closest(".variant-row")?.remove();
  });

  document.getElementById("addVariantRow")?.addEventListener("click", () => {
    const host = document.getElementById("variantRows");
    const i = host.querySelectorAll(".variant-row").length;
    const wrap = document.createElement("div");
    wrap.className = "variant-row";
    wrap.dataset.variantIndex = String(i);
    wrap.innerHTML = `
      <input class="v-name" placeholder="Size name e.g. Small" value="" />
      <input class="v-price" type="number" step="0.01" placeholder="Price" value="0" />
      <input class="v-stock" type="number" placeholder="Stock" value="50" />
      <input class="v-sku" placeholder="SKU" value="" />
      <button type="button" class="btn-danger btn-sm variant-row-remove" title="Remove this size" aria-label="Remove size">✕</button>`;
    host.appendChild(wrap);
  });
}

function buildProductPayload() {
  const basePrice = Number(document.getElementById("fPrice").value || 0);
  const hasMultiple = document.getElementById("fHasSizes")?.checked;
  const variants = hasMultiple ? readVariantsFromForm() : [];

  const payload = {
    name: document.getElementById("fName").value.trim(),
    description: document.getElementById("fDesc").value.trim(),
    website_id: websiteIdOf(),
    category_id: Number(document.getElementById("fCategory").value || 0) || null,
    price: basePrice,
    stock: Number(document.getElementById("fStock").value || 0),
    sku: formOptionalField("fSku") || null,
    image: formImageField("fImage"),
    status: document.getElementById("fStatus").value,
    featured: document.getElementById("fFeatured").checked
  };

  if (variants.length === 1) payload.variants = variants;
  else if (variants.length > 1) payload.variants = variants;

  return payload;
}

function openProductModal(product = null) {
  openModal(product ? "Edit product" : "New product", productFormHtml(product), async () => {
    const hasMultiple = document.getElementById("fHasSizes")?.checked;
    const formVariants = hasMultiple ? readVariantsFromForm() : [];
    const payload = buildProductPayload();
    if (!payload.name) throw new Error("Product name is required");
    delete payload.variants;
    requireAuth();

    let productId = product?.id;
    if (productId) {
      await api(`/products/${productId}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Product updated", "success");
    } else {
      const created = await api("/products", { method: "POST", body: JSON.stringify(payload) });
      productId = field(created, "id", "Id");
      showToast("Product created", "success");
    }

    if (window.ProductVariants && productId) {
      try {
        requireAuth();
        await window.ProductVariants.syncProductVariants(
          (path, opts) => api(withWebsiteQuery(path), opts),
          productId,
          formVariants
        );
        if (formVariants.length) {
          showToast(`${formVariants.length} size(s) saved to product_variants`, "success");
        }
      } catch (syncErr) {
        throw new Error(
          `Product saved but sizes failed: ${syncErr.message}. Log in to admin and try again.`
        );
      }
    }

    await Promise.all([loadProducts(), loadDashboard()]);
  });
  bindProductFormControls();
}

async function loadProducts() {
  await loadCategoriesData().catch(() => {});
  const query = new URLSearchParams({
    page: String(state.productPage),
    limit: String(state.productPageSize)
  });
  if (state.productSearch) query.set("search", state.productSearch);
  if (state.productStatus) query.set("status", state.productStatus);

  const data = await api(withWebsiteQuery(`/products?${query}`));
  let products = listItems(data).map(normalizeProduct);

  if (window.ProductVariants) {
    const variantMap = await window.ProductVariants.fetchProductVariantsMap((path) =>
      api(withWebsiteQuery(path))
    );
    products = products.map((p) => window.ProductVariants.mergeIntoProduct(p, variantMap));
  }

  state.products = products;
  const meta = listMeta(data);
  state.productTotal = Number(meta.total ?? state.products.length);
  const totalPages = Math.max(1, Number(meta.totalPages) || Math.ceil(state.productTotal / state.productPageSize));

  el.productsTab.innerHTML = `
    <div class="toolbar">
      <input id="productSearch" type="search" placeholder="Search products…" value="${escapeHtml(state.productSearch)}" />
      <select id="productStatusFilter">
        <option value="">All statuses</option>
        <option value="active" ${state.productStatus === "active" ? "selected" : ""}>active</option>
        <option value="inactive" ${state.productStatus === "inactive" ? "selected" : ""}>inactive</option>
      </select>
      <button type="button" id="newProductBtn" class="btn-primary">+ New product</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>Category</th>
            <th>Price</th>
            <th>Variants</th>
            <th>Stock</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${state.products.length
            ? state.products
                .map((p) => {
                  const variantSummary = formatVariantSummary(p);
                  return `
            <tr>
              <td>${p.image ? `<img class="thumb" src="${escapeHtml(p.image)}" alt="" />` : "—"}</td>
              <td><strong>${escapeHtml(p.name)}</strong>${p.featured ? ' <span class="pill pill-featured">featured</span>' : ""}</td>
              <td>${escapeHtml(categoryNameById(p.categoryId))}</td>
              <td>${fmtMoney(p.price)}</td>
              <td class="variant-cell">${variantSummary}</td>
              <td>${p.stock}</td>
              <td><span class="pill pill-${escapeHtml(p.status)}">${escapeHtml(p.status)}</span></td>
              <td class="row-actions">
                <button type="button" class="btn-secondary btn-sm" data-edit-product="${p.id}">Edit</button>
                <button type="button" class="btn-danger btn-sm" data-delete-product="${p.id}">Delete</button>
              </td>
            </tr>`;
                })
                .join("")
            : `<tr><td colspan="8" class="empty-cell">No products found.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="pagination">
      <button type="button" id="prevProducts" class="btn-secondary btn-sm" ${state.productPage <= 1 ? "disabled" : ""}>Previous</button>
      <span>Page ${state.productPage} of ${totalPages} (${state.productTotal} total)</span>
      <button type="button" id="nextProducts" class="btn-secondary btn-sm" ${state.productPage >= totalPages ? "disabled" : ""}>Next</button>
    </div>`;

  document.getElementById("productSearch").addEventListener("input", (e) => {
    state.productSearch = e.target.value;
    state.productPage = 1;
    loadProducts();
  });
  document.getElementById("productStatusFilter").addEventListener("change", (e) => {
    state.productStatus = e.target.value;
    state.productPage = 1;
    loadProducts();
  });
  document.getElementById("newProductBtn").addEventListener("click", () => openProductModal());
  document.getElementById("prevProducts").addEventListener("click", () => {
    state.productPage = Math.max(1, state.productPage - 1);
    loadProducts();
  });
  document.getElementById("nextProducts").addEventListener("click", () => {
    if (state.productPage < totalPages) {
      state.productPage += 1;
      loadProducts();
    }
  });
  document.querySelectorAll("[data-edit-product]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const local = state.products.find((p) => String(p.id) === btn.dataset.editProduct);
      try {
        const detail = await api(`/products/${btn.dataset.editProduct}`);
        let merged = normalizeProduct(detail || local);
        if (window.ProductVariants) {
          const variantMap = await window.ProductVariants.fetchProductVariantsMap(
            (path) => api(withWebsiteQuery(path)),
            { productId: btn.dataset.editProduct }
          );
          merged = window.ProductVariants.mergeIntoProduct(merged, variantMap);
        }
        openProductModal(merged);
      } catch {
        openProductModal(local);
      }
    });
  });
  document.querySelectorAll("[data-delete-product]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this product permanently?")) return;
      try {
        await api(`/products/${btn.dataset.deleteProduct}`, { method: "DELETE" });
        showToast("Product deleted", "success");
        await Promise.all([loadProducts(), loadDashboard()]);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

function parentCategoryFormHtml(category = null) {
  const c = category || {};
  return `
    <div class="form-grid">
      <p class="muted">Top-level menus from your <strong>parent_categories</strong> table (e.g. Coffee, Pet Shop).</p>
      <label class="field-label">Name</label>
      <input id="cName" value="${escapeHtml(c.name || "")}" required />
      <label class="field-label">Slug</label>
      <input id="cSlug" value="${escapeHtml(c.slug || "")}" placeholder="coffee-menu" />
      <label class="field-label">Description</label>
      <textarea id="cDesc" rows="2">${escapeHtml(c.description || "")}</textarea>
      <label class="field-label">Image URL</label>
      <input id="cImage" value="${escapeHtml(c.image || "")}" />
      <label class="field-label">Status</label>
      <select id="cStatus">
        <option value="active" ${c.status === "active" ? "selected" : ""}>active</option>
        <option value="inactive" ${c.status === "inactive" ? "selected" : ""}>inactive</option>
      </select>
    </div>`;
}

function categoryFormHtml(category = null) {
  const c = category || {};
  const parentOptions = parentCategories()
    .map(
      (p) =>
        `<option value="${p.id}" ${String(p.id) === String(c.parentId ?? "") ? "selected" : ""}>${escapeHtml(p.name)} (#${p.id})</option>`
    )
    .join("");

  return `
    <div class="form-grid">
      <p class="muted">Subcategories (e.g. Hot Coffee). Set parent to Coffee (2) for the coffee menu.</p>
      <label class="field-label">Name</label>
      <input id="cName" value="${escapeHtml(c.name || "")}" required />
      <label class="field-label">Slug</label>
      <input id="cSlug" value="${escapeHtml(c.slug || "")}" placeholder="hot-coffee" />
      <label class="field-label">Description</label>
      <textarea id="cDesc" rows="2">${escapeHtml(c.description || "")}</textarea>
      <label class="field-label">Parent menu</label>
      <select id="cParent" required><option value="">— Select parent —</option>${parentOptions}</select>
      <label class="field-label">Image URL</label>
      <input id="cImage" value="${escapeHtml(c.image || "")}" />
      <label class="field-label">Status</label>
      <select id="cStatus">
        <option value="active" ${c.status === "active" ? "selected" : ""}>active</option>
        <option value="inactive" ${c.status === "inactive" ? "selected" : ""}>inactive</option>
      </select>
    </div>`;
}

function buildParentCategoryPayload() {
  const name = document.getElementById("cName").value.trim();
  if (!name) throw new Error("Parent category name is required");
  return {
    website_id: websiteIdOf(),
    name,
    slug:
      document.getElementById("cSlug").value.trim() || name.toLowerCase().replace(/\s+/g, "-"),
    description: document.getElementById("cDesc").value.trim(),
    image: formOptionalField("cImage"),
    status: document.getElementById("cStatus").value
  };
}

function buildCategoryPayload() {
  const name = document.getElementById("cName").value.trim();
  if (!name) throw new Error("Category name is required");
  const parent_id = Number(document.getElementById("cParent")?.value || 0) || null;
  if (!parent_id) {
    throw new Error("Select a parent menu (Coffee or Pet shop).");
  }
  return {
    name,
    slug: document.getElementById("cSlug").value.trim() || name.toLowerCase().replace(/\s+/g, "-"),
    description: document.getElementById("cDesc").value.trim(),
    parent_id,
    image: formOptionalField("cImage"),
    status: document.getElementById("cStatus").value
  };
}

function openParentCategoryModal(category = null) {
  openModal(category ? "Edit parent category" : "New parent category", parentCategoryFormHtml(category), async () => {
    const payload = buildParentCategoryPayload();
    if (category?.id) {
      await api(`/parent-categories/${category.id}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Parent category updated", "success");
    } else {
      await api("/parent-categories", { method: "POST", body: JSON.stringify(payload) });
      showToast("Parent category created", "success");
    }
    await Promise.all([loadParentCategories(), loadCategories(), loadDashboard()]);
  });
}

function openCategoryModal(category = null) {
  openModal(category ? "Edit subcategory" : "New subcategory", categoryFormHtml(category), async () => {
    const payload = buildCategoryPayload();
    if (category?.id) {
      await api(`/categories/${category.id}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Subcategory updated", "success");
    } else {
      await api("/categories", { method: "POST", body: JSON.stringify(payload) });
      showToast("Subcategory created", "success");
    }
    await Promise.all([loadParentCategories(), loadCategories(), loadDashboard()]);
  });
}

async function loadParentCategories() {
  await loadParentCategoriesData().catch(() => {
    state.parentCategories = [];
  });
  const parents = parentCategories();
  el.parentCategoriesTab.innerHTML = `
    <div class="toolbar">
      <p class="muted toolbar-hint">From <strong>parent_categories</strong> table · Coffee #${MENU_PARENT_CATEGORY_ID} (${escapeHtml(categoryNameById(MENU_PARENT_CATEGORY_ID))}) · Pet shop #${PETS_PARENT_CATEGORY_ID} (${escapeHtml(categoryNameById(PETS_PARENT_CATEGORY_ID))})</p>
      <button type="button" id="newParentCategoryBtn" class="btn-primary">+ New parent category</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${parents.length
            ? parents
                .map(
                  (c) => `
            <tr>
              <td><strong>#${c.id}</strong></td>
              <td>${escapeHtml(c.name)}</td>
              <td>${escapeHtml(c.slug)}</td>
              <td><span class="pill pill-${escapeHtml(c.status)}">${escapeHtml(c.status)}</span></td>
              <td class="row-actions">
                <button type="button" class="btn-secondary btn-sm" data-edit-parent-category="${c.id}">Edit</button>
                <button type="button" class="btn-danger btn-sm" data-delete-parent-category="${c.id}">Delete</button>
              </td>
            </tr>`
                )
                .join("")
            : `<tr><td colspan="5" class="empty-cell">No parent categories. Add Coffee (menu id 2) and Pet shop (id 3).</td></tr>`}
        </tbody>
      </table>
    </div>`;

  document.getElementById("newParentCategoryBtn")?.addEventListener("click", () => openParentCategoryModal());
  document.querySelectorAll("[data-edit-parent-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = state.parentCategories.find((c) => String(c.id) === btn.dataset.editParentCategory);
      openParentCategoryModal(cat);
    });
  });
  document.querySelectorAll("[data-delete-parent-category]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this parent category? Subcategories may break.")) return;
      try {
        await api(`/parent-categories/${btn.dataset.deleteParentCategory}`, { method: "DELETE" });
        showToast("Parent category deleted", "success");
        await Promise.all([loadParentCategories(), loadCategories(), loadDashboard()]);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

async function loadCategories() {
  await Promise.all([loadCategoriesData(), loadParentCategoriesData().catch(() => {})]);
  el.categoriesTab.innerHTML = `
    <div class="toolbar">
      <p class="muted toolbar-hint">Subcategories under a parent (e.g. Hot Coffee → parent Coffee #2)</p>
      <button type="button" id="newCategoryBtn" class="btn-primary">+ New subcategory</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Parent</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${childCategories().length
            ? childCategories()
                .map(
                  (c) => `
            <tr>
              <td><strong>${escapeHtml(c.name)}</strong></td>
              <td>${escapeHtml(c.slug)}</td>
              <td>${escapeHtml(categoryNameById(c.parentId))} (#${escapeHtml(c.parentId)})</td>
              <td><span class="pill pill-${escapeHtml(c.status)}">${escapeHtml(c.status)}</span></td>
              <td>${fmtDate(c.raw?.updated_at)}</td>
              <td class="row-actions">
                <button type="button" class="btn-secondary btn-sm" data-edit-category="${c.id}">Edit</button>
                <button type="button" class="btn-danger btn-sm" data-delete-category="${c.id}">Delete</button>
              </td>
            </tr>`
                )
                .join("")
            : `<tr><td colspan="6" class="empty-cell">No subcategories yet.</td></tr>`}
        </tbody>
      </table>
    </div>`;

  document.getElementById("newCategoryBtn").addEventListener("click", () => openCategoryModal());
  document.querySelectorAll("[data-edit-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = state.categories.find((c) => String(c.id) === btn.dataset.editCategory);
      openCategoryModal(cat);
    });
  });
  document.querySelectorAll("[data-delete-category]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this category? Products may lose their category link.")) return;
      try {
        await api(`/categories/${btn.dataset.deleteCategory}`, { method: "DELETE" });
        showToast("Category deleted", "success");
        await Promise.all([loadParentCategories(), loadCategories(), loadDashboard()]);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

async function login(usernameOrEmail, password) {
  const response = await fetch(apiUrl("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: usernameOrEmail,
      usernameOrEmail,
      email: usernameOrEmail,
      password
    })
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(raw.message || raw.error || "Login failed");
  }
  state.token = extractTokenFromResponse(raw);
  if (!state.token) throw new Error("Login response missing access token");
  state.currentUser = extractAdminFromResponse(raw);
  localStorage.setItem("admin_user", JSON.stringify(state.currentUser || null));
  localStorage.setItem("admin_token", state.token);
  const wid = state.currentUser?.websiteId ?? state.currentUser?.website_id;
  if (wid) localStorage.setItem("admin_website_id", String(wid));
  el.loginError.textContent = "";
}

async function logout() {
  await api("/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => null);
  clearSession();
  location.reload();
}

function updateChrome() {
  const user = state.currentUser?.username || state.currentUser?.email || "Admin";
  el.sidebarUser.textContent = user;
  el.websiteBadge.textContent = `Website #${websiteIdOf() || "—"}`;
}

async function enterDashboard() {
  el.loginView.classList.add("hidden");
  el.dashboardView.classList.remove("hidden");
  updateChrome();
  tabSwitching();
  setPageHeader("dashboard");
  await loadDashboard();
  await loadProducts();
  await loadParentCategories();
  await loadCategories();
}

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.loginError.textContent = "";
  try {
    await login(document.getElementById("usernameOrEmail").value, document.getElementById("password").value);
    await enterDashboard();
    showToast("Welcome back!", "success");
  } catch (error) {
    el.loginError.textContent = error.message;
  }
});

el.logoutBtn.addEventListener("click", logout);

(async function init() {
  syncTokenFromStorage();
  if (!state.token) return;
  try {
    await api("/admins?limit=1");
    await enterDashboard();
  } catch {
    clearSession();
  }
})();

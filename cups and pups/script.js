const fallbackProducts = [];

const fallbackServices = [
  { id: "s1", name: "Basic Bath & Dry", description: "Gentle wash, quick dry, and coat refresh.", duration: "30 min", price: 18 },
  { id: "s2", name: "Full Grooming", description: "Bath, styling trim, nail care, and ear cleaning.", duration: "60 min", price: 35 },
  { id: "s3", name: "Deluxe Spa", description: "Premium grooming with paw balm and calming treatment.", duration: "90 min", price: 52 }
];

const COFFEE_CATEGORY_LABELS = {
  hot: "Hot drinks",
  cold: "Cold drinks",
  dessert: "Desserts & pastries"
};

const PET_CATEGORY_LABELS = {
  dog: "Dog products",
  cat: "Cat products",
  accessory: "Accessories",
  aquarium: "Aquarium supplies"
};

const page = document.body.dataset.page || "home";
const homePreviewLimit = 4;

const RAILWAY_API_URL = "https://abnodejsapi-production.up.railway.app";

function defaultApiBaseUrl() {
  if (window.API_BASE_URL) return String(window.API_BASE_URL).replace(/\/$/, "");
  const stored = localStorage.getItem("petcafe_api_base");
  if (stored) return stored.replace(/\/$/, "");
  return RAILWAY_API_URL;
}

const API_BASE_URL = (window.API_BASE_URL || localStorage.getItem("petcafe_api_base") || defaultApiBaseUrl()).replace(/\/$/, "");
const API_PREFIX = (window.API_PREFIX || localStorage.getItem("petcafe_api_prefix") || "/api/v1").replace(/\/$/, "");
const WEBSITE_ID = Number(window.WEBSITE_ID || localStorage.getItem("petcafe_website_id") || 1);
const MENU_PARENT_CATEGORY_ID = Number(window.MENU_PARENT_CATEGORY_ID || localStorage.getItem("petcafe_menu_parent_id") || 2);
const PETS_PARENT_CATEGORY_ID = Number(window.PETS_PARENT_CATEGORY_ID || localStorage.getItem("petcafe_pets_parent_id") || 3);

function apiUrl(endpoint) {
  return `${API_BASE_URL}${API_PREFIX}${endpoint}`;
}

function authHeaders() {
  const token = localStorage.getItem("admin_token") || "";
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (WEBSITE_ID) headers["x-website-id"] = String(WEBSITE_ID);
  return headers;
}

function withWebsiteId(endpoint) {
  if (!WEBSITE_ID) return endpoint;
  const joiner = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${joiner}websiteId=${encodeURIComponent(WEBSITE_ID)}`;
}

function mediaUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  if (raw.startsWith("/")) return `${API_BASE_URL}${raw}`;
  return `${API_BASE_URL}/${raw}`;
}

/** Read camelCase or snake_case fields from the Railway/Supabase API. */
function apiField(item, ...keys) {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null) return item[key];
  }
  return undefined;
}

function inferProductType(item) {
  if (item.type) return item.type;
  const parentId = Number(apiField(item, "parentCategoryId", "ParentCategoryId", "parent_category_id") || 0);
  if (parentId === MENU_PARENT_CATEGORY_ID) return "coffee";
  if (parentId === PETS_PARENT_CATEGORY_ID) return "pets";

  const catId = String(apiField(item, "categoryId", "CategoryId", "category_id") || "");
  const catName = (categoryIdToName[catId] || "").toLowerCase();
  if (/(pet|dog|cat|aquarium|groom|toy|treat)/.test(catName)) return "pets";

  const text = `${apiField(item, "name", "Name") || ""} ${apiField(item, "description", "Description") || ""}`.toLowerCase();
  if (/(coffee|latte|espresso|cappuccino|tea|dessert|cake|cold brew|mocha|brownie|cheesecake|milk|oat)/.test(text)) {
    return "coffee";
  }
  return "pets";
}

function matchesWebsiteAndParent(item, typeHint = "") {
  const rowWebsiteId = Number(apiField(item, "websiteId", "WebsiteId", "website_id") || 0);
  if (WEBSITE_ID && rowWebsiteId && rowWebsiteId !== WEBSITE_ID) return false;

  const rowParentId = Number(apiField(item, "parentCategoryId", "ParentCategoryId", "parent_category_id") || 0);
  if (!rowParentId) return true;
  if (typeHint === "coffee") return rowParentId === MENU_PARENT_CATEGORY_ID;
  if (typeHint === "pets") return rowParentId === PETS_PARENT_CATEGORY_ID;
  return rowParentId === MENU_PARENT_CATEGORY_ID || rowParentId === PETS_PARENT_CATEGORY_ID;
}

function productMatchesSection(product, sectionType) {
  if (product.type !== sectionType) return false;
  const pid = Number(product.parentCategoryId || 0);
  if (!pid) return true;
  return sectionType === "coffee" ? pid === MENU_PARENT_CATEGORY_ID : pid === PETS_PARENT_CATEGORY_ID;
}

function normalizeApiProduct(item) {
  const id = apiField(item, "id", "Id");
  const categoryId = apiField(item, "categoryId", "CategoryId", "category_id");
  const categoryRaw =
    apiField(item, "category", "Category", "categoryName", "CategoryName") ??
    categoryId ??
    "general";
  const status = String(apiField(item, "status", "Status") || "active").toLowerCase();
  const soldOutRaw = apiField(item, "soldOut", "SoldOut", "sold_out");
  const stock = Number(apiField(item, "stock", "Stock") ?? 0);
  const priceRaw = apiField(item, "sale_price", "salePrice", "SalePrice", "price", "Price");
  const featured = apiField(item, "featured", "Featured", "IsFeatured", "is_featured");
  const basePrice = Number(priceRaw) || 0;
  const variants = normalizeVariants(item);

  return {
    id: String(id),
    type: inferProductType(item),
    parentCategoryId: Number(apiField(item, "parentCategoryId", "ParentCategoryId", "parent_category_id") || 0),
    websiteId: Number(apiField(item, "websiteId", "WebsiteId", "website_id") || 0),
    category: String(categoryRaw).toLowerCase().replace(/\s+/g, "_"),
    categoryId: categoryId != null ? String(categoryId) : "",
    name: apiField(item, "name", "Name") || "",
    description: apiField(item, "description", "Description", "short_description", "shortDescription") || "",
    price: basePrice,
    variants,
    hasVariants: variants.length > 1,
    stock,
    status,
    featured: featured === true || featured === 1 || featured === "1" || featured === "true",
    soldOut:
      soldOutRaw === true ||
      soldOutRaw === 1 ||
      soldOutRaw === "1" ||
      status === "inactive" ||
      status === "sold_out" ||
      (variants.length ? variants.every((v) => v.soldOut) : stock <= 0),
    likes: Number(apiField(item, "likes", "Likes") || 0),
    views: Number(apiField(item, "views", "Views", "view_count", "ViewCount") || 0),
    image:
      mediaUrl(apiField(item, "image", "Image", "imageUrl", "ImageUrl", "image_url")) ||
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80"
  };
}

async function readApiData(response) {
  const raw = await response.json();
  if (raw && typeof raw === "object" && "success" in raw && "data" in raw) return raw.data;
  return raw;
}

const LOGO_WATERMARK_SRC = "logo/logo.png";

/** Curated % positions + widths (corners, edges, soft framing); rotation randomizes per load */
const LOGO_WATERMARK_PLACEMENTS = [
  { left: 7, top: 16, width: 86 },
  { left: 93, top: 20, width: 78 },
  { left: 11, top: 44, width: 70 },
  { left: 89, top: 42, width: 74 },
  { left: 9, top: 74, width: 82 },
  { left: 91, top: 72, width: 76 },
  { left: 24, top: 10, width: 66 },
  { left: 76, top: 12, width: 72 },
  { left: 20, top: 88, width: 80 },
  { left: 80, top: 90, width: 68 },
  { left: 4, top: 54, width: 64 },
  { left: 96, top: 52, width: 66 },
  { left: 33, top: 30, width: 60 },
  { left: 67, top: 34, width: 62 },
  { left: 50, top: 58, width: 58 }
];

function initLogoWatermarks() {
  if (document.querySelector(".logo-watermark-layer")) return;

  const layer = document.createElement("div");
  layer.className = "logo-watermark-layer";
  layer.setAttribute("aria-hidden", "true");

  const opacity = 0.12;

  for (const slot of LOGO_WATERMARK_PLACEMENTS) {
    const wrap = document.createElement("div");
    wrap.className = "logo-watermark-sprite";

    const rotationDeg = -46 + Math.random() * 92;

    wrap.style.left = `${slot.left}%`;
    wrap.style.top = `${slot.top}%`;
    wrap.style.width = `${slot.width}px`;
    wrap.style.opacity = String(opacity);
    wrap.style.transform = `translate(-50%, -50%) rotate(${rotationDeg}deg)`;

    const img = document.createElement("img");
    img.src = LOGO_WATERMARK_SRC;
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    wrap.appendChild(img);
    layer.appendChild(wrap);
  }

  document.body.insertBefore(layer, document.body.firstChild);
}

let products = [...fallbackProducts];
let services = [...fallbackServices];

/** API category id → display name (filled by loadCategoryLookup) */
let categoryIdToName = {};

async function loadCategoryLookup() {
  categoryIdToName = {};
  try {
    const res = await fetch(apiUrl(withWebsiteId("/categories?page=1&limit=200")), { headers: authHeaders() });
    if (!res.ok) return;
    const data = await readApiData(res);
    const items = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.categories)
        ? data.categories
        : Array.isArray(data)
          ? data
          : [];
    for (const c of items) {
      const id = apiField(c, "id", "Id");
      const name = String(apiField(c, "name", "Name") || "").trim();
      const slug = String(apiField(c, "slug", "Slug") || "").trim();
      if (id != null && name) categoryIdToName[String(id)] = name;
      if (id != null && slug) categoryIdToName[`slug:${slug}`] = name;
    }
  } catch (e) {
    console.warn("Category names unavailable", e);
  }
}

const state = {
  search: "",
  coffeeCategory: "all",
  petCategory: "all",
  petPriceRange: "all",
  cart: [],
  /** productId → variant id */
  selectedVariants: {}
};

const VARIANT_SIZE_ORDER = ["small", "medium", "large"];

const els = {
  coffeeGrid: document.getElementById("coffeeGrid") || document.getElementById("homeCoffeeGrid"),
  petsGrid: document.getElementById("petsGrid") || document.getElementById("homePetsGrid"),
  cartBtn: document.getElementById("cartBtn"),
  cartPanel: document.getElementById("cartPanel"),
  closeCart: document.getElementById("closeCart"),
  cartItems: document.getElementById("cartItems"),
  cartTotal: document.getElementById("cartTotal"),
  cartCount: document.getElementById("cartCount"),
  mobileCartLink: document.getElementById("mobileCartLink"),
  searchInput: document.getElementById("searchInput"),
  servicesGrid: document.getElementById("servicesGrid"),
  comboBtn: document.getElementById("comboBtn"),
  loyaltyBtn: document.getElementById("loyaltyBtn"),
  productModal: document.getElementById("productModal"),
  closeProductModal: document.getElementById("closeProductModal"),
  modalImage: document.getElementById("modalImage"),
  modalName: document.getElementById("modalName"),
  modalDescription: document.getElementById("modalDescription"),
  modalLikes: document.getElementById("modalLikes"),
  modalViews: document.getElementById("modalViews"),
  modalVariants: document.getElementById("modalVariants"),
  modalPrice: document.getElementById("modalPrice"),
  modalAddBtn: document.getElementById("modalAddBtn")
};

function formatPrice(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function variantSortKey(name) {
  const n = String(name || "").toLowerCase();
  const idx = VARIANT_SIZE_ORDER.findIndex((s) => n.includes(s));
  return idx >= 0 ? idx : VARIANT_SIZE_ORDER.length + n.charCodeAt(0);
}

function normalizeVariant(v) {
  if (window.ProductVariants) return window.ProductVariants.normalizeVariantFromRow(v);
  const name = String(apiField(v, "name", "Name") || "").trim();
  if (!name) return null;
  const stock = Number(apiField(v, "stock", "Stock") ?? 0);
  const price = Number(apiField(v, "sale_price", "salePrice", "price", "Price") || 0);
  return {
    id: String(apiField(v, "id", "Id") ?? name.toLowerCase().replace(/\s+/g, "-")),
    name,
    price,
    stock,
    sku: apiField(v, "sku", "Sku", "SKU") || "",
    variables: {},
    soldOut: stock <= 0
  };
}

/** Embedded variants on product JSON, or rows from product_variants (merged later). */
function normalizeVariants(item) {
  const raw = apiField(
    item,
    "variants",
    "Variants",
    "product_variants",
    "productVariants",
    "product_varients"
  );
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw
    .map((v) => normalizeVariant(v))
    .filter(Boolean)
    .sort((a, b) => variantSortKey(a.name) - variantSortKey(b.name));
}

function productHasMultipleSizes(product) {
  return (product.variants || []).length > 1;
}

function defaultVariantForProduct(product) {
  const variants = product.variants || [];
  if (variants.length === 1) return variants[0];
  return {
    id: "default",
    name: "",
    price: Number(product.price) || 0,
    stock: Number(product.stock) || 0,
    sku: "",
    soldOut: product.soldOut
  };
}

function formatPriceRange(variants) {
  if (!variants?.length) return formatPrice(0);
  const prices = variants.map((v) => Number(v.price) || 0).filter((p) => p > 0);
  if (!prices.length) return formatPrice(0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatPrice(min) : `${formatPrice(min)} – ${formatPrice(max)}`;
}

function formatAllSizesLine(variants) {
  return (variants || [])
    .map((v) => `${v.name} ${formatPrice(v.price)}`)
    .join(" · ");
}

function ensureSelectedVariant(product) {
  const variants = product.variants || [];
  if (!variants.length) {
    setSelectedVariant(product.id, "default");
    return;
  }
  const sel = state.selectedVariants[product.id];
  if (sel && variants.some((v) => String(v.id) === String(sel))) return;
  const pick = variants.find((v) => !v.soldOut) || variants[0];
  setSelectedVariant(product.id, pick.id);
}

function getSelectedVariant(product) {
  const variants = product.variants || [];
  if (variants.length > 1) {
    const sel = state.selectedVariants[product.id];
    return variants.find((v) => String(v.id) === String(sel)) || variants.find((v) => !v.soldOut) || variants[0];
  }
  if (variants.length === 1) return variants[0];
  return defaultVariantForProduct(product);
}

function setSelectedVariant(productId, variantId) {
  state.selectedVariants[String(productId)] = String(variantId);
}

function cartLineKey(productId, variantId) {
  return `${productId}:${variantId}`;
}

function parseCartLineKey(key) {
  const s = String(key);
  if (!s.includes(":")) return { productId: s, variantId: "default" };
  const [productId, variantId] = s.split(":");
  return { productId, variantId: variantId || "default" };
}

function productDisplayPrice(product, variant) {
  const v = variant || getSelectedVariant(product);
  return v ? v.price : product.price;
}

function isProductSoldOut(product) {
  const variants = product.variants || [];
  if (!variants.length) return Boolean(product.soldOut);
  if (variants.length === 1) return variants[0].soldOut || product.soldOut;
  return variants.every((v) => v.soldOut);
}

function renderVariantPicker(product, container, onSelect) {
  if (!container) return;
  const variants = product.variants || [];
  container.innerHTML = "";
  if (!productHasMultipleSizes(product)) {
    container.hidden = true;
    container.classList.remove("has-variants");
    return;
  }
  container.hidden = false;
  container.classList.add("has-variants");
  ensureSelectedVariant(product);
  const selected = getSelectedVariant(product);
  for (const v of variants) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `variant-btn${String(v.id) === String(selected?.id) ? " active" : ""}${v.soldOut ? " disabled" : ""}`;
    btn.textContent = v.name;
    btn.title = `${v.name} — ${formatPrice(v.price)}`;
    btn.disabled = v.soldOut;
    btn.dataset.variantId = v.id;
    btn.addEventListener("click", () => {
      if (v.soldOut) return;
      setSelectedVariant(product.id, v.id);
      container.querySelectorAll(".variant-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onSelect?.(v);
    });
    container.appendChild(btn);
  }
}

function updatePriceDisplay(priceEl, rangeEl, product, variant, sizeLabelEl) {
  const v = variant || getSelectedVariant(product);
  const variants = product.variants || [];
  const price = Number(v?.price ?? product.price) || 0;
  const multi = productHasMultipleSizes(product);

  if (priceEl) {
    if (multi && v?.name) {
      priceEl.textContent = `${v.name}: ${formatPrice(price)}`;
    } else if (variants.length === 1 && variants[0].name) {
      priceEl.textContent = `${variants[0].name}: ${formatPrice(price)}`;
    } else {
      priceEl.textContent = formatPrice(price);
    }
  }

  if (sizeLabelEl) {
    if (multi) {
      sizeLabelEl.textContent = formatAllSizesLine(variants);
      sizeLabelEl.hidden = false;
    } else if (variants.length === 1 && variants[0].name) {
      sizeLabelEl.textContent = variants[0].name;
      sizeLabelEl.hidden = false;
    } else {
      sizeLabelEl.textContent = "";
      sizeLabelEl.hidden = true;
    }
  }

  if (rangeEl) {
    rangeEl.textContent = multi ? `From ${formatPriceRange(variants)}` : "";
    rangeEl.hidden = !multi;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Button pulse + optional surface ring after adding to cart */
function playAddFeedback(button, surfaceEl, onComplete) {
  const finish = () => {
    button?.classList.remove("quick-add-pulse");
    surfaceEl?.classList.remove("product-surface--added");
    onComplete?.();
  };

  if (!button) {
    finish();
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }

  button.classList.add("quick-add-pulse");
  if (surfaceEl) surfaceEl.classList.add("product-surface--added");

  let completed = false;
  const done = () => {
    if (completed) return;
    completed = true;
    clearTimeout(fallback);
    button.removeEventListener("animationend", onAnim);
    finish();
  };

  const onAnim = (e) => {
    if (e.animationName !== "quickAddPop") return;
    done();
  };

  button.addEventListener("animationend", onAnim);
  const fallback = setTimeout(done, 500);
}

function humanizeCategory(slug) {
  if (!slug) return "";
  return String(slug)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function categoryDisplayLabel(group, cat) {
  const catStr = String(cat);
  if (/^\d+$/.test(catStr) && categoryIdToName[catStr]) return categoryIdToName[catStr];
  if (group === "coffee" && COFFEE_CATEGORY_LABELS[cat]) return COFFEE_CATEGORY_LABELS[cat];
  if (group === "pets" && PET_CATEGORY_LABELS[cat]) return PET_CATEGORY_LABELS[cat];
  return humanizeCategory(cat);
}

function collectCategories(productType) {
  const found = new Set();
  for (const p of products) {
    if (productMatchesSection(p, productType) && p.category) found.add(p.category);
  }
  return Array.from(found).sort();
}

function normalizeActiveCategory(active, categories) {
  const valid = new Set(["all", ...categories]);
  return valid.has(active) ? active : "all";
}

function buildCategoryTabsHtml(group, categories, activeCategory) {
  const rows = [];
  const allLabel = group === "coffee" ? "All coffee" : "All pet products";
  rows.push(
    `<button type="button" class="tab${activeCategory === "all" ? " active" : ""}" data-group="${group}" data-category="all">${allLabel}</button>`
  );
  for (const cat of categories) {
    const label = escapeHtml(categoryDisplayLabel(group, cat));
    const safeCat = escapeHtml(cat);
    rows.push(
      `<button type="button" class="tab${activeCategory === cat ? " active" : ""}" data-group="${group}" data-category="${safeCat}">${label}</button>`
    );
  }
  return rows.join("");
}

function renderCategoryTabsFromCatalog() {
  const coffeeHost = document.getElementById("coffeeCategoryTabs");
  if (coffeeHost) {
    const cats = collectCategories("coffee");
    state.coffeeCategory = normalizeActiveCategory(state.coffeeCategory, cats);
    coffeeHost.innerHTML = buildCategoryTabsHtml("coffee", cats, state.coffeeCategory);
  }

  const petsHost = document.getElementById("petsCategoryTabs");
  if (petsHost) {
    const cats = collectCategories("pets");
    state.petCategory = normalizeActiveCategory(state.petCategory, cats);
    petsHost.innerHTML = buildCategoryTabsHtml("pets", cats, state.petCategory);
  }
}

function matchesSearchForItem(item, type) {
  const q = state.search.trim().toLowerCase();
  if (!q) return true;
  if (page === "menu" && type === "coffee") return true;
  if (page === "petshop" && type === "pets") return item.name.toLowerCase().includes(q);
  if (page === "home") return item.name.toLowerCase().includes(q);
  return true;
}

function matchesPetPrice(item) {
  if (page !== "petshop" || item.type !== "pets") return true;
  const pr = productDisplayPrice(item, getSelectedVariant(item));
  switch (state.petPriceRange) {
    case "all":
      return true;
    case "under10":
      return pr < 10;
    case "10-25":
      return pr >= 10 && pr <= 25;
    case "25-50":
      return pr > 25 && pr <= 50;
    case "over50":
      return pr > 50;
    default:
      return true;
  }
}

function filteredProducts(type, category) {
  return products.filter((item) => {
    const sectionMatch = productMatchesSection(item, type);
    const termMatch = matchesSearchForItem(item, type);
    const categoryMatch = category === "all" || item.category === category;
    const priceMatch = matchesPetPrice(item);
    return sectionMatch && termMatch && categoryMatch && priceMatch;
  });
}

function productCard(item, options = { wishlist: false }) {
  const soldOut = isProductSoldOut(item);
  const wrapper = document.createElement("article");
  wrapper.className = `product-card${soldOut ? " sold-out" : ""}`;
  const miniMark = item.type === "coffee" ? "☕ 🫘" : "🐾";
  ensureSelectedVariant(item);
  wrapper.innerHTML = `
    <img src="${item.image}" alt="${escapeHtml(item.name)}" />
    <div class="product-body">
      <div class="product-title-row">
        <h3>${escapeHtml(item.name)}</h3>
        <span class="mini-mark">${miniMark}</span>
      </div>
      ${soldOut ? '<div class="sold-out-badge">Sold Out</div>' : ""}
      <div class="card-sizes-block">
        <p class="card-sizes-heading">Sizes &amp; prices</p>
        <p class="card-sizes-line" hidden></p>
        <div class="variant-picker card-variant-picker" role="group" aria-label="Size"></div>
      </div>
      <div class="price-row">
        <strong class="variant-price"></strong>
        <span class="price-range-hint"></span>
      </div>
      <div class="actions">
        <button class="btn btn-primary add-btn" ${soldOut ? "disabled" : ""}>${soldOut ? "Unavailable" : "Quick Add"}</button>
        ${options.wishlist ? `<button class="icon-btn wish-btn">❤️ ${item.likes}</button>` : ""}
        <button class="icon-btn detail-btn">Details</button>
      </div>
    </div>
  `;

  const picker = wrapper.querySelector(".card-variant-picker");
  const priceEl = wrapper.querySelector(".variant-price");
  const rangeEl = wrapper.querySelector(".price-range-hint");
  const sizesBlock = wrapper.querySelector(".card-sizes-block");
  const sizeLabelEl = wrapper.querySelector(".card-sizes-line");
  const sizesHeading = wrapper.querySelector(".card-sizes-heading");
  if (productHasMultipleSizes(item)) {
    sizesBlock?.classList.add("has-sizes");
    if (sizesHeading) sizesHeading.hidden = false;
  } else {
    sizesBlock?.classList.remove("has-sizes");
    if (sizesHeading) sizesHeading.hidden = true;
    picker?.classList.remove("has-variants");
  }
  renderVariantPicker(item, picker, (v) => updatePriceDisplay(priceEl, rangeEl, item, v, sizeLabelEl));
  updatePriceDisplay(priceEl, rangeEl, item, getSelectedVariant(item), sizeLabelEl);

  wrapper.querySelector(".add-btn").addEventListener("click", (e) => {
    const variant = getSelectedVariant(item);
    if (soldOut || !variant || variant.soldOut) return;
    const btn = e.currentTarget;
    state.cart.push(cartLineKey(item.id, variant.id));
    renderCart();
    playAddFeedback(btn, wrapper);
  });

  const wishBtn = wrapper.querySelector(".wish-btn");
  if (wishBtn) {
    wishBtn.addEventListener("click", () => {
      item.likes += 1;
      render();
    });
  }

  wrapper.querySelector(".detail-btn").addEventListener("click", () => {
    item.views += 1;
    openProductModal(item);
  });

  return wrapper;
}

function renderCoffee() {
  if (!els.coffeeGrid) return;
  const data = filteredProducts("coffee", state.coffeeCategory);
  const list = page === "home" ? data.slice(0, homePreviewLimit) : data;
  els.coffeeGrid.innerHTML = "";
  list.forEach((item) => els.coffeeGrid.appendChild(productCard(item)));
}

function renderPets() {
  if (!els.petsGrid) return;
  const data = filteredProducts("pets", state.petCategory);
  const list = page === "home" ? data.slice(0, homePreviewLimit) : data;
  els.petsGrid.innerHTML = "";
  list.forEach((item) => els.petsGrid.appendChild(productCard(item, { wishlist: true })));
}

function openProductModal(item) {
  ensureSelectedVariant(item);

  els.modalImage.src = item.image;
  els.modalImage.alt = item.name;
  els.modalName.textContent = item.name;
  els.modalDescription.textContent =
    item.description ||
    (item.type === "coffee"
      ? "Freshly prepared in our green cafe bar."
      : "Sourced with pet comfort and sustainability in mind.");
  els.modalLikes.textContent = `❤️ ${item.likes}`;
  els.modalViews.textContent = `👁️ ${item.views}`;

  renderVariantPicker(item, els.modalVariants, (v) => {
    updatePriceDisplay(els.modalPrice, null, item, v, null);
    const soldOut = isProductSoldOut(item) || v?.soldOut;
    els.modalAddBtn.disabled = soldOut;
    els.modalAddBtn.textContent = soldOut ? "Unavailable" : "Add to Cart";
  });
  updatePriceDisplay(els.modalPrice, null, item, getSelectedVariant(item), null);
  const modalSoldOut = isProductSoldOut(item);
  els.modalAddBtn.disabled = modalSoldOut;
  els.modalAddBtn.textContent = modalSoldOut ? "Unavailable" : "Add to Cart";

  els.modalAddBtn.onclick = () => {
    const variant = getSelectedVariant(item);
    if (!variant || variant.soldOut || isProductSoldOut(item)) return;
    const modalCard = els.productModal?.querySelector(".product-modal-card");
    state.cart.push(cartLineKey(item.id, variant.id));
    renderCart();
    playAddFeedback(els.modalAddBtn, modalCard, () => {
      els.productModal.classList.remove("open");
    });
  };
  els.productModal.classList.add("open");
}

function setupProductModal() {
  els.closeProductModal.addEventListener("click", () => {
    els.productModal.classList.remove("open");
  });

  els.productModal.addEventListener("click", (event) => {
    if (event.target === els.productModal) {
      els.productModal.classList.remove("open");
    }
  });
}

function resolveCartLine(cartKey) {
  const { productId, variantId } = parseCartLineKey(cartKey);
  const item = products.find((p) => String(p.id) === String(productId));
  if (!item) return null;
  const variant = item.variants?.find((v) => String(v.id) === String(variantId)) || getSelectedVariant(item);
  const unitPrice = variant?.price ?? item.price;
  const showSize =
    variant?.name && (item.hasVariants || (item.variants?.length === 1 && variant.name));
  const sizeLabel = showSize ? ` (${variant.name})` : "";
  return { item, variant, unitPrice, sizeLabel, cartKey };
}

function renderCart() {
  const grouped = state.cart.reduce((acc, key) => {
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const lines = Object.entries(grouped)
    .map(([key, qty]) => {
      const resolved = resolveCartLine(key);
      if (!resolved) return null;
      return { ...resolved, qty, lineTotal: resolved.unitPrice * qty };
    })
    .filter(Boolean);

  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  els.cartCount.textContent = String(state.cart.length);
  els.cartTotal.textContent = formatPrice(total);

  if (!lines.length) {
    els.cartItems.innerHTML = "<p>Your cart is empty.</p>";
    return;
  }

  els.cartItems.innerHTML = lines
    .map((line) => {
      const name = escapeHtml(line.item.name + line.sizeLabel);
      return `<div class="cart-line">
        <span class="cart-line-title">${name} × ${line.qty}</span>
        <div class="cart-line-actions">
          <strong class="cart-line-price">${formatPrice(line.lineTotal)}</strong>
          <button type="button" class="cart-remove" data-remove-id="${escapeHtml(line.cartKey)}" aria-label="Remove ${name} from cart">Remove</button>
        </div>
      </div>`;
    })
    .join("");
}

function removeProductFromCart(cartKey) {
  const target = String(cartKey);
  const idx = state.cart.findIndex((k) => String(k) === target);
  if (idx >= 0) state.cart.splice(idx, 1);
  renderCart();
}

function renderServices() {
  if (!els.servicesGrid) return;
  els.servicesGrid.innerHTML = services
    .map(
      (service) => `
      <article class="service-card">
        <h3>${service.name}</h3>
        <p>${service.description}</p>
        <div class="service-meta">
          <span>${service.duration}</span>
          <span>${formatPrice(service.price)}</span>
        </div>
      </article>
    `
    )
    .join("");
}

function setupTabDelegation() {
  document.body.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab[data-group][data-category]");
    if (!tab) return;
    const group = tab.dataset.group;
    const category = tab.dataset.category;
    const host = tab.closest(".category-tabs");
    if (host) {
      host.querySelectorAll(".tab").forEach((el) => el.classList.remove("active"));
    }
    tab.classList.add("active");
    if (group === "coffee") state.coffeeCategory = category;
    if (group === "pets") state.petCategory = category;
    render();
  });
}

function setFormListeners() {
  if (els.searchInput) {
    els.searchInput.addEventListener("input", (e) => {
      state.search = e.target.value;
      render();
    });
  }

  const petPriceEl = document.getElementById("petPriceFilter");
  if (petPriceEl) {
    petPriceEl.addEventListener("change", () => {
      state.petPriceRange = petPriceEl.value;
      render();
    });
  }

  if (els.comboBtn) {
    els.comboBtn.addEventListener("click", () => {
      const hasCoffee = state.cart.some((key) => {
        const { productId } = parseCartLineKey(key);
        return products.find((p) => String(p.id) === String(productId))?.type === "coffee";
      });
      const hasPets = state.cart.some((key) => {
        const { productId } = parseCartLineKey(key);
        return products.find((p) => String(p.id) === String(productId))?.type === "pets";
      });
      if (hasCoffee && hasPets) {
        alert("Combo deal applied: 20% off selected pet products!");
      } else {
        alert("Add at least 1 coffee and 1 pet product to unlock combo deals.");
      }
    });
  }

  if (els.loyaltyBtn) {
    els.loyaltyBtn.addEventListener("click", () => {
      alert("Green Loyalty activated! Collect eco-points with every order.");
    });
  }
}

function setCartListeners() {
  els.cartBtn.addEventListener("click", () => {
    els.cartPanel.classList.add("open");
  });
  if (els.mobileCartLink) {
    els.mobileCartLink.addEventListener("click", (event) => {
      event.preventDefault();
      els.cartPanel.classList.add("open");
    });
  }
  els.closeCart.addEventListener("click", () => {
    els.cartPanel.classList.remove("open");
  });

  els.cartItems.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-id]");
    if (!btn || !els.cartItems.contains(btn)) return;
    const id = btn.getAttribute("data-remove-id");
    if (id == null || id === "") return;

    const line = btn.closest(".cart-line");
    if (!line || line.classList.contains("cart-line--removing")) return;

    btn.disabled = true;
    line.classList.add("cart-line--removing");

    const finish = () => removeProductFromCart(id);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }

    let completed = false;
    const done = () => {
      if (completed) return;
      completed = true;
      clearTimeout(fallback);
      line.removeEventListener("animationend", onAnimEnd);
      finish();
    };

    const onAnimEnd = (e) => {
      if (e.animationName !== "cartLineOut") return;
      done();
    };
    const fallback = setTimeout(done, 500);
    line.addEventListener("animationend", onAnimEnd);
  });
}

function highlightMobileNav() {
  const links = document.querySelectorAll(".mobile-nav a");
  links.forEach((link) => {
    link.addEventListener("click", () => {
      links.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
    });
  });
}

async function loadCatalogFromDatabase() {
  try {
    await loadCategoryLookup();
    const response = await fetch(apiUrl(withWebsiteId("/products?page=1&limit=200")), { headers: authHeaders() });
    if (!response.ok) throw new Error(`Unable to fetch catalog (HTTP ${response.status}).`);
    const dataRaw = await readApiData(response);
    const productsSource = Array.isArray(dataRaw?.products)
      ? dataRaw.products
      : Array.isArray(dataRaw?.items)
        ? dataRaw.items
        : Array.isArray(dataRaw)
          ? dataRaw
          : [];
    products = productsSource
      .filter((item) => matchesWebsiteAndParent(item))
      .map(normalizeApiProduct)
      .filter((p) => p.status !== "inactive" && p.status !== "draft");

    if (window.ProductVariants) {
      const variantMap = await window.ProductVariants.fetchProductVariantsMap(
        async (path) => {
          const res = await fetch(apiUrl(withWebsiteId(path)), { headers: authHeaders() });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.message || `Variants HTTP ${res.status}`);
          }
          return readApiData(res);
        },
        { limit: 500 }
      );
      products = products.map((p) => window.ProductVariants.mergeIntoProduct(p, variantMap));
    }

    if (page === "home") {
      const featured = products.filter((p) => p.featured);
      if (featured.length) products = featured;
    }

    if (Array.isArray(dataRaw?.services) && dataRaw.services.length) {
      services = dataRaw.services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        duration: service.duration || "30 min",
        price: Number(service.price) || 0
      }));
    }
  } catch (error) {
    console.warn("Catalog unavailable.", error);
    products = [...fallbackProducts];
  }
}

function closePopupModal() {
  const popup = document.getElementById("eventPopupModal");
  if (!popup) return;
  popup.classList.remove("open");
}

async function loadHomepagePopup() {
  if (page !== "home") return;
  const popup = document.getElementById("eventPopupModal");
  if (!popup) return;
  try {
    const res = await fetch(apiUrl(withWebsiteId("/popups/active")), { headers: authHeaders() });
    if (!res.ok) return;
    let data = await readApiData(res);
    if (Array.isArray(data)) data = data[0];
    if (!data || typeof data !== "object") return;

    const enabledRaw = data.Enabled ?? data.enabled ?? data.IsActive ?? data.isActive;
    const enabled = enabledRaw === true || enabledRaw === 1 || String(enabledRaw).toLowerCase() === "true";
    const showOnce = data.ShowOncePerSession ?? data.showOncePerSession;
    const imageUrl = mediaUrl(data.ImageUrl ?? data.imageUrl);
    const title = data.Title ?? data.title;
    const description = data.Description ?? data.description;
    const eventDate = data.EventDate ?? data.eventDate;
    if (!enabled) return;
    if (showOnce && sessionStorage.getItem("home-popup-seen")) return;
    document.getElementById("eventPopupImage").src = imageUrl || "";
    document.getElementById("eventPopupImage").style.display = imageUrl ? "block" : "none";
    document.getElementById("eventPopupTitle").textContent = title || "Event Announcement";
    document.getElementById("eventPopupDescription").textContent = description || "";
    document.getElementById("eventPopupDate").textContent = eventDate ? new Date(eventDate).toLocaleString() : "";
    popup.classList.add("open");
    if (showOnce) sessionStorage.setItem("home-popup-seen", "1");
  } catch (error) {
    console.warn("Popup unavailable", error);
  }
}

function render() {
  renderCoffee();
  renderPets();
  renderServices();
}

async function init() {
  initLogoWatermarks();
  await loadCatalogFromDatabase();
  renderCategoryTabsFromCatalog();
  setupTabDelegation();
  setFormListeners();
  setCartListeners();
  highlightMobileNav();
  setupProductModal();
  const popupClose = document.getElementById("closeEventPopup");
  popupClose?.addEventListener("click", closePopupModal);
  document.getElementById("eventPopupModal")?.addEventListener("click", (e) => {
    if (e.target.id === "eventPopupModal") closePopupModal();
  });
  render();
  renderCart();
  await loadHomepagePopup();
}

init();

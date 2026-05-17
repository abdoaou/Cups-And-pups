/**
 * Cups & Pups → Railway NodeAPI (Supabase is configured on the API server, not in this file).
 * Override: localStorage petcafe_api_base, petcafe_website_id, or window.API_BASE_URL before this script.
 */
const RAILWAY_API = "https://abnodejsapi-production.up.railway.app";
const isLocalDev =
  typeof location !== "undefined" &&
  /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || "");

if (!window.API_BASE_URL && !localStorage.getItem("petcafe_api_base")) {
  // Local npm start: same-origin /api → server proxy (avoids CORS + credentials issues).
  window.API_BASE_URL = isLocalDev ? location.origin : RAILWAY_API;
}

window.API_PREFIX = window.API_PREFIX || "/api/v1";
window.WEBSITE_ID = window.WEBSITE_ID || 1;
window.MENU_PARENT_CATEGORY_ID = window.MENU_PARENT_CATEGORY_ID || 2;
window.PETS_PARENT_CATEGORY_ID = window.PETS_PARENT_CATEGORY_ID || 3;

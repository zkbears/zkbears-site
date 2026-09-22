export const WHITELIST_CONFIG = Object.freeze({
  apiBaseUrl: window.location.hostname === "localhost"
    ? "http://127.0.0.1:8787"
    : "https://api.zkbears.xyz",
});

export const X_CONFIG = Object.freeze({
  clientId: "LUZFTWF6WXY1V0NTUVdSV3NMZTk6MTpjaQ",
  apiBaseUrl: window.location.hostname === "localhost"
    ? "http://localhost:8787"
    : "https://api.zkbears.xyz",
  targetUsername: "zk_bears",
  targetPostId: "",
});

export const xConfigured = () => Boolean(X_CONFIG.clientId.trim());
export const postConfigured = () => /^\d+$/.test(X_CONFIG.targetPostId.trim());
export const targetPostUrl = () => postConfigured()
  ? `https://x.com/${X_CONFIG.targetUsername}/status/${X_CONFIG.targetPostId}`
  : `https://x.com/${X_CONFIG.targetUsername}`;

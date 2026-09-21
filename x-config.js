export const X_CONFIG = Object.freeze({
  clientId: "",
  targetUsername: "zk_bears",
  targetPostId: "",
  redirectUri: `${window.location.origin}/`,
});

export const xConfigured = () => Boolean(X_CONFIG.clientId.trim());
export const postConfigured = () => /^\d+$/.test(X_CONFIG.targetPostId.trim());
export const targetPostUrl = () => postConfigured()
  ? `https://x.com/${X_CONFIG.targetUsername}/status/${X_CONFIG.targetPostId}`
  : `https://x.com/${X_CONFIG.targetUsername}`;

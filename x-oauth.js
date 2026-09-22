import { X_CONFIG, postConfigured, xConfigured } from "./x-config.js";

function authError(error, fallback) {
  if (error instanceof TypeError) {
    return new Error("The secure X verification service is unavailable. Please try again shortly.");
  }
  return error instanceof Error ? error : new Error(fallback);
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${X_CONFIG.apiBaseUrl}${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch (error) {
    throw authError(error, "X verification request failed.");
  }

  let data = {};
  try { data = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new Error(data.error || "X verification request failed.");
  return data;
}

export async function startXAuth() {
  if (!xConfigured()) throw new Error("The X Client ID has not been added yet.");
  const returnTo = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({ return_to: returnTo });
  window.location.assign(`${X_CONFIG.apiBaseUrl}/oauth/start?${params}`);
}

export async function finishXAuth() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("x_auth");
  if (!status) return null;
  history.replaceState({}, "", `${window.location.pathname}#whitelist`);
  if (status === "cancelled") throw new Error("X authorization was cancelled.");
  if (status !== "success") throw new Error("X authorization could not be verified.");
  return true;
}

export async function clearXSession() {
  try { await apiRequest("/session", { method: "DELETE" }); } catch { /* session is already unusable */ }
}

export async function getXUser() {
  try {
    const data = await apiRequest("/session");
    return data.user || null;
  } catch (error) {
    if (/connect your x account/i.test(error?.message || "")) return null;
    throw authError(error, "X session could not be restored.");
  }
}

export async function verifyFollow() {
  const data = await apiRequest("/verify/follow", { method: "POST", body: "{}" });
  return Boolean(data.verified);
}

export async function verifyLikeAndQuote() {
  if (!postConfigured()) throw new Error("The announcement post ID has not been added yet.");
  const data = await apiRequest("/verify/engagement", { method: "POST", body: "{}" });
  return { liked: Boolean(data.liked), quoted: Boolean(data.quoted) };
}

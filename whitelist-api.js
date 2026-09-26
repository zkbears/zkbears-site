import { WHITELIST_CONFIG } from "./whitelist-config.js";

const LEGAL_VERSION = "2026-09-23";

export class WhitelistApiError extends Error {
  constructor(message, status = 0, code = "request_failed") {
    super(message);
    this.name = "WhitelistApiError";
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${WHITELIST_CONFIG.apiBaseUrl}${path}`, {
      ...options,
      credentials: "include",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    });
  } catch {
    throw new WhitelistApiError("Whitelist service is temporarily unavailable. Try again later.", 0, "network_error");
  }

  let payload = {};
  try { payload = await response.json(); } catch { /* empty or invalid response */ }
  if (!response.ok) {
    throw new WhitelistApiError(payload.error || "Whitelist request failed.", response.status, payload.code);
  }
  return payload;
}

export const whitelistApi = Object.freeze({
  config() {
    return request("/api/config");
  },
  startXAuthentication() {
    const returnTo = `${window.location.origin}${window.location.pathname}`;
    window.location.assign(`${WHITELIST_CONFIG.apiBaseUrl}/auth/x/start?return_to=${encodeURIComponent(returnTo)}`);
  },
  session() {
    return request("/api/session");
  },
  logout() {
    return request("/api/session", { method: "DELETE" });
  },
  startFollowVisit() {
    return request("/api/tasks/follow/start", { method: "POST", body: "{}" });
  },
  completeFollowVisit() {
    return request("/api/tasks/follow", { method: "POST", body: "{}" });
  },
  startEngagementVisit() {
    return request("/api/tasks/engagement/start", { method: "POST", body: "{}" });
  },
  completeEngagementVisit() {
    return request("/api/tasks/engagement", { method: "POST", body: "{}" });
  },
  submit(walletAddress, legalAccepted) {
    return request("/api/submit", {
      method: "POST",
      body: JSON.stringify({ walletAddress, legalAccepted, legalVersion: LEGAL_VERSION }),
    });
  },
});

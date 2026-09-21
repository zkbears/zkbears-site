import { X_CONFIG, postConfigured, xConfigured } from "./x-config.js";

const TOKEN_KEY = "zkbears-x-access-token";
const PENDING_PREFIX = "zkbears-x-oauth-pending:";
const PENDING_MAX_AGE = 15 * 60 * 1000;

function pendingKey(state) {
  return `${PENDING_PREFIX}${state}`;
}

function clearExpiredTransactions() {
  const now = Date.now();
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(PENDING_PREFIX)) continue;
    try {
      const transaction = JSON.parse(localStorage.getItem(key) || "null");
      if (!transaction?.createdAt || now - transaction.createdAt > PENDING_MAX_AGE) localStorage.removeItem(key);
    } catch {
      localStorage.removeItem(key);
    }
  }
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function randomValue(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function startXAuth() {
  if (!xConfigured()) throw new Error("The X Client ID has not been added yet.");
  clearExpiredTransactions();
  const verifier = randomValue(48);
  const state = randomValue(24);
  const challenge = base64Url(await sha256(verifier));
  localStorage.setItem(pendingKey(state), JSON.stringify({ verifier, createdAt: Date.now() }));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: X_CONFIG.clientId,
    redirect_uri: X_CONFIG.redirectUri,
    scope: "tweet.read users.read follows.read like.read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  window.location.assign(`https://x.com/i/oauth2/authorize?${params}`);
}

export async function finishXAuth() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (error) {
    history.replaceState({}, "", `${window.location.pathname}#whitelist`);
    throw new Error(params.get("error_description") || "X authorization was not completed.");
  }
  const code = params.get("code");
  if (!code) return null;
  const returnedState = params.get("state");
  let transaction = null;
  if (returnedState) {
    try {
      transaction = JSON.parse(localStorage.getItem(pendingKey(returnedState)) || "null");
    } catch {
      transaction = null;
    }
  }
  const isFresh = transaction?.createdAt && Date.now() - transaction.createdAt <= PENDING_MAX_AGE;
  const verifier = isFresh ? transaction.verifier : "";
  if (!returnedState || !verifier) {
    history.replaceState({}, "", `${window.location.pathname}#whitelist`);
    throw new Error("X authorization session expired. Return to the whitelist and connect X again.");
  }

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: X_CONFIG.clientId,
    redirect_uri: X_CONFIG.redirectUri,
    code_verifier: verifier,
  });
  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "X did not return an access token.");
  sessionStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.removeItem(pendingKey(returnedState));
  clearExpiredTransactions();
  history.replaceState({}, "", `${window.location.pathname}#whitelist`);
  return data.access_token;
}

export function clearXSession() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function xRequest(path) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error("Connect your X account first.");
  const response = await fetch(`https://api.x.com${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem(TOKEN_KEY);
    throw new Error(data.detail || data.title || "X API verification failed.");
  }
  return data;
}

async function findInPages(path, match, maxPages = 20) {
  let next = "";
  for (let page = 0; page < maxPages; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const data = await xRequest(`${path}${next ? `${separator}pagination_token=${encodeURIComponent(next)}` : ""}`);
    if ((data.data || []).some(match)) return true;
    next = data.meta?.next_token || "";
    if (!next) return false;
  }
  return false;
}

export async function getXUser() {
  if (!sessionStorage.getItem(TOKEN_KEY)) return null;
  const result = await xRequest("/2/users/me?user.fields=username,name");
  return result.data || null;
}

export async function verifyFollow(userId) {
  const target = await xRequest(`/2/users/by/username/${encodeURIComponent(X_CONFIG.targetUsername)}`);
  const targetId = target.data?.id;
  if (!targetId) throw new Error("The official X account could not be found.");
  return findInPages(`/2/users/${encodeURIComponent(userId)}/following?max_results=1000`, (user) => user.id === targetId);
}

export async function verifyLikeAndQuote(userId) {
  if (!postConfigured()) throw new Error("The announcement post ID has not been added yet.");
  const postId = X_CONFIG.targetPostId;
  const [liked, quoted] = await Promise.all([
    findInPages(`/2/tweets/${postId}/liking_users?max_results=100`, (user) => user.id === userId),
    findInPages(`/2/tweets/${postId}/quote_tweets?max_results=100&tweet.fields=author_id`, (post) => post.author_id === userId),
  ]);
  return { liked, quoted };
}

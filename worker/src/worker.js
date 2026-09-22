const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_API_URL = "https://api.x.com";
const SESSION_COOKIE = "zkbears_x_session";
const OAUTH_STATE_TTL_SECONDS = 15 * 60;
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      return json({ error: error?.message || "Unexpected server error." }, status, request, env);
    }
  },
};

async function route(request, env) {
  assertConfiguration(env);
  const url = new URL(request.url);

  if (request.method === "OPTIONS") return corsPreflight(request, env);
  if (url.pathname === "/health" && request.method === "GET") {
    return json({ ok: true, service: "zkbears-x-auth" }, 200, request, env);
  }
  if (url.pathname === "/oauth/start" && request.method === "GET") return startOAuth(request, env);
  if (url.pathname === "/oauth/callback" && request.method === "GET") return finishOAuth(request, env);
  if (url.pathname === "/session" && request.method === "GET") {
    const session = await requireSession(request, env);
    return json({ user: session.user }, 200, request, env);
  }
  if (url.pathname === "/session" && request.method === "DELETE") {
    const response = json({ ok: true }, 200, request, env);
    response.headers.append("Set-Cookie", clearSessionCookie());
    return response;
  }
  if (url.pathname === "/verify/follow" && request.method === "POST") return verifyFollow(request, env);
  if (url.pathname === "/verify/engagement" && request.method === "POST") return verifyEngagement(request, env);
  return json({ error: "Not found." }, 404, request, env);
}

function assertConfiguration(env) {
  const missing = ["X_CLIENT_ID", "SESSION_SECRET", "PUBLIC_SITE_URL", "OAUTH_CALLBACK_URL"]
    .filter((name) => !String(env[name] || "").trim());
  if (missing.length) throw httpError(500, `Missing Worker settings: ${missing.join(", ")}.`);
}

async function startOAuth(request, env) {
  const url = new URL(request.url);
  const returnTo = new URL(url.searchParams.get("return_to") || env.PUBLIC_SITE_URL);
  if (!allowedOrigins(env).includes(returnTo.origin.replace(/\/$/, ""))) throw httpError(400, "Invalid return URL.");

  const verifier = randomValue(48);
  const state = await seal({
    type: "oauth-state",
    verifier,
    returnTo: `${returnTo.origin}${returnTo.pathname}`,
    expiresAt: unixTime() + OAUTH_STATE_TTL_SECONDS,
  }, env.SESSION_SECRET);
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.X_CLIENT_ID,
    redirect_uri: env.OAUTH_CALLBACK_URL,
    scope: "tweet.read users.read follows.read like.read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return Response.redirect(`${X_AUTHORIZE_URL}?${params}`, 302);
}

async function finishOAuth(request, env) {
  const url = new URL(request.url);
  const sealedState = url.searchParams.get("state") || "";
  const state = await open(sealedState, env.SESSION_SECRET);
  if (state?.type !== "oauth-state" || state.expiresAt < unixTime()) {
    throw httpError(400, "X authorization session expired. Start again from the whitelist.");
  }

  const returnUrl = new URL(state.returnTo);
  returnUrl.hash = "whitelist";
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    returnUrl.searchParams.set("x_auth", "cancelled");
    return Response.redirect(returnUrl.toString(), 302);
  }
  const code = url.searchParams.get("code");
  if (!code) throw httpError(400, "X did not return an authorization code.");

  const token = await xTokenRequest({
    code,
    grant_type: "authorization_code",
    client_id: env.X_CLIENT_ID,
    redirect_uri: env.OAUTH_CALLBACK_URL,
    code_verifier: state.verifier,
  });
  const me = await xRequest("/2/users/me?user.fields=username,name,profile_image_url", token.access_token);
  if (!me.data?.id) throw httpError(502, "X did not return the connected account.");

  const sessionToken = await seal({
    type: "session",
    accessToken: token.access_token,
    user: me.data,
    expiresAt: unixTime() + Math.min(Number(token.expires_in) || SESSION_TTL_SECONDS, SESSION_TTL_SECONDS),
  }, env.SESSION_SECRET);
  returnUrl.searchParams.set("x_auth", "success");
  const response = new Response(null, { status: 302, headers: { Location: returnUrl.toString() } });
  response.headers.append("Set-Cookie", sessionCookie(sessionToken));
  return response;
}

async function verifyFollow(request, env) {
  requireAllowedOrigin(request, env);
  const session = await requireSession(request, env);
  const username = String(env.TARGET_USERNAME || "zk_bears").replace(/^@/, "");
  const target = await xRequest(`/2/users/by/username/${encodeURIComponent(username)}`, session.accessToken);
  if (!target.data?.id) throw httpError(502, "The official X account could not be found.");
  const verified = await findInPages(
    `/2/users/${encodeURIComponent(session.user.id)}/following?max_results=1000`,
    session.accessToken,
    (user) => user.id === target.data.id,
  );
  return json({ verified }, 200, request, env);
}

async function verifyEngagement(request, env) {
  requireAllowedOrigin(request, env);
  const session = await requireSession(request, env);
  const postId = String(env.TARGET_POST_ID || "").trim();
  if (!/^\d+$/.test(postId)) throw httpError(503, "The announcement post ID has not been configured yet.");
  const [liked, quoted] = await Promise.all([
    findInPages(`/2/tweets/${postId}/liking_users?max_results=100`, session.accessToken, (user) => user.id === session.user.id),
    findInPages(`/2/tweets/${postId}/quote_tweets?max_results=100&tweet.fields=author_id`, session.accessToken, (post) => post.author_id === session.user.id),
  ]);
  return json({ liked, quoted, verified: liked && quoted }, 200, request, env);
}

async function requireSession(request, env) {
  requireAllowedOrigin(request, env);
  const token = parseCookies(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  const session = await open(token || "", env.SESSION_SECRET);
  if (session?.type !== "session" || session.expiresAt < unixTime() || !session.user?.id || !session.accessToken) {
    throw httpError(401, "Connect your X account again.");
  }
  return session;
}

async function findInPages(path, accessToken, match, maxPages = 20) {
  let next = "";
  for (let page = 0; page < maxPages; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const data = await xRequest(`${path}${next ? `${separator}pagination_token=${encodeURIComponent(next)}` : ""}`, accessToken);
    if ((data.data || []).some(match)) return true;
    next = data.meta?.next_token || "";
    if (!next) return false;
  }
  return false;
}

async function xTokenRequest(fields) {
  const response = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  const data = await safeJson(response);
  if (!response.ok || !data.access_token) throw httpError(502, data.error_description || data.error || "X token exchange failed.");
  return data;
}

async function xRequest(path, accessToken) {
  const response = await fetch(`${X_API_URL}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await safeJson(response);
  if (!response.ok) throw httpError(response.status === 429 ? 429 : 502, data.detail || data.title || "X API request failed.");
  return data;
}

async function safeJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || env.PUBLIC_SITE_URL)
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function requireAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins(env).includes(origin.replace(/\/$/, ""))) throw httpError(403, "Origin is not allowed.");
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigins(env).includes(origin.replace(/\/$/, ""))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function corsPreflight(request, env) {
  requireAllowedOrigin(request, env);
  return new Response(null, { status: 204, headers: {
    ...corsHeaders(request, env),
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  } });
}

function json(value, status, request, env) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(request, env) },
  });
}

function sessionCookie(value) {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function parseCookies(header) {
  return Object.fromEntries(header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index), part.slice(index + 1)];
  }));
}

async function secretKey(secret) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await secretKey(secret), plain));
  const joined = new Uint8Array(iv.length + encrypted.length);
  joined.set(iv);
  joined.set(encrypted, iv.length);
  return base64Url(joined);
}

async function open(value, secret) {
  try {
    const joined = fromBase64Url(value);
    const iv = joined.slice(0, 12);
    const encrypted = joined.slice(12);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await secretKey(secret), encrypted);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

function randomValue(size) {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function unixTime() { return Math.floor(Date.now() / 1000); }

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const COOKIE_NAME = "__Host-zkbears_whitelist_session";
const LEGACY_COOKIE_NAME = "zkbears_whitelist_session";
const OAUTH_STATE_TTL = 15 * 60;
const SESSION_TTL = 30 * 24 * 60 * 60;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") return preflight(request, env);
      if (url.pathname === "/health" && request.method === "GET") return json({ ok: true }, 200, request, env);
      validateEnvironment(env);
      if (url.pathname === "/auth/x/start" && request.method === "GET") return await startXAuth(request, env);
      if (url.pathname === "/auth/x/callback" && request.method === "GET") {
        try { return await finishXAuth(request, env); }
        catch { return authResultRedirect(env, "failed"); }
      }
      if (url.pathname === "/api/config" && request.method === "GET") return publicConfig(request, env);
      if (url.pathname === "/api/session" && request.method === "GET") return await sessionInfo(request, env);
      if (url.pathname === "/api/session" && request.method === "DELETE") return await logout(request, env);
      if (url.pathname === "/api/tasks/follow" && request.method === "POST") return await completeFollowVisit(request, env);
      if (url.pathname === "/api/tasks/engagement" && request.method === "POST") return await completeEngagementVisit(request, env);
      if (url.pathname === "/api/submit" && request.method === "POST") return await submitEntry(request, env);
      return json({ error: "Not found.", code: "not_found" }, 404, request, env);
    } catch (error) {
      return json({ error: error?.message || "Unexpected server error.", code: error?.code || "server_error" }, error?.status || 500, request, env);
    }
  },
};

function validateEnvironment(env) {
  const required = ["DB", "X_CLIENT_ID", "X_CLIENT_SECRET", "PUBLIC_SITE_URL", "OAUTH_CALLBACK_URL", "TARGET_USERNAME"];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw httpError(500, `Missing server settings: ${missing.join(", ")}.`, "configuration_error");
}

async function startXAuth(request, env) {
  const url = new URL(request.url);
  const returnTo = new URL(url.searchParams.get("return_to") || env.PUBLIC_SITE_URL);
  if (!allowedOrigins(env).includes(returnTo.origin)) throw httpError(400, "Invalid return URL.", "invalid_return_url");

  const state = randomToken(32);
  const verifier = randomToken(64);
  const challenge = await sha256Base64Url(verifier);
  const now = unixTime();
  await env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(now).run();
  await env.DB.prepare("INSERT INTO oauth_states (state, code_verifier, return_url, expires_at) VALUES (?, ?, ?, ?)")
    .bind(state, verifier, `${returnTo.origin}${returnTo.pathname}`, now + OAUTH_STATE_TTL).run();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.X_CLIENT_ID,
    redirect_uri: env.OAUTH_CALLBACK_URL,
    scope: "users.read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return redirect(`${X_AUTHORIZE_URL}?${params}`);
}

async function finishXAuth(request, env) {
  const url = new URL(request.url);
  const stateValue = url.searchParams.get("state") || "";
  const state = await env.DB.prepare("SELECT state, code_verifier, return_url, expires_at FROM oauth_states WHERE state = ?")
    .bind(stateValue).first();
  await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(stateValue).run();
  if (!state || state.expires_at < unixTime()) throw httpError(400, "Authorization session expired.", "oauth_state_invalid");

  if (url.searchParams.get("error")) return authResultRedirect(env, "cancelled", state.return_url);
  const code = url.searchParams.get("code");
  if (!code) throw httpError(400, "X did not return an authorization code.", "oauth_code_missing");

  const token = await tokenRequest(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: env.OAUTH_CALLBACK_URL,
    code_verifier: state.code_verifier,
  });
  // Completing OAuth already proves that an X account approved this app. Do
  // not call /2/users/me here: X bills that profile read and blocks it when the
  // developer credit balance is empty. The token fingerprint is only an
  // internal identifier and is never returned to the browser.
  const oauthIdentity = `oauth_${(await sha256Hex(`x-oauth:${token.access_token}`)).slice(0, 40)}`;

  const now = unixTime();
  const sessionId = randomToken(48);
  const sessionHash = await sha256Hex(sessionId);
  await env.DB.prepare(`
    INSERT INTO users (x_user_id, username, display_name, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(x_user_id) DO UPDATE SET username=excluded.username, display_name=excluded.display_name,
      avatar_url=excluded.avatar_url, updated_at=excluded.updated_at
  `).bind(oauthIdentity, "connected", "X account", "", now, now).run();
  await env.DB.prepare("INSERT INTO task_progress (x_user_id) VALUES (?) ON CONFLICT(x_user_id) DO NOTHING").bind(oauthIdentity).run();
  await env.DB.prepare("DELETE FROM sessions WHERE x_user_id = ? OR expires_at < ?").bind(oauthIdentity, now).run();
  await env.DB.prepare(`
    INSERT INTO sessions (session_hash, x_user_id, token_payload, token_expires_at, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(sessionHash, oauthIdentity, "", 0, now + SESSION_TTL, now).run();

  const response = authResultRedirect(env, "success", state.return_url);
  response.headers.append("Set-Cookie", sessionCookie(sessionId));
  response.headers.append("Set-Cookie", clearCookie(LEGACY_COOKIE_NAME));
  return response;
}

function publicConfig(request, env) {
  const username = cleanUsername(env.TARGET_USERNAME);
  const postId = String(env.TARGET_POST_ID || "").trim();
  return json({
    username,
    profileUrl: `https://x.com/${username}`,
    announcementUrl: /^\d+$/.test(postId) ? `https://x.com/${username}/status/${postId}` : `https://x.com/${username}`,
    engagementConfigured: /^\d+$/.test(postId),
  }, 200, request, env);
}

async function sessionInfo(request, env) {
  const session = await requireSession(request, env);
  const response = json(publicSession(session), 200, request, env);
  const jar = cookies(request);
  if (!jar[COOKIE_NAME] && jar[LEGACY_COOKIE_NAME]) {
    response.headers.append("Set-Cookie", sessionCookie(jar[LEGACY_COOKIE_NAME]));
    response.headers.append("Set-Cookie", clearCookie(LEGACY_COOKIE_NAME));
  }
  return response;
}

async function logout(request, env) {
  requireOrigin(request, env);
  const jar = cookies(request);
  const sessionId = jar[COOKIE_NAME] || jar[LEGACY_COOKIE_NAME];
  if (sessionId) await env.DB.prepare("DELETE FROM sessions WHERE session_hash = ?").bind(await sha256Hex(sessionId)).run();
  const response = json({ ok: true }, 200, request, env);
  response.headers.append("Set-Cookie", clearCookie(COOKIE_NAME));
  response.headers.append("Set-Cookie", clearCookie(LEGACY_COOKIE_NAME));
  return response;
}

async function completeFollowVisit(request, env) {
  requireOrigin(request, env);
  const session = await requireSession(request, env);
  await env.DB.prepare("UPDATE task_progress SET follow_verified = ?, updated_at = ? WHERE x_user_id = ?")
    .bind(1, unixTime(), session.x_user_id).run();
  return json({ verified: true }, 200, request, env);
}

async function completeEngagementVisit(request, env) {
  requireOrigin(request, env);
  const session = await requireSession(request, env);
  const postId = String(env.TARGET_POST_ID || "").trim();
  if (!/^\d+$/.test(postId)) throw httpError(503, "The announcement post has not been configured yet.", "post_not_configured");
  const progress = await env.DB.prepare("SELECT follow_verified, engagement_verified FROM task_progress WHERE x_user_id = ?")
    .bind(session.x_user_id).first();
  if (!progress?.follow_verified) throw httpError(409, "Complete the follow task first.", "follow_incomplete");
  await env.DB.prepare("UPDATE task_progress SET engagement_verified = ?, updated_at = ? WHERE x_user_id = ?")
    .bind(1, unixTime(), session.x_user_id).run();
  return json({ verified: true }, 200, request, env);
}

async function submitEntry(request, env) {
  requireOrigin(request, env);
  const session = await requireSession(request, env);
  const body = await readJson(request);
  const walletAddress = String(body.walletAddress || "").trim().toLowerCase();
  if (!validUnifiedAddress(walletAddress)) throw httpError(400, "Enter a valid Zcash Unified Address.", "wallet_invalid");

  const progress = await env.DB.prepare("SELECT follow_verified, engagement_verified FROM task_progress WHERE x_user_id = ?")
    .bind(session.x_user_id).first();
  if (!/^\d+$/.test(String(env.TARGET_POST_ID || "").trim())) {
    throw httpError(503, "The announcement post has not been configured yet.", "post_not_configured");
  }
  if (!progress?.follow_verified || !progress?.engagement_verified) {
    throw httpError(409, "Complete all X tasks in order first.", "tasks_incomplete");
  }
  try {
    await env.DB.prepare("UPDATE task_progress SET wallet_address = ?, submitted_at = ?, updated_at = ? WHERE x_user_id = ?")
      .bind(walletAddress, unixTime(), unixTime(), session.x_user_id).run();
  } catch (error) {
    if (/unique/i.test(error?.message || "")) throw httpError(409, "This wallet is already used by another whitelist entry.", "wallet_already_used");
    throw error;
  }
  return json({ saved: true }, 200, request, env);
}

async function requireSession(request, env) {
  const jar = cookies(request);
  const sessionId = jar[COOKIE_NAME] || jar[LEGACY_COOKIE_NAME];
  if (!sessionId) throw httpError(401, "Connect your X account first.", "not_authenticated");
  const row = await env.DB.prepare(`
    SELECT s.session_hash, s.x_user_id, s.token_payload, s.token_expires_at, s.expires_at,
      u.username, u.display_name, u.avatar_url,
      p.follow_verified, p.engagement_verified, p.wallet_address, p.submitted_at
    FROM sessions s JOIN users u ON u.x_user_id = s.x_user_id
    JOIN task_progress p ON p.x_user_id = s.x_user_id
    WHERE s.session_hash = ?
  `).bind(await sha256Hex(sessionId)).first();
  if (!row || row.expires_at < unixTime()) throw httpError(401, "Your session expired. Connect X again.", "session_expired");
  return row;
}

async function tokenRequest(env, fields) {
  const response = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });
  const data = await safeJson(response);
  if (!response.ok || !data.access_token) throw httpError(502, data.error_description || "X token exchange failed.", "x_token_error");
  return data;
}

function publicSession(session) {
  return {
    user: { id: session.x_user_id, username: session.username, name: session.display_name, avatarUrl: session.avatar_url },
    tasks: {
      follow: Boolean(session.follow_verified),
      engagement: Boolean(session.engagement_verified),
      walletAddress: session.wallet_address || "",
      submitted: Boolean(session.submitted_at),
    },
  };
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || env.PUBLIC_SITE_URL).split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean);
}

function requireOrigin(request, env) {
  const origin = request.headers.get("Origin")?.replace(/\/$/, "");
  if (!origin || !allowedOrigins(env).includes(origin)) throw httpError(403, "Request origin is not allowed.", "origin_denied");
}

function cors(request, env) {
  const origin = request.headers.get("Origin")?.replace(/\/$/, "");
  if (!origin || !allowedOrigins(env).includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" };
}

function preflight(request, env) {
  requireOrigin(request, env);
  return new Response(null, { status: 204, headers: { ...cors(request, env), "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } });
}

function json(payload, status, request, env) {
  return new Response(JSON.stringify(payload), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...cors(request, env),
  } });
}

function redirect(location) { return new Response(null, { status: 302, headers: {
  Location: location,
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} }); }

function authResultRedirect(env, result, returnTo = env.PUBLIC_SITE_URL) {
  const url = new URL(returnTo);
  url.searchParams.set("x_auth", result);
  url.hash = "whitelist";
  return redirect(url.toString());
}

function sessionCookie(value) { return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL}`; }
function clearCookie(name = COOKIE_NAME) { return `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`; }

function cookies(request) {
  const entries = (request.headers.get("Cookie") || "").split(";").map((value) => value.trim()).filter(Boolean).map((value) => {
    const separator = value.indexOf("=");
    return separator > 0 ? [value.slice(0, separator), value.slice(separator + 1)] : [value, ""];
  });
  return Object.fromEntries(entries);
}

async function readJson(request) {
  try { return await request.json(); }
  catch { throw httpError(400, "Invalid JSON body.", "invalid_json"); }
}

async function safeJson(response) { try { return await response.json(); } catch { return {}; } }
function cleanUsername(value) { return String(value || "").trim().replace(/^@/, ""); }
function unixTime() { return Math.floor(Date.now() / 1000); }
function httpError(status, message, code) { const error = new Error(message); error.status = status; error.code = code; return error; }

function randomToken(size) { return base64Url(crypto.getRandomValues(new Uint8Array(size))); }
function base64Url(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
async function sha256(value) { return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
async function sha256Base64Url(value) { return base64Url(await sha256(value)); }
async function sha256Hex(value) { return [...await sha256(value)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32M_CONSTANT = 0x2bc830a3;
const BECH32_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
function polymod(values) { let checksum = 1; for (const value of values) { const high = checksum >>> 25; checksum = (((checksum & 0x1ffffff) << 5) ^ value) >>> 0; for (let bit = 0; bit < 5; bit += 1) if ((high >>> bit) & 1) checksum = (checksum ^ BECH32_GENERATORS[bit]) >>> 0; } return checksum >>> 0; }
function expandHrp(hrp) { return [...Array.from(hrp, (character) => character.charCodeAt(0) >>> 5), 0, ...Array.from(hrp, (character) => character.charCodeAt(0) & 31)]; }
function validUnifiedAddress(value) { const input = value.trim(); if (input.length < 69 || input.length > 1000) return false; if (input !== input.toLowerCase() && input !== input.toUpperCase()) return false; const address = input.toLowerCase(); const separator = address.lastIndexOf("1"); if (separator !== 1 || address.slice(0, separator) !== "u" || separator + 7 > address.length) return false; const data = Array.from(address.slice(separator + 1), (character) => BECH32_CHARSET.indexOf(character)); return !data.some((part) => part < 0) && polymod([...expandHrp("u"), ...data]) === BECH32M_CONSTANT; }

export const testables = { cleanUsername, validUnifiedAddress, sha256Hex };

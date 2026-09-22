import assert from "node:assert/strict";
import test from "node:test";
import worker, { testables } from "../src/worker.js";

class MemoryDb {
  constructor() {
    this.states = new Map();
    this.users = new Map();
    this.sessions = new Map();
    this.progress = new Map();
  }
  prepare(sql) { return new MemoryStatement(this, sql.replace(/\s+/g, " ").trim()); }
}

class MemoryStatement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async run() {
    const [a, b, c, d, e, f] = this.values;
    if (this.sql.startsWith("DELETE FROM oauth_states WHERE expires_at")) {
      for (const [key, value] of this.db.states) if (value.expires_at < a) this.db.states.delete(key);
    } else if (this.sql.startsWith("INSERT INTO oauth_states")) {
      this.db.states.set(a, { state: a, code_verifier: b, return_url: c, expires_at: d });
    } else if (this.sql.startsWith("DELETE FROM oauth_states WHERE state")) {
      this.db.states.delete(a);
    } else if (this.sql.startsWith("INSERT INTO users")) {
      this.db.users.set(a, { x_user_id: a, username: b, display_name: c, avatar_url: d, created_at: e, updated_at: f });
    } else if (this.sql.startsWith("INSERT INTO task_progress")) {
      if (!this.db.progress.has(a)) this.db.progress.set(a, { x_user_id: a, follow_verified: 0, engagement_verified: 0, wallet_address: null, submitted_at: null });
    } else if (this.sql.startsWith("DELETE FROM sessions WHERE x_user_id")) {
      for (const [key, value] of this.db.sessions) if (value.x_user_id === a || value.expires_at < b) this.db.sessions.delete(key);
    } else if (this.sql.startsWith("INSERT INTO sessions")) {
      this.db.sessions.set(a, { session_hash: a, x_user_id: b, token_payload: c, token_expires_at: d, expires_at: e, created_at: f });
    } else if (this.sql.startsWith("DELETE FROM sessions WHERE session_hash")) {
      this.db.sessions.delete(a);
    } else if (this.sql.startsWith("UPDATE task_progress SET follow_verified")) {
      Object.assign(this.db.progress.get(c), { follow_verified: a, updated_at: b });
    } else if (this.sql.startsWith("UPDATE task_progress SET engagement_verified")) {
      Object.assign(this.db.progress.get(c), { engagement_verified: a, updated_at: b });
    } else if (this.sql.startsWith("UPDATE task_progress SET wallet_address")) {
      for (const value of this.db.progress.values()) if (value.wallet_address === a && value.x_user_id !== d) throw new Error("UNIQUE constraint failed");
      Object.assign(this.db.progress.get(d), { wallet_address: a, submitted_at: b, updated_at: c });
    } else if (this.sql.startsWith("UPDATE sessions SET token_payload")) {
      Object.assign(this.db.sessions.get(c), { token_payload: a, token_expires_at: b });
    } else throw new Error(`Unhandled run SQL: ${this.sql}`);
    return { success: true };
  }
  async first() {
    const [a] = this.values;
    if (this.sql.startsWith("SELECT state, code_verifier")) return this.db.states.get(a) || null;
    if (this.sql.includes("FROM sessions s JOIN users")) {
      const session = this.db.sessions.get(a);
      if (!session) return null;
      return { ...session, ...this.db.users.get(session.x_user_id), ...this.db.progress.get(session.x_user_id) };
    }
    if (this.sql.startsWith("SELECT follow_verified")) return this.db.progress.get(a) || null;
    throw new Error(`Unhandled first SQL: ${this.sql}`);
  }
}

const db = new MemoryDb();
const env = {
  DB: db,
  X_CLIENT_ID: "new-client-id",
  X_CLIENT_SECRET: "new-client-secret",
  TOKEN_ENCRYPTION_KEY: "a-new-32-character-minimum-encryption-key",
  PUBLIC_SITE_URL: "https://zkbears.xyz",
  ALLOWED_ORIGINS: "https://zkbears.xyz",
  OAUTH_CALLBACK_URL: "https://api.zkbears.xyz/auth/x/callback",
  TARGET_USERNAME: "zk_bears",
  TARGET_POST_ID: "1234567890",
};

const apiRequest = (path, init = {}) => new Request(`https://api.zkbears.xyz${path}`, init);

function encodeBech32m(hrp, payloadLength = 70) {
  const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  const polymod = (values) => { let check = 1; for (const value of values) { const high = check >>> 25; check = (((check & 0x1ffffff) << 5) ^ value) >>> 0; for (let bit = 0; bit < 5; bit += 1) if ((high >>> bit) & 1) check = (check ^ generators[bit]) >>> 0; } return check >>> 0; };
  const expanded = [...Array.from(hrp, (c) => c.charCodeAt(0) >>> 5), 0, ...Array.from(hrp, (c) => c.charCodeAt(0) & 31)];
  const data = Array.from({ length: payloadLength }, (_, index) => (index * 7 + 3) % 32);
  const value = (polymod([...expanded, ...data, 0, 0, 0, 0, 0, 0]) ^ 0x2bc830a3) >>> 0;
  const checksum = Array.from({ length: 6 }, (_, index) => (value >>> (5 * (5 - index))) & 31);
  return `${hrp}1${[...data, ...checksum].map((part) => charset[part]).join("")}`;
}

async function authorize(environment = env) {
  const start = await worker.fetch(apiRequest("/auth/x/start?return_to=https%3A%2F%2Fzkbears.xyz%2F"), environment);
  assert.equal(start.status, 302);
  const authorizeUrl = new URL(start.headers.get("Location"));
  assert.equal(authorizeUrl.origin, "https://x.com");
  assert.equal(authorizeUrl.searchParams.get("client_id"), environment.X_CLIENT_ID);
  assert.match(authorizeUrl.searchParams.get("scope"), /offline\.access/);
  const state = authorizeUrl.searchParams.get("state");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith("/2/oauth2/token")) {
      assert.match(init.headers.Authorization, /^Basic /);
      return Response.json({ access_token: "access-token", refresh_token: "refresh-token", expires_in: 7200 });
    }
    if (value.includes("/2/users/me")) return Response.json({ data: { id: "42", username: "collector", name: "Collector", profile_image_url: "https://img.example/avatar.png" } });
    throw new Error(`Unexpected fetch ${value}`);
  };
  try {
    const callback = await worker.fetch(apiRequest(`/auth/x/callback?code=fresh-code&state=${encodeURIComponent(state)}`), environment);
    assert.equal(callback.status, 302);
    assert.equal(new URL(callback.headers.get("Location")).searchParams.get("x_auth"), "success");
    const cookie = callback.headers.get("Set-Cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    return cookie.split(";")[0];
  } finally { globalThis.fetch = originalFetch; }
}

test("token encryption round trip and rejects wrong key", async () => {
  const sealed = await testables.seal({ token: "secret" }, "correct-key");
  assert.deepEqual(await testables.open(sealed, "correct-key"), { token: "secret" });
  assert.equal(await testables.open(sealed, "wrong-key"), null);
});

test("Unified Address validation verifies Bech32m checksum", () => {
  const address = encodeBech32m("u");
  assert.equal(testables.validUnifiedAddress(address), true);
  assert.equal(testables.validUnifiedAddress(`${address.slice(0, -1)}q`), false);
  assert.equal(testables.validUnifiedAddress("u1not-a-real-address"), false);
});

test("OAuth rejects foreign return URLs and invalid state", async () => {
  const foreign = await worker.fetch(apiRequest("/auth/x/start?return_to=https%3A%2F%2Fevil.example%2F"), env);
  assert.equal(foreign.status, 400);
  const invalid = await worker.fetch(apiRequest("/auth/x/callback?code=x&state=bad"), env);
  assert.equal(invalid.status, 302);
  assert.equal(new URL(invalid.headers.get("Location")).searchParams.get("x_auth"), "failed");
});

test("complete authentication, verification and submission flow", async () => {
  const cookie = await authorize();
  const headers = { Origin: env.PUBLIC_SITE_URL, Cookie: cookie };
  const session = await worker.fetch(apiRequest("/api/session", { headers }), env);
  assert.equal(session.status, 200);
  const sessionPayload = await session.json();
  assert.equal(sessionPayload.user.username, "collector");
  assert.doesNotMatch(JSON.stringify(sessionPayload), /access-token|refresh-token|token_payload/);

  const prematureWallet = encodeBech32m("u");
  const premature = await worker.fetch(apiRequest("/api/submit", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: prematureWallet }),
  }), env);
  assert.equal(premature.status, 409);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("/users/by/username/zk_bears")) return Response.json({ data: { id: "99" } });
    if (value.includes("/users/42/following")) return Response.json({ data: [{ id: "99" }] });
    if (value.includes("/liking_users")) return Response.json({ data: [{ id: "42" }] });
    if (value.includes("/quote_tweets")) return Response.json({ data: [{ author_id: "42" }] });
    throw new Error(`Unexpected fetch ${value}`);
  };
  try {
    const follow = await worker.fetch(apiRequest("/api/tasks/follow", { method: "POST", headers }), env);
    assert.deepEqual(await follow.json(), { verified: true });
    const engagement = await worker.fetch(apiRequest("/api/tasks/engagement", { method: "POST", headers }), env);
    assert.deepEqual(await engagement.json(), { liked: true, quoted: true, verified: true });
  } finally { globalThis.fetch = originalFetch; }

  const walletAddress = encodeBech32m("u");
  const submitted = await worker.fetch(apiRequest("/api/submit", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress }) }), env);
  assert.equal(submitted.status, 200);
  assert.deepEqual(await submitted.json(), { saved: true });
  const restored = await worker.fetch(apiRequest("/api/session", { headers }), env);
  assert.equal((await restored.json()).tasks.submitted, true);
});

test("API rejects missing session and foreign origins", async () => {
  const missing = await worker.fetch(apiRequest("/api/tasks/follow", { method: "POST", headers: { Origin: env.PUBLIC_SITE_URL } }), env);
  assert.equal(missing.status, 401);
  const foreign = await worker.fetch(apiRequest("/api/tasks/follow", { method: "POST", headers: { Origin: "https://evil.example" } }), env);
  assert.equal(foreign.status, 403);
});


test("submission works when the announcement task is not configured", async () => {
  const environment = { ...env, DB: new MemoryDb(), TARGET_POST_ID: "" };
  const config = await worker.fetch(apiRequest("/api/config"), environment);
  assert.equal((await config.json()).engagementConfigured, false);
  const cookie = await authorize(environment);
  const headers = { Origin: environment.PUBLIC_SITE_URL, Cookie: cookie };
  const prematureWallet = encodeBech32m("u");
  const premature = await worker.fetch(apiRequest("/api/submit", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: prematureWallet }),
  }), environment);
  assert.equal(premature.status, 409);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("/users/by/username/zk_bears")) return Response.json({ data: { id: "99" } });
    if (value.includes("/users/42/following")) return Response.json({ data: [{ id: "99" }] });
    throw new Error(`Unexpected fetch ${value}`);
  };
  try {
    const follow = await worker.fetch(apiRequest("/api/tasks/follow", { method: "POST", headers }), environment);
    assert.deepEqual(await follow.json(), { verified: true });
  } finally { globalThis.fetch = originalFetch; }

  const walletAddress = encodeBech32m("u");
  const submitted = await worker.fetch(apiRequest("/api/submit", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  }), environment);
  assert.equal(submitted.status, 200);
  assert.deepEqual(await submitted.json(), { saved: true });
});


test("X credit exhaustion is returned as a safe service error", async () => {
  const environment = { ...env, DB: new MemoryDb() };
  const cookie = await authorize(environment);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { title: "CreditsDepleted", detail: "Credits depleted" },
    { status: 402 },
  );
  try {
    const response = await worker.fetch(apiRequest("/api/tasks/follow", {
      method: "POST",
      headers: { Origin: environment.PUBLIC_SITE_URL, Cookie: cookie },
    }), environment);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "x_api_credits_depleted");
  } finally { globalThis.fetch = originalFetch; }
});

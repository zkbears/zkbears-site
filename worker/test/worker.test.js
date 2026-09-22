import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.js";

const env = {
  X_CLIENT_ID: "test-client",
  SESSION_SECRET: "a-long-test-secret-that-is-never-used-in-production",
  PUBLIC_SITE_URL: "https://zkbears.xyz",
  ALLOWED_ORIGINS: "https://zkbears.xyz",
  OAUTH_CALLBACK_URL: "https://api.zkbears.xyz/oauth/callback",
  TARGET_USERNAME: "zk_bears",
  TARGET_POST_ID: "1234567890",
};

function request(path, init = {}) {
  return new Request(`https://api.zkbears.xyz${path}`, init);
}

async function createSession() {
  const start = await worker.fetch(request("/oauth/start?return_to=https%3A%2F%2Fzkbears.xyz%2F"), env);
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get("Location"));
  assert.equal(authorize.origin, "https://x.com");
  assert.equal(authorize.searchParams.get("client_id"), env.X_CLIENT_ID);
  assert.equal(authorize.searchParams.get("redirect_uri"), env.OAUTH_CALLBACK_URL);
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");

  const state = authorize.searchParams.get("state");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/2/oauth2/token")) {
      return Response.json({ access_token: "x-access-token", expires_in: 7200 });
    }
    if (value.includes("/2/users/me")) {
      return Response.json({ data: { id: "42", username: "tester", name: "Tester" } });
    }
    throw new Error(`Unexpected fetch: ${value}`);
  };
  try {
    const callback = await worker.fetch(request(`/oauth/callback?code=code-from-x&state=${encodeURIComponent(state)}`), env);
    assert.equal(callback.status, 302);
    assert.equal(new URL(callback.headers.get("Location")).searchParams.get("x_auth"), "success");
    const setCookie = callback.headers.get("Set-Cookie");
    assert.match(setCookie, /^zkbears_x_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    return setCookie.split(";")[0];
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("OAuth start rejects a foreign return URL", async () => {
  const response = await worker.fetch(request("/oauth/start?return_to=https%3A%2F%2Fevil.example%2F"), env);
  assert.equal(response.status, 400);
});

test("OAuth callback creates an HttpOnly session and /session restores the user", async () => {
  const cookie = await createSession();
  const response = await worker.fetch(request("/session", { headers: { Origin: env.PUBLIC_SITE_URL, Cookie: cookie } }), env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).user, { id: "42", username: "tester", name: "Tester" });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), env.PUBLIC_SITE_URL);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
});

test("follow verification checks the connected account and target account", async () => {
  const cookie = await createSession();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("/2/users/by/username/zk_bears")) return Response.json({ data: { id: "99" } });
    if (value.includes("/2/users/42/following")) return Response.json({ data: [{ id: "99", username: "zk_bears" }] });
    throw new Error(`Unexpected fetch: ${value}`);
  };
  try {
    const response = await worker.fetch(request("/verify/follow", {
      method: "POST",
      headers: { Origin: env.PUBLIC_SITE_URL, Cookie: cookie },
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { verified: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("engagement verification requires both a like and a quote", async () => {
  const cookie = await createSession();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("/liking_users")) return Response.json({ data: [{ id: "42" }] });
    if (value.includes("/quote_tweets")) return Response.json({ data: [{ author_id: "42" }] });
    throw new Error(`Unexpected fetch: ${value}`);
  };
  try {
    const response = await worker.fetch(request("/verify/engagement", {
      method: "POST",
      headers: { Origin: env.PUBLIC_SITE_URL, Cookie: cookie },
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { liked: true, quoted: true, verified: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OAuth callback rejects a tampered state", async () => {
  const response = await worker.fetch(request("/oauth/callback?code=test&state=tampered"), env);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /expired/i);
});

test("verification API rejects missing sessions and foreign origins", async () => {
  const missing = await worker.fetch(request("/verify/follow", { method: "POST", headers: { Origin: env.PUBLIC_SITE_URL } }), env);
  assert.equal(missing.status, 401);
  const foreign = await worker.fetch(request("/session", { headers: { Origin: "https://evil.example" } }), env);
  assert.equal(foreign.status, 403);
});

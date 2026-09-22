import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(ids.length, new Set(ids).size, "index.html contains duplicate IDs");
assert.match(html, /src="\.\/whitelist\.js"/, "new whitelist module is not loaded");
assert.doesNotMatch(html, /x-oauth\.js|x-config\.js/, "old OAuth modules are still referenced");

for (const [, source] of html.matchAll(/\b(?:src|href)="([^"#?]+)"/g)) {
  if (source.startsWith("./")) assert.ok(existsSync(resolve(root, source)), `Missing local file: ${source}`);
}

const browserApi = readFileSync(resolve(root, "whitelist-api.js"), "utf8");
assert.doesNotMatch(browserApi, /api\.x\.com|oauth2\/token|client[_A-Z-]*secret/i, "browser code must not contain X API calls or secrets");
assert.match(browserApi, /credentials:\s*"include"/, "browser API must send the HttpOnly session cookie");

const config = readFileSync(resolve(root, "whitelist-config.js"), "utf8");
assert.doesNotMatch(config, /LUZFT|clientId|clientSecret/, "old X credentials remain in public config");

console.log("Whitelist static checks passed.");


const whitelistUi = readFileSync(resolve(root, "whitelist.js"), "utf8");
assert.doesNotMatch(whitelistUi, /restoreNoirConnection/, "wallet must not be silently marked as connected");
assert.match(whitelistUi, /state\.wallet = false;[\s\S]*Address format is valid\. Connect Noir Wallet/, "manual address entry must require Noir connection");
assert.match(whitelistUi, /elements\.walletInput\.disabled = !walletUnlocked/, "wallet must remain locked until follow verification");
assert.match(html, /data-check-task="follow"[^>]*disabled>↻<\/button>/, "follow verification must use a locked refresh control");

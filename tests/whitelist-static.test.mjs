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
assert.match(whitelistUi, /const walletUnlocked = state\.engagement && state\.engagementConfigured/, "wallet must remain locked until engagement completion");
assert.match(html, /data-check-task="follow"[^>]*disabled><\/button>/, "follow task must use a status-only check control");
assert.match(html, /data-step="engagement"/, "engagement task must always be present");
assert.match(html, /LIKE \+ REPOST/, "engagement task must request like and repost");
assert.match(html, /POST COMING SOON/, "engagement task must explain that the post is pending");
assert.match(whitelistUi, /rememberFollowVisit\(\)/, "opening the X task must record the visit");
assert.match(whitelistUi, /rememberEngagementVisit\(\)/, "opening the announcement must record the visit");
assert.match(whitelistUi, /window\.addEventListener\("focus"/, "returning from X must complete the pending task");
assert.match(browserApi, /completeFollowVisit\(\)/, "browser API must expose visit completion");
assert.match(browserApi, /completeEngagementVisit\(\)/, "browser API must expose announcement visit completion");
assert.doesNotMatch(readFileSync(resolve(root, "whitelist-api/src/worker.js"), "utf8"), /xRequest\("\/2\/users\/me/, "OAuth callback must not use a paid profile lookup");
assert.doesNotMatch(readFileSync(resolve(root, "whitelist-api/src/worker.js"), "utf8"), /liking_users|quote_tweets|retweeted_by/, "task completion must not use paid X engagement endpoints");

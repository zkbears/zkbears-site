import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlFiles = ["index.html", "checker.html", "terms.html"];

for (const name of htmlFiles) {
  const html = readFileSync(resolve(root, name), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${name} contains duplicate IDs`);
  assert.doesNotMatch(html, /<body[^>]*\bpage-enter\b/, `${name} must not replay the load animation`);

  for (const [, attribute, source] of html.matchAll(/\b(src|href)="([^"#?]+)"/g)) {
    if (!source.startsWith("./")) continue;
    const file = resolve(root, source);
    assert.ok(existsSync(file), `${name} ${attribute} points to missing file ${source}`);
  }
}

const css = readFileSync(resolve(root, "style.css"), "utf8");
assert.doesNotMatch(css, /body\.page-enter|@keyframes\s+page-enter/, "entry animation must stay removed");
assert.match(css, /\.supply-sign__content[\s\S]*?translateX\(-24px\)/, "desktop sign optical alignment is missing");
assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, "style.css has unbalanced braces");

const oauth = readFileSync(resolve(root, "x-oauth.js"), "utf8");
assert.doesNotMatch(oauth, /api\.x\.com|oauth2\/token/, "the browser must not call X API directly");
assert.match(oauth, /credentials:\s*"include"/, "the browser must use the HttpOnly server session");

console.log(`Site smoke checks passed for ${htmlFiles.length} pages.`);

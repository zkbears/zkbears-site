# ZKBEARS — collection website

A static, responsive introduction and whitelist checklist for a planned collection of 3,333 pixel bears in the Zcash ecosystem.

The homepage contains the collection story, supply, twelve numbered artwork slots, X OAuth/API task verification, and a Noir Wallet Unified Address field. The OAuth 2.0 PKCE implementation verifies the authenticated X account, follows, likes, and quote posts after `dist/x-config.js` receives the site's X Client ID and announcement post ID. Whitelist progress is stored only in the visitor's browser. Terms open instantly in an on-page dialog, with a separate direct-link page retained as a fallback.

The Checker page uses the original generated asset `dist/assets/checker-bear.png`.

Serve `dist/` with any static server. For local development, run `node preview.mjs`.

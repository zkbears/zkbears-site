# ZKBEARS X verification Worker

This Worker performs the OAuth code exchange and X API verification outside the browser. It keeps the X access token inside an encrypted, HttpOnly cookie.

## Required settings

1. Create a Cloudflare Worker and attach the custom domain `api.zkbears.xyz`.
2. In the X app OAuth 2.0 settings, add this exact callback URL:
   `https://api.zkbears.xyz/oauth/callback`
3. Add Worker secrets:
   - `X_CLIENT_ID`: the X OAuth 2.0 Client ID.
   - `SESSION_SECRET`: a random secret of at least 32 characters.
4. Set `TARGET_POST_ID` in `wrangler.toml` to the numeric ID from the announcement post URL.
5. Deploy from this directory with Wrangler.

The X app must be configured as a public OAuth 2.0 client with Web App / Automated App or Bot selected. The Worker never needs the X client secret because it uses PKCE.

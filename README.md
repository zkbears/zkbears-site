# Zc — collection website

Static, responsive marketplace preview for a planned 3,333-piece Zcash collection. Serve `dist/` using any static server. Development: `node preview.mjs`.

Implemented: home, six marketplace views, searchable and sortable concept inventory, trait filtering, NFT dialogs, FAQ, draft Terms, official Noir extension install flow, real Noir provider account request/restore/disconnect and account-change handling. No wallet credentials or addresses are persisted. Connection is not server authentication.

## Required for live trading

Collection metadata and artwork, verified collection identifier and ownership/transfer protocol, an indexed order and settlement service, seller authorization and server nonce/signature verification, final operator/legal details, fees and NFT license. No purchases, bids, listings or payments are submitted by this preview. Demo records never represent live chain activity.

Wallet RPC follows https://docs.zknoir.com/developers/provider-api/ and https://github.com/NoirWallet/noir-wallet-sdk. End-to-end approval requires the Noir extension installed in the same browser.

## Artwork provenance

`dist/assets/collection.png` is an original six-portrait demo contact sheet generated using built-in Imagegen. It is concept artwork, not the actual collection metadata.

Prompt: One precise 3-by-2 contact sheet, six equal square anonymous cyberpunk pixel-art portraits without gutters or text; olive hood and skull mask, charcoal cap and yellow visor, moss hood and respirator, rust hood and dark bandana, navy helmet, plum hoodie and cream bandana. Chunky retro pixels, dark backgrounds, cream highlights and acid-yellow accents.

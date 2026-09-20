// Official Noir provider contract: https://docs.zknoir.com/developers/provider-api/
// No signing, balance/history reads or payment requests are made by this preview.
const provider = () => window.noirwallet?.zcash;
function normalize(value) {
  const shielded = value?.shielded || value?.accounts?.[0]?.addresses?.shielded;
  if (typeof shielded !== 'string' || !shielded.trim()) return null;
  return { ...value, shielded };
}
export async function connectNoir() {
  const wallet = provider();
  if (typeof wallet?.request !== 'function') throw new Error('Noir was not detected. Install the extension in this browser, unlock it, and reload this page before connecting.');
  try {
    const connection = normalize(await wallet.request({ method: 'zcash_requestAccounts' }));
    if (!connection) throw new Error('No shielded account was shared. Unlock Noir and choose an account to connect.');
    return connection;
  } catch (error) {
    if (error?.code === 4001 || /reject|denied|cancel/i.test(error?.message || '')) throw new Error('Connection was declined. You can try again whenever you are ready.');
    throw error;
  }
}
export async function restoreNoir() {
  const wallet = provider();
  return typeof wallet?.request === 'function' ? normalize(await wallet.request({ method: 'zcash_getAccounts' })) : null;
}
export async function disconnectNoir() {
  const wallet = provider();
  if (typeof wallet?.request === 'function') await wallet.request({ method: 'zcash_disconnect' });
}
export function observeNoir(refresh) {
  let watched;
  const attach = () => {
    const wallet = provider();
    if (!wallet || wallet === watched) return;
    if (watched?.removeListener) watched.removeListener('accountsChanged', refresh);
    watched = wallet;
    wallet.on?.('accountsChanged', refresh);
    refresh();
  };
  attach();
  window.addEventListener('focus', attach);
  window.addEventListener('load', attach, { once: true });
  window.addEventListener('pagehide', () => watched?.removeListener?.('accountsChanged', refresh), { once: true });
}

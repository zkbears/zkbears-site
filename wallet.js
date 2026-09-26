const provider = () => window.noirwallet?.zcash || null;

function extractUnifiedAddress(value) {
  const candidates = [
    value?.unified,
    value?.shielded,
    value?.address,
    value?.accounts?.[0]?.addresses?.unified,
    value?.accounts?.[0]?.addresses?.shielded,
    value?.accounts?.[0]?.address,
  ];

  return candidates.find((candidate) => (
    typeof candidate === "string" && /^u1[023456789acdefghjklmnpqrstuvwxyz]{50,250}$/i.test(candidate.trim())
  ))?.trim() || null;
}

function connectionResult(value) {
  const address = extractUnifiedAddress(value);
  if (!address) return null;
  return {
    address,
    accountId: value?.accounts?.[0]?.id || value?.accounts?.[0]?.accountId || "",
  };
}

async function requestAccounts(wallet, silent = false) {
  if (silent && typeof wallet.getAccounts === "function") return wallet.getAccounts();
  if (!silent && typeof wallet.connect === "function") return wallet.connect();
  if (typeof wallet.request === "function") {
    return wallet.request({ method: silent ? "zcash_getAccounts" : "zcash_requestAccounts" });
  }
  throw new Error("The installed Noir Wallet does not expose a supported Zcash provider.");
}

export function noirInstalled() {
  return Boolean(provider());
}

export async function restoreNoirConnection() {
  const wallet = provider();
  if (!wallet) return null;
  try {
    const accounts = await requestAccounts(wallet, true);
    return connectionResult(accounts);
  } catch {
    return null;
  }
}

export async function connectNoir() {
  const wallet = provider();
  if (!wallet) {
    throw new Error("Noir Wallet was not detected. Install and unlock the official extension, then click CONNECT NOIR again.");
  }

  try {
    const accounts = await requestAccounts(wallet, false);
    const connection = connectionResult(accounts);
    if (!connection) throw new Error("Noir Wallet did not share a valid Unified Address beginning with u1.");
    return connection;
  } catch (error) {
    if (error?.code === 4001 || /reject|denied|cancel/i.test(error?.message || "")) {
      throw new Error("Connection was declined in Noir Wallet. Please try again.");
    }
    throw error;
  }
}

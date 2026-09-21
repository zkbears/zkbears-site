const provider = () => window.noirwallet?.zcash;

function extractUnifiedAddress(value) {
  const candidates = [
    value?.unified,
    value?.address,
    value?.shielded,
    value?.accounts?.[0]?.address,
    value?.accounts?.[0]?.addresses?.unified,
    value?.accounts?.[0]?.addresses?.shielded,
  ];
  return candidates.find((candidate) => typeof candidate === "string" && candidate.trim().startsWith("u1"))?.trim() || null;
}

export async function connectNoir() {
  const wallet = provider();
  if (typeof wallet?.request !== "function") {
    throw new Error("Noir Wallet was not detected. Install the extension, unlock it and reload this page.");
  }
  try {
    const account = await wallet.request({ method: "zcash_requestAccounts" });
    const address = extractUnifiedAddress(account);
    if (!address) throw new Error("No Unified Address was shared by Noir Wallet.");
    return address;
  } catch (error) {
    if (error?.code === 4001 || /reject|denied|cancel/i.test(error?.message || "")) {
      throw new Error("Connection was declined. You can try again when ready.");
    }
    throw error;
  }
}

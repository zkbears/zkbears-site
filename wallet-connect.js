import { connectNoir } from "./wallet.js";

const status = document.querySelector("#wallet-connect-status");
const retry = document.querySelector("#wallet-connect-retry");
const requestId = new URLSearchParams(window.location.search).get("request") || "";
let connecting = false;

function sendResult(payload) {
  if (!window.opener || !requestId) return false;
  window.opener.postMessage({
    type: "zkbears:noir-connection",
    requestId,
    ...payload,
  }, window.location.origin);
  return true;
}

async function connect() {
  if (connecting) return;
  connecting = true;
  retry.hidden = true;
  status.classList.remove("is-error");
  status.textContent = "Waiting for Noir Wallet. Keep the extension unlocked…";

  try {
    const connection = await connectNoir({ waitForProvider: true, timeoutMs: 20000 });
    status.textContent = "Wallet connected. Returning to ZKBEARS…";
    if (!sendResult({ connection })) throw new Error("Return to the original ZKBEARS tab and click CONNECT NOIR again.");
    window.setTimeout(() => window.close(), 350);
  } catch (error) {
    const message = error?.message || "Could not connect to Noir Wallet.";
    status.textContent = message;
    status.classList.add("is-error");
    retry.hidden = false;
  } finally {
    connecting = false;
  }
}

retry.addEventListener("click", () => window.location.reload());
void connect();

import { connectNoir } from "./wallet.js";

const STORAGE_KEY = "zkbears-whitelist-v1";
const state = { handle: false, follow: false, quote: false, wallet: false, opened: { follow: false, quote: false } };

const form = document.querySelector("#whitelist-form");
const handleInput = document.querySelector("#x-handle");
const walletInput = document.querySelector("#wallet-address");
const walletStatus = document.querySelector("#wallet-status");
const joinButton = document.querySelector("#join-button");
const formNote = document.querySelector("#form-note");
const progressCount = document.querySelector("#progress-count");

function validHandle(value) {
  return /^@?[A-Za-z0-9_]{1,15}$/.test(value.trim());
}

function validUnifiedAddress(value) {
  return /^u1[023456789acdefghjklmnpqrstuvwxyz]{50,250}$/.test(value.trim().toLowerCase());
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    handle: handleInput.value.trim(),
    wallet: walletInput.value.trim(),
    follow: state.follow,
    quote: state.quote,
    opened: state.opened,
  }));
}

function render() {
  state.handle = validHandle(handleInput.value);
  state.wallet = validUnifiedAddress(walletInput.value);
  const values = [state.handle, state.follow, state.quote, state.wallet];
  const complete = values.filter(Boolean).length;
  progressCount.textContent = `${complete} / 4`;
  joinButton.disabled = complete !== 4;

  document.querySelector("#handle-check").classList.toggle("is-valid", state.handle);
  document.querySelector("#wallet-check").classList.toggle("is-valid", state.wallet);
  document.querySelector('[data-step="handle"]').classList.toggle("is-complete", state.handle);
  document.querySelector('[data-step="wallet"]').classList.toggle("is-complete", state.wallet);

  for (const task of ["follow", "quote"]) {
    const button = document.querySelector(`[data-check-task="${task}"]`);
    button.disabled = !state.opened[task] && !state[task];
    button.setAttribute("aria-pressed", String(state[task]));
    document.querySelector(`[data-step="${task}"]`).classList.toggle("is-complete", state[task]);
  }

  if (!walletInput.value) {
    walletStatus.textContent = "";
    walletStatus.classList.remove("is-error");
  } else if (state.wallet) {
    walletStatus.textContent = "Unified Address format verified.";
    walletStatus.classList.remove("is-error");
  } else {
    walletStatus.textContent = "Enter a valid Noir Wallet Unified Address beginning with u1.";
    walletStatus.classList.add("is-error");
  }
}

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (saved) {
    handleInput.value = saved.handle || "";
    walletInput.value = saved.wallet || "";
    state.follow = Boolean(saved.follow);
    state.quote = Boolean(saved.quote);
    state.opened = { follow: Boolean(saved.opened?.follow), quote: Boolean(saved.opened?.quote) };
  }
} catch {}

handleInput.addEventListener("input", () => { render(); save(); });
walletInput.addEventListener("input", () => { render(); save(); });

document.querySelectorAll("[data-open-task]").forEach((link) => {
  link.addEventListener("click", () => {
    const task = link.dataset.openTask;
    state.opened[task] = true;
    render();
    save();
  });
});

document.querySelectorAll("[data-check-task]").forEach((button) => {
  button.addEventListener("click", () => {
    const task = button.dataset.checkTask;
    if (!state.opened[task] && !state[task]) return;
    state[task] = !state[task];
    render();
    save();
  });
});

document.querySelector("#use-noir").addEventListener("click", async () => {
  walletStatus.textContent = "Waiting for Noir Wallet…";
  walletStatus.classList.remove("is-error");
  try {
    walletInput.value = await connectNoir();
    render();
    save();
  } catch (error) {
    walletStatus.textContent = error?.message || "Could not connect to Noir Wallet.";
    walletStatus.classList.add("is-error");
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  render();
  if (joinButton.disabled) return;
  save();
  formNote.textContent = "Your completed checklist is saved on this device.";
});

const termsDialog = document.querySelector("#terms-dialog");
document.querySelector("#open-terms").addEventListener("click", () => termsDialog.showModal());
termsDialog.addEventListener("click", (event) => {
  if (event.target === termsDialog) termsDialog.close();
});

render();

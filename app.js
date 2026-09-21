import { connectNoir } from "./wallet.js";
import { finishXAuth, getXUser, startXAuth, verifyFollow, verifyLikeAndQuote } from "./x-oauth.js";

const STORAGE_KEY = "zkbears-whitelist-v2";
const state = { xUser: null, handle: false, follow: false, quote: false, wallet: false };

const form = document.querySelector("#whitelist-form");
const handleInput = document.querySelector("#x-handle");
const walletInput = document.querySelector("#wallet-address");
const walletStatus = document.querySelector("#wallet-status");
const xStatus = document.querySelector("#x-status");
const joinButton = document.querySelector("#join-button");
const formNote = document.querySelector("#form-note");
const progressCount = document.querySelector("#progress-count");

function validUnifiedAddress(value) {
  return /^u1[023456789acdefghjklmnpqrstuvwxyz]{50,250}$/.test(value.trim().toLowerCase());
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ wallet: walletInput.value.trim() }));
}

function render() {
  const authenticatedHandle = state.xUser ? `@${state.xUser.username}`.toLowerCase() : "";
  state.handle = Boolean(authenticatedHandle && handleInput.value.trim().toLowerCase() === authenticatedHandle);
  state.wallet = validUnifiedAddress(walletInput.value);
  const complete = [state.handle, state.follow, state.quote, state.wallet].filter(Boolean).length;
  progressCount.textContent = `${complete} / 4`;
  joinButton.disabled = complete !== 4;

  document.querySelector("#handle-check").classList.toggle("is-valid", state.handle);
  document.querySelector("#wallet-check").classList.toggle("is-valid", state.wallet);
  document.querySelector('[data-step="handle"]').classList.toggle("is-complete", state.handle);
  document.querySelector('[data-step="wallet"]').classList.toggle("is-complete", state.wallet);

  for (const task of ["follow", "quote"]) {
    const button = document.querySelector(`[data-check-task="${task}"]`);
    button.disabled = !state.xUser;
    button.setAttribute("aria-pressed", String(state[task]));
    document.querySelector(`[data-step="${task}"]`).classList.toggle("is-complete", state[task]);
  }

  if (!walletInput.value) setStatus(walletStatus, "");
  else if (state.wallet) setStatus(walletStatus, "Unified Address format verified.");
  else setStatus(walletStatus, "Enter a valid Noir Wallet Unified Address beginning with u1.", true);
}

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (saved?.wallet) walletInput.value = saved.wallet;
} catch {}

walletInput.addEventListener("input", () => { render(); save(); });

document.querySelector("#connect-x").addEventListener("click", async () => {
  if (state.xUser) {
    setStatus(xStatus, `Connected as @${state.xUser.username}.`);
    return;
  }
  try {
    setStatus(xStatus, "Opening secure X authorization…");
    await startXAuth();
  } catch (error) {
    setStatus(xStatus, error?.message || "X authorization could not start.", true);
  }
});

document.querySelector('[data-check-task="follow"]').addEventListener("click", async () => {
  const status = document.querySelector('[data-task-status="follow"]');
  setStatus(status, "Checking your follow through X API…");
  try {
    state.follow = await verifyFollow(state.xUser.id);
    setStatus(status, state.follow ? "Follow verified." : "Follow not found yet. Follow @zk_bears and try again.", !state.follow);
  } catch (error) {
    setStatus(status, error?.message || "Follow verification failed.", true);
  }
  render();
});

document.querySelector('[data-check-task="quote"]').addEventListener("click", async () => {
  const status = document.querySelector('[data-task-status="quote"]');
  setStatus(status, "Checking the like and quote through X API…");
  try {
    const result = await verifyLikeAndQuote(state.xUser.id);
    state.quote = result.liked && result.quoted;
    const message = state.quote ? "Like and quote verified." : `Still missing: ${[!result.liked && "like", !result.quoted && "quote"].filter(Boolean).join(" + ")}.`;
    setStatus(status, message, !state.quote);
  } catch (error) {
    setStatus(status, error?.message || "Like and quote verification failed.", true);
  }
  render();
});

document.querySelector("#use-noir").addEventListener("click", async () => {
  setStatus(walletStatus, "Waiting for Noir Wallet…");
  try {
    walletInput.value = await connectNoir();
    render();
    save();
  } catch (error) {
    setStatus(walletStatus, error?.message || "Could not connect to Noir Wallet.", true);
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  render();
  if (joinButton.disabled) return;
  save();
  formNote.textContent = "Your verified checklist is saved on this device.";
});

const termsDialog = document.querySelector("#terms-dialog");
document.querySelector("#open-terms").addEventListener("click", () => termsDialog.showModal());
termsDialog.addEventListener("click", (event) => { if (event.target === termsDialog) termsDialog.close(); });

async function restoreX() {
  try {
    await finishXAuth();
    state.xUser = await getXUser();
    if (state.xUser) {
      handleInput.value = `@${state.xUser.username}`;
      handleInput.readOnly = true;
      document.querySelector("#connect-x").textContent = "X CONNECTED";
      setStatus(xStatus, `Authenticated as @${state.xUser.username}.`);
    }
  } catch (error) {
    setStatus(xStatus, error?.message || "X authorization failed.", true);
  }
  render();
}

render();
restoreX();

const nftSources = Array.from({ length: 12 }, (_, index) => `./assets/nft-${String(index + 1).padStart(2, "0")}.png`);
const nftFrames = [...document.querySelectorAll(".nft-frame")];
let galleryOffset = 0;

function rotateGallery() {
  if (document.visibilityState === "hidden") return;
  galleryOffset = (galleryOffset + 1) % nftSources.length;
  nftFrames.forEach((frame, slotIndex) => {
    window.setTimeout(() => {
      const image = frame.querySelector("img");
      const artworkIndex = (slotIndex + galleryOffset) % nftSources.length;
      frame.classList.add("is-swapping");
      window.setTimeout(() => {
        image.src = nftSources[artworkIndex];
        image.alt = `ZKBEARS NFT preview ${artworkIndex + 1}`;
      }, 260);
      window.setTimeout(() => frame.classList.remove("is-swapping"), 620);
    }, slotIndex * 110);
  });
}

if (nftFrames.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  window.setInterval(rotateGallery, 6200);
}

const revealTargets = [
  document.querySelector(".hero-copy"),
  document.querySelector(".supply-display"),
  document.querySelector(".collection .page-width"),
  document.querySelector(".whitelist-intro"),
  ...document.querySelectorAll(".task-card"),
].filter(Boolean);

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
} else {
  revealTargets.forEach((target) => target.classList.add("scroll-reveal"));
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle("is-visible", entry.isIntersecting);
    });
  }, { threshold: .14, rootMargin: "0px 0px -8%" });
  revealTargets.forEach((target) => revealObserver.observe(target));
}

const heroScene = document.querySelector(".hero");
let sceneFrame = 0;
let sceneTarget = 0;
let sceneCurrent = 0;
function animateSceneScroll() {
  if (!heroScene) return;
  sceneCurrent += (sceneTarget - sceneCurrent) * .13;
  heroScene.style.setProperty("--scene-scroll", sceneCurrent.toFixed(4));
  if (Math.abs(sceneTarget - sceneCurrent) > .001) {
    sceneFrame = requestAnimationFrame(animateSceneScroll);
  } else {
    sceneCurrent = sceneTarget;
    heroScene.style.setProperty("--scene-scroll", sceneCurrent.toFixed(4));
    sceneFrame = 0;
  }
}
function updateSceneTarget() {
  if (!heroScene) return;
  sceneTarget = Math.max(0, Math.min(1, -heroScene.getBoundingClientRect().top / heroScene.offsetHeight));
  if (!sceneFrame) sceneFrame = requestAnimationFrame(animateSceneScroll);
}
window.addEventListener("scroll", updateSceneTarget, { passive: true });
updateSceneTarget();

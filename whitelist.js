import { connectNoir } from "./wallet.js";
import { validUnifiedAddress } from "./zcash-address.js";
import { WhitelistApiError, whitelistApi } from "./whitelist-api.js";

const state = {
  user: null,
  authenticated: false,
  follow: false,
  engagement: false,
  engagementConfigured: false,
  wallet: false,
  walletAddress: "",
  submitted: false,
};

const elements = {
  form: document.querySelector("#whitelist-form"),
  connectX: document.querySelector("#connect-x"),
  disconnectX: document.querySelector("#disconnect-x"),
  xStatus: document.querySelector("#x-status"),
  followButton: document.querySelector('[data-check-task="follow"]'),
  followOpen: document.querySelector('[data-open-task="follow"]'),
  followCard: document.querySelector('[data-step="follow"]'),
  followStatus: document.querySelector('[data-task-status="follow"]'),
  engagementButton: document.querySelector('[data-check-task="quote"]'),
  engagementStatus: document.querySelector('[data-task-status="quote"]'),
  engagementCard: document.querySelector('[data-step="quote"]'),
  requirements: document.querySelector("#whitelist-requirements"),
  walletTaskNumber: document.querySelector("#wallet-task-number"),
  walletCard: document.querySelector('[data-step="wallet"]'),
  walletInput: document.querySelector("#wallet-address"),
  walletStatus: document.querySelector("#wallet-status"),
  noirButton: document.querySelector("#use-noir"),
  formStatus: document.querySelector("#form-status"),
  submit: document.querySelector("#join-button"),
  progress: document.querySelector("#progress-count"),
};

function status(element, message = "", error = false) {
  element.textContent = message;
  element.classList.toggle("is-error", error);
}

function errorMessage(error, fallback) {
  if (error instanceof WhitelistApiError && error.status === 401) {
    state.user = null;
    state.authenticated = false;
    state.follow = false;
    state.wallet = false;
    return "Your X session expired. Connect X again.";
  }
  if (error instanceof WhitelistApiError && error.code === "x_api_credits_depleted") {
    return "Follow check is paused because the site's X API credits are empty.";
  }
  return error?.message || fallback;
}

function render() {
  const requiredSteps = [state.authenticated, state.follow, state.wallet];
  if (state.engagementConfigured) requiredSteps.splice(2, 0, state.engagement);
  const completed = requiredSteps.filter(Boolean).length;
  const total = requiredSteps.length;
  elements.progress.textContent = `${completed} / ${total}`;
  elements.submit.disabled = completed !== total || state.submitted;
  elements.submit.textContent = state.submitted ? "SPOT SAVED ✓" : "SAVE MY SPOT";
  elements.connectX.textContent = state.authenticated ? `@${state.user.username} ✓` : "CONNECT X ↗";
  elements.disconnectX.hidden = !state.authenticated;
  const followUnlocked = state.authenticated;
  const walletUnlocked = state.follow;
  elements.followButton.disabled = !followUnlocked || state.follow;
  elements.followButton.textContent = state.follow ? "✓" : "↻";
  elements.followOpen.classList.toggle("is-disabled", !followUnlocked);
  elements.followOpen.setAttribute("aria-disabled", String(!followUnlocked));
  elements.followOpen.tabIndex = followUnlocked ? 0 : -1;
  elements.followCard.classList.toggle("is-locked", !followUnlocked);
  elements.engagementButton.disabled = !state.engagementConfigured || !state.authenticated || state.engagement;
  elements.walletInput.disabled = !walletUnlocked || state.submitted;
  elements.noirButton.disabled = !walletUnlocked || state.wallet || state.submitted;
  elements.noirButton.textContent = state.wallet ? "NOIR CONNECTED" : "CONNECT NOIR";
  elements.walletCard.classList.toggle("is-locked", !walletUnlocked);
  elements.engagementCard.hidden = !state.engagementConfigured;
  elements.requirements.textContent = state.engagementConfigured
    ? "Complete all four verified steps to save your whitelist spot."
    : "Complete all three verified steps to save your whitelist spot.";
  elements.walletTaskNumber.textContent = state.engagementConfigured ? "TASK 03" : "TASK 02";

  const steps = {
    handle: state.authenticated,
    follow: state.follow,
    quote: state.engagement,
    wallet: state.wallet,
  };
  for (const [name, complete] of Object.entries(steps)) {
    document.querySelector(`[data-step="${name}"]`)?.classList.toggle("is-complete", complete);
  }
  document.querySelector("#handle-check")?.classList.toggle("is-valid", state.authenticated);
  document.querySelector("#wallet-check")?.classList.toggle("is-valid", state.wallet);
  elements.followButton.setAttribute("aria-pressed", String(state.follow));
  elements.engagementButton.setAttribute("aria-pressed", String(state.engagement));
}

function applySession(session) {
  state.user = session.user || null;
  state.authenticated = Boolean(session.user?.id);
  state.follow = Boolean(session.tasks?.follow);
  state.engagement = Boolean(session.tasks?.engagement);
  state.submitted = Boolean(session.tasks?.submitted);
  if (session.tasks?.walletAddress) {
    state.walletAddress = session.tasks.walletAddress;
    state.wallet = true;
    elements.walletInput.value = state.walletAddress;
  }
  if (state.authenticated) status(elements.xStatus, `Authenticated as @${state.user.username}.`);
  if (state.follow) status(elements.followStatus, "Follow verified.");
  if (state.engagement) status(elements.engagementStatus, "Like and quote verified.");
  if (state.wallet) status(elements.walletStatus, "Valid Unified Address.");
  render();
}

function consumeAuthResult() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("x_auth");
  if (!result) return;
  history.replaceState({}, "", `${window.location.pathname}#whitelist`);
  if (result === "cancelled") status(elements.xStatus, "X authorization was cancelled.", true);
  if (result === "failed") status(elements.xStatus, "X authorization failed. Please try again.", true);
}

elements.connectX.addEventListener("click", async () => {
  if (state.authenticated) {
    status(elements.xStatus, `Authenticated as @${state.user.username}.`);
    return;
  }
  status(elements.xStatus, "Opening X authorization…");
  whitelistApi.startXAuthentication();
});

elements.disconnectX.addEventListener("click", async () => {
  elements.disconnectX.disabled = true;
  try { await whitelistApi.logout(); } catch { /* local state is cleared either way */ }
  Object.assign(state, {
    user: null,
    authenticated: false,
    follow: false,
    engagement: false,
    wallet: false,
    walletAddress: "",
    submitted: false,
  });
  elements.walletInput.value = "";
  status(elements.xStatus, "X account disconnected.");
  status(elements.followStatus);
  status(elements.engagementStatus);
  status(elements.walletStatus);
  elements.disconnectX.disabled = false;
  render();
});

elements.followOpen.addEventListener("click", (event) => {
  if (!state.authenticated) {
    event.preventDefault();
    status(elements.followStatus, "Authenticate with X before opening this task.", true);
  }
});

elements.followButton.addEventListener("click", async () => {
  if (!state.authenticated) {
    status(elements.followStatus, "Authenticate with X first.", true);
    return;
  }
  elements.followButton.disabled = true;
  status(elements.followStatus, "Checking follow…");
  try {
    const result = await whitelistApi.verifyFollow();
    state.follow = Boolean(result.verified);
    status(elements.followStatus, state.follow ? "Follow verified." : "Follow not found. Follow @zk_bears and try again.", !state.follow);
  } catch (error) {
    status(elements.followStatus, errorMessage(error, "Follow verification failed."), true);
  }
  render();
});

elements.engagementButton.addEventListener("click", async () => {
  elements.engagementButton.disabled = true;
  status(elements.engagementStatus, "Checking like and quote…");
  try {
    const result = await whitelistApi.verifyEngagement();
    state.engagement = Boolean(result.verified);
    const missing = [!result.liked && "like", !result.quoted && "quote"].filter(Boolean).join(" + ");
    status(elements.engagementStatus, state.engagement ? "Like and quote verified." : `Still missing: ${missing}.`, !state.engagement);
  } catch (error) {
    status(elements.engagementStatus, errorMessage(error, "Like and quote verification failed."), true);
  }
  render();
});

elements.walletInput.addEventListener("input", () => {
  state.walletAddress = elements.walletInput.value.trim();
  state.wallet = false;
  const validFormat = validUnifiedAddress(state.walletAddress);
  status(
    elements.walletStatus,
    !state.walletAddress
      ? ""
      : validFormat
        ? "Address format is valid. Connect Noir Wallet to verify it."
        : "Enter a valid Unified Address beginning with u1.",
    Boolean(state.walletAddress && !validFormat),
  );
  render();
});

elements.noirButton.addEventListener("click", async () => {
  if (!state.follow) {
    status(elements.walletStatus, "Verify the X follow task first.", true);
    return;
  }
  status(elements.walletStatus, "Confirm the connection inside Noir Wallet…");
  try {
    const connection = await connectNoir();
    state.walletAddress = connection.address;
    state.wallet = validUnifiedAddress(connection.address);
    elements.walletInput.value = connection.address;
    status(elements.walletStatus, "Connected and verified through Noir Wallet.");
  } catch (error) {
    status(elements.walletStatus, error?.message || "Could not connect to Noir Wallet.", true);
  }
  render();
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (elements.submit.disabled) return;
  elements.submit.disabled = true;
  status(elements.formStatus, "Saving your whitelist entry…");
  try {
    const result = await whitelistApi.submit(state.walletAddress);
    state.submitted = Boolean(result.saved);
    status(elements.formStatus, "Your whitelist spot is saved.");
  } catch (error) {
    status(elements.formStatus, errorMessage(error, "Could not save your whitelist entry."), true);
  }
  render();
});

async function restore() {
  consumeAuthResult();
  try {
    const config = await whitelistApi.config();
    state.engagementConfigured = Boolean(config.engagementConfigured);
    document.querySelector('[data-open-task="follow"]').href = config.profileUrl;
    document.querySelector('[data-open-task="quote"]').href = config.announcementUrl;
    if (!state.engagementConfigured) {
      state.engagement = false;
      status(elements.engagementStatus);
    }
  } catch { /* the task links keep their safe profile fallback */ }
  try {
    applySession(await whitelistApi.session());
  } catch (error) {
    if (!(error instanceof WhitelistApiError && error.status === 401)) {
      status(elements.xStatus, errorMessage(error, "Could not restore the X session."), true);
    }
  }
  render();
}

render();
restore();

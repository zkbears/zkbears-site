import { connectNoir, noirInstalled } from "./wallet.js";
import { validUnifiedAddress } from "./zcash-address.js";
import { WhitelistApiError, whitelistApi } from "./whitelist-api.js";

const FOLLOW_VISIT_KEY_PREFIX = "zkbears_follow_task_opened";
const ENGAGEMENT_VISIT_KEY_PREFIX = "zkbears_engagement_task_opened";

const state = {
  user: null,
  authenticated: false,
  follow: false,
  engagement: false,
  engagementConfigured: true,
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
  engagementButton: document.querySelector('[data-check-task="engagement"]'),
  engagementOpen: document.querySelector('[data-open-task="engagement"]'),
  engagementStatus: document.querySelector('[data-task-status="engagement"]'),
  engagementCard: document.querySelector('[data-step="engagement"]'),
  requirements: document.querySelector("#whitelist-requirements"),
  walletTaskNumber: document.querySelector("#wallet-task-number"),
  walletCard: document.querySelector('[data-step="wallet"]'),
  walletInput: document.querySelector("#wallet-address"),
  walletStatus: document.querySelector("#wallet-status"),
  noirButton: document.querySelector("#use-noir"),
  formStatus: document.querySelector("#form-status"),
  legalConsent: document.querySelector("#legal-consent"),
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
    state.engagement = false;
    state.wallet = false;
    return "Your X session expired. Connect X again.";
  }
  return error?.message || fallback;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function retry(task, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (error instanceof WhitelistApiError && error.status === 401) throw error;
      if (attempt < attempts - 1) await wait(350 * (attempt + 1));
    }
  }
  throw lastError;
}

function connectedXLabel() {
  return state.user?.username && state.user.username !== "connected"
    ? `@${state.user.username}`
    : "X ACCOUNT";
}

function followVisitKey() {
  return state.user?.id ? `${FOLLOW_VISIT_KEY_PREFIX}:${state.user.id}` : FOLLOW_VISIT_KEY_PREFIX;
}

function rememberFollowVisit() {
  try { localStorage.setItem(followVisitKey(), "1"); } catch { /* storage can be unavailable */ }
}

function forgetFollowVisit() {
  try { localStorage.removeItem(followVisitKey()); } catch { /* storage can be unavailable */ }
}

function hasPendingFollowVisit() {
  try { return localStorage.getItem(followVisitKey()) === "1"; } catch { return false; }
}

function engagementVisitKey() {
  return state.user?.id ? `${ENGAGEMENT_VISIT_KEY_PREFIX}:${state.user.id}` : ENGAGEMENT_VISIT_KEY_PREFIX;
}

function rememberEngagementVisit() {
  try { localStorage.setItem(engagementVisitKey(), "1"); } catch { /* storage can be unavailable */ }
}

function forgetEngagementVisit() {
  try { localStorage.removeItem(engagementVisitKey()); } catch { /* storage can be unavailable */ }
}

function hasPendingEngagementVisit() {
  try { return localStorage.getItem(engagementVisitKey()) === "1"; } catch { return false; }
}

function render() {
  const requiredSteps = [state.authenticated, state.follow, state.engagement, state.wallet];
  const completed = requiredSteps.filter(Boolean).length;
  const total = requiredSteps.length;
  elements.progress.textContent = `${completed} / ${total}`;
  elements.submit.disabled = completed !== total || state.submitted || !elements.legalConsent.checked;
  elements.submit.textContent = state.submitted ? "SPOT SAVED ✓" : "SAVE MY SPOT";
  elements.connectX.textContent = state.authenticated ? `${connectedXLabel()} ✓` : "CONNECT X ↗";
  elements.disconnectX.hidden = !state.authenticated;
  const followUnlocked = state.authenticated;
  const engagementUnlocked = state.follow && state.engagementConfigured;
  const walletUnlocked = state.engagement && state.engagementConfigured;
  elements.followButton.disabled = true;
  elements.followButton.textContent = state.follow ? "✓" : "";
  elements.followOpen.classList.toggle("is-disabled", !followUnlocked);
  elements.followOpen.setAttribute("aria-disabled", String(!followUnlocked));
  elements.followOpen.tabIndex = followUnlocked ? 0 : -1;
  elements.followCard.classList.toggle("is-locked", !followUnlocked);
  elements.engagementButton.disabled = true;
  elements.engagementButton.textContent = state.engagement ? "✓" : "";
  elements.engagementOpen.textContent = state.engagementConfigured ? "OPEN TASK ↗" : "POST COMING SOON";
  elements.engagementOpen.classList.toggle("is-disabled", !engagementUnlocked);
  elements.engagementOpen.setAttribute("aria-disabled", String(!engagementUnlocked));
  elements.engagementOpen.tabIndex = engagementUnlocked ? 0 : -1;
  elements.engagementCard.classList.toggle("is-locked", !engagementUnlocked);
  elements.walletInput.readOnly = true;
  elements.walletInput.disabled = !walletUnlocked || state.submitted;
  elements.noirButton.disabled = !walletUnlocked || state.wallet || state.submitted;
  elements.noirButton.textContent = state.wallet ? "NOIR CONNECTED" : "CONNECT NOIR";
  elements.walletCard.classList.toggle("is-locked", !walletUnlocked);
  elements.requirements.textContent = "Complete all four steps in order to save your whitelist spot.";
  elements.walletTaskNumber.textContent = "TASK 03";

  const steps = {
    handle: state.authenticated,
    follow: state.follow,
    engagement: state.engagement,
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
  const previousUserId = state.user?.id || "";
  const nextUserId = session.user?.id || "";
  state.user = session.user || null;
  state.authenticated = Boolean(nextUserId);
  state.follow = Boolean(session.tasks?.follow);
  state.engagement = Boolean(session.tasks?.engagement);
  state.submitted = Boolean(session.tasks?.submitted);
  const savedWalletAddress = session.tasks?.walletAddress || "";
  if (savedWalletAddress) {
    state.walletAddress = savedWalletAddress;
    state.wallet = true;
  } else if (previousUserId !== nextUserId) {
    state.walletAddress = "";
    state.wallet = false;
  }
  elements.walletInput.value = state.walletAddress;
  if (state.authenticated) status(elements.xStatus, `${connectedXLabel()} authenticated.`);
  if (state.follow) {
    forgetFollowVisit();
    status(elements.followStatus, "X profile opened. Task complete.");
  }
  if (state.engagement) {
    forgetEngagementVisit();
    status(elements.engagementStatus, "Announcement post opened. Task complete.");
  } else if (!state.engagementConfigured) {
    status(elements.engagementStatus, "Announcement post will be added soon.");
  }
  if (state.wallet) status(elements.walletStatus, "Valid Unified Address.");
  render();
}

function updateNoirStatus() {
  if (!state.engagement || state.wallet || state.submitted) return;
  if (noirInstalled()) {
    status(elements.walletStatus, "Noir Wallet detected. Click CONNECT NOIR to continue.");
  }
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
    status(elements.xStatus, `${connectedXLabel()} authenticated.`);
    return;
  }
  status(elements.xStatus, "Opening X authorization…");
  whitelistApi.startXAuthentication();
});

elements.disconnectX.addEventListener("click", async () => {
  elements.disconnectX.disabled = true;
  try { await whitelistApi.logout(); } catch { /* local state is cleared either way */ }
  forgetFollowVisit();
  forgetEngagementVisit();
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
  elements.legalConsent.checked = false;
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
    return;
  }
  rememberFollowVisit();
  status(elements.followStatus, "X profile opened. Come back here to complete the task.");
});

let completingFollowVisit = false;
async function completePendingFollowVisit() {
  if (completingFollowVisit || !state.authenticated || state.follow || !hasPendingFollowVisit()) return;
  completingFollowVisit = true;
  status(elements.followStatus, "Completing task…");
  try {
    const result = await whitelistApi.completeFollowVisit();
    state.follow = Boolean(result.verified);
    if (state.follow) forgetFollowVisit();
    status(elements.followStatus, state.follow ? "X profile opened. Task complete." : "Open the X profile to complete this task.", !state.follow);
  } catch (error) {
    status(elements.followStatus, errorMessage(error, "Could not complete the task. Return to this page and try again."), true);
  } finally {
    completingFollowVisit = false;
    render();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void syncAfterReturn();
});

elements.engagementOpen.addEventListener("click", (event) => {
  if (!state.engagementConfigured) {
    event.preventDefault();
    status(elements.engagementStatus, "Announcement post will be added soon.");
    return;
  }
  if (!state.follow) {
    event.preventDefault();
    status(elements.engagementStatus, "Complete the follow task first.", true);
    return;
  }
  rememberEngagementVisit();
  status(elements.engagementStatus, "Announcement opened. Like and repost it, then return here.");
});

let completingEngagementVisit = false;
async function completePendingEngagementVisit() {
  if (completingEngagementVisit || !state.follow || !state.engagementConfigured || state.engagement || !hasPendingEngagementVisit()) return;
  completingEngagementVisit = true;
  status(elements.engagementStatus, "Completing task…");
  try {
    const result = await whitelistApi.completeEngagementVisit();
    state.engagement = Boolean(result.verified);
    if (state.engagement) forgetEngagementVisit();
    status(elements.engagementStatus, state.engagement ? "Announcement post opened. Task complete." : "Open the announcement post to complete this task.", !state.engagement);
  } catch (error) {
    status(elements.engagementStatus, errorMessage(error, "Could not complete the task. Return to this page and try again."), true);
  } finally {
    completingEngagementVisit = false;
    render();
  }
}

async function completePendingVisits() {
  await completePendingFollowVisit();
  await completePendingEngagementVisit();
}

window.addEventListener("focus", () => { void syncAfterReturn(); });
window.addEventListener("pageshow", (event) => {
  if (event.persisted) void syncAfterReturn();
});
elements.legalConsent.addEventListener("change", render);

elements.noirButton.addEventListener("click", async () => {
  if (!state.engagement) {
    status(elements.walletStatus, "Complete the Like + Repost task first.", true);
    return;
  }
  if (!noirInstalled()) {
    status(elements.walletStatus, "Noir Wallet was not detected. If you just installed it, reload this page. Your completed tasks are already saved.", true);
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
    const result = await whitelistApi.submit(state.walletAddress, elements.legalConsent.checked);
    state.submitted = Boolean(result.saved);
    status(elements.formStatus, "Your whitelist spot is saved.");
  } catch (error) {
    status(elements.formStatus, errorMessage(error, "Could not save your whitelist entry."), true);
  }
  render();
});

let synchronizing = null;

async function syncFromServer(showErrors = false) {
  if (synchronizing) return synchronizing;
  synchronizing = (async () => {
    try {
      const config = await retry(() => whitelistApi.config());
      state.engagementConfigured = Boolean(config.engagementConfigured);
      document.querySelector('[data-open-task="follow"]').href = config.profileUrl;
      elements.engagementOpen.href = config.announcementUrl;
      if (!state.engagementConfigured) {
        state.engagement = false;
        status(elements.engagementStatus, "Announcement post will be added soon.");
      } else {
        status(elements.engagementStatus);
      }
    } catch {
      // Keep the current announcement as a safe fallback while the API retries
      // on the next focus, visibility or pageshow event.
    }
    try {
      applySession(await retry(() => whitelistApi.session()));
      await completePendingVisits();
    } catch (error) {
      if (showErrors && !(error instanceof WhitelistApiError && error.status === 401)) {
        status(elements.xStatus, errorMessage(error, "Could not restore the X session."), true);
      }
    }
    updateNoirStatus();
    render();
  })().finally(() => { synchronizing = null; });
  return synchronizing;
}

async function syncAfterReturn() {
  await syncFromServer(false);
  updateNoirStatus();
}

async function restore() {
  consumeAuthResult();
  await syncFromServer(true);
}

render();
restore();

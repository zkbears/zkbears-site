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
    entries.forEach((entry) => entry.target.classList.toggle("is-visible", entry.isIntersecting));
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

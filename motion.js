const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (!reduceMotion.matches) {
  document.documentElement.classList.add("motion-enabled");
}

window.addEventListener("DOMContentLoaded", () => {
  if (reduceMotion.matches) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.body.classList.add("page-ready"));
  });
});

window.addEventListener("pageshow", (event) => {
  if (!event.persisted || reduceMotion.matches) return;
  document.body.classList.remove("page-leaving");
  document.body.classList.add("page-ready");
});

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link || reduceMotion.matches || event.defaultPrevented) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.target === "_blank" || link.hasAttribute("download")) return;

  const destination = new URL(link.href, window.location.href);
  const current = new URL(window.location.href);
  if (destination.origin !== current.origin) return;
  if (destination.pathname === current.pathname && destination.search === current.search) return;

  event.preventDefault();
  document.body.classList.add("page-leaving");
  window.setTimeout(() => window.location.assign(destination.href), 220);
});

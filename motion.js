const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

window.addEventListener("pageshow", () => {
  document.body.classList.remove("page-leaving");
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
  window.setTimeout(() => window.location.assign(destination.href), 340);
});

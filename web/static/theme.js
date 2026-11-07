// Applies a saved light/dark choice before the first paint, so the page never
// flashes the other edition. With no saved choice the page is the day edition.
try {
  var t = localStorage.getItem("theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) {}

// A tap on the phone header's menu or search before the app has started is remembered,
// and the layout acts on it as soon as it is ready, so these two controls work from first paint.
window.__earlyTap = null;
document.addEventListener("click", function (e) {
  var b = e.target && e.target.closest && e.target.closest("[data-early]");
  if (b) window.__earlyTap = b.getAttribute("data-early");
}, true);

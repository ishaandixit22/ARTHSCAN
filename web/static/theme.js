// Applies a saved light/dark choice before the first paint, so the page never
// flashes the other edition. With no saved choice the page is the day edition.
try {
  var t = localStorage.getItem("theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) {}

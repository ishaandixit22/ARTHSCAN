// Applies a saved light/dark choice before the first paint, so the page never
// flashes the other theme. With no saved choice the CSS follows the device.
try {
  var t = localStorage.getItem("theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) {}

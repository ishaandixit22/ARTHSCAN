// The page's current light/dark theme, shared by the switch and by anything
// drawn with colours read from CSS (the price chart redraws when it changes).

export type Theme = "light" | "dark";

function effective(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return "light"; // the day edition, whatever the device prefers
}

export const theme = $state<{ current: Theme; sync(): void }>({
  current: "light",
  sync() {
    this.current = effective();
  },
});

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("theme", t);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  theme.current = t;
}


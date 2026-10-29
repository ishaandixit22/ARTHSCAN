// The page's current light/dark theme, shared by the switch and by anything
// drawn with colours read from CSS (the price chart redraws when it changes).

export type Theme = "light" | "dark";

function effective(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export const theme = $state<{ current: Theme; sync(): void }>({
  current: "dark",
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

if (typeof window !== "undefined") {
  // A device switch counts only while the visitor hasn't picked a theme.
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => theme.sync());
}

// `use:near={fn}` calls fn once, when the element comes within `margin` pixels of the screen.
// For anything costly that isn't needed until someone scrolls towards it: charts, off-screen data.
export function near(node: HTMLElement, fn: () => void, margin = 900) {
  if (typeof IntersectionObserver === "undefined") {
    fn();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fn();
    },
    { rootMargin: `${margin}px 0px` },
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}

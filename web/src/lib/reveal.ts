// `use:reveal` fades an element up the first time it scrolls into view (see .reveal in app.css).
// A delay in ms staggers siblings. Without IntersectionObserver the element just shows.
export function reveal(node: HTMLElement, delay = 0) {
  node.classList.add("reveal");
  if (delay) node.style.transitionDelay = `${delay}ms`;
  if (typeof IntersectionObserver === "undefined") {
    node.classList.add("in");
    return;
  }
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      node.classList.add("in");
      io.disconnect();
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}

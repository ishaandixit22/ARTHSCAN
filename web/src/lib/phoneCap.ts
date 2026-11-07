// Long tables on phones: CSS hides rows past the 40th (`m-capped` in app.css, so it holds from the
// server's first paint), and `use:phoneCap={rows.length}` adds the button that shows the rest.
// Pass the row count so the button follows filters and sorting.
const CAP = 40;

export function phoneCap(table: HTMLTableElement, _count?: number) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn m-more";
  (table.closest(".table-scroll") ?? table).after(button);

  const sync = () => {
    const rows = table.tBodies[0]?.rows.length ?? 0;
    table.classList.remove("m-all");
    button.hidden = rows <= CAP;
    button.textContent = `Show all ${rows}`;
  };
  button.addEventListener("click", () => {
    table.classList.add("m-all");
    button.hidden = true;
  });
  sync();

  return {
    // Runs before the rows themselves re-render, so count them just after.
    update: () => queueMicrotask(sync),
    destroy: () => button.remove(),
  };
}

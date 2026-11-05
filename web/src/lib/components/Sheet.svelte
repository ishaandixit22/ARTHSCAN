<script lang="ts">
  // A panel over the page, on the browser's own modal <dialog>: it traps focus, makes the page behind
  // inert and closes on Escape, with no library. Focus goes back to whatever opened it.
  // The parent renders it while open and removes it from `onclose`.
  import { onMount, type Snippet } from "svelte";

  let { label, side = "left", onclose, children }: { label: string; side?: "left" | "bottom" | "full"; onclose: () => void; children: Snippet<[() => void]> } = $props();
  let dialog: HTMLDialogElement;
  let closing = $state(false);
  let timer: ReturnType<typeof setTimeout>;

  onMount(() => {
    // Removing an open dialog from the page loses the browser's own focus return, so do it here.
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    document.documentElement.classList.add("sheet-open");
    return () => {
      clearTimeout(timer);
      document.documentElement.classList.remove("sheet-open");
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  });

  function close() {
    if (closing) return;
    closing = true;
    const quick = matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer = setTimeout(onclose, quick ? 0 : 130);
  }
</script>

<dialog
  bind:this={dialog}
  class={side}
  class:closing
  aria-label={label}
  oncancel={(e) => { e.preventDefault(); close(); }}
  onclick={(e) => { if (e.target === dialog) close(); }}
>
  <div class="panel">{@render children(close)}</div>
</dialog>

<style>
  dialog {
    position: fixed; padding: 0; border: 0; color: var(--ink); background: var(--bg); overflow: hidden;
    max-width: none; max-height: none; overscroll-behavior: contain;
  }
  dialog::backdrop { background: rgba(0, 0, 0, 0.45); animation: fade 0.16s linear; }
  .panel { display: flex; flex-direction: column; height: 100%; min-height: 0; }

  .left {
    inset: 0 auto 0 0; margin: 0; width: min(88vw, 380px); height: 100dvh;
    border-right: 1px solid var(--ink); animation: from-left 0.2s var(--ease);
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  .bottom {
    inset: auto 0 0 0; margin: 0; width: 100%; max-height: 88dvh;
    border-top: var(--rule-heavy); animation: from-bottom 0.22s var(--ease);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .bottom .panel { max-height: calc(88dvh - env(safe-area-inset-bottom)); }
  .full {
    inset: 0; margin: 0; width: 100%; height: 100dvh; animation: fade 0.12s linear;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  .closing { animation: fade-out 0.13s linear forwards; }
  .closing::backdrop { animation: fade-out 0.13s linear forwards; }

  @keyframes from-left { from { transform: translateX(-100%); } }
  @keyframes from-bottom { from { transform: translateY(100%); } }
  @keyframes fade { from { opacity: 0; } }
  @keyframes fade-out { to { opacity: 0; } }
</style>

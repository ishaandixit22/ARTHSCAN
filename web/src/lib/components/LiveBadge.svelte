<script lang="ts">
  import { live } from "$lib/live.svelte";

  // Green while ticks arrive, amber while connecting or quiet (e.g. market closed), red on errors.
  const state = $derived(live.status?.state ?? (live.connected ? "connecting" : "idle"));
  const label = $derived(
    state === "live" ? "Live" : state === "connecting" ? "Connecting…" : state === "error" || state === "not_configured" ? "Live off" : "Live",
  );
</script>

<span class="badge {state}" title={live.status?.message ?? ""}><i></i>{label}</span>

<style>
  .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--panel-2); color: var(--ink-2); }
  i { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-3); }
  .live { background: var(--up-soft); color: var(--up); }
  .live i { background: var(--up); animation: pulse 1.6s infinite; }
  .connecting i { background: #d08a2c; }
  .error, .not_configured { background: var(--down-soft); color: var(--down); }
  .error i, .not_configured i { background: var(--down); }
  @keyframes pulse { 50% { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) { .live i { animation: none; } }
</style>

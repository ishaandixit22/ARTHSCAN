<script lang="ts">
  import { goto } from "$app/navigation";
  import { BRAND } from "$lib/brand";

  let { data } = $props();
  let email = $state("");
  let name = $state("");
  let code = $state("");
  let message = $state("");
  let busy = $state(false);

  const ERRORS: Record<string, string> = {
    bad_state: "That sign-in link expired. Please try again.",
    google_failed: "Google sign-in failed. Please try again.",
    email_unverified: "Your Google email address is not verified.",
    missing_code: "Sign-in was cancelled.",
    not_invited: "That Google account isn't on the invite list yet. Ask for an invite, or sign in with the email you were invited with.",
  };

  async function devLogin(e: Event) {
    e.preventDefault();
    busy = true;
    message = "";
    const res = await fetch("/api/auth/dev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, name, code }) });
    busy = false;
    if (!res.ok) {
      message = (await res.json().catch(() => null))?.error?.message ?? "Sign-in failed.";
      return;
    }
    // Navigate with invalidateAll in one step: invalidating first would re-run this
    // page's load, which redirects on its own and leaves `data` pointing elsewhere.
    await goto(data.returnTo, { invalidateAll: true });
  }
</script>

<svelte:head><title>Sign in — {BRAND}</title></svelte:head>

<div class="page narrow">
  <div class="card card-body box">
    <h1>Sign in to {BRAND}</h1>
    {#if data.config.invite_only}
      <p class="sub">{BRAND} is in private beta. Sign in with the Google account you were invited with to browse the research pages and get API and MCP access (50 calls a day).</p>
    {:else}
      <p class="sub">An account gives you API tokens for the REST API and the MCP server — 50 free calls a day. Browsing the site needs no account.</p>
    {/if}

    {#if data.error}<div class="notice">{ERRORS[data.error] ?? "Sign-in failed."}</div>{/if}

    {#if data.config.google}
      <a class="btn primary google" href="/api/auth/google/start?return_to={encodeURIComponent(data.returnTo)}">Continue with Google</a>
    {:else}
      <p class="sub">Google sign-in is not configured on this server yet (set <code>GOOGLE_OAUTH_ENABLED</code>, <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>).</p>
    {/if}

    {#if data.config.dev_login}
      <form onsubmit={devLogin}>
        <div class="divider"><span>Local development sign-in</span></div>
        <label>Email <input type="email" required bind:value={email} placeholder="you@example.com" /></label>
        <label>Name <input bind:value={name} placeholder="optional" /></label>
        {#if data.config.dev_login_code}
          <label>Access code <input type="password" required bind:value={code} autocomplete="off" /></label>
        {/if}
        <button class="btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in (dev)"}</button>
        {#if message}<p class="err">{message}</p>{/if}
      </form>
    {/if}
  </div>
</div>

<style>
  .narrow { max-width: 460px; margin: 0 auto; }
  .box { display: grid; gap: 16px; }
  .google { justify-content: center; height: 42px; }
  form { display: grid; gap: 12px; }
  label { display: grid; gap: 4px; font-size: 13px; color: var(--ink-2); }
  .divider { display: flex; align-items: center; gap: 10px; color: var(--ink-3); font-size: 12px; }
  .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  .err { color: var(--down); font-size: 14px; }
</style>

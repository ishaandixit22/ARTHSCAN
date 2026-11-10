<script lang="ts">
  // Where a signed-out visitor's preview of a page ends: says what's further on, and brings them back after sign-in.
  import { page } from "$app/state";
  import { signInHref } from "$lib/preview";

  let { title = "Sign in to see the rest of this page", detail = "It's free, and takes one click with Google." }: { title?: string; detail?: string } = $props();
</script>

<aside class="prompt" aria-label="Sign in to see more">
  <h2>{title}</h2>
  <p>{detail}</p>
  <a class="btn primary" href={signInHref(page.url)}>Sign in with Google</a>
</aside>

<style>
  .prompt { display: grid; justify-items: center; gap: 10px; padding: 28px 20px 36px; border-top: var(--rule-heavy); text-align: center; }
  h2 { margin: 0; font: 850 26px/1.1 var(--display); font-stretch: 72%; }
  p { margin: 0 0 6px; max-width: 58ch; color: var(--ink-2); font: 16px/1.5 var(--serif); }
</style>

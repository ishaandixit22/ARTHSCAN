<script lang="ts">
  import { BRAND, TAGLINE } from "$lib/brand";
  import { FOOTER_COLUMNS, LISTINGS, SOCIALS } from "$lib/footer";

  let { logoKey }: { logoKey: string | null } = $props();
  const year = new Date().getFullYear();
</script>

<footer>
  <div class="wrap">
    <div class="columns">
      <div class="about">
        <a class="logo" href="/" aria-label="{BRAND} home"><span class="deva" aria-hidden="true">अर्थ</span><span class="word">{BRAND.toUpperCase()}</span></a>
        <p>{TAGLINE}</p>
        {#if SOCIALS.length}
          <ul class="socials">
            {#each SOCIALS as s (s.href)}<li><a href={s.href} rel="me noopener" target="_blank">{s.label}</a></li>{/each}
          </ul>
        {/if}
      </div>
      {#each FOOTER_COLUMNS as col (col.title)}
        <nav aria-label={col.title}>
          <h2>{col.title}</h2>
          <ul>
            {#each col.links as l (l.href)}<li><a href={l.href}>{l.label}</a></li>{/each}
          </ul>
        </nav>
      {/each}
    </div>

    <p class="notice-line">
      Prices are end-of-day from NSE unless marked Live; live prices and intraday charts come from Dhan.
      {BRAND} is not a SEBI-registered research analyst or investment adviser, and nothing here is investment advice.
      Do your own research, and speak to a qualified adviser before you invest.
    </p>

    {#if LISTINGS.length}
      <div class="listings">
        <span class="dateline">Listed on</span>
        <ul>
          {#each LISTINGS as l (l.href)}
            <li>
              <a href={l.href} target="_blank" rel="noopener">
                {#if l.badge}<img src={l.badge} alt={l.name} height="32" loading="lazy" />{:else}{l.name}{/if}
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="base">
      <span>© {year} {BRAND}</span>
      {#if logoKey}<a href="https://logo.dev" target="_blank" rel="noopener">Logos provided by Logo.dev</a>{/if}
    </div>
  </div>
</footer>

<style>
  footer { margin-top: 48px; padding: 28px 0 40px; border-top: 4px double var(--ink); color: var(--ink-2); }
  .columns { display: grid; grid-template-columns: minmax(0, 1.5fr) repeat(4, minmax(0, 1fr)); gap: 32px; align-items: start; }
  .logo { display: inline-flex; align-items: baseline; gap: 8px; color: var(--ink); line-height: 0.85; }
  .logo:hover { color: var(--ink); }
  .word { font: 900 32px var(--display); font-stretch: 62%; letter-spacing: 0.01em; }
  .deva { font: 400 21px var(--deva); transform: translateY(-1px); }
  .about p { margin-top: 12px; max-width: 320px; font: 15px/1.5 var(--serif); }
  h2 { padding-bottom: 8px; margin-bottom: 6px; border-bottom: 1.5px solid var(--ink); color: var(--ink); font-size: 13px; font-weight: 850; font-stretch: 72%; text-transform: uppercase; letter-spacing: 0.07em; }
  ul { list-style: none; margin: 0; padding: 0; }
  nav a { display: block; padding: 4px 0; font-size: 14.5px; font-stretch: 88%; line-height: 1.3; }
  nav a:hover { text-decoration: underline; text-underline-offset: 3px; }
  .socials { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 12px; font-size: 14px; }
  .socials a { text-decoration: underline; text-underline-offset: 3px; }

  .notice-line { margin-top: 28px; padding-top: 14px; border-top: var(--rule); max-width: 900px; font: 13.5px/1.55 var(--serif); }
  .listings { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-top: 16px; }
  .listings ul { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; font-size: 13.5px; }
  .listings img { display: block; height: 32px; width: auto; }
  .base { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 20px; margin-top: 16px; font-size: 13px; font-stretch: 88%; color: var(--ink-3); }
  .base a { text-decoration: underline; text-underline-offset: 3px; }

  @media (max-width: 1000px) {
    .columns { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .about { grid-column: 1 / -1; }
    .about p { max-width: 520px; }
  }
  @media (max-width: 680px) {
    .columns { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 20px; }
    nav a { padding: 7px 0; }
  }
</style>

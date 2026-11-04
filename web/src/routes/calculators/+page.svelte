<script lang="ts">
  import { BRAND, DOMAIN } from "$lib/brand";
  import { CATEGORIES, META } from "$lib/calculators/catalog";

  const description = `${META.length} free financial calculators for India: SIP, EMI, home loan, FD, PPF, EPF, NPS, income tax, GST and more. Instant results, no sign-up.`;

  let query = $state("");
  const words = $derived(query.toLowerCase().split(/\s+/).filter(Boolean));
  const matches = (m: (typeof META)[number]) => {
    const text = `${m.title} ${m.blurb} ${m.category} ${m.terms ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  };
  const groups = $derived(CATEGORIES.map((category) => ({ category, items: META.filter((m) => m.category === category && matches(m)) })).filter((g) => g.items.length));

  const jsonLd = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Financial calculators",
    description,
    url: `https://${DOMAIN}/calculators`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: META.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: m.title, url: `https://${DOMAIN}/calculators/${m.slug}` })),
    },
  }).replace(/</g, "\\u003c")}<\/script>`;
</script>

<svelte:head>
  <title>Financial calculators for India: SIP, EMI, tax and more — {BRAND}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="https://{DOMAIN}/calculators" />
  {@html jsonLd}
</svelte:head>

<div class="page">
  <div class="page-head plain">
    <div class="intro">
      <h1>Calculators</h1>
      <p class="sub">Plan investments, loans, savings and tax with sums that follow Indian rules. Every answer comes with its formula and a year-by-year breakdown.</p>
    </div>
    <div class="find">
      <label class="sr-only" for="calc-search">Search calculators</label>
      <input id="calc-search" type="search" placeholder="Search: SIP, EMI, tax…" autocomplete="off" bind:value={query} />
      <p class="dateline">{META.length} calculators · No sign-up · Your numbers stay on your device</p>
    </div>
  </div>

  {#each groups as g (g.category)}
    <section class="card">
      <div class="card-head"><h2>{g.category}</h2></div>
      <ul class="list">
        {#each g.items as m (m.slug)}
          <li>
            <a href="/calculators/{m.slug}">
              <h3>{m.title}</h3>
              <p>{m.blurb}</p>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <p class="empty">No calculator matches “{query}”.</p>
  {/each}

  <section class="about">
    <h2>What these calculators do, and what they don't</h2>
    <p>Each one is arithmetic on the numbers you enter. The sums run in your browser, so what you type isn't sent to us. Government rates, such as those on PPF and EPF, are filled in for you and you can change them.</p>
    <p>Returns on market investments aren't guaranteed, so treat those results as a range to plan around, and not a forecast. When you are ready to look at specific investments, start with <a href="/mutual-funds">mutual funds</a> or the <a href="/screener">stock screener</a>.</p>
  </section>
</div>

<style>
  .page-head.plain { border-bottom: 0; padding-bottom: 0; }
  .intro { max-width: 680px; }
  .intro .sub { font-size: 17px; line-height: 1.45; color: var(--ink-2); }
  .find { display: grid; gap: 8px; width: min(100%, 420px); }
  .find input { width: 100%; height: 44px; font-size: 16px; }

  .list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 32px; list-style: none; margin: 0; padding: 0; }
  li { border-top: 1px solid var(--line); }
  li a { display: block; height: 100%; padding: 12px 0 16px; }
  h3 { font-size: 20px; font-weight: 800; font-stretch: 70%; line-height: 1.15; }
  li a:hover h3 { color: var(--brand-2); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1.5px; }
  li p { margin-top: 3px; font: 15px/1.4 var(--serif); color: var(--ink-2); }

  .about { max-width: 720px; display: grid; gap: 10px; font: 16.5px/1.6 var(--serif); }
  .about h2 { font: 800 22px var(--display); font-stretch: 72%; }
  .about a { text-decoration: underline; text-underline-offset: 3px; }

  @media (max-width: 900px) { .list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .list { grid-template-columns: minmax(0, 1fr); } }
</style>

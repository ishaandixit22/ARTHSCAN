<script lang="ts">
  import { BRAND, DOMAIN } from "$lib/brand";
  import { META } from "$lib/calculators/catalog";
  import { CONTENT } from "$lib/calculators/content";
  import CalculatorView from "$lib/components/CalculatorView.svelte";

  let { data } = $props();
  const meta = $derived(data.meta);
  const copy = $derived(CONTENT[meta.slug]);
  const url = $derived(`https://${DOMAIN}/calculators/${meta.slug}`);
  const related = $derived(META.filter((m) => m.category === meta.category && m.slug !== meta.slug).slice(0, 6));

  const jsonLd = $derived(`<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebApplication", name: meta.title, url, description: copy.description, applicationCategory: "FinanceApplication", operatingSystem: "Any", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Calculators", item: `https://${DOMAIN}/calculators` },
        { "@type": "ListItem", position: 2, name: meta.title, item: url },
      ] },
      { "@type": "FAQPage", mainEntity: copy.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  }).replace(/</g, "\\u003c")}<\/script>`);
</script>

<svelte:head>
  <title>{meta.title} for India — {BRAND}</title>
  <meta name="description" content={copy.description} />
  <link rel="canonical" href={url} />
  {@html jsonLd}
</svelte:head>

<div class="page">
  <div class="page-head plain">
    <div class="intro">
      <nav class="dateline" aria-label="Breadcrumb"><a href="/calculators">Calculators</a> / {meta.category}</nav>
      <h1>{meta.title}</h1>
      <p class="sub">{copy.lede}</p>
    </div>
  </div>

  {#key meta.slug}<CalculatorView slug={meta.slug} />{/key}

  <div class="read">
    <section class="how">
      <h2>How it's worked out</h2>
      {#each copy.how as p (p)}<p>{p}</p>{/each}
      <p class="explainer"><b>The formula</b>{copy.formula}</p>
    </section>

    <section class="faq">
      <h2>Common questions</h2>
      {#each copy.faq as f (f.q)}
        <details>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      {/each}
    </section>
  </div>

  {#if copy.next}
    <a class="next" href={copy.next.href}>{copy.next.label} <span aria-hidden="true">→</span></a>
  {/if}

  <section class="card">
    <div class="card-head"><h2>More {meta.category.toLowerCase()} calculators</h2><a class="sub" href="/calculators">All calculators</a></div>
    <ul class="related">
      {#each related as m (m.slug)}
        <li><a href="/calculators/{m.slug}"><b>{m.title}</b><span>{m.blurb}</span></a></li>
      {/each}
    </ul>
  </section>

  <p class="small">Illustrative figures only, from the numbers you enter and the assumptions stated above. Rates and rules change, so check them with the provider or a qualified adviser before acting. {BRAND} is not a SEBI-registered research analyst or investment adviser, and nothing here is investment advice.</p>
</div>

<style>
  .page-head.plain { border-bottom: 0; padding-bottom: 0; }
  .intro { max-width: 760px; }
  .intro .dateline { margin-bottom: 10px; }
  .intro .dateline a { text-decoration: underline; text-underline-offset: 2px; }
  .intro .sub { font-size: 17px; line-height: 1.45; color: var(--ink-2); }

  .read { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px 40px; align-items: start; }
  .read h2 { padding-top: 10px; margin-bottom: 12px; border-top: var(--rule-heavy); font-size: 15px; font-weight: 850; font-stretch: 72%; text-transform: uppercase; letter-spacing: 0.05em; }
  .how { display: grid; gap: 12px; font: 16.5px/1.55 var(--serif); }
  .how h2 { margin-bottom: 0; }
  .explainer { overflow-wrap: anywhere; }
  details { border-bottom: 1px solid var(--line); }
  summary { padding: 11px 0; font-size: 16px; font-weight: 700; font-stretch: 85%; cursor: pointer; }
  summary:hover { color: var(--brand-2); }
  details p { padding-bottom: 14px; font: 16px/1.5 var(--serif); color: var(--ink-2); }

  .next { justify-self: start; font: 800 22px/1.2 var(--display); font-stretch: 72%; text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px; }

  .related { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 32px; list-style: none; margin: 0; padding: 0; }
  .related li { border-top: 1px solid var(--line); }
  .related a { display: grid; gap: 2px; padding: 10px 0 12px; }
  .related b { font-weight: 800; font-stretch: 78%; font-size: 15.5px; }
  .related span { font: 14px/1.35 var(--serif); color: var(--ink-3); }
  .small { max-width: 820px; font: 13.5px/1.5 var(--serif); color: var(--ink-3); }

  @media (max-width: 860px) {
    .read { grid-template-columns: minmax(0, 1fr); }
    .related { grid-template-columns: minmax(0, 1fr); }
  }
</style>

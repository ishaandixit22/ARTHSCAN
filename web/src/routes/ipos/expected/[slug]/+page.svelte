<script lang="ts">
  import { BRAND } from "$lib/brand";
  import IpoLogo from "$lib/components/IpoLogo.svelte";
  import { date, fetchedAt } from "$lib/format";
  import { DOC_NAME, filingLogo } from "$lib/ipo-filing";

  let { data } = $props();
  const c = $derived(data.company);
  const f = $derived(c.filing);
  const updated = $derived(f.doc === "UDRHP");
</script>

<svelte:head>
  <title>{c.name} IPO: draft filed with SEBI — {BRAND}</title>
  <meta name="description" content="{c.name} filed a {DOC_NAME[f.doc]} with SEBI on {date(f.filed)}. Read the filing. No IPO dates or price have been published on this list." />
</svelte:head>

<div class="page">
  <p class="crumbs"><a href="/">Home</a> › <a href="/ipos?tab=expected">Expected IPOs</a> › {c.name}</p>

  <header class="head">
    <IpoLogo src={filingLogo(f.website, data.logoKey, 56)} name={c.name} size={56} />
    <div>
      <h1>{c.name}</h1>
      <p class="tags"><span class="badge">Dates awaited</span> {c.board}</p>
    </div>
  </header>

  <p class="lede">{c.name} filed {updated ? "an" : "a"} {DOC_NAME[f.doc]} ({f.doc}) with SEBI on {date(f.filed)}. That is an early step towards an IPO. It does not mean an IPO will follow, and no bidding dates or price are shown on SEBI's list.</p>

  <section aria-labelledby="docs">
    <h2 id="docs">Read the filing</h2>
    <p class="note">The draft sets out the proposed issue, the business, its finances and its risks.</p>
    <ul class="docs">
      <li><a href={f.url} target="_blank" rel="noopener">{DOC_NAME[f.doc]}</a> <span>on SEBI's website</span></li>
      {#if f.website}<li><a href="https://{f.website}" target="_blank" rel="noopener nofollow">{f.website}</a> <span>the company's website, as its prospectus gives it</span></li>{/if}
      {#if f.abridged_url}<li><a href={f.abridged_url} target="_blank" rel="noopener">Draft Abridged Prospectus</a> <span>PDF on SEBI's website</span></li>{/if}
    </ul>
  </section>

  <section aria-labelledby="stands">
    <h2 id="stands">Where it stands</h2>
    <ol class="steps">
      <li class="done"><b>{updated ? "Updated draft filed" : "Draft filed"}</b><span>{date(f.filed)}{#if updated}. An updated draft follows a confidential filing.{/if}</span></li>
      <li><b>SEBI's review</b><span>SEBI's filing list doesn't show how far this has gone.</span></li>
      <li><b>Red herring prospectus</b><span>Not on SEBI's list when we last read it. This usually comes with the dates and price band.</span></li>
      <li><b>Bidding and listing</b><span>Dates awaited.</span></li>
    </ol>
  </section>

  <p class="sub source">
    From <a href="https://www.sebi.gov.in/filings/public-issues.html" target="_blank" rel="noopener">SEBI's public issue filings</a>{#if data.read_at}, read {fetchedAt(data.read_at)}{/if}. A draft can be returned, withdrawn or left to lapse, and this page can't always show that. Nothing here is investment advice.
  </p>
</div>

<style>
  .crumbs { color: var(--ink-3); font-size: 13px; margin: 0; }
  .crumbs a:hover { color: var(--ink); }
  .head { display: flex; align-items: center; gap: 16px; }
  .tags { display: flex; align-items: center; gap: 8px; margin: 10px 0 0; color: var(--ink-2); font-size: 13.5px; }
  .badge { padding: 2px 8px; border-radius: var(--radius-s); background: var(--panel-2); color: var(--ink-2); font-size: 12.5px; font-weight: 700; white-space: nowrap; }
  .lede { max-width: 66ch; margin: 0; font-family: var(--serif); font-size: 18px; line-height: 1.5; }
  section { max-width: 66ch; }
  h2 { margin-bottom: 12px; font-size: 22px; font-weight: 850; font-stretch: 72%; }
  .note { margin: 0 0 12px; font-family: var(--serif); color: var(--ink-2); line-height: 1.5; }
  .docs { display: grid; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line-2); }
  .docs li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 16px; padding: 12px 0; border-bottom: 1px solid var(--line-2); }
  .docs a { font-weight: 650; text-decoration: underline; }
  .docs span { color: var(--ink-3); font-size: 13px; }
  .steps { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
  .steps li { display: grid; gap: 2px; padding: 0 0 18px 22px; border-left: 2px solid var(--line-2); margin-left: 5px; position: relative; }
  .steps li:last-child { padding-bottom: 0; }
  .steps li::before { content: ""; position: absolute; left: -7px; top: 5px; width: 12px; height: 12px; border-radius: 50%; background: var(--panel, #fff); border: 2px solid var(--line-2); box-sizing: border-box; }
  .steps li.done::before { background: var(--ink); border-color: var(--ink); }
  .steps b { font-weight: 650; }
  .steps span { font-family: var(--serif); font-size: 14.5px; line-height: 1.45; color: var(--ink-2); }
  .source { max-width: 66ch; margin: 0; font-size: 12.5px; line-height: 1.55; }
  .source a { text-decoration: underline; }
</style>

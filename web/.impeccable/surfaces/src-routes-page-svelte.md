---
version: 1
slug: "src-routes-page-svelte"
primary_target: "src/routes/+page.svelte"
related_targets: ["src/routes/+layout.svelte","src/app.css"]
---

## Scope

Whole site, led by the home page (Persuade: it is the showcase for investors and incubators and the front door for beginners). App pages (stock, screener, sectors, IPOs, flows, heatmap and the rest) are Operate surfaces in the same world. Audience, job and constraints: PRODUCT.md.

## Direction contract

THESIS: Arthscan is the day's market edition of an Indian pink business paper. Every page is a printed market page that explains as it reports. It refuses the fintech default of white or near-black cards with a green accent, and it refuses padded boxes around every number.

OWN-WORLD: Salmon newsprint ground across the whole page (#f3d9c6, with a deeper salmon for set-in panels). Ink-black type and column rules: hairlines between columns, a double rule under the masthead, and a heavy rule that opens each section. Gains are printed in bottle green and losses in press red. A condensed grotesque sets headlines and figures (Archivo at its narrow widths, with tabular figures); a text serif sets the reading copy (Source Serif 4); the masthead carries अर्थ in Tiro Devanagari. There are no cards: listings are ruled tables, and an explanation is set as a reversed ink box, an inset like a newspaper "explainer". A night edition reverses the scheme to ink ground with salmon type.

STORY: A visitor reads the day's market in one headline sentence, then sees the Nifty 100 as a 3D city printed on the page and touches it. Gainers and losers mirror each other about one axis. FII and DII money flows sit in the same ruled column. Every figure carries its source and time like a dateline, and every metric has an explainer within reach. The visitor searches for a company or opens the screener.

FIRST VIEWPORT: The masthead runs full width: the edition and date line on the left, अर्थ ARTHSCAN centred in a condensed face at about 72px, navigation on the right, a double rule beneath it, and the index strip below that (Nifty, Sensex, Bank Nifty, VIX, advances and declines). Below sit three columns. The left column, about 23% wide, holds the day's headline at about 60px in condensed type, a plain-English standfirst, the company search set as an inked input with a "Look up" button (the primary action), and a breadth explainer box. The centre column, about 55% wide, is the WebGL city, rendered as ink and salmon with green and red towers and a caption line under it. The right column, about 22% wide, holds gainers above an axis and losers below it, then FII/DII flows.

FORM: The Pink Paper market page, first of the seven candidates by the roll's assignment (my resonance list placed it fifth). seed: b2249cd42fca6d5d. Raises taken from the declined challengers: each figure carries its source and time (moon-shadow bazaar); listings are ruled as tight as a real stock table (Japanese high-density); gainers and losers mirror about one axis (Versailles); the screener previews matches as each filter is set (darkroom); live ticks ripple outward from the stock that moved (ebru). Signature interaction: the 3D city, inked on salmon. Motion grammar: a press-run reveal, where columns set in from top to bottom once on load, and a ripple from each live tick.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- The night edition's exact palette is to be settled at build time.

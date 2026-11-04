<script lang="ts">
  // The stock page's full chart: every timeframe Dhan can supply, candle styles, indicators,
  // drawings, marked OHLC levels, scales, screenshot and full screen. Candles come through
  // /stock/<symbol>/chart. Drawings and choices are kept in this browser.
  import { onMount, untrack } from "svelte";
  import type { Chart, KLineData } from "klinecharts";
  import { INDICATORS, registerChartTools, TOOLS, type OhlcMark } from "$lib/chart-tools";
  import { compact, date as fmtDate } from "$lib/format";
  import { theme } from "$lib/theme.svelte";

  type Tick = { ltp: number | null; volume?: number | null };
  type Action = { kind: string; date: string; text: string };
  let { symbol, name, tick = null, actions = [] }: { symbol: string; name: string; tick?: Tick | null; actions?: Action[] } = $props();

  const TIMEFRAMES = [
    { tf: "1", label: "1m", period: { type: "minute", span: 1 } },
    { tf: "3", label: "3m", period: { type: "minute", span: 3 } },
    { tf: "5", label: "5m", period: { type: "minute", span: 5 } },
    { tf: "15", label: "15m", period: { type: "minute", span: 15 } },
    { tf: "30", label: "30m", period: { type: "minute", span: 30 } },
    { tf: "60", label: "1h", period: { type: "hour", span: 1 } },
    { tf: "D", label: "D", period: { type: "day", span: 1 } },
    { tf: "W", label: "W", period: { type: "week", span: 1 } },
    { tf: "M", label: "M", period: { type: "month", span: 1 } },
  ] as const;
  const RANGES = [
    { key: "1d", label: "1d", tf: "5", bars: 75 },
    { key: "5d", label: "5d", tf: "15", bars: 125 },
    { key: "1m", label: "1m", tf: "60", bars: 150 },
    { key: "3m", label: "3m", tf: "D", bars: 63 },
    { key: "6m", label: "6m", tf: "D", bars: 126 },
    { key: "1y", label: "1y", tf: "D", bars: 252 },
    { key: "5y", label: "5y", tf: "W", bars: 260 },
    { key: "max", label: "Max", tf: "M", bars: 0 },
  ] as const;
  const STYLES = [
    { type: "candle_solid", label: "Candles" },
    { type: "candle_stroke", label: "Hollow candles" },
    { type: "ohlc", label: "OHLC bars" },
    { type: "area", label: "Line" },
  ] as const;
  const SCALES = [{ name: "normal", label: "auto" }, { name: "percentage", label: "%" }, { name: "logarithm", label: "log" }] as const;
  const MAIN_PANE = "candle_pane";
  const PREFS_KEY = "arthscan.chart.v1";
  const drawingsKey = (s: string) => `arthscan.chart.drawings.${s}`;
  const EVENT_LOOK: Record<string, { letter: string; color: string; word: string }> = {
    dividend: { letter: "D", color: "#a8261a", word: "Dividend" },
    bonus: { letter: "B", color: "#1f4a7a", word: "Bonus" },
    rights: { letter: "R", color: "#6b4a7a", word: "Rights" },
    split: { letter: "S", color: "#8a4b06", word: "Split" },
  };

  let shell = $state<HTMLElement>();
  let host = $state<HTMLDivElement>();
  let chart: Chart | undefined;
  let kl: typeof import("klinecharts") | undefined;

  let tf = $state<string>("D");
  let rangeKey = $state<string>("1y");
  let style = $state<string>("candle_solid");
  let scale = $state<string>("normal");
  let activeIndicators = $state<string[]>(["VOL"]);
  let openMenu = $state<"" | "indicators" | "style">("");
  let tool = $state<string>("");
  let magnet = $state(false);
  let locked = $state(false);
  let hidden = $state(false);
  let showEvents = $state(true);
  let prevLevels = $state(false);
  let selected = $state<string | null>(null);
  let isFull = $state(false);
  let loading = $state(true);
  let problem = $state("");
  let hover = $state<KLineData | null>(null);
  let hoverPrev = $state<number | null>(null);
  let lastBar = $state<KLineData | null>(null);
  let lastPrev = $state<number | null>(null);
  let note = $state("");
  let labelText = $state("");
  let undoStack = $state<string[]>([]);
  let redoStack = $state<string[]>([]);

  const shown = $derived(hover ?? lastBar);
  const shownPrev = $derived(hover ? hoverPrev : lastPrev);
  const change = $derived(shown && shownPrev ? shown.close - shownPrev : null);
  const changePct = $derived(change != null && shownPrev ? (change / shownPrev) * 100 : null);
  const tfLabel = $derived(TIMEFRAMES.find((t) => t.tf === tf)?.label ?? tf);
  const isIntraday = $derived(!["D", "W", "M"].includes(tf));

  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const store = {
    read<T>(key: string): T | null {
      try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
    },
    write(key: string, value: unknown) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window: choices last this visit */ }
    },
  };
  const savePrefs = () => store.write(PREFS_KEY, { tf, rangeKey, style, scale, indicators: activeIndicators, showEvents });

  function chartStyles() {
    const up = css("--up"), down = css("--down"), ink = css("--ink"), ink3 = css("--ink-3"), line = css("--line"), line2 = css("--line-2"), bg = css("--bg"), font = css("--font");
    const series = css("--series");
    const text = { color: ink3, family: font, size: 11 };
    return {
      grid: { horizontal: { color: line, style: "solid", size: 1 }, vertical: { color: line, style: "solid", size: 1 } },
      candle: {
        type: style,
        bar: { upColor: up, downColor: down, noChangeColor: ink3, upBorderColor: up, downBorderColor: down, noChangeBorderColor: ink3, upWickColor: up, downWickColor: down, noChangeWickColor: ink3 },
        area: { lineColor: series, lineSize: 2, value: "close", backgroundColor: [{ offset: 0, color: `${series}22` }, { offset: 1, color: `${series}05` }], point: { show: false } },
        priceMark: {
          high: { color: ink3, textFamily: font }, low: { color: ink3, textFamily: font },
          last: { upColor: up, downColor: down, noChangeColor: ink3, text: { family: font, size: 11, color: "#ffffff" } },
        },
        tooltip: { showRule: "none" },
      },
      indicator: {
        tooltip: { showRule: "always", title: { color: ink3, family: font, size: 11 }, legend: { color: ink3, family: font, size: 11 } },
        lines: [series, "#a8661a", "#6b4a7a", "#0d6537", "#ad2216"].map((color) => ({ color, size: 1.2, style: "solid", smooth: false })),
        bars: [{ upColor: `${up}66`, downColor: `${down}66`, noChangeColor: `${ink3}66` }],
        lastValueMark: { show: false },
      },
      xAxis: { axisLine: { color: line2 }, tickLine: { color: line2 }, tickText: text },
      yAxis: { axisLine: { color: line2 }, tickLine: { color: line2 }, tickText: text },
      separator: { color: line2, activeBackgroundColor: `${series}22` },
      crosshair: {
        horizontal: { line: { color: ink3, style: "dashed", dashedValue: [3, 3] }, text: { backgroundColor: ink, borderColor: ink, color: bg, family: font, size: 11 } },
        vertical: { line: { color: ink3, style: "dashed", dashedValue: [3, 3] }, text: { backgroundColor: ink, borderColor: ink, color: bg, family: font, size: 11 } },
      },
      overlay: {
        line: { color: series, size: 1.5 },
        point: { color: series, borderColor: `${series}55`, activeColor: series, activeBorderColor: `${series}55` },
        text: { color: ink, family: font, size: 12 },
        rectText: { backgroundColor: ink, borderColor: ink, color: bg, family: font, size: 11 },
        polygon: { color: `${series}18`, borderColor: series },
      },
    } as any;
  }
  const marks = () => ({ up: css("--up"), down: css("--down"), ink: css("--ink"), series: css("--series") });

  // ── Data ─────────────────────────────────────────────────────────

  async function fetchBars(forTf: string, before?: number) {
    const q = new URLSearchParams({ tf: forTf });
    if (before) q.set("before", String(before));
    const res = await fetch(`/stock/${encodeURIComponent(symbol)}/chart?${q}`);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.candles) throw new Error(body?.error ?? "unavailable");
    const data: KLineData[] = body.candles.map((c: number[]) => ({ timestamp: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] }));
    return { data, more: !!body.more, fallback: !!body.fallback };
  }

  let pendingFit = 0;
  let pushBar: ((b: KLineData) => void) | null = null;
  let cumulative: number | null = null;

  const loader = {
    getBars: async ({ type, timestamp, period, callback }: any) => {
      const wanted = TIMEFRAMES.find((t) => t.period.type === period.type && t.period.span === period.span)?.tf ?? "D";
      if (type === "backward") return callback([], { backward: false, forward: false });
      if (type === "init") { loading = true; problem = ""; hover = null; }
      try {
        const { data, more, fallback } = await fetchBars(wanted, type === "forward" ? timestamp : undefined);
        if (wanted !== tf) return callback([], false);
        callback(data, { forward: more, backward: false });
        if (type === "init") {
          loading = false;
          note = fallback ? "Showing stored daily closes. Live chart data isn't available right now." : "";
          if (!data.length) problem = `No ${tfLabel} candles for this stock. Try a longer timeframe.`;
          afterLoad(data);
        }
      } catch {
        callback([], false);
        if (type === "init") {
          loading = false;
          problem = isIntraday ? `${tfLabel} candles aren't available right now. Daily, weekly and monthly may still work.` : "The chart's prices aren't available right now. Try again in a minute.";
        }
      }
    },
    subscribeBar: ({ callback }: any) => { pushBar = callback; cumulative = null; },
    unsubscribeBar: () => { pushBar = null; },
  };

  function afterLoad(data: KLineData[]) {
    refreshLast(data);
    fitRange();
    drawEvents();
    drawPrevLevels();
  }

  function refreshLast(list?: KLineData[]) {
    const rows = list ?? chart?.getDataList() ?? [];
    lastBar = rows[rows.length - 1] ?? null;
    lastPrev = rows[rows.length - 2]?.close ?? null;
  }

  function fitRange() {
    if (!chart || !host) return;
    const list = chart.getDataList();
    const want = pendingFit || list.length;
    const width = host.clientWidth - 70;
    const bars = Math.min(want, list.length) || 1;
    chart.setBarSpace(Math.max(1, Math.min(24, width / bars)));
    chart.scrollToRealTime();
    pendingFit = 0;
  }

  function setTimeframe(next: string, bars = 0, range = "") {
    openMenu = "";
    rangeKey = range;
    pendingFit = bars || (["D"].includes(next) ? 252 : ["W", "M"].includes(next) ? 0 : 150);
    if (next === tf) {
      fitRange();
    } else {
      tf = next;
      const t = TIMEFRAMES.find((x) => x.tf === next)!;
      chart?.setPeriod(t.period as any);
    }
    savePrefs();
  }

  // Live prices: build up the last bar, or open a new one when the bucket rolls over.
  $effect(() => {
    const t = tick;
    if (!t?.ltp || !chart || !pushBar) return;
    untrack(() => {
      const list = chart!.getDataList();
      const last = list[list.length - 1];
      if (!last) return;
      const spanMs = isIntraday ? Number(tf) * 60_000 : 0;
      const bucket = spanMs && Date.now() - last.timestamp >= spanMs ? last.timestamp + spanMs * Math.floor((Date.now() - last.timestamp) / spanMs) : last.timestamp;
      const volumeDelta = t.volume != null && cumulative != null ? Math.max(0, t.volume - cumulative) : 0;
      if (t.volume != null) cumulative = t.volume;
      const bar: KLineData = bucket === last.timestamp
        ? { ...last, close: t.ltp!, high: Math.max(last.high, t.ltp!), low: Math.min(last.low, t.ltp!), volume: (last.volume ?? 0) + volumeDelta }
        : { timestamp: bucket, open: t.ltp!, high: t.ltp!, low: t.ltp!, close: t.ltp!, volume: volumeDelta };
      pushBar!(bar);
      lastBar = bar;
    });
  });

  // ── Indicators ───────────────────────────────────────────────────

  function addIndicator(name: string) {
    const meta = INDICATORS.find((i) => i.name === name);
    if (!meta || !chart) return;
    if (meta.main) chart.createIndicator({ name, paneId: MAIN_PANE } as any, true);
    else chart.createIndicator({ name } as any, false);
  }
  function toggleIndicator(name: string) {
    if (!chart) return;
    if (activeIndicators.includes(name)) {
      chart.removeIndicator({ name });
      activeIndicators = activeIndicators.filter((n) => n !== name);
    } else {
      addIndicator(name);
      activeIndicators = [...activeIndicators, name];
    }
    savePrefs();
  }

  // ── Drawings ─────────────────────────────────────────────────────

  type Saved = { name: string; points: unknown; extendData?: unknown; lock?: boolean };
  const USER = "user";

  function snapshot(): string {
    const rows = (chart?.getOverlays({ groupId: USER }) ?? []).map((o) => ({ name: o.name, points: o.points.map((p) => ({ timestamp: p.timestamp, value: p.value })), extendData: o.extendData }));
    return JSON.stringify(rows);
  }
  function saveDrawings() {
    store.write(drawingsKey(symbol), JSON.parse(snapshot()));
  }
  function remember() {
    undoStack = [...undoStack, lastState].slice(-50);
    redoStack = [];
    lastState = snapshot();
    saveDrawings();
  }
  let lastState = "[]";

  function overlayHooks() {
    return {
      groupId: USER,
      lock: locked,
      visible: !hidden,
      mode: magnet ? "strong_magnet" : "normal",
      styles: { marks: marks() } as any,
      onSelected: ({ overlay }: any) => { selected = overlay.id; return false; },
      onDeselected: () => { selected = null; return false; },
      onPressedMoveEnd: () => { remember(); return false; },
      onRightClick: ({ overlay }: any) => { chart?.removeOverlay({ id: overlay.id }); selected = null; remember(); return true; },
    };
  }

  function restore(rows: Saved[]) {
    if (!chart) return;
    chart.removeOverlay({ groupId: USER });
    selected = null;
    for (const r of rows) chart.createOverlay({ ...overlayHooks(), name: r.name, points: r.points, extendData: r.extendData } as any);
  }

  function pickTool(name: string) {
    if (!chart) return;
    if (tool === name) { tool = ""; chart.removeOverlay({ groupId: "drawing" }); return; }
    tool = name;
    const text = name === "simpleAnnotation" ? labelText.trim() || "Note" : undefined;
    chart.createOverlay({
      ...overlayHooks(), name, extendData: text,
      onDrawEnd: ({ overlay }: any) => {
        // A marked candle keeps its figures, so it survives a reload or a change of timeframe.
        if (name === "ohlcMark") {
          const bar = chart!.getDataList()[overlay.points[0]?.dataIndex ?? -1];
          if (bar) chart!.overrideOverlay({ id: overlay.id, extendData: { o: bar.open, h: bar.high, l: bar.low, c: bar.close } satisfies OhlcMark });
        }
        tool = "";
        queueMicrotask(remember);
        return false;
      },
    } as any);
  }

  function removeSelected() {
    if (!selected || !chart) return;
    chart.removeOverlay({ id: selected });
    selected = null;
    remember();
  }
  function clearDrawings() {
    if (!chart?.getOverlays({ groupId: USER }).length) return;
    chart.removeOverlay({ groupId: USER });
    selected = null;
    remember();
  }
  function undo() {
    const prev = undoStack[undoStack.length - 1];
    if (prev == null) return;
    undoStack = undoStack.slice(0, -1);
    redoStack = [...redoStack, lastState];
    lastState = prev;
    restore(JSON.parse(prev));
    saveDrawings();
  }
  function redo() {
    const next = redoStack[redoStack.length - 1];
    if (next == null) return;
    redoStack = redoStack.slice(0, -1);
    undoStack = [...undoStack, lastState];
    lastState = next;
    restore(JSON.parse(next));
    saveDrawings();
  }
  function applyToAll(fields: Record<string, unknown>) {
    for (const o of chart?.getOverlays({ groupId: USER }) ?? []) chart!.overrideOverlay({ id: o.id, ...fields } as any);
  }
  const toggleMagnet = () => { magnet = !magnet; applyToAll({ mode: magnet ? "strong_magnet" : "normal" }); };
  const toggleLock = () => { locked = !locked; applyToAll({ lock: locked }); };
  const toggleHidden = () => { hidden = !hidden; applyToAll({ visible: !hidden }); };

  // ── Marks the chart draws itself ─────────────────────────────────

  function drawEvents() {
    if (!chart) return;
    chart.removeOverlay({ groupId: "events" });
    note = note.startsWith("Dividend") || note.startsWith("Bonus") || note.startsWith("Rights") || note.startsWith("Split") ? "" : note;
    if (!showEvents || isIntraday) return;
    const list = chart.getDataList();
    if (!list.length) return;
    for (const a of actions) {
      const when = Date.parse(`${a.date}T00:00:00+05:30`);
      if (when < list[0].timestamp || when > list[list.length - 1].timestamp + 31 * 86400_000) continue;
      let bar = list[0];
      for (const k of list) { if (k.timestamp <= when) bar = k; else break; }
      const look = EVENT_LOOK[a.kind] ?? EVENT_LOOK.dividend;
      chart.createOverlay({
        name: "eventMark", groupId: "events", lock: true,
        points: [{ timestamp: bar.timestamp, value: bar.high }],
        extendData: { letter: look.letter, color: look.color, text: a.text },
        onMouseEnter: () => { note = `${look.word} · ${fmtDate(a.date)}: ${a.text}`; return false; },
        onMouseLeave: () => { note = ""; return false; },
      } as any);
    }
  }

  /** The previous session's open, high, low and close, drawn across the chart. */
  function drawPrevLevels() {
    if (!chart) return;
    chart.removeOverlay({ groupId: "prev" });
    if (!prevLevels) return;
    const list = chart.getDataList();
    if (list.length < 2) return;
    let mark: OhlcMark, at: KLineData;
    if (isIntraday) {
      const dayOf = (k: KLineData) => new Date(k.timestamp + 19800_000).toISOString().slice(0, 10);
      const today = dayOf(list[list.length - 1]);
      let end = list.length - 1;
      while (end >= 0 && dayOf(list[end]) === today) end--;
      if (end < 0) return;
      const day = dayOf(list[end]);
      let start = end;
      while (start > 0 && dayOf(list[start - 1]) === day) start--;
      const bars = list.slice(start, end + 1);
      at = bars[0];
      mark = { o: bars[0].open, h: Math.max(...bars.map((b) => b.high)), l: Math.min(...bars.map((b) => b.low)), c: bars[bars.length - 1].close, label: "Prev" };
    } else {
      at = list[list.length - 2];
      mark = { o: at.open, h: at.high, l: at.low, c: at.close, label: "Prev" };
    }
    chart.createOverlay({ name: "ohlcMark", groupId: "prev", lock: true, styles: { marks: marks() } as any, points: [{ timestamp: at.timestamp, value: at.close }], extendData: mark } as any);
  }

  // ── Screen ───────────────────────────────────────────────────────

  function setScale(next: string) {
    scale = next;
    chart?.setPaneOptions({ id: MAIN_PANE, axis: { name: next } } as any);
    savePrefs();
  }
  function setStyle(next: string) {
    style = next;
    openMenu = "";
    chart?.setStyles({ candle: { type: next } } as any);
    savePrefs();
  }
  const zoom = (by: number) => chart?.zoomAtCoordinate(by, undefined, 120);
  function screenshot() {
    if (!chart) return;
    const url = chart.getConvertPictureUrl(true, "png", css("--bg"));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${symbol}-${tfLabel}.png`;
    a.click();
  }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else shell?.requestFullscreen?.().catch(() => {});
  }

  onMount(() => {
    const prefs = store.read<{ tf?: string; rangeKey?: string; style?: string; scale?: string; indicators?: string[]; showEvents?: boolean }>(PREFS_KEY);
    if (prefs) {
      if (TIMEFRAMES.some((t) => t.tf === prefs.tf)) tf = prefs.tf!;
      rangeKey = prefs.rangeKey ?? "";
      if (STYLES.some((s) => s.type === prefs.style)) style = prefs.style!;
      if (SCALES.some((s) => s.name === prefs.scale)) scale = prefs.scale!;
      if (Array.isArray(prefs.indicators)) activeIndicators = prefs.indicators.filter((n) => INDICATORS.some((i) => i.name === n));
      showEvents = prefs.showEvents ?? true;
    }
    pendingFit = RANGES.find((r) => r.key === rangeKey)?.bars ?? (tf === "D" ? 252 : 150);

    let disposed = false;
    const onCrosshair = (c: any) => {
      const list = chart?.getDataList() ?? [];
      const i = c?.dataIndex;
      if (c?.kLineData && i != null) {
        hover = c.kLineData;
        hoverPrev = list[i - 1]?.close ?? null;
      } else {
        hover = null;
      }
    };
    (async () => {
      kl = await import("klinecharts");
      if (disposed || !host) return;
      registerChartTools(kl);
      chart = kl.init(host, { timezone: "Asia/Kolkata", locale: "en-US", styles: chartStyles() }) ?? undefined;
      if (!chart) { problem = "This browser couldn't start the chart."; loading = false; return; }
      chart.setOffsetRightDistance(48);
      chart.subscribeAction("onCrosshairChange", onCrosshair);
      if (scale !== "normal") chart.setPaneOptions({ id: MAIN_PANE, axis: { name: scale } } as any);
      for (const n of activeIndicators) addIndicator(n);
      chart.setSymbol({ ticker: symbol, pricePrecision: 2, volumePrecision: 0 });
      chart.setPeriod(TIMEFRAMES.find((t) => t.tf === tf)!.period as any);
      chart.setDataLoader(loader as any);
      const saved = store.read<Saved[]>(drawingsKey(symbol));
      if (saved?.length) {
        restore(saved);
        lastState = snapshot();
      }
    })();

    const ro = new ResizeObserver(() => chart?.resize());
    ro.observe(host!);
    // The page scrolls with the wheel; the chart zooms with ctrl or ⌘ held, or anywhere in full screen.
    const wheel = (e: WheelEvent) => {
      if (!document.fullscreenElement && !e.ctrlKey && !e.metaKey) e.stopPropagation();
    };
    host!.addEventListener("wheel", wheel, { capture: true, passive: true });
    const onFull = () => { isFull = !!document.fullscreenElement; requestAnimationFrame(() => chart?.resize()); };
    document.addEventListener("fullscreenchange", onFull);
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) removeSelected();
      if (e.key === "Escape") { openMenu = ""; if (tool) pickTool(tool); }
    };
    addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      ro.disconnect();
      host?.removeEventListener("wheel", wheel, { capture: true } as any);
      document.removeEventListener("fullscreenchange", onFull);
      removeEventListener("keydown", onKey);
      if (chart) kl?.dispose(chart);
    };
  });

  // The theme switch repaints the canvas from the site's colours.
  $effect(() => {
    void theme.current;
    chart?.setStyles(untrack(chartStyles));
  });
  // News and actions arrive after the candles.
  $effect(() => {
    void actions;
    untrack(drawEvents);
  });
  // A different stock in the same page instance.
  let lastSymbol = symbol;
  $effect(() => {
    const s = symbol;
    untrack(() => {
      if (s === lastSymbol || !chart) return;
      lastSymbol = s;
      chart.removeOverlay({ groupId: USER });
      undoStack = [];
      redoStack = [];
      chart.setSymbol({ ticker: s, pricePrecision: 2, volumePrecision: 0 });
      const saved = store.read<Saved[]>(drawingsKey(s));
      if (saved?.length) restore(saved);
      lastState = snapshot();
    });
  });

  const when = (k: KLineData | null) => {
    if (!k) return "";
    const d = new Date(k.timestamp + 19800_000);
    const day = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return isIntraday ? `${day} ${d.toISOString().slice(11, 16)}` : day;
  };
  const fx = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
</script>

{#snippet icon(d: string)}
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path {d} /></svg>
{/snippet}

<div class="pro" class:full={isFull} bind:this={shell}>
  <div class="bar" role="toolbar" aria-label="Chart settings">
    <div class="group" role="group" aria-label="Candle size">
      {#each TIMEFRAMES as t}
        <button class:on={tf === t.tf} aria-pressed={tf === t.tf} onclick={() => setTimeframe(t.tf)}>{t.label}</button>
      {/each}
    </div>
    <div class="menu-wrap">
      <button class="wide" aria-expanded={openMenu === "style"} onclick={() => (openMenu = openMenu === "style" ? "" : "style")}>{STYLES.find((s) => s.type === style)?.label}</button>
      {#if openMenu === "style"}
        <div class="menu">
          {#each STYLES as s}<button class:on={style === s.type} onclick={() => setStyle(s.type)}>{s.label}</button>{/each}
        </div>
      {/if}
    </div>
    <div class="menu-wrap">
      <button class="wide" aria-expanded={openMenu === "indicators"} onclick={() => (openMenu = openMenu === "indicators" ? "" : "indicators")}>
        Indicators{#if activeIndicators.length}<span class="count">{activeIndicators.length}</span>{/if}
      </button>
      {#if openMenu === "indicators"}
        <div class="menu tall">
          {#each INDICATORS as i}
            <label class="choice">
              <input type="checkbox" checked={activeIndicators.includes(i.name)} onchange={() => toggleIndicator(i.name)} />
              <span><b>{i.label}</b><small>{i.about}</small></span>
            </label>
          {/each}
        </div>
      {/if}
    </div>
    <button class="wide" class:on={prevLevels} aria-pressed={prevLevels} title="Draw the previous session's open, high, low and close" onclick={() => { prevLevels = !prevLevels; drawPrevLevels(); }}>Previous OHLC</button>
    <button class="wide" class:on={showEvents} aria-pressed={showEvents} title="Mark dividends, bonuses, rights and splits on daily, weekly and monthly charts" onclick={() => { showEvents = !showEvents; drawEvents(); savePrefs(); }}>Events</button>
    <div class="spacer"></div>
    <button class="ico" title="Undo drawing" aria-label="Undo drawing" disabled={!undoStack.length} onclick={undo}>{@render icon("M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2")}</button>
    <button class="ico" title="Redo drawing" aria-label="Redo drawing" disabled={!redoStack.length} onclick={redo}>{@render icon("m15 7 5 5-5 5M20 12H9a5 5 0 0 0 0 10h2")}</button>
    <button class="ico" title="Zoom in" aria-label="Zoom in" onclick={() => zoom(1.4)}>{@render icon("M11 5v12M5 11h12M16 16l5 5")}</button>
    <button class="ico" title="Zoom out" aria-label="Zoom out" onclick={() => zoom(0.7)}>{@render icon("M5 11h12M16 16l5 5")}</button>
    <button class="ico" title="Save a picture of the chart" aria-label="Save a picture of the chart" onclick={screenshot}>{@render icon("M4 8h3l2-3h6l2 3h3v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6")}</button>
    <button class="ico" title={isFull ? "Leave full screen" : "Full screen"} aria-label={isFull ? "Leave full screen" : "Full screen"} onclick={toggleFull}>{@render icon(isFull ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5")}</button>
  </div>

  <div class="stage">
    <div class="rail" role="toolbar" aria-label="Drawing tools">
      <button class="ico mark" class:on={tool === "ohlcMark"} aria-pressed={tool === "ohlcMark"} title="Mark a candle's OHLC: pick this, then click a candle" aria-label="Mark a candle's open, high, low and close" onclick={() => pickTool("ohlcMark")}>OHLC</button>
      {#each TOOLS as t}
        <button class="ico" class:on={tool === t.name} aria-pressed={tool === t.name} title={t.label} aria-label={t.label} onclick={() => pickTool(t.name)}>{@render icon(t.icon)}</button>
      {/each}
      <button class="ico" class:on={tool === "simpleAnnotation"} aria-pressed={tool === "simpleAnnotation"} title="Text note" aria-label="Text note" onclick={() => pickTool("simpleAnnotation")}>{@render icon("M5 5h14M12 5v14M9 19h6")}</button>
      <i class="rule"></i>
      <button class="ico" class:on={magnet} aria-pressed={magnet} title="Magnet: snap drawings to a candle's open, high, low or close" aria-label="Magnet" onclick={toggleMagnet}>{@render icon("M6 4v9a6 6 0 0 0 12 0V4h-4v9a2 2 0 0 1-4 0V4zM6 8h4M14 8h4")}</button>
      <button class="ico" class:on={locked} aria-pressed={locked} title="Lock drawings" aria-label="Lock drawings" onclick={toggleLock}>{@render icon(locked ? "M6 11h12v9H6zM8 11V7a4 4 0 0 1 8 0v4" : "M6 11h12v9H6zM8 11V7a4 4 0 0 1 7.5-2")}</button>
      <button class="ico" class:on={hidden} aria-pressed={hidden} title="Hide drawings" aria-label="Hide drawings" onclick={toggleHidden}>{@render icon(hidden ? "M3 3l18 18M10 6.3A9 9 0 0 1 22 12a14 14 0 0 1-3 3.6M6 7.7A14 14 0 0 0 2 12s4 7 10 7a9 9 0 0 0 4-1" : "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6")}</button>
      <button class="ico" title="Remove the selected drawing, or right-click it" aria-label="Remove the selected drawing" disabled={!selected} onclick={removeSelected}>{@render icon("M6 6l12 12M18 6 6 18")}</button>
      <button class="ico" title="Clear every drawing" aria-label="Clear every drawing" onclick={clearDrawings}>{@render icon("M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13")}</button>
    </div>

    <div class="plot">
      <div class="legend" aria-live="off">
        <span class="who"><b>{symbol.replace(/^BSE-/, "")}</b> · {tfLabel} · {symbol.startsWith("BSE-") ? "BSE" : "NSE"}</span>
        {#if shown}
          <span class="ohlc {change != null && change < 0 ? 'down' : 'up'}">
            <i>O</i>{fx(shown.open)} <i>H</i>{fx(shown.high)} <i>L</i>{fx(shown.low)} <i>C</i>{fx(shown.close)}
            {#if change != null}<b>{change >= 0 ? "+" : ""}{fx(change)} ({changePct! >= 0 ? "+" : ""}{changePct!.toFixed(2)}%)</b>{/if}
          </span>
          <span class="meta">Vol {compact(shown.volume)} · {when(shown)}</span>
        {/if}
      </div>
      <div class="canvas" bind:this={host} aria-label="Price chart for {name}" role="img"></div>
      {#if loading}<div class="state" role="status">Loading {tfLabel} candles…</div>{/if}
      {#if problem}<div class="state">{problem}</div>{/if}
      {#if tool === "simpleAnnotation"}
        <div class="hint"><label>Note text <input bind:value={labelText} placeholder="Type, then click the chart" /></label></div>
      {:else if tool === "ohlcMark"}
        <div class="hint">Click a candle to mark its open, high, low and close.</div>
      {:else if tool}
        <div class="hint">Click on the chart to place it. Esc cancels.</div>
      {/if}
    </div>
  </div>

  <div class="foot">
    <div class="group" role="group" aria-label="Date range">
      {#each RANGES as r}
        <button class:on={rangeKey === r.key} aria-pressed={rangeKey === r.key} onclick={() => setTimeframe(r.tf, r.bars || 100000, r.key)}>{r.label}</button>
      {/each}
    </div>
    {#if note}<p class="note">{note}</p>{/if}
    <div class="spacer"></div>
    <div class="group" role="group" aria-label="Price scale">
      {#each SCALES as s}
        <button class:on={scale === s.name} aria-pressed={scale === s.name} onclick={() => setScale(s.name)}>{s.label}</button>
      {/each}
    </div>
  </div>
</div>

<style>
  .pro { display: grid; gap: 0; background: var(--bg); }
  .pro.full { height: 100vh; grid-template-rows: auto minmax(0, 1fr) auto; padding: 0 12px; }
  .bar, .foot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 8px 0; }
  .bar { border-bottom: var(--rule); }
  .foot { border-top: var(--rule); }
  .spacer { flex: 1; }
  .group { display: flex; flex-wrap: wrap; }
  button {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    min-width: 34px; height: 32px; padding: 0 8px; border: 0; border-radius: var(--radius-s);
    background: none; color: var(--ink-2); font: 600 13px var(--font); font-stretch: 88%; cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  button:hover:not(:disabled) { background: var(--panel-2); color: var(--ink); }
  button.on, button.on:hover { background: var(--ink); color: var(--on-ink); }
  button:disabled { opacity: 0.35; cursor: default; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  .wide { padding: 0 10px; }
  .count { min-width: 18px; padding: 0 4px; border-radius: 9px; background: var(--series); color: #fff; font-size: 11px; line-height: 18px; }
  svg { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

  .menu-wrap { position: relative; }
  .menu { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; display: grid; min-width: 170px; padding: 4px; background: var(--bg); box-shadow: var(--float); }
  .menu button { justify-content: flex-start; width: 100%; }
  .menu.tall { min-width: 300px; max-height: 360px; overflow-y: auto; scrollbar-width: thin; }
  .choice { display: flex; gap: 10px; align-items: flex-start; padding: 7px 8px; cursor: pointer; }
  .choice:hover { background: var(--panel-2); }
  .choice input { margin-top: 3px; accent-color: var(--ink); }
  .choice b { display: block; font-size: 13px; font-weight: 600; }
  .choice small { display: block; color: var(--ink-3); font-size: 12px; line-height: 1.35; }

  .stage { display: grid; grid-template-columns: 44px minmax(0, 1fr); min-height: 0; }
  .rail { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 6px 4px 6px 0; border-right: var(--rule); overflow-y: auto; scrollbar-width: none; }
  .rail .ico { width: 36px; min-width: 36px; padding: 0; flex-shrink: 0; }
  .rail .mark { font-size: 9.5px; font-weight: 800; letter-spacing: -0.01em; }
  .rule { flex-shrink: 0; width: 22px; height: 1px; margin: 5px 0; background: var(--line-2); }

  .plot { position: relative; min-width: 0; min-height: 0; }
  .canvas { height: 560px; width: 100%; }
  .full .canvas { height: 100%; }
  .legend { position: absolute; z-index: 3; top: 6px; left: 10px; right: 76px; display: flex; flex-wrap: wrap; gap: 0 14px; align-items: baseline; pointer-events: none; font-size: 13px; font-variant-numeric: tabular-nums; line-height: 1.5; }
  .who { color: var(--ink); }
  .who b { font-weight: 800; }
  .ohlc i { margin-left: 8px; color: var(--ink-3); font-style: normal; font-weight: 500; }
  .ohlc i:first-child { margin-left: 0; }
  .ohlc b { margin-left: 8px; font-weight: 700; }
  .meta { color: var(--ink-3); font-size: 12px; }
  .state { position: absolute; z-index: 4; inset: 40% 0 auto; text-align: center; color: var(--ink-2); font: 15px var(--serif); pointer-events: none; }
  .hint { position: absolute; z-index: 4; left: 10px; bottom: 34px; padding: 5px 10px; background: var(--ink); color: var(--on-ink); font-size: 12.5px; }
  .hint input { margin-left: 6px; padding: 2px 6px; border: 0; background: var(--bg); color: var(--ink); font: 13px var(--font); }
  .note { margin: 0; color: var(--ink-2); font-size: 12.5px; }

  @media (max-width: 760px) {
    .canvas { height: 420px; }
    .stage { grid-template-columns: minmax(0, 1fr); }
    .rail { flex-direction: row; order: 2; padding: 6px 0; border-right: 0; border-top: var(--rule); overflow-x: auto; }
    .rule { width: 1px; height: 22px; margin: 0 5px; }
    .legend { right: 60px; font-size: 12px; }
    .menu.tall { min-width: min(300px, 80vw); }
    .bar .spacer, .foot .spacer { display: none; }
    button { min-width: 38px; height: 36px; }
  }
</style>

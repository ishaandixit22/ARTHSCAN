<script lang="ts">
  import { onMount } from "svelte";
  import type { IChartApi, ISeriesApi } from "lightweight-charts";
  import { theme } from "$lib/theme.svelte";

  // Daily candles carry a `date`; intraday ones a `time` in seconds (IST written as UTC, so the axis reads IST).
  type Candle = { date?: string; time?: number; open: number; high: number; low: number; close: number; volume: number };
  let { candles, mode = "line", base = null }: { candles: Candle[]; mode?: "line" | "candles"; base?: number | null } = $props();

  const at = (c: Candle) => (c.time ?? c.date) as any;

  let el: HTMLDivElement;
  let chart: IChartApi | undefined;
  let lib: typeof import("lightweight-charts") | undefined;
  let series: ISeriesApi<any>[] = [];

  function css(name: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  const s0 = () => series[0];

  function draw() {
    if (!chart || !lib) return;
    for (const s of series) chart.removeSeries(s);
    series = [];
    const up = css("--up");
    const down = css("--down");
    const priceFormat = { type: "custom" as const, minMove: 0.05, formatter: (p: number) => `₹${p.toFixed(2)}` };
    // Stretch the price scale so the previous-close line is always in view.
    const autoscaleInfoProvider = (orig: () => any) => {
      const r = orig();
      if (base == null || !r?.priceRange) return r;
      return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, base), maxValue: Math.max(r.priceRange.maxValue, base) } };
    };
    // A one-day chart is judged against yesterday's close, the way the day's change is.
    const first = base ?? candles[0]?.close ?? 0;
    const last = candles[candles.length - 1]?.close ?? 0;

    if (mode === "candles") {
      const s = chart.addCandlestickSeries({ priceFormat, autoscaleInfoProvider, upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down });
      s.setData(candles.map((c) => ({ time: at(c), open: c.open, high: c.high, low: c.low, close: c.close })));
      series.push(s);
    } else {
      const color = last >= first ? up : down;
      // A flat, faint fill under the line: depth without a gradient.
      const s = chart.addAreaSeries({ priceFormat, autoscaleInfoProvider, lineColor: color, topColor: `${color}14`, bottomColor: `${color}14`, lineWidth: 2 });
      s.setData(candles.map((c) => ({ time: at(c), value: c.close })));
      series.push(s);
    }
    const vol = chart.addHistogramSeries({ priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false, priceFormat: { type: "volume" }, color: css("--line-2") });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    if (base != null) s0()?.createPriceLine({ price: base, color: css("--ink-3"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "prev close" });
    chart.timeScale().applyOptions({ timeVisible: candles[0]?.time != null, secondsVisible: false });
    vol.setData(candles.map((c) => ({ time: at(c), value: c.volume ?? 0 })));
    series.push(vol);
    chart.timeScale().fitContent();
  }

  onMount(() => {
    (async () => {
      lib = await import("lightweight-charts");
      chart = lib.createChart(el, {
        autoSize: true,
        layout: { background: { color: "transparent" }, textColor: css("--ink-3"), fontFamily: css("--font"), fontSize: 11 },
        grid: { vertLines: { visible: false }, horzLines: { color: css("--line") } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.22 } },
        timeScale: { borderVisible: false },
        crosshair: { mode: 1 },
        // Leave the mouse wheel to the page; drag and pinch still pan/zoom.
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
      });
      draw();
    })();
    // The chart can be created before its box has a width (the page fades in), and
    // autoSize keeps the bar spacing from that first fit; fit again when the size settles.
    let lastWidth = 0;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (!chart || Math.abs(w - lastWidth) < 1) return;
      lastWidth = w;
      requestAnimationFrame(() => chart?.timeScale().fitContent());
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart?.remove();
    };
  });

  $effect(() => {
    // Re-run when the data or the mode changes.
    void candles;
    void mode;
    draw();
  });

  // The chart's colours come from CSS; repaint them when the theme switches.
  $effect(() => {
    void theme.current;
    if (!chart) return;
    chart.applyOptions({ layout: { textColor: css("--ink-3") }, grid: { horzLines: { color: css("--line") } } });
    draw();
  });
</script>

<div class="chart" bind:this={el}></div>

<style>
  .chart { height: 340px; width: 100%; }
</style>

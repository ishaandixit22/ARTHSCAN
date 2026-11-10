<script lang="ts">
  import { onMount } from "svelte";
  import type { IChartApi, ISeriesApi } from "lightweight-charts";
  import { theme } from "$lib/theme.svelte";

  // An index level over time: minute points carry `time` (IST written as UTC seconds), daily ones a `date`.
  type Point = { time?: number; date?: string; value: number };
  let { points, base = null, showBase = false }: { points: Point[]; base?: number | null; showBase?: boolean } = $props();

  let el: HTMLDivElement;
  let chart: IChartApi | undefined;
  let lib: typeof import("lightweight-charts") | undefined;
  let series: ISeriesApi<"Area"> | undefined;

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

  function draw() {
    if (!chart || !lib) return;
    if (series) chart.removeSeries(series);
    const first = base ?? points[0]?.value ?? 0;
    const last = points[points.length - 1]?.value ?? 0;
    const color = css(last >= first ? "--up" : "--down");
    // The previous close stays in view on a one-day chart, so the line reads against it.
    const autoscaleInfoProvider = (orig: () => any) => {
      const r = orig();
      if (!showBase || base == null || !r?.priceRange) return r;
      return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, base), maxValue: Math.max(r.priceRange.maxValue, base) } };
    };
    series = chart.addAreaSeries({
      lineColor: color, topColor: `${color}33`, bottomColor: `${color}05`, lineWidth: 2,
      priceFormat: { type: "custom", minMove: 0.05, formatter: (p: number) => fmt.format(p) },
      autoscaleInfoProvider, priceLineVisible: false,
    });
    series.setData(points.map((p) => ({ time: (p.time ?? p.date) as any, value: p.value })));
    if (showBase && base != null) series.createPriceLine({ price: base, color: css("--ink-3"), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Prev. close" });
    chart.timeScale().applyOptions({ timeVisible: points[0]?.time != null, secondsVisible: false });
    chart.timeScale().fitContent();
  }

  onMount(() => {
    (async () => {
      lib = await import("lightweight-charts");
      chart = lib.createChart(el, {
        autoSize: true,
        layout: { background: { color: "transparent" }, textColor: css("--ink-3"), fontFamily: css("--font"), fontSize: 11 },
        grid: { vertLines: { visible: false }, horzLines: { color: css("--line") } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.06 } },
        timeScale: { borderVisible: false },
        crosshair: { mode: 1 },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
      });
      draw();
    })();
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
    void points;
    void base;
    draw();
  });

  $effect(() => {
    void theme.current;
    if (!chart) return;
    chart.applyOptions({ layout: { textColor: css("--ink-3") }, grid: { horzLines: { color: css("--line") } } });
    draw();
  });
</script>

<div class="chart" bind:this={el}></div>

<style>
  .chart { height: 360px; width: 100%; }
  @media (max-width: 640px) { .chart { height: 260px; } }
</style>

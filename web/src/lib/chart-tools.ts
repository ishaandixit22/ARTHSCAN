// What the stock page's chart adds to KLineCharts: drawings it doesn't have (marking a candle's
// OHLC, a ruler, a rectangle, corporate-action badges) and two indicators (session VWAP, Supertrend).
// Registered once per page load; they live in the chart library's global registry.

import type { KLineData } from "klinecharts";

export type OhlcMark = { o: number; h: number; l: number; c: number; label?: string };
export type EventMark = { letter: string; color: string; text: string };

let registered = false;

export function registerChartTools(kl: typeof import("klinecharts")) {
  if (registered) return;
  registered = true;

  // Four lines at one candle's open, high, low and close, running to the right edge.
  kl.registerOverlay<OhlcMark>({
    name: "ohlcMark",
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
      if (!coordinates.length || !yAxis) return [];
      const bar = chart.getDataList()[overlay.points[0]?.dataIndex ?? -1] as KLineData | undefined;
      const m: OhlcMark | undefined = overlay.extendData ?? (bar ? { o: bar.open, h: bar.high, l: bar.low, c: bar.close } : undefined);
      if (!m) return [];
      const { up, down, ink } = (overlay.styles as any)?.marks ?? { up: "#0d6537", down: "#ad2216", ink: "#111111" };
      const x = coordinates[0].x;
      const rows: [string, number, string][] = [["O", m.o, ink], ["H", m.h, up], ["L", m.l, down], ["C", m.c, ink]];
      return rows.flatMap(([name, value, color]) => {
        const y = yAxis.convertToPixel(value);
        return [
          { type: "line", attrs: { coordinates: [{ x, y }, { x: bounding.width, y }] }, styles: { color, size: 1, style: "dashed", dashedValue: [4, 3] } },
          { type: "text", ignoreEvent: true, attrs: { x: bounding.width - 6, y: y - 2, text: `${m.label ? `${m.label} ` : ""}${name} ${value.toFixed(2)}`, align: "right", baseline: "bottom" }, styles: { color, size: 11, weight: 600, backgroundColor: "transparent", borderSize: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 } },
        ];
      });
    },
  });

  // A box with how far the price moved between its corners, and over how many bars.
  kl.registerOverlay({
    name: "measure",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ overlay, coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const from = overlay.points[0]?.value ?? 0, to = overlay.points[1]?.value ?? 0;
      const diff = to - from;
      const bars = Math.abs((overlay.points[1]?.dataIndex ?? 0) - (overlay.points[0]?.dataIndex ?? 0));
      const { up, down } = (overlay.styles as any)?.marks ?? { up: "#0d6537", down: "#ad2216" };
      const color = diff >= 0 ? up : down;
      const pct = from ? (diff / from) * 100 : 0;
      return [
        { type: "rect", attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }, styles: { style: "fill", color: `${color}22`, borderSize: 0 } },
        { type: "line", ignoreEvent: true, attrs: { coordinates: [{ x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }] }, styles: { color, size: 1 } },
        { type: "text", ignoreEvent: true, attrs: { x: (a.x + b.x) / 2, y: b.y + (diff >= 0 ? -6 : 6), text: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%) · ${bars} bars`, align: "center", baseline: diff >= 0 ? "bottom" : "top" }, styles: { color: "#ffffff", backgroundColor: color, size: 11, weight: 600, borderSize: 0, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3 } },
      ];
    },
  });

  kl.registerOverlay({
    name: "rectangle",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ overlay, coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const ink = (overlay.styles as any)?.marks?.series ?? "#1f4a7a";
      return [{ type: "rect", attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }, styles: { style: "stroke_fill", color: `${ink}1c`, borderColor: ink, borderSize: 1 } }];
    },
  });

  // A lettered badge above a bar: dividend, bonus, rights or split.
  kl.registerOverlay<EventMark>({
    name: "eventMark",
    totalStep: 2,
    lock: true,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ overlay, coordinates }) => {
      if (!coordinates.length || !overlay.extendData) return [];
      const { x, y } = coordinates[0];
      const { letter, color } = overlay.extendData;
      const top = Math.max(12, y - 16);
      return [
        { type: "circle", attrs: { x, y: top, r: 9 }, styles: { style: "fill", color, borderSize: 0 } },
        { type: "text", ignoreEvent: true, attrs: { x, y: top, text: letter, align: "center", baseline: "middle" }, styles: { color: "#ffffff", size: 10, weight: 700, backgroundColor: "transparent", borderSize: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 } },
      ];
    },
  });

  // Volume-weighted average price, starting again each session.
  kl.registerIndicator<{ vwap?: number }>({
    name: "VWAP",
    shortName: "VWAP",
    series: "price",
    precision: 2,
    shouldOhlc: false,
    figures: [{ key: "vwap", title: "VWAP: ", type: "line" }],
    calc: (list) => {
      let day = "", pv = 0, vol = 0;
      return list.map((k) => {
        const d = new Date(k.timestamp + 19800_000).toISOString().slice(0, 10);
        if (d !== day) { day = d; pv = 0; vol = 0; }
        const v = k.volume ?? 0;
        pv += ((k.high + k.low + k.close) / 3) * v;
        vol += v;
        return vol ? { vwap: pv / vol } : {};
      });
    },
  });

  kl.registerIndicator<{ up?: number; down?: number }, number>({
    name: "SUPERTREND",
    shortName: "Supertrend",
    series: "price",
    precision: 2,
    calcParams: [10, 3],
    shouldOhlc: false,
    figures: [
      { key: "up", title: "Up: ", type: "line", styles: () => ({ color: getComputedStyle(document.documentElement).getPropertyValue("--up").trim() }) },
      { key: "down", title: "Down: ", type: "line", styles: () => ({ color: getComputedStyle(document.documentElement).getPropertyValue("--down").trim() }) },
    ],
    calc: (list, ind) => {
      const [period, mult] = ind.calcParams as number[];
      let atr = 0, upper = 0, lower = 0, rising = true;
      return list.map((k, i) => {
        const prev = list[i - 1];
        const tr = prev ? Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close)) : k.high - k.low;
        atr = i < period ? (atr * i + tr) / (i + 1) : (atr * (period - 1) + tr) / period;
        const mid = (k.high + k.low) / 2;
        const u = mid + mult * atr, l = mid - mult * atr;
        upper = !prev || u < upper || prev.close > upper ? u : upper;
        lower = !prev || l > lower || prev.close < lower ? l : lower;
        if (rising && k.close < lower) rising = false;
        else if (!rising && k.close > upper) rising = true;
        if (i < period) return {};
        return rising ? { up: lower } : { down: upper };
      });
    },
  });
}

export type IndicatorChoice = { name: string; label: string; main: boolean; about: string };

/** The menu, in the order a beginner is most likely to want. `main` ones draw over the candles. */
export const INDICATORS: IndicatorChoice[] = [
  { name: "MA", label: "Moving averages", main: true, about: "The average close over 5, 10, 30 and 60 bars" },
  { name: "EMA", label: "Exponential MA", main: true, about: "An average that leans on recent bars" },
  { name: "BOLL", label: "Bollinger bands", main: true, about: "A band around the average that widens as prices swing more" },
  { name: "VWAP", label: "VWAP", main: true, about: "Average price paid today, weighted by volume" },
  { name: "SUPERTREND", label: "Supertrend", main: true, about: "A trailing line that flips when the trend turns" },
  { name: "SAR", label: "Parabolic SAR", main: true, about: "Dots that trail the trend and flip when it turns" },
  { name: "BBI", label: "Bull and bear index", main: true, about: "A blend of four moving averages" },
  { name: "VOL", label: "Volume", main: false, about: "Shares traded in each bar" },
  { name: "RSI", label: "RSI", main: false, about: "How fast the price has been rising or falling" },
  { name: "MACD", label: "MACD", main: false, about: "The gap between a fast and a slow average" },
  { name: "KDJ", label: "Stochastic (KDJ)", main: false, about: "Where the close sits in its recent range" },
  { name: "OBV", label: "On-balance volume", main: false, about: "Running total of volume on up and down bars" },
  { name: "CCI", label: "CCI", main: false, about: "How far price is from its average" },
  { name: "DMI", label: "DMI / ADX", main: false, about: "How strong a trend is, and which way" },
  { name: "WR", label: "Williams %R", main: false, about: "Momentum against the recent high" },
  { name: "ROC", label: "Rate of change", main: false, about: "Percent move over a set number of bars" },
  { name: "MTM", label: "Momentum", main: false, about: "Price now minus price some bars ago" },
  { name: "AO", label: "Awesome oscillator", main: false, about: "Short against long momentum" },
  { name: "TRIX", label: "TRIX", main: false, about: "A triple-smoothed rate of change" },
];

export type Tool = { name: string; label: string; icon: string };

/** Icon paths on a 24-unit grid, in the site's one outline weight. */
export const TOOLS: Tool[] = [
  { name: "segment", label: "Trend line", icon: "M5 19 19 5M5 19h.01M19 5h.01" },
  { name: "rayLine", label: "Ray", icon: "M5 19 21 3M5 19h.01" },
  { name: "straightLine", label: "Extended line", icon: "M2 22 22 2" },
  { name: "horizontalStraightLine", label: "Horizontal line", icon: "M2 12h20" },
  { name: "horizontalRayLine", label: "Horizontal ray", icon: "M6 12h16M6 12h.01" },
  { name: "verticalStraightLine", label: "Vertical line", icon: "M12 2v20" },
  { name: "parallelStraightLine", label: "Parallel channel", icon: "M3 15 15 3M9 21 21 9" },
  { name: "priceChannelLine", label: "Price channel", icon: "M3 17 17 3M7 21 21 7M3 10 10 3" },
  { name: "fibonacciLine", label: "Fibonacci retracement", icon: "M3 5h18M3 10h18M3 14h18M3 19h18" },
  { name: "rectangle", label: "Rectangle", icon: "M4 6h16v12H4z" },
  { name: "priceLine", label: "Price label", icon: "M3 12h10l4-4h4v8h-4l-4-4" },
  { name: "measure", label: "Measure move", icon: "M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2" },
];

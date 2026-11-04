<script lang="ts">
  // One number: a typed box with Indian digit grouping, and a slider beside it. Typing is
  // free-form while the box has focus; the figure is clamped to its limits as you go and the
  // box tidies itself up when you leave.
  import type { Field } from "$lib/calculators/engine";

  let { input, value = $bindable() }: { input: Field; value: number } = $props();

  const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
  let focused = $state(false);
  let raw = $state("");
  const id = $derived(`calc-${input.key}`);

  const unit = $derived(
    input.kind === "percent" ? "%" : input.kind === "years" ? (value === 1 ? "year" : "years") : input.kind === "months" ? (value === 1 ? "month" : "months") : input.kind === "age" ? "years" : "",
  );
  const clamp = (v: number) => Math.min(input.max, Math.max(input.min, v));
  const snap = (v: number) => {
    const s = Math.round(v / input.step) * input.step;
    return clamp(Number(s.toFixed(4)));
  };

  // A log slider runs from the smallest amount to the largest by ratio, and works in position units.
  const LOG_STEPS = 1000;
  const toPos = (v: number) => (LOG_STEPS * Math.log(Math.max(v, input.min) / input.min)) / Math.log(input.max / input.min);
  // Rounded to two significant figures while dragging, so the slider lands on tidy amounts.
  const fromPos = (p: number) => {
    const v = input.min * Math.pow(input.max / input.min, p / LOG_STEPS);
    const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
    return snap(Math.round(v / mag) * mag);
  };
  const pos = $derived(input.log ? toPos(value) : value);
  const fill = $derived(input.log ? (pos / LOG_STEPS) * 100 : ((value - input.min) / (input.max - input.min)) * 100);

  function typed(e: Event) {
    raw = (e.currentTarget as HTMLInputElement).value;
    const parsed = Number(raw.replace(/[^0-9.]/g, ""));
    if (raw.trim() !== "" && Number.isFinite(parsed)) value = clamp(parsed);
  }
</script>

<div class="field">
  <div class="top">
    <label for={id}>{input.label}</label>
    <div class="box">
      {#if input.kind === "money"}<span class="unit">₹</span>{/if}
      <input
        {id}
        type="text"
        inputmode="decimal"
        autocomplete="off"
        value={focused ? raw : fmt.format(value)}
        onfocus={(e) => { raw = String(value); focused = true; e.currentTarget.select(); }}
        onblur={() => (focused = false)}
        oninput={typed}
        aria-describedby={input.hint ? `${id}-hint` : undefined}
      />
      {#if unit}<span class="unit">{unit}</span>{/if}
    </div>
  </div>
  <input
    class="slider"
    type="range"
    style="--fill: {fill}%"
    aria-label={input.label}
    aria-valuetext="{fmt.format(value)} {unit}"
    min={input.log ? 0 : input.min}
    max={input.log ? LOG_STEPS : input.max}
    step={input.log ? 1 : input.step}
    value={pos}
    oninput={(e) => { const p = Number(e.currentTarget.value); value = input.log ? fromPos(p) : snap(p); }}
  />
  {#if input.hint}<p class="hint" id="{id}-hint">{input.hint}</p>{/if}
</div>

<style>
  .field { display: grid; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--line); min-width: 0; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  label { font-size: 14.5px; font-weight: 600; font-stretch: 88%; min-width: 0; }
  .box { display: flex; align-items: center; gap: 5px; height: 36px; padding: 0 9px; flex: none; border: 1.5px solid var(--line-2); background: var(--paper-hi); border-radius: var(--radius-s); transition: border-color 0.15s var(--ease); }
  .box:focus-within { border-color: var(--ink); }
  .box input { width: 104px; height: 100%; padding: 0; border: 0; background: none; text-align: right; font: 750 15px var(--font); font-stretch: 85%; font-variant-numeric: tabular-nums; }
  .unit { font-size: 13px; color: var(--ink-3); font-stretch: 85%; }
  .hint { font: 13px/1.4 var(--serif); color: var(--ink-3); }

  /* A ruled track with a square inked handle; the track fills to the handle. */
  .slider { -webkit-appearance: none; appearance: none; display: block; width: 100%; height: 24px; padding: 0; margin: 0; border: 0; background: none; cursor: pointer; }
  .slider::-webkit-slider-runnable-track { height: 3px; background: linear-gradient(to right, var(--ink) var(--fill), var(--line-2) var(--fill)); }
  .slider::-moz-range-track { height: 3px; background: var(--line-2); }
  .slider::-moz-range-progress { height: 3px; background: var(--ink); }
  .slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 20px; margin-top: -8.5px; background: var(--ink); border: 2px solid var(--bg); border-radius: 0; }
  .slider::-moz-range-thumb { width: 12px; height: 18px; background: var(--ink); border: 2px solid var(--bg); border-radius: 0; }
  .slider:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
</style>

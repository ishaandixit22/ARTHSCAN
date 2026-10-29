import { api } from "$lib/server/api";

const SIGNALS = [
  ["volume_spike", "Volume spikes"], ["breakout_high", "52W breakouts"], ["breakout_low", "52W breakdowns"],
  ["golden_cross", "Golden cross"], ["death_cross", "Death cross"], ["rsi_oversold", "RSI oversold"],
  ["rsi_overbought", "RSI overbought"], ["macd_bullish", "MACD bullish"], ["macd_bearish", "MACD bearish"],
] as const;

export async function load({ url }) {
  const signal = SIGNALS.some(([k]) => k === url.searchParams.get("signal")) ? url.searchParams.get("signal")! : "volume_spike";
  return { signal, signals: SIGNALS, data: await api(`/v1/market/signals?signal=${signal}&limit=100`) };
}

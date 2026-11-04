// Turns a stock's figures into the coloured reading at the top of its page: strengths, weaknesses,
// opportunities and threats, a pass mark, a trend and one plain sentence. Every line is a fixed rule
// over figures shown on the page, so it describes the data and never recommends anything.

export type Input = {
  m: any;              // our stored metrics
  quote: any | null;   // Dhan's quote for the session
  info: any | null;    // Dhan's company snapshot
  stats: any | null;   // long-history figures
  digest: any | null;  // provider's company digest
  quarters: any[];     // newest first
  holding: any[];      // newest first
  bseOnly: boolean;
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const firstOf = (...vs: unknown[]): number | null => {
  for (const v of vs) if (finite(v)) return v;
  return null;
};
const pctOf = (now: number, then: number) => ((now - then) / Math.abs(then)) * 100;
const money = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** The figures the overview shows, each from the best source that has it. */
export function figures({ m, quote, info, stats, digest, quarters }: Input) {
  const o = info?.overview ?? {}, r = info?.ratios ?? {}, d = digest?.figures ?? {};
  const price = firstOf(quote?.ltp, m?.close);
  const eps = firstOf(m?.eps_ttm, d.eps_ttm, o.eps);
  // Worked out from price and EPS: Dhan's own P/E has been wrong for some small companies.
  const pe = firstOf(m?.pe, eps != null && eps > 0 && price != null ? price / eps : null, eps == null ? d.pe_ttm : null);
  const book = firstOf(o.book_value, d.book_value);
  // Below zero net worth, price to book and debt to equity stop meaning anything: Dhan gives a debt to
  // equity of 0 for such a company, which would read as "little debt".
  const negativeWorth = book != null && book <= 0;
  const pb = negativeWorth ? null : book != null && price != null ? price / book : firstOf(r.pb, d.pb);
  const rawSector = finite(r.pe) && finite(r.pe_to_sector_pe) && r.pe_to_sector_pe > 0 ? r.pe / r.pe_to_sector_pe : null;
  const sectorPe = rawSector != null && rawSector >= 1 && rawSector <= 300 ? rawSector : null;
  const ttm = (rows: any[], key: string) => (rows.length === 4 && rows.every((q) => finite(q[key])) ? rows.reduce((a, q) => a + q[key], 0) : null);
  const epsNow = ttm(quarters.slice(0, 4), "eps"), epsThen = ttm(quarters.slice(4, 8), "eps");
  const epsYoy = firstOf(epsNow != null && epsThen ? pctOf(epsNow, epsThen) : null, d.eps_ttm_yoy);
  return {
    price, eps, pe, book, pb, sectorPe, epsYoy,
    marketCapCr: firstOf(o.market_cap_cr, d.market_cap_cr),
    dividendYield: firstOf(o.dividend_yield),
    beta: firstOf(stats?.beta, d.beta),
    roe: firstOf(r.roe), roce: firstOf(r.roce), debtToEquity: negativeWorth ? null : firstOf(r.debt_to_equity), negativeWorth,
    industryPb: firstOf(r.industry_pb), industryDe: firstOf(r.industry_debt_to_equity),
    high52: firstOf(m?.high_52w, o.high_52w), low52: firstOf(m?.low_52w, o.low_52w),
    ath: stats?.extremes ?? null,
  };
}

export type Finding = { title: string; detail: string };
export type Check = { label: string; pass: boolean; value: string };

export function readStock(input: Input) {
  const { m, quarters, holding, stats, digest, info, bseOnly } = input;
  const f = figures(input);
  const s: Finding[] = [], w: Finding[] = [], o: Finding[] = [], t: Finding[] = [];
  const checks: Check[] = [];
  const check = (label: string, pass: boolean, value: string) => checks.push({ label, pass, value });

  // Results: the latest quarter against the same quarter a year earlier.
  const [q0, q1, , , q4] = quarters;
  let revenueYoy: number | null = null, profitYoy: number | null = null;
  if (q0 && q4) {
    if (finite(q0.revenue) && finite(q4.revenue) && q4.revenue) revenueYoy = pctOf(q0.revenue, q4.revenue);
    if (finite(q0.net_profit) && finite(q4.net_profit) && q4.net_profit) profitYoy = pctOf(q0.net_profit, q4.net_profit);
  }
  if (revenueYoy != null) {
    check("Revenue grew over the year", revenueYoy > 0, `${revenueYoy.toFixed(1)}%`);
    if (revenueYoy >= 15) s.push({ title: "Revenue growing fast", detail: `Latest quarter's revenue was up ${revenueYoy.toFixed(1)}% on the same quarter last year.` });
    else if (revenueYoy < 0) w.push({ title: "Revenue down on last year", detail: `Latest quarter's revenue was ${Math.abs(revenueYoy).toFixed(1)}% below the same quarter last year.` });
  }
  if (profitYoy != null) {
    check("Net profit grew over the year", profitYoy > 0, `${profitYoy.toFixed(1)}%`);
    if (profitYoy >= 20) s.push({ title: "Profit growing fast", detail: `Latest quarter's net profit was up ${profitYoy.toFixed(1)}% on the same quarter last year.` });
    else if (profitYoy < 0) w.push({ title: "Profit down on last year", detail: `Latest quarter's net profit was ${Math.abs(profitYoy).toFixed(1)}% below the same quarter last year.` });
  }
  if (revenueYoy != null && profitYoy != null && revenueYoy < 0 && profitYoy < 0) {
    t.push({ title: "Revenue and profit both falling", detail: "Both were lower than a year earlier in the latest quarter." });
  }
  if (q0 && q1 && finite(q0.opm_pct) && finite(q1.opm_pct) && q0.opm_pct < q1.opm_pct - 2) {
    t.push({ title: "Operating margin narrowing", detail: `Down from ${q1.opm_pct.toFixed(1)}% to ${q0.opm_pct.toFixed(1)}% in one quarter.` });
  }
  if (f.epsYoy != null) {
    check("TTM EPS grew", f.epsYoy > 0, `${f.epsYoy.toFixed(1)}%`);
    if (f.epsYoy >= 15) s.push({ title: "High TTM EPS growth", detail: `Earnings per share over the last twelve months rose ${f.epsYoy.toFixed(1)}% on the twelve months before.` });
    else if (f.epsYoy <= -10) w.push({ title: "TTM EPS falling", detail: `Earnings per share over the last twelve months fell ${Math.abs(f.epsYoy).toFixed(1)}%.` });
  }
  if (f.eps != null && f.eps < 0) t.push({ title: "Making losses", detail: `Earnings per share over the last twelve months were ${money(f.eps)}.` });

  // Returns on capital and debt.
  if (f.negativeWorth) {
    check("Positive net worth", false, money(f.book!));
    w.push({ title: "Negative net worth", detail: `Book value per share is ${money(f.book!)}: what the company owes is more than what it owns.` });
  }
  if (f.roe != null) {
    check("Return on equity above 12%", f.roe > 12, `${f.roe.toFixed(1)}%`);
    if (f.roe >= 18) s.push({ title: "High return on equity", detail: `Earns ${f.roe.toFixed(1)}% a year on shareholders' money.` });
    else if (f.roe < 8) w.push({ title: "Low return on equity", detail: `Earns ${f.roe.toFixed(1)}% a year on shareholders' money.` });
  }
  if (f.roce != null) {
    check("Return on capital above 12%", f.roce > 12, `${f.roce.toFixed(1)}%`);
    if (f.roce < 8) w.push({ title: "Low return on capital", detail: `Earns ${f.roce.toFixed(1)}% a year on all the capital in the business.` });
  }
  if (f.debtToEquity != null) {
    check("Debt below equity", f.debtToEquity < 1, `${f.debtToEquity.toFixed(2)}x`);
    if (f.debtToEquity < 0.3) s.push({ title: "Little debt", detail: `Borrowings are ${f.debtToEquity.toFixed(2)} times shareholders' equity.` });
    else if (f.debtToEquity > 1.5) w.push({ title: "Heavy debt", detail: `Borrowings are ${f.debtToEquity.toFixed(2)} times shareholders' equity.` });
  }

  // Who holds it.
  const [h0, h1] = holding;
  const shift = (key: string, fallback: unknown) => (h0 && h1 && finite(h0[key]) && finite(h1[key]) ? h0[key] - h1[key] : finite(fallback) ? fallback : null);
  const fii = shift("fii", info?.shareholding?.fii_change);
  const dii = shift("dii", info?.shareholding?.dii_change);
  const promoter = shift("promoter", null);
  if (fii != null && Math.abs(fii) >= 0.05) {
    check("FIIs added last quarter", fii > 0, `${fii > 0 ? "+" : ""}${fii.toFixed(2)} pts`);
    if (fii > 0) s.push({ title: "FIIs increased their holding", detail: `Up ${fii.toFixed(2)} points last quarter.` });
    else w.push({ title: "FIIs decreased their holding", detail: `Down ${Math.abs(fii).toFixed(2)} points last quarter.` });
  }
  if (dii != null && Math.abs(dii) >= 0.05) {
    if (dii > 0) s.push({ title: "Domestic institutions added", detail: `Up ${dii.toFixed(2)} points last quarter.` });
    else w.push({ title: "Domestic institutions reduced", detail: `Down ${Math.abs(dii).toFixed(2)} points last quarter.` });
  }
  if (promoter != null && Math.abs(promoter) >= 0.05) {
    check("Promoters didn't sell last quarter", promoter > 0, `${promoter > 0 ? "+" : ""}${promoter.toFixed(2)} pts`);
    if (promoter > 0) s.push({ title: "Promoters increased their holding", detail: `Up ${promoter.toFixed(2)} points last quarter.` });
    else w.push({ title: "Promoters reduced their holding", detail: `Down ${Math.abs(promoter).toFixed(2)} points last quarter.` });
  }
  if (h0 && finite(h0.pledged_pct) && h0.pledged_pct > 5) {
    t.push({ title: "Promoter shares pledged", detail: `${h0.pledged_pct.toFixed(1)}% of promoter shares are pledged against loans. A falling price can force them to be sold.` });
  }

  // Valuation.
  if (f.pe != null && f.sectorPe != null) {
    check("P/E below its sector", f.pe < f.sectorPe, `${f.pe.toFixed(1)} vs ${f.sectorPe.toFixed(1)}`);
    if (f.pe < f.sectorPe * 0.8) o.push({ title: "P/E below its sector", detail: `Priced at ${f.pe.toFixed(1)} times earnings; its sector averages ${f.sectorPe.toFixed(1)}.` });
    else if (f.pe > f.sectorPe * 2) t.push({ title: "P/E far above its sector", detail: `Priced at ${f.pe.toFixed(1)} times earnings; its sector averages ${f.sectorPe.toFixed(1)}.` });
  }
  if (f.pb != null && f.industryPb != null && f.pb < f.industryPb * 0.7) {
    o.push({ title: "Price to book below its industry", detail: `${f.pb.toFixed(2)} times book value; its industry averages ${f.industryPb.toFixed(2)}.` });
  }

  // Price and trend. Our own metrics first, the long-history figures where a stock has none.
  const close = firstOf(m?.close), sma200 = firstOf(m?.sma_200), sma50 = firstOf(m?.sma_50), rsi = firstOf(m?.rsi_14);
  if (close != null && sma200 != null) {
    check("Price above its 200-day average", close > sma200, money(sma200));
    if (close > sma200 * 1.05) s.push({ title: "Above its 200-day average", detail: `Closed at ${money(close)}, above the 200-day average of ${money(sma200)}.` });
    else if (close < sma200 * 0.95) w.push({ title: "Below its 200-day average", detail: `Closed at ${money(close)}, below the 200-day average of ${money(sma200)}.` });
  }
  if (close != null && sma50 != null) check("Price above its 50-day average", close > sma50, money(sma50));
  if (rsi != null) {
    if (rsi <= 30) o.push({ title: "RSI in oversold range", detail: `RSI is ${rsi.toFixed(0)}. The price has fallen fast; it doesn't say when that stops.` });
    else if (rsi >= 70) t.push({ title: "RSI in overbought range", detail: `RSI is ${rsi.toFixed(0)}. The price has risen fast.` });
  }
  if (m?.cross_signal === "golden") s.push({ title: "Recent golden cross", detail: "The 50-day average has moved above the 200-day average." });
  if (m?.cross_signal === "death") t.push({ title: "Recent death cross", detail: "The 50-day average has moved below the 200-day average." });
  if (m?.breakout === "low") t.push({ title: "At a 52-week low", detail: "Today's close is the lowest in a year." });
  if (m?.breakout === "high") s.push({ title: "At a 52-week high", detail: "Today's close is the highest in a year." });
  if (finite(m?.pct_from_high) && m.pct_from_high <= -40) w.push({ title: "Far below its 52-week high", detail: `${Math.abs(m.pct_from_high).toFixed(0)}% down from the year's high.` });
  if (finite(m?.ret_1y)) {
    check("Up over the past year", m.ret_1y > 0, `${m.ret_1y.toFixed(1)}%`);
  }
  if (finite(m?.volatility_1y) && m.volatility_1y >= 60) t.push({ title: "High price swings", detail: `Annualised volatility is ${m.volatility_1y.toFixed(0)}%.` });
  if (finite(m?.deliv_pct) && finite(m?.deliv_pct_avg_20) && m.deliv_pct >= m.deliv_pct_avg_20 * 1.3) {
    s.push({ title: "Delivery above its average", detail: `${m.deliv_pct.toFixed(0)}% of today's volume was taken for delivery, against a 20-day average of ${m.deliv_pct_avg_20.toFixed(0)}%.` });
  }
  if (bseOnly && finite(m?.turnover) && m.turnover < 100_000) t.push({ title: "Very thinly traded", detail: `About ₹${Math.round(m.turnover).toLocaleString("en-IN")} traded in the latest session. Thin trading can make it hard to buy or sell at a quoted price.` });

  // Analysts and the calendar.
  const a = digest?.analysts;
  if (a?.total >= 3) {
    const bulls = (a.latest["Strong Buy"] ?? 0) + (a.latest["Buy"] ?? 0);
    const bears = (a.latest["Strong Sell"] ?? 0) + (a.latest["Sell"] ?? 0);
    if (bulls / a.total >= 0.6) o.push({ title: "Most analysts rate it a buy", detail: `${bulls} of ${a.total} analysts tracked. This is their view, not ours.` });
    if (bears / a.total >= 0.4) t.push({ title: "Many analysts rate it a sell", detail: `${bears} of ${a.total} analysts tracked. This is their view, not ours.` });
  }
  const nowMonth = new Date().getMonth();
  const season = stats?.seasonality?.months?.[nowMonth];
  if (season?.years >= 8) {
    const share = season.positive / season.years;
    if (share >= 0.65) o.push({ title: `${season.month} has often been positive`, detail: `Up in ${season.positive} of the past ${season.years} years. Past months don't predict this one.` });
    else if (share <= 0.35) t.push({ title: `${season.month} has often been negative`, detail: `Up in only ${season.positive} of the past ${season.years} years. Past months don't predict this one.` });
  }

  // Trend: the technical vote from the long history, or the two averages if that hasn't loaded.
  const trend = (stats?.technicals?.trend as "bullish" | "bearish" | "neutral" | undefined)
    ?? (close != null && sma50 != null && sma200 != null ? (close > sma50 && sma50 > sma200 ? "bullish" : close < sma50 && sma50 < sma200 ? "bearish" : "neutral") : null);

  const passed = checks.filter((c) => c.pass).length;
  const score = checks.length >= 4 ? Math.round((passed / checks.length) * 100) : null;

  // One sentence on strength, growth and price.
  const returns = f.roe ?? f.roce ?? 15;
  const strength = f.negativeWorth ? "Weak finances" : f.debtToEquity == null && f.roe == null ? null
    : (f.debtToEquity ?? 0) < 1 && returns >= 12 ? "Sound finances" : (f.debtToEquity ?? 0) > 1.5 || returns < 8 ? "Weak finances" : "Average finances";
  const growth = revenueYoy == null && profitYoy == null ? null
    : (revenueYoy ?? 0) > 10 && (profitYoy ?? 0) > 10 ? "growing fast" : (revenueYoy ?? 0) < 0 || (profitYoy ?? 0) < 0 ? "shrinking" : "growing slowly";
  const valuation = f.pe == null || f.sectorPe == null ? null
    : f.pe < f.sectorPe * 0.8 ? "priced below its sector" : f.pe > f.sectorPe * 1.3 ? "priced above its sector" : "priced near its sector";
  const parts = [strength, growth, valuation].filter(Boolean) as string[];
  const insight = parts.length ? `${parts.join(", ")}.` : null;

  return { strengths: s, weaknesses: w, opportunities: o, threats: t, checks, passed, score, trend, insight, figures: f };
}

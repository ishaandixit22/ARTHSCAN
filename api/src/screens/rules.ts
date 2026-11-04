// Screen rules as data. Two written forms come in (plain field names joined by AND/OR, and
// timeframe-prefixed indicator expressions) and both compile to the one tree the engine runs,
// and that the site renders back as readable lines. Nothing about a stock is decided here.

/** A candle size: daily, weekly, monthly, yearly (annual statements), or minutes. */
export type Tf = "d" | "w" | "m" | "y" | number;

export type Node =
  | { k: "num"; v: number }
  | { k: "math"; op: "+" | "-" | "*" | "/"; a: Node; b: Node }
  | { k: "fn"; fn: "abs" | "least" | "greatest"; args: Node[] }
  | { k: "cmp"; op: ">" | ">=" | "<" | "<=" | "=" | "!="; a: Node; b: Node }
  | { k: "and" | "or"; xs: Node[] }
  /** A stored company figure; `off` counts back through annual statements for yearly fields. */
  | { k: "fund"; key: string; off?: number; label: string }
  /** A price field or indicator on one candle size, `off` candles back. */
  | { k: "ind"; tf: Tf; off: number; ind: string; args: (number | string)[] }
  /** Highest, lowest or how many over a window of candles, ending `off` candles back. */
  | { k: "win"; fn: "max" | "min" | "count"; n: number; tf: Tf; off: number; expr: Node }
  /** A named price calculation with its own label, such as the 52-week high. */
  | { k: "calc"; key: string; label: string };

const num = (v: number): Node => ({ k: "num", v });
const ind = (name: string, args: (number | string)[] = [], off = 0, tf: Tf = "d"): Node => ({ k: "ind", tf, off, ind: name, args });
const fund = (key: string, label: string): Node => ({ k: "fund", key, label });
const calc = (key: string, label: string): Node => ({ k: "calc", key, label });

// ── Plain-field form ───────────────────────────────────────────────

const close = ind("close");
/** Every field the plain form may use. An unknown name is an error, never a guess. */
const FIELDS: Record<string, Node> = {
  "current price": close,
  volume: ind("volume"),
  "volume 1week average": ind("sma", ["volume", 5]),
  "volume 1month average": ind("sma", ["volume", 21]),
  "volume 1year average": ind("sma", ["volume", 252]),
  rsi: ind("rsi", [14]),
  "dma 50": ind("sma", ["close", 50]),
  "dma 200": ind("sma", ["close", 200]),
  "dma 50 previous day": ind("sma", ["close", 50], 1),
  "dma 200 previous day": ind("sma", ["close", 200], 1),
  "return over 1day": calc("ret_1d", "1-day return %"),
  "return over 1week": calc("ret_1w", "1-week return %"),
  "return over 1month": calc("ret_1m", "1-month return %"),
  "high price": calc("high_52w", "52-week high"),
  "low price": calc("low_52w", "52-week low"),
  "high price all time": calc("ath", "All-time high"),
  "low price all time": calc("atl", "All-time low"),
  "down from 52w high": calc("down_52w", "% below 52-week high"),
  "up from 52w low": calc("up_52w", "% above 52-week low"),
  "from 52w high": calc("from_52w", "Price ÷ 52-week high"),
  "52w index": calc("index_52w", "Position in 52-week range (0–100)"),
};
const FUND: Record<string, [string, string]> = {
  "market capitalization": ["mcap", "Market cap (₹ Cr)"],
  "number of equity shares": ["shares", "Shares (Cr)"],
  "face value": ["face_value", "Face value"],
  "book value": ["bv", "Book value per share"],
  "price to book value": ["pb", "P/B"],
  "price to earning": ["pe", "P/E"],
  "peg ratio": ["peg", "PEG"],
  "price to cash flow": ["pcf", "Price ÷ operating cash flow"],
  "price to free cash flow": ["pfcf", "Price ÷ free cash flow"],
  "market cap to sales": ["mcap_sales", "Market cap ÷ sales"],
  evebitda: ["ev_ebitda", "EV/EBITDA"],
  "earnings yield": ["earnings_yield", "Earnings yield %"],
  "graham number": ["graham", "Graham number"],
  "historical pe 5years": ["hist_pe_5", "Average P/E, last 5 years"],
  "industry pe": ["industry_pe", "Sector P/E"],
  "industry pbv": ["industry_pb", "Industry P/B"],
  "dividend yield": ["div_yield", "Dividend yield %"],
  "dividend payout": ["payout", "Dividend payout %"],
  "average dividend payout 3years": ["payout_3", "Average dividend payout, 3 years %"],
  "dividend last year": ["div_fy", "Dividend last year (₹ Cr)"],
  "average 5years dividend": ["div_avg5", "Average dividend, 5 years (₹ Cr)"],
  sales: ["sales", "Sales, trailing 12 months (₹ Cr)"],
  "sales last year": ["sales_fy", "Sales last year (₹ Cr)"],
  "sales growth": ["sales_g", "Sales growth, 12 months %"],
  "sales growth 3years": ["sales_g3", "Sales growth, 3 years %"],
  "sales growth 5years": ["sales_g5", "Sales growth, 5 years %"],
  "sales growth 10years": ["sales_g10", "Sales growth, 10 years %"],
  "profit after tax": ["np", "Net profit, trailing 12 months (₹ Cr)"],
  "net profit": ["np", "Net profit, trailing 12 months (₹ Cr)"],
  "net profit last year": ["np_fy", "Net profit last year (₹ Cr)"],
  "profit after tax last year": ["np_fy", "Net profit last year (₹ Cr)"],
  "profit growth": ["np_g", "Profit growth, 12 months %"],
  "profit growth 3years": ["np_g3", "Profit growth, 3 years %"],
  "profit growth 5years": ["np_g5", "Profit growth, 5 years %"],
  "profit growth 7years": ["np_g7", "Profit growth, 7 years %"],
  "profit growth 10years": ["np_g10", "Profit growth, 10 years %"],
  "operating profit growth": ["op_g", "Operating profit growth, 12 months %"],
  "average earnings 10year": ["avg_np_10", "Average net profit, 10 years (₹ Cr)"],
  "net profit latest quarter": ["np_q0", "Net profit, latest quarter (₹ Cr)"],
  "profit after tax latest quarter": ["np_q0", "Net profit, latest quarter (₹ Cr)"],
  "net profit preceding quarter": ["np_q1", "Net profit, previous quarter (₹ Cr)"],
  "net profit 2quarters back": ["np_q2", "Net profit, 2 quarters back (₹ Cr)"],
  "net profit 3quarters back": ["np_q3", "Net profit, 3 quarters back (₹ Cr)"],
  "other income latest quarter": ["oi_q0", "Other income, latest quarter (₹ Cr)"],
  "tax latest quarter": ["tax_q0", "Tax, latest quarter (₹ Cr)"],
  "yoy quarterly sales growth": ["sales_yoy", "Quarterly sales growth, year on year %"],
  "yoy quarterly profit growth": ["np_yoy", "Quarterly profit growth, year on year %"],
  "qoq sales": ["sales_qoq", "Sales growth, quarter on quarter %"],
  "qoq profits": ["np_qoq", "Profit growth, quarter on quarter %"],
  eps: ["eps", "EPS, trailing 12 months"],
  "eps last year": ["eps_fy", "EPS last year"],
  "eps preceding year": ["eps_fy1", "EPS, year before last"],
  "eps latest quarter": ["eps_q0", "EPS, latest quarter"],
  "eps preceding year quarter": ["eps_q4", "EPS, same quarter last year"],
  opm: ["opm", "Operating margin, 12 months %"],
  "opm last year": ["opm_fy", "Operating margin last year %"],
  "opm preceding year": ["opm_fy1", "Operating margin, year before last %"],
  "opm 5year": ["opm_5", "Average operating margin, 5 years %"],
  "opm latest quarter": ["opm_q0", "Operating margin, latest quarter %"],
  "opm preceding quarter": ["opm_q1", "Operating margin, previous quarter %"],
  "opm preceding year quarter": ["opm_q4", "Operating margin, same quarter last year %"],
  "npm last year": ["npm_fy", "Net margin last year %"],
  "npm preceding year": ["npm_fy1", "Net margin, year before last %"],
  "return on equity": ["roe", "ROE %"],
  "return on equity preceding year": ["roe_fy1", "ROE, year before last %"],
  "average return on equity 3years": ["roe_3", "Average ROE, 3 years %"],
  "average return on equity 5years": ["roe_5", "Average ROE, 5 years %"],
  "return on equity 5years growth": ["roe_g5", "ROE growth, 5 years %"],
  "return on capital employed": ["roce", "ROCE %"],
  "return on capital employed preceding year": ["roce_fy1", "ROCE, year before last %"],
  "average return on capital employed 3years": ["roce_3", "Average ROCE, 3 years %"],
  "average return on capital employed 5years": ["roce_5", "Average ROCE, 5 years %"],
  "average return on capital employed 7years": ["roce_7", "Average ROCE, 7 years %"],
  "average return on capital employed 10years": ["roce_10", "Average ROCE, 10 years %"],
  "return on invested capital": ["roic", "Return on invested capital %"],
  debt: ["debt", "Debt (₹ Cr)"],
  "debt 3years back": ["debt_3", "Debt, 3 years back (₹ Cr)"],
  "debt to equity": ["de", "Debt to equity"],
  reserves: ["reserves", "Reserves (₹ Cr)"],
  "total assets": ["total_assets", "Total assets (₹ Cr)"],
  "net block": ["block", "Net fixed assets (₹ Cr)"],
  "net block preceding year": ["block_1", "Net fixed assets, previous year (₹ Cr)"],
  "net block 3years back": ["block_3", "Net fixed assets, 3 years back (₹ Cr)"],
  "capital work in progress": ["cwip", "Work in progress (₹ Cr)"],
  "capital work in progress preceding year": ["cwip_1", "Work in progress, previous year (₹ Cr)"],
  "interest coverage": ["icr", "Interest cover"],
  "interest coverage ratio": ["icr", "Interest cover"],
  "current ratio": ["current_ratio", "Current ratio"],
  "cash end of last year": ["cash", "Cash, last year end (₹ Cr)"],
  "cash from operations last year": ["cfo_fy", "Operating cash flow last year (₹ Cr)"],
  "cash from operations preceding year": ["cfo_fy1", "Operating cash flow, year before last (₹ Cr)"],
  "operating cash flow 3years": ["cfo_3", "Operating cash flow, 3 years (₹ Cr)"],
  "operating cash flow 5years": ["cfo_5", "Operating cash flow, 5 years (₹ Cr)"],
  "debtor days": ["debtor_days", "Debtor days"],
  "inventory turnover ratio": ["inv_turn", "Inventory turnover"],
  "promoter holding": ["promoter", "Promoter holding %"],
  "fii holding": ["fii", "FII holding %"],
  "dii holding": ["dii", "DII holding %"],
  "change in promoter holding": ["promoter_chg", "Change in promoter holding, latest quarter"],
  "change in fii holding": ["fii_chg", "Change in FII holding, latest quarter"],
  "change in dii holding": ["dii_chg", "Change in DII holding, latest quarter"],
};

/** Plain form: "Market Capitalization > 500 AND (Debt to equity < 1 OR ...)". */
export function parsePlain(text: string): Node {
  const tokens = text.replace(/\s+/g, " ").replace(/(\d)\s*%/g, "$1").match(/<=|>=|!=|[<>=()*/+-]|[^\s<>=()*/+-]+/g) ?? [];
  let i = 0;
  const isOp = (t: string | undefined) => t != null && /^(<=|>=|!=|[<>=()*/+-])$/.test(t);
  const isJoin = (t: string | undefined) => t != null && /^(and|or)$/i.test(t);
  const isNum = (t: string) => /^\d*\.?\d+%?$/.test(t);

  function atom(): Node {
    const t = tokens[i];
    if (t === "(") {
      i++;
      const n = orExpr();
      if (tokens[i++] !== ")") throw new Error(`Expected ) in: ${text}`);
      return n;
    }
    if (t === undefined) throw new Error(`Unexpected end of: ${text}`);
    // "20%" is 20: percentage fields hold percentage points, and the percent sign adds nothing.
    if (isNum(t) && (i + 1 >= tokens.length || isOp(tokens[i + 1]) || isJoin(tokens[i + 1]))) { i++; return num(parseFloat(t)); }
    const words: string[] = [];
    while (i < tokens.length && !isOp(tokens[i]) && !isJoin(tokens[i])) words.push(tokens[i++]);
    const name = words.join(" ").toLowerCase();
    if (FIELDS[name]) return FIELDS[name];
    if (FUND[name]) return fund(FUND[name][0], FUND[name][1]);
    throw new Error(`Unknown field "${name}"`);
  }
  function mul(): Node {
    let a = atom();
    while (tokens[i] === "*" || tokens[i] === "/") { const op = tokens[i++] as "*" | "/"; a = { k: "math", op, a, b: atom() }; }
    return a;
  }
  function add(): Node {
    let a = mul();
    while (tokens[i] === "+" || tokens[i] === "-") { const op = tokens[i++] as "+" | "-"; a = { k: "math", op, a, b: mul() }; }
    return a;
  }
  function cmp(): Node {
    const a = add();
    const t = tokens[i];
    if (t === ">" || t === "<" || t === ">=" || t === "<=" || t === "=" || t === "!=") { i++; return { k: "cmp", op: t, a, b: add() }; }
    return a;
  }
  function andExpr(): Node {
    const xs = [cmp()];
    while (/^and$/i.test(tokens[i] ?? "")) { i++; xs.push(cmp()); }
    return xs.length > 1 ? { k: "and", xs } : xs[0];
  }
  function orExpr(): Node {
    const xs = [andExpr()];
    while (/^or$/i.test(tokens[i] ?? "")) { i++; xs.push(andExpr()); }
    return xs.length > 1 ? { k: "or", xs } : xs[0];
  }
  const out = orExpr();
  if (i !== tokens.length) throw new Error(`Trailing "${tokens[i]}" in: ${text}`);
  return out;
}

// ── Timeframe-prefixed form ────────────────────────────────────────

const YEARLY: Record<string, [string, string]> = {
  net_sales: ["sales", "Sales"],
  net_profit: ["np", "Net profit"],
  net_profit_ami: ["np", "Net profit"],
  eps_annual: ["eps", "EPS"],
  secured_loans: ["debt", "Borrowings"],
  unsecured_loans: ["debt_zero", "Borrowings"],
};
const STATIC_FUND: Record<string, [string, string]> = {
  "market cap": ["mcap", "Market cap (₹ Cr)"],
  "face value": ["face_value", "Face value"],
  "book value": ["bv", "Book value per share"],
  fund_eps: ["eps", "EPS"],
};
// Longest first, so "adx di positive" isn't read as "adx".
const INDICATORS = [
  "macd histogram", "macd signal", "macd line", "adx di positive", "adx di negative", "upper bollinger band", "lower bollinger band",
  "slow stochastic %k", "slow stochastic %d", "fast stochastic %k", "fast stochastic %d", "williams %r", "aroon up", "aroon down",
  "parabolic sar", "ichimoku conversion line", "ichimoku base line", "ichimoku span a", "ichimoku span b", "ichimoku cloud top", "ichimoku cloud bottom",
  "supertrend", "stochrsi", "adx", "rsi", "cci", "mfi", "sma", "ema", "wma", "vwap", "open", "high", "low", "close", "volume",
];
const FIELD_BASES = new Set(["open", "high", "low", "close", "volume"]);

/** Indicator form: "( {cash} ( latest close > latest sma( close,200 ) and 1 day ago ... ) )". */
export function parseIndicator(text: string): Node {
  // The file's long statement names hold slashes and brackets that would read as operators.
  const clean = text.toLowerCase().replace(/\s+/g, " ")
    .replace(/net profit\/reported profit after tax/g, "net_profit")
    .replace(/net profit after minority interest & pnl assoco/g, "net_profit_ami")
    .replace(/eps after extraordinary items basic/g, "eps_annual")
    .replace(/earning per share\[eps\]/g, "fund_eps")
    .replace(/net sales/g, "net_sales").replace(/unsecured loans/g, "unsecured_loans").replace(/secured loans/g, "secured_loans")
    .replace(/\{-?[\w]+\}/g, " ");
  const tokens = clean.match(/"[^"]*"|<=|>=|!=|[<>=()\[\],*/+-]|%[a-z]|[\d.]+|[a-z_]+/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const expect = (t: string) => { if (tokens[i] !== t) throw new Error(`Expected ${t}, found ${tokens[i]} at ${tokens.slice(Math.max(0, i - 4), i + 4).join(" ")}`); i++; };
  const isNum = (t: string | undefined) => t != null && /^[\d.]+$/.test(t);

  /** Candle size and offset: latest, daily, weekly, "2 days ago", "[-1] 15 minute". */
  function prefix(inherit: Tf): { tf: Tf; off: number } {
    const t = peek();
    if (t === "latest") { i++; return { tf: inherit === "w" || inherit === "m" ? inherit : "d", off: 0 }; }
    if (t === "daily") { i++; return { tf: "d", off: 0 }; }
    if (t === "weekly") { i++; return { tf: "w", off: 0 }; }
    if (t === "monthly") { i++; return { tf: "m", off: 0 }; }
    if (t === "yearly") { i++; return { tf: "y", off: 0 }; }
    if (t === "[") {
      i++;
      let sign = 1;
      if (peek() === "-") { sign = -1; i++; }
      const n = Number(tokens[i++]);
      expect("]");
      const size = Number(tokens[i++]);
      const unit = tokens[i++];
      if (unit !== "minute" && unit !== "hour") throw new Error(`Bad candle size ${unit}`);
      return { tf: unit === "hour" ? size * 60 : size, off: -sign * n };
    }
    if (isNum(t) && /^(days?|weeks?|months?|years?)$/.test(tokens[i + 1] ?? "") && tokens[i + 2] === "ago") {
      const n = Number(t), unit = tokens[i + 1];
      i += 3;
      return { tf: unit.startsWith("day") ? "d" : unit.startsWith("week") ? "w" : unit.startsWith("month") ? "m" : "y", off: n };
    }
    return { tf: inherit, off: 0 };
  }

  function words(): string {
    let s = "";
    while (peek() && peek() !== "and" && peek() !== "or" && (/^[a-z_]+$/.test(peek()) || /^%[a-z]$/.test(peek()))) s += (s ? " " : "") + tokens[i++];
    return s;
  }

  function args(): (number | string)[] {
    expect("(");
    const out: (number | string)[] = [];
    while (peek() !== ")") {
      if (isNum(peek())) out.push(Number(tokens[i++]));
      else {
        // sma( latest volume , 50 ) and wma( monthly close , 30 ): the base field, on the outer candle size.
        prefix("d");
        const w = words();
        if (!FIELD_BASES.has(w)) throw new Error(`Bad indicator argument "${w}"`);
        out.push(w);
      }
      if (peek() === ",") i++;
    }
    expect(")");
    return out;
  }

  function atom(inherit: Tf): Node {
    const t = peek();
    if (t === undefined) throw new Error("Unexpected end of rule");
    if (t === "(") { i++; const n = orExpr(inherit); expect(")"); return n; }
    if (t === "-" && isNum(tokens[i + 1])) { i += 2; return num(-Number(tokens[i - 1])); }
    if (isNum(t) && !/^(days?|weeks?|months?|years?)$/.test(tokens[i + 1] ?? "")) { i++; return num(Number(t)); }
    if (t === "abs" || t === "least" || t === "greatest") {
      i++; expect("(");
      const xs: Node[] = [add(inherit)];
      while (peek() === ",") { i++; xs.push(add(inherit)); }
      expect(")");
      return { k: "fn", fn: t, args: xs };
    }
    const p = prefix(inherit);
    if (peek()?.startsWith('"')) {
      const q = tokens[i++];
      if (!/sum\( *close \* volume, *5 *\) *\/ *sum\( *volume *, *5 *\)/.test(q)) throw new Error(`Unknown formula ${q}`);
      return { k: "ind", tf: p.tf, off: p.off, ind: "vwma", args: [5] };
    }
    if (peek() === "max" || peek() === "min") {
      const fn = tokens[i++] as "max" | "min";
      expect("(");
      const n = Number(tokens[i++]);
      expect(",");
      const expr = add(p.tf);
      expect(")");
      return { k: "win", fn, n, tf: p.tf, off: p.off, expr };
    }
    if (peek() === "count") {
      i++; expect("(");
      const n = Number(tokens[i++]);
      expect(",");
      const step = Number(tokens[i++]);
      if (step !== 1) throw new Error("Only count(n, 1 where ...) is supported");
      if (tokens[i++] !== "where") throw new Error("Expected where");
      const expr = cmp(p.tf);
      expect(")");
      return { k: "win", fn: "count", n, tf: p.tf, off: p.off, expr };
    }
    const name = words();
    if (YEARLY[name]) return { k: "fund", key: `y_${YEARLY[name][0]}`, off: p.off, label: YEARLY[name][1] + (p.off ? `, ${p.off} year${p.off > 1 ? "s" : ""} ago` : ", latest year") };
    if (STATIC_FUND[name]) return fund(STATIC_FUND[name][0], STATIC_FUND[name][1]);
    if (!INDICATORS.includes(name)) throw new Error(`Unknown indicator "${name}"`);
    // Years back on a price means that many Decembers of monthly candles.
    if (p.tf === "y") return { k: "ind", tf: "m", off: p.off * 12, ind: name, args: [] };
    return { k: "ind", tf: p.tf, off: p.off, ind: name.replace(/ /g, "_"), args: peek() === "(" ? args() : [] };
  }
  function mul(tf: Tf): Node {
    let a = atom(tf);
    while (peek() === "*" || peek() === "/") { const op = tokens[i++] as "*" | "/"; a = { k: "math", op, a, b: atom(tf) }; }
    return a;
  }
  function add(tf: Tf): Node {
    let a = mul(tf);
    while (peek() === "+" || peek() === "-") { const op = tokens[i++] as "+" | "-"; a = { k: "math", op, a, b: mul(tf) }; }
    return a;
  }
  function cmp(tf: Tf): Node {
    const a = add(tf);
    const t = peek();
    if (t === ">" || t === "<" || t === ">=" || t === "<=" || t === "=" || t === "!=") { i++; return { k: "cmp", op: t, a, b: add(tf) }; }
    return a;
  }
  function andExpr(tf: Tf): Node {
    const xs = [cmp(tf)];
    while (peek() === "and") { i++; xs.push(cmp(tf)); }
    return xs.length > 1 ? { k: "and", xs } : xs[0];
  }
  function orExpr(tf: Tf): Node {
    const xs = [andExpr(tf)];
    while (peek() === "or") { i++; xs.push(andExpr(tf)); }
    return xs.length > 1 ? { k: "or", xs } : xs[0];
  }
  const out = orExpr("d");
  if (i !== tokens.length) throw new Error(`Trailing "${tokens[i]}" near ${tokens.slice(Math.max(0, i - 4), i + 4).join(" ")}`);
  return out;
}

// ── Reading a rule back ────────────────────────────────────────────

const INDICATOR_LABEL: Record<string, string> = {
  open: "Open", high: "High", low: "Low", close: "Close", volume: "Volume", rsi: "RSI", sma: "SMA", ema: "EMA", wma: "WMA", vwma: "Volume-weighted average",
  macd_line: "MACD line", macd_signal: "MACD signal", macd_histogram: "MACD histogram", adx: "ADX", adx_di_positive: "+DI", adx_di_negative: "−DI",
  upper_bollinger_band: "Upper Bollinger Band", lower_bollinger_band: "Lower Bollinger Band",
  "slow_stochastic_%k": "Slow stochastic %K", "slow_stochastic_%d": "Slow stochastic %D", "fast_stochastic_%k": "Fast stochastic %K", "fast_stochastic_%d": "Fast stochastic %D",
  stochrsi: "Stochastic RSI", cci: "CCI", mfi: "MFI", "williams_%r": "Williams %R", aroon_up: "Aroon up", aroon_down: "Aroon down", parabolic_sar: "Parabolic SAR", supertrend: "Supertrend",
  ichimoku_conversion_line: "Ichimoku conversion", ichimoku_base_line: "Ichimoku base", ichimoku_span_a: "Ichimoku span A", ichimoku_span_b: "Ichimoku span B",
  ichimoku_cloud_top: "Ichimoku cloud top", ichimoku_cloud_bottom: "Ichimoku cloud bottom", vwap: "VWAP",
};

const tfWord = (tf: Tf) => (tf === "d" ? "" : tf === "w" ? "Weekly " : tf === "m" ? "Monthly " : tf === "y" ? "Yearly " : tf >= 60 ? `${tf / 60}-hour ` : `${tf}-min `);
const backWord = (tf: Tf, off: number) => {
  if (!off) return "";
  const unit = tf === "d" ? "day" : tf === "w" ? "week" : tf === "m" ? "month" : "candle";
  return `, ${off} ${unit}${off > 1 ? "s" : ""} ago`;
};

function words(n: Node, nested = false): string {
  switch (n.k) {
    case "num": return String(n.v);
    case "fund": case "calc": return n.label;
    case "ind": {
      const label = INDICATOR_LABEL[n.ind] ?? n.ind;
      const a = n.args.filter((x) => !(x === "close" && (n.ind === "sma" || n.ind === "ema" || n.ind === "wma")));
      const base = `${tfWord(n.tf)}${label}${a.length ? `(${a.join(", ")})` : ""}`;
      return base.charAt(0).toUpperCase() + base.slice(1) + backWord(n.tf, n.off);
    }
    case "win": {
      if (n.fn === "count") return `Count over ${n.n} ${n.tf === "y" ? "years" : "candles"} where ${words(n.expr)}`;
      const unit = n.tf === "d" ? "days" : n.tf === "w" ? "weeks" : n.tf === "m" ? "months" : n.tf === "y" ? "years" : "candles";
      return `${n.fn === "max" ? "Highest" : "Lowest"} ${words(n.expr)} over ${n.n} ${unit}${backWord(n.tf, n.off)}`;
    }
    case "fn": return n.fn === "abs" ? `|${words(n.args[0])}|` : `${n.fn === "least" ? "Lower" : "Higher"} of ${n.args.map((x) => words(x)).join(" and ")}`;
    case "math": { const s = `${words(n.a, true)} ${n.op === "*" ? "×" : n.op === "/" ? "÷" : n.op === "-" ? "−" : "+"} ${words(n.b, true)}`; return nested ? `(${s})` : s; }
    case "cmp": return `${words(n.a)} ${{ ">": ">", ">=": "≥", "<": "<", "<=": "≤", "=": "=", "!=": "≠" }[n.op]} ${words(n.b)}`;
    case "and": return n.xs.map((x) => words(x, true)).join(" and ");
    case "or": { const s = n.xs.map((x) => words(x, true)).join(" or "); return nested ? `(${s})` : s; }
  }
}

/** A rule as readable lines: every line must hold, and "any of" lists its alternatives. */
export type RuleLine = { text: string; any?: string[] };
export function ruleLines(n: Node): RuleLine[] {
  const flat = (x: Node): Node[] => (x.k === "and" ? x.xs.flatMap(flat) : [x]);
  return flat(n).map((x) => (x.k === "or" ? { text: "Any of these:", any: x.xs.map((o) => words(o)) } : { text: words(x) }));
}

/** Values worth showing beside a result: the figures a screen's rule actually tests, at the latest candle. */
export function ruleColumns(n: Node, max = 4): { id: string; label: string; node: Node }[] {
  const seen = new Map<string, { id: string; label: string; node: Node }>();
  const skip = new Set(["close", "open", "high", "low", "volume"]);
  const walk = (x: Node) => {
    if (seen.size >= max) return;
    switch (x.k) {
      case "and": case "or": x.xs.forEach(walk); return;
      case "cmp": walk(x.a); walk(x.b); return;
      case "math": walk(x.a); walk(x.b); return;
      case "fn": x.args.forEach(walk); return;
      case "fund": if (!x.off && x.key !== "mcap" && !x.key.startsWith("y_")) seen.set(x.key, { id: x.key, label: x.label, node: x }); return;
      case "calc": seen.set(x.key, { id: x.key, label: x.label, node: x }); return;
      case "ind": {
        if (x.off > 0 || skip.has(x.ind)) return;
        const id = `${x.tf}_${x.ind}_${x.args.join("_")}`;
        seen.set(id, { id, label: words(x), node: x });
        return;
      }
      default: return;
    }
  };
  walk(n);
  return [...seen.values()];
}

// The sums behind every calculator. Plain functions with no imports, so they run in the
// browser for instant answers and under `node --test` without a build. A calculator is a
// list of inputs and a function from their values to a Result; one Svelte view draws them all.
//
// Rates and limits that the government changes are at the top, each with its date:
// recheck them at every Budget and every quarter's small savings notice.

/** Income tax year the tax sums follow. Budget 2026 kept the slabs of Budget 2025. */
export const TAX_YEAR = "FY 2026-27";
export const PPF_RATE = 7.1; // October to December 2026 quarter
export const EPF_RATE = 8.25; // declared for 2025-26
export const GRATUITY_CAP = 2_000_000; // ₹20 lakh
const EPS_MONTHLY_CAP = 1250; // 8.33% of the ₹15,000 wage ceiling

export type Field = {
  key: string;
  label: string;
  kind: "money" | "percent" | "years" | "months" | "age";
  min: number;
  max: number;
  step: number;
  value: number;
  /** The slider moves evenly by ratio, for amounts that span several orders of magnitude. */
  log?: boolean;
  hint?: string;
};
export type Choice = {
  key: string;
  label: string;
  kind: "choice";
  value: string;
  options: { value: string; label: string }[];
  hint?: string;
};
export type Input = Field | Choice;
export type Values = Record<string, number | string>;

export type Tone = "base" | "gain";
export type Result = {
  headline: { label: string; value: string };
  stats: { label: string; value: string }[];
  warn?: string;
  split?: { label: string; value: number; tone: Tone }[];
  chart?: { title: string; labels: string[]; series: { name: string; tone: Tone; values: number[] }[] };
  tables?: { title: string; columns: string[]; rows: string[][] }[];
};
export type Calculator = { inputs: Input[]; compute: (v: Values) => Result };

const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
/** ₹12,34,567. Rounds half-rupees away so totals print the way a statement would. */
export const rs = (v: number) => `${v < 0 ? "−" : ""}₹${inr0.format(Math.round(Math.abs(v)))}`;
export const pc = (v: number, dp = 2) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}%`;
const n = (v: Values, k: string) => Number(v[k]);
const yearsWord = (y: number) => `${y} ${y === 1 ? "year" : "years"}`;
const span = (months: number) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && yearsWord(y), m && `${m} ${m === 1 ? "month" : "months"}`].filter(Boolean).join(" ") || "0 months";
};

// ---- Pieces shared by several calculators ----

/** Future value of `pmt` paid at the start of each of `months` months, at annual% ÷ 12 a month. */
export function sipValue(pmt: number, annual: number, months: number): number {
  const i = annual / 1200;
  if (i === 0) return pmt * months;
  return pmt * ((Math.pow(1 + i, months) - 1) / i) * (1 + i);
}

/** The monthly payment that clears `principal` over `months` at annual%. */
export function emi(principal: number, annual: number, months: number): number {
  const i = annual / 1200;
  if (i === 0) return principal / months;
  const f = Math.pow(1 + i, months);
  return (principal * i * f) / (f - 1);
}

/** Money paid in, and what it is worth, at the end of each year: one chart, one table, one split. */
function growth(labelIn: string, labelGain: string, invested: number[], value: number[]) {
  const last = value.length - 1;
  return {
    split: [
      { label: labelIn, value: invested[last], tone: "base" as Tone },
      { label: labelGain, value: Math.max(0, value[last] - invested[last]), tone: "gain" as Tone },
    ],
    chart: {
      title: "Value at the end of each year",
      labels: value.map((_, i) => `Year ${i + 1}`),
      series: [
        { name: labelIn, tone: "base" as Tone, values: invested },
        { name: labelGain, tone: "gain" as Tone, values: value.map((x, i) => Math.max(0, x - invested[i])) },
      ],
    },
    tables: [
      {
        title: "Year by year",
        columns: ["Year", labelIn, labelGain, "Value"],
        rows: value.map((x, i) => [String(i + 1), rs(invested[i]), rs(x - invested[i]), rs(x)]),
      },
    ],
  };
}

export type LoanYear = { principal: number; interest: number; balance: number };
export type LoanRun = { emi: number; months: number; interest: number; years: LoanYear[] };

/** Runs a loan month by month. `extra` is paid on top of the EMI, all of it against principal. */
export function runLoan(principal: number, annual: number, months: number, extra = 0): LoanRun {
  const i = annual / 1200;
  const pay = emi(principal, annual, months);
  let bal = principal;
  let m = 0;
  let interest = 0;
  const years: LoanYear[] = [];
  let y = { principal: 0, interest: 0, balance: 0 };
  while (bal > 0.005 && m < months) {
    const int = bal * i;
    const pri = Math.min(bal, pay + extra - int);
    bal -= pri;
    interest += int;
    y.principal += pri;
    y.interest += int;
    m++;
    if (m % 12 === 0 || bal <= 0.005) {
      y.balance = Math.max(0, bal);
      years.push(y);
      y = { principal: 0, interest: 0, balance: 0 };
    }
  }
  return { emi: pay, months: m, interest, years };
}

function loanView(principal: number, run: LoanRun) {
  return {
    split: [
      { label: "Principal", value: principal, tone: "base" as Tone },
      { label: "Interest", value: run.interest, tone: "gain" as Tone },
    ],
    chart: {
      title: "Paid in each year",
      labels: run.years.map((_, i) => `Year ${i + 1}`),
      series: [
        { name: "Principal", tone: "base" as Tone, values: run.years.map((y) => y.principal) },
        { name: "Interest", tone: "gain" as Tone, values: run.years.map((y) => y.interest) },
      ],
    },
    tables: [
      {
        title: "Repayment schedule",
        columns: ["Year", "Principal", "Interest", "Balance left"],
        rows: run.years.map((y, i) => [String(i + 1), rs(y.principal), rs(y.interest), rs(y.balance)]),
      },
    ],
  };
}

// ---- Income tax ----

type Slab = [upTo: number, rate: number];
const NEW_SLABS: Slab[] = [[400_000, 0], [800_000, 0.05], [1_200_000, 0.1], [1_600_000, 0.15], [2_000_000, 0.2], [2_400_000, 0.25], [Infinity, 0.3]];
const OLD_SLABS: Record<string, Slab[]> = {
  under60: [[250_000, 0], [500_000, 0.05], [1_000_000, 0.2], [Infinity, 0.3]],
  senior: [[300_000, 0], [500_000, 0.05], [1_000_000, 0.2], [Infinity, 0.3]],
  super: [[500_000, 0], [1_000_000, 0.2], [Infinity, 0.3]],
};
const SURCHARGE_NEW: [over: number, rate: number][] = [[5_000_000, 0.1], [10_000_000, 0.15], [20_000_000, 0.25]];
const SURCHARGE_OLD: [over: number, rate: number][] = [...SURCHARGE_NEW, [50_000_000, 0.37]];

function slabTax(income: number, slabs: Slab[]) {
  let tax = 0;
  let from = 0;
  const rows: { from: number; to: number; rate: number; tax: number }[] = [];
  for (const [to, rate] of slabs) {
    if (income <= from) break;
    const part = Math.min(income, to) - from;
    tax += part * rate;
    rows.push({ from, to: Math.min(income, to), rate, tax: part * rate });
    from = to;
  }
  return { tax, rows };
}

/** Surcharge, held back by marginal relief so crossing a threshold never costs more than the income above it. */
function surcharge(income: number, tax: number, slabs: Slab[], table: [number, number][]): number {
  let idx = -1;
  table.forEach(([over], i) => { if (income > over) idx = i; });
  if (idx < 0) return 0;
  const [over, rate] = table[idx];
  const before = idx > 0 ? table[idx - 1][1] : 0;
  const atLine = slabTax(over, slabs).tax * (1 + before);
  return Math.max(0, Math.min(tax * rate, atLine + (income - over) - tax));
}

export type RegimeTax = { taxable: number; slabTax: number; rebate: number; surcharge: number; cess: number; total: number; rows: ReturnType<typeof slabTax>["rows"] };

export function newRegime(gross: number, salaried: boolean): RegimeTax {
  const taxable = Math.max(0, gross - (salaried ? 75_000 : 0));
  const { tax, rows } = slabTax(taxable, NEW_SLABS);
  // Nil up to ₹12 lakh of taxable income; just above it, tax can't exceed the income over ₹12 lakh.
  const rebate = taxable <= 1_200_000 ? tax : Math.max(0, tax - (taxable - 1_200_000));
  const after = tax - rebate;
  const sc = surcharge(taxable, after, NEW_SLABS, SURCHARGE_NEW);
  const cess = (after + sc) * 0.04;
  return { taxable, slabTax: tax, rebate, surcharge: sc, cess, total: after + sc + cess, rows };
}

export function oldRegime(gross: number, salaried: boolean, age: string, deductions: number): RegimeTax {
  const taxable = Math.max(0, gross - (salaried ? 50_000 : 0) - deductions);
  const slabs = OLD_SLABS[age] ?? OLD_SLABS.under60;
  const { tax, rows } = slabTax(taxable, slabs);
  const rebate = taxable <= 500_000 ? Math.min(tax, 12_500) : 0;
  const after = tax - rebate;
  const sc = surcharge(taxable, after, slabs, SURCHARGE_OLD);
  const cess = (after + sc) * 0.04;
  return { taxable, slabTax: tax, rebate, surcharge: sc, cess, total: after + sc + cess, rows };
}

const slabRows = (r: RegimeTax) =>
  r.rows.map((s) => [`${rs(s.from)} to ${rs(s.to)}`, pc(s.rate * 100, 0), rs(s.tax)]);

// ---- The twenty calculators ----

const money = (key: string, label: string, min: number, max: number, step: number, value: number, more: Partial<Field> = {}): Field =>
  ({ key, label, kind: "money", min, max, step, value, ...more });
const percent = (key: string, label: string, min: number, max: number, value: number, step = 0.1, more: Partial<Field> = {}): Field =>
  ({ key, label, kind: "percent", min, max, step, value, ...more });
const years = (key: string, label: string, min: number, max: number, value: number, step = 1): Field =>
  ({ key, label, kind: "years", min, max, step, value });
const age = (key: string, label: string, min: number, max: number, value: number): Field =>
  ({ key, label, kind: "age", min, max, step: 1, value });

function sipRun(pmt: number, annual: number, yrs: number, stepUp = 0) {
  const i = annual / 1200;
  let bal = 0;
  let paid = 0;
  let cur = pmt;
  const invested: number[] = [];
  const value: number[] = [];
  for (let y = 1; y <= yrs; y++) {
    for (let m = 0; m < 12; m++) {
      paid += cur;
      bal = (bal + cur) * (1 + i);
    }
    invested.push(paid);
    value.push(bal);
    cur *= 1 + stepUp / 100;
  }
  return { invested, value, last: cur / (1 + stepUp / 100) };
}

const loanInputs = (amount: Field, rate: number, maxYears: number, tenure: number) => [
  amount,
  percent("rate", "Interest rate", 1, 30, rate, 0.05),
  years("years", "Loan tenure", 1, maxYears, tenure),
];

export const CALCULATORS: Record<string, Calculator> = {
  sip: {
    inputs: [
      money("monthly", "Monthly SIP", 100, 1_000_000, 100, 10_000, { log: true }),
      percent("rate", "Expected return a year", 1, 30, 12),
      years("years", "Time period", 1, 40, 10),
    ],
    compute(v) {
      const { invested, value } = sipRun(n(v, "monthly"), n(v, "rate"), n(v, "years"));
      const last = value.length - 1;
      return {
        headline: { label: "Estimated value", value: rs(value[last]) },
        stats: [
          { label: "You invest", value: rs(invested[last]) },
          { label: "Estimated gain", value: rs(value[last] - invested[last]) },
          { label: "Value ÷ invested", value: `${(value[last] / invested[last]).toFixed(2)}×` },
        ],
        ...growth("Invested", "Gain", invested, value),
      };
    },
  },

  lumpsum: {
    inputs: [
      money("amount", "Amount invested", 500, 100_000_000, 500, 500_000, { log: true }),
      percent("rate", "Expected return a year", 1, 30, 12),
      years("years", "Time period", 1, 40, 10),
    ],
    compute(v) {
      const p = n(v, "amount");
      const yrs = n(v, "years");
      const value = Array.from({ length: yrs }, (_, i) => p * Math.pow(1 + n(v, "rate") / 100, i + 1));
      const end = value[yrs - 1];
      return {
        headline: { label: "Estimated value", value: rs(end) },
        stats: [
          { label: "You invest", value: rs(p) },
          { label: "Estimated gain", value: rs(end - p) },
          { label: "Value ÷ invested", value: `${(end / p).toFixed(2)}×` },
        ],
        ...growth("Invested", "Gain", value.map(() => p), value),
      };
    },
  },

  "step-up-sip": {
    inputs: [
      money("monthly", "Starting monthly SIP", 100, 1_000_000, 100, 10_000, { log: true }),
      percent("stepUp", "Raise the SIP each year by", 0, 50, 10, 1),
      percent("rate", "Expected return a year", 1, 30, 12),
      years("years", "Time period", 1, 40, 15),
    ],
    compute(v) {
      const yrs = n(v, "years");
      const run = sipRun(n(v, "monthly"), n(v, "rate"), yrs, n(v, "stepUp"));
      const flat = sipRun(n(v, "monthly"), n(v, "rate"), yrs).value[yrs - 1];
      const end = run.value[yrs - 1];
      return {
        headline: { label: "Estimated value", value: rs(end) },
        stats: [
          { label: "You invest", value: rs(run.invested[yrs - 1]) },
          { label: "Extra over a flat SIP", value: rs(end - flat) },
          { label: "Final monthly SIP", value: rs(run.last) },
        ],
        ...growth("Invested", "Gain", run.invested, run.value),
      };
    },
  },

  swp: {
    inputs: [
      money("corpus", "Starting corpus", 10_000, 500_000_000, 10_000, 5_000_000, { log: true }),
      money("monthly", "Monthly withdrawal", 500, 5_000_000, 500, 30_000, { log: true }),
      percent("rate", "Expected return a year", 0, 20, 8),
      years("years", "Plan for", 1, 50, 20),
    ],
    compute(v) {
      const i = n(v, "rate") / 1200;
      const want = n(v, "monthly");
      const yrs = n(v, "years");
      let bal = n(v, "corpus");
      let taken = 0;
      let ranOut = 0;
      const rows: string[][] = [];
      const closing: number[] = [];
      for (let y = 1; y <= yrs; y++) {
        let tookYear = 0;
        let gainYear = 0;
        for (let m = 1; m <= 12; m++) {
          const out = Math.min(bal, want);
          if (out < want && !ranOut) ranOut = (y - 1) * 12 + m - 1;
          bal -= out;
          const gain = bal * i;
          bal += gain;
          tookYear += out;
          gainYear += gain;
        }
        taken += tookYear;
        closing.push(bal);
        rows.push([String(y), rs(tookYear), rs(gainYear), rs(bal)]);
      }
      return {
        headline: ranOut
          ? { label: "The money runs out after", value: span(ranOut) }
          : { label: `Left after ${yearsWord(yrs)}`, value: rs(bal) },
        stats: [
          { label: "Total withdrawn", value: rs(taken) },
          { label: "Withdrawn a year", value: `${pc((want * 1200) / n(v, "corpus"), 1)} of corpus` },
          { label: "Income the corpus earns a month", value: rs(n(v, "corpus") * i) },
        ],
        warn: ranOut ? `Withdrawing ${rs(want)} a month spends the corpus before ${yearsWord(yrs)} are up. Lower the withdrawal or plan on a higher return.` : undefined,
        chart: {
          title: "Corpus left at the end of each year",
          labels: closing.map((_, i) => `Year ${i + 1}`),
          series: [{ name: "Corpus left", tone: "gain", values: closing }],
        },
        tables: [{ title: "Year by year", columns: ["Year", "Withdrawn", "Returns earned", "Corpus left"], rows }],
      };
    },
  },

  cagr: {
    inputs: [
      money("start", "Starting value", 100, 1_000_000_000, 100, 100_000, { log: true }),
      money("end", "Ending value", 100, 10_000_000_000, 100, 250_000, { log: true }),
      years("years", "Years held", 0.5, 50, 5, 0.5),
    ],
    compute(v) {
      const s = n(v, "start");
      const e = n(v, "end");
      const yrs = n(v, "years");
      const rate = Math.pow(e / s, 1 / yrs) - 1;
      const whole = Math.ceil(yrs);
      const path = Array.from({ length: whole }, (_, i) => s * Math.pow(1 + rate, Math.min(i + 1, yrs)));
      return {
        headline: { label: "CAGR", value: pc(rate * 100) },
        stats: [
          { label: "Total return", value: pc((e / s - 1) * 100, 1) },
          { label: "Gain or loss", value: rs(e - s) },
          { label: "Value ÷ start", value: `${(e / s).toFixed(2)}×` },
        ],
        chart: {
          title: "The steady path at this rate",
          labels: path.map((_, i) => `Year ${i + 1}`),
          series: [{ name: "Value", tone: "gain", values: path }],
        },
        tables: [{ title: "Year by year", columns: ["Year", "Value at this CAGR"], rows: path.map((x, i) => [String(Math.min(i + 1, yrs)), rs(x)]) }],
      };
    },
  },

  "compound-interest": {
    inputs: [
      money("amount", "Principal", 100, 100_000_000, 100, 100_000, { log: true }),
      percent("rate", "Interest rate a year", 0.5, 30, 8),
      years("years", "Time period", 1, 50, 10),
      {
        key: "freq", label: "Compounded", kind: "choice", value: "4",
        options: [
          { value: "1", label: "Yearly" }, { value: "2", label: "Half-yearly" }, { value: "4", label: "Quarterly" },
          { value: "12", label: "Monthly" }, { value: "365", label: "Daily" },
        ],
      },
    ],
    compute(v) {
      const p = n(v, "amount");
      const r = n(v, "rate") / 100;
      const m = n(v, "freq");
      const yrs = n(v, "years");
      const value = Array.from({ length: yrs }, (_, i) => p * Math.pow(1 + r / m, m * (i + 1)));
      const end = value[yrs - 1];
      return {
        headline: { label: "Maturity value", value: rs(end) },
        stats: [
          { label: "Interest earned", value: rs(end - p) },
          { label: "Simple interest would give", value: rs(p * r * yrs) },
          { label: "Effective yearly rate", value: pc((Math.pow(1 + r / m, m) - 1) * 100) },
        ],
        ...growth("Principal", "Interest", value.map(() => p), value),
      };
    },
  },

  "goal-sip": {
    inputs: [
      money("target", "Amount you need", 10_000, 1_000_000_000, 10_000, 2_500_000, { log: true }),
      money("saved", "Already saved for it", 0, 100_000_000, 10_000, 0),
      percent("rate", "Expected return a year", 1, 30, 12),
      years("years", "Years to reach it", 1, 40, 10),
    ],
    compute(v) {
      const target = n(v, "target");
      const rate = n(v, "rate");
      const yrs = n(v, "years");
      const savedLater = n(v, "saved") * Math.pow(1 + rate / 100, yrs);
      const gap = Math.max(0, target - savedLater);
      const per = sipValue(1, rate, yrs * 12);
      const monthly = gap / per;
      const run = sipRun(monthly, rate, yrs);
      const saved = n(v, "saved");
      const invested = run.invested.map((x) => x + saved);
      const value = run.value.map((x, i) => x + saved * Math.pow(1 + rate / 100, i + 1));
      return {
        headline: { label: "Monthly SIP needed", value: rs(monthly) },
        stats: [
          { label: "You invest in all", value: rs(invested[yrs - 1]) },
          { label: "Savings grow to", value: rs(savedLater) },
          { label: "Returns do the rest", value: rs(Math.max(0, target - invested[yrs - 1])) },
        ],
        warn: gap === 0 ? "What you have saved already reaches this goal at this return, with no SIP needed." : undefined,
        ...growth("Invested", "Gain", invested, value),
      };
    },
  },

  emi: {
    inputs: loanInputs(money("amount", "Loan amount", 10_000, 100_000_000, 10_000, 1_000_000, { log: true }), 10.5, 30, 5),
    compute(v) {
      const p = n(v, "amount");
      const run = runLoan(p, n(v, "rate"), n(v, "years") * 12);
      return {
        headline: { label: "Monthly EMI", value: rs(run.emi) },
        stats: [
          { label: "Total interest", value: rs(run.interest) },
          { label: "Total repaid", value: rs(p + run.interest) },
          { label: "Interest ÷ loan", value: pc((run.interest / p) * 100, 1) },
        ],
        ...loanView(p, run),
      };
    },
  },

  "home-loan": {
    inputs: [
      money("price", "Home price", 500_000, 500_000_000, 50_000, 7_500_000, { log: true }),
      percent("down", "Down payment", 0, 90, 20, 1, { hint: "Banks usually lend up to 75% to 90% of the value, depending on the loan size." }),
      percent("rate", "Interest rate", 1, 20, 8.5, 0.05),
      years("years", "Loan tenure", 1, 30, 20),
      money("extra", "Extra paid each month", 0, 500_000, 500, 0, { hint: "Paid on top of the EMI, all of it against principal." }),
    ],
    compute(v) {
      const p = n(v, "price") * (1 - n(v, "down") / 100);
      const months = n(v, "years") * 12;
      const plain = runLoan(p, n(v, "rate"), months);
      const run = runLoan(p, n(v, "rate"), months, n(v, "extra"));
      const stats = [
        { label: "Loan amount", value: rs(p) },
        { label: "Total interest", value: rs(run.interest) },
        { label: "Total repaid", value: rs(p + run.interest) },
      ];
      if (n(v, "extra") > 0) {
        stats.push({ label: "Interest saved by paying extra", value: rs(plain.interest - run.interest) });
        stats.push({ label: "Loan ends sooner by", value: span(plain.months - run.months) });
      }
      return { headline: { label: "Monthly EMI", value: rs(run.emi) }, stats, ...loanView(p, run) };
    },
  },

  "car-loan": {
    inputs: [
      money("price", "On-road price", 100_000, 50_000_000, 10_000, 1_200_000, { log: true }),
      percent("down", "Down payment", 0, 90, 20, 1),
      percent("rate", "Interest rate", 1, 25, 9.5, 0.05),
      years("years", "Loan tenure", 1, 8, 5),
    ],
    compute(v) {
      const price = n(v, "price");
      const p = price * (1 - n(v, "down") / 100);
      const run = runLoan(p, n(v, "rate"), n(v, "years") * 12);
      return {
        headline: { label: "Monthly EMI", value: rs(run.emi) },
        stats: [
          { label: "Loan amount", value: rs(p) },
          { label: "Total interest", value: rs(run.interest) },
          { label: "Car costs you in all", value: rs(price + run.interest) },
        ],
        ...loanView(p, run),
      };
    },
  },

  fd: {
    inputs: [
      money("amount", "Deposit", 1_000, 100_000_000, 1_000, 500_000, { log: true }),
      percent("rate", "Interest rate", 1, 15, 7, 0.05),
      years("years", "Tenure", 0.25, 20, 5, 0.25),
      {
        key: "freq", label: "Compounded", kind: "choice", value: "4",
        options: [{ value: "4", label: "Quarterly" }, { value: "12", label: "Monthly" }, { value: "2", label: "Half-yearly" }, { value: "1", label: "Yearly" }],
      },
    ],
    compute(v) {
      const p = n(v, "amount");
      const r = n(v, "rate") / 100;
      const m = n(v, "freq");
      const yrs = n(v, "years");
      const at = (t: number) => p * Math.pow(1 + r / m, m * t);
      const whole = Math.ceil(yrs);
      const value = Array.from({ length: whole }, (_, i) => at(Math.min(i + 1, yrs)));
      return {
        headline: { label: "Maturity value", value: rs(at(yrs)) },
        stats: [
          { label: "Interest earned", value: rs(at(yrs) - p) },
          { label: "Effective yearly rate", value: pc((Math.pow(1 + r / m, m) - 1) * 100) },
          { label: "Interest a month on average", value: rs((at(yrs) - p) / (yrs * 12)) },
        ],
        ...growth("Deposit", "Interest", value.map(() => p), value),
      };
    },
  },

  rd: {
    inputs: [
      money("monthly", "Monthly deposit", 100, 1_000_000, 100, 5_000, { log: true }),
      percent("rate", "Interest rate", 1, 15, 7, 0.05),
      years("years", "Tenure", 1, 10, 5),
    ],
    compute(v) {
      const pmt = n(v, "monthly");
      const q = n(v, "rate") / 400;
      const at = (months: number) => {
        let sum = 0;
        for (let k = 1; k <= months; k++) sum += pmt * Math.pow(1 + q, (months - k + 1) / 3);
        return sum;
      };
      const yrs = n(v, "years");
      const value = Array.from({ length: yrs }, (_, i) => at((i + 1) * 12));
      const invested = value.map((_, i) => pmt * 12 * (i + 1));
      return {
        headline: { label: "Maturity value", value: rs(value[yrs - 1]) },
        stats: [
          { label: "You deposit", value: rs(invested[yrs - 1]) },
          { label: "Interest earned", value: rs(value[yrs - 1] - invested[yrs - 1]) },
          { label: "Number of instalments", value: String(yrs * 12) },
        ],
        ...growth("Deposited", "Interest", invested, value),
      };
    },
  },

  ppf: {
    inputs: [
      money("yearly", "Deposit a year", 500, 150_000, 500, 150_000, { hint: "₹1.5 lakh a year is the most a PPF account takes." }),
      percent("rate", "Interest rate", 1, 12, PPF_RATE, 0.05, { hint: `${PPF_RATE}% is the rate for October to December 2026. The government reviews it every quarter.` }),
      years("years", "Years", 15, 50, 15, 5),
    ],
    compute(v) {
      const pmt = n(v, "yearly");
      const r = n(v, "rate") / 100;
      const yrs = n(v, "years");
      const invested: number[] = [];
      const value: number[] = [];
      let bal = 0;
      for (let y = 1; y <= yrs; y++) {
        bal = (bal + pmt) * (1 + r);
        invested.push(pmt * y);
        value.push(bal);
      }
      return {
        headline: { label: "Maturity value", value: rs(bal) },
        stats: [
          { label: "You deposit", value: rs(pmt * yrs) },
          { label: "Interest earned, tax free", value: rs(bal - pmt * yrs) },
          { label: "Value ÷ deposited", value: `${(bal / (pmt * yrs)).toFixed(2)}×` },
        ],
        ...growth("Deposited", "Interest", invested, value),
      };
    },
  },

  epf: {
    inputs: [
      money("basic", "Basic pay + DA a month", 5_000, 1_000_000, 500, 50_000, { log: true }),
      age("age", "Your age", 18, 59, 30),
      age("retire", "Retiring at", 40, 60, 58),
      money("balance", "EPF balance today", 0, 50_000_000, 10_000, 0),
      percent("growth", "Pay rise a year", 0, 20, 7, 0.5),
      percent("own", "Your contribution", 12, 100, 12, 1, { hint: "12% is the usual share. Anything above it is Voluntary PF." }),
      percent("rate", "EPF interest rate", 1, 12, EPF_RATE, 0.05, { hint: `${EPF_RATE}% was declared for 2025-26. EPFO sets it each year.` }),
    ],
    compute(v) {
      const yrs = Math.max(0, n(v, "retire") - n(v, "age"));
      if (!yrs) return { headline: { label: "Corpus at retirement", value: rs(n(v, "balance")) }, stats: [], warn: "Set a retirement age above your current age." };
      const i = n(v, "rate") / 1200;
      let basic = n(v, "basic");
      let bal = n(v, "balance");
      let own = 0;
      let boss = 0;
      const invested: number[] = [];
      const value: number[] = [];
      for (let y = 1; y <= yrs; y++) {
        // Contributions land monthly; interest runs on the monthly balance and is credited once a year.
        let interest = 0;
        for (let m = 0; m < 12; m++) {
          const mine = (basic * n(v, "own")) / 100;
          const theirs = basic * 0.12 - Math.min(basic * 0.0833, EPS_MONTHLY_CAP);
          own += mine;
          boss += theirs;
          bal += mine + theirs;
          interest += bal * i;
        }
        bal += interest;
        invested.push(n(v, "balance") + own + boss);
        value.push(bal);
        basic *= 1 + n(v, "growth") / 100;
      }
      return {
        headline: { label: "Corpus at retirement", value: rs(bal) },
        stats: [
          { label: "Your contributions", value: rs(own) },
          { label: "Employer's contributions", value: rs(boss) },
          { label: "Interest earned", value: rs(bal - invested[yrs - 1]) },
        ],
        ...growth("Paid in", "Interest", invested, value),
      };
    },
  },

  nps: {
    inputs: [
      money("monthly", "Monthly contribution", 500, 500_000, 500, 10_000, { log: true }),
      age("age", "Your age", 18, 70, 30),
      age("retire", "Exit at", 40, 85, 60),
      percent("rate", "Expected return a year", 1, 16, 10),
      percent("annuity", "Corpus put into an annuity", 20, 100, 40, 5, { hint: "At least 20% for non-government subscribers with over ₹12 lakh, and 40% for government employees." }),
      percent("annuityRate", "Annuity rate a year", 1, 12, 6, 0.25),
    ],
    compute(v) {
      const yrs = Math.max(0, n(v, "retire") - n(v, "age"));
      if (!yrs) return { headline: { label: "Estimated corpus", value: rs(0) }, stats: [], warn: "Set an exit age above your current age." };
      const { invested, value } = sipRun(n(v, "monthly"), n(v, "rate"), yrs);
      const corpus = value[yrs - 1];
      const inAnnuity = (corpus * n(v, "annuity")) / 100;
      return {
        headline: { label: "Estimated corpus", value: rs(corpus) },
        stats: [
          { label: "Lump sum you can take", value: rs(corpus - inAnnuity) },
          { label: "Goes into the annuity", value: rs(inAnnuity) },
          { label: "Monthly pension", value: rs((inAnnuity * n(v, "annuityRate")) / 1200) },
        ],
        ...growth("Contributed", "Gain", invested, value),
      };
    },
  },

  retirement: {
    inputs: [
      age("age", "Your age", 18, 70, 30),
      age("retire", "Retiring at", 35, 80, 60),
      age("until", "Plan until age", 60, 105, 85),
      money("expense", "Monthly expenses today", 5_000, 2_000_000, 1_000, 50_000, { log: true }),
      money("saved", "Retirement savings today", 0, 200_000_000, 10_000, 0),
      percent("inflation", "Inflation", 0, 12, 6, 0.25),
      percent("before", "Return before retiring", 1, 20, 11, 0.25),
      percent("after", "Return after retiring", 1, 15, 7, 0.25),
    ],
    compute(v) {
      const toGo = Math.max(0, n(v, "retire") - n(v, "age"));
      const months = Math.max(0, n(v, "until") - n(v, "retire")) * 12;
      if (!toGo || !months) return { headline: { label: "Corpus you need", value: rs(0) }, stats: [], warn: "Ages should run in order: today, then retirement, then the age you plan until." };
      const inflation = n(v, "inflation") / 100;
      const expense = n(v, "expense") * Math.pow(1 + inflation, toGo);
      // Spending rises with inflation in retirement, so the corpus discounts at the real return.
      const real = (1 + n(v, "after") / 100) / (1 + inflation) - 1;
      const g = Math.pow(1 + real, 1 / 12) - 1;
      const corpus = Math.abs(g) < 1e-9 ? expense * months : (expense * (1 - Math.pow(1 + g, -months)) * (1 + g)) / g;
      const savedLater = n(v, "saved") * Math.pow(1 + n(v, "before") / 100, toGo);
      const gap = Math.max(0, corpus - savedLater);
      const monthly = gap / sipValue(1, n(v, "before"), toGo * 12);
      const run = sipRun(monthly, n(v, "before"), toGo);
      const saved = n(v, "saved");
      const invested = run.invested.map((x) => x + saved);
      const value = run.value.map((x, i) => x + saved * Math.pow(1 + n(v, "before") / 100, i + 1));
      return {
        headline: { label: "Corpus you need", value: rs(corpus) },
        stats: [
          { label: "Monthly SIP to get there", value: rs(monthly) },
          { label: "Monthly expenses when you retire", value: rs(expense) },
          { label: "Savings today grow to", value: rs(savedLater) },
        ],
        warn: gap === 0 ? "Your savings alone reach this corpus at these returns." : undefined,
        ...growth("Invested", "Gain", invested, value),
      };
    },
  },

  "income-tax": {
    inputs: [
      money("salary", "Salary or pension a year", 0, 100_000_000, 10_000, 1_500_000),
      money("other", "Other income a year", 0, 100_000_000, 10_000, 0, { hint: "Interest, rent and the like. Capital gains taxed at special rates are not covered." }),
      {
        key: "age", label: "Age (old regime only)", kind: "choice", value: "under60",
        options: [{ value: "under60", label: "Under 60" }, { value: "senior", label: "60 to 79" }, { value: "super", label: "80 and over" }],
      },
      money("inv", "Investments under the 80C limit", 0, 150_000, 1_000, 150_000, { hint: "Old regime only. Capped at ₹1.5 lakh." }),
      money("health", "Health insurance premium", 0, 100_000, 1_000, 25_000, { hint: "Old regime only." }),
      money("home", "Home loan interest, self-occupied", 0, 200_000, 1_000, 0, { hint: "Old regime only. Capped at ₹2 lakh." }),
      money("hra", "HRA exemption", 0, 2_000_000, 1_000, 0, { hint: "Old regime only. The HRA calculator works this out." }),
      money("otherDed", "Other deductions", 0, 2_000_000, 1_000, 0, { hint: "Old regime only. NPS, donations and so on." }),
    ],
    compute(v) {
      const salary = n(v, "salary");
      const gross = salary + n(v, "other");
      const isSalaried = salary > 0;
      const a = newRegime(gross, isSalaried);
      const deductions = n(v, "inv") + n(v, "health") + n(v, "home") + n(v, "hra") + n(v, "otherDed");
      const b = oldRegime(gross, isSalaried, String(v.age), deductions);
      const diff = b.total - a.total;
      const better = diff === 0 ? "Both regimes cost the same" : diff > 0 ? "The new regime saves you" : "The old regime saves you";
      const lower = Math.min(a.total, b.total);
      return {
        headline: { label: better, value: diff === 0 ? rs(a.total) : rs(Math.abs(diff)) },
        stats: [
          { label: "Tax, new regime", value: rs(a.total) },
          { label: "Tax, old regime", value: rs(b.total) },
          { label: "Effective rate at the lower tax", value: gross ? pc((lower / gross) * 100, 1) : "0%" },
          { label: "A month at the lower tax", value: rs(lower / 12) },
        ],
        tables: [
          {
            title: "The two regimes side by side",
            columns: ["", "New regime", "Old regime"],
            rows: [
              ["Gross income", rs(gross), rs(gross)],
              ["Standard deduction", rs(isSalaried ? 75_000 : 0), rs(isSalaried ? 50_000 : 0)],
              ["Other deductions", rs(0), rs(deductions)],
              ["Taxable income", rs(a.taxable), rs(b.taxable)],
              ["Tax on slabs", rs(a.slabTax), rs(b.slabTax)],
              ["Rebate and relief", rs(a.rebate), rs(b.rebate)],
              ["Surcharge", rs(a.surcharge), rs(b.surcharge)],
              ["Cess at 4%", rs(a.cess), rs(b.cess)],
              ["Total tax", rs(a.total), rs(b.total)],
            ],
          },
          { title: "New regime, slab by slab", columns: ["Income", "Rate", "Tax"], rows: slabRows(a) },
          { title: "Old regime, slab by slab", columns: ["Income", "Rate", "Tax"], rows: slabRows(b) },
        ],
      };
    },
  },

  gst: {
    inputs: [
      money("amount", "Amount", 1, 1_000_000_000, 1, 10_000, { log: true }),
      {
        key: "rate", label: "GST rate", kind: "choice", value: "18",
        options: [{ value: "3", label: "3% (gold, silver)" }, { value: "5", label: "5%" }, { value: "18", label: "18%" }, { value: "40", label: "40%" }],
      },
      {
        key: "mode", label: "The amount", kind: "choice", value: "add",
        options: [{ value: "add", label: "Excludes GST: add it" }, { value: "remove", label: "Includes GST: take it out" }],
      },
      {
        key: "supply", label: "Sold", kind: "choice", value: "intra",
        options: [{ value: "intra", label: "Within the state" }, { value: "inter", label: "To another state" }],
      },
    ],
    compute(v) {
      const r = n(v, "rate") / 100;
      const amount = n(v, "amount");
      const base = v.mode === "add" ? amount : amount / (1 + r);
      const tax = base * r;
      const stats = v.supply === "intra"
        ? [{ label: `CGST at ${pc(n(v, "rate") / 2, 1)}`, value: rs(tax / 2) }, { label: `SGST at ${pc(n(v, "rate") / 2, 1)}`, value: rs(tax / 2) }]
        : [{ label: `IGST at ${pc(n(v, "rate"), 0)}`, value: rs(tax) }];
      return {
        headline: { label: v.mode === "add" ? "Price with GST" : "Price before GST", value: rs(v.mode === "add" ? base + tax : base) },
        stats: [{ label: "GST", value: rs(tax) }, ...stats],
        split: [
          { label: "Price before GST", value: base, tone: "base" },
          { label: "GST", value: tax, tone: "gain" },
        ],
      };
    },
  },

  hra: {
    inputs: [
      money("basic", "Basic pay + DA a month", 1_000, 2_000_000, 500, 50_000, { log: true }),
      money("hra", "HRA received a month", 0, 1_000_000, 500, 20_000),
      money("rent", "Rent paid a month", 0, 1_000_000, 500, 18_000),
      {
        key: "city", label: "You live in", kind: "choice", value: "metro",
        options: [
          { value: "metro", label: "Mumbai, Delhi, Kolkata, Chennai, Bengaluru, Hyderabad, Pune or Ahmedabad" },
          { value: "other", label: "Any other city" },
        ],
      },
    ],
    compute(v) {
      const basic = n(v, "basic") * 12;
      const hra = n(v, "hra") * 12;
      const rent = n(v, "rent") * 12;
      const share = v.city === "metro" ? 0.5 : 0.4;
      const overTenth = Math.max(0, rent - basic * 0.1);
      const cityLimit = basic * share;
      const exempt = Math.min(hra, overTenth, cityLimit);
      return {
        headline: { label: "HRA exempt from tax, a year", value: rs(exempt) },
        stats: [
          { label: "Taxable HRA, a year", value: rs(hra - exempt) },
          { label: "Exempt, a month", value: rs(exempt / 12) },
        ],
        warn: rent === 0 ? "No rent paid means no exemption: all of the HRA is taxable." : undefined,
        split: hra > 0
          ? [{ label: "Exempt", value: exempt, tone: "gain" }, { label: "Taxable", value: hra - exempt, tone: "base" }]
          : undefined,
        tables: [{
          title: "The lowest of these three is exempt",
          columns: ["Limit", "A year"],
          rows: [
            ["HRA actually received", rs(hra)],
            ["Rent paid, less 10% of basic + DA", rs(overTenth)],
            [`${pc(share * 100, 0)} of basic + DA`, rs(cityLimit)],
          ],
        }],
      };
    },
  },

  gratuity: {
    inputs: [
      money("salary", "Last basic pay + DA a month", 1_000, 2_000_000, 500, 60_000, { log: true }),
      years("years", "Completed years of service", 0, 50, 10),
      { key: "months", label: "Further months of service", kind: "months", min: 0, max: 11, step: 1, value: 0 },
      {
        key: "covered", label: "Your employer", kind: "choice", value: "yes",
        options: [{ value: "yes", label: "Covered by the gratuity law (10+ staff)" }, { value: "no", label: "Not covered, pays gratuity anyway" }],
      },
    ],
    compute(v) {
      const salary = n(v, "salary");
      const whole = n(v, "years");
      const covered = v.covered === "yes";
      // Covered: more than six months counts as a full year, and a month is 26 working days.
      const counted = covered && n(v, "months") > 6 ? whole + 1 : whole;
      const raw = (salary * 15 * counted) / (covered ? 26 : 30);
      const paid = Math.min(raw, GRATUITY_CAP);
      const service = whole + n(v, "months") / 12;
      return {
        headline: { label: "Gratuity", value: rs(paid) },
        stats: [
          { label: "Years counted", value: String(counted) },
          { label: "Per year of service", value: rs((salary * 15) / (covered ? 26 : 30)) },
          { label: "Above the ₹20 lakh ceiling", value: rs(raw - paid) },
        ],
        warn: service < 5 ? "Permanent employees usually need five years of continuous service to qualify. Fixed-term employees qualify after one year." : undefined,
      };
    },
  },
};

/** The starting values of a calculator. */
export const defaults = (c: Calculator): Values => Object.fromEntries(c.inputs.map((i) => [i.key, i.value]));

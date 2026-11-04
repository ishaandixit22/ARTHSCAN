// Run with `npm test -w web`. Figures are worked by hand or taken from published examples
// (PPF at 7.1%, the ₹12 lakh rebate edge, standard EMI tables).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CALCULATORS, defaults, emi, newRegime, oldRegime, rs, runLoan, sipValue, type Values } from "../src/lib/calculators/engine.ts";
import { CATEGORIES, META } from "../src/lib/calculators/catalog.ts";
import { CONTENT } from "../src/lib/calculators/content.ts";

const near = (a: number, b: number, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const run = (slug: string, over: Values = {}) => {
  const c = CALCULATORS[slug];
  return c.compute({ ...defaults(c), ...over });
};
const money = (s: string) => Number(s.replace(/[₹,]/g, "").replace("−", "-"));
const stat = (r: ReturnType<typeof run>, label: string) => {
  const s = r.stats.find((x) => x.label === label);
  assert.ok(s, `no stat called ${label}`);
  return s.value;
};

describe("catalogue", () => {
  it("has twenty calculators, each with sums and copy", () => {
    assert.equal(META.length, 20);
    for (const m of META) {
      assert.ok(CALCULATORS[m.slug], `${m.slug} has no sums`);
      assert.ok(CONTENT[m.slug], `${m.slug} has no copy`);
      assert.ok(CONTENT[m.slug].faq.length >= 2, `${m.slug} needs FAQs`);
      assert.ok(CATEGORIES.includes(m.category));
    }
    assert.equal(Object.keys(CALCULATORS).length, 20);
  });

  it("every calculator gives a finite answer at its limits", () => {
    for (const [slug, c] of Object.entries(CALCULATORS)) {
      for (const pick of ["min", "max"] as const) {
        const v = defaults(c);
        for (const i of c.inputs) if (i.kind !== "choice") v[i.key] = i[pick];
        const r = c.compute(v);
        assert.ok(!/NaN|Infinity/.test(JSON.stringify(r)), `${slug} at ${pick}: ${JSON.stringify(r.headline)}`);
      }
    }
  });
});

describe("investing", () => {
  it("SIP: ₹10,000 at 12% for 10 years", () => near(sipValue(10_000, 12, 120), 2_323_391));
  it("lumpsum compounds yearly", () => assert.equal(run("lumpsum", { amount: 100_000, rate: 10, years: 2 }).headline.value, rs(121_000)));
  it("step-up at 0% matches a flat SIP", () => {
    assert.equal(run("step-up-sip", { stepUp: 0, years: 10 }).headline.value, rs(sipValue(10_000, 12, 120)));
  });
  it("step-up raises the SIP once a year", () => assert.equal(stat(run("step-up-sip", { monthly: 1000, stepUp: 10, years: 3 }), "Final monthly SIP"), rs(1210)));
  it("SWP reports when the money runs out", () => {
    const r = run("swp", { corpus: 120_000, monthly: 10_000, rate: 0, years: 5 });
    assert.equal(r.headline.value, "1 year");
    assert.ok(r.warn);
  });
  it("SWP keeps a corpus that out-earns the withdrawals", () => assert.equal(run("swp").warn, undefined));
  it("CAGR: doubling in six years", () => assert.equal(run("cagr", { start: 100, end: 200, years: 6 }).headline.value, "12.25%"));
  it("CAGR can be negative", () => assert.ok(run("cagr", { start: 200, end: 100, years: 2 }).headline.value.startsWith("−")));
  it("compounding: quarterly at 8% yields 8.24%", () => assert.equal(stat(run("compound-interest", { freq: "4", rate: 8 }), "Effective yearly rate"), "8.24%"));
  it("goal SIP reaches its target", () => {
    const need = money(run("goal-sip", { target: 2_323_391, saved: 0, rate: 12, years: 10 }).headline.value);
    near(need, 10_000);
  });
  it("goal SIP counts savings", () => {
    const r = run("goal-sip", { target: 100_000, saved: 100_000, years: 5 });
    assert.equal(r.headline.value, rs(0));
    assert.ok(r.warn);
  });
});

describe("loans", () => {
  it("EMI: ₹10 lakh at 10% for 10 years", () => near(emi(1_000_000, 10, 120), 13_215));
  it("the schedule repays exactly the loan", () => {
    const l = runLoan(1_000_000, 9, 60);
    near(l.years.reduce((s, y) => s + y.principal, 0), 1_000_000);
    near(l.years.at(-1)!.balance, 0);
    assert.equal(l.years.length, 5);
    near(l.emi * 60, 1_000_000 + l.interest);
  });
  it("paying extra shortens the loan and saves interest", () => {
    const r = run("home-loan", { extra: 10_000 });
    assert.ok(money(stat(r, "Interest saved by paying extra")) > 0);
    assert.ok(stat(r, "Loan ends sooner by").includes("year"));
  });
  it("home loan lends the price less the down payment", () => assert.equal(stat(run("home-loan", { price: 1_000_000, down: 20 }), "Loan amount"), rs(800_000)));
  it("car cost includes the down payment", () => {
    const r = run("car-loan", { price: 1_000_000, down: 50 });
    assert.equal(stat(r, "Car costs you in all"), rs(1_000_000 + money(stat(r, "Total interest"))));
  });
});

describe("savings", () => {
  it("FD: ₹1 lakh at 7% quarterly for 1 year", () => assert.equal(run("fd", { amount: 100_000, rate: 7, years: 1, freq: "4" }).headline.value, rs(107_186)));
  it("FD handles part years", () => {
    assert.equal(run("fd", { amount: 100_000, rate: 8, years: 0.25, freq: "4" }).headline.value, rs(102_000));
  });
  it("RD: ₹100 a month for 12 months at 8%, quarterly", () => {
    // The first instalment compounds for 4 quarters, the last for a third of one.
    let sum = 0;
    for (let k = 1; k <= 12; k++) sum += 100 * Math.pow(1.02, (12 - k + 1) / 3);
    assert.equal(run("rd", { monthly: 100, rate: 8, years: 1 }).headline.value, rs(sum));
  });
  it("PPF: ₹1.5 lakh for 15 years at 7.1%", () => near(money(run("ppf", { yearly: 150_000, rate: 7.1, years: 15 }).headline.value), 4_068_209));
  it("EPF: employer share is 3.67% of a ₹15,000 wage", () => {
    const r = run("epf", { basic: 15_000, age: 57, retire: 58, balance: 0, growth: 0, own: 12, rate: 8.25 });
    assert.equal(stat(r, "Your contributions"), rs(21_600));
    near(money(stat(r, "Employer's contributions")), 15_000 * 0.0367 * 12);
  });
  it("EPF: above the wage ceiling the EPS share stays ₹1,250", () => {
    const r = run("epf", { basic: 50_000, age: 57, retire: 58, balance: 0, growth: 0, own: 12, rate: 8.25 });
    assert.equal(stat(r, "Employer's contributions"), rs((6000 - 1250) * 12));
  });
  it("NPS splits the corpus and pays a pension on the annuity part", () => {
    const r = run("nps", { monthly: 10_000, age: 59, retire: 60, rate: 10, annuity: 40, annuityRate: 6 });
    const corpus = sipValue(10_000, 10, 12);
    assert.equal(r.headline.value, rs(corpus));
    assert.equal(stat(r, "Monthly pension"), rs((corpus * 0.4 * 6) / 1200));
  });
  it("retirement: zero real return needs expenses × months", () => {
    const r = run("retirement", { age: 59, retire: 60, until: 80, expense: 10_000, inflation: 7, after: 7, saved: 0 });
    near(money(r.headline.value), 10_000 * 1.07 * 240, 2);
  });
  it("ages out of order warn instead of breaking", () => assert.ok(run("retirement", { age: 60, retire: 60 }).warn));
});

describe("income tax", () => {
  const total = (salary: number) => Math.round(newRegime(salary, true).total);
  it("no tax up to ₹12.75 lakh of salary", () => assert.equal(total(1_275_000), 0));
  it("marginal relief just above the rebate", () => assert.equal(total(1_300_000), 26_000));
  it("₹15 lakh of salary", () => assert.equal(total(1_500_000), 97_500));
  it("₹25 lakh of salary", () => {
    // Taxable ₹24.25 lakh: 3,00,000 on the slabs to ₹24 lakh + 7,500 on the rest, then cess.
    assert.equal(total(2_500_000), Math.round((300_000 + 7_500) * 1.04));
  });
  it("no standard deduction without a salary", () => assert.equal(Math.round(newRegime(1_250_000, false).total), 52_000));
  it("old regime: rebate clears tax up to ₹5 lakh taxable", () => assert.equal(oldRegime(550_000, true, "under60", 0).total, 0));
  it("old regime: ₹10 lakh after deductions", () => {
    assert.equal(Math.round(oldRegime(1_250_000, true, "under60", 200_000).total), Math.round(112_500 * 1.04));
  });
  it("old regime: seniors and super seniors start higher", () => {
    const at = (a: string) => oldRegime(1_050_000, true, a, 0).slabTax;
    assert.equal(at("under60"), 112_500);
    assert.equal(at("senior"), 110_000);
    assert.equal(at("super"), 100_000);
  });
  it("surcharge relief at the ₹50 lakh line", () => {
    const line = newRegime(5_000_000, false);
    assert.equal(line.surcharge, 0);
    const over = newRegime(5_010_000, false);
    // ₹10,000 more income can add at most ₹10,000 before cess.
    assert.ok(over.total - line.total <= 10_000 * 1.04 + 1, `${over.total - line.total}`);
    assert.ok(over.surcharge > 0);
  });
  it("new regime surcharge stops at 25%", () => {
    const r = newRegime(100_000_000, false);
    assert.equal(Math.round(r.surcharge), Math.round(r.slabTax * 0.25));
  });
  it("old regime surcharge reaches 37%", () => {
    const r = oldRegime(100_000_000, false, "under60", 0);
    assert.equal(Math.round(r.surcharge), Math.round(r.slabTax * 0.37));
  });
  it("names the cheaper regime", () => {
    assert.equal(run("income-tax", { salary: 1_500_000, inv: 0, health: 0 }).headline.label, "The new regime saves you");
    assert.equal(run("income-tax", { salary: 1_500_000, inv: 150_000, health: 75_000, home: 200_000, hra: 400_000, otherDed: 50_000 }).headline.label, "The old regime saves you");
  });
});

describe("tax on pay and sales", () => {
  it("GST: add 18% within a state", () => {
    const r = run("gst", { amount: 10_000, rate: "18", mode: "add", supply: "intra" });
    assert.equal(r.headline.value, rs(11_800));
    assert.equal(stat(r, "CGST at 9.0%"), rs(900));
  });
  it("GST: take 18% out, across states", () => {
    const r = run("gst", { amount: 11_800, rate: "18", mode: "remove", supply: "inter" });
    assert.equal(r.headline.value, rs(10_000));
    assert.equal(stat(r, "IGST at 18%"), rs(1_800));
  });
  it("HRA takes the lowest of three limits", () => {
    const r = run("hra", { basic: 50_000, hra: 20_000, rent: 18_000, city: "metro" });
    assert.equal(r.headline.value, rs(156_000));
    assert.equal(run("hra", { basic: 50_000, hra: 30_000, rent: 60_000, city: "other" }).headline.value, rs(240_000));
  });
  it("HRA is fully taxable without rent", () => assert.equal(run("hra", { rent: 0 }).headline.value, rs(0)));
  it("gratuity: 15/26 × salary × years", () => assert.equal(run("gratuity", { salary: 26_000, years: 10, months: 0 }).headline.value, rs(150_000)));
  it("gratuity: over six months counts as a year", () => {
    assert.equal(stat(run("gratuity", { years: 10, months: 7 }), "Years counted"), "11");
    assert.equal(stat(run("gratuity", { years: 10, months: 6 }), "Years counted"), "10");
  });
  it("gratuity: not covered uses 30 days and whole years", () => {
    assert.equal(run("gratuity", { salary: 30_000, years: 10, months: 8, covered: "no" }).headline.value, rs(150_000));
  });
  it("gratuity stops at the ceiling", () => assert.equal(run("gratuity", { salary: 500_000, years: 30 }).headline.value, rs(2_000_000)));
  it("gratuity warns under five years", () => assert.ok(run("gratuity", { years: 4, months: 11 }).warn));
});

// The list of calculators: names and one-line descriptions, in menu order. Kept apart from the
// sums and the long copy so that the footer and the index page don't carry either.

export const CATEGORIES = ["Investing", "Loans", "Savings & retirement", "Tax & salary"] as const;
export type Category = (typeof CATEGORIES)[number];

export type CalculatorMeta = { slug: string; title: string; blurb: string; category: Category; terms?: string };

export const META: CalculatorMeta[] = [
  { slug: "sip", title: "SIP calculator", blurb: "What a monthly mutual fund investment could grow to.", category: "Investing", terms: "mutual fund systematic investment plan" },
  { slug: "lumpsum", title: "Lumpsum calculator", blurb: "The future value of money invested in one go.", category: "Investing", terms: "one time mutual fund" },
  { slug: "step-up-sip", title: "Step-up SIP calculator", blurb: "How much raising your SIP each year adds at the end.", category: "Investing", terms: "top-up increase annual" },
  { slug: "swp", title: "SWP calculator", blurb: "How long a corpus lasts if you draw from it every month.", category: "Investing", terms: "systematic withdrawal plan income" },
  { slug: "cagr", title: "CAGR calculator", blurb: "The yearly growth rate between a starting and an ending value.", category: "Investing", terms: "compound annual growth rate stock return" },
  { slug: "compound-interest", title: "Compound interest calculator", blurb: "Interest on interest, at any compounding frequency.", category: "Investing", terms: "ci" },
  { slug: "goal-sip", title: "Goal SIP calculator", blurb: "The monthly SIP that reaches a target amount on time.", category: "Investing", terms: "target education house" },

  { slug: "emi", title: "EMI calculator", blurb: "Monthly instalment, total interest and the repayment schedule.", category: "Loans", terms: "personal loan amortisation amortization" },
  { slug: "home-loan", title: "Home loan calculator", blurb: "EMI on a house, and what prepaying saves you.", category: "Loans", terms: "mortgage housing prepayment" },
  { slug: "car-loan", title: "Car loan calculator", blurb: "EMI on a car, and what the car really costs you.", category: "Loans", terms: "vehicle auto" },

  { slug: "fd", title: "FD calculator", blurb: "Maturity value of a fixed deposit, compounded quarterly.", category: "Savings & retirement", terms: "fixed deposit bank" },
  { slug: "rd", title: "RD calculator", blurb: "Maturity value of a recurring deposit.", category: "Savings & retirement", terms: "recurring deposit bank post office" },
  { slug: "ppf", title: "PPF calculator", blurb: "Your Public Provident Fund balance after 15 years or more.", category: "Savings & retirement", terms: "public provident fund" },
  { slug: "epf", title: "EPF calculator", blurb: "Your provident fund balance by the time you retire.", category: "Savings & retirement", terms: "employees provident fund pf vpf" },
  { slug: "nps", title: "NPS calculator", blurb: "National Pension System corpus, lump sum and monthly pension.", category: "Savings & retirement", terms: "national pension system annuity" },
  { slug: "retirement", title: "Retirement calculator", blurb: "The corpus you need after inflation, and the SIP to build it.", category: "Savings & retirement", terms: "pension fire corpus" },

  { slug: "income-tax", title: "Income tax calculator", blurb: "New regime against old for FY 2026-27, side by side.", category: "Tax & salary", terms: "slab salary tds" },
  { slug: "gst", title: "GST calculator", blurb: "Add GST to a price or take it out, with the CGST and SGST split.", category: "Tax & salary", terms: "goods services tax igst inclusive exclusive" },
  { slug: "hra", title: "HRA calculator", blurb: "How much of your house rent allowance escapes tax.", category: "Tax & salary", terms: "house rent allowance exemption" },
  { slug: "gratuity", title: "Gratuity calculator", blurb: "What your employer owes you when you leave.", category: "Tax & salary", terms: "salary resignation" },
];

export const metaFor = (slug: string) => META.find((m) => m.slug === slug);

// The reading copy under each calculator: what it does, the formula, common questions and where
// to go next on the site. Each figure quoted here comes from the sums in engine.ts.

export type CalculatorCopy = {
  description: string; // the search result snippet
  lede: string;
  how: string[];
  formula: string;
  faq: { q: string; a: string }[];
  next?: { href: string; label: string };
};

export const CONTENT: Record<string, CalculatorCopy> = {
  sip: {
    description: "Work out what a monthly SIP could grow to. Change the amount, return and period and see the value, the gain and a year-by-year table.",
    lede: "Put in a monthly amount, a return and a period to see what a mutual fund SIP could grow to.",
    how: [
      "Each instalment goes in at the start of the month and compounds until the end of the period, so your first instalment works the longest and your last works for one month. The monthly rate is the yearly return divided by 12.",
      "The return you enter is an assumption. Equity funds don't pay a steady rate, so try a low figure as well as a high one and plan around the range.",
    ],
    formula: "Value = P × [((1 + i)ⁿ − 1) ÷ i] × (1 + i), where P is the monthly SIP, i is the yearly return ÷ 12, and n is the number of months.",
    faq: [
      { q: "What return should I assume?", a: "Look at what the kind of fund you have in mind has done over long periods, then use something lower. Testing 8%, 10% and 12% shows how much your plan depends on that one number." },
      { q: "Does this include tax and fund costs?", a: "No. The figure is before capital gains tax. Enter a return after the fund's expense ratio if you want to allow for its costs." },
      { q: "Is it better to stop a SIP when markets fall?", a: "This calculator can't say, as it assumes a steady return. In real markets, a falling market means each instalment buys more units." },
    ],
    next: { href: "/mutual-funds", label: "Compare mutual funds by category and return" },
  },

  lumpsum: {
    description: "Find the future value of a one-time investment at any return and period, with the gain and a yearly table.",
    lede: "See what money invested once could be worth after a number of years.",
    how: ["The whole amount starts compounding on day one, and the return is applied once a year. Comparing this with the SIP calculator shows how much of a SIP's result comes from time in the market."],
    formula: "Value = P × (1 + r)ᵗ, where P is the amount invested, r is the yearly return and t is the number of years.",
    faq: [
      { q: "Lumpsum or SIP?", a: "With the same total and a steady return, a lumpsum ends higher because all of it is invested for longer. A SIP suits money that arrives monthly, and it spreads the price you pay over time." },
      { q: "Does the result allow for inflation?", a: "No. To see the value in today's money, enter the return minus your expected inflation rate." },
    ],
    next: { href: "/mutual-funds", label: "Browse mutual funds" },
  },

  "step-up-sip": {
    description: "See how raising your SIP every year changes your final corpus, and how much more you end up with than a flat SIP.",
    lede: "Raise your SIP as your income grows, and see how much more that builds than a flat SIP.",
    how: ["The monthly amount stays the same for 12 months, then rises by your chosen percentage. Everything else works like a normal SIP, with each instalment compounding monthly from the start of its month."],
    formula: "Each year's SIP = last year's SIP × (1 + step-up). Balance each month = (balance + SIP) × (1 + yearly return ÷ 12).",
    faq: [
      { q: "How much should I raise it by?", a: "A common rule is to match your annual pay rise, so your savings rate holds as your income grows. Even a 5% step-up makes a visible difference over 15 years or more." },
      { q: "Do fund houses let me do this automatically?", a: "Most offer a top-up or step-up option when you set up a SIP. You can also start a second SIP each year for the extra amount." },
    ],
    next: { href: "/calculators/goal-sip", label: "Work out the SIP for a specific goal" },
  },

  swp: {
    description: "Plan monthly withdrawals from a corpus. See how long the money lasts, what is left at the end and a yearly table.",
    lede: "Find out how long a corpus lasts if you take a fixed amount from it every month.",
    how: [
      "Each month the withdrawal comes out first, then what remains earns a month of returns. If the money earned is more than you take, the corpus keeps growing. If not, it shrinks faster every year.",
      "The withdrawal stays flat here. Your costs will rise with inflation, so test a higher withdrawal as well.",
    ],
    formula: "Balance next month = (balance − withdrawal) × (1 + yearly return ÷ 12).",
    faq: [
      { q: "What withdrawal rate is sustainable?", a: "It depends on returns, inflation and how long the money has to last. Compare the 'Withdrawn a year' figure with the return you expect: the further it is above that return, the sooner the money runs out." },
      { q: "How are SWP withdrawals taxed?", a: "Each withdrawal is treated as selling units, so only the gain in it is taxed, at the capital gains rate for that kind of fund. This calculator shows amounts before tax." },
    ],
    next: { href: "/calculators/retirement", label: "Work out the corpus you need to retire" },
  },

  cagr: {
    description: "Calculate the compound annual growth rate between two values, for a stock, a fund or a company's sales and profit.",
    lede: "Turn a starting value, an ending value and a period into one yearly growth rate.",
    how: ["CAGR is the steady yearly rate that would take the starting value to the ending value. It lets you compare things held for different lengths of time. It smooths over every rise and fall along the way, and it assumes no money went in or out in between."],
    formula: "CAGR = (ending value ÷ starting value)^(1 ÷ years) − 1.",
    faq: [
      { q: "When is CAGR the wrong measure?", a: "When you added or took out money along the way, such as with a SIP. Use XIRR for those, because it takes the date of each cash flow into account." },
      { q: "Can I use it on company numbers?", a: "Yes. It works on sales, profit or any other figure, as long as both ends are positive." },
    ],
    next: { href: "/screener", label: "Screen stocks by returns and growth" },
  },

  "compound-interest": {
    description: "Calculate compound interest with yearly, half-yearly, quarterly, monthly or daily compounding, and compare it with simple interest.",
    lede: "See what interest on interest adds up to, at whichever compounding frequency applies.",
    how: ["More frequent compounding means interest starts earning sooner, so the effective yearly rate is above the rate you are quoted. Its effect grows with both the rate and the time."],
    formula: "Value = P × (1 + r ÷ m)^(m × t), where r is the yearly rate, m is the compounding periods a year and t is the number of years.",
    faq: [
      { q: "How much does the frequency matter?", a: "Less than the rate or the time. At 8%, moving from quarterly to monthly lifts the effective rate from 8.24% to 8.30%." },
      { q: "What is the rule of 72?", a: "A shortcut: 72 divided by the rate gives roughly how many years money takes to double. At 8%, that is about nine years." },
    ],
    next: { href: "/calculators/fd", label: "Apply this to a fixed deposit" },
  },

  "goal-sip": {
    description: "Find the monthly SIP you need to reach a target amount by a set date, counting what you have already saved.",
    lede: "Start from the amount you need and work back to the monthly SIP that gets you there.",
    how: [
      "Savings you already have are grown to the goal date first. The monthly SIP then covers the rest, using the same sums as the SIP calculator.",
      "Enter the amount as it will cost then, not as it costs today. A course costing ₹25 lakh now costs about ₹45 lakh in ten years at 6% inflation.",
    ],
    formula: "SIP = (target − savings × (1 + r)ᵗ) ÷ {[((1 + i)ⁿ − 1) ÷ i] × (1 + i)}, where r is the yearly return, i is r ÷ 12 and n is the number of months.",
    faq: [
      { q: "What if the SIP is more than I can afford?", a: "You have three things to change: push the date back, lower the target, or start a smaller SIP and raise it each year with the step-up calculator." },
      { q: "Should I assume equity returns for a short goal?", a: "A goal only a few years away has little time to recover from a fall, so a lower return is safer to plan on." },
    ],
    next: { href: "/calculators/step-up-sip", label: "Try a SIP that rises every year" },
  },

  emi: {
    description: "Calculate the EMI on any loan, with total interest and a year-by-year repayment schedule.",
    lede: "Enter a loan amount, rate and tenure to get the monthly instalment and what the loan costs you in all.",
    how: ["The EMI stays the same each month, but its make-up changes. Early on most of it is interest, because the balance is at its highest. As the balance falls, more of each EMI goes to principal."],
    formula: "EMI = P × i × (1 + i)ⁿ ÷ ((1 + i)ⁿ − 1), where P is the loan, i is the yearly rate ÷ 12 and n is the number of months.",
    faq: [
      { q: "Does this include processing fees?", a: "No. Fees, insurance and other charges are extra, so the true cost is higher than the interest shown here." },
      { q: "Is a longer tenure better?", a: "It lowers the EMI but raises total interest. Compare the 'Total interest' figure at both tenures before you choose." },
      { q: "What about floating rates?", a: "The sums assume one rate throughout. If the rate moves, banks usually change the tenure first, and sometimes the EMI." },
    ],
    next: { href: "/calculators/home-loan", label: "See what prepaying a home loan saves" },
  },

  "home-loan": {
    description: "Work out your home loan EMI from the price and down payment, and see how much paying extra each month saves in interest and time.",
    lede: "Start from the price of the home, then see how paying a little extra each month shortens the loan.",
    how: ["The loan is the price less your down payment. Any extra you enter is paid on top of the EMI, entirely against principal, so interest falls in every month after it. That is why early prepayments save the most."],
    formula: "EMI = P × i × (1 + i)ⁿ ÷ ((1 + i)ⁿ − 1). Each month, interest = balance × i, and the rest of what you pay reduces the balance.",
    faq: [
      { q: "Do banks charge for prepaying?", a: "RBI rules bar prepayment charges on floating-rate home loans to individuals. Fixed-rate loans may carry a charge, so check your agreement." },
      { q: "What else should I budget for?", a: "Stamp duty, registration and any brokerage, which banks usually won't fund. They can add several percent to the price." },
      { q: "Does this show the tax benefit?", a: "No. Under the old regime, interest on a self-occupied home can be deducted up to ₹2 lakh a year. The income tax calculator lets you test that." },
    ],
    next: { href: "/calculators/income-tax", label: "Test the home loan deduction on your tax" },
  },

  "car-loan": {
    description: "Calculate your car loan EMI from the on-road price and down payment, and see what the car costs you with interest.",
    lede: "Find your car EMI, then the number that matters more: what the car costs once interest is added.",
    how: ["The loan is the on-road price less your down payment. The 'Car costs you in all' figure adds the interest to the price, so you can see the cost of a longer tenure or a smaller down payment."],
    formula: "EMI = P × i × (1 + i)ⁿ ÷ ((1 + i)ⁿ − 1), where P is the on-road price less the down payment.",
    faq: [
      { q: "Should I use the ex-showroom or the on-road price?", a: "The on-road price: it includes road tax, registration and insurance, and it is what you actually pay. Check how much of it your lender will fund." },
      { q: "What tenure makes sense?", a: "Cars lose value as you pay. A shorter tenure costs less interest and lowers the chance of owing more than the car is worth." },
    ],
    next: { href: "/calculators/emi", label: "Calculate the EMI on any other loan" },
  },

  fd: {
    description: "Calculate the maturity value of a fixed deposit, with quarterly compounding by default and the effective yearly rate.",
    lede: "See what a fixed deposit pays at maturity, and the real yearly rate behind the one you are quoted.",
    how: ["Most banks compound cumulative FDs quarterly, so a 7% deposit actually earns 7.19% a year. Choose another frequency if your bank's terms differ. Payout FDs, which pay interest out as it falls due, earn less because that interest doesn't compound."],
    formula: "Maturity = P × (1 + r ÷ m)^(m × t), where r is the yearly rate, m is the compounding periods a year and t is the tenure in years.",
    faq: [
      { q: "Is FD interest taxed?", a: "Yes, at your slab rate, and banks deduct TDS above a yearly limit. The maturity value here is before tax." },
      { q: "Do senior citizens get more?", a: "Most banks pay them a little more. Enter the rate your bank quotes for you." },
    ],
    next: { href: "/calculators/rd", label: "Saving monthly? Try the RD calculator" },
  },

  rd: {
    description: "Calculate the maturity value of a recurring deposit from the monthly deposit, rate and tenure, with quarterly compounding.",
    lede: "See what a fixed monthly deposit adds up to at maturity.",
    how: ["Each monthly instalment earns interest from the month it is paid in until maturity, compounded quarterly. So the first instalment earns for the whole tenure and the last for one month. This is the method most Indian banks use. India Post's RD can differ slightly."],
    formula: "Maturity = Σ P × (1 + r ÷ 4)^(4 × tₖ), where tₖ is the time in years that instalment k stays invested.",
    faq: [
      { q: "RD or SIP?", a: "An RD pays a known rate and suits money you'll need soon. A SIP in an equity fund has no fixed return but has a chance of more over long periods. You can compare the two by entering the same amount in each." },
      { q: "What if I miss an instalment?", a: "Banks usually charge a small penalty, and repeated misses can close the account. This calculator assumes every instalment is paid on time." },
    ],
    next: { href: "/calculators/sip", label: "Compare with a monthly SIP" },
  },

  ppf: {
    description: "Project your PPF balance at the current 7.1% rate, over 15 years or with five-year extensions.",
    lede: "See what your Public Provident Fund grows to over its 15 years and any extensions.",
    how: [
      "Interest is worked out monthly on the lowest balance between the 5th and the last day of the month, and credited once a year. These sums assume you deposit the full year's amount by 5 April, which earns the most.",
      "Deposit later in the year and the result will be a little lower. The rate is set every quarter and these sums hold it steady.",
    ],
    formula: "Balance each year = (last year's balance + deposit) × (1 + rate).",
    faq: [
      { q: "How much can I deposit?", a: "From ₹500 to ₹1.5 lakh a financial year." },
      { q: "Can I keep it going after 15 years?", a: "Yes, in blocks of five years, with or without fresh deposits." },
      { q: "Is the interest taxed?", a: "No, PPF interest and the maturity amount are tax free. Under the old regime, deposits also count toward the ₹1.5 lakh deduction." },
    ],
    next: { href: "/calculators/nps", label: "Compare with the NPS" },
  },

  epf: {
    description: "Estimate your EPF corpus at retirement from your basic pay, pay rises and the current 8.25% EPF interest rate.",
    lede: "Project your provident fund balance from your pay today to the day you retire.",
    how: [
      "You pay 12% of basic pay and DA, and so does your employer. Of the employer's share, 8.33% of pay goes to the pension scheme (EPS), up to ₹1,250 a month, and the rest goes to your EPF. This is why the employer's EPF contribution is lower than yours.",
      "These sums assume contributions on your full basic pay. If yours stop at the ₹15,000 wage ceiling, enter ₹15,000 as your pay and 0% as the pay rise.",
    ],
    formula: "Each month: balance + your share + employer's share. Each year: interest = the sum of monthly balances × rate ÷ 12, credited at the end of the year.",
    faq: [
      { q: "Is EPF interest tax free?", a: "Mostly. Interest on your own contributions above ₹2.5 lakh a year is taxable, or above ₹5 lakh where there is no employer contribution." },
      { q: "Does the pension scheme count here?", a: "No. The EPS share is left out, because it pays a pension instead of building your balance." },
    ],
    next: { href: "/calculators/retirement", label: "See if it covers your retirement" },
  },

  nps: {
    description: "Estimate your National Pension System corpus, the lump sum you can take and your monthly pension from the annuity.",
    lede: "Project your NPS corpus, then split it between a lump sum and a monthly pension.",
    how: [
      "Contributions grow until you exit. Then part of the corpus must buy an annuity, which pays your pension, and you can take the rest as a lump sum.",
      "Since December 2025, non-government subscribers with more than ₹12 lakh at normal exit must annuitise at least 20%. Government employees must annuitise 40%. Below ₹8 lakh you can usually take it all. Check the current PFRDA rules before you decide.",
    ],
    formula: "Corpus = SIP sums on your contribution. Lump sum = corpus × (1 − annuity share). Pension a month = corpus × annuity share × annuity rate ÷ 12.",
    faq: [
      { q: "How is the NPS taxed at exit?", a: "Up to 60% of the corpus can be withdrawn tax free, so a larger lump sum may be partly taxable. Annuity income is taxed at your slab rate each year." },
      { q: "What annuity rate is realistic?", a: "Rates vary by insurer, age and the kind of annuity you choose, and those that return your money to your family pay less. Check current quotes as you get close to exit." },
    ],
    next: { href: "/calculators/retirement", label: "See how much you need to retire" },
  },

  retirement: {
    description: "Work out the retirement corpus you need after inflation, and the monthly SIP that builds it.",
    lede: "Start from what you spend today and work out the corpus you need and the SIP that gets you there.",
    how: [
      "Your monthly expenses are grown at inflation to the day you retire. The corpus is what it takes to pay that amount, rising with inflation each year, until the age you plan for, while the balance earns your post-retirement return.",
      "Any savings you have are grown to your retirement date, and the monthly SIP covers the rest. The result moves a lot with inflation, so try a figure one point higher.",
    ],
    formula: "Real return = (1 + return after retiring) ÷ (1 + inflation) − 1. Corpus = the present value of your monthly expenses at that real return.",
    faq: [
      { q: "What inflation should I use?", a: "Your own may run above the headline rate, especially on health costs. 6% is a common starting point, and it's worth testing 7%." },
      { q: "Does it count pension income?", a: "Not directly. Subtract any pension or rent you expect from your monthly expenses first." },
      { q: "How long should I plan for?", a: "Long enough that running out is unlikely. Many people plan to 85 or 90, and longer if their family tends to live longer." },
    ],
    next: { href: "/calculators/swp", label: "Test withdrawals from your corpus" },
  },

  "income-tax": {
    description: "Compare your income tax under the new and old regimes for FY 2026-27 (AY 2027-28), with slabs, rebate, surcharge and cess.",
    lede: "Enter your income and deductions to compare the new and old regimes for FY 2026-27.",
    how: [
      "The new regime has lower slab rates and a ₹75,000 standard deduction, but almost none of the other deductions. There is no tax on taxable income up to ₹12 lakh, so a salary of up to ₹12.75 lakh pays nothing.",
      "The old regime has higher rates, a ₹50,000 standard deduction, and allows deductions such as 80C, health insurance, home loan interest and HRA. It pays off only if those deductions are large enough.",
      "Budget 2026 kept the slabs of the year before. The deductions here go by their familiar names, though the Income-tax Act, 2025 has renumbered the sections.",
    ],
    formula: "Tax = slab tax − rebate + surcharge + 4% cess. New regime slabs: nil to ₹4L, 5% to ₹8L, 10% to ₹12L, 15% to ₹16L, 20% to ₹20L, 25% to ₹24L, 30% above.",
    faq: [
      { q: "Which regime applies if I don't choose?", a: "The new regime is the default. To use the old regime you need to opt for it, and the rules for switching differ for salaried people and for those with business income." },
      { q: "What does this leave out?", a: "Capital gains and other income taxed at special rates, and employer NPS contributions. For those, or for a return you have to file, use a full tax tool or ask a tax professional." },
      { q: "How much in deductions makes the old regime better?", a: "It depends on your income. Move the deduction fields until the headline changes to see your own break-even." },
    ],
    next: { href: "/calculators/hra", label: "Work out your HRA exemption" },
  },

  gst: {
    description: "Add GST to a price or remove it from an inclusive one, at 3%, 5%, 18% or 40%, with the CGST, SGST and IGST split.",
    lede: "Add GST to a price, or take it out of one that already includes it.",
    how: [
      "A sale within a state splits GST equally into CGST and SGST. A sale to another state carries IGST at the full rate.",
      "To take GST out of an inclusive price, divide by (1 + rate). A common slip is to subtract 18% of the final price, which takes out too much.",
    ],
    formula: "Adding: GST = price × rate. Taking out: price before GST = amount ÷ (1 + rate), and GST = amount − that price.",
    faq: [
      { q: "What are the current GST rates?", a: "Since 22 September 2025, the main slabs are 5% and 18%, with 40% on luxury and sin goods. Gold and silver carry 3%, and some goods have special rates or none at all." },
      { q: "Which rate applies to my product?", a: "It depends on its HSN or SAC code. The official GST rate finder on the government's GST portal lists them." },
    ],
  },

  hra: {
    description: "Calculate your HRA tax exemption under the old regime, using the 50% rule now extended to eight cities.",
    lede: "Work out how much of your house rent allowance is free of tax under the old regime.",
    how: [
      "The exempt amount is the lowest of three limits: the HRA you receive, your rent less 10% of basic pay and DA, and a share of basic pay and DA that depends on your city.",
      "From 1 April 2026 the 50% share applies to Mumbai, Delhi, Kolkata, Chennai, Bengaluru, Hyderabad, Pune and Ahmedabad. Other cities get 40%. The new regime gives no HRA exemption at all.",
    ],
    formula: "Exempt HRA = the lowest of (HRA received), (rent − 10% of basic + DA), and (50% or 40% of basic + DA).",
    faq: [
      { q: "Can I claim HRA if I pay rent to my parents?", a: "You can, if the arrangement is genuine: they own the home, you pay them, and they declare the rent as income. You also need to disclose your relationship to the landlord." },
      { q: "What if I don't get HRA from my employer?", a: "This exemption won't apply. A separate deduction exists for people who pay rent without receiving HRA, with its own limits." },
    ],
    next: { href: "/calculators/income-tax", label: "See which tax regime is better for you" },
  },

  gratuity: {
    description: "Calculate the gratuity payable when you leave a job, from your last salary and years of service.",
    lede: "Work out the gratuity you are due from your last salary and your years of service.",
    how: [
      "For employers covered by the law, gratuity is 15 days' wages for each year of service, and a month counts as 26 working days. Service of more than six months in the final year counts as a full year.",
      "Employers not covered may still pay it. For them the usual sum uses a 30-day month and counts completed years only. The ceiling is ₹20 lakh.",
      "The labour codes count wages more broadly than basic pay and DA, so your figure may be higher if allowances make up over half of your pay. Ask your employer how yours is worked out.",
    ],
    formula: "Gratuity = last monthly basic + DA × 15 × years of service ÷ 26 (or ÷ 30 if the employer is not covered).",
    faq: [
      { q: "How long do I have to work to get it?", a: "Generally five years of continuous service. Fixed-term employees qualify after one year, and the five-year condition doesn't apply on death or disablement." },
      { q: "Is gratuity taxed?", a: "For most private-sector employees, up to ₹20 lakh in a lifetime is exempt. Anything above it is taxed as salary." },
    ],
    next: { href: "/calculators/retirement", label: "Plan what comes after your job" },
  },
};

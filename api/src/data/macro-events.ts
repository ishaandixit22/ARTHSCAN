// Scheduled economic events that move Indian markets, each taken from the
// publisher's own calendar (linked in `url`). Update this list when a new
// schedule is published: the RBI announces next year's MPC dates each March,
// MoSPI its Advance Release Calendar each February, the Fed each summer.
//
// Dates are India dates. A US Fed decision lands in India the next morning, so
// it is listed on the day Indian markets first trade on it.

export type MacroEvent = {
  date: string;              // YYYY-MM-DD, India
  title: string;
  detail: string;
  impact: "high" | "medium";
  source: string;
  url: string;
};

const RBI = { source: "RBI: Meeting Schedule of the MPC for 2026-27 (23 Mar 2026)", url: "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=62422" };
const FED = { source: "Federal Reserve: FOMC meeting calendars", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" };
const MOSPI = {
  source: "MoSPI: Advance Release Calendar 2026-27 (updated 25 May 2026)",
  url: "https://www.mospi.gov.in/uploads/documents/releaseCalender/1779709510470-ADVANCE%20RELEASE%20CALENDAR%202026-27%20Updated%2025.05.2026.pdf",
};
const MOSPI_NOTE = " MoSPI releases on the next working day if this date is a holiday.";

const rbi = (date: string, days: string): MacroEvent => ({
  date, title: "RBI monetary policy decision", impact: "high", ...RBI,
  detail: `The Monetary Policy Committee meets on ${days} and announces the repo rate and its stance on the last day. Moves rate-sensitive stocks: banks, NBFCs, real estate, autos.`,
});
const fed = (date: string, days: string, projections: boolean): MacroEvent => ({
  date, title: "US Fed (FOMC) rate decision", impact: "high", ...FED,
  detail: `The FOMC meets ${days} (US time); the decision reaches Indian markets on this morning.${projections ? " Comes with the Fed's economic projections." : ""} Moves FII flows, the rupee and IT stocks.`,
});
const cpi = (date: string, month: string): MacroEvent => ({
  date, title: "India CPI inflation", impact: "high", ...MOSPI,
  detail: `All-India consumer price inflation for ${month}, at 4 pm. The RBI's main input for rate decisions.${MOSPI_NOTE}`,
});
const iip = (date: string, month: string): MacroEvent => ({
  date, title: "India industrial production (IIP)", impact: "medium", ...MOSPI,
  detail: `Index of Industrial Production for ${month}, at 4 pm. Read by capital goods, metals and manufacturing stocks.${MOSPI_NOTE}`,
});

export const MACRO_EVENTS: MacroEvent[] = [
  rbi("2026-12-04", "2–4 December 2026"),
  rbi("2027-02-05", "3–5 February 2027"),
  fed("2026-12-10", "8–9 December 2026", true),
  fed("2027-01-28", "26–27 January 2027", false),
  fed("2027-03-18", "16–17 March 2027", true),
  fed("2027-04-29", "27–28 April 2027", false),
  cpi("2026-11-12", "October 2026"),
  cpi("2026-12-12", "November 2026"),
  cpi("2027-01-12", "December 2026"),
  cpi("2027-02-12", "January 2027"),
  cpi("2027-03-12", "February 2027"),
  iip("2026-11-28", "October 2026"),
  iip("2026-12-28", "November 2026"),
  iip("2027-01-28", "December 2026"),
  iip("2027-02-28", "January 2027"),
  iip("2027-03-28", "February 2027"),
  {
    date: "2026-11-30", title: "India GDP, July–September quarter", impact: "high", ...MOSPI,
    detail: `Quarterly GDP estimate for Q2 FY 2026-27.${MOSPI_NOTE}`,
  },
  {
    date: "2027-01-07", title: "India GDP first advance estimate, FY 2026-27", impact: "high", ...MOSPI,
    detail: `MoSPI's first estimate of full-year growth; it feeds the Union Budget's numbers.${MOSPI_NOTE}`,
  },
  {
    date: "2027-02-26", title: "India GDP, October–December quarter", impact: "high", ...MOSPI,
    detail: `Q3 FY 2026-27 GDP with the second advance estimate for the year.${MOSPI_NOTE}`,
  },
];

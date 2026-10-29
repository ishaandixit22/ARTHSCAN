// Whether NSE's equity session is on (9:15 am – 3:30 pm IST on weekdays, plus a
// short grace after the close), rechecked every minute in the browser. Live
// quotes are shown only while it's on: after the close the feed's "previous
// close" rolls over to today's close and every change would read 0%. The API
// also checks exchange holidays for its market-wide views.

export function sessionOpen(now = Date.now()): boolean {
  const d = new Date(now + 5.5 * 3600_000);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const day = d.getUTCDay();
  return day >= 1 && day <= 5 && minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 45;
}

export const session = $state({ open: sessionOpen() });

if (typeof window !== "undefined") setInterval(() => (session.open = sessionOpen()), 60_000);

// How the IPO pages name a draft filed with SEBI.

export const DOC_NAME: Record<string, string> = {
  DRHP: "Draft Red Herring Prospectus",
  UDRHP: "Updated Draft Red Herring Prospectus",
};

/** A logo looked up by the website the company's own prospectus gives. IpoLogo shows its first letter when there is none. */
export const filingLogo = (website: string | null | undefined, key: string | null | undefined, size: number) =>
  website && key ? `https://img.logo.dev/${encodeURIComponent(website)}?token=${key}&size=${size * 2}&format=webp&fallback=404` : null;

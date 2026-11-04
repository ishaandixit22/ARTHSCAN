import { error } from "@sveltejs/kit";
import { metaFor } from "$lib/calculators/catalog";

export function load({ params }) {
  const meta = metaFor(params.slug);
  if (!meta) error(404, "There's no calculator here.");
  return { meta };
}

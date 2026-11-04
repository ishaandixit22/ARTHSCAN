// The prebuilt screens for the website.
//   GET /api/screens         every screen, with stored counts
//   GET /api/screens/:slug   one screen, how fresh its answer is, and a page of results

import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { jsonError } from "../lib/http.js";
import { describeScreen, SCREENS, screenBySlug } from "../screens/catalogue.js";
import { answerFor, type ResultRow, storedCounts } from "../screens/run.js";

export const screens = new Hono<AppEnv>();

const PAGE = 50;

screens.get("/", async (c) => {
  const counts = await storedCounts(c.env).catch(() => new Map<string, { total: number; as_of: string }>());
  return c.json({
    screens: SCREENS.map((s) => ({
      slug: s.slug, name: s.name, description: s.description, segment: s.segment, group: s.group, subsegment: s.subsegment,
      kind: s.kind, direction: s.direction, timeframe: s.timeframe, universe: s.universe,
      total: counts.get(s.id)?.total ?? null, as_of: counts.get(s.id)?.as_of ?? null,
    })),
  });
});

screens.get("/:slug", async (c) => {
  const screen = screenBySlug(c.req.param("slug"));
  if (!screen) return jsonError(c, 404, "E_NOT_FOUND", "No such screen.");
  const info = describeScreen(screen);
  if (c.req.query("only") === "info") return c.json({ screen: info });
  const answer = await answerFor(c.env, screen).catch((err) => {
    console.error(`screen ${screen.id}:`, err);
    return null;
  });
  if (!answer) return c.json({ screen: info, freshness: null, total: 0, checked: 0, page: 1, pages: 0, results: [] });

  const sort = c.req.query("sort") ?? "mcap";
  const dir = c.req.query("dir") === "asc" ? 1 : -1;
  const col = /^v(\d+)$/.exec(sort);
  const read = (r: ResultRow): number | string | null => col ? r.values[Number(col[1])] ?? null : sort === "symbol" ? r.symbol : sort === "price" ? r.price : sort === "change" ? r.change_pct : r.mcap;
  const rows = [...answer.rows].sort((a, b) => {
    const x = read(a), y = read(b);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * dir;
  });
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  return c.json({
    screen: info, freshness: answer.freshness, total: rows.length, checked: answer.checked,
    page, pages: Math.ceil(rows.length / PAGE), results: rows.slice((page - 1) * PAGE, page * PAGE),
  });
});

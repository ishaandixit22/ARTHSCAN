// The sector rotation map: each NSE sector index placed on a four-quadrant plane against
// Nifty 50 or Nifty 500, through one of four lenses (see lib/rotation.ts for the maths).
// Built from the daily index history in index_daily; the answer includes a markdown
// rendering of itself so an assistant reading it over MCP gets the lens, the axes and
// every sector's numbers in one block.

import { type Bar, BENCHMARKS, buildMatrix, LENSES, type LensKey, matrixMarkdown, SECTOR_INDICES, type SizeBy, type Timeframe } from "../lib/rotation.js";
import type { Tool } from "./tools.js";

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(String(v) as T) ? (String(v) as T) : fallback);

export const ROTATION_TOOLS: Tool[] = [
  {
    name: "get_sector_matrix",
    route: "/market/sector-matrix",
    title: "Sector rotation map",
    description: "Where each NSE sector index sits against a benchmark, on a 100-centred four-quadrant plane, through a chosen lens: classic (relative strength vs its momentum), trend (trend quality vs acceleration), risk (downside-adjusted alpha vs its momentum) or volume (volume-backed strength vs relative volume). Returns each sector's X and Y, its last 8 periods, its 4-period change and quadrant, plus the lens' axis definitions and a markdown table.",
    inputSchema: {
      type: "object",
      properties: {
        lens: { type: "string", enum: Object.keys(LENSES), description: "Default classic" },
        benchmark: { type: "string", enum: Object.keys(BENCHMARKS), description: "Default nifty50" },
        timeframe: { type: "string", enum: ["weekly", "daily"], description: "Default weekly" },
        size: { type: "string", enum: ["uniform", "rvol", "volatility", "velocity"], description: "What bubble size encodes (0..1 in the answer). Default uniform" },
      },
    },
    metered: true,
    handler: async (db, args) => {
      const lens = pick<LensKey>(args.lens, Object.keys(LENSES) as LensKey[], "classic");
      const benchmark = pick(args.benchmark, Object.keys(BENCHMARKS), "nifty50");
      const timeframe = pick<Timeframe>(args.timeframe, ["weekly", "daily"], "weekly");
      const size = pick<SizeBy>(args.size, ["uniform", "rvol", "volatility", "velocity"], "uniform");
      const names = [...Object.keys(SECTOR_INDICES), ...Object.values(BENCHMARKS).map((b) => b.name)];
      // Weekly needs about three years of history, daily about one and a half.
      const { results } = await db.prepare(`SELECT index_name, date, open, high, low, close, volume FROM index_daily
        WHERE index_name IN (SELECT value FROM json_each(?)) AND date >= date((SELECT MAX(date) FROM index_daily), ?) AND close IS NOT NULL
        ORDER BY index_name, date`).bind(JSON.stringify(names), timeframe === "weekly" ? "-1400 days" : "-600 days").all<Bar & { index_name: string }>();
      const byIndex = new Map<string, Bar[]>();
      for (const { index_name, ...bar } of results) byIndex.set(index_name, [...(byIndex.get(index_name) ?? []), bar]);
      const matrix = buildMatrix(byIndex, lens, benchmark, timeframe, size);
      return { ...matrix, markdown: matrixMarkdown(matrix) };
    },
  },
];

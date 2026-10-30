<script lang="ts" module>
  export type CityStock = { symbol: string; name: string; sector: string; change: number | null; close: number | null; turnover: number };

  type Tower = { s: CityStock; x: number; z: number; h: number; w: number; delay: number };
  type District = { sector: string; x: number; z: number; top: number; count: number };

  /** A tower's height from the day's move: up out of the ground for gains, down for losses. */
  const height = (c: number | null) => (c == null ? 0.08 : Math.sign(c || 1) * (0.2 + Math.min(Math.abs(c), 8) * 0.8));

  /** Sectors become districts (a near-square block of towers each), packed in shelves into one square-ish city. */
  export function plan(stocks: CityStock[]): { towers: Tower[]; districts: District[]; radius: number } {
    const bySector = new Map<string, CityStock[]>();
    for (const s of stocks) bySector.set(s.sector || "Other", [...(bySector.get(s.sector || "Other") ?? []), s]);
    const blocks = [...bySector.entries()]
      .map(([sector, list]) => {
        const cols = Math.ceil(Math.sqrt(list.length));
        return { sector, list: list.sort((a, b) => b.turnover - a.turnover), cols, rows: Math.ceil(list.length / cols) };
      })
      .sort((a, b) => b.rows - a.rows || b.list.length - a.list.length);

    const GAP = 1.4;
    const area = blocks.reduce((a, b) => a + (b.cols + GAP) * (b.rows + GAP), 0);
    const shelfW = Math.sqrt(area) * 1.15;
    const maxTurnover = Math.max(1, ...stocks.map((s) => s.turnover));
    const towers: Tower[] = [];
    const districts: District[] = [];
    let x = 0, z = 0, shelfH = 0;
    for (const b of blocks) {
      if (x > 0 && x + b.cols > shelfW) { x = 0; z += shelfH + GAP; shelfH = 0; }
      let top = 0;
      b.list.forEach((s, i) => {
        const h = height(s.change);
        top = Math.max(top, h);
        towers.push({ s, x: x + (i % b.cols) + 0.5, z: z + Math.floor(i / b.cols) + 0.5, h, w: 0.5 + 0.36 * Math.sqrt(s.turnover / maxTurnover), delay: 0 });
      });
      districts.push({ sector: b.sector, x: x + b.cols / 2, z: z + b.rows / 2, top, count: b.list.length });
      x += b.cols + GAP;
      shelfH = Math.max(shelfH, b.rows);
    }
    // Centre the city on the origin; towers rise from the middle outwards.
    const minX = Math.min(...towers.map((t) => t.x)), maxX = Math.max(...towers.map((t) => t.x));
    const minZ = Math.min(...towers.map((t) => t.z)), maxZ = Math.max(...towers.map((t) => t.z));
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    let radius = 1;
    for (const t of towers) { t.x -= cx; t.z -= cz; radius = Math.max(radius, Math.hypot(t.x, t.z)); }
    for (const d of districts) { d.x -= cx; d.z -= cz; }
    districts.sort((a, b) => b.count - a.count);
    for (const t of towers) t.delay = 0.1 + (Math.hypot(t.x, t.z) / radius) * 0.9 + Math.random() * 0.15;
    return { towers, districts, radius };
  }
</script>

<script lang="ts">
  // The Nifty 100 as a city, drawn with WebGL2. Each tower is a company:
  // gainers rise out of the ground, losers sink below it, height is the size of
  // the day's move and footprint its turnover. Sectors are districts.
  // Drag to turn it, hover a tower to read it, click to open the stock.
  // No library: one instanced box, one ground quad, ~6 KB of code.
  import { goto } from "$app/navigation";
  import { onMount, untrack } from "svelte";
  import { pct, price } from "$lib/format";
  import { theme } from "$lib/theme.svelte";

  let { stocks, label }: { stocks: CityStock[]; label: string } = $props();

  let host: HTMLDivElement;
  let canvas = $state() as HTMLCanvasElement;
  let failed = $state(false);
  // Svelte state changes only when the hovered tower changes; positions are written straight to the DOM each frame.
  let hover = $state<CityStock | null>(null);
  let tip = $state<HTMLDivElement>();
  const tagEls: HTMLSpanElement[] = [];
  let grabbing = $state(false);

  // The layout is fixed at first render so towers don't jump between plots; live prices
  // (a new `stocks` with the same symbols) only change heights, colours and the tooltip.
  const city = plan(untrack(() => stocks));
  const now = $derived(new Map(stocks.map((s) => [s.symbol, s])));
  const cur = (s: CityStock) => now.get(s.symbol) ?? s;

  // NSE's sector names are long; a district label needs the name people say.
  const SHORT: Record<string, string> = {
    "Financial Services": "Finance", "Fast Moving Consumer Goods": "FMCG", "Automobile and Auto Components": "Auto",
    "Information Technology": "IT", "Oil Gas & Consumable Fuels": "Oil & gas", "Construction Materials": "Cement",
    "Metals & Mining": "Metals", "Telecommunication": "Telecom", "Consumer Durables": "Durables", "Consumer Services": "Consumer",
  };
  const short = (s: string) => SHORT[s] ?? s;

  // ---- small matrix kit (column-major, like GL) ----
  type V3 = [number, number, number];
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function perspective(fovy: number, aspect: number, near: number, far: number) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(e: V3, t: V3) {
    const z = norm(sub(e, t)), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
  }
  function mul(a: number[], b: number[]) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  }

  // A unit box standing on the ground: x,z in [-0.5, 0.5], y in [0, 1].
  function box() {
    const faces: [V3, V3, V3][] = [ // normal, u axis, v axis
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    const out: number[] = [];
    for (const [n, u, v] of faces) {
      const c: V3 = [n[0] * 0.5, 0.5 + n[1] * 0.5, n[2] * 0.5];
      const p = (a: number, b: number) => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b, c[2] + u[2] * a + v[2] * b, ...n];
      out.push(...p(-0.5, -0.5), ...p(0.5, -0.5), ...p(0.5, 0.5), ...p(-0.5, -0.5), ...p(0.5, 0.5), ...p(-0.5, 0.5));
    }
    return new Float32Array(out);
  }

  const TOWER_VS = `#version 300 es
  layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal;
  layout(location=2) in vec4 aInst; layout(location=3) in vec3 aColor; layout(location=4) in float aDelay;
  uniform mat4 uViewProj; uniform float uTime; uniform float uHover;
  out vec3 vNormal; out vec3 vColor; out vec3 vLocal; out vec3 vWorld; out float vHot;
  void main() {
    float g = clamp((uTime - aDelay) / 1.1, 0.0, 1.0);
    g = 1.0 - pow(1.0 - g, 3.0);
    float h = aInst.z * g;
    float hot = float(gl_InstanceID) == uHover ? 1.0 : 0.0;
    vec3 p = vec3(aPos.x * aInst.w, aPos.y * h + hot * 0.18 * sign(aInst.z), aPos.z * aInst.w);
    vWorld = p + vec3(aInst.x, 0.0, aInst.y);
    vNormal = vec3(aNormal.x, aNormal.y * (h < 0.0 ? -1.0 : 1.0), aNormal.z);
    vLocal = aPos; vColor = aColor; vHot = hot;
    gl_Position = uViewProj * vec4(vWorld, 1.0);
  }`;
  const TOWER_FS = `#version 300 es
  precision highp float;
  in vec3 vNormal; in vec3 vColor; in vec3 vLocal; in vec3 vWorld; in float vHot;
  uniform vec3 uLight; uniform vec3 uBg; uniform vec3 uEdge; uniform vec3 uEye; uniform vec2 uFog;
  out vec4 o;
  float edge(float d) { return 1.0 - clamp(d / max(fwidth(d), 1e-4) - 0.5, 0.0, 1.0); }
  void main() {
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, uLight), 0.0);
    vec3 c = vColor * (0.38 + 0.62 * diff);
    float dx = 0.5 - abs(vLocal.x), dz = 0.5 - abs(vLocal.z), dy = min(vLocal.y, 1.0 - vLocal.y);
    float e = abs(n.y) > 0.5 ? max(edge(dx), edge(dz)) : abs(n.x) > 0.5 ? max(edge(dz), edge(dy)) : max(edge(dx), edge(dy));
    c *= 0.72 + 0.28 * vLocal.y;
    c = mix(c, uEdge, e * 0.55);
    c = mix(c, c * 1.35 + 0.08, vHot);
    float fog = smoothstep(uFog.x, uFog.y, distance(vWorld, uEye));
    o = vec4(mix(c, uBg, fog * 0.85), 1.0);
  }`;
  const GROUND_VS = `#version 300 es
  layout(location=0) in vec2 aPos;
  uniform mat4 uViewProj; uniform float uSize;
  out vec2 vXZ;
  void main() { vXZ = aPos * uSize; gl_Position = uViewProj * vec4(vXZ.x, -0.02, vXZ.y, 1.0); }`;
  const GROUND_FS = `#version 300 es
  precision highp float;
  in vec2 vXZ; uniform vec3 uBg; uniform vec3 uEdge; uniform float uRadius;
  out vec4 o;
  void main() {
    vec2 g = abs(fract(vXZ) - 0.5) / fwidth(vXZ);
    float line = 1.0 - clamp(min(g.x, g.y) - 0.5, 0.0, 1.0);
    float r = length(vXZ);
    float a = 0.5 * (1.0 - smoothstep(uRadius * 0.9, uRadius * 1.7, r));
    vec3 c = mix(uBg, uEdge, line * 0.07 * (1.0 - smoothstep(0.0, uRadius * 1.5, r)));
    o = vec4(c * a, a);
  }`;

  function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
    const p = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
    return p;
  }

  /** Any CSS colour (a custom property's value) → [r, g, b] in 0..1. */
  function rgb(name: string): V3 {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
    const hex = ctx.fillStyle;
    if (hex.startsWith("#")) return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as V3;
    const m = hex.match(/[\d.]+/g)!.map(Number);
    return [m[0] / 255, m[1] / 255, m[2] / 255];
  }

  onMount(() => {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) { failed = true; return; }
    let towerProg: WebGLProgram, groundProg: WebGLProgram;
    try {
      towerProg = compile(gl, TOWER_VS, TOWER_FS);
      groundProg = compile(gl, GROUND_VS, GROUND_FS);
    } catch {
      failed = true;
      return;
    }
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { towers, districts, radius } = city;

    // Tower geometry: one box, one instance per company.
    const towerVao = gl.createVertexArray()!;
    gl.bindVertexArray(towerVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, box(), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    const inst = new Float32Array(towers.flatMap((t) => [t.x, t.z, t.h, t.w, t.delay]));
    const instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 20, 0); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 20, 16); gl.vertexAttribDivisor(4, 1);
    const colorBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(3, 1);

    const groundVao = gl.createVertexArray()!;
    gl.bindVertexArray(groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
    const tu = { vp: U(towerProg, "uViewProj"), time: U(towerProg, "uTime"), hover: U(towerProg, "uHover"), light: U(towerProg, "uLight"), bg: U(towerProg, "uBg"), edge: U(towerProg, "uEdge"), eye: U(towerProg, "uEye"), fog: U(towerProg, "uFog") };
    const gu = { vp: U(groundProg, "uViewProj"), size: U(groundProg, "uSize"), bg: U(groundProg, "uBg"), edge: U(groundProg, "uEdge"), radius: U(groundProg, "uRadius") };

    // Colours follow the theme: green and red by the size of the move, faded toward grey for small ones.
    let palette = { bg: [0, 0, 0] as V3, edge: [1, 1, 1] as V3 };
    function paint() {
      const up = rgb("--up"), down = rgb("--down"), flat = rgb("--ink-3");
      palette = { bg: rgb("--bg"), edge: rgb("--ink") };
      const cols = towers.flatMap((tw) => {
        const s = cur(tw.s);
        if (s.change == null || s.change === 0) return flat;
        const t = 0.35 + 0.65 * Math.min(Math.abs(s.change) / 4, 1);
        const to = s.change > 0 ? up : down;
        return [0, 1, 2].map((i) => flat[i] + (to[i] - flat[i]) * t);
      });
      gl!.bindBuffer(gl!.ARRAY_BUFFER, colorBuf);
      gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(cols), gl!.STATIC_DRAW);
    }
    paint();

    // Camera: orbiting, pitched down at the city; drag turns it, and it keeps a little spin after you let go.
    let yaw = 0.6, pitch = 0.5, spin = still ? 0 : 0.07, velocity = 0;
    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = host.clientWidth; h = host.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let pointer: { x: number; y: number } | null = null;
    let drag: { x: number; y: number; moved: number; at: number } | null = null;
    let hot = -1;
    let viewProj: number[] = [];
    const now = () => performance.now() / 1000;
    const start = now();
    let last = start;

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const setHot = (i: number) => {
      if (i === hot) return;
      hot = i;
      hover = i >= 0 ? cur(towers[i].s) : null;
    };
    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, moved: 0, at: now() };
      velocity = 0;
      grabbing = true;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      pointer = local(e);
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      yaw -= dx * 0.006; velocity = -dx * 0.006 * 60;
      pitch = Math.min(1.2, Math.max(0.22, pitch + dy * 0.004));
      drag.x = e.clientX; drag.y = e.clientY; drag.at = now();
    };
    const onUp = (e: PointerEvent) => {
      if (drag && drag.moved < 6) {
        // A tap or click: pick under the finger now (touch has no hover to rely on).
        const p = local(e);
        const i = pick(p.x, p.y);
        if (i >= 0) goto(`/stock/${encodeURIComponent(towers[i].s.symbol)}`);
        velocity = 0;
      } else if (drag && now() - drag.at > 0.08) velocity = 0; // held still before letting go: no fling
      drag = null; grabbing = false;
      if (e.pointerType !== "mouse") { pointer = null; setHot(-1); }
    };
    const onLeave = () => { if (!drag) { pointer = null; setHot(-1); } };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", () => { drag = null; grabbing = false; pointer = null; setHot(-1); });
    canvas.addEventListener("pointerleave", onLeave);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(host);

    const project = (p: V3) => {
      const m = viewProj;
      const cx = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
      const cy = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
      const cw = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
      return { x: (cx / cw * 0.5 + 0.5) * w, y: (1 - (cy / cw * 0.5 + 0.5)) * h, depth: cw };
    };
    const grow = (t: number, delay: number) => {
      const g = Math.min(1, Math.max(0, (t - delay) / 1.1));
      return 1 - (1 - g) ** 3;
    };
    const FOV = 0.5;
    let age = 0;
    /** The front-most tower under a point: each tower is tested as its whole projected column, base to top. */
    function pick(px: number, py: number) {
      if (!viewProj.length) return -1;
      const focal = h / 2 / Math.tan(FOV / 2);
      let best = -1, bestDepth = Infinity;
      towers.forEach((tw, i) => {
        const top = tw.h * grow(age, tw.delay);
        const a = project([tw.x, 0, tw.z]), b = project([tw.x, top, tw.z]);
        const half = Math.max(5, ((tw.w * 0.5) * focal) / Math.max(a.depth, 0.1)) + 2;
        const vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy || 1;
        const t = Math.min(1, Math.max(0, ((px - a.x) * vx + (py - a.y) * vy) / len2));
        const d = Math.hypot(px - (a.x + vx * t), py - (a.y + vy * t));
        const depth = a.depth + (b.depth - a.depth) * t;
        if (d <= half && depth < bestDepth) { best = i; bestDepth = depth; }
      });
      return best;
    }

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = now();
      const dt = Math.min(0.05, t - last);
      last = t;
      if (!visible || document.hidden || !w || !h) return;
      age = still ? 99 : t - start;

      if (!drag) {
        velocity *= 0.94;
        yaw += (hot >= 0 ? 0 : spin) * dt + velocity * dt * 0.4;
      }
      const fov = FOV;
      const dist = (radius * 0.88) / Math.sin(fov / 2) / Math.min(1, (w / h) * 0.95);
      const eye: V3 = [Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist];
      viewProj = mul(perspective(fov, w / h, 0.5, dist * 3), lookAt(eye, [0, 0.4, 0]));

      if (pointer && !drag) setHot(pick(pointer.x, pointer.y));
      if (tip && pointer) {
        // Keep the card inside the scene: flip it left/up near the right or bottom edge.
        const fx = pointer.x > w - 260 ? "calc(-100% - 28px)" : "0px";
        const fy = pointer.y > h - 130 ? "calc(-100% - 28px)" : "0px";
        tip.style.transform = `translate(${pointer.x}px, ${pointer.y}px) translate(${fx}, ${fy})`;
      }

      // District names: biggest first, and a name that would sit on top of one already placed stays hidden.
      const placed: { x: number; y: number; half: number }[] = [];
      districts.forEach((d, i) => {
        const el = tagEls[i];
        if (!el) return;
        const p = project([d.x, Math.max(0, d.top * grow(age, 0.6)) + 0.7, d.z]);
        const half = short(d.sector).length * 3.6 + 6;
        let on = hot < 0 && d.count >= 3 && p.x > half && p.x < w - half && p.y > 14 && p.y < h - 10;
        if (on && placed.some((q) => Math.abs(q.x - p.x) < q.half + half && Math.abs(q.y - p.y) < 18)) on = false;
        if (on) placed.push({ x: p.x, y: p.y, half });
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
        el.classList.toggle("on", on);
      });

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);

      gl.useProgram(towerProg);
      gl.uniformMatrix4fv(tu.vp, false, viewProj);
      gl.uniform1f(tu.time, age);
      gl.uniform1f(tu.hover, hot);
      gl.uniform3fv(tu.light, norm([0.45, 0.85, 0.35]));
      gl.uniform3fv(tu.bg, palette.bg);
      gl.uniform3fv(tu.edge, palette.edge);
      gl.uniform3fv(tu.eye, eye);
      gl.uniform2f(tu.fog, dist * 0.7, dist * 1.6);
      gl.bindVertexArray(towerVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, towers.length);

      // The ground is drawn last and half-clear, so the fallen towers show through it, dimmed.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.useProgram(groundProg);
      gl.uniformMatrix4fv(gu.vp, false, viewProj);
      gl.uniform1f(gu.size, radius * 2.2);
      gl.uniform1f(gu.radius, radius);
      gl.uniform3fv(gu.bg, palette.bg);
      gl.uniform3fv(gu.edge, palette.edge);
      gl.bindVertexArray(groundVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    };
    frame();

    // Repaint the towers when the theme changes.
    const stopTheme = $effect.root(() => {
      $effect(() => {
        theme.current;
        requestAnimationFrame(paint);
      });
    });

    // Live prices: raise or sink each tower to its new move, at most once a frame.
    let moved = 0;
    const stopLive = $effect.root(() => {
      $effect(() => {
        now;
        if (moved) return;
        moved = requestAnimationFrame(() => {
          moved = 0;
          towers.forEach((t, i) => (inst[i * 5 + 2] = t.h = height(cur(t.s).change)));
          gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst);
          paint();
          if (hover) hover = cur(hover);
        });
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      stopTheme();
      stopLive();
      cancelAnimationFrame(moved);
    };
  });
</script>

<div class="city" bind:this={host} class:grabbing>
  {#if failed}
    <div class="flat" role="img" aria-label={label}>
      {#each city.towers as t (t.s.symbol)}
        {@const s = cur(t.s)}
        <a href="/stock/{encodeURIComponent(s.symbol)}" class={s.change == null ? "" : s.change > 0 ? "up" : "down"} title="{s.symbol} {pct(s.change)}"></a>
      {/each}
    </div>
  {:else}
    <canvas bind:this={canvas} aria-label={label}></canvas>
    {#each city.districts as d, i (d.sector)}
      <span class="tag" bind:this={tagEls[i]}>{short(d.sector)}</span>
    {/each}
    {#if hover}
      <div class="tip" bind:this={tip}>
        <b>{hover.symbol}</b>
        <span class="nm">{hover.name}</span>
        <span class="row"><span>{price(hover.close)}</span><span class={hover.change == null ? "" : hover.change > 0 ? "up" : "down"}>{pct(hover.change)}</span></span>
        <small>Click to open</small>
      </div>
    {/if}
  {/if}
</div>

<style>
  .city { position: relative; width: 100%; height: 100%; min-height: 320px; overflow: hidden; }
  /* Out of flow: the canvas's own pixel size must never feed back into the box that sizes it. */
  canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; cursor: grab; touch-action: pan-y; }
  .grabbing canvas { cursor: grabbing; }
  /* District names are set like a map's place labels: condensed capitals in ink. */
  .tag {
    position: absolute; left: 0; top: 0; pointer-events: none; white-space: nowrap;
    font: 800 11.5px var(--font); font-stretch: 72%; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink);
    text-shadow: 0 0 4px var(--bg), 0 0 2px var(--bg), 0 0 1px var(--bg);
    opacity: 0; transition: opacity 0.3s var(--ease);
  }
  .tag:global(.on) { opacity: 1; }
  /* The hover card is a small printed inset: a heavy rule on top, ruled below. */
  .tip {
    position: absolute; left: 0; top: 0; pointer-events: none; z-index: 2; margin: 14px 0 0 14px;
    display: grid; gap: 2px; min-width: 180px; max-width: 250px; padding: 8px 12px 10px;
    background: var(--bg); border-top: var(--rule-heavy); border-bottom: 1px solid var(--ink); box-shadow: var(--float);
    font-size: 13px; animation: tip-in 0.15s var(--ease) both;
  }
  @keyframes tip-in { from { opacity: 0; } }
  .tip b { font: 850 17px var(--display); font-stretch: 68%; letter-spacing: 0.01em; }
  .nm { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--serif); font-size: 13px; }
  .row { display: flex; justify-content: space-between; gap: 12px; margin-top: 4px; font-weight: 700; font-stretch: 82%; }
  small { color: var(--ink-3); font-size: 11.5px; margin-top: 4px; font-stretch: 85%; }
  .flat { display: grid; grid-template-columns: repeat(auto-fill, minmax(18px, 1fr)); gap: 3px; align-content: center; height: 100%; padding: 24px; }
  .flat a { aspect-ratio: 1; background: var(--panel-2); }
  .flat a.up { background: var(--up); }
  .flat a.down { background: var(--down); }
</style>

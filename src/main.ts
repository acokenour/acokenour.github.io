import { prepareWithSegments, layoutWithLines } from "./vendor/pretext/src/index.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const BIRTH = new Date("1999-06-04T00:00:00");
const UNITS = ["minutes", "hours", "days", "months", "years"] as const;
type Unit = (typeof UNITS)[number];

// ─── Elapsed time ────────────────────────────────────────────────────────────

function getElapsed(unit: Unit): number {
  const ms = Date.now() - BIRTH.getTime();
  switch (unit) {
    case "minutes": return ms / 60_000;
    case "hours":   return ms / 3_600_000;
    case "days":    return ms / 86_400_000;
    case "months":  return ms / (86_400_000 * 30.4375);
    case "years":   return ms / (86_400_000 * 365.25);
  }
}

function formatElapsed(unit: Unit): string {
  const v = getElapsed(unit);
  return unit === "years" ? v.toFixed(9) : Math.floor(v).toString();
}

// ─── Pretext char-width cache ─────────────────────────────────────────────────

const pretextCache = new Map<string, number>();

function measuredCharWidth(ch: string, fontSize: number, ctx: CanvasRenderingContext2D): number {
  const key = `${ch}_${fontSize}`;
  if (pretextCache.has(key)) return pretextCache.get(key)!;

  let w = fontSize * 0.62; // fallback
  try {
    const prepared = prepareWithSegments(ch, `bold ${fontSize}px Quantico`);
    const result = layoutWithLines(prepared, 4000, fontSize * 1.5);
    if (result.lines.length > 0) w = result.lines[0].width;
  } catch {
    ctx.font = `bold ${fontSize}px Quantico, monospace`;
    w = ctx.measureText(ch).width;
  }
  pretextCache.set(key, w);
  return w;
}

// ─── Digit particle ───────────────────────────────────────────────────────────

interface Digit {
  char: string;
  // current position
  x: number;
  y: number;
  // spring velocity
  vx: number;
  vy: number;
  // target (resting) position — set by pretext layout
  tx: number;
  ty: number;
  alpha: number;
  targetAlpha: number;
  fontSize: number;
  targetFontSize: number;
  spawnDelay: number;
  spawnedAt: number;
}

function makeDigit(char: string, tx: number, ty: number, fontSize: number, delay: number): Digit {
  return {
    char, tx, ty,
    x: tx + (Math.random() - 0.5) * 600,
    y: ty + (Math.random() - 0.5) * 300,
    vx: 0, vy: 0,
    alpha: 0, targetAlpha: 1,
    fontSize: fontSize * 0.1, targetFontSize: fontSize,
    spawnDelay: delay,
    spawnedAt: Date.now(),
  };
}

// ─── Layout digits using pretext ──────────────────────────────────────────────

function layoutDigits(
  str: string,
  fontSize: number,
  paddingLeft: number,
  paddingTop: number,
  maxWidth: number,
  ctx: CanvasRenderingContext2D
): Array<{ char: string; x: number; y: number }> {
  const lineHeight = fontSize * 1.5;
  const result: Array<{ char: string; x: number; y: number }> = [];
  let col = 0, row = 0;
  let rowX = paddingLeft;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const w = measuredCharWidth(ch, fontSize, ctx);

    if (rowX + w > maxWidth && col > 0) {
      col = 0; row++;
      rowX = paddingLeft;
    }

    result.push({ char: ch, x: rowX, y: paddingTop + row * lineHeight });
    rowX += w;
    col++;
  }

  return result;
}

// ─── DOM setup (zero CSS) ─────────────────────────────────────────────────────

function applyStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles);
}

function buildDOM(): {
  scene: HTMLDivElement;
  gridCanvas: HTMLCanvasElement;
  numCanvas: HTMLCanvasElement;
  bubble: HTMLDivElement;
  nameEl: HTMLDivElement;
  subtitleEl: HTMLDivElement;
  selectorRow: HTMLDivElement;
  unitButtons: Map<Unit, HTMLButtonElement>;
} {
  // Body
  applyStyles(document.body, {
    margin: "0", padding: "0",
    background: "#000",
    overflow: "hidden",
    fontFamily: "'Quantico', monospace",
  });

  // Scene container
  const scene = document.createElement("div");
  applyStyles(scene, {
    position: "relative", width: "100vw", height: "100vh",
    background: "#000", overflow: "hidden",
  });

  // Grid canvas (bottom layer)
  const gridCanvas = document.createElement("canvas");
  applyStyles(gridCanvas, { position: "absolute", inset: "0", display: "block", zIndex: "1" });

  // Number canvas
  const numCanvas = document.createElement("canvas");
  applyStyles(numCanvas, { position: "absolute", inset: "0", display: "block", zIndex: "2" });

  // Cursor bubble
  const bubble = document.createElement("div");
  applyStyles(bubble, {
    position: "absolute",
    width: "130px", height: "130px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)",
    pointerEvents: "none",
    transform: "translate(-50%, -50%)",
    zIndex: "8",
    opacity: "0",
    transition: "opacity 0.22s ease",
  });

  // Header: name
  const nameEl = document.createElement("div");
  applyStyles(nameEl, {
    position: "absolute", top: "40px", left: "60px",
    fontFamily: "'Quantico', monospace",
    fontSize: "clamp(26px, 4vw, 52px)",
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    lineHeight: "1",
    zIndex: "5",
    userSelect: "none",
  });
  nameEl.textContent = "Andrew Cokenour";

  // Subtitle
  const subtitleEl = document.createElement("div");
  applyStyles(subtitleEl, {
    position: "absolute", top: "100px", left: "62px",
    fontFamily: "'Quantico', monospace",
    fontSize: "11px",
    color: "rgba(0, 255, 200, 0.45)",
    letterSpacing: "0.38em",
    textTransform: "uppercase",
    zIndex: "5",
    userSelect: "none",
  });
  subtitleEl.textContent = "// Personal Interface //";

  // Unit selector row
  const selectorRow = document.createElement("div");
  applyStyles(selectorRow, {
    position: "absolute", top: "138px", left: "60px",
    display: "flex", gap: "10px", flexWrap: "wrap",
    zIndex: "5",
  });

  const unitButtons = new Map<Unit, HTMLButtonElement>();
  for (const unit of UNITS) {
    const btn = document.createElement("button");
    btn.textContent = unit.charAt(0).toUpperCase() + unit.slice(1);
    btn.dataset["unit"] = unit;
    applyStyles(btn, {
      fontFamily: "'Quantico', monospace",
      fontSize: "10px",
      letterSpacing: "0.25em",
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.32)",
      border: "0.5px solid rgba(255,255,255,0.14)",
      background: "transparent",
      padding: "6px 14px",
      cursor: "pointer",
      outline: "none",
      transition: "all 0.18s ease",
    });
    unitButtons.set(unit, btn);
    selectorRow.appendChild(btn);
  }

  // Assemble
  scene.append(gridCanvas, numCanvas, bubble, nameEl, subtitleEl, selectorRow);
  document.body.appendChild(scene);

  return { scene, gridCanvas, numCanvas, bubble, nameEl, subtitleEl, selectorRow, unitButtons };
}

function setActiveButton(unitButtons: Map<Unit, HTMLButtonElement>, active: Unit): void {
  for (const [unit, btn] of unitButtons) {
    if (unit === active) {
      applyStyles(btn, {
        color: "#0fffc8",
        borderColor: "#0fffc8",
        background: "rgba(0,255,200,0.07)",
      });
    } else {
      applyStyles(btn, {
        color: "rgba(255,255,255,0.32)",
        borderColor: "rgba(255,255,255,0.14)",
        background: "transparent",
      });
    }
  }
}

// ─── Grid drawing ─────────────────────────────────────────────────────────────

function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.clearRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = "rgba(0,255,200,0.035)";
  ctx.lineWidth = 0.5;
  const step = 60;
  for (let x = 0; x < W; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Corner brackets
  const corners: [number, number][] = [[0, 0], [W, 0], [0, H], [W, H]];
  ctx.strokeStyle = "rgba(0,255,200,0.18)";
  ctx.lineWidth = 1;
  const m = 24, arm = 10;
  for (const [cx, cy] of corners) {
    const ox = cx === 0 ? m : W - m;
    const oy = cy === 0 ? m : H - m;
    const sx = cx === 0 ? 1 : -1;
    const sy = cy === 0 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + sx * arm, oy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + sy * arm); ctx.stroke();
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function main(): void {
  const { scene, gridCanvas, numCanvas, bubble, unitButtons } = buildDOM();

  const gridCtx = gridCanvas.getContext("2d")!;
  const numCtx = numCanvas.getContext("2d")!;

  let W = 0, H = 0;
  let mouseX = -999, mouseY = -999;
  let mouseActive = false;
  let currentUnit: Unit = "days";
  let digits: Digit[] = [];
  let lastStr = "";
  let fontSize = 48;
  let paddingLeft = 60;
  let paddingTop = 230;

  function computeSizes(): void {
    W = scene.offsetWidth;
    H = scene.offsetHeight;
    fontSize = Math.max(24, Math.min(52, W * 0.046));
    paddingLeft = Math.max(40, W * 0.058);
    paddingTop = Math.max(195, H * 0.27);
  }

  function resize(): void {
    computeSizes();
    gridCanvas.width = numCanvas.width = W;
    gridCanvas.height = numCanvas.height = H;
    drawGrid(gridCtx, W, H);
    pretextCache.clear();
    rebuildDigits(true);
  }

  function rebuildDigits(instant: boolean): void {
    const str = formatElapsed(currentUnit);
    const positions = layoutDigits(str, fontSize, paddingLeft, paddingTop, W - paddingLeft, numCtx);

    if (instant || digits.length === 0) {
      digits = positions.map((p, i) => {
        const d = makeDigit(p.char, p.x, p.y, fontSize, 0);
        if (instant) { d.x = p.x; d.y = p.y; d.alpha = 1; d.fontSize = fontSize; }
        return d;
      });
    } else {
      const next: Digit[] = [];
      for (let i = 0; i < positions.length; i++) {
        if (i < digits.length) {
          const d = digits[i];
          d.char = positions[i].char;
          d.tx = positions[i].x;
          d.ty = positions[i].y;
          d.targetAlpha = 1;
          d.targetFontSize = fontSize;
          next.push(d);
        } else {
          next.push(makeDigit(positions[i].char, positions[i].x, positions[i].y, fontSize, (i - digits.length) * 10));
        }
      }
      for (let i = positions.length; i < digits.length; i++) {
        const d = digits[i];
        d.targetAlpha = 0;
        d.targetFontSize = fontSize * 0.2;
        next.push(d);
      }
      digits = next;
    }
    lastStr = str;
  }

  function frame(): void {
    requestAnimationFrame(frame);

    // Rebuild if value changed
    const str = formatElapsed(currentUnit);
    if (str !== lastStr) rebuildDigits(false);

    numCtx.clearRect(0, 0, W, H);

    const now = Date.now();
    const REPEL_R = 72;
    const BUBBLE_R = 110;
    const SPRING = 0.11;
    const DAMP = 0.70;

    for (const d of digits) {
      const age = now - d.spawnedAt;
      if (age < d.spawnDelay) continue;

      // Pretext-measured target x is already set in d.tx/d.ty
      let tx = d.tx, ty = d.ty;

      if (mouseActive) {
        const dx = d.x - mouseX;
        const dy = d.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < REPEL_R && dist > 0.5) {
          const force = (REPEL_R - dist) / REPEL_R;
          const angle = Math.atan2(dy, dx);
          tx = d.tx + Math.cos(angle) * REPEL_R * force * 1.5;
          ty = d.ty + Math.sin(angle) * REPEL_R * force * 1.5;
        }
      }

      d.vx = (d.vx + (tx - d.x) * SPRING) * DAMP;
      d.vy = (d.vy + (ty - d.y) * SPRING) * DAMP;
      d.x += d.vx;
      d.y += d.vy;
      d.alpha = lerp(d.alpha, d.targetAlpha, 0.09);
      d.fontSize = lerp(d.fontSize, d.targetFontSize, 0.09);

      if (d.alpha < 0.01) continue;

      // Color: white by default, cyan tint near cursor
      let r = 255, g = 255, b = 255;
      if (mouseActive) {
        const dx = d.x - mouseX;
        const dy = d.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < BUBBLE_R) {
          const t = dist / BUBBLE_R;
          r = Math.round(lerp(0, 255, t));
          g = 255;
          b = Math.round(lerp(200, 255, t));
        }
      }

      numCtx.globalAlpha = d.alpha;
      numCtx.font = `bold ${Math.round(d.fontSize)}px Quantico, monospace`;
      numCtx.fillStyle = `rgb(${r},${g},${b})`;
      numCtx.textBaseline = "top";
      numCtx.fillText(d.char, Math.round(d.x), Math.round(d.y));
    }

    numCtx.globalAlpha = 1;

    // Cursor ring
    if (mouseActive) {
      numCtx.beginPath();
      numCtx.arc(mouseX, mouseY, REPEL_R - 2, 0, Math.PI * 2);
      numCtx.strokeStyle = "rgba(0,255,200,0.10)";
      numCtx.lineWidth = 0.5;
      numCtx.stroke();

      numCtx.beginPath();
      numCtx.arc(mouseX, mouseY, 5, 0, Math.PI * 2);
      numCtx.fillStyle = "rgba(0,255,200,0.3)";
      numCtx.fill();
    }

    // Bottom-right label
    numCtx.font = "bold 10px Quantico, monospace";
    numCtx.fillStyle = "rgba(0,255,200,0.28)";
    numCtx.textAlign = "right";
    numCtx.textBaseline = "bottom";
    numCtx.fillText(`${currentUnit.toUpperCase()} ELAPSED — 06.04.1999`, W - paddingLeft, H - 28);
    numCtx.textAlign = "left";
  }

  // ─── Event wiring ─────────────────────────────────────────────────────────

  scene.addEventListener("mousemove", (e: MouseEvent) => {
    const r = scene.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
    mouseActive = true;
    bubble.style.left = mouseX + "px";
    bubble.style.top = mouseY + "px";
    bubble.style.opacity = "1";
  });

  scene.addEventListener("mouseleave", () => {
    mouseActive = false;
    bubble.style.opacity = "0";
  });

  for (const [unit, btn] of unitButtons) {
    btn.addEventListener("mouseenter", () => {
      if (unit !== currentUnit) {
        applyStyles(btn, { color: "rgba(0,255,200,0.7)", borderColor: "rgba(0,255,200,0.35)" });
      }
    });
    btn.addEventListener("mouseleave", () => {
      setActiveButton(unitButtons, currentUnit);
    });
    btn.addEventListener("click", () => {
      currentUnit = unit;
      pretextCache.clear();
      setActiveButton(unitButtons, currentUnit);
      rebuildDigits(false);
    });
  }

  window.addEventListener("resize", resize);

  // ─── Init ─────────────────────────────────────────────────────────────────

  setActiveButton(unitButtons, currentUnit);
  resize();
  frame();

  // Live tick: re-trigger morph when minute/hour boundary crosses
  setInterval(() => {
    const str = formatElapsed(currentUnit);
    if (str !== lastStr) rebuildDigits(false);
  }, 500);
}

main();
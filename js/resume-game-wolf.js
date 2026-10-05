// the ore wolf, the mines' third boss, down in the crystal cave at bruinpop's
// landmark. she's a great wolf made of every ore in the game in its pure form
// (stone, marble, iron, gold, ruby, emerald and diamond), with a tail of each,
// and she's the marble hyena's mother. the fight swings between two halves:
// first she molts into solid diamond and nothing hurts her, then she sinks the
// diamond back in and puts up seven little crystal lattices, one of each ore,
// that drift round the room and have to be shot down inside a minute. break
// all seven and she's open for the rest of the fight (and nastier: her flung
// ores are all diamonds and her tails come for you), miss and they sink back
// into the floor and she's diamond again for half a minute. beat her and she
// drops prismasteel, the tier above diamond. loads after resume-game-race.js
// and talks to you through its dialogue box.

quest.wolf = Object.assign({ met: false, dead: false, chestOpened: false, chest: null },
  quest.wolf && typeof quest.wolf === 'object' ? quest.wolf : {});
const WQ = quest.wolf;
// what the game calls her (alex hasn't named her yet, so it's one place to change)
const WOLF_NAME = 'The Ore Wolf';

// her seven ores, weakest first. a flung ore does ORE_DMG hearts before armor
// where it lands (gold the least, then half a heart more each step from stone
// up to diamond; ruby sits between iron and emerald like it does for rarity),
// and a tail does five more than its ore.
const ORES = ['gold', 'stone', 'marble', 'iron', 'ruby', 'emerald', 'diamond'];
const ORE_PAL = {
  gold:    { hi: '#fff6c2', lt: '#f3dc6b', md: '#d9b73a', dk: '#9a7412', out: '#4a3408', rgb: '255,214,90' },
  stone:   { hi: '#e2e2e2', lt: '#b8b8b8', md: '#8c8c8c', dk: '#5e5e5e', out: '#262626', rgb: '205,205,205' },
  marble:  { hi: '#ffffff', lt: '#f1ede6', md: '#dcd6cc', dk: '#a3acb9', out: '#3c4250', rgb: '244,240,232' },
  iron:    { hi: '#ffffff', lt: '#dcd7d0', md: '#b3ada6', dk: '#77726c', out: '#2e2e2e', rgb: '226,222,216' },
  ruby:    { hi: '#ffd0c8', lt: '#ef6a5a', md: '#c4392b', dk: '#7c1c1c', out: '#3c0c0c', rgb: '255,90,74' },
  emerald: { hi: '#eafff0', lt: '#8eeaa9', md: '#3fc46c', dk: '#1d7a40', out: '#0c3a1e', rgb: '90,230,130' },
  diamond: { hi: '#f0fffc', lt: '#9df4e8', md: '#4ed6c6', dk: '#1d8b82', out: '#0e3d38', rgb: '95,240,224' }
};
const ORE_DMG = { gold: 5, stone: 5.5, marble: 6, iron: 6.5, ruby: 7, emerald: 7.5, diamond: 8 };
const TAIL_DMG = Object.fromEntries(ORES.map(o => [o, ORE_DMG[o] + 5]));
// what a flung ore can leave behind when it smashes (pure, so ingots, not raw ore)
const ORE_DROP = { gold: 'gold', stone: 'stone', marble: 'marble', iron: 'iron', ruby: 'ruby', emerald: 'emerald', diamond: 'diamond' };

// the numbers for the fight. shellFirst is how long she's diamond at the start
// (shorter, so you get to the lattices sooner), shell is every time after a
// lattice phase runs out, lattice is how long you get to break all seven.
const WOLF = {
  hp: 200, speed: 66, speedOpen: 84, keep: 4.6, backOff: 2.6,
  windup: 0.62, windupOpen: 0.48, lunge: 340, lungeTime: 0.36, lungeDmg: 5, touchDmg: 1,
  shellFirst: 20, shell: 30, lattice: 60,
  fling: { min: 4, max: 7, fly: 1.15, flyOpen: 1, rx: 15, ry: 9, drop: 0.06 },
  tails: { gap: 1, speed: 235, turn: 2.5, life: 1.5 }
};

// her sprite, facing right like every other creature: a big wolf whose whole
// body is a mosaic of her seven ores in wavy diagonal bands, each faceted and
// lit from the top left, with thin gold seams where one ore meets the next
// (like mended pottery), a mane of crystal spikes down her neck, a marble
// muzzle and glowing ruby eyes. shell is the same wolf turned to solid
// diamond, cut into big facets with white edges. her tails are drawn live
// (drawRestTails), so they can sway and shoot out.
const WOLF_W = 94, WOLF_H = 58, WOLF_GY = 55;
const BAND_ORDER = ['marble', 'diamond', 'gold', 'emerald', 'iron', 'ruby', 'stone'];
function bandAt(x, y) {
  const v = x * 0.5 + y * 0.95 + Math.sin(y * 0.33 + x * 0.11) * 3.2 + Math.sin(x * 0.21) * 2;
  return BAND_ORDER[((Math.floor(v / 5.4) % 7) + 7) % 7];
}
// the shape of her for a pose, as a wolf and not a horse: a long body low
// between the legs, a heavy haunch, a tucked waist and a deep chest, a thick
// neck carrying the head forward (not up), a long tapering snout, tall
// pointed ears, and back legs that bend at the hock. parts are the ellipses
// her body is made of (haunch, waist, chest, neck, head, snout, jaw, and a
// folded leg when she's lying down). legs go hip, knee, paw.
function wolfShape(pose, f) {
  if (pose === 'lie') {
    return {
      parts: [[26, 45, 12, 8], [44, 46, 17, 6], [62, 45, 10, 7], [70, 40, 6, 6], [77, 38, 7, 5.5], [86, 41, 6, 3], [83, 43, 4, 1.5], [22, 51, 9, 3.2]],
      head: [77, 38], snout: [86, 41, 6], legs: [], paws: [[70, 50, 88], [68, 52, 90]], spine: [[71, 39], [48, 40]], ruff: false, bd: 0, howl: false
    };
  }
  let bd = 0, hx = 0, hy = 0;
  if (pose === 'crouch') { bd = 4; hx = 2; hy = 5; }
  if (pose === 'run') bd = [0, 1, 0, 1][f];
  const br = pose === 'stand' && f === 1 ? 0.7 : 0;
  const parts = [[26, 34 + bd, 12, 10], [44, 33 + bd, 16, 7.5 + br * 0.5], [64, 34 + bd, 11, 11 + br], [71 + hx * 0.5, 25 + bd + hy * 0.6, 8, 9]];
  let head, snout;
  if (pose === 'howl') {
    parts[3] = [71, 21, 8, 10];
    head = [76, 11];
    snout = [81, 4, 4, 5.5];
    parts.push([head[0], head[1], 7, 6], snout);
  } else {
    head = [78 + hx, 18 + bd + hy];
    snout = [87 + hx, 21 + bd + hy, 6, 3.2];
    parts.push([head[0], head[1], 7, 6], snout, [snout[0] - 3, snout[1] + 3, 4, 1.8]);
  }
  // near back, far back, far front, near front
  const legs = [[24, 20, 0, 0], [31, 27, 0.6, 1], [67, 67, Math.PI + 0.6, 1], [61, 61, Math.PI, 0]].map(([x, kx, ph, far], i) => {
    const front = i >= 2;
    let sw = 0, lift = 0;
    if (pose === 'run') { const a = (f / 4) * Math.PI * 2 + ph; sw = Math.sin(a) * 4; lift = Math.max(0, Math.cos(a)) * 3; }
    if (pose === 'crouch') sw = front ? 2 : -2;
    const hip = [x, (front ? 41 : 39) + bd], paw = [x + (front ? 1 : -1) + sw, WOLF_GY - 1 - lift];
    const knee = [kx + sw * 0.6 + (pose === 'crouch' ? (front ? 2 : -2) : 0), 48 + bd * 0.5 - lift * 0.5];
    return { pts: [hip, knee, paw], far };
  });
  return { parts, head, snout: [snout[0], snout[1], snout[2]], legs, paws: [], spine: [[head[0] - 7, head[1] + 1], [50, 26 + bd]], ruff: pose !== 'howl', bd, howl: pose === 'howl' };
}
function makeWolf(pose, f, shell) {
  const G = pixelGrid(WOLF_W, WOLF_H), P = wolfShape(pose, f);
  const key = new Array(WOLF_W * WOLF_H).fill(null);
  const put = (x, y, ore, lit, k) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= WOLF_W || y >= WOLF_H) return;
    const Pp = ORE_PAL[shell ? 'diamond' : ore], sh = shell ? 3 : 2;
    const l = lit + (hash2(x >> sh, y >> sh, shell ? 1231 : 1201) - 0.5) * (shell ? 0.8 : 0.5);
    G.set(x, y, l > (shell ? 0.55 : 0.72) ? Pp.hi : l > (shell ? 0.12 : 0.22) ? Pp.lt : l > -0.32 ? Pp.md : Pp.dk);
    key[y * WOLF_W + x] = shell ? `${Math.floor((x + y) / 7)}:${Math.floor((x - y + 99) / 7)}` : k;
  };
  // legs first (the far ones darker), hip to knee to paw, thick at the top
  // and thinner down to the paw, then the body over the top of them
  P.legs.slice().sort((a, b) => b.far - a.far).forEach(L => {
    const [h, k, p] = L.pts, dark = L.far ? 0.45 : 0;
    [[h, k, 2.6, 2], [k, p, 2, 1.5]].forEach(([a, b, w0, w1]) => {
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
      for (let i = 0; i <= n; i++) {
        const u = i / n, cx = a[0] + (b[0] - a[0]) * u, cy = a[1] + (b[1] - a[1]) * u, half = w0 + (w1 - w0) * u;
        for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) put(x, cy, bandAt(x, Math.round(cy)), (cx - x) / 3.5 - dark, bandAt(x, Math.round(cy)));
      }
    });
    for (let x = Math.round(p[0]) - 2; x <= Math.round(p[0]) + 3; x++) for (let y = Math.round(p[1]) - 1; y <= Math.round(p[1]); y++) put(x, y, 'iron', y < Math.round(p[1]) ? 0.3 : -0.4 - dark, 'paw');
  });
  P.paws.forEach(([x0, y0, x1]) => {
    for (let x = x0; x <= x1; x++) for (let y = y0 - 1; y <= y0; y++) put(x, y, x > x1 - 4 ? 'iron' : bandAt(x, y), y < y0 ? 0.35 : -0.2, x > x1 - 4 ? 'paw' : bandAt(x, y));
  });
  for (let y = 0; y < WOLF_H; y++) for (let x = 0; x < WOLF_W; x++) {
    let best = null, bd = 1;
    P.parts.forEach((p, i) => {
      const dx = (x - p[0]) / p[2], dy = (y - p[1]) / p[3], d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = { i, dx, dy }; }
    });
    if (!best) continue;
    // (the jaw is pale marble, the rest of her the mosaic)
    const jaw = best.i === 6;
    const ore = jaw ? 'marble' : bandAt(x, y);
    put(x, y, ore, -(best.dx * 0.45 + best.dy * 0.75), jaw ? 'jaw' : ore);
  }
  // tall pointed ears (the far one first and darker, the near one with a dark
  // inside), laid back when she howls
  const [hx, hy] = P.head, back = P.howl ? -3 : 0, up = P.howl ? 3 : 0;
  [[hx + 1, hx + 5, hx + 3 + back, hy - 12 + up, 1], [hx - 4, hx + 1, hx - 3 + back, hy - 13 + up, 0]].forEach(([a, b, ax, ay, far]) => {
    for (let y = Math.round(ay); y <= hy - 3; y++) {
      const u = (y - ay) / (hy - 3 - ay), l = ax + (a - ax) * u, r = ax + (b - ax) * u;
      for (let x = Math.round(l); x <= Math.round(r); x++) {
        const inner = !far && x === Math.round((l + r) / 2) && y > ay + 3 && y < hy - 4;
        if (inner) { G.set(x, y, '#3a2236'); key[y * WOLF_W + x] = 'ear'; } else put(x, y, bandAt(x, y), (x <= Math.round(l) ? 0.6 : 0) - far * 0.4, 'ear');
      }
    }
  });
  // hackles: a ridge of crystal shards from the back of her head down over
  // her shoulders, one of each ore, diamond nearest her head
  const [[s0x, s0y], [s1x, s1y]] = P.spine;
  for (let k = 0; k < 7; k++) {
    const u = k / 6, bx = s0x + (s1x - s0x) * u, by = s0y + (s1y - s0y) * u, len = 7 + (k % 2 ? -2 : 1) - k * 0.5;
    for (let s = 0; s <= len; s++) {
      const half = 1.5 * (1 - s / (len + 1));
      for (let w = -half; w <= half; w += 0.5) put(bx - s * 0.55 + w, by - s, ORES[6 - k], w < 0 ? 0.8 : 0.1, `m${k}`);
    }
  }
  // a ruff of fur shards down the front of her chest
  if (P.ruff) {
    [[73, 29], [74, 33], [72, 37], [69, 40]].forEach(([x, y], k) => {
      for (let s = 0; s <= 3; s++) put(x + s * 0.5, y + P.bd + s * 0.7, k % 2 ? 'marble' : 'diamond', 0.5 - s * 0.15, `r${k}`);
    });
  }
  // seams where one ore meets another (gold), or the diamond's facet edges (white)
  const seam = shell ? '#ffffff' : '#ffe9a8';
  const seams = [];
  for (let y = 0; y < WOLF_H; y++) for (let x = 0; x < WOLF_W; x++) {
    const k = key[y * WOLF_W + x];
    if (k === null || k === 'ear') continue;
    const r = x + 1 < WOLF_W ? key[y * WOLF_W + x + 1] : null, d = y + 1 < WOLF_H ? key[(y + 1) * WOLF_W + x] : null;
    if ((r !== null && r !== 'ear' && r !== k) || (d !== null && d !== 'ear' && d !== k)) seams.push([x, y]);
  }
  seams.forEach(([x, y]) => G.set(x, y, seam));
  // the face: a narrowed ruby eye under a brow slanting down to her nose, the
  // nose on the end of the snout, the line of her mouth and a fang
  const [sx, sy, srx] = P.snout;
  for (let x = hx; x <= hx + 4; x++) G.set(x, hy - 3 + (x >= hx + 2 ? 1 : 0), '#241a2c');
  G.set(hx + 2, hy - 1, '#ff3b3b'); G.set(hx + 3, hy - 1, '#ff3b3b'); G.set(hx + 4, hy - 1, '#c41e1e');
  if (!P.howl) {
    G.set(sx + srx - 1, sy - 2, '#1a1420'); G.set(sx + srx, sy - 2, '#1a1420'); G.set(sx + srx, sy - 1, '#1a1420');
    for (let x = Math.round(sx - 6); x <= Math.round(sx + 3); x++) G.set(x, Math.round(sy + 2), '#3a2a3e');
    G.set(Math.round(sx + 1), Math.round(sy + 3), '#ffffff');
  } else { G.set(Math.round(sx + 1), Math.round(sy - 5), '#1a1420'); G.set(Math.round(sx + 2), Math.round(sy - 4), '#1a1420'); }
  return G.outline(() => '#120f18').canvas();
}
const WOLF_POSES = { stand: 2, run: 4, crouch: 1, howl: 1, lie: 1 };
const WOLF_ART = Object.fromEntries([false, true].map(shell => [shell ? 'shell' : 'ore',
  Object.fromEntries(Object.entries(WOLF_POSES).map(([pose, n]) => [pose, Array.from({ length: n }, (_, f) => makeWolf(pose, f, shell))]))]));
const WOLF_WHITE = new Map();
const wolfWhite = img => { if (!WOLF_WHITE.has(img)) WOLF_WHITE.set(img, whiteOf(img)); return WOLF_WHITE.get(img); };
// where her tails come out of her, per pose (sprite pixels)
const TAIL_ROOT = { stand: [15, 28], run: [15, 28], crouch: [15, 32], howl: [15, 28], lie: [15, 42] };

// the little things: a flung ore (a lump, or a crystal for the gems), drawn a
// quarter turn at a time as it tumbles, and a lattice (a cube of seven nodes'
// worth of bonds with one in the middle, turning)
function makeChunk(ore, rot) {
  const G = pixelGrid(12, 12), P = ORE_PAL[ore], gem = ['ruby', 'emerald', 'diamond'].includes(ore);
  const put = (x, y, c) => { const q = [[x, y], [11 - y, x], [11 - x, 11 - y], [y, 11 - x]][rot]; G.set(q[0], q[1], c); };
  if (gem) {
    for (let y = 1; y <= 10; y++) {
      const half = y < 4 ? (y - 1) * 1.2 + 0.6 : y > 7 ? (10 - y) * 1.2 + 0.6 : 4;
      for (let x = Math.round(5.5 - half); x <= Math.round(5.5 + half); x++) put(x, y, x < 4 ? P.hi : x < 6 ? P.lt : x < 8 ? P.md : P.dk);
    }
    put(4, 3, '#ffffff');
  } else {
    for (let y = 1; y <= 10; y++) for (let x = 1; x <= 10; x++) {
      const dx = (x - 5.5) / 4.6, dy = (y - 5.8) / 4, d = dx * dx + dy * dy - (hash2(x, y, 1301) - 0.5) * 0.3;
      if (d > 1) continue;
      const l = -(dx * 0.6 + dy * 0.8) + (hash2(x >> 1, y >> 1, 1302) - 0.5) * 0.6;
      put(x, y, l > 0.5 ? P.hi : l > 0.05 ? P.lt : l > -0.4 ? P.md : P.dk);
    }
  }
  return G.outline(() => P.out).canvas();
}
const CHUNK = Object.fromEntries(ORES.map(o => [o, [0, 1, 2, 3].map(r => makeChunk(o, r))]));
const LATTICE_FRAMES = 12;
function makeLattice(ore, k) {
  const G = pixelGrid(15, 15), P = ORE_PAL[ore], th = (k / LATTICE_FRAMES) * (Math.PI / 2), tilt = 0.6;
  const pts = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push([x, y, z]);
  pts.push([0, 0, 0]);
  const proj = pts.map(([x, y, z]) => {
    const x1 = x * Math.cos(th) - z * Math.sin(th), z1 = x * Math.sin(th) + z * Math.cos(th);
    const y2 = y * Math.cos(tilt) - z1 * Math.sin(tilt), z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
    return [7 + x1 * 4.2, 7 + y2 * 4.2, z2];
  });
  const edges = [];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    const d = pts[i].reduce((n, v, a) => n + (v !== pts[j][a] ? 1 : 0), 0);
    if (d === 1) edges.push([i, j]);
  }
  edges.sort((a, b) => proj[a[0]][2] + proj[a[1]][2] - proj[b[0]][2] - proj[b[1]][2]);
  const back = edges.filter(([i, j]) => proj[i][2] + proj[j][2] < 0), front = edges.filter(([i, j]) => proj[i][2] + proj[j][2] >= 0);
  back.forEach(([i, j]) => pxLine(G, proj[i][0], proj[i][1], proj[j][0], proj[j][1], P.dk));
  for (let i = 0; i < 8; i++) pxLine(G, 7, 7, proj[i][0], proj[i][1], P.md);
  front.forEach(([i, j]) => pxLine(G, proj[i][0], proj[i][1], proj[j][0], proj[j][1], P.lt));
  proj.slice(0, 8).forEach(([x, y, z]) => G.set(x, y, z > 0 ? P.hi : P.md));
  G.set(7, 7, '#ffffff');
  return G.canvas();
}
const LATTICE_ART = Object.fromEntries(ORES.map(o => [o, Array.from({ length: LATTICE_FRAMES }, (_, k) => makeLattice(o, k))]));

// the crystal wall that grows over the way out once the fight starts, and the
// cave mouth out in the mines once it's open: the lair's rock with a dark
// mouth, violet light inside, and crystals of all seven ores growing round it
function makeSeal() {
  const G = pixelGrid(52, 32), r = mulberry32(1401);
  for (let k = 0; k < 11; k++) {
    const ore = ORES[k % 7], P = ORE_PAL[ore], bx = 4 + k * 4.4 + (r() - 0.5) * 3, h = 12 + r() * 16, lean = (r() - 0.5) * 0.5;
    for (let s = 0; s <= h; s++) {
      const half = 3.2 * (1 - s / (h + 2));
      for (let w = -half; w <= half; w += 0.5) G.set(bx + w + s * lean, 30 - s, w < -half * 0.3 ? P.hi : w < half * 0.4 ? P.lt : P.md);
    }
  }
  return G.outline(() => '#120f18').canvas();
}
function makeCrystalLair() {
  const w = 48, h = 40, cx = 23.5, ground = h - 2;
  const G = pixelGrid(w, h);
  rockMound(G, w, ground, false);
  for (let y = 0; y <= ground; y++) for (let x = 0; x < w; x++) {
    const mx = (x - cx) / 7.5, my = (y - ground) / 14, d = mx * mx + my * my;
    if (d > 1 || y > ground) continue;
    G.set(x, y, d > 0.72 ? '#2a2236' : d > 0.35 ? '#120c1e' : y > ground - 3 ? '#4a3a7a' : '#1e1436');
  }
  const r = mulberry32(1402);
  [[cx - 10, ground - 6, -0.6], [cx - 9, ground - 13, -0.3], [cx - 4, ground - 17, -0.1], [cx + 3, ground - 17, 0.15], [cx + 9, ground - 13, 0.35], [cx + 10, ground - 6, 0.6], [cx + 1, ground - 19, 0]].forEach(([bx, by, lean], k) => {
    const P = ORE_PAL[ORES[k]], len = 5 + r() * 3;
    for (let s = 0; s <= len; s++) {
      const half = 1.6 * (1 - s / (len + 1));
      for (let ww = -half; ww <= half; ww += 0.5) G.set(bx + ww + s * lean, by - s, ww < 0 ? P.hi : P.md);
    }
  });
  return G.outline(() => '#262626').canvas();
}

// the arena: a cavern of dark slate with crystals glinting in the walls,
// polished floor tiles with thin veins of all seven ores running through them,
// and a faint ring of the seven inlaid round the middle of the floor
const WOLF_COLS = 26, WOLF_ROWS = 18, WOLF_DOOR = 13;
function paintWolfRoom() {
  const w = WOLF_COLS * TILE, h = WOLF_ROWS * TILE, c = mk(w, h), g = c.getContext('2d');
  const img = g.createImageData(w, h), D = img.data;
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const put = (x, y, [r, gg, b], a = 1) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    D[i] = D[i] + (r - D[i]) * a; D[i + 1] = D[i + 1] + (gg - D[i + 1]) * a; D[i + 2] = D[i + 2] + (b - D[i + 2]) * a; D[i + 3] = 255;
  };
  const wallAt = (x, y) => x < 16 || x >= w - 16 || y < 32 || (y >= h - 16 && Math.floor(x / TILE) !== WOLF_DOOR);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = hash2(x, y, 1410);
    if (wallAt(x, y)) {
      const face = y >= 18 && y < 32 && x >= 16 && x < w - 16;
      const v = face ? 64 - (31 - y) * 2 : 24 + vnoise(x / 9, y / 9, 1411) * 16;
      put(x, y, [v, v + 2, v + 12]);
      if (vnoise(x / 4, y / 4, 1412) > 0.8 && n < 0.35) put(x, y, rgb(ORE_PAL[ORES[(hash2(x >> 2, y >> 2, 1413) * 7) | 0]].lt));
    } else {
      const tx = x % 16, ty = y % 16;
      const v = tx === 0 || ty === 0 ? 30 : 46 + (hash2(x >> 4, y >> 4, 1414) - 0.5) * 12 + (tx + ty < 4 ? 6 : 0);
      put(x, y, [v, v + 1, v + 9]);
      if (n < 0.03) put(x, y, [84, 84, 100]);
    }
  }
  // veins of ore wandering through the floor
  const r = mulberry32(1415);
  for (let k = 0; k < 16; k++) {
    const col = rgb(ORE_PAL[ORES[k % 7]].md);
    let x = 24 + r() * (w - 48), y = 40 + r() * (h - 64), a = r() * Math.PI * 2;
    for (let s = 0; s < 70; s++) {
      a += (r() - 0.5) * 0.7; x += Math.cos(a) * 1.4; y += Math.sin(a) * 1.4;
      if (!wallAt(Math.round(x), Math.round(y))) put(Math.round(x), Math.round(y), col, 0.45);
    }
  }
  // the ring in the middle, a seventh of it per ore
  const cx = w / 2, cy = h / 2 + 12;
  for (let a = 0; a < Math.PI * 2; a += 0.004) {
    const col = rgb(ORE_PAL[ORES[Math.floor((a / (Math.PI * 2)) * 7)]].md);
    [70, 71, 46].forEach(R => put(Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * R * 0.62), col, 0.32));
  }
  g.putImageData(img, 0, 0);
  // daylight from the mines coming in at the door
  const gr = g.createLinearGradient(0, h, 0, h - 26);
  gr.addColorStop(0, 'rgba(255,236,200,0.25)');
  gr.addColorStop(1, 'rgba(255,236,200,0)');
  g.fillStyle = gr;
  g.fillRect(WOLF_DOOR * TILE, h - 26, TILE, 26);
  return c;
}

// her lair out in the mines: bruinpop's boarded up lair until darryl's door
// has been opened (mailsisibox found), then a crystal cave mouth you can walk
// into
const bruinPoi = POIS.find(p => p.id === 'bruinpop');
const lairThing = bruinPoi.thing;
const CRYSTAL_LAIR = makeCrystalLair();
const lairMouth = idx(bruinPoi.at[0], bruinPoi.at[1]);
const lairOpen = () => found.has('mailsisibox');
const lairGlow = { x: lairThing.x, y: lairThing.y - 10, rgb: '190,160,255', rad: 2.2, flicker: true, strength: 0.22, off: true };
glows.push(lairGlow);
let lairWasOpen = null;
function syncLair() {
  const open = lairOpen();
  if (open === lairWasOpen) return;
  lairWasOpen = open;
  lairThing.frames = open ? [CRYSTAL_LAIR] : SPRITE.lair;
  lairGlow.off = !open;
  if (open) extraSolid.delete(lairMouth);
  else extraSolid.add(lairMouth);
}
syncLair();

const wolfWalls = roomWalls(WOLF_COLS, WOLF_ROWS, WOLF_DOOR);
const SEAL_X = WOLF_DOOR * TILE + 8;
const wolfRoom = {
  id: 'wolf', w: WOLF_COLS * TILE, h: WOLF_ROWS * TILE, dust: '#5a5866', shade: 0.4, fight: true, sealed: false, underground: true,
  canvas: paintWolfRoom(),
  outside: { x: lairThing.x, y: lairThing.y }, exit: { x: lairThing.x, y: lairThing.y + 10 }, door: WOLF_DOOR,
  // once the fight starts, crystals grow over the way out until she's beaten
  blocked: (x, y) => wolfWalls(x, y) || (wolfRoom.sealed && y > WOLF_ROWS * TILE - 26 && Math.abs(x - SEAL_X) < 18),
  things: [], glows: []
};
EXTRA_ROOMS.push(wolfRoom);
BUILDINGS.push({
  thing: lairThing, tile: bruinPoi.at, room: wolfRoom, get name() { return WQ.dead ? 'The Crystal Den' : 'Crystal Cave'; }, open: lairOpen,
  shut: ['Sealed', '? ? ?', 'Beat the bosses before it first.'], hint: () => lairOpen() && !WQ.met
});
MINE_BOSSES.bruinpop = { beaten: () => !!WQ.dead, guard: 'Something glitters down there...' };
// the quest box: find her, beat her, open her chest (before "more coming soon")
MINES_STEPS.splice(MINES_STEPS.length - 1, 0,
  { done: () => !!WQ.met, title: 'Find the next landmark' },
  { done: () => !!WQ.dead, title: `Defeat ${WOLF_NAME}` },
  { done: () => !!WQ.chestOpened, title: 'Open her chest' });

// crystals in the walls (the only light apart from her), the crystal seal, and
// her hoard at the back, locked until she's beaten
[[40, 34, 'diamond'], [88, 34, 'ruby'], [328, 34, 'emerald'], [376, 34, 'gold'], [26, 262, 'iron'], [390, 262, 'crystal']].forEach(([x, y, kind]) => {
  wolfRoom.things.push({ x, y, frames: [makeCrystal(kind)] });
  const P = CRYSTAL_PAL[kind];
  wolfRoom.glows.push({ x, y: y - 14, rgb: [1, 3, 5].map(i => parseInt(P.light.slice(i, i + 2), 16)).join(','), rad: 2.8, flicker: true, strength: 0.22 });
});
const wolfSeal = { x: SEAL_X, y: wolfRoom.h - 1, frames: [makeSeal()], gone: true };
wolfRoom.things.push(wolfSeal);
// her hoard: plenty of emeralds and diamonds, emerald and diamond tools and
// armor, and once in a while a piece or two of prismasteel
function rollWolfLoot() {
  const out = [];
  const add = (chance, id, a, b) => { if (Math.random() < chance) out.push(makeStack(id, rand(a, b))); };
  add(0.85, 'diamond', 2, 4);
  add(0.85, 'emerald', 2, 5);
  const tier = () => (Math.random() < 0.5 ? 'diamond' : 'emerald');
  ['sword', 'pickaxe', 'axe'].forEach(k => { if (Math.random() < 0.45) out.push(makeStack(`${tier()}-${k}`)); });
  ARMOR_SLOTS.forEach(a => { if (Math.random() < 0.35) out.push(makeStack(`${tier()}-${a.piece}`)); });
  add(0.12, 'prismasteel', 1, 2);
  if (!out.length) out.push(makeStack('diamond', 2));
  return Array.from({ length: 12 }, (_, i) => out[i] || null);
}
WQ.chest = Array.isArray(WQ.chest) ? Array.from({ length: 12 }, (_, i) => validStack(WQ.chest[i])) : rollWolfLoot();
const wolfChest = addStation('chest', wolfRoom.w / 2, 47, wolfRoom);
wolfChest.slots = WQ.chest;
wolfChest.where = 'in the crystal den';
wolfChest.lockMsg = ['Locked', 'Her Hoard', `Defeat ${WOLF_NAME} first.`];
function lockWolfChest(locked) {
  wolfChest.locked = locked;
  wolfChest.frames = locked ? [LOCKED_CHEST] : [makeChest()];
}
lockWolfChest(!WQ.dead);

// her. she's a creature, so swings and arrows reach her the normal way, but her
// fight is her own: updateWolf runs it, wolfHit decides what a hit does and
// wolfDown starts her end (the play layer asks the def for these).
CREATURES.orewolf = {
  name: WOLF_NAME, boss: true, steady: true, hp: WOLF.hp, speed: WOLF.speed, knock: 0, h: 44, box: { w: 62, h: 24 },
  regen: 0, rest: 'wait', chip: '230,226,250', drops: [],
  update: updateWolf, hit: wolfHit, down: wolfDown, mad: () => false
};
const WOLF_HOME = { x: wolfRoom.w / 2, y: 104 };
const wolf = {
  kind: 'orewolf', def: CREATURES.orewolf, creature: true, room: wolfRoom, frames: [mk(1, 1)], draw: drawWolf,
  hx: WOLF_HOME.x, hy: WOLF_HOME.y, x: WOLF_HOME.x, y: WOLF_HOME.y, hp: WOLF.hp, state: 'wait', t: 0, cd: 0,
  sinceHit: 99, anim: 0, flip: false, hurtT: 0, kx: 0, ky: 0, phase: null, pt: 0, shell: 0, last: null,
  lx: 0, ly: 0, orbit: 1, orbitT: 0, k: 0, tailT: 0,
  dead: !!WQ.dead, gone: !!WQ.dead
};
creatures.push(wolf);
wolfRoom.things.push(wolf);
// the floor under the fight (where ores are about to land) is its own flat
// thing so it always draws underneath
const wolfFloor = { flat: true, x: 0, y: 0, frames: [mk(1, 1)], draw: drawWolfFloor };
wolfRoom.things.push(wolfFloor);
// her own light: she shines
const wolfGlow = { x: 0, y: 0, rgb: '225,215,255', rad: 3.6, flicker: true, strength: 0.2, off: true };
wolfRoom.glows.push(wolfGlow);

const flung = [], tails = [], lattices = [];
// (latBroken counts this lattice phase's breaks: broken ones are taken out of
// the list, so the list can't say how many went)
let meet = null, card = null, mourn = null, immuneT = 0, noteText = '', latBroken = 0;
const FIGHTING = ['stalk', 'windup', 'lunge', 'dazed', 'recover', 'howl', 'tails', 'stagger'];
const fighting = () => FIGHTING.includes(wolf.state);
// she talks to you in your head: the same box as darryl's, in violet, with her
// own voice (a soft shimmer of notes), and ripples coming off her while she does
const WOLF_WHO = { name: WOLF_NAME, voice: () => sfx.mind(), at: () => wolf, cls: 'is-mind' };
const wolfTalking = () => !!talk && talk.who === WOLF_WHO;

// what she says when you walk in. the first time it's the whole thing; after
// she's beaten you she doesn't bother explaining again.
function meetTalk() {
  if (WQ.met) return [{ d: 'No matter.' }, { d: 'You will pay.' }];
  return [
    { d: 'So it\'s you.', name: '???' },
    { you: 'Who\'s speaking?' },
    { act: () => { faceToward(wolf.x, wolf.y); floatText('?', player.x, player.y - 34, '#ffd23f'); }, wait: 0.6 },
    { you: 'Is it you?' },
    { d: 'The one who killed my son, Marmocyon.' },
    { you: 'Who is that?' },
    { d: 'The nameless marble hyena you cracked open without hesitation?' },
    { d: 'To do what, create a sword that killed Moe?' },
    { d: 'Let me ask, what did Moe do to you?' },
    { you: '...' },
    { d: 'No matter.' },
    { d: 'You will pay.' }
  ];
}
const defeatTalk = () => [
  { you: 'I\'m... sorry.' },
  { you: 'I didn\'t mean to kill your son, it was just a part of my quest.' },
  { d: 'I have failed.' },
  { d: 'Perhaps He shall avenge me.' }
];

// walking in: she's lying at the back, lifts her head, gets up, and talks to
// you. then the title card, the crystals grow over the door, and it starts.
function startWolfMeet() {
  meet = { t: 0, talked: false };
  Object.assign(wolf, { state: 'wait', t: 0 });
}
function tickMeet(dt) {
  meet.t += dt;
  if (meet.t > 0.5 && wolf.state === 'wait') { wolf.state = 'rise'; wolf.t = 0; sfx.snarl(); }
  if (meet.t > 1.5 && !meet.talked) {
    meet.talked = true;
    startTalk(meetTalk(), startCard, WOLF_WHO);
    WQ.met = true;
    markDirty();
  }
  if (meet.talked && !wolfTalking()) meet = null;
}
function startCard() {
  meet = null;
  card = { t: 0, prev: 0 };
  $('#cine-eyebrow').textContent = 'The Mines | Boss';
  $('#cine-title').textContent = WOLF_NAME;
  $('#cine-sub').textContent = 'Mother of Marmocyon';
  document.body.classList.add('is-cine');
  bossMusic(true, WOLF_TUNE);
}
function tickCard(dt) {
  const c = card, beat = s => c.prev < s && c.t >= s;
  c.prev = c.t;
  c.t += dt;
  if (beat(0.2)) { wolf.state = 'stand'; sfx.howl(false); addShake(2); }
  if (beat(0.5)) {
    wolfRoom.sealed = true;
    wolfSeal.gone = false;
    burst(wolfSeal.x, wolfSeal.y - 12, '200,190,255', 24);
    sfx.shatter();
    addShake(2);
  }
  if (beat(0.6)) cineEl.classList.add('show-card');
  if (c.t >= 2.6) {
    card = null;
    document.body.classList.remove('is-cine');
    cineEl.classList.remove('show-card');
    startFight();
  }
}
function startFight() {
  Object.assign(wolf, { state: 'stalk', t: 0, cd: 1.4, phase: 'armored', pt: WOLF.shellFirst, last: null });
  sfx.molt();
  bossBar(true, wolf);
  bossHint('wolf-shell', 'Encased', 'Pure diamond...', 'Nothing gets through. Dodge until it breaks.');
}

// the phases. armored: diamond all over, nothing hurts her. lattice: the
// diamond breaks off, seven lattices rise out of the floor, and she's shielded
// by them until they're all broken (then open, for good) or the time runs out
// (then back to armored). open: she can be hurt, and fights harder.
function tickPhase(c, dt) {
  if (c.phase === 'open' || player.dead) return;
  c.pt -= dt;
  if (c.phase === 'armored' && c.pt <= 0) startLattices(c);
  else if (c.phase === 'lattice') {
    if (latBroken >= 7) openUp(c);
    else if (c.pt <= 0) retractLattices(c);
  }
}
function crackShell(c) {
  c.shell = 0;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, sp = 50 + Math.random() * 110;
    particles.push({ x: c.x + (Math.random() - 0.5) * 50, y: c.y - 10 - Math.random() * 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 220, life: 0.7 + Math.random() * 0.4, t: 0, col: Math.random() < 0.5 ? '#e8fffc' : '#5fe0d0', size: 1 + (Math.random() < 0.4) });
  }
  addShake(3);
  sfx.shatter();
}
function startLattices(c) {
  crackShell(c);
  c.phase = 'lattice';
  c.pt = WOLF.lattice;
  latBroken = 0;
  lattices.forEach(L => removeLattice(L));
  lattices.length = 0;
  const spots = [];
  ORES.forEach((ore, k) => {
    let x = 0, y = 0;
    for (let tries = 0; tries < 40; tries++) {
      x = 50 + Math.random() * (wolfRoom.w - 100); y = 80 + Math.random() * (wolfRoom.h - 130);
      if (Math.hypot(x - player.x, y - player.y) > 70 && Math.hypot(x - c.x, y - c.y) > 50 && spots.every(([sx, sy]) => Math.hypot(sx - x, sy - y) > 44)) break;
    }
    spots.push([x, y]);
    const L = { ore, x, y, a: Math.random() * Math.PI * 2, sp: 36 + Math.random() * 18, z: 0, rise: 0, sink: null, alive: true, seed: Math.random(),
      frames: [mk(1, 1)], draw: drawLattice, glow: { x, y, rgb: ORE_PAL[ore].rgb, rad: 1.8, flicker: true, strength: 0.3 } };
    lattices.push(L);
    wolfRoom.things.push(L);
    wolfRoom.glows.push(L.glow);
    burst(x, y - 4, ORE_PAL[ore].rgb, 10);
  });
  sfx.chime(0);
  setTimeout(() => sfx.chime(3), 120);
  setTimeout(() => sfx.chime(6), 240);
  bossHint('wolf-lattice', 'Seven lattices', 'Shoot them down!', 'Break all seven with arrows before they sink back in.');
  const canShoot = inv.slots.some(s => s && (ITEMS[s.id].arrow || ITEMS[s.id].throw)) && inv.slots.some(s => s && (ITEMS[s.id].ranged || ITEMS[s.id].throw));
  if (!canShoot) setTimeout(() => toast('Seven lattices', 'You need arrows', 'Only something thrown or shot can break them.'), 2400);
}
function retractLattices(c) {
  lattices.forEach(L => { if (L.alive && L.sink === null) L.sink = 0; });
  c.phase = 'armored';
  c.pt = WOLF.shell;
  sfx.molt();
  bossHint('wolf-retract', 'Too slow', 'The lattices sank back in', 'She\'s diamond again. Break all seven next time.');
}
function openUp(c) {
  c.phase = 'open';
  lattices.forEach(removeLattice);
  lattices.length = 0;
  Object.assign(c, { state: 'stagger', t: 0 });
  for (let i = 0; i < 50; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 120;
    particles.push({ x: c.x, y: c.y - 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 60, life: 0.8 + Math.random() * 0.5, t: 0, col: hsl(Math.random() * 360, 0.9, 0.75), size: 1 + (Math.random() < 0.3) });
  }
  addShake(4);
  sfx.shatter();
  sfx.roar();
  toast('Her shield is broken', `${WOLF_NAME} is open`, 'Every hit counts now. Watch out for her tails...');
}
function removeLattice(L) {
  const i = wolfRoom.things.indexOf(L);
  if (i >= 0) wolfRoom.things.splice(i, 1);
  const j = wolfRoom.glows.indexOf(L.glow);
  if (j >= 0) wolfRoom.glows.splice(j, 1);
}
function breakLattice(L) {
  L.alive = false;
  removeLattice(L);
  const cx = L.x, cy = L.y - L.z;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
    particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, g: 200, life: 0.5 + Math.random() * 0.4, t: 0, col: Math.random() < 0.4 ? ORE_PAL[L.ore].hi : ORE_PAL[L.ore].md, size: 1 });
  }
  const n = ++latBroken;
  floatText(`${n}/7`, cx, cy - 12, ORE_PAL[L.ore].lt);
  sfx.shatter();
  sfx.chime(ORES.indexOf(L.ore));
}
// an arrow or a snowball flying into a lattice breaks it (the play layer asks
// before checking creatures, so it's used up on the lattice)
function wolfCatch(p) {
  if (room !== wolfRoom || p.from === 'mob') return false;
  const L = lattices.find(k => k.alive && k.sink === null && k.rise > 0.5 && Math.hypot(p.x - k.x, p.y - (k.y - k.z)) < 10);
  if (!L) return false;
  breakLattice(L);
  return true;
}
function updateLattices(dt, t) {
  for (let i = lattices.length - 1; i >= 0; i--) {
    const L = lattices[i];
    if (!L.alive) { lattices.splice(i, 1); continue; }
    if (L.sink !== null) {
      L.sink += dt / 0.8;
      if (L.sink >= 1) { removeLattice(L); lattices.splice(i, 1); burst(L.x, L.y - 2, '120,110,140', 6); continue; }
    } else L.rise = Math.min(1, L.rise + dt / 0.7);
    // wandering on a lazy curve, bouncing off the edges of the room
    L.a += Math.sin(t / 1400 + L.seed * 20) * 1.1 * dt;
    L.x += Math.cos(L.a) * L.sp * dt;
    L.y += Math.sin(L.a) * L.sp * dt * 0.8;
    if (L.x < 44 || L.x > wolfRoom.w - 44) { L.a = Math.PI - L.a; L.x = clamp(L.x, 44, wolfRoom.w - 44); }
    if (L.y < 76 || L.y > wolfRoom.h - 40) { L.a = -L.a; L.y = clamp(L.y, 76, wolfRoom.h - 40); }
    L.z = (16 + Math.sin(t / 300 + L.seed * 9) * 2) * (L.sink !== null ? 1 - L.sink : L.rise);
    Object.assign(L.glow, { x: L.x, y: L.y - L.z });
    if (L.rise < 1 && Math.random() < dt * 12) burst(L.x, L.y - 1, ORE_PAL[L.ore].rgb, 1);
  }
}

// her attacks. a lunge (5 hearts if it lands), or she pulls ores up out of the
// floor and flings them where you're standing and round about, and you dodge
// where they're going to land (the rings). open, she always flings seven
// diamonds, and she can send her tails after you one at a time.
function chooseAttack(c) {
  const open = c.phase === 'open', d = Math.hypot(player.x - c.x, player.y - c.y);
  let opts = open ? ['lunge', 'fling', 'tails'] : ['lunge', 'fling'];
  opts = opts.filter(o => o !== c.last);
  let pick = opts[(Math.random() * opts.length) | 0];
  if (pick === 'lunge' && d > 8.5 * TILE) pick = opts.find(o => o !== 'lunge') || 'fling';
  c.last = pick;
  c.t = 0;
  if (pick === 'lunge') { c.state = 'windup'; sfx.snarl(); }
  else if (pick === 'fling') c.state = 'howl';
  else { c.state = 'tails'; c.k = 0; c.tailT = 0.5; bossHint('wolf-tails', 'Her tails!', 'Keep running', 'They follow you. Seven of them, one after another.'); }
}
function flingOres(c) {
  const open = c.phase === 'open', n = open ? 7 : rand(WOLF.fling.min, WOLF.fling.max);
  const spots = [[player.x, player.y]];
  for (let k = 1; k < n; k++) {
    let x = player.x, y = player.y;
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2, r = 26 + Math.random() * 74;
      x = clamp(player.x + Math.cos(a) * r, 30, wolfRoom.w - 30);
      y = clamp(player.y + Math.sin(a) * r * 0.8, 50, wolfRoom.h - 24);
      if (spots.every(([sx, sy]) => Math.hypot(sx - x, (sy - y) * 1.4) > 34)) break;
    }
    spots.push([x, y]);
  }
  spots.forEach(([x, y], k) => {
    const a = (k / n) * Math.PI * 2, ox = c.x + Math.cos(a) * (22 + Math.random() * 10), oy = c.y + Math.sin(a) * 10 + 4;
    flung.push({ ore: open ? 'diamond' : ORES[(Math.random() * 7) | 0], ox, oy, x1: x, y1: y, pull: 0, wait: 0.3 + k * 0.08, t: 0, dur: open ? WOLF.fling.flyOpen : WOLF.fling.fly, h: 50 + Math.random() * 30, spin: Math.random() * 4 });
    burst(ox, oy, '150,140,160', 6);
  });
  addShake(2.5);
  sfx.thud();
  sfx.rumble();
}
function updateFlung(dt) {
  for (let i = flung.length - 1; i >= 0; i--) {
    const F = flung[i];
    if (F.wait > 0) { F.wait -= dt; F.pull += dt; continue; }
    F.t += dt;
    F.spin += dt * 10;
    if (F.t < F.dur) continue;
    // it lands: anyone in the ring is hit, it smashes, and once in a while it
    // leaves a piece of itself behind
    flung.splice(i, 1);
    const P = ORE_PAL[F.ore];
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 80;
      particles.push({ x: F.x1, y: F.y1 - 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 - 50, g: 260, life: 0.4 + Math.random() * 0.3, t: 0, col: k % 3 ? P.md : P.hi, size: 1 + (k % 4 === 0) });
    }
    addShake(1.5);
    sfx.thud();
    if (!player.dead && ((player.x - F.x1) / (WOLF.fling.rx + 4)) ** 2 + ((player.y - F.y1) / (WOLF.fling.ry + 3)) ** 2 < 1) hurtPlayer(ORE_DMG[F.ore], F.x1, F.y1);
    if (Math.random() < WOLF.fling.drop) lootOut(ORE_DROP[F.ore], 1, F.x1, F.y1 - 4);
  }
}
// a tail out of her: it starts at her rump aimed at you, and steers after you
// (with a top turning speed, like moe's drill, so running sideways shakes it
// off), leaving its length behind it, then whips back
function tailRoot(c) {
  const [pose] = wolfPose(c, performance.now()), r = TAIL_ROOT[pose] || TAIL_ROOT.stand;
  const left = Math.round(c.x - WOLF_W / 2), top = Math.round(c.y - WOLF_GY);
  return { x: c.flip ? left + WOLF_W - 1 - r[0] : left + r[0], y: top + r[1] };
}
function launchTail(c, k) {
  const r = tailRoot(c);
  tails.push({ ore: ORES[k], k, x: r.x, y: r.y, a: Math.atan2(player.y - 10 - r.y, player.x - r.x), age: 0, path: [[r.x, r.y]], back: false });
  whoosh();
  sfx.chime(k);
}
function updateTails(dt) {
  for (let i = tails.length - 1; i >= 0; i--) {
    const T = tails[i];
    if (T.back) {
      let n = Math.ceil((560 * dt) / 3);
      while (n-- > 0 && T.path.length > 1) T.path.pop();
      [T.x, T.y] = T.path[T.path.length - 1];
      if (T.path.length <= 1) tails.splice(i, 1);
      continue;
    }
    T.age += dt;
    if (!player.dead) {
      const want = Math.atan2(player.y - 10 - T.y, player.x - T.x), d = Math.atan2(Math.sin(want - T.a), Math.cos(want - T.a));
      T.a += clamp(d, -WOLF.tails.turn * dt, WOLF.tails.turn * dt);
    }
    T.x += Math.cos(T.a) * WOLF.tails.speed * dt;
    T.y += Math.sin(T.a) * WOLF.tails.speed * dt;
    const last = T.path[T.path.length - 1];
    if (Math.hypot(T.x - last[0], T.y - last[1]) >= 3) T.path.push([T.x, T.y]);
    if (wolfRoom.blocked(T.x, T.y + 8)) { T.back = true; burst(T.x, T.y, ORE_PAL[T.ore].rgb, 8); sfx.clang(); continue; }
    // (a tail that reaches you while you're still blinking from the last hit
    // carries on past)
    if (!player.dead && Math.hypot(T.x - player.x, T.y - (player.y - 10)) < 10 && hurtPlayer(TAIL_DMG[T.ore], T.x, T.y)) {
      burst(T.x, T.y, ORE_PAL[T.ore].rgb, 12);
      T.back = true;
      continue;
    }
    if (T.age > WOLF.tails.life || player.dead) T.back = true;
  }
}

function wolfPose(c, t) {
  switch (c.state) {
    case 'wait': return ['lie', 0];
    case 'rise': return c.t < 0.45 ? ['lie', 0] : ['crouch', 0];
    case 'windup': return ['crouch', 0];
    case 'howl': return c.t < 0.95 ? ['howl', 0] : ['stand', 0];
    case 'dying': return c.t > 1 ? ['lie', 0] : ['crouch', 0];
    case 'kneel':
    case 'shatter': return ['lie', 0];
    case 'lunge': return ['run', Math.floor(c.anim * 14) % 4];
  }
  if (c.moving) return ['run', Math.floor(c.anim * 10) % 4];
  return ['stand', Math.floor(t / 600) % 2];
}

function updateWolf(c, dt) {
  c.hurtT = Math.max(0, c.hurtT - dt);
  c.t += dt;
  c.moving = false;
  // diamond growing over her from her feet up (and the sparkle where it's
  // reached), or snapping off
  if (c.phase === 'armored' && c.shell < 1) {
    c.shell = Math.min(1, c.shell + dt / 1.1);
    const y = c.y - WOLF_GY + WOLF_H * (1 - c.shell);
    if (Math.random() < dt * 40) particles.push({ x: c.x + (Math.random() - 0.5) * 56, y, vx: 0, vy: -10, g: 0, life: 0.4, t: 0, col: Math.random() < 0.5 ? '#ffffff' : '#9df4e8', size: 1 });
  }
  const d = Math.hypot(player.x - c.x, player.y - c.y);
  const face = () => { if (player.x < c.x - 4) c.flip = true; else if (player.x > c.x + 4) c.flip = false; };
  const walk = (tx, ty, speed) => {
    const vx = tx - c.x, vy = ty - c.y, l = Math.hypot(vx, vy);
    if (l < 2) return;
    const bx = c.x, by = c.y;
    moveBody(c, (vx / l) * speed * dt, (vy / l) * speed * dt);
    c.x = clamp(c.x, 40, wolfRoom.w - 40);
    c.y = clamp(c.y, 66, wolfRoom.h - 22);
    c.moving = Math.hypot(c.x - bx, c.y - by) > speed * dt * 0.2;
    if (!c.moving) c.orbit = -c.orbit;
  };
  if (fighting()) tickPhase(c, dt);
  const open = c.phase === 'open';
  switch (c.state) {
    case 'rise':
      face();
      if (c.t > 0.9) { c.state = 'stand'; c.t = 0; }
      break;
    case 'stand':
    case 'still':
      face();
      break;
    case 'stalk': {
      // circling you about four and a half tiles off, every so often
      // switching which way round she's going
      face();
      c.orbitT -= dt;
      if (c.orbitT <= 0) { c.orbitT = 2.5 + Math.random() * 2.5; if (Math.random() < 0.5) c.orbit = -c.orbit; }
      const a = Math.atan2(c.y - player.y, c.x - player.x) + c.orbit * 0.6, keep = WOLF.keep * TILE;
      if (d < WOLF.backOff * TILE && d > 0) walk(c.x - (player.x - c.x), c.y - (player.y - c.y), WOLF.speed * 0.8);
      else walk(player.x + Math.cos(a) * keep, player.y + Math.sin(a) * keep * 0.8, open ? WOLF.speedOpen : WOLF.speed);
      c.cd -= dt;
      if (c.cd <= 0 && !player.dead) chooseAttack(c);
      break;
    }
    case 'windup':
      face();
      if (c.t >= (open ? WOLF.windupOpen : WOLF.windup)) {
        const l = Math.max(1, Math.hypot(player.x - c.x, player.y - c.y));
        c.lx = (player.x - c.x) / l; c.ly = (player.y - c.y) / l;
        c.state = 'lunge'; c.t = 0;
        sfx.bite();
      }
      break;
    case 'lunge': {
      const bx = c.x, by = c.y;
      moveBody(c, c.lx * WOLF.lunge * dt, c.ly * WOLF.lunge * dt);
      c.x = clamp(c.x, 40, wolfRoom.w - 40);
      c.y = clamp(c.y, 66, wolfRoom.h - 22);
      c.moving = true;
      c.flip = c.lx < 0;
      if (c.t > 0.05 && Math.hypot(c.x - bx, c.y - by) < WOLF.lunge * dt * 0.3) {
        // straight into the wall
        c.state = 'dazed'; c.t = 0;
        addShake(3); sfx.clang();
        burst(c.x + c.lx * 30, c.y - 14, '230,226,250', 14);
        break;
      }
      if (c.t >= WOLF.lungeTime) { c.state = 'recover'; c.t = 0; }
      break;
    }
    case 'dazed':
      if (c.t > 0.8) { c.state = 'recover'; c.t = 0; }
      break;
    case 'howl':
      face();
      if (c.t - dt < 0.4 && c.t >= 0.4) flingOres(c);
      if (c.t >= 1.3) { c.state = 'recover'; c.t = 0; }
      break;
    case 'tails':
      face();
      c.tailT -= dt;
      if (c.tailT <= 0 && c.k < 7 && !player.dead) { launchTail(c, c.k++); c.tailT = WOLF.tails.gap; }
      if (c.k >= 7 && !tails.length) { c.state = 'recover'; c.t = 0; }
      break;
    case 'recover':
      face();
      if (c.t > 0.5) { c.state = 'stalk'; c.t = 0; c.cd = open ? 1.1 + Math.random() * 0.7 : 1.5 + Math.random() * 0.9; }
      break;
    case 'stagger':
      if (Math.random() < dt * 20) burst(c.x + (Math.random() - 0.5) * 40, c.y - 10 - Math.random() * 26, '230,226,250', 1);
      if (c.t > 2.2) { c.state = 'stalk'; c.t = 0; c.cd = 1; }
      break;
    case 'dying':
      // cracking all over, light leaking out of her, then down she goes
      addShake(1.2);
      c.hurtT = Math.floor(c.t * 10) % 2 ? 0.05 : 0;
      if (Math.random() < dt * 30) burst(c.x + (Math.random() - 0.5) * 50, c.y - Math.random() * 34, ORE_PAL[ORES[(Math.random() * 7) | 0]].rgb, 2);
      if (c.t >= 1.8) {
        c.state = 'kneel'; c.t = 0; c.hurtT = 0;
        startTalk(defeatTalk(), () => { c.state = 'shatter'; c.t = 0; }, WOLF_WHO);
      }
      break;
    case 'shatter':
      if (Math.random() < dt * 40) burst(c.x + (Math.random() - 0.5) * 50, c.y - Math.random() * 30, ORE_PAL[ORES[(Math.random() * 7) | 0]].rgb, 2);
      if (c.t >= 1.2) finishWolf(c);
      break;
  }
  // touching her hurts a little; her lunge hurts a lot
  if (!player.dead && fighting() && c.state !== 'stagger' && overlap(playerBox(), creatureBox(c))) {
    hurtPlayer(c.state === 'lunge' ? WOLF.lungeDmg : WOLF.touchDmg, c.x, c.y - 10);
  }
  if (c.moving) c.anim += dt;
  Object.assign(wolfGlow, { x: c.x, y: c.y - 22, off: c.gone, strength: c.state === 'shatter' ? 0.2 + c.t * 0.5 : 0.2 });
}

// what a hit does: nothing at all unless she's open (a clink off the diamond,
// or the lattices' shield), and a bit extra while she's reeling
function wolfHit(c, dmg) {
  if (!fighting()) return { dmg: 0 };
  if (c.phase !== 'open') {
    if (immuneT <= 0) {
      immuneT = 0.4;
      floatText(c.phase === 'armored' ? 'Immune' : 'Shielded', c.x, c.y - 50, '#bde9ff');
      sfx.clang();
    }
    burst(c.x + (player.x < c.x ? -20 : 20), c.y - 18, c.phase === 'armored' ? '232,255,252' : '200,180,255', 4);
    return { dmg: 0 };
  }
  if (c.state === 'stagger' || c.state === 'dazed') return { dmg: dmg * 1.25, col: '#ffd23f' };
  return { dmg };
}
function wolfDown(c) {
  Object.assign(c, { state: 'dying', t: 0, shell: 0 });
  bossBar(false);
  bossBarEl.classList.remove('is-shell', 'is-prism');
  bossMusic(false);
  clearAttacks();
  sfx.howl(true);
}
function clearAttacks() {
  flung.length = 0;
  tails.length = 0;
  lattices.forEach(removeLattice);
  lattices.length = 0;
}
function finishWolf(c) {
  c.dead = true;
  c.gone = true;
  WQ.dead = true;
  quest.killed.orewolf = true;
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 140;
    particles.push({ x: c.x, y: c.y - 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 120, life: 0.8 + Math.random() * 0.6, t: 0, col: Math.random() < 0.5 ? hsl(Math.random() * 360, 0.9, 0.75) : ORE_PAL[ORES[(Math.random() * 7) | 0]].md, size: 1 + (Math.random() < 0.4) });
  }
  addShake(4);
  sfx.shatter();
  sfx.boom();
  wolfGlow.off = true;
  // the way out clears, the hoard unlocks, and what's left of her is prismasteel
  wolfRoom.sealed = false;
  wolfSeal.gone = true;
  burst(wolfSeal.x, wolfSeal.y - 12, '200,190,255', 20);
  lockWolfChest(false);
  const n = rand(1, 5);
  for (let i = 0; i < n; i++) setTimeout(() => lootOut('prismasteel', 1, c.x, c.y - 14), i * 160);
  victoryJingle();
  setTimeout(() => discover(bruinPoi), 900);
  setTimeout(() => toast('Defeated', WOLF_NAME, 'What she left behind shimmers...'), 3200);
  markDirty();
  renderHUD();
}
// back to how it was before you walked in, after you die or leave
function resetWolf() {
  if (wolfTalking()) endTalk(true);
  if (card) { card = null; document.body.classList.remove('is-cine'); cineEl.classList.remove('show-card'); }
  meet = null;
  mourn = null;
  if (musicOn && musicTune === WOLF_TUNE) bossMusic(false);
  bossBar(false);
  bossBarEl.classList.remove('is-shell', 'is-prism');
  clearAttacks();
  wolfRoom.sealed = false;
  wolfSeal.gone = true;
  noteText = '';
  if (wolf.dead) return;
  Object.assign(wolf, { x: wolf.hx, y: wolf.hy, hp: wolf.def.hp, state: 'wait', t: 0, cd: 0, phase: null, pt: 0, shell: 0, hurtT: 0, last: null, flip: false, k: 0 });
  wolfGlow.off = true;
}

// hooks the play layer calls
function wolfEnter(r) {
  if (r !== wolfRoom) return;
  player.y = r.h - 20;
  if (WQ.dead) setTimeout(() => toast('Inside', 'The Crystal Den', 'Her light has gone out...'), 50);
  else startWolfMeet();
}
function wolfLeave(r) { if (r === wolfRoom) resetWolf(); }
function wolfHolds() {
  return room === wolfRoom && (!!meet || !!card || wolfTalking() || wolf.state === 'dying' || wolf.state === 'shatter');
}
// while she's talking the camera sits between the two of you
function wolfCam() {
  if (room !== wolfRoom || !(meet || card || wolfTalking())) return null;
  return { x: (wolf.x + player.x) / 2, y: (wolf.y + player.y) / 2 - 18 };
}
function wolfTick(dt) {
  syncLair();
  immuneT -= dt;
  if (room !== wolfRoom) return;
  if (ui === 'chest' && openChest === wolfChest.slots && !WQ.chestOpened) { WQ.chestOpened = true; markDirty(); }
  if (meet) tickMeet(dt);
  if (card) tickCard(dt);
  const t = performance.now();
  updateFlung(dt);
  updateTails(dt);
  updateLattices(dt, t);
  // you went down: she stops, and says why
  if (player.dead && fighting()) {
    wolf.state = 'still';
    tails.forEach(T => { T.back = true; });
    mourn = { t: 0 };
  }
  if (mourn) mourn.t += dt;
  // the line under her health bar: how long she's diamond for, how many
  // lattices are left and how long you've got, or that she's open
  if (fighting() || wolf.state === 'still') {
    const ph = wolf.phase, secs = Math.max(0, Math.ceil(wolf.pt));
    const text = ph === 'armored' ? `Encased in diamond | ${secs}s`
      : ph === 'lattice' ? `Lattices ${latBroken} of 7 | ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
        : 'Vulnerable';
    if (text !== noteText) {
      noteText = text;
      const el = $('#boss-note');
      el.textContent = text;
      el.classList.toggle('is-urgent', ph === 'lattice' && secs <= 10);
    }
    bossBarEl.classList.toggle('is-shell', ph === 'armored');
    bossBarEl.classList.toggle('is-prism', ph === 'open');
  }
}

// drawing her
function pxDisc(toX, toY, x, y, r, col) {
  ctx.fillStyle = col;
  const cx = Math.round(x), cy = Math.round(y), R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++) {
    const q = r * r - dy * dy;
    if (q < 0) continue;
    const h = Math.floor(Math.sqrt(q) + 0.25);
    ctx.fillRect(toX(cx - h), toY(cy + dy), (2 * h + 1) * S, S);
  }
}
// one tail as a chain of beads, outline first, then the ore, lit on top, with a
// crystal point on the end
function drawChain(toX, toY, pts, ore, glow) {
  const P = ORE_PAL[ore], n = pts.length;
  const rad = i => { const u = i / Math.max(1, n - 1); return 2.4 + 2.3 * Math.sin(Math.PI * u * 0.85) - 2.5 * u * u; };
  pts.forEach(([x, y], i) => pxDisc(toX, toY, x, y, rad(i) + 1, P.out));
  pts.forEach(([x, y], i) => pxDisc(toX, toY, x, y, rad(i), glow ? P.lt : P.dk));
  pts.forEach(([x, y], i) => pxDisc(toX, toY, x - rad(i) * 0.2, y - rad(i) * 0.25, rad(i) * 0.7, glow ? P.hi : P.md));
  pts.forEach(([x, y], i) => pxDisc(toX, toY, x - rad(i) * 0.35, y - rad(i) * 0.5, rad(i) * 0.3, glow ? '#ffffff' : P.lt));
  const [tx, ty] = pts[n - 1], [px, py] = pts[Math.max(0, n - 2)], a = Math.atan2(ty - py, tx - px);
  for (let s = 0; s < 5; s++) pxDisc(toX, toY, tx + Math.cos(a) * s, ty + Math.sin(a) * s, 1.8 - s * 0.35, s < 2 ? P.lt : P.hi);
}
// her seven tails fanned out behind her, curling up and swaying, minus any
// that are out after you. the next one to go glows.
function drawRestTails(c, toX, toY, t, pose) {
  const r = TAIL_ROOT[pose] || TAIL_ROOT.stand, left = Math.round(c.x - WOLF_W / 2), top = Math.round(c.y - WOLF_GY);
  const bx = c.flip ? left + WOLF_W - 1 - r[0] : left + r[0], by = top + r[1], sx = c.flip ? -1 : 1;
  const out = new Set(tails.map(T => T.k));
  const lie = pose === 'lie';
  for (let i = 0; i < 7; i++) {
    if (out.has(i)) continue;
    let a = Math.PI * (lie ? 1.0 + i * 0.035 : 0.97 + i * 0.075) + (reduceMotion ? 0 : Math.sin(t / 420 + i * 0.8) * 0.1);
    let x = bx, y = by;
    const pts = [[x, y]];
    for (let s = 0; s < 13; s++) {
      a += lie ? -0.015 : 0.085;
      x += Math.cos(a) * 2.5 * sx; y += Math.sin(a) * 2.5;
      pts.push([x, y]);
    }
    const ore = c.shell > 0.6 ? 'diamond' : ORES[i];
    drawChain(toX, toY, pts, ore, c.state === 'tails' && i === c.k && c.tailT < 0.35);
  }
}
function drawWolf(c, toX, toY, t) {
  if (c.gone) return;
  const [pose, f] = wolfPose(c, t);
  const img = WOLF_ART.ore[pose][f], dia = WOLF_ART.shell[pose][f];
  const shake = ['windup', 'dazed', 'dying', 'stagger'].includes(c.state) && !reduceMotion ? Math.round(Math.sin(t / 25)) : 0;
  const left = Math.round(c.x - WOLF_W / 2) + shake, top = Math.round(c.y - WOLF_GY);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(toX(c.x - 30), toY(c.y - 1), 60 * S, 2 * S);
  ctx.fillRect(toX(c.x - 24), toY(c.y), 48 * S, S);
  // the last moment before she breaks apart she's pure light
  if (c.state === 'shatter') ctx.globalAlpha = Math.max(0, 1 - c.t / 1.2);
  drawRestTails(c, toX, toY, t, pose);
  const blit = im => {
    if (c.flip) {
      ctx.save();
      ctx.translate(toX(left) + WOLF_W * S, toY(top));
      ctx.scale(-1, 1);
      ctx.drawImage(im, 0, 0, WOLF_W * S, WOLF_H * S);
      ctx.restore();
    } else ctx.drawImage(im, toX(left), toY(top), WOLF_W * S, WOLF_H * S);
  };
  blit(c.hurtT > 0 && c.shell < 0.5 ? wolfWhite(img) : img);
  if (c.shell > 0) {
    // the diamond, up to however far it's grown
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, toY(top + WOLF_H * (1 - c.shell)), canvas.width, canvas.height);
    ctx.clip();
    blit(c.hurtT > 0 ? wolfWhite(dia) : dia);
    ctx.restore();
  }
  // a glint sweeping across her every few seconds, like the marble sword's
  const ph = (t % 2600) / 2600;
  if (!reduceMotion && ph < 0.3) {
    const gx = toX(left - 20 + (ph / 0.3) * (WOLF_W + 40));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(gx, toY(top)); ctx.lineTo(gx + 8 * S, toY(top)); ctx.lineTo(gx - 10 * S, toY(top + WOLF_H)); ctx.lineTo(gx - 18 * S, toY(top + WOLF_H));
    ctx.clip();
    ctx.globalAlpha *= c.shell > 0.5 ? 0.6 : 0.4;
    blit(wolfWhite(c.shell > 0.5 ? dia : img));
    ctx.restore();
  }
  // and little four point sparkles winking on her
  if (!reduceMotion) {
    for (let k = 0; k < 4; k++) {
      const p = (t / 650 + k * 0.29) % 1;
      if (p > 0.22) continue;
      const seed = Math.floor(t / 650 + k * 0.29) * 7 + k;
      const sx = left + 20 + hash2(seed, 1, 1501) * 52, sy = top + 16 + hash2(seed, 2, 1501) * 26, g = 1 - Math.abs(p / 0.22 - 0.5) * 2;
      ctx.fillStyle = `rgba(255,255,255,${0.4 + g * 0.6})`;
      ctx.fillRect(toX(sx), toY(sy - 1), S, 3 * S);
      ctx.fillRect(toX(sx - 1), toY(sy), 3 * S, S);
      if (g > 0.6) { ctx.fillRect(toX(sx), toY(sy - 2), S, S); ctx.fillRect(toX(sx), toY(sy + 2), S, S); ctx.fillRect(toX(sx - 2), toY(sy), S, S); ctx.fillRect(toX(sx + 2), toY(sy), S, S); }
    }
  }
  ctx.globalAlpha = 1;
  // the tell before a lunge, same red "!" as everything else
  if (c.state === 'windup') {
    const fs = Math.max(16, 8 * Math.round((S * 5.3) / 8)), mw = Math.round(fs * 0.9);
    const mx = toX(c.x) - mw / 2, my = toY(top + 2) - mw;
    ctx.fillStyle = '#ff4d3d';
    ctx.fillRect(mx, my, mw, mw);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${fs}px Silkscreen, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', mx + mw / 2, my + mw / 2 + 1);
  }
}
// on the floor: where every flung ore is going to land, a ring that closes in
// and goes from orange to red as it comes down, with its shadow growing in the
// middle, and cracks where she's pulling them up out of the ground
function drawWolfFloor(o, toX, toY, t) {
  const P = (x, y, col, w = 1, h = 1) => { ctx.fillStyle = col; ctx.fillRect(toX(x), toY(y), w * S, h * S); };
  flung.forEach(F => {
    if (F.wait > 0) {
      P(F.ox - 4, F.oy, '#140c10', 8, 1);
      P(F.ox - 2, F.oy - 1, '#2a2030', 4, 1);
    }
    const u = F.wait > 0 ? 0 : Math.min(1, F.t / F.dur), k = 0.35 + u * 0.65;
    const R = WOLF.fling.rx * (1.25 - u * 0.25), RY = WOLF.fling.ry * (1.25 - u * 0.25);
    const pulse = reduceMotion ? 1 : 0.6 + 0.4 * Math.sin(t / (90 - 50 * u));
    ctx.fillStyle = `rgba(255,60,40,${(0.14 + 0.22 * u) * pulse})`;
    for (let y = -Math.round(RY); y <= Math.round(RY); y++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - (y / (RY + 0.5)) ** 2)) * R);
      ctx.fillRect(toX(F.x1 - half), toY(F.y1 + y), half * 2 * S, S);
    }
    const ring = `rgba(255,${Math.round(170 - 120 * u)},60,${Math.min(1, k * (0.75 + 0.4 * pulse))})`;
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2;
      P(F.x1 + Math.cos(a) * R - 1, F.y1 + Math.sin(a) * RY - 1, ring, 2, 2);
    }
    P(F.x1 - 3, F.y1, ring, 7, 1);
    P(F.x1, F.y1 - 2, ring, 1, 5);
    const sw = Math.round(2 + 8 * u);
    P(F.x1 - sw / 2, F.y1 - 1, `rgba(0,0,0,${0.2 + 0.3 * u})`, sw, 2);
  });
}
function drawLattice(L, toX, toY, t) {
  const k = L.sink !== null ? 1 - L.sink : L.rise;
  ctx.fillStyle = `rgba(0,0,0,${0.3 * k})`;
  ctx.fillRect(toX(L.x - 4), toY(L.y - 1), 8 * S, 2 * S);
  ctx.globalAlpha = Math.min(1, k * 1.5);
  const fr = LATTICE_ART[L.ore][Math.floor(t / 90 + L.seed * 12) % LATTICE_FRAMES];
  ctx.drawImage(fr, toX(L.x - 7), toY(L.y - L.z - 7), 15 * S, 15 * S);
  ctx.globalAlpha = 1;
}
// over everything: the threads of light from each lattice to her while they
// shield her, the shimmer of the shield itself, the ores in the air, her tails
// that are out, the ripples when she's in your head, and her last words to you
function wolfOverlay(toX, toY, t) {
  if (room !== wolfRoom) return;
  const c = wolf, cx = c.x, cy = c.y - 22;
  if (!c.gone && c.phase === 'lattice' && fighting()) {
    ctx.globalCompositeOperation = 'lighter';
    lattices.forEach(L => {
      if (!L.alive || L.sink !== null) return;
      const lx = L.x, ly = L.y - L.z, n = Math.ceil(Math.hypot(cx - lx, cy - ly) / 3);
      const [r, g, b] = ORE_PAL[L.ore].rgb.split(',');
      for (let i = 0; i < n; i++) {
        const a = 0.12 + 0.18 * (reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t / 120 + i * 0.5 + L.seed * 9));
        ctx.fillStyle = `rgba(${r},${g},${b},${a * L.rise})`;
        ctx.fillRect(toX(lx + ((cx - lx) * i) / n), toY(ly + ((cy - ly) * i) / n), S, S);
      }
    });
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, wob = reduceMotion ? 0 : Math.sin(t / 200 + i) * 1.5;
      ctx.fillStyle = `hsla(${(i * 5 + t / 8) % 360},90%,70%,${0.3 + 0.2 * Math.sin(t / 150 + i * 0.7)})`;
      ctx.fillRect(toX(cx + Math.cos(a) * (48 + wob)), toY(cy + 2 + Math.sin(a) * (30 + wob)), S, S);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  flung.forEach(F => {
    let x, y, z;
    if (F.wait > 0) { x = F.ox; y = F.oy; z = Math.min(1, F.pull / 0.25) * 12; }
    else {
      const u = Math.min(1, F.t / F.dur);
      x = F.ox + (F.x1 - F.ox) * u; y = F.oy + (F.y1 - F.oy) * u;
      z = 12 * (1 - u) + F.h * 4 * u * (1 - u);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(toX(x - 3), toY(y - 1), 6 * S, S);
    }
    ctx.drawImage(CHUNK[F.ore][Math.floor(F.spin) % 4], toX(x - 6), toY(y - z - 6), 12 * S, 12 * S);
  });
  tails.forEach(T => {
    const r = tailRoot(c), pts = [[r.x, r.y], ...T.path.slice(1)];
    if (pts.length > 1) drawChain(toX, toY, pts, T.ore, false);
  });
  const ripple = (x, y) => {
    for (let k = 0; k < 3; k++) {
      const p = ((t / 900 + k / 3) % 1), R = 6 + p * 26;
      ctx.fillStyle = `rgba(185,168,255,${0.45 * (1 - p)})`;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        ctx.fillRect(toX(x + Math.cos(a) * R), toY(y + Math.sin(a) * R * 0.6), S, S);
      }
    }
  };
  const head = { x: c.x + (c.flip ? -31 : 31), y: c.y - 40 };
  if (!c.gone && wolfTalking() && talk.steps[talk.i] && talk.steps[talk.i].d && !reduceMotion) ripple(head.x, head.y);
  if (mourn && !c.gone) {
    // "for my son." over her, in the violet of her voice
    const a = Math.min(1, mourn.t / 0.4);
    if (!reduceMotion) ripple(head.x, head.y);
    const fs = Math.max(16, 8 * Math.round((S * 5.3) / 8));
    ctx.font = `italic ${fs}px "Pixelify Sans", Silkscreen, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = a;
    ctx.fillStyle = '#000';
    ctx.fillText('For my son.', toX(c.x) + 2, toY(c.y - 66) + 2);
    ctx.fillStyle = '#ece6ff';
    ctx.fillText('For my son.', toX(c.x), toY(c.y - 66));
    ctx.globalAlpha = 1;
  }
}

// her voice and her sounds
Object.assign(sfx, {
  mind: () => {
    const n = [69, 72, 74, 76, 79, 81, 84][(Math.random() * 7) | 0];
    tone(midiHz(n), 0.16, 'sine', 0.022);
    tone(midiHz(n + 7), 0.12, 'sine', 0.01, 0.03);
  },
  howl: sad => {
    if (!soundOn) return;
    try {
      const ac = getAudio(), t0 = ac.currentTime + 0.02, base = sad ? 300 : 360;
      const o = ac.createOscillator(), lfo = ac.createOscillator(), vib = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth';
      lfo.frequency.value = 6;
      vib.gain.value = 9;
      lfo.connect(vib).connect(o.frequency);
      o.frequency.setValueAtTime(base, t0);
      o.frequency.linearRampToValueAtTime(base * 1.9, t0 + 0.35);
      o.frequency.setValueAtTime(base * 1.9, t0 + 0.9);
      o.frequency.linearRampToValueAtTime(base * (sad ? 0.75 : 1.2), t0 + 1.5);
      f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.2;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.15);
      g.gain.setValueAtTime(0.06, t0 + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.55);
      o.connect(f).connect(g).connect(ac.destination);
      o.start(t0); lfo.start(t0);
      o.stop(t0 + 1.6); lfo.stop(t0 + 1.6);
    } catch { /* no audio */ }
  },
  shatter: () => { noiseBurst(0.22, 7000, 0.1); [88, 91, 95, 100].forEach((n, i) => tone(midiHz(n), 0.18, 'sine', 0.025, i * 0.04)); },
  chime: k => { tone(midiHz(76 + k * 2), 0.3, 'sine', 0.035); tone(midiHz(88 + k * 2), 0.15, 'sine', 0.012, 0.01); },
  molt: () => [64, 67, 71, 76, 79, 83].forEach((n, i) => tone(midiHz(n + 12), 0.2, 'sine', 0.02, i * 0.09)),
  thud: () => { noiseBurst(0.14, 650, 0.13); tone(70, 0.14, 'triangle', 0.05); },
  snarl: () => { noiseBurst(0.22, 500, 0.12); tone(110, 0.22, 'sawtooth', 0.03); }
});

// her theme: a gallop in d minor at 138 bpm, low and driving under a glittering
// arpeggio of crystal chimes, with a mournful lead over the top (she's angry,
// but she's grieving). the lead is made up from each bar's chord, like the
// other tunes, so it's its own.
const WOLF_CH = { Dm: [50, 53, 57], Bb: [46, 50, 53], F: [53, 57, 60], C: [48, 52, 55], Gm: [55, 58, 62], A: [45, 49, 52] };
const WOLF_BARS = [
  ['Dm', 0], ['Dm', 1], ['Bb', 0], ['C', 2],
  ['Dm', 0], ['Gm', 1], ['A', 2], ['A', 3],
  ['Bb', 0], ['F', 1], ['Gm', 0], ['A', 2],
  ['Dm', 1], ['Bb', 0], ['A', 3], ['Dm', 4]
];
const WOLF_MOTIFS = [
  { 0: 4, 6: 3, 8: 2, 12: 1 },
  { 0: 2, 3: 3, 6: 4, 10: 3, 12: 2 },
  { 0: 5, 4: 4, 8: 3, 10: 2, 12: 3 },
  { 0: 3, 2: 2, 4: 1, 8: 0, 12: 1 },
  { 0: 0, 8: 4 }
];
function wolfStep(bar, step, t) {
  const [name, mo] = WOLF_BARS[bar], ch = WOLF_CH[name], st = 60 / WOLF_TUNE.bpm / 4;
  const ladder = [...ch, ch[0] + 12, ch[1] + 12, ch[2] + 12];
  // the gallop: da da dum, da da dum, on the root
  if ([0, 3, 6, 8, 11, 14].includes(step)) mNote('triangle', midiHz(ch[0] - 12), t, st * 1.4, step % 8 === 0 ? 0.3 : 0.18, { rel: 0.04 });
  if (step === 0 || step === 8) mNote('sine', 95, t, 0.12, 0.32, { slide: 45, slideT: 0.12, rel: 0.05 });
  if (step === 4 || step === 12) mNoise(t, 0.12, 0.12, 'bandpass', 1400, 0.8);
  if (step % 2 === 1) mNoise(t, 0.02, 0.03, 'highpass', 8000);
  // the crystal arpeggio, up and down the chord
  mallet(midiHz(ladder[[0, 1, 2, 3, 4, 5, 4, 3][step % 8]] + 24), t, 0.06, 0.4, true);
  if (step === 0) ch.forEach(n => mNote('triangle', midiHz(n + 12), t, st * 15, 0.025, { at: 0.2, lp: 1800 }));
  const m = WOLF_MOTIFS[mo], deg = m[step];
  if (deg !== undefined) {
    let next = 16;
    for (let k = step + 1; k < 16; k++) if (m[k] !== undefined) { next = k; break; }
    const f = midiHz(ladder[deg] + 12), len = st * (next - step) * 0.9;
    mNote('sawtooth', f, t, len, 0.035, { lp: 2200, at: 0.02, vib: 5 });
    mNote('triangle', f, t, len, 0.05, { at: 0.02 });
  }
}
const WOLF_TUNE = { bpm: 138, bars: WOLF_BARS.length, loopFrom: 0, bright: true, step: wolfStep };

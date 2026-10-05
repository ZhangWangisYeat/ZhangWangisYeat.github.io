// darryl's minecart race, the mines' second landmark (mailsisibox). it's a
// minigame, not a boss: the shaft past moe's den opens once he's beaten, and
// down there a skeleton called darryl offers to take you to the next landmark
// if you can beat him to the end of the track in a minecart. win and he pops
// his own arm off, which turns into the key for the big door at the end, and
// the statue of the lord of lava (a boss for later) is behind it. lose and he
// points at you, you turn to bones, and if you were carrying anything shiny he
// walks over and helps himself. loads after resume-game-play.js and uses its
// globals.

// the save for all of it. stash is what he's taken off you, one piece per
// slot, and he wears it.
quest.darryl = Object.assign({
  met: false, losses: 0, won: false, keyGiven: false, doorOpen: false, statue: false,
  armless: false, fled: false, tutorial: false, hideHelp: false, seen: false, hatch: false, stash: {}, mined: [], chest: null, bones: []
}, quest.darryl && typeof quest.darryl === 'object' ? quest.darryl : {});
const DQ = quest.darryl;
const STASH_SLOTS = ['head', 'chest', 'legs', 'feet', 'hand'];
DQ.stash = Object.fromEntries(STASH_SLOTS.map(k => [k, validStack(DQ.stash && DQ.stash[k])]));
DQ.mined = Array.isArray(DQ.mined) ? DQ.mined.filter(n => Number.isInteger(n)) : [];
DQ.losses = Math.max(0, DQ.losses | 0);
DQ.bones = Array.isArray(DQ.bones) ? DQ.bones.filter(b => Array.isArray(b) && b.length === 2).slice(0, 10) : [];

// the track. it's a long winding tunnel drawn as a centre line through these
// points (in tiles, scaled up by TRACK_SCALE), smoothed into a curve. the room
// itself is made of the same tiles as the rest of the mines (RT, alex): floor
// wherever a tile's middle is within about HALF px of the centre line, so the
// edges come out as jagged as anywhere else in the mines, and wall everywhere
// else, with ore in it. it comes in through the bottom wall (the way in and
// out) and ends at the big door in the top wall on the right. HALF used to be
// 40, which left darryl's line about the only clean one and the race nearly
// unwinnable (alex), so the track is 64 px either side now, room for a few
// different ways through.
const TRACK_SCALE = 1.3;
const RACE_COLS = 136, RACE_ROWS = 94;
const RACE_W = RACE_COLS * TILE, RACE_H = RACE_ROWS * TILE;
const HALF = 64, DS = 4;
const TRACK_PTS = [
  [8, 75], [8, 60], [9, 47], [16, 41], [27, 42], [31, 50], [33, 59], [42, 64], [56, 63], [63, 55],
  [58, 46], [45, 41], [39, 31], [26, 26], [13, 23], [11, 13], [20, 8], [34, 9], [45, 15], [57, 21],
  [70, 24], [79, 33], [77, 45], [80, 58], [92, 62], [97, 52], [93, 40], [89, 28], [88, 18], [88, 8]
].map(([x, y]) => [x * TRACK_SCALE, y * TRACK_SCALE]);
const track = (() => {
  const P = TRACK_PTS.map(([x, y]) => [x * TILE + 8, y * TILE + 8]);
  const dense = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 48; k++) {
      const t = k / 48, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(P[P.length - 1]);
  // spaced out evenly, one point every DS px along the curve
  const xs = [dense[0][0]], ys = [dense[0][1]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    let [ax, ay] = dense[i - 1];
    const [bx, by] = dense[i];
    let seg = Math.hypot(bx - ax, by - ay);
    while (carry + seg >= DS) {
      const u = (DS - carry) / seg;
      ax += (bx - ax) * u; ay += (by - ay) * u;
      xs.push(ax); ys.push(ay);
      seg = Math.hypot(bx - ax, by - ay);
      carry = 0;
    }
    carry += seg;
  }
  const n = xs.length, ang = new Float32Array(n), k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    ang[i] = Math.atan2(ys[b] - ys[a], xs[b] - xs[a]);
  }
  // how sharply it bends at each point (1 / radius), smoothed out a little
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 4), b = Math.min(n - 1, i + 4);
    const d = Math.atan2(Math.sin(ang[b] - ang[a]), Math.cos(ang[b] - ang[a]));
    raw[i] = b > a ? d / ((b - a) * DS) : 0;
  }
  for (let i = 0; i < n; i++) {
    let sum = 0, c = 0;
    for (let j = Math.max(0, i - 5); j <= Math.min(n - 1, i + 5); j++) { sum += raw[j]; c++; }
    k[i] = sum / c;
  }
  return { n, xs, ys, ang, k, len: (n - 1) * DS };
})();
const trackPt = (s, d = 0) => {
  const i = clamp(Math.round(s / DS), 0, track.n - 1), a = track.ang[i];
  return { x: track.xs[i] - Math.sin(a) * d, y: track.ys[i] + Math.cos(a) * d, a };
};
// where things happen along it, in px from the bottom: the carts wait at the
// start line, the finish line comes a little before the end, and the carts
// roll to a stop at S_STOP, short of the door
const S_START = 300, S_FIN = track.len - 230, S_STOP = track.len - 120;

// a coarse map of the room in 4px cells: which point of the centre line each
// cell is nearest, and how far from it. everything asks this where it is.
const GW = RACE_W / 4, GH = RACE_H / 4;
const cellI = new Int32Array(GW * GH).fill(-1), cellD = new Float32Array(GW * GH).fill(1e9);
{
  const R = HALF + 22, rc = Math.ceil(R / 4) + 1;
  for (let i = 0; i < track.n; i++) {
    const cx = track.xs[i], cy = track.ys[i], gx = Math.floor(cx / 4), gy = Math.floor(cy / 4);
    for (let y = Math.max(0, gy - rc); y <= Math.min(GH - 1, gy + rc); y++) {
      for (let x = Math.max(0, gx - rc); x <= Math.min(GW - 1, gx + rc); x++) {
        const d = Math.hypot(x * 4 + 2 - cx, y * 4 + 2 - cy), j = y * GW + x;
        if (d < R && d < cellD[j]) { cellD[j] = d; cellI[j] = i; }
      }
    }
  }
}
function trackAt(x, y) {
  const gx = Math.floor(x / 4), gy = Math.floor(y / 4);
  if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return null;
  const c = cellI[gy * GW + gx];
  if (c < 0) return null;
  let best = c, bd = Infinity;
  for (let i = Math.max(0, c - 3); i <= Math.min(track.n - 1, c + 3); i++) {
    const d = (x - track.xs[i]) ** 2 + (y - track.ys[i]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  const a = track.ang[best], dx = x - track.xs[best], dy = y - track.ys[best];
  return { i: best, s: best * DS, dist: Math.sqrt(bd), d: -dx * Math.sin(a) + dy * Math.cos(a) };
}
// the tiles. mud has its own texture, made the same way as the rest.
const T_MUD = 17;
PAL[T_MUD] = { base: '#5a4028', dots: ['#4a3420', '#6e5034', '#3e2c1a', '#7a5a3a'], n: 46, style: 'speckle' };
TEX[T_MUD] = [0, 1, 2, 3].map(v => makeTileTexture(T_MUD, v));
const RT = new Uint8Array(RACE_COLS * RACE_ROWS).fill(T.WALL);
const rti = (tx, ty) => ty * RACE_COLS + tx;
const rtAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= RACE_COLS || ty >= RACE_ROWS ? T.WALL : RT[rti(tx, ty)]);
const raceSolid = (x, y) => SOLID[rtAt(Math.floor(x / TILE), Math.floor(y / TILE))] === 1;
for (let ty = 0; ty < RACE_ROWS; ty++) for (let tx = 0; tx < RACE_COLS; tx++) {
  const t = trackAt(tx * TILE + 8, ty * TILE + 8);
  if (t && t.dist < HALF + (hash2(tx, ty, 7360) - 0.5) * 12) RT[rti(tx, ty)] = T.FLOOR;
}
// smooth the worst of the jaggedness: a one tile dent in the wall gets filled
// in and a one tile spike of wall gets knocked off, so the edges stay rough
// but there are no pockets for a cart to wedge itself into
for (let pass = 0; pass < 2; pass++) {
  const next = RT.slice();
  for (let ty = 1; ty < RACE_ROWS - 1; ty++) for (let tx = 1; tx < RACE_COLS - 1; tx++) {
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => RT[rti(tx + dx, ty + dy)] === T.FLOOR).length;
    if (RT[rti(tx, ty)] === T.FLOOR && n <= 1) next[rti(tx, ty)] = T.WALL;
    else if (RT[rti(tx, ty)] === T.WALL && n >= 3) next[rti(tx, ty)] = T.FLOOR;
  }
  RT.set(next);
}
// ore in the walls along the track, the same blocks as out in the mines:
// mostly iron, then gold and ruby, the odd emerald. none of it (or any of the
// wall) can be dug until you've beaten darryl.
{
  const r = mulberry32(7361);
  for (let ty = 0; ty < RACE_ROWS; ty++) for (let tx = 0; tx < RACE_COLS; tx++) {
    if (RT[rti(tx, ty)] !== T.WALL) continue;
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => rtAt(tx + dx, ty + dy) === T.FLOOR) || r() > 0.11) continue;
    const roll = r();
    RT[rti(tx, ty)] = roll < 0.58 ? T.IRON : roll < 0.83 ? T.GOLD : roll < 0.97 ? T.RUBY : T.EMERALD;
  }
}
// the big door sits in the wall right above the top of the track's end
const DOOR_X = Math.floor(track.xs[track.n - 1] / TILE) * TILE + 8;
const DOOR_Y = (() => {
  const tx = Math.floor(DOOR_X / TILE);
  let ty = 0;
  while (ty < RACE_ROWS && RT[rti(tx, ty)] !== T.FLOOR) ty++;
  return ty * TILE + 4;
})();
// room to stand (on foot) or to fit a cart: clear of the walls, and not past
// the door while it's shut
function onFloor(x, y, m) {
  if (!DQ.doorOpen && y < DOOR_Y + 10) return false;
  for (const [dx, dy] of [[0, 0], [-m, -m], [m, -m], [-m, m], [m, m], [-m, 0], [m, 0], [0, -m], [0, m]]) if (raceSolid(x + dx, y + dy)) return false;
  return true;
}

// what's in the way. gems spin you out, jagged rocks crack your cart, holes
// swallow it, and mud and water slow you down (mud more). s is how far along,
// d is how far right of the centre line (written for the old narrow track and
// spread out by D_SCALE). darryl takes the gem at index MISTAKE.gem and the
// mud at MISTAKE.mud on purpose, his two slip ups. mud and water are tiles,
// like everything else on the floor.
const OBST = [
  [0.075, 'gem', 18, 'ruby'], [0.1, 'mud', -14], [0.13, 'rock', 12], [0.155, 'hole', -20], [0.18, 'gem', 2, 'amethyst'],
  [0.205, 'water', -12], [0.235, 'gem', -24, 'sapphire'], [0.237, 'gem', 24, 'ruby'], [0.265, 'rock', -6], [0.29, 'mud', 16],
  [0.32, 'hole', 12], [0.345, 'gem', -16, 'amethyst'], [0.37, 'rock', 22], [0.395, 'water', -12], [0.425, 'gem', 12, 'sapphire'],
  [0.45, 'hole', -16], [0.475, 'rock', 24], [0.478, 'rock', -24], [0.505, 'mud', 8], [0.535, 'gem', -20, 'ruby'],
  [0.56, 'hole', 18], [0.585, 'gem', -2, 'amethyst'], [0.615, 'water', 14], [0.645, 'rock', -18], [0.67, 'gem', 20, 'sapphire'],
  [0.7, 'mud', -14], [0.73, 'hole', 4], [0.76, 'gem', -24, 'ruby'], [0.762, 'gem', 22, 'amethyst'], [0.79, 'rock', 8],
  [0.82, 'water', -14], [0.85, 'gem', 18, 'sapphire'], [0.875, 'hole', -10], [0.9, 'rock', 20]
];
const MISTAKE = { gem: 11, mud: 25 };
const D_SCALE = 1.6;
const OB_SIZE = { gem: 7, rock: 9, hole: 11, mud: 24, water: 24 };
const PATCH_LEN = { mud: 40, water: 34 };
const obstacles = OBST.map(([f, kind, d, gem], n) => {
  const s = S_START + 160 + f * (S_FIN - S_START - 200);
  const p = trackPt(s, d * D_SCALE);
  return { n, kind, s, d: d * D_SCALE, x: p.x, y: p.y, a: p.a, r: OB_SIZE[kind], gem, along: PATCH_LEN[kind] || OB_SIZE[kind] };
});
const inPatch = (o, x, y) => {
  const dx = x - o.x, dy = y - o.y, c = Math.cos(-o.a), sn = Math.sin(-o.a);
  const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
  return (lx / o.along) ** 2 + (ly / o.r) ** 2 <= 1;
};
obstacles.forEach(o => {
  if (o.kind !== 'mud' && o.kind !== 'water') return;
  for (let ty = Math.floor((o.y - 48) / TILE); ty <= Math.floor((o.y + 48) / TILE); ty++) {
    for (let tx = Math.floor((o.x - 48) / TILE); tx <= Math.floor((o.x + 48) / TILE); tx++) {
      if (rtAt(tx, ty) === T.FLOOR && inPatch(o, tx * TILE + 8, ty * TILE + 8)) RT[rti(tx, ty)] = o.kind === 'mud' ? T_MUD : T.WATER;
    }
  }
});
// walls you've dug out since beating him
DQ.mined.forEach(i => { if (i >= 0 && i < RT.length && SOLID[RT[i]]) RT[i] = T.FLOOR; });
// the start and the finish are a row of checkered tiles right across the
// floor (they were painted lines; alex wanted tiles, like everything else)
const T_FLAG = 18;
PAL[T_FLAG] = { base: '#f2f0ea' };
TEX[T_FLAG] = [0, 1, 2, 3].map(v => {
  const c = mk(TILE, TILE), g = c.getContext('2d');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y) % 2 ? '#1c1c22' : (hash2(x, y, 7380 + v) < 0.3 ? '#e2ded4' : '#f2f0ea');
    g.fillRect(x * 4, y * 4, 4, 4);
  }
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 15, TILE, 1);
  return c;
});
const FLAG_ROWS = [S_START, S_FIN].map(s0 => {
  const p = trackPt(s0), ty = Math.floor(p.y / TILE);
  let x0 = Infinity, x1 = -Infinity;
  for (let tx = Math.floor((p.x - HALF - 32) / TILE); tx <= Math.floor((p.x + HALF + 32) / TILE); tx++) {
    if (rtAt(tx, ty) !== T.FLOOR) continue;
    RT[rti(tx, ty)] = T_FLAG;
    x0 = Math.min(x0, tx); x1 = Math.max(x1, tx);
  }
  return { ty, x0, x1 };
});

// the art. a crystal cluster for the gems, a jagged spray of rock, ore set in
// the wall, the minecarts, darryl himself, the big door and the statue.
const GEM_PAL = { ruby: ['#ffd0c8', '#ff5a4a', '#a8241a'], amethyst: ['#f0d8ff', '#b06cf0', '#5e2a9a'], sapphire: ['#d6ecff', '#4a9cf0', '#1d4e9a'] };
function makeGemCluster(kind) {
  const G = pixelGrid(16, 18), P = GEM_PAL[kind];
  [[8, 2, 3, 15], [4, 7, 2.5, 15], [12, 6, 2.5, 15]].forEach(([tx, ty, hw, by]) => {
    for (let y = ty; y <= by; y++) {
      const w = Math.round(hw * Math.min(1, (y - ty + 1) / 3));
      for (let x = tx - w; x <= tx + w; x++) G.set(x, y, x < tx ? P[0] : x === tx ? P[1] : P[2]);
    }
  });
  pxBlob(G, 8, 16, 7, 1.5, '#4e4e4e');
  return G.outline(() => '#141414').canvas();
}
function makeJagged() {
  const G = pixelGrid(20, 16);
  [[4, 6, 1], [9, 1, 2], [14, 4, 1], [17, 9, 0]].forEach(([tx, ty, hw]) => {
    for (let y = ty; y <= 14; y++) {
      const w = hw + Math.floor((y - ty) / 3);
      for (let x = tx - w; x <= tx + w; x++) G.set(x, y, x < tx ? '#b5b5b5' : x === tx ? '#8c8c8c' : '#5e5e5e');
    }
  });
  return G.outline(() => '#1a1a1a').canvas();
}
const GEM_ART = Object.fromEntries(Object.keys(GEM_PAL).map(k => [k, makeGemCluster(k)]));
const JAGGED = makeJagged();

// a minecart seen from above, nose to the right, so it can be turned any way:
// a wooden tub with an iron rim riveted at the corners, planks along the sides
// lit from the top left, a dark well inside, chunky wheels just poking out,
// and a lamp on the nose. yours is plain wood, darryl's is painted black with
// bone trim. cracks is how many rocks it's been through (up to 3): each one is
// a dark split across the wood with pale splinters along it, so a battered
// cart looks battered.
const darken = (hex, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k)).toString(16).padStart(2, '0')).join('');
function makeCartGrid(look, cracks) {
  const G = pixelGrid(28, 20);
  // the wood gets duller and darker the more of a beating it's taken
  const [hi, mid, lo] = look.wood.map(c => darken(c, cracks * 0.1));
  [[5, 0], [18, 0], [5, 17], [18, 17]].forEach(([x, y]) => {
    for (let k = 0; k < 5; k++) for (let j = 0; j < 3; j++) G.set(x + k, y + j, j === 1 && k > 0 && k < 4 ? '#55555f' : '#16161b');
  });
  for (let y = 2; y <= 17; y++) for (let x = 1; x <= 24; x++) {
    const rim = x === 1 || x === 24 || y === 2 || y === 17;
    const inner = x >= 4 && x <= 21 && y >= 5 && y <= 14;
    let col;
    if (rim) col = look.rim;
    else if (inner) col = y === 5 || x === 4 ? '#120b06' : (y - 5) % 3 === 2 ? '#22160c' : '#2c1d11';
    else if (y < 5) col = y === 3 ? hi : mid;
    else if (y > 14) col = y === 15 ? mid : lo;
    else col = x < 4 ? (x === 2 ? hi : mid) : (x === 23 ? lo : mid);
    G.set(x, y, col);
  }
  // plank joints along the sides, iron straps over them, rivets on the corners
  for (let x = 6; x <= 20; x += 7) { G.set(x, 3, lo); G.set(x, 4, lo); G.set(x, 15, '#1c120a'); G.set(x, 16, '#1c120a'); }
  [10, 17].forEach(x => [3, 4, 15, 16].forEach(y => G.set(x, y, look.band)));
  [[1, 2], [24, 2], [1, 17], [24, 17]].forEach(([x, y]) => G.set(x, y, '#f2f2f8'));
  for (let y = 8; y <= 11; y++) { G.set(25, y, '#ffd23f'); G.set(26, y, y === 9 || y === 10 ? '#fff6cc' : '#ffd23f'); }
  // the cracks: each one a wide black split running in from the rim, pale
  // splintered wood along one edge of it, and a chunk knocked out of the rim
  // where it started
  const SPLITS = [
    { line: [[8, 2], [9, 3], [9, 4], [10, 5], [11, 6], [11, 7], [12, 8], [12, 9], [13, 10]], chip: [[7, 2], [8, 2], [9, 2]] },
    { line: [[18, 17], [17, 16], [17, 15], [16, 14], [16, 13], [15, 12], [15, 11], [14, 10]], chip: [[17, 17], [18, 17], [19, 17]] },
    { line: [[24, 6], [23, 7], [22, 7], [21, 8], [20, 9], [19, 9], [18, 10], [17, 11]], chip: [[24, 5], [24, 6], [24, 7]] }
  ];
  SPLITS.slice(0, cracks).forEach(({ line, chip }) => {
    line.forEach(([x, y], i) => {
      G.set(x, y, '#030201'); G.set(x + 1, y, '#030201');
      G.set(i % 2 ? x - 1 : x + 2, y, '#f6e2b4');
    });
    chip.forEach(([x, y]) => G.set(x, y, null));
  });
  return G.outline(() => '#0c0c10');
}
const CART_STEPS = 32, CART_D = 38;
const CART_LOOK = {
  you: { wood: ['#e0a768', '#b07a42', '#74491f'], rim: '#6a6a74', band: '#9a9aa6' },
  darryl: { wood: ['#5a5560', '#38343e', '#211e25'], rim: '#e8e1cc', band: '#b8af96' }
};
const CART_ROT = Object.fromEntries(Object.entries(CART_LOOK).map(([k, look]) => [k, [0, 1, 2, 3].map(n => rotSet(makeCartGrid(look, n), 12.5, 9.5, CART_D, CART_STEPS))]));

// darryl: a lanky skeleton about your size, facing right like every other
// creature. alex wanted him rowdy and carefree, not kingly (the old goggles
// read as a crown): a cracked miner's helmet with its lamp lit, a faded denim
// vest hanging open over his ribs, a slouch
// with his head pushed forward, a big crooked grin with a tooth missing, a
// crack in his skull, and a pinprick of light in his eye socket. he wears
// whatever he's taken off you. plain is the bare skeleton, which is what you
// turn into when you lose.
const BONE = { hi: '#f4eedc', mid: '#d6ccb2', lo: '#a39a80', gap: '#2a2620' };
const DARRYL_W = 28, DARRYL_H = 33;
function makeSkeleton(pose, frame, o = {}) {
  const G = pixelGrid(DARRYL_W, DARRYL_H);
  const put = (x, y, c) => G.set(x, y, c);
  const line = (x0, y0, x1, y1, c) => pxLine(G, x0, y0, x1, y1, c);
  if (pose === 'pile') {
    // what's left of you: a heap of bones with the skull on top
    [[5, 28, 13, 26], [9, 29, 18, 29], [14, 27, 21, 28], [4, 30, 10, 30], [16, 30, 22, 30]].forEach(([a, b, c, d], i) => line(a, b, c, d, i % 2 ? BONE.mid : BONE.hi));
    [[5, 27], [13, 25], [18, 28], [22, 27], [10, 30]].forEach(([x, y]) => put(x, y, BONE.hi));
    pxBlob(G, 12, 22, 4.5, 4, (dx, dy) => (dx + dy < -0.5 ? BONE.hi : dx + dy < 0.6 ? BONE.mid : BONE.lo));
    [[13, 21], [14, 21], [13, 22]].forEach(([x, y]) => put(x, y, BONE.gap));
    return G.outline(() => '#1c1a16').canvas();
  }
  const plain = !!o.plain;
  const bob = ['idle', 'talk', 'frown'].includes(pose) && frame === 1 ? 1 : 0;
  const low = pose === 'grab' ? 3 : 0;
  const Y = bob + low;
  // he slouches: the head sits forward of the hips
  const lean = plain ? 0 : 2;
  const walk = ['walk', 'scared'].includes(pose);
  const stride = walk ? [2, 0, -2, 0][frame % 4] : 0, lift = walk && frame % 2 === 1 ? 1 : 0;
  const gear = o.gear || {};
  // legs, a little bent at the knee: the far one darker, the near one lit
  const leg = (hipX, dx, c, raised) => {
    line(hipX, 23 + Y, hipX + 1 + Math.round(dx / 2), 27 + Y - raised, c);
    line(hipX + 1 + Math.round(dx / 2), 27 + Y - raised, hipX + dx, 31 - raised, c);
    put(hipX + dx + 1, 31 - raised, c); put(hipX + dx + 2, 31 - raised, c);
  };
  leg(11, -stride, gear.legs ? MAT_PAL[gear.legs][2] : BONE.lo, frame % 4 === 3 ? lift : 0);
  leg(13, stride, gear.legs ? MAT_PAL[gear.legs][1] : BONE.mid, frame % 4 === 1 ? lift : 0);
  if (gear.feet) [[11 - stride, 31], [13 + stride, 31]].forEach(([x, y]) => { for (let k = -1; k <= 3; k++) put(x + k, y, MAT_PAL[gear.feet][k < 1 ? 0 : 2]); });
  // the far arm, behind the ribs, hanging loose
  const sh = 15 + Y, swing = Math.round(stride / 2);
  if (pose === 'scared') line(11 + lean, sh, 7 + lean, sh - 7, BONE.lo);
  else line(11 + lean, sh, 10 + lean - swing, sh + 7, BONE.lo);
  // pelvis, a spine that curves forward up to the neck, and crooked ribs
  for (let x = 10; x <= 15; x++) { put(x, 21 + Y, BONE.hi); put(x, 22 + Y, x === 12 ? BONE.gap : BONE.lo); }
  for (let y = 14; y <= 20; y++) put(10 + (y < 17 ? lean : y < 19 ? 1 : 0), y + Y, BONE.mid);
  [[15, 16 + lean], [17, 16 + lean], [19, 15 + lean]].forEach(([ry, x1], i) => {
    const x0 = 11 + (ry < 17 ? lean : 1);
    for (let x = x0; x <= x1; x++) put(x, ry + Y + (i === 1 && x > x1 - 2 ? 1 : 0), x === x1 ? BONE.lo : BONE.hi);
    if (ry < 19) for (let x = x0 + 1; x < x1; x++) put(x, ry + 1 + Y, BONE.gap);
  });
  if (gear.chest) {
    const P = MAT_PAL[gear.chest];
    for (let y = 14; y <= 20; y++) for (let x = 9 + (y < 17 ? lean : 0); x <= 17 + (y < 17 ? lean : 0); x++) put(x, y + Y, x === 9 || y === 14 ? P[0] : y === 20 ? P[2] : P[1]);
  } else if (!plain) {
    // the vest, hanging open: a panel down his back and one down his front,
    // frayed along the bottom, with his ribs showing in between
    for (let y = 14; y <= 20; y++) {
      const off = y < 17 ? lean : 0;
      put(9 + off, y + Y, '#3e5a80'); put(10 + off, y + Y, '#5c7ea8');
      if (y <= 19 || frame % 2) { put(16 + off, y + Y, '#5c7ea8'); put(17 + off, y + Y, '#45648c'); }
    }
    put(11 + lean, 14 + Y, '#5c7ea8'); put(15 + lean, 14 + Y, '#5c7ea8');
    put(9, 21 + Y, '#3e5a80'); put(17, 21 + Y, '#45648c');
  }
  if (gear.legs) { const P = MAT_PAL[gear.legs]; for (let x = 9; x <= 16; x++) { put(x, 21 + Y, P[0]); put(x, 22 + Y, P[1]); } }
  // neck
  put(12 + lean, 12 + Y, BONE.mid); put(13 + lean, 13 + Y, BONE.mid);
  // the skull, pushed forward, lit from the top left
  const hx = 13.5 + lean, open = pose === 'talk' && frame === 1 ? 1 : pose === 'scared' ? 2 : 0;
  pxBlob(G, hx, 6.5 + Y, 6, 5.4, (dx, dy) => (dx + dy < -0.7 ? BONE.hi : dx + dy < 0.5 ? BONE.mid : BONE.lo));
  // the grin: a jaw that juts forward, teeth all the way along with one
  // missing, and the corner of the mouth turned up (flat when he's frowning)
  const jx = Math.round(hx) - 2;
  for (let x = jx; x <= jx + 8; x++) put(x, 12 + Y + open, x >= jx + 2 ? BONE.hi : BONE.mid);
  for (let x = jx + 2; x <= jx + 8; x++) put(x, 11 + Y, open ? BONE.gap : x === jx + 6 && !plain ? BONE.gap : (x - jx) % 2 ? '#ffffff' : '#e6dfcc');
  if (open > 1) for (let x = jx + 2; x <= jx + 8; x++) put(x, 12 + Y, BONE.gap);
  if (!open && pose !== 'frown') put(jx + 1, 10 + Y, BONE.gap);
  if (pose === 'frown') put(jx + 1, 12 + Y, BONE.gap);
  const ex = Math.round(hx) + 2;
  const eye = pose === 'scared' ? [[ex - 1, 4], [ex, 4], [ex + 1, 4], [ex - 1, 5], [ex, 5], [ex + 1, 5], [ex - 1, 6], [ex, 6], [ex + 1, 6]] : [[ex, 5], [ex + 1, 5], [ex, 6], [ex + 1, 6], [ex + 2, 6]];
  eye.forEach(([x, y]) => put(x, y + Y, BONE.gap));
  if (!plain && pose !== 'scared') put(ex + 1, 5 + Y, '#ffe9a0');
  if (pose === 'frown') { put(ex - 1, 4 + Y, BONE.gap); put(ex, 4 + Y, BONE.gap); put(ex + 1, 3 + Y, BONE.gap); }
  put(Math.round(hx) + 5, 8 + Y, BONE.gap);
  if (!plain) { put(Math.round(hx) - 3, 2 + Y, BONE.gap); put(Math.round(hx) - 2, 3 + Y, BONE.gap); put(Math.round(hx) - 2, 4 + Y, BONE.gap); }
  if (gear.head) {
    const P = MAT_PAL[gear.head];
    for (let y = 0; y <= 4; y++) for (let x = Math.round(hx) - 7; x <= Math.round(hx) + 6; x++) {
      if (((x - hx) / 6.6) ** 2 + ((y - 5.5) / 5.6) ** 2 > 1) continue;
      put(x, y + Y, y === 4 ? P[2] : x < hx - 2 ? P[0] : P[1]);
    }
  } else if (!plain) {
    // his miner's helmet (alex: a bandana didn't fit a miner): a battered
    // yellow hard hat with the brim sticking out further at the front, a crack
    // across the top, a dent, and the lamp on the front, which is a real light
    // (darryl.lamp). if he's taken your helmet he wears that instead, lamp and
    // all gone.
    const cx = Math.round(hx);
    for (let y = 0; y <= 4; y++) for (let x = cx - 7; x <= cx + 6; x++) {
      if (((x - hx) / 6.8) ** 2 + ((y - 5.2) / 5.4) ** 2 > 1) continue;
      put(x, y + Y, x < cx - 2 ? '#f0c84a' : '#d9a92b');
    }
    for (let x = cx - 8; x <= cx + 8; x++) put(x, 4 + Y, x > cx + 4 ? '#b8891c' : '#8a6414');
    [[cx - 3, 0], [cx - 2, 1], [cx - 3, 2], [cx - 2, 3]].forEach(([x, y]) => put(x, y + Y, '#3a2a10'));
    put(cx + 1, 1 + Y, '#b8891c'); put(cx + 2, 1 + Y, '#b8891c');
    put(cx + 5, 1 + Y, '#55555f'); put(cx + 5, 2 + Y, '#55555f'); put(cx + 6, 1 + Y, '#fff3c4'); put(cx + 6, 2 + Y, '#ffd23f');
  }
  // the near arm, in front of everything: hanging, swinging, pointing at you,
  // reaching down for something, or thrown up in fright. once it's been
  // popped off for the key there's only a nub where it was.
  const ax = 14 + lean;
  if (o.armless) put(ax, sh, BONE.lo);
  else if (pose === 'point') { line(ax, sh, ax + 9, sh - 2, BONE.hi); put(ax + 10, sh - 2, BONE.hi); put(ax + 11, sh - 3, BONE.mid); }
  else if (pose === 'grab') line(ax, sh, ax + 5, sh + 7, BONE.hi);
  else if (pose === 'scared') line(ax, sh, ax + 4, sh - 8, BONE.hi);
  else { line(ax, sh, ax + 1 + swing, sh + 4, BONE.hi); line(ax + 1 + swing, sh + 4, ax + 2 + swing, sh + 7, BONE.hi); }
  return G.outline(() => '#1c1a16').canvas();
}
const skeletonCache = new Map();
function skeletonFrame(pose, frame, o = {}) {
  const gear = o.gear || {};
  const key = `${pose}|${frame}|${o.plain ? 1 : 0}|${o.armless ? 1 : 0}|${gear.head || ''}|${gear.chest || ''}|${gear.legs || ''}|${gear.feet || ''}`;
  let c = skeletonCache.get(key);
  if (!c) { c = makeSkeleton(pose, frame, o); skeletonCache.set(key, c); }
  return c;
}
// the skeletons of everyone who's lost to him (you, mostly), lying along the
// walls of the corridor seen from above. one more for each race you lose, up
// to ten.
function makeRemains(v) {
  // slumped against a wall on its left, legs stuck out across the floor, skull
  // lolling forward or to one side (four ways, v), an arm in its lap or down
  // by its side
  const G = pixelGrid(26, 24);
  const line = (x0, y0, x1, y1, c) => pxLine(G, x0, y0, x1, y1, c);
  const tilt = [0, 1, -1, 2][v];
  // legs: thigh out from the hip, shin on along the floor, little feet up
  const bent = v % 2;
  line(8, 18, 14, 18 - bent * 3, BONE.mid);
  line(14, 18 - bent * 3, 20, 20, BONE.mid);
  line(9, 20, 21, 21, BONE.lo);
  G.set(21, 19, BONE.hi); G.set(22, 20, BONE.hi);
  // pelvis and the spine leaning back against the wall
  for (let x = 6; x <= 10; x++) { G.set(x, 17, BONE.hi); G.set(x, 18, BONE.lo); }
  for (let y = 8; y <= 16; y++) G.set(4 + Math.round((y - 8) / 4), y, BONE.mid);
  [9, 11, 13].forEach((ry, i) => { for (let x = 5 + Math.round((ry - 8) / 4); x <= 10 - (i === 2 ? 1 : 0); x++) G.set(x, ry, x === 10 ? BONE.lo : BONE.hi); });
  // the skull, slumped
  const sx = 7 + tilt, sy = 5 + Math.abs(tilt);
  pxBlob(G, sx, sy, 3.6, 3.2, (dx, dy) => (dx + dy < -0.4 ? BONE.hi : dx + dy < 0.5 ? BONE.mid : BONE.lo));
  G.set(sx + 1, sy, BONE.gap); G.set(sx + 2, sy, BONE.gap); G.set(sx + 3, sy + 2, BONE.gap);
  for (let x = sx; x <= sx + 3; x++) G.set(x, sy + 3, x % 2 ? '#ffffff' : BONE.lo);
  // arms
  if (v < 2) { line(6, 10, 9, 15, BONE.mid); line(9, 15, 13, 16, BONE.mid); }
  else { line(6, 10, 4, 16, BONE.lo); line(4, 16, 5, 20, BONE.lo); }
  line(8, 10, 11, 14, BONE.hi);
  return G.outline(() => '#1c1a16').canvas();
}
const flipCanvas = c => { const o = mk(c.width, c.height), g = o.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return o; };
const REMAINS_ART = [0, 1, 2, 3].map(makeRemains), REMAINS_FLIP = REMAINS_ART.map(flipCanvas);

// the big door at the end of the track: two dark wooden leaves bound in iron,
// a skull over the top and a bone-shaped keyhole between them. open is 0 to 1
// as it swings apart.
const DOOR_W = 52, DOOR_H = 58;
function makeDoor(open) {
  const G = pixelGrid(DOOR_W, DOOR_H), gap = Math.round(open * 20);
  // the stone arch round it
  for (let y = 0; y < DOOR_H; y++) for (let x = 0; x < DOOR_W; x++) {
    const ax = (x - 25.5) / 26, ay = (y - 26) / 26;
    const inArch = y >= 26 ? Math.abs(x - 25.5) <= 26 : ax * ax + ay * ay <= 1;
    if (!inArch) continue;
    const inner = y >= 26 ? Math.abs(x - 25.5) <= 21 : ((x - 25.5) / 21) ** 2 + ((y - 26) / 21) ** 2 <= 1;
    if (!inner) { G.set(x, y, hash2(x >> 1, y >> 1, 930) < 0.5 ? '#6e6a66' : '#585450'); continue; }
    if (y < 7) continue;
    const left = x < 25.5 - gap, right = x > 25.5 + gap;
    if (!left && !right) {
      // the vault's lava light spilling out through the gap
      const glow = 1 - Math.abs(x - 25.5) / (gap + 1), hot = glow * (0.6 + (y / DOOR_H) * 0.6);
      G.set(x, y, open < 0.05 ? '#060505' : hot > 0.75 ? '#ffd27a' : hot > 0.45 ? '#ff8a2a' : hot > 0.2 ? '#b8401a' : '#3a1208');
      continue;
    }
    const lx = left ? x : x - gap * 2;
    const band = y === 18 || y === 19 || y === 44 || y === 45;
    G.set(x, y, band ? '#7a7a84' : lx % 6 === 0 ? '#2a1a10' : (lx % 6 < 3 ? '#5e3a1e' : '#4e301a'));
  }
  if (open < 0.05) {
    // the keyhole, shaped like a bone
    [[24, 30], [27, 30], [24, 36], [27, 36]].forEach(([x, y]) => pxBlob(G, x, y, 1.4, 1.4, '#e8e1cc'));
    for (let y = 30; y <= 36; y++) { G.set(25, y, '#e8e1cc'); G.set(26, y, '#e8e1cc'); }
    G.set(25, 33, '#060505'); G.set(26, 33, '#060505'); G.set(25, 34, '#060505'); G.set(26, 34, '#060505');
  }
  // the skull over the top
  pxBlob(G, 25.5, 4, 4.5, 3.6, (dx, dy) => (dx + dy < -0.4 ? BONE.hi : BONE.mid));
  [[23, 4], [24, 4], [27, 4], [28, 4]].forEach(([x, y]) => G.set(x, y, BONE.gap));
  return G.outline(() => '#141210').canvas();
}
const DOOR_STEPS = 10;
const DOOR_ART = Array.from({ length: DOOR_STEPS + 1 }, (_, k) => makeDoor(k / DOOR_STEPS));

// the lord of lava, a boss still to come, carved in obsidian with lava
// running in the cracks: a hulking figure with a horned helm and burning eyes,
// spiked shoulders, hands folded on the pommel of a greatsword planted in
// front of him, on a plinth.
function makeLavaLord() {
  const w = 60, h = 100, cx = 29.5, G = pixelGrid(w, h);
  const OB = ['#5a5160', '#3a3340', '#262129', '#17141a'];
  const LAVA = ['#fff1a8', '#ffd23f', '#ff8a1c', '#c8401a'];
  const shade = (dx, dy, x, y) => {
    const lit = -(dx * 0.6 + dy * 0.8) + (hash2(x, y, 940) - 0.5) * 0.35;
    return OB[lit > 0.5 ? 0 : lit > 0 ? 1 : lit > -0.5 ? 2 : 3];
  };
  // plinth with a plaque
  for (let y = 84; y < h; y++) for (let x = 5; x < w - 5; x++) {
    let col = y < 87 ? '#6a6268' : x < 9 || x > w - 10 ? '#2a262a' : '#3e383e';
    if (x >= 17 && x <= w - 18 && y >= 90 && y <= 95) col = (x + y) % 4 === 0 ? '#8a8088' : '#221e22';
    G.set(x, y, col);
  }
  // robe down to the plinth, body, shoulders, head
  for (let y = 56; y < 84; y++) {
    const half = 13 + (y - 56) * 0.32;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) G.set(x, y, shade((x - cx) / half, 0.2, x, y));
  }
  pxBlob(G, cx, 46, 18, 15, shade);
  pxBlob(G, cx - 17, 34, 8, 6, shade);
  pxBlob(G, cx + 17, 34, 8, 6, shade);
  [[cx - 21, 27], [cx - 15, 26], [cx + 15, 26], [cx + 21, 27]].forEach(([x, y]) => { for (let k = 0; k < 5; k++) G.set(Math.round(x), y - k, OB[k < 2 ? 1 : 0]); });
  pxBlob(G, cx, 22, 8, 8.5, shade);
  // horns sweeping up and out
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, x = 7 + t * 2 + Math.sin(t * 2.4) * 2, y = 18 - t * 16;
    [[cx - x, y], [cx + x, y]].forEach(([hx, hy]) => { const r = 2.6 * (1 - t) + 0.6; pxBlob(G, hx, hy, r, r, k > 12 ? '#8a7f86' : OB[1]); });
  }
  // eyes and the visor slit
  for (let x = Math.round(cx - 6); x <= Math.round(cx + 6); x++) G.set(x, 22, OB[3]);
  [[cx - 3, 22], [cx + 3, 22]].forEach(([x, y]) => { G.set(Math.round(x), y, LAVA[0]); G.set(Math.round(x) - 1, y, LAVA[1]); G.set(Math.round(x) + 1, y, LAVA[1]); });
  // the greatsword, point down into the plinth, and his hands on it
  for (let y = 44; y <= 86; y++) for (let x = Math.round(cx - 2); x <= Math.round(cx + 2); x++) G.set(x, y, x === Math.round(cx - 2) ? '#9a96a4' : x === Math.round(cx + 2) ? LAVA[2] : '#5a5866');
  for (let x = Math.round(cx - 9); x <= Math.round(cx + 9); x++) { G.set(x, 42, '#7a7684'); G.set(x, 43, '#3a3844'); }
  for (let y = 33; y <= 41; y++) G.set(Math.round(cx), y, '#2a1a12');
  pxBlob(G, cx, 31, 2, 2, LAVA[2]);
  pxBlob(G, cx - 3, 37, 3.5, 3, shade);
  pxBlob(G, cx + 3, 35, 3.5, 3, shade);
  // lava running in the cracks
  const r = mulberry32(944);
  for (let v = 0; v < 9; v++) {
    let x = cx - 14 + r() * 28, y = 30 + r() * 46;
    for (let s = 0; s < 14; s++) {
      if (G.get(Math.round(x), Math.round(y)) && G.get(Math.round(x), Math.round(y)) !== '#5a5866') G.set(x, y, s % 4 === 0 ? LAVA[1] : LAVA[2]);
      x += (r() - 0.5) * 2.2; y += r() * 1.6;
    }
  }
  return G.outline(() => '#0c0a0e').canvas();
}

// the open shaft that replaces mailsisibox's boarded lair once moe is beaten:
// the same rock mound and timber frame, planks gone, and a pair of rails
// running out of the dark
function makeShaft() {
  const w = 48, h = 40, cx = 23.5, ground = h - 2;
  const G = pixelGrid(w, h);
  rockMound(G, w, ground, false);
  for (let y = ground - 15; y <= ground; y++) for (let x = Math.round(cx - 7); x <= Math.round(cx + 7); x++) G.set(x, y, y > ground - 3 ? '#1a1410' : '#0d0a08');
  for (let y = ground - 17; y <= ground; y++) [[cx - 9, cx - 8], [cx + 8, cx + 9]].forEach(([a, b]) => { G.set(a, y, '#a8703f'); G.set(b, y, '#6b4422'); });
  for (let x = Math.round(cx - 10); x <= Math.round(cx + 10); x++) { G.set(x, ground - 18, '#c48a4f'); G.set(x, ground - 17, '#8a5a32'); }
  for (let y = ground - 6; y <= ground; y++) {
    const spread = 3 + (y - (ground - 6)) * 0.5;
    G.set(Math.round(cx - spread), y, '#8a8a94'); G.set(Math.round(cx + spread), y, '#8a8a94');
    if (y % 2 === 0) for (let x = Math.round(cx - spread); x <= Math.round(cx + spread); x++) if (!(x === Math.round(cx - spread) || x === Math.round(cx + spread))) G.set(x, y, '#5e3a1e');
  }
  return G.outline(() => '#262626').canvas();
}

// painting the race room, tile by tile with the mines' own textures and the
// same shading as outside: a darker band along the bottom of any wall with
// floor below it, a lit edge on top, and a shadow on the floor under a wall.
// then the checkered start and finish lines across the floor.
function paintRaceTile(g, tx, ty) {
  const t = RT[rti(tx, ty)], px = tx * TILE, py = ty * TILE;
  g.drawImage(TEX[t][(hash2(tx, ty, 7362) * 4) | 0], px, py);
  const below = rtAt(tx, ty + 1), above = rtAt(tx, ty - 1);
  if (SOLID[t]) {
    if (!SOLID[below]) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(px, py + 13, TILE, 3); }
    if (!SOLID[above]) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px, py, TILE, 1); }
  } else {
    if (SOLID[above]) { g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(px, py, TILE, 3); }
    if (t === T.WATER && above !== t && !SOLID[above]) { g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(px, py, TILE, 1); }
  }
}
function paintRaceRoom() {
  const c = mk(RACE_W, RACE_H), g = c.getContext('2d');
  for (let ty = 0; ty < RACE_ROWS; ty++) for (let tx = 0; tx < RACE_COLS; tx++) paintRaceTile(g, tx, ty);
  return c;
}
// after digging a block out: that tile and the ones round it (for the shading)
function repaintRace(tx, ty) {
  const g = raceRoom.canvas.getContext('2d');
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (tx + dx >= 0 && ty + dy >= 0 && tx + dx < RACE_COLS && ty + dy < RACE_ROWS) paintRaceTile(g, tx + dx, ty + dy);
  }
}

// the vault behind the door, where the statue stands: dark stone tiles, walls
// of basalt with lava glowing in the cracks, a channel of lava either side of
// the statue and a rope ladder up the back wall on the left (the way out)
const VAULT_COLS = 15, VAULT_ROWS = 12, VAULT_DOOR = 7;
function paintVault() {
  const w = VAULT_COLS * TILE, h = VAULT_ROWS * TILE, c = mk(w, h), g = c.getContext('2d');
  const dot = (x, y, col, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), ww, hh); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const wall = x < 16 || x >= w - 16 || y < 32 || (y >= h - 16 && Math.floor(x / TILE) !== VAULT_DOOR);
    const n = hash2(x, y, 950);
    if (wall) {
      const face = y >= 18 && y < 32 && x >= 16 && x < w - 16;
      const v = face ? 70 - (31 - y) * 2 : 30 + vnoise(x / 9, y / 9, 951) * 16;
      dot(x, y, `rgb(${v},${v - 4},${v - 2})`);
      if (vnoise(x / 5, y / 5, 952) > 0.78 && n < 0.5) dot(x, y, n < 0.2 ? '#ffb02e' : '#c8401a');
    } else {
      const tx = x % 16, ty = y % 16;
      const v = tx === 0 || ty === 0 ? 30 : 52 + (hash2(x >> 4, y >> 4, 953) - 0.5) * 14;
      dot(x, y, `rgb(${v},${v - 3},${v})`);
      if (n < 0.04) dot(x, y, '#6a646a');
    }
  }
  // lava channels either side of the statue
  [[64, 54], [160, 54]].forEach(([x0, y0]) => {
    for (let y = y0; y < y0 + 40; y++) for (let x = x0; x < x0 + 16; x++) {
      const edge = x === x0 || x === x0 + 15 || y === y0 || y === y0 + 39;
      dot(x, y, edge ? '#3a3036' : hash2(x, y, 954) < 0.3 ? '#ffd23f' : hash2(x, y, 955) < 0.5 ? '#ff8a1c' : '#e0561a');
    }
  });
  // the rope ladder
  for (let y = 4; y < 34; y++) { dot(30, y, '#8a6a3a'); dot(41, y, '#8a6a3a'); if (y % 5 === 0) dot(31, y, '#b88a4a', 10, 1); }
  // light from the race track coming in under the door
  const gr = g.createLinearGradient(0, h, 0, h - 26);
  gr.addColorStop(0, 'rgba(255,220,160,0.3)');
  gr.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = gr;
  g.fillRect(VAULT_DOOR * TILE, h - 26, TILE, 26);
  return c;
}

// the shaft out in the mines. it's mailsisibox's landmark, boarded up like the
// other lairs until moe is beaten, then the planks come off and you can walk in.
const shaftPoi = POIS.find(p => p.id === 'mailsisibox');
const shaftThing = shaftPoi.thing;
const SHAFT = makeShaft();
const shaftMouth = idx(shaftPoi.at[0], shaftPoi.at[1]);
const shaftOpen = () => found.has('mailsisi');
let shaftWasOpen = null;
function syncShaft() {
  const open = shaftOpen();
  if (open === shaftWasOpen) return;
  shaftWasOpen = open;
  shaftThing.frames = open ? [SHAFT] : SPRITE.lair;
  if (open) extraSolid.delete(shaftMouth);
  else extraSolid.add(shaftMouth);
}
syncShaft();

const raceRoom = {
  id: 'race', w: RACE_W, h: RACE_H, dust: '#6e6a64', shade: 0.62, underground: true, fight: false,
  canvas: paintRaceRoom(),
  outside: { x: shaftThing.x, y: shaftThing.y }, exit: { x: shaftThing.x, y: shaftThing.y + 10 },
  door: Math.floor(track.xs[0] / TILE),
  // the walls (checked at your feet, like any other room), the gems and rocks
  // in the way, and nothing past the door until it's open
  blocked: (x, y) => [[-4, -3], [3, -3], [-4, 0], [3, 0]].some(([dx, dy]) => raceSolid(x + dx, y + dy)) || (!DQ.doorOpen && y < DOOR_Y + 10)
    || obstacles.some(o => o.solid && !o.thing.gone && Math.abs(x - o.x) < 20 && Math.hypot(x - o.x, y - o.y) < o.r + 3),
  things: [], glows: []
};
const vaultWalls = roomWalls(VAULT_COLS, VAULT_ROWS, VAULT_DOOR);
const vaultRoom = {
  id: 'vault', w: VAULT_COLS * TILE, h: VAULT_ROWS * TILE, dust: '#4e4650', shade: 0.5, underground: true,
  canvas: paintVault(),
  // (outside and exit are the hatch the ladder comes up through, set once the
  // hatch has been placed further down)
  outside: { x: shaftThing.x, y: shaftThing.y }, exit: { x: shaftThing.x, y: shaftThing.y + 34 },
  door: VAULT_DOOR,
  // the walls, the statue, and the chest in front of it. the lava channels
  // aren't walls: you can walk into them, it just hurts (see vaultTick)
  blocked: (x, y) => vaultWalls(x, y) || (Math.abs(x - 120) < 26 && y > 74 && y < 104) || (Math.abs(x - 120) < 19 && y > 116 && y < 134),
  // the way down goes back out onto the track, in front of the door
  bottomTo: () => {
    room = raceRoom;
    player.x = DOOR_X;
    player.y = DOOR_Y + 30;
    player.face = 'down';
    particles.length = 0;
    Object.assign(cam, roomCam());
    sfx.ui();
  },
  things: [],
  glows: [
    { x: 72, y: 74, rgb: '255,140,40', rad: 3.2, flicker: true, strength: 0.32 },
    { x: 168, y: 74, rgb: '255,140,40', rad: 3.2, flicker: true, strength: 0.32 },
    { x: 120, y: 58, rgb: '255,170,60', rad: 2.6, flicker: true, strength: 0.26 },
    { x: 36, y: 22, rgb: '210,225,255', rad: 2.2, flicker: true, strength: 0.18 },
    { x: 120, y: 186, rgb: '255,220,160', rad: 2.6, flicker: true, strength: 0.16 }
  ]
};
EXTRA_ROOMS.push(raceRoom, vaultRoom);
BUILDINGS.push({
  thing: shaftThing, tile: shaftPoi.at, room: raceRoom, get name() { return DQ.won ? 'Darryl\'s Raceway' : 'Mine Shaft'; }, open: shaftOpen,
  shut: ['Sealed', '? ? ?', 'Beat the bosses before it first.'], hint: () => shaftOpen() && !DQ.seen
});

// the hatch. the vault is a long way down the tunnel from the shaft, so its
// ladder doesn't come out at the shaft (alex: it should make sense): it comes
// up through a hatch in the floor of an open bit of the mines, away from every
// landmark. it only opens from below, so it's shut tight until you've climbed
// out through it once (no skipping the race), and after that it's a way in
// and out both ways: walk into it and you climb down to the foot of the ladder.
function makeHatch(open) {
  const w = 30, h = 24, G = pixelGrid(w, h), cx = 14.5, cy = 12;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - cx) / 14, dy = (y - cy) / 11.5;
    const d = Math.sqrt(dx * dx + dy * dy) - (hash2(x >> 1, y >> 1, 960) - 0.5) * 0.2;
    if (d > 1) continue;
    const lit = -(dx * 0.5 + dy * 0.9) + (hash2(x, y, 961) - 0.5) * 0.5;
    G.set(x, y, lit > 0.4 ? '#a2a2a2' : lit > 0 ? '#8a8a8a' : lit > -0.4 ? '#6e6e6e' : '#585858');
  }
  const x0 = 7, x1 = 22, y0 = 5, y1 = 18;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const frame = x === x0 || x === x1 || y === y0 || y === y1;
    if (frame) { G.set(x, y, y === y0 || x === x0 ? '#a8703f' : '#5e3a1e'); continue; }
    if (!open) {
      // the trapdoor: planks with two iron straps and a ring to pull
      G.set(x, y, x % 4 === 0 ? '#4e301a' : y === 8 || y === 15 ? '#7a7a84' : '#8a5a32');
      continue;
    }
    // looking down it: dark, with the warm glow of the vault right at the bottom
    G.set(x, y, y > y1 - 4 ? (y === y1 - 1 ? '#7a2a10' : '#3a1208') : '#0a0807');
  }
  if (!open) { G.set(15, 11, '#c9c9d4'); G.set(14, 12, '#c9c9d4'); G.set(16, 12, '#c9c9d4'); G.set(15, 13, '#c9c9d4'); }
  else {
    // the top of the ladder poking up out of it
    for (let y = 1; y <= y1 - 2; y++) { G.set(10, y, y < y0 + 2 ? '#c48a4f' : '#6b4422'); G.set(19, y, y < y0 + 2 ? '#c48a4f' : '#6b4422'); }
    for (let y = 2; y <= y1 - 3; y += 3) for (let x = 11; x <= 18; x++) G.set(x, y, y < y0 + 2 ? '#d9a36a' : y < y0 + 7 ? '#8a5a32' : '#4e301a');
  }
  return G.outline(() => '#262626').canvas();
}
const HATCH_ART = [makeHatch(false), makeHatch(true)];
const HATCH_AT = (() => {
  // the nearest open, reachable stretch of mine floor to a spot in the east of
  // the mines, at least 6 tiles from any landmark and 5 from any mole hole
  const want = [100, 47];
  let best = null, bd = Infinity;
  for (let y = 44; y < H - 2; y++) for (let x = 62; x < W - 2; x++) {
    const i = idx(x, y);
    if (QUADS[quad[i]] !== 'mines' || tiles[i] !== T.FLOOR || !reach[i]) continue;
    let open = true;
    for (let dy = -1; dy <= 1 && open; dy++) for (let dx = -1; dx <= 1; dx++) if (solidTile(x + dx, y + dy) || tiles[idx(x + dx, y + dy)] === T.WATER) { open = false; break; }
    if (!open || POIS.some(q => Math.hypot(q.at[0] - x, q.at[1] - y) < 6) || MOLE_HOLES.some(([hx, hy]) => Math.hypot(hx - x, hy - y) < 5)) continue;
    const d = Math.hypot(x - want[0], y - want[1]);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
})();
// (and none of it is there at all until you've beaten darryl, alex: no way
// out of the tunnel's far end before you've earned it)
const hatchThing = { flat: true, hatch: true, x: HATCH_AT[0] * TILE + 8, y: HATCH_AT[1] * TILE + 14, frames: [HATCH_ART[DQ.hatch ? 1 : 0]], gone: !DQ.won };
things.push(hatchThing);
const hatchGlow = { x: hatchThing.x, y: hatchThing.y - 10, rgb: '255,150,60', rad: 1.6, flicker: true, strength: 0.2, off: !DQ.hatch || !DQ.won };
glows.push(hatchGlow);
vaultRoom.outside = { x: hatchThing.x, y: hatchThing.y };
vaultRoom.exit = { x: hatchThing.x, y: hatchThing.y + 28 };
BUILDINGS.push({
  thing: hatchThing, tile: HATCH_AT, room: vaultRoom, name: 'Hatch', hole: true, pit: { x: hatchThing.x, y: hatchThing.y - 11, w: 8 },
  open: () => !!DQ.hatch, shut: () => ['Shut tight', 'A hatch', 'It only opens from below.'], hint: () => false, arrive: { x: 36, y: 50 }
});

// the statue and the chest in the vault
const LAVA_LORD = makeLavaLord();
vaultRoom.things.push({ x: 120, y: 102, frames: [LAVA_LORD] });
function rollVaultLoot() {
  const out = [makeStack('iron', rand(4, 8)), makeStack('gold', rand(2, 5))];
  const add = (chance, id, a, b) => { if (Math.random() < chance) out.push(makeStack(id, rand(a, b))); };
  add(0.5, 'diamond', 1, 2);
  add(0.45, 'emerald', 1, 2);
  add(0.6, 'ruby', 2, 4);
  // better odds of the good stuff than moe's chest: about half the gear that
  // turns up here is emerald or diamond
  const tier = () => { const r = Math.random(); return r < 0.15 ? 'diamond' : r < 0.45 ? 'emerald' : 'iron'; };
  if (Math.random() < 0.4) out.push(makeStack(`${tier()}-sword`));
  if (Math.random() < 0.3) out.push(makeStack(`${tier()}-pickaxe`));
  if (Math.random() < 0.35) out.push(makeStack(`${tier()}-${ARMOR_SLOTS[(Math.random() * 4) | 0].piece}`));
  return Array.from({ length: 12 }, (_, i) => out[i] || null);
}
DQ.chest = Array.isArray(DQ.chest) ? Array.from({ length: 12 }, (_, i) => validStack(DQ.chest[i])) : rollVaultLoot();
// the vault's chest sits right in front of the statue, and it's the grandest
// chest in the game: black lacquered wood with gold bands and corners, an
// arched lid with a gold flame on it, lava-orange inlay glowing in the front,
// a big gold lock with a ruby set in it, and gold claw feet
function makeVaultChest() {
  const w = 36, h = 28, G = pixelGrid(w, h), cx = 17.5;
  for (let y = 11; y <= 24; y++) for (let x = 1; x <= 34; x++) {
    const band = x === 5 || x === 30 || y === 11 || y === 24;
    let col = band ? (y === 11 ? '#fff0a0' : '#d9a92b') : x < 4 ? '#4a4252' : x > 32 ? '#1c1820' : '#2e2836';
    if (!band && (y === 15 || y === 20) && x > 6 && x < 29) col = (x + y) % 3 ? '#ff8a2a' : '#ffd27a';
    G.set(x, y, col);
  }
  for (let y = 2; y <= 10; y++) {
    const inset = Math.round(Math.max(0, 4 - y) * 1.5);
    for (let x = 1 + inset; x <= 34 - inset; x++) {
      const rim = y === 10 || x === 1 + inset || x === 34 - inset || y === 2;
      G.set(x, y, rim ? (y < 4 ? '#fff0a0' : '#d9a92b') : y < 5 ? '#4a4252' : '#3a3240');
    }
  }
  // the gold flame on the lid
  [[17, 4], [18, 4], [17, 5], [18, 5], [16, 6], [17, 6], [18, 6], [19, 6], [17, 7], [18, 7], [18, 3], [16, 5], [19, 5]].forEach(([x, y]) => G.set(x, y, y < 5 ? '#fff0a0' : '#f2c84b'));
  // the lock with its ruby, and the keyhole
  for (let y = 8; y <= 16; y++) for (let x = 14; x <= 21; x++) G.set(x, y, y === 8 || x === 14 ? '#fff0a0' : x === 21 || y === 16 ? '#a8800f' : '#e6b83a');
  pxBlob(G, cx, 11, 1.6, 1.6, (dx, dy) => (dx + dy < -0.4 ? '#ffb0a0' : '#d0342c'));
  G.set(17, 14, '#3a2a0a'); G.set(18, 14, '#3a2a0a'); G.set(17, 15, '#3a2a0a');
  // claw feet
  [[2, 25], [31, 25]].forEach(([x, y]) => { for (let k = 0; k < 4; k++) { G.set(x + k, y, '#d9a92b'); G.set(x + k, y + 1, k % 2 ? '#a8800f' : '#f2c84b'); } });
  return G.outline(() => '#120c06').canvas();
}
const vaultChest = addStation('chest', 120, 134, vaultRoom);
vaultChest.frames = [makeVaultChest()];
vaultRoom.glows.push({ x: 120, y: 124, rgb: '255,210,120', rad: 2.4, flicker: true, strength: 0.2 });
vaultChest.slots = DQ.chest;
vaultChest.where = 'in the vault';

// what's along the track: the gems and rocks you can hit, the holes, torches
// on the walls every so often, the skeletons of the people who lost to him,
// and the big door
obstacles.forEach(o => {
  if (o.kind === 'gem') { o.thing = { x: o.x, y: o.y + 6, frames: [GEM_ART[o.gem]] }; o.solid = true; }
  else if (o.kind === 'rock') { o.thing = { x: o.x, y: o.y + 6, frames: [JAGGED] }; o.solid = true; }
  else if (o.kind === 'hole') o.thing = { flat: true, x: o.x, y: o.y + 12, frames: [HOLE] };
  if (o.thing) raceRoom.things.push(o.thing);
});
{
  // torches stand against the bottom of a wall that has floor in front of it,
  // spread out so no two are within 120 px
  const spots = [];
  for (let ty = 1; ty < RACE_ROWS - 1; ty++) for (let tx = 1; tx < RACE_COLS - 1; tx++) {
    if (SOLID[RT[rti(tx, ty)]] && RT[rti(tx, ty + 1)] === T.FLOOR) spots.push([tx, ty, hash2(tx, ty, 7364)]);
  }
  spots.sort((a, b) => a[2] - b[2]);
  const lit = [];
  spots.forEach(([tx, ty]) => {
    const x = tx * TILE + 8, y = ty * TILE + 15;
    if (Math.abs(x - DOOR_X) < 48 && y < DOOR_Y + 30) return;
    if (lit.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < 120)) return;
    lit.push([x, y]);
    raceRoom.things.push({ x, y, frames: TORCH, fps: 7, phase: tx % 3 });
    raceRoom.glows.push({ x, y: y - 12, rgb: GLOW.torch, rad: 3.4, flicker: true, strength: 0.24 });
  });
}
// a skeleton for every race you've lost (up to ten), but not lying across the
// floor where you fell (alex: that was awkward): they're part of the scenery
// of the stretch between the finish line and the door, slumped against its
// walls, one more each time, alternating sides and spread along it. they're
// flat, so you walk and drive over them like the floor.
const REMAINS_SPOTS = (() => {
  const out = [], ty0 = Math.floor(DOOR_Y / TILE) + 3, ty1 = FLAG_ROWS[1].ty - 2;
  for (let k = 0; k < 10; k++) {
    const ty = Math.round(ty1 - ((ty1 - ty0) * (Math.floor(k / 2) + (k % 2) * 0.5)) / 5), side = k % 2 ? 1 : -1;
    // from the middle of the track out to the last floor tile before the wall
    let tx = Math.floor(DOOR_X / TILE);
    while (rtAt(tx + side, ty) === T.FLOOR) tx += side;
    out.push({ x: tx * TILE + 8 + side * 1, y: ty * TILE + 14, side });
  }
  return out;
})();
const remains = [];
function showRemains() {
  remains.forEach(o => { const i = raceRoom.things.indexOf(o); if (i >= 0) raceRoom.things.splice(i, 1); });
  remains.length = 0;
  REMAINS_SPOTS.slice(0, Math.min(10, DQ.bones.length)).forEach((sp, k) => {
    // (the art leans on a wall to its left, so the ones against the right
    // hand wall are mirrored)
    const o = { flat: true, x: sp.x + (sp.side < 0 ? 4 : -4), y: sp.y, frames: [(sp.side < 0 ? REMAINS_ART : REMAINS_FLIP)[k % 4]] };
    remains.push(o);
    raceRoom.things.push(o);
  });
}
// (bones only counts how many there are now; the spots are fixed)
function addBones(x, y) {
  if (DQ.bones.length < 10) DQ.bones.push([Math.round(x), Math.round(y)]);
}
showRemains();
// the banner over the finish: a post either side of the track and a red
// banner hung between them with FINISH across it in big letters, gold edges,
// and a row of little pennants hanging underneath
const BANNER_FONT = {
  F: ['11111', '10000', '11110', '10000', '10000', '10000', '10000'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001']
};
function makeBanner(w) {
  const h = 56, G = pixelGrid(w, h), top = 6, bh = 15;
  for (let y = 2; y < h; y++) [[1, 3], [w - 4, w - 2]].forEach(([a, b]) => { for (let x = a; x <= b; x++) G.set(x, y, x === a ? '#c48a4f' : x === b ? '#5e3a1e' : '#8a5a32'); });
  [[2, 1], [w - 3, 1]].forEach(([x, y]) => pxBlob(G, x, y, 1.6, 1.6, '#ffd23f'));
  for (let y = top; y < top + bh; y++) for (let x = 5; x < w - 5; x++) {
    const edge = y === top || y === top + bh - 1;
    G.set(x, y, edge ? '#ffd23f' : y === top + 1 ? '#e04a3a' : y === top + bh - 2 ? '#8a2018' : '#c0302a');
  }
  for (let x = 6; x < w - 6; x += 6) for (let k = 0; k < 4; k++) for (let j = -2 + k; j <= 2 - k; j++) G.set(x + j + 2, top + bh + k, (x / 6) % 2 ? '#f2f0ea' : '#ffd23f');
  const word = 'FINISH', gap = 2, tw = [...word].reduce((n, ch) => n + BANNER_FONT[ch][0].length + gap, -gap);
  let cx = Math.round(w / 2 - tw / 2);
  [...word].forEach(ch => {
    BANNER_FONT[ch].forEach((row, y) => [...row].forEach((on, x) => {
      if (on !== '1') return;
      G.set(cx + x + 1, top + 4 + y + 1, '#5a1410');
      G.set(cx + x, top + 4 + y, '#fff6dc');
    }));
    cx += BANNER_FONT[ch][0].length + gap;
  });
  return G.outline(() => '#1a0c08').canvas();
}
{
  const f = FLAG_ROWS[1], w = (f.x1 - f.x0 + 1) * TILE + 8;
  raceRoom.things.push({ x: Math.round(((f.x0 + f.x1 + 1) * TILE) / 2), y: f.ty * TILE + 15, frames: [makeBanner(w)] });
  raceRoom.glows.push({ x: ((f.x0 + f.x1 + 1) * TILE) / 2, y: f.ty * TILE - 30, rgb: '255,200,140', rad: 3.6, flicker: true, strength: 0.22 });
}
const door = { x: DOOR_X, y: DOOR_Y, frames: [DOOR_ART[DQ.doorOpen ? DOOR_STEPS : 0]], k: DQ.doorOpen ? 1 : 0 };
raceRoom.things.push(door);
door.glow = { x: DOOR_X, y: DOOR_Y + 8, rgb: GLOW.torch, rad: 3.2, flicker: true, strength: 0.26 };
raceRoom.glows.push(door.glow);

// the carts. yours is driven with the keys (see driveCart), darryl's runs
// along the track by itself (see driveDarryl). a cart with a rider draws the
// rider sitting in it.
const carts = {
  you: { look: 'you', x: 0, y: 0, a: 0, v: 0, frames: [mk(CART_D, CART_D)], draw: drawCart },
  darryl: { look: 'darryl', x: 0, y: 0, a: 0, v: 0, s: 0, d: 0, frames: [mk(CART_D, CART_D)], draw: drawCart }
};
Object.values(carts).forEach(c => {
  c.lamp = { x: 0, y: 0, rgb: '255,226,150', rad: 2.6, flicker: true, strength: 0.3 };
  raceRoom.glows.push(c.lamp);
  raceRoom.things.push(c);
});
const darryl = { darryl: true, x: 0, y: 0, flip: true, state: 'wait', t: 0, anim: 0, frames: [mk(DARRYL_W, DARRYL_H)], draw: drawDarryl };
darryl.lamp = { x: 0, y: 0, rgb: '255,236,170', rad: 2.2, flicker: true, strength: 0.3 };
raceRoom.things.push(darryl);
raceRoom.glows.push(darryl.lamp);

// the numbers. your cart: top speed, how hard it pulls away and brakes, how
// much it rolls on with nothing pressed, and grip, which is what makes it
// handle like a real cart: you can only turn as hard as grip / speed, so the
// faster you go the wider you turn, and the sharp bends need you to brake.
// pivot is how fast it turns when it's barely moving, so you can turn it round
// after stopping against a wall. darryl's a bit slower and doesn't drive a
// perfect line (he wanders about a bit and brakes early), so there's time to
// be made on him, and a clean run beats him comfortably.
const RACE = { vmax: 195, acc: 140, brake: 300, coast: 26, grip: 340, turn: 3.2, pivot: 1.8, mud: 0.45, water: 0.6 };
const DARRYL = { vmax: 182, grip: 300, acc: 120, brake: 250, lane: 100 };
const vprofFor = (grip, vmax, brake) => {
  const v = new Float32Array(track.n);
  for (let i = 0; i < track.n; i++) v[i] = Math.min(vmax, Math.sqrt(grip / Math.max(Math.abs(track.k[i]), 1e-5)));
  for (let i = track.n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * brake * DS));
  return v;
};
const DARRYL_V = vprofFor(DARRYL.grip, DARRYL.vmax, DARRYL.brake);

const race = { phase: 'pre', t: 0, riding: false, result: null, pFin: null, dFin: null, judge: null, thief: null, goT: 0 };
let helpOpen = false, hopChip = false;

function parkCart(c, s, d) {
  const p = trackPt(s, d);
  Object.assign(c, { x: p.x, y: p.y, a: p.a, v: 0, s, d, dT: d, spin: null, hole: null, spinA: 0, sink: 0, vmul: 1, crack: 0, cool: {}, rider: null, fin: false, stopped: true, slipped: {}, gone: false });
  c.lamp.off = false;
}
const darrylHome = () => trackPt(S_START - 56, 30);
function standDarryl(x, y, flip) { Object.assign(darryl, { x, y, flip, state: 'wait', t: 0, gone: false, alpha: 1, hop: 0, goal: null }); }
// back to before the race: everyone at the start line, every rock back in place
function resetRace() {
  Object.assign(race, { phase: 'pre', t: 0, riding: false, result: null, pFin: null, dFin: null, judge: null, thief: null, poof: null, goT: 0 });
  obstacles.forEach(o => { if (o.thing) o.thing.gone = false; o.broken = false; });
  parkCart(carts.you, S_START, -30);
  parkCart(carts.darryl, S_START, 30);
  const h = darrylHome();
  standDarryl(h.x, h.y, true);
  darryl.talked = false;
}
// once you've won: darryl and his cart wait at the door (unless he's run off),
// and your cart is back at the start so you can ride down to the door again
function resetFree() {
  Object.assign(race, { phase: 'free', t: 0, riding: false, result: null, pFin: null, dFin: null, judge: null, thief: null, poof: null });
  obstacles.forEach(o => { if (o.thing) o.thing.gone = false; o.broken = false; });
  parkCart(carts.you, S_START, -30);
  parkCart(carts.darryl, S_STOP, 30);
  carts.darryl.gone = true;
  carts.darryl.lamp.off = true;
  const p = trackPt(S_STOP + 40, 6);
  standDarryl(p.x, p.y, false);
  darryl.gone = DQ.fled;
  darryl.talked = false;
}
if (DQ.won) resetFree(); else resetRace();

// the moving bits of a cart that's yours to drive
// (a cart can't go through the big door, even open, or out the way you came in)
function cartFits(x, y) { return !(Math.abs(x - DOOR_X) < 60 && y < DOOR_Y + 16) && y < RACE_H - 24 && onFloor(x, y, 8); }
function surfaceAt(x, y) {
  const t = rtAt(Math.floor(x / TILE), Math.floor(y / TILE));
  return t === T_MUD ? 'mud' : t === T.WATER ? 'water' : null;
}
function mashPress() {
  const c = carts.you;
  // only a few presses each (alex: it should be worth mashing to save a run,
  // not slower than just sitting there): three to steady a spin, four to get
  // out of a hole
  if (c.spin) { c.spin.meter = Math.min(1, c.spin.meter + 0.34); sfx.mash(); }
  else if (c.hole) { c.hole.meter = Math.min(1, c.hole.meter + 0.26); sfx.mash(); c.hole.wob = 0.12; }
}
function driveCart(c, dt) {
  const k = code => keys.has(code);
  // past the finish line in a race it drives itself to a stop. after you've
  // won (the free ride) it never does: you can drive it up and down the whole
  // track as you like (alex)
  const auto = c.fin && race.phase !== 'free';
  let up = !auto && (k('KeyW') || k('ArrowUp')), down = !auto && (k('KeyS') || k('ArrowDown'));
  let steer = auto ? 0 : (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
  const here = trackAt(c.x, c.y);
  c.s = here ? here.s : c.s;
  // past the finish line it drives itself to a stop in its lane
  if (auto) {
    const p = trackPt(c.s + 40, c.lane);
    const want = Math.atan2(p.y - c.y, p.x - c.x), diff = Math.atan2(Math.sin(want - c.a), Math.cos(want - c.a));
    steer = clamp(diff * 3, -1, 1);
    const vStop = Math.sqrt(2 * 300 * Math.max(0, S_STOP - c.s));
    if (c.v > vStop) down = true; else if (c.v < vStop - 20 && vStop > 30) up = true;
  }
  if (c.hole) {
    // stuck down a hole until you mash your way out
    const h = c.hole;
    h.t += dt;
    // (checked before it drains, or a bar mashed full could slip back under)
    if (h.meter < 1) h.meter = Math.max(0, h.meter - 0.08 * dt);
    h.wob = Math.max(0, (h.wob || 0) - dt);
    c.v = 0;
    c.x += (h.o.x - c.x) * Math.min(1, dt * 10);
    c.y += (h.o.y - c.y) * Math.min(1, dt * 10);
    c.sink = Math.min(7, h.t * 40) - (h.wob > 0 ? 2 : 0);
    if (h.meter >= 1) {
      const out = trackPt(h.o.s + h.o.r + 20, clamp(h.o.d, -40, 40));
      Object.assign(c, { x: out.x, y: out.y, a: out.a, v: 55, hole: null, sink: 0 });
      c.cool[h.o.n] = 1.5;
      burst(h.o.x, h.o.y - 2, '138,106,76', 14);
      floatText('Out!', c.x, c.y - 30, '#9bf07a');
      sfx.crunch();
    }
    return;
  }
  const surf = surfaceAt(c.x, c.y);
  const vmax = RACE.vmax * c.vmul * (surf === 'mud' ? RACE.mud : surf === 'water' ? RACE.water : 1);
  if (c.spin) {
    // spinning out: no steering, no power, sliding on and slowing down until
    // you mash it steady (or it grinds to a halt)
    if (c.spin.meter < 1) c.spin.meter = Math.max(0, c.spin.meter - 0.2 * dt);
    c.spinA += dt * (9 + c.v / 14);
    c.v *= Math.exp(-1.1 * dt);
    if (c.spin.meter >= 1) { c.spin = null; floatText('Steady!', c.x, c.y - 30, '#9bf07a'); sfx.found(); }
    else if (c.v < 10) { c.v = 0; c.spin = null; floatText('Stopped', c.x, c.y - 30, '#ff9a6b'); sfx.deny(); }
  } else {
    // settle the cart back to pointing where it's going after a spin
    c.spinA = Math.atan2(Math.sin(c.spinA), Math.cos(c.spinA)) * Math.max(0, 1 - dt * 8);
    if (up && c.v < vmax) c.v += RACE.acc * Math.max(0.12, 1 - Math.max(0, c.v) / vmax) * dt;
    if (down) c.v = c.v > 0 ? Math.max(0, c.v - RACE.brake * dt) : Math.max(-35, c.v - 70 * dt);
    if (!up && !down) c.v -= Math.sign(c.v) * Math.min(Math.abs(c.v), RACE.coast * dt);
    if (c.v > vmax) c.v -= (c.v - vmax) * 3 * dt;
    const sp = Math.abs(c.v);
    const w = steer * (sp < 35 ? RACE.pivot : Math.min(RACE.turn, RACE.grip / sp)) * (c.v < -1 ? -1 : 1);
    c.a += w * dt;
    if (steer) c.v -= c.v * 0.1 * dt;
    // a cracked cart sheds splinters as it rattles along
    if (c.crack && sp > 60 && !reduceMotion && Math.random() < dt * 3 * c.crack) {
      particles.push({ x: c.x + (Math.random() - 0.5) * 12, y: c.y - 4, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 20, g: 120, life: 0.5, t: 0, col: Math.random() < 0.5 ? '#c48a4f' : '#f0d8a8', size: 1 });
    }
    // sparks off the wheels in a hard turn at speed
    if (steer && sp > 120 && !reduceMotion && Math.random() < dt * 20) {
      particles.push({ x: c.x - Math.cos(c.a) * 8, y: c.y - Math.sin(c.a) * 8, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 20, g: 80, life: 0.3, t: 0, col: Math.random() < 0.5 ? '#ffd23f' : '#ff9a3c', size: 1 });
    }
  }
  moveCart(c, dt);
  hitObstacles(c, dt);
}
function moveCart(c, dt) {
  const vx = Math.cos(c.a) * c.v * dt, vy = Math.sin(c.a) * c.v * dt;
  if (cartFits(c.x + vx, c.y + vy)) { c.x += vx; c.y += vy; return; }
  // into a wall. it never bounces you back the way you came (it used to, and
  // alex found it confusing): grazing a wall slides you along it, scraping off
  // some speed, more the more head on you hit it, and a proper slam stops you
  // dead. from there a and d turn you round on the spot (see RACE.pivot). how
  // head on it was is judged against the way the track runs, not the edge of
  // the one tile you touched, since the walls are jagged and a single notch
  // would otherwise count as a slam. the slide looks for the nearest clear
  // direction either side of where you're pointing.
  const t = trackAt(c.x, c.y), run = t ? track.ang[t.i] : c.a;
  let into = Math.abs(Math.atan2(Math.sin(c.a - run), Math.cos(c.a - run)));
  if (into > Math.PI / 2) into = Math.PI - into;
  const sp = Math.abs(c.v);
  let slid = false;
  if (into < 0.95) {
    for (const dd of [0.2, -0.2, 0.4, -0.4]) {
      const mx = Math.cos(c.a + dd) * c.v * dt, my = Math.sin(c.a + dd) * c.v * dt;
      if (cartFits(c.x + mx, c.y + my)) { c.x += mx; c.y += my; slid = true; break; }
    }
    // a diagonal wall is a staircase of tiles, which a cart can't slide along
    // by turning a little: so it slides the way the track runs instead, eased
    // a pixel off the wall towards the middle
    if (!slid && t) {
      const dir = Math.cos(c.a - run) >= 0 ? run : run + Math.PI, k = Math.abs(c.v) * dt * Math.cos(into);
      const toC = Math.atan2(track.ys[t.i] - c.y, track.xs[t.i] - c.x);
      for (const [mx, my] of [[Math.cos(dir) * k + Math.cos(toC) * 1.2, Math.sin(dir) * k + Math.sin(toC) * 1.2], [Math.cos(toC) * 1.5, Math.sin(toC) * 1.5]]) {
        if (cartFits(c.x + mx, c.y + my)) { c.x += mx; c.y += my; slid = true; break; }
      }
    }
  }
  if (!slid) {
    if (sp > 70) { addShake(2.5); sfx.hit(); burst(c.x + Math.cos(c.a) * 10, c.y + Math.sin(c.a) * 10, '160,160,160', 10); }
    c.v = 0;
    return;
  }
  c.v -= c.v * Math.min(1, (0.3 + into * 2.5) * dt);
  if (sp > 60 && !reduceMotion && Math.random() < dt * 30) {
    particles.push({ x: c.x + Math.cos(c.a) * 8, y: c.y + Math.sin(c.a) * 8, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 25, g: 90, life: 0.25, t: 0, col: Math.random() < 0.5 ? '#ffd23f' : '#ffffff', size: 1 });
  }
}
// what your cart runs into: a gem spins you out, a jagged rock cracks the cart
// (a little slower for the rest of the race), a hole swallows it, and darryl's
// cart shoves you aside
function hitObstacles(c, dt) {
  for (const key in c.cool) c.cool[key] -= dt;
  for (const o of obstacles) {
    if (Math.abs(o.x - c.x) > 40 || Math.abs(o.y - c.y) > 40 || (c.cool[o.n] || 0) > 0) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (o.kind === 'gem' && d < o.r + 8 && !c.spin) {
      c.spin = { meter: 0 };
      c.v *= 0.8;
      c.cool[o.n] = 1;
      c.x += ((c.x - o.x) / (d || 1)) * 4; c.y += ((c.y - o.y) / (d || 1)) * 4;
      burst(o.x, o.y - 6, '255,140,200', 12);
      floatText('Spin out! Mash W!', c.x, c.y - 30, '#ffd23f');
      sfx.clang();
      addShake(2);
    } else if (o.kind === 'rock' && !o.broken && d < o.r + 8) {
      o.broken = true;
      o.thing.gone = true;
      c.crack++;
      c.vmul *= 0.9;
      c.v *= 0.62;
      burst(o.x, o.y - 4, '150,150,150', 18);
      floatText('Cracked!', c.x, c.y - 30, '#ff6b6b');
      sfx.crunch();
      addShake(3);
    } else if (o.kind === 'hole' && d < o.r * 0.8 && !c.hole) {
      c.hole = { o, meter: 0, t: 0 };
      c.spin = null;
      floatText('Stuck! Mash W!', c.x, c.y - 30, '#ffd23f');
      sfx.rumble();
      addShake(2);
    }
  }
  const D = carts.darryl;
  if (D.rider) {
    const d = Math.hypot(D.x - c.x, D.y - c.y);
    if (d < 18 && d > 0) {
      c.x += ((c.x - D.x) / d) * (18 - d);
      c.y += ((c.y - D.y) / d) * (18 - d);
      c.v *= 0.97;
    }
  }
}

// darryl drives by the track itself: how far along he is (s), how far off the
// centre line (d), and his speed, which follows how sharp the track is coming
// up (DARRYL_V). he picks a lane clear of whatever's ahead, cutting a little
// into the inside of each bend, except for his two slip ups (MISTAKE): one gem
// he spins out on and one patch of mud he ploughs straight through.
function chooseLane(c) {
  const i = clamp(Math.round(c.s / DS), 0, track.n - 1);
  const pref = clamp(track.k[i] * 1300, -14, 14);
  const ahead = obstacles.filter(o => o.s > c.s - 6 && o.s < c.s + 200 && !o.broken);
  const slip = ahead.find(o => (o.n === MISTAKE.gem || o.n === MISTAKE.mud) && !c.slipped[o.n]);
  if (slip && slip.s < c.s + 150) return slip.d;
  let best = c.d, bestCost = Infinity;
  // (lanes stop 44 either side: the jagged walls come in to about 56 in
  // places, and a cart is 8 from its middle to its side)
  for (let lane = -44; lane <= 44; lane += 4) {
    let cost = Math.abs(lane - pref) + Math.abs(lane - c.d) * 0.4;
    ahead.forEach(o => {
      const gap = o.r + 13, off = Math.abs(lane - o.d), near = Math.max(0.2, 1 - (o.s - c.s) / 220);
      if (off < gap) cost += (1000 + (gap - off) * 20) * near;
      // and don't cut across in front of something close: going round it on
      // the other side means driving straight through it
      if (o.s - c.s < 150 && (lane - o.d) * (c.d - o.d) < 0) cost += 600 * near;
    });
    if (cost < bestCost) { bestCost = cost; best = lane; }
  }
  return best;
}
function driveDarryl(c, dt) {
  const i = clamp(Math.round(c.s / DS), 0, track.n - 1);
  if (c.spin) {
    c.spin.t += dt;
    c.spinA += dt * (9 + c.v / 14);
    c.v *= Math.exp(-1.6 * dt);
    if (c.spin.t > 0.8) c.spin = null;
  } else {
    c.spinA = Math.atan2(Math.sin(c.spinA), Math.cos(c.spinA)) * Math.max(0, 1 - dt * 8);
    // he's not a perfect driver: his pace comes and goes a little
    c.wobT = (c.wobT || 0) + dt;
    let vT = Math.min(DARRYL.vmax * c.vmul, DARRYL_V[i]) * (0.95 + 0.05 * Math.sin(c.wobT * 0.6 + 2));
    if (c.fin) vT = Math.min(vT, Math.sqrt(2 * 300 * Math.max(0, S_STOP - c.s)));
    const surf = surfaceAt(c.x, c.y);
    if (surf) vT = Math.min(vT, DARRYL.vmax * (surf === 'mud' ? RACE.mud : RACE.water));
    c.v += clamp(vT - c.v, -DARRYL.brake * dt, DARRYL.acc * dt);
  }
  if (!c.fin) c.dT = chooseLane(c);
  else c.dT = 30;
  // and he drifts about his line when there's nothing right in front of him
  const calm = !c.fin && !obstacles.some(o => o.s > c.s - 10 && o.s < c.s + 150);
  const wander = calm ? Math.sin((c.wobT || 0) * 0.9 + 1.3) * 12 + Math.sin((c.wobT || 0) * 2.1) * 4 : 0;
  c.d += clamp(c.dT + wander - c.d, -DARRYL.lane * dt, DARRYL.lane * dt);
  c.s = Math.min(c.s + c.v * dt, S_STOP + 2);
  const p = trackPt(c.s, c.d);
  c.x = p.x; c.y = p.y; c.a = p.a;
  obstacles.forEach(o => {
    if (o.s < c.s - 20) c.slipped[o.n] = true;
    if (Math.abs(o.s - c.s) > 24 || (c.cool[o.n] || 0) > 0) return;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (o.kind === 'gem' && d < o.r + 8 && !c.spin) {
      c.spin = { t: 0 };
      c.v *= 0.6;
      c.cool[o.n] = 2;
      burst(o.x, o.y - 6, '255,140,200', 12);
      if (Math.hypot(c.x - player.x, c.y - player.y) < 260) { floatText('Whoa!', c.x, c.y - 34, '#e8e1cc'); sfx.clang(); }
    } else if (o.kind === 'rock' && !o.broken && d < o.r + 8) {
      o.broken = true; o.thing.gone = true; c.vmul *= 0.92; c.v *= 0.7;
      burst(o.x, o.y - 4, '150,150,150', 14);
    } else if (o.kind === 'hole' && d < o.r * 0.8) {
      c.v *= 0.5; c.cool[o.n] = 2;
    }
  });
  for (const key in c.cool) c.cool[key] -= dt;
  if (!c.fin && c.s >= S_FIN) {
    c.fin = true;
    race.dFin = race.t;
    if (!race.result) race.result = 'lose';
  }
  if (c.fin && c.v < 3 && c.s > S_STOP - 8) c.stopped = true;
}

// talking. a conversation is a list of steps: darryl says something
// ({ d: text }), you say something ({ you: text }, which you pick like a
// reply), or something happens ({ act, wait }). it's typed out a letter at a
// time. click, space, enter or e skips to the end of a line, then goes on.
const talkEl = $('#talk'), talkName = $('#talk-name'), talkText = $('#talk-text');
let talk = null;
// you turn to face him whenever a conversation starts. who is who's talking
// to you: darryl, unless it's somebody else (the ore wolf talks to you with the
// same box, js/resume-game-wolf.js): their name, their voice, where they are
// (to face them) and a class for the box.
const DARRYL_WHO = { name: 'Darryl', voice: mood => sfx.darryl(mood), at: () => (darryl.gone ? null : darryl), cls: '' };
function faceToward(x, y) {
  const dx = x - player.x, dy = y - player.y;
  if (Math.abs(dx) >= Math.abs(dy) * 0.8) { player.face = 'side'; player.flip = dx < 0; }
  else player.face = dy < 0 ? 'up' : 'down';
}
function startTalk(steps, done, who = DARRYL_WHO) {
  const at = who.at();
  if (at) faceToward(at.x, at.y);
  talk = { steps, i: -1, t: 0, done, who };
  talkEl.className = `talk px${who.cls ? ` ${who.cls}` : ''}`;
  document.body.classList.add('is-talking');
  nextLine();
}
function nextLine() {
  talk.i++;
  if (talk.i >= talk.steps.length) { endTalk(); return; }
  const st = talk.steps[talk.i];
  talk.t = 0;
  talk.shown = -1;
  if (st.act) st.act();
  if (!talk) return;
  talkEl.hidden = !!st.act;
  talkEl.classList.toggle('is-reply', !!st.you);
  talkName.textContent = st.you ? 'You' : st.name || talk.who.name;
  talkText.textContent = '';
}
function advanceTalk() {
  if (!talk) return;
  const st = talk.steps[talk.i];
  if (st.act) return;
  const text = st.d || st.you;
  if (st.d && talk.t * TALK_RATE < text.length) { talk.t = text.length / TALK_RATE; return; }
  if (st.you) sfx.you(text);
  else sfx.ui();
  nextLine();
}
function endTalk(quiet) {
  const done = talk && talk.done;
  talk = null;
  talkEl.hidden = true;
  document.body.classList.remove('is-talking');
  if (done && !quiet) done();
}
const TALK_RATE = 42;
function tickTalk(dt) {
  if (!talk) return;
  const st = talk.steps[talk.i];
  talk.t += dt;
  if (st.act) { if (talk.t >= (st.wait || 0)) nextLine(); return; }
  const text = st.d || st.you;
  const n = st.you ? text.length : Math.min(text.length, Math.floor(talk.t * TALK_RATE));
  if (n !== talk.shown) {
    const was = talk.shown;
    talk.shown = n;
    talkText.textContent = (st.you ? '▶ ' : '') + text.slice(0, n);
    // his voice, a little blip on every other letter as it's typed out
    if (st.d && n > was && /[a-z0-9]/i.test(text[n - 1] || '') && (n % 2 === 0 || n - was > 1)) talk.who.voice(st.mood);
  }
}
const typing = () => talk && talk.steps[talk.i].d && talk.t * TALK_RATE < talk.steps[talk.i].d.length;

// what he says. the greeting grows the more times you've lost to him.
function greeting() {
  // (your answer comes before his extra lines, so it plays out in order)
  const L = DQ.losses, lines = [{ d: 'Hey there buddy, looking for the next landmark?' }, { you: 'Yeah, I am.' }];
  if (L >= 1) lines.push({ d: 'Haven\'t I seen you before?' });
  if (L >= 3 && L <= 8) lines.push({ d: 'You really don\'t give up huh?' });
  if (L >= 9) lines.push({ d: `I think you should probably give up man. ${L + 1} tries is honestly embarrassing.` });
  return lines.concat(
    { d: `${L ? 'Anyways, it' : 'It'}'s at the end of this corridor, we'll have to take the minecarts.` },
    { you: 'Could you take me there?' },
    { d: 'Sure, but last one there\'s a rotting skeleton!' }
  );
}
function winTalk() {
  const bling = STASH_SLOTS.some(k => DQ.stash[k]);
  const steps = [
    { d: 'Wow, bested by some random dude.' },
    { d: 'You do look kinda familiar though?' },
    { d: 'Like that one guy from that other universe!' },
    { d: 'Well, that\'s impossible I guess.' },
    { you: 'Uhhh.... ok.' },
    { you: 'So I assume you can open that door?' },
    { d: 'A deal is a deal.' },
    { act: popArm, wait: 1.2 }
  ];
  if (bling) steps.push({ d: 'Sorry for taking your bling, I couldn\'t help it.' }, { act: giveBling, wait: 0.4 + STASH_SLOTS.filter(k => DQ.stash[k]).length * 0.35 });
  return steps;
}
function coreTalk() {
  return [
    { d: 'Hey, what\'s that glowing in your bag?', mood: 'idle' },
    { you: 'Huh?' },
    { d: 'Wait. No. No no no no no.', mood: 'scared' },
    { d: 'It\'s YOU! You came back! They said you\'d come back for it!', mood: 'scared' },
    { d: 'The universes, the timelines, the horrors! I didn\'t touch anything, I swear! I just race carts!', mood: 'scared' },
    { you: 'Darryl, you good bro?' },
    { d: 'Take it! Take it and leave me alone!', mood: 'scared' },
    { act: fleeDarryl, wait: 1.8 },
    { you: 'That was weird...' }
  ];
}

// losing: what he says before he zaps you, depending on how many times he's
// beaten you already (alex's lines). he frowns through all of it.
function loseTalk() {
  const L = DQ.losses;
  const lines = L === 0 ? ['Guess I\'m still the best racer.', 'Sorry about this man...']
    : L <= 2 ? ['Told you I am the best racer. At least, I think I did.', 'I\'m sorry...']
      : L <= 8 ? ['Told you I am the best racer. Right?', 'Yeah, I\'m pretty sure I did.']
        : ['Told you I am the best racer.', 'Am I getting deja vu?', 'Wait, is that?', 'Nah, I\'m probably seeing things.'];
  return lines.map(d => ({ d, mood: 'frown' }));
}

// winning: he pops his near arm off and it lands as the bone key. then he
// gives back anything he's taken off you.
function popArm() {
  DQ.armless = true;
  DQ.keyGiven = true;
  darryl.pose = 'idle';
  burst(darryl.x + (darryl.flip ? -3 : 3), darryl.y - 16, '244,238,220', 16);
  sfx.snap();
  dropStack(makeStack('bone-key'), player.x + (darryl.x - player.x) * 0.2, player.y + 3, raceRoom, 0.6, { x: darryl.x, y: darryl.y - 16 });
  markDirty();
}
function giveBling() {
  // one at a time, each tossed over to you (it's all off him and saved at
  // once, so nothing's lost if the page closes halfway)
  const back = STASH_SLOTS.filter(k => DQ.stash[k]).map(k => { const st = DQ.stash[k]; DQ.stash[k] = null; return st; });
  back.forEach((st, i) => setTimeout(() => {
    dropStack(st, player.x + (Math.random() - 0.5) * 30, player.y + 8 + Math.random() * 10, raceRoom, 0.6, { x: darryl.x, y: darryl.y - 14 });
    sfx.pickup();
  }, i * 350));
  markDirty();
}
// the core gives him the fright of his life: he drops a map and legs it back
// down the track into the dark, and that's the last you see of him
function fleeDarryl() {
  DQ.fled = true;
  lootOut('old-map', 1, darryl.x, darryl.y);
  darryl.state = 'flee';
  darryl.t = 0;
  darryl.fleeS = trackAt(darryl.x, darryl.y)?.s || S_STOP;
  sfx.deny();
  markDirty();
}

// losing: he points at you and you turn to bones. if you had anything good on
// you he walks over and takes the best of it (see pickLoot).
const LOOT_RANK = { gold: 10, prismasteel: 4, diamond: 3, emerald: 2, iron: 1 };
const LOOT_KIND = { sword: 1, pickaxe: 2, axe: 3 };
function lootValue(st) {
  if (!st) return null;
  const it = ITEMS[st.id], m = it.armor || it.mat;
  if (!(m in LOOT_RANK) || !(it.armor || LOOT_KIND[it.tool])) return null;
  return { rank: LOOT_RANK[m], kind: it.armor ? 0 : LOOT_KIND[it.tool], share: it.armor ? SLOT_OF[it.slot].share : 0, slot: it.armor ? it.slot : 'hand' };
}
// better is: gold before anything (he loves gold), then the rarer material,
// then armor before a sword before a pickaxe before an axe
const lootBetter = (a, b) => (a.rank !== b.rank ? a.rank > b.rank : a.kind !== b.kind ? a.kind < b.kind : a.share > b.share);
// the one thing he takes this time: the best of what you've got that beats
// whatever he's already wearing in that spot. what he was wearing there comes
// back to you, thrown on the pile with the rest of your things.
function pickLoot() {
  const all = [];
  inv.slots.forEach((st, i) => { const v = lootValue(st); if (v) all.push({ st, v, take: () => { inv.slots[i] = null; } }); });
  ARMOR_SLOTS.forEach(a => { const st = inv.armor[a.key], v = lootValue(st); if (v) all.push({ st, v, take: () => { inv.armor[a.key] = null; } }); });
  all.sort((p, q) => (lootBetter(p.v, q.v) ? -1 : lootBetter(q.v, p.v) ? 1 : 0));
  const pick = all.find(p => { const cur = lootValue(DQ.stash[p.v.slot]); return !cur || lootBetter(p.v, cur); });
  if (!pick) return null;
  pick.take();
  const old = DQ.stash[pick.v.slot];
  DQ.stash[pick.v.slot] = pick.st;
  if (old) dropStack(old, player.x + 10, player.y + 6, raceRoom, 2, { x: darryl.x, y: darryl.y - 14 });
  afterInventoryChange();
  return { st: pick.st, slot: pick.v.slot };
}
// and something off the floor: the best of whatever good stuff was already
// lying around the finish from before (things you dropped or lost the last
// time), as long as it beats what he's wearing in that spot. what it replaces
// is left where it was lying.
function pickGroundLoot(before) {
  const all = before.filter(g => ground.includes(g) && !g.fly).map(g => ({ g, v: lootValue(g.st) })).filter(q => q.v);
  all.sort((p2, q2) => (lootBetter(p2.v, q2.v) ? -1 : lootBetter(q2.v, p2.v) ? 1 : 0));
  const pick = all.find(q => { const cur = lootValue(DQ.stash[q.v.slot]); return !cur || lootBetter(q.v, cur); });
  if (!pick) return null;
  const { g, v } = pick;
  removeGround(g);
  const old = DQ.stash[v.slot];
  DQ.stash[v.slot] = { ...g.st };
  if (old) dropStack(old, g.x + 8, g.y + 4, raceRoom, 2);
  return { st: g.st, slot: v.slot, x: g.x, y: g.y };
}
function startJudge() {
  race.judge = { t: 0, zapped: false, boned: false, seed: Math.random() * 10 };
  darryl.pose = 'point';
  darryl.flip = player.x < darryl.x;
}
function tickJudge(dt) {
  const j = race.judge;
  j.t += dt;
  if (j.t > 0.75 && !j.zapped) {
    j.zapped = true;
    player.skeleton = 'stand';
    const flash = $('#hurt-flash');
    flash.classList.remove('is-on');
    void flash.offsetWidth;
    flash.classList.add('is-on');
    burst(player.x, player.y - 14, '240,236,220', 26);
    sfx.zap();
    addShake(2);
  }
  if (j.t > 1.9 && !j.boned) {
    j.boned = true;
    race.judge = null;
    darryl.pose = null;
    DQ.losses++;
    addBones(player.x, player.y);
    const before = ground.filter(g => g.room === 'race');
    const took = pickLoot();
    player.skeleton = 'pile';
    player.deathSoft = true;
    const x0 = player.x, y0 = player.y;
    die();
    const off = pickGroundLoot(before);
    const queue = [took && { ...took, x: x0 + 8, y: y0 + 4 }, off].filter(Boolean).map(q => ({ ...q, say: brag(q.st) }));
    // the death waits for him to finish helping himself (see tickThief)
    player.deathLen = queue.length ? Infinity : DEATH + 0.4;
    race.thief = queue.length ? { queue, i: 0, phase: 'wait', t: 0 } : null;
    sfx.crunch();
    markDirty();
  }
}
// him strolling over to your bones, bending down for the loot, putting it on
// and saying something about it, then the same for anything he fancies off
// the floor, then wandering back to the door
function tickThief(dt) {
  const th = race.thief, it = th.queue[th.i];
  th.t += dt;
  const goTo = q => walkDarryl(q.x + (darryl.x < q.x ? -12 : 12), q.y, 70);
  if (th.phase === 'wait' && player.deadT > 0.7) { th.phase = 'walk'; goTo(it); }
  if (th.phase === 'walk' && darryl.state === 'wait') { th.phase = 'grab'; th.t = 0; darryl.pose = 'grab'; darryl.flip = it.x < darryl.x; }
  if (th.phase === 'grab' && th.t > 0.45) { th.phase = 'lift'; th.t = 0; sfx.pickup(); }
  if (th.phase === 'lift' && th.t > 0.45) { th.phase = 'done'; th.t = 0; it.got = true; darryl.pose = null; sfx.found(); }
  if (th.phase === 'done' && th.t > 1.7) {
    if (th.i + 1 < th.queue.length) { th.i++; th.phase = 'walk'; th.t = 0; goTo(th.queue[th.i]); }
    else {
      th.phase = 'home';
      const p = trackPt(S_STOP + 40, 6);
      walkDarryl(p.x, p.y, 60);
      player.deathLen = player.deadT + 1.6;
    }
  }
}
const thiefHidden = () => new Set(race.thief ? race.thief.queue.filter(q => !q.got).map(q => q.slot) : []);

// what he says about it. gold gets the gold lines whatever it is.
const BRAGS = {
  gold: ['GOLD!', 'I just love how gold looks on my slim figure.', 'I just LOVE gold!'],
  armor: ['Just the thing I was looking for!', 'It IS pretty cold down here.'],
  tool: ['Oooh shiny!', 'Nice weapons!']
};
function brag(st) {
  const it = ITEMS[st.id], list = (it.armor || it.mat) === 'gold' ? BRAGS.gold : it.armor ? BRAGS.armor : BRAGS.tool;
  return list[(Math.random() * list.length) | 0];
}

// walking him somewhere on foot (straight there: he only ever walks along a
// straight bit of the track)
function walkDarryl(x, y, speed, then) { Object.assign(darryl, { state: 'walk', goal: { x, y, speed, then } }); }

// the race itself, every frame
function raceTick(dt) {
  syncShaft();
  // the "shift | hop out" chip in the hud (with the map and controls chips,
  // alex: it used to be a label stuck under the cart) while you can hop out
  const canHop = room === raceRoom && race.riding && (race.phase === 'free' || carts.you.fin);
  if (canHop !== hopChip) { hopChip = canHop; document.body.classList.toggle('can-hop', canHop); }
  hatchThing.gone = !DQ.won;
  hatchGlow.off = !DQ.won || !DQ.hatch;
  if (helpOpen) { tickHelpDemo(dt); return; }
  tickTalk(dt);
  if (room === vaultRoom) { vaultTick(dt); return; }
  if (room !== raceRoom) return;
  const Y = carts.you, Dc = carts.darryl;
  if (race.judge) tickJudge(dt);
  if (race.thief) tickThief(dt);
  darryl.anim += dt;
  darryl.t += dt;

  // walking up to darryl starts a conversation (once each time you come in)
  const near = !darryl.gone && Math.hypot(darryl.x - player.x, darryl.y - player.y) < 30;
  if (!near && Math.hypot(darryl.x - player.x, darryl.y - player.y) > 60) darryl.talked = false;
  if (near && !talk && !darryl.talked && !player.dead && !race.riding && darryl.state === 'wait') {
    darryl.talked = true;
    darryl.flip = player.x < darryl.x;
    if (race.phase === 'pre') {
      DQ.met = true;
      markDirty();
      startTalk(greeting(), () => {
        race.phase = 'go';
        race.t = 0;
        bossMusic(true, RACE_TUNE);
        walkDarryl(Dc.x + 12, Dc.y + 2, 120, () => { darryl.state = 'hop'; darryl.t = 0; });
        // the controls card comes up every race, unless you've ticked "don't
        // show this again" on it (alex)
        if (!DQ.hideHelp) openHelp();
      });
    } else if (race.phase === 'free' && DQ.won && !DQ.fled) {
      if (countItem('exotic-core')) startTalk(coreTalk(), () => toast('Darryl ran off', 'Crumpled Map', 'He dropped something...'));
      else if (!DQ.keyGiven) startTalk(winTalk());
      else startTalk([{ d: DQ.doorOpen ? 'Yeah, the door\'s open. By the way, where\'d you put my arm?' : 'Go on, the key fits the door. Trust me, I\'d know.' }]);
    }
  }

  // darryl on foot
  if (darryl.state === 'walk' && darryl.goal) {
    const g = darryl.goal, dx = g.x - darryl.x, dy = g.y - darryl.y, d = Math.hypot(dx, dy);
    if (d < g.speed * dt + 0.5) {
      darryl.x = g.x; darryl.y = g.y; darryl.state = 'wait'; darryl.goal = null;
      if (g.then) g.then();
    } else {
      darryl.x += (dx / d) * g.speed * dt; darryl.y += (dy / d) * g.speed * dt;
      if (Math.abs(dx) > 1) darryl.flip = dx < 0;
    }
  }
  // the hop into his cart, then he's off
  if (darryl.state === 'hop') {
    const k = Math.min(1, darryl.t / 0.35);
    darryl.hop = Math.sin(k * Math.PI) * 10;
    darryl.x += (Dc.x - darryl.x) * Math.min(1, dt * 12);
    darryl.y += (Dc.y - darryl.y) * Math.min(1, dt * 12);
    if (k >= 1) {
      darryl.state = 'cart';
      darryl.gone = true;
      darryl.hop = 0;
      Dc.rider = 'darryl';
      Dc.stopped = false;
      race.phase = 'race';
      race.goT = 1.2;
      sfx.rev();
    }
  }
  if (darryl.state === 'flee') {
    darryl.fleeS -= 140 * dt;
    const p = trackPt(darryl.fleeS, 0);
    darryl.x = p.x; darryl.y = p.y; darryl.flip = Math.cos(p.a) > 0;
    darryl.alpha = Math.max(0, 1 - darryl.t / 2.4);
    if (darryl.t > 2.4) { darryl.state = 'gone'; darryl.gone = true; }
  }

  if (race.phase === 'go' || race.phase === 'race') race.t += dt;
  race.goT = Math.max(0, race.goT - dt);
  // hopping in your own cart: just walk into it
  if (Y.noBoard && Math.hypot(Y.x - player.x, Y.y - player.y) > 24) Y.noBoard = false;
  if (!race.riding && !player.dead && ['go', 'race', 'free'].includes(race.phase) && (!Y.fin || race.phase === 'free') && !Y.gone && !Y.noBoard && Math.hypot(Y.x - player.x, Y.y - player.y) < 14) {
    race.riding = true;
    Y.rider = 'you';
    Y.stopped = false;
    Y.lane = -30;
    sfx.rev();
  }
  if (race.riding) {
    driveCart(Y, dt);
    player.x = Y.x;
    player.y = Y.y;
    player.moving = Math.abs(Y.v) > 5;
    Y.rumbleT = (Y.rumbleT || 0) - dt;
    if (Math.abs(Y.v) > 20 && Y.rumbleT <= 0) { Y.rumbleT = 0.16; sfx.cart(Math.abs(Y.v)); }
    if (!Y.fin && Y.s >= S_FIN && race.phase !== 'free') {
      Y.fin = true;
      race.pFin = race.t;
      bossMusic(false);
      if (!race.result) { race.result = 'win'; victoryJingle(); toast('Finish', 'You win!', 'Oh boy...'); }
      else { musicQuietUntil = performance.now() + 2500; toast('Finish', 'Darryl wins', 'Last one there\'s a rotting skeleton...'); }
    }
    // stopped at the end of a race: hop out next to the cart
    if (Y.fin && race.phase !== 'free' && Math.abs(Y.v) < 3 && Y.s > S_STOP - 12) {
      race.riding = false;
      Y.rider = null;
      Y.stopped = true;
      const p = trackPt(Y.s + 4, Y.lane - 22);
      player.x = p.x; player.y = p.y; player.face = 'up';
    }
  }
  if (Dc.rider === 'darryl') {
    if (race.phase === 'race') driveDarryl(Dc, dt);
    if (Dc.stopped && Dc.fin) {
      // out of the cart and over to the door
      Dc.rider = null;
      const p = trackPt(Dc.s + 6, 50);
      standDarryl(p.x, p.y, true);
      darryl.gone = false;
      darryl.state = 'wait';
    }
  }
  // both of you finished (or he has and you've walked up): he comes over
  const done = !race.riding && !Dc.rider && race.result && darryl.state === 'wait' && !race.judge && !race.thief && !talk && !player.dead && race.phase === 'race';
  const youThere = Y.fin || trackAt(player.x, player.y)?.s > S_FIN;
  if (done && youThere) {
    race.phase = 'over';
    race.poof = { t: 0 };
    if (musicOn && musicTune === RACE_TUNE) bossMusic(false);
    const live = Object.values(carts).filter(c => !c.gone);
    if (live.length) darryl.flip = live.reduce((n, c) => n + c.x, 0) / live.length < darryl.x;
    darryl.pose = 'point';
  }
  // he points at the carts and they're gone in a puff of dust, and then he
  // comes over: close enough to chat when you've won, a few steps back when
  // he's about to zap you
  if (race.poof) {
    const P = race.poof;
    P.t += dt;
    if (!P.done && P.t > 0.45) {
      P.done = true;
      Object.values(carts).forEach(c => {
        if (c.gone) return;
        burst(c.x, c.y - 6, '200,190,170', 22);
        burst(c.x, c.y - 10, '255,240,200', 8);
        c.gone = true;
        c.lamp.off = true;
      });
      sfx.snap();
      whoosh();
    }
    if (P.t > 1) {
      race.poof = null;
      darryl.pose = null;
      const side = (player.x < darryl.x ? 1 : -1) * (race.result === 'win' ? 22 : 54);
      walkDarryl(player.x + side, player.y, 70, () => {
        darryl.flip = player.x < darryl.x;
        // (counts as talking to him, so walking off after doesn't set him off again)
        darryl.talked = true;
        if (race.result === 'win') {
          DQ.won = true;
          markDirty();
          startTalk(winTalk(), () => { race.phase = 'free'; Y.rider = null; });
        } else {
          startTalk(loseTalk(), startJudge);
        }
      });
    }
  }

  // the big door: the bone key opens it, then walk through
  if (!DQ.doorOpen && !door.seq && Math.hypot(player.x - DOOR_X, player.y - (DOOR_Y + 14)) < 30 && !player.dead) {
    if (countItem('bone-key')) {
      takeItem('bone-key', 1);
      DQ.doorOpen = true;
      door.k = 0;
      door.seq = { t: 0, fired: {} };
      faceToward(DOOR_X, DOOR_Y);
      afterInventoryChange();
      markDirty();
    } else if (performance.now() > (door.hintAt || 0)) {
      door.hintAt = performance.now() + 5000;
      toast('Locked', 'A big door', 'There\'s a bone-shaped keyhole...');
      sfx.deny();
    }
  }
  if (door.seq) tickDoor(dt);
  else if (DQ.doorOpen) door.k = 1;
  door.frames = [DOOR_ART[Math.round(door.k * DOOR_STEPS)]];
  if (DQ.doorOpen && !door.seq && !player.dead && !race.riding && player.y < DOOR_Y + 8 && Math.abs(player.x - DOOR_X) < 14) enterRoom(vaultRoom);

  // the carts' lamps go where the carts go, and his helmet lamp where he goes
  // (in his cart or out of it, and not at all once he's wearing your helmet)
  Object.values(carts).forEach(c => { c.lamp.x = c.x + Math.cos(c.a) * 10; c.lamp.y = c.y + Math.sin(c.a) * 10 - 4; });
  const inCart = Dc.rider === 'darryl', face = inCart ? (Math.cos(Dc.a) < -0.2 ? -1 : 1) : darryl.flip ? -1 : 1;
  darryl.lamp.off = !!DQ.stash.head || (!inCart && darryl.gone);
  darryl.lamp.x = (inCart ? Dc.x : darryl.x) + face * 8;
  darryl.lamp.y = (inCart ? Dc.y - 24 : darryl.y - 30);
}
// the door opening, about two and a half seconds of it: the key turns in the
// lock (two clicks), the skull over the arch lights up, something heavy gives
// with a clunk and a rumble, then the doors grind apart with dust pouring off
// the top of the arch and the vault's lava light flooding out, and a thud at
// the end. you stand and watch.
function tickDoor(dt) {
  const q = door.seq;
  q.t += dt;
  const at = (time, f) => { if (q.t >= time && !q.fired[time]) { q.fired[time] = true; f(); } };
  at(0.05, () => sfx.click());
  at(0.4, () => sfx.click());
  at(0.75, () => { sfx.clunk(); addShake(1.5); });
  at(1, () => { sfx.creak(); sfx.rumble(); });
  at(2.6, () => {
    sfx.boom();
    addShake(3);
    burst(DOOR_X, DOOR_Y - 4, '160,150,140', 20);
    toast('Unlocked', 'The big door', 'The key crumbles to dust in the lock.');
  });
  const k = clamp((q.t - 1) / 1.6, 0, 1);
  door.k = k * k * (3 - 2 * k);
  door.glow.rgb = '255,150,60';
  door.glow.strength = 0.26 + 0.34 * door.k;
  if (q.t > 1 && q.t < 2.6) {
    shakeAmp = Math.max(shakeAmp, 0.8);
    if (!reduceMotion && Math.random() < dt * 40) particles.push({ x: DOOR_X + (Math.random() - 0.5) * 44, y: DOOR_Y - 50 - Math.random() * 6, vx: (Math.random() - 0.5) * 6, vy: 10 + Math.random() * 20, g: 90, life: 0.8, t: 0, col: Math.random() < 0.5 ? '#9a948c' : '#6e6a66', size: 1 });
  }
  if (q.t > 2.9) door.seq = null;
}
// in the vault: the ladder up the back wall takes you outside
// the two lava channels either side of the statue: they bubble, and every few
// seconds one of them shoots a spout of lava up out of the floor that rains
// back down into it, lighting the room up as it goes. step into one and it
// hurts (a heart, then another every so often while you stay in) and sets you
// on fire, which lava does even indoors.
const LAVA_POOLS = [{ x0: 64, x1: 80, y0: 54, y1: 94, t: 1.2 }, { x0: 160, x1: 176, y0: 54, y1: 94, t: 2.6 }];
LAVA_POOLS.forEach((L, i) => { L.glow = vaultRoom.glows[i]; });
let lavaHurtT = 0;
function tickLava(dt) {
  LAVA_POOLS.forEach(L => {
    L.t -= dt;
    L.glow.strength += ((L.spout > 0 ? 0.55 : 0.32) - L.glow.strength) * Math.min(1, dt * 6);
    if (!reduceMotion && Math.random() < dt * 5) {
      particles.push({ x: L.x0 + 2 + Math.random() * 12, y: L.y0 + 4 + Math.random() * 34, vx: 0, vy: -10, g: 30, life: 0.35, t: 0, col: Math.random() < 0.5 ? '#ffd23f' : '#ff8a1c', size: 1 });
    }
    if (L.t <= 0 && !(L.spout > 0)) {
      L.spout = 0.9;
      L.at = { x: (L.x0 + L.x1) / 2 + (Math.random() - 0.5) * 8, y: L.y0 + 10 + Math.random() * 24 };
      sfx.geyser();
    }
    if (L.spout > 0) {
      L.spout -= dt;
      if (!reduceMotion) for (let k = 0; k < 3; k++) {
        particles.push({ x: L.at.x + (Math.random() - 0.5) * 6, y: L.at.y, vx: (Math.random() - 0.5) * 40, vy: -110 - Math.random() * 70, g: 260, life: 0.9, t: 0, col: ['#fff1a8', '#ffd23f', '#ff8a1c', '#e0561a'][(Math.random() * 4) | 0], size: Math.random() < 0.5 ? 2 : 1 });
      }
      if (L.spout <= 0) L.t = 2 + Math.random() * 2.5;
    }
  });
  lavaHurtT -= dt;
  if (player.dead) return;
  const inLava = LAVA_POOLS.some(L => player.x > L.x0 - 2 && player.x < L.x1 + 2 && player.y > L.y0 + 2 && player.y < L.y1 + 4);
  if (inLava && lavaHurtT <= 0) {
    lavaHurtT = 0.9;
    loseHp(1, 'Lava!', '#ff7b1c');
    ignite(true);
    burst(player.x, player.y - 4, '255,140,40', 12);
    sfx.ignite();
  }
}
function vaultTick(dt) {
  tickLava(dt);
  if (room !== vaultRoom || player.dead) return;
  if (Math.abs(player.x - 36) < 9 && player.y < 40 && (keys.has('KeyW') || keys.has('ArrowUp'))) {
    keys.delete('KeyW');
    keys.delete('ArrowUp');
    // up the ladder and out through the hatch, which stays open from now on
    if (!DQ.hatch) {
      DQ.hatch = true;
      hatchThing.frames = [HATCH_ART[1]];
      hatchGlow.off = false;
      markDirty();
    }
    playLeaveRoom();
    sfx.creak();
  }
}

function raceEnter(r) {
  if (r === raceRoom) {
    if (DQ.won) resetFree(); else resetRace();
    showRemains();
    player.y = r.h - 20;
    if (!DQ.seen) {
      DQ.seen = true;
      toast('Underground', 'An old mine shaft', 'Someone is whistling down here...');
      markDirty();
    } else if (DQ.won) toast('Inside', 'Darryl\'s Raceway', 'Still smells like burnt rubber...');
  }
  if (r === vaultRoom) {
    player.y = r.h - 20;
    if (!DQ.statue) {
      DQ.statue = true;
      markDirty();
      discover(shaftPoi);
    }
  }
}
function raceLeave(r) {
  if (r !== raceRoom) return;
  if (talk) endTalk(true);
  if (musicOn && musicTune === RACE_TUNE) bossMusic(false);
  race.riding = false;
  if (DQ.won) resetFree(); else resetRace();
}
function raceHolds() { return !!talk || race.riding || !!race.judge || !!race.poof || !!door.seq || helpOpen || (room === raceRoom && darryl.state === 'walk' && race.phase === 'over'); }
function raceKey(e) {
  if (helpOpen) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); closeHelp(); }
    return true;
  }
  if (talk) {
    if (e.key === 'Enter' || e.key === ' ' || e.code === 'KeyE') { e.preventDefault(); advanceTalk(); }
    return !['j', 'k', 'm'].includes(e.key.toLowerCase());
  }
  if (race.riding) {
    // once the race is over (riding down to the door after you've beaten him,
    // or rolling in after you've crossed the line) shift hops you out
    if (e.key === 'Shift' && !e.repeat && (race.phase === 'free' || carts.you.fin)) { hopOut(); return true; }
    if ((e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) mashPress();
    if (MOVE_KEYS[e.code]) { e.preventDefault(); return false; }
    return ['e', 'q', 'f'].includes(e.key.toLowerCase());
  }
  return raceHolds() && ['e', 'q', 'f'].includes(e.key.toLowerCase());
}
function raceClick() { if (talk) advanceTalk(); }
// out of your cart: it stops where it is and you step off to one side (or
// behind it if there's a wall), and it won't take you back until you've
// stepped away and walked into it again
function hopOut() {
  const Y = carts.you, t = trackAt(Y.x, Y.y), a = t ? track.ang[t.i] : Y.a;
  Object.assign(Y, { v: 0, spin: null, hole: null, sink: 0, rider: null, stopped: true, noBoard: true });
  race.riding = false;
  const spots = [[-Math.sin(a), Math.cos(a)], [Math.sin(a), -Math.cos(a)], [-Math.cos(a), -Math.sin(a)], [Math.cos(a), Math.sin(a)]];
  let out = { x: Y.x, y: Y.y + 18 };
  for (const r of [22, 30]) {
    const hit = spots.find(([ox, oy]) => !raceRoom.blocked(Y.x + ox * r, Y.y + oy * r));
    if (hit) { out = { x: Y.x + hit[0] * r, y: Y.y + hit[1] * r }; break; }
  }
  player.x = out.x;
  player.y = out.y;
  player.face = 'down';
  sfx.ui();
}
function raceCam() {
  if (room !== raceRoom) return null;
  if (talk || race.judge) return { x: (player.x + darryl.x) / 2, y: (player.y + darryl.y) / 2 - 12 };
  if (race.riding) {
    const c = carts.you, lead = Math.max(0, c.v) * 0.45;
    return { x: c.x + Math.cos(c.a) * lead, y: c.y + Math.sin(c.a) * lead - 10 };
  }
  return null;
}
// the walls along the track are mine blocks like any other: dug out (once
// you've beaten him, see mineInfo) they turn to floor, stone gives stone and
// ore gives its ore
function raceTarget(m) {
  if (room !== raceRoom) return null;
  const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE), t = rtAt(tx, ty);
  if (!SOLID[t] || tx <= 0 || ty <= 0 || tx >= RACE_COLS - 1 || ty >= RACE_ROWS - 1) return null;
  return { type: 'racetile', tx, ty, key: `rt:${rti(tx, ty)}`, cx: tx * TILE + 8, cy: ty * TILE + 8, cls: ORE_ITEM[t] ? 'ore' : 'stone', ore: ORE_ITEM[t] };
}
function raceMineTile(tgt, info) {
  const i = rti(tgt.tx, tgt.ty);
  RT[i] = T.FLOOR;
  DQ.mined.push(i);
  repaintRace(tgt.tx, tgt.ty);
  burst(tgt.cx, tgt.cy, '140,140,140', 12);
  if (info.drops) gain(tgt.ore || 'stone', 1, tgt.cx, tgt.cy - 8);
  else floatText('Nothing dropped', tgt.cx, tgt.cy - 8, '#bdbdbd');
}

// drawing darryl, the carts and the riders
function drawDarryl(o, toX, toY, t) {
  if (o.gone) return;
  let pose = o.pose, frame = Math.floor(o.anim * 3) % 2;
  if (!pose) {
    if (o.state === 'walk' || o.state === 'flee') { pose = o.state === 'flee' ? 'scared' : 'walk'; frame = Math.floor(o.anim * (o.state === 'flee' ? 14 : 10)) % 4; }
    else if (talk && talk.steps[talk.i].mood === 'scared') pose = 'scared';
    else if (talk && talk.steps[talk.i].mood === 'frown') pose = 'frown';
    else if (typing()) { pose = 'talk'; frame = Math.floor(o.anim * 8) % 2; }
    else pose = 'idle';
  }
  const hide = thiefHidden();
  const gear = {};
  ['head', 'chest', 'legs', 'feet'].forEach(k => { if (DQ.stash[k] && !hide.has(k)) gear[k] = ITEMS[DQ.stash[k].id].armor; });
  const img = skeletonFrame(pose, frame, { gear, armless: DQ.armless });
  const w = img.width, h = img.height, hop = Math.round(o.hop || 0);
  ctx.save();
  ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(toX(o.x - 7), toY(o.y - 1), 14 * S, 2 * S);
  const x = toX(o.x - Math.floor(w / 2)), y = toY(o.y - h + 2 - hop);
  if (o.flip) { ctx.translate(x + w * S, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w * S, h * S); ctx.setTransform(1, 0, 0, 1, 0, 0); }
  else ctx.drawImage(img, x, y, w * S, h * S);
  // whatever tool he's taken off you, in his hand
  const tool = DQ.stash.hand && !hide.has('hand') ? ICON_CANVAS[DQ.stash.hand.id] : null;
  if (tool && pose !== 'scared') {
    const hx = o.x + (o.flip ? -1 : 1) * (DQ.armless ? 2 : 4), hy = o.y - h + 2 - hop + 22;
    ctx.translate(toX(hx), toY(hy));
    ctx.scale(o.flip ? -1 : 1, 1);
    ctx.rotate(-0.6);
    ctx.drawImage(tool, -3 * S, -10 * S, 11 * S, 11 * S);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}
const angIndex = (a, steps) => ((Math.round((a / (Math.PI * 2)) * steps) % steps) + steps) % steps;
function drawCart(c, toX, toY, t) {
  const sink = Math.round(c.sink || 0), a = c.a + (c.spinA || 0);
  const img = CART_ROT[c.look][Math.min(3, c.crack || 0)][angIndex(a, CART_STEPS)];
  ctx.save();
  if (sink > 0) { ctx.beginPath(); ctx.rect(0, 0, canvas.width, toY(c.y + 2)); ctx.clip(); }
  else {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(toX(c.x - 10), toY(c.y + 3), 20 * S, 3 * S);
  }
  const rattle = c.v > 60 && !reduceMotion ? Math.round(Math.sin(t / 30) * 0.6) : 0;
  ctx.drawImage(img, toX(c.x - CART_D / 2), toY(c.y - CART_D / 2 - 3 + sink + rattle), CART_D * S, CART_D * S);
  if (c.rider === 'you') drawRider(c, toX, toY, sink + rattle);
  else if (c.rider === 'darryl') {
    const pose = c.spin ? 'scared' : 'idle';
    const im = skeletonFrame(pose, 0, { gear: Object.fromEntries(['head', 'chest'].filter(k => DQ.stash[k]).map(k => [k, ITEMS[DQ.stash[k].id].armor])), armless: DQ.armless });
    const flip = Math.cos(a) < -0.2;
    const x = toX(c.x - 14), y = toY(c.y - 3 - 21 + sink + rattle);
    if (flip) { ctx.translate(x + DARRYL_W * S, y); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, DARRYL_W, 22, 0, 0, DARRYL_W * S, 22 * S); ctx.setTransform(1, 0, 0, 1, 0, 0); }
    else ctx.drawImage(im, 0, 0, DARRYL_W, 22, x, y, DARRYL_W * S, 22 * S);
  }
  ctx.restore();
}
// you, sitting in your cart: the top of your idle frame (and whatever armor is
// on it), facing the way the cart's going
function drawRider(c, toX, toY, dy) {
  const img = sheetPlay.naturalWidth ? sheetPlay : sheet;
  if (!img.naturalWidth) return;
  const a = c.a + (c.spinA || 0), cx = Math.cos(a), sy = Math.sin(a);
  const face = Math.abs(cx) > 0.55 ? 'side' : sy < 0 ? 'up' : 'down', flip = face === 'side' && cx < 0;
  const row = ROWS.idle[face], top = 37;
  const layers = playArmorLayers().map(([which, layer]) => [which === 'torso' ? armorSheet : piecesSheet, (layer * 10 + row) * CELL]).filter(([im]) => im.naturalWidth);
  const x = toX(c.x - 24), y = toY(c.y - 3 - top + dy);
  ctx.save();
  if (flip) { ctx.translate(x + CELL * S, y); ctx.scale(-1, 1); }
  else ctx.translate(x, y);
  ctx.drawImage(img, 0, row * CELL, CELL, top, 0, 0, CELL * S, top * S);
  layers.forEach(([im, ly]) => ctx.drawImage(im, 0, ly, CELL, top, 0, 0, CELL * S, top * S));
  ctx.restore();
}
// the engine asks before drawing you: in a cart you're drawn by the cart, and
// turned to bones you're a skeleton (rattling, then a heap)
function playDrawPlayer(toX, toY, t) {
  if (race.riding && room === raceRoom) return true;
  if (!player.skeleton) return false;
  const pile = player.skeleton === 'pile';
  const img = skeletonFrame(pile ? 'pile' : 'idle', 0, { plain: true });
  const shake = pile || reduceMotion ? 0 : Math.round(Math.sin(t / 20));
  const x = toX(player.x - DARRYL_W / 2 + shake), y = toY(player.y - DARRYL_H + 2);
  ctx.save();
  if (player.flip) { ctx.translate(x + DARRYL_W * S, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, DARRYL_W * S, DARRYL_H * S); }
  else ctx.drawImage(img, x, y, DARRYL_W * S, DARRYL_H * S);
  ctx.restore();
  return true;
}

// on top of everything: how the race is going, the button mashing, his finger
// zapping you, and your loot floating up into his hand
function raceOverlay(toX, toY, t) {
  if (room !== raceRoom) return;
  const fs = Math.max(16, 8 * Math.round((S * 5.3) / 8));
  ctx.font = `${fs}px Silkscreen, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const Y = carts.you, Dc = carts.darryl;
  // the progress strip across the top: you and darryl along the track
  if (race.phase === 'go' || race.phase === 'race') {
    const W2 = Math.min(canvas.width * 0.5, 520 * (S / 3)), x0 = (focusX || canvas.width / 2) - W2 / 2, y0 = fs * 2.2;
    ctx.fillStyle = 'rgba(12,12,16,0.85)';
    ctx.fillRect(x0 - fs * 0.6, y0 - fs * 0.9, W2 + fs * 1.2, fs * 1.8);
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(x0, y0 - S, W2, 2 * S);
    const at = s => x0 + W2 * clamp((s - S_START) / (S_FIN - S_START), 0, 1);
    const sY = race.riding || Y.fin ? Y.s : trackAt(player.x, player.y)?.s || 0, sD = Dc.rider ? Dc.s : race.result ? S_FIN : S_START;
    ctx.fillStyle = '#f2f0ea';
    ctx.fillRect(at(S_FIN) - S, y0 - fs * 0.5, 2 * S, fs);
    ctx.fillStyle = '#e8e1cc';
    ctx.fillRect(at(sD) - 2 * S, y0 - 2 * S, 4 * S, 4 * S);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(at(sY) - 2 * S, y0 - 3 * S, 5 * S, 6 * S);
    const first = race.result ? race.result === 'win' : sY >= sD;
    ctx.fillStyle = first ? '#ffd23f' : '#cfcfcf';
    ctx.fillText(first ? '1ST' : '2ND', x0 - fs * 2.2, y0 + 1);
    if (race.goT > 0) {
      ctx.fillStyle = `rgba(255,210,63,${Math.min(1, race.goT * 2)})`;
      ctx.fillText('GO!', toX(Dc.x), toY(Dc.y - 40));
    }
  }
  // mash w: a big prompt and how close you are to getting out of trouble
  const m = Y.spin || Y.hole;
  if (race.riding && m) {
    const k = m.meter, bx = toX(Y.x - 14), by = toY(Y.y - 50);
    const pulse = Math.floor(t / 120) % 2, label = Y.hole ? 'MASH W TO CLIMB OUT' : 'MASH W';
    const bw = Math.max(28 * S, ctx.measureText(label).width) + fs * 0.8;
    ctx.fillStyle = 'rgba(12,12,16,0.9)';
    ctx.fillRect(toX(Y.x) - bw / 2, by - fs * 1.7, bw, fs * 2.4);
    ctx.fillStyle = pulse ? '#ffd23f' : '#ffffff';
    ctx.fillText(label, toX(Y.x), by - fs * 0.85);
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(bx, by, 28 * S, 3 * S);
    ctx.fillStyle = '#9bf07a';
    ctx.fillRect(bx, by, Math.round(28 * S * k), 3 * S);
  }
  // the light in his eye socket flares up and then cracks out at you in a
  // straight beam (alex: the looping one looked like a wizard casting a spell):
  // bone white in the middle, a sickly green glow round it, jittering like it
  // can barely hold together, with bone dust flaking off it. he holds his
  // finger out like a gun while he does it.
  const J = race.judge;
  if (J && J.t < 1.3) {
    const ex = darryl.x + (darryl.flip ? -5 : 5), ey = darryl.y - 25, tx = player.x, ty = player.y - 16;
    const fade = J.t > 1 ? Math.max(0, (1.3 - J.t) / 0.3) : 1, flare = Math.min(1, J.t / 0.3) * fade;
    ctx.globalCompositeOperation = 'lighter';
    const eg = ctx.createRadialGradient(toX(ex), toY(ey), 0, toX(ex), toY(ey), (3 + flare * 6) * S);
    eg.addColorStop(0, `rgba(255,252,230,${0.95 * flare})`);
    eg.addColorStop(0.4, `rgba(170,255,140,${0.6 * flare})`);
    eg.addColorStop(1, 'rgba(120,255,120,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(toX(ex) - 10 * S, toY(ey) - 10 * S, 20 * S, 20 * S);
    if (J.t > 0.3) {
      const k = Math.min(1, (J.t - 0.3) / 0.12), dx = tx - ex, dy = ty - ey, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len, n = Math.ceil(len / 2);
      for (let i = 0; i <= n * k; i++) {
        const u = i / n, j = reduceMotion ? 0 : (Math.random() - 0.5) * 2.4 * Math.sin(u * Math.PI);
        const bx = ex + dx * u + nx * j, by = ey + dy * u + ny * j;
        const w = 1 + (Math.random() < 0.3 ? 1 : 0);
        ctx.fillStyle = `rgba(140,255,120,${0.18 * fade})`;
        ctx.fillRect(toX(bx) - 3 * S, toY(by) - 3 * S, 6 * S, 6 * S);
        ctx.fillStyle = `rgba(255,250,225,${0.9 * fade})`;
        ctx.fillRect(toX(bx) - (w * S) / 2, toY(by) - (w * S) / 2, w * S, w * S);
        if (!reduceMotion && Math.random() < 0.03) particles.push({ x: bx, y: by, vx: (Math.random() - 0.5) * 30, vy: 10 + Math.random() * 20, g: 60, life: 0.5, t: 0, col: Math.random() < 0.6 ? '#e8e1cc' : '#b8ffa8', size: 1 });
      }
      if (k >= 1) {
        const rg = ctx.createRadialGradient(toX(tx), toY(ty), 0, toX(tx), toY(ty), 12 * S);
        rg.addColorStop(0, `rgba(255,250,225,${0.7 * fade})`);
        rg.addColorStop(1, 'rgba(140,255,120,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(toX(tx) - 12 * S, toY(ty) - 12 * S, 24 * S, 24 * S);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // the door's lock: the keyhole glowing as the key turns, then the skull's
  // eyes over the arch lighting up
  if (door.seq) {
    const q = door.seq, kx = DOOR_X - 0.5, ky = DOOR_Y - 24;
    ctx.globalCompositeOperation = 'lighter';
    const key = Math.min(1, q.t / 0.3) * Math.max(0, 1 - Math.max(0, q.t - 1.2) / 0.6);
    if (key > 0) {
      const g = ctx.createRadialGradient(toX(kx), toY(ky), 0, toX(kx), toY(ky), 8 * S);
      g.addColorStop(0, `rgba(255,236,190,${0.9 * key})`);
      g.addColorStop(1, 'rgba(255,180,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(toX(kx) - 8 * S, toY(ky) - 8 * S, 16 * S, 16 * S);
    }
    if (q.t > 0.75) {
      const e = Math.min(1, (q.t - 0.75) / 0.2) * (0.75 + Math.sin(q.t * 30) * 0.25);
      [-2.5, 2.5].forEach(dx => {
        const g = ctx.createRadialGradient(toX(DOOR_X + dx), toY(DOOR_Y - 53), 0, toX(DOOR_X + dx), toY(DOOR_Y - 53), 5 * S);
        g.addColorStop(0, `rgba(255,140,50,${e})`);
        g.addColorStop(1, 'rgba(255,90,30,0)');
        ctx.fillStyle = g;
        ctx.fillRect(toX(DOOR_X + dx) - 5 * S, toY(DOOR_Y - 53) - 5 * S, 10 * S, 10 * S);
      });
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // the loot he's after, lying on your bones (or on the floor), then floating
  // up into his hand
  const th = race.thief;
  // and what he says about it, in a speech bubble done like the rest of the
  // game's popups: a dark panel with notched corners and an orange edge, his
  // name on top in small orange letters, and a little tail down to him
  const cur = th && th.queue[th.i];
  if (th && th.phase === 'done' && cur && cur.say) {
    const bfs = Math.max(8, 8 * Math.round((S * 4) / 8)), nfs = Math.max(8, Math.round(bfs * 0.7));
    ctx.font = `${bfs}px Silkscreen, monospace`;
    const tw = ctx.measureText(cur.say.toUpperCase()).width, pad = bfs * 0.8, n = S;
    const w = tw + pad * 2, h = bfs * 1.4 + nfs * 1.6 + pad * 0.6;
    const cx = toX(darryl.x), x0 = Math.round(cx - w / 2), y0 = Math.round(toY(darryl.y - 46) - h);
    ctx.globalAlpha = Math.min(1, th.t * 5) * Math.min(1, Math.max(0, (1.7 - th.t) * 5));
    const box = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x + n, y, ww - 2 * n, hh); ctx.fillRect(x, y + n, ww, hh - 2 * n); };
    box(x0, y0, w, h, '#ff9a3c');
    box(x0 + n, y0 + n, w - 2 * n, h - 2 * n, 'rgba(15,16,20,0.96)');
    ctx.fillStyle = '#ff9a3c';
    for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(cx) - (3 - k) * n, y0 + h + k * n, (6 - 2 * k) * n, n);
    ctx.font = `${nfs}px Silkscreen, monospace`;
    ctx.fillStyle = '#ff9a3c';
    ctx.fillText('DARRYL', cx, y0 + pad * 0.5 + nfs * 0.7);
    ctx.font = `${bfs}px Silkscreen, monospace`;
    ctx.fillStyle = '#f2f0ea';
    ctx.fillText(cur.say.toUpperCase(), cx, y0 + pad * 0.5 + nfs * 1.6 + bfs * 0.7);
    ctx.globalAlpha = 1;
    ctx.font = `${fs}px Silkscreen, monospace`;
  }
  if (th) th.queue.forEach((q, qi) => {
    if (q.got) return;
    let x = q.x, y = q.y - 8 - (reduceMotion ? 0 : Math.round(Math.sin(t / 300)));
    if (qi === th.i && th.phase === 'lift') { const u = Math.min(1, th.t / 0.45); x += (darryl.x - x) * u; y += (darryl.y - 20 - y) * u - Math.sin(u * Math.PI) * 10; }
    ctx.drawImage(ICON_CANVAS[q.st.id], toX(x - 6), toY(y - 6), 12 * S, 12 * S);
  });
}

// the controls card the first time you race. the race (and darryl) wait
// while it's up, and a little cart drives round a loop in it, showing which
// key does what as it goes.
const helpEl = $('#race-help'), helpDemo = $('#race-demo'), demoCtx = helpDemo.getContext('2d');
const demo = { t: 0 };
function openHelp() {
  helpOpen = true;
  helpEl.hidden = false;
  $('#race-help-skip').checked = false;
  document.body.classList.add('is-help');
  demo.t = 0;
  setTimeout(() => $('#race-help-go').focus(), 50);
}
function closeHelp() {
  helpOpen = false;
  helpEl.hidden = true;
  if ($('#race-help-skip').checked) { DQ.hideHelp = true; markDirty(); }
  document.body.classList.remove('is-help');
  sfx.ui();
}
$('#race-help-go').addEventListener('click', closeHelp);
function tickHelpDemo(dt) {
  demo.t += dt;
  const g = demoCtx, W2 = helpDemo.width, H2 = helpDemo.height;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#16151a';
  g.fillRect(0, 0, W2, H2);
  // the loop: two straights and two bends, driven clockwise, so every bend is
  // a right turn (d) and the straights are flat out (w)
  const L = 70, R = 22, cx = W2 / 2, cy = H2 / 2, per = 2 * L + 2 * Math.PI * R;
  g.strokeStyle = '#5c4c3c';
  g.lineWidth = 16;
  g.beginPath();
  g.moveTo(cx - L / 2, cy - R); g.lineTo(cx + L / 2, cy - R);
  g.arc(cx + L / 2, cy, R, -Math.PI / 2, Math.PI / 2);
  g.lineTo(cx - L / 2, cy + R);
  g.arc(cx - L / 2, cy, R, Math.PI / 2, Math.PI * 1.5);
  g.stroke();
  let u = (demo.t * 46) % per, x, y, a, turning;
  if (u < L) { x = cx + L / 2 - u; y = cy + R; a = Math.PI; turning = false; }
  else if ((u -= L) < Math.PI * R) { const th = Math.PI / 2 + u / R; x = cx - L / 2 + Math.cos(th) * R; y = cy + Math.sin(th) * R; a = th + Math.PI / 2; turning = true; }
  else if ((u -= Math.PI * R) < L) { x = cx - L / 2 + u; y = cy - R; a = 0; turning = false; }
  else { u -= L; const th = -Math.PI / 2 + u / R; x = cx + L / 2 + Math.cos(th) * R; y = cy + Math.sin(th) * R; a = th + Math.PI / 2; turning = true; }
  const img = CART_ROT.you[0][angIndex(a, CART_STEPS)];
  g.drawImage(img, Math.round(x - CART_D / 2), Math.round(y - CART_D / 2), CART_D, CART_D);
  helpEl.querySelectorAll('[data-key]').forEach(el => {
    const k = el.dataset.key;
    el.classList.toggle('is-down', k === 'W' ? !turning || Math.floor(demo.t * 4) % 2 === 0 : k === 'D' ? turning : k === 'S' ? turning && Math.floor(demo.t * 2) % 3 === 0 : false);
  });
}

// the extra sounds
// voices, the undertale way (every character gets their own little blip as
// their words are typed out): darryl's is a low, square, slightly rattly blip
// with a tiny click of teeth on it, pitched up when he's scared and down when
// he's frowning. yours, when you pick a reply, is a softer, higher murmur, a
// blip per word or so.
Object.assign(sfx, {
  darryl: mood => {
    const f = (mood === 'scared' ? 300 : mood === 'frown' ? 150 : 190) * (0.97 + Math.random() * 0.06);
    tone(f, 0.045, 'square', 0.03);
    tone(f * 2.01, 0.02, 'square', 0.008);
    noiseBurst(0.012, 4200, 0.025);
  },
  you: text => {
    const n = Math.min(6, Math.max(2, Math.round(text.split(' ').length * 0.8)));
    for (let i = 0; i < n; i++) tone((392 + (i % 2) * 49) * (0.97 + Math.random() * 0.06), 0.04, 'triangle', 0.035, i * 0.075);
  },
  click: () => { tone(1800, 0.03, 'square', 0.04); tone(900, 0.04, 'square', 0.03, 0.03); },
  geyser: () => { noiseBurst(0.35, 300, 0.12); tone(70, 0.3, 'sawtooth', 0.03); },
  clunk: () => { noiseBurst(0.14, 500, 0.14); tone(95, 0.18, 'square', 0.05); },
  creak: () => {
    if (!soundOn) return;
    try {
      const ac = getAudio(), t0 = ac.currentTime + 0.02;
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(85, t0);
      o.frequency.linearRampToValueAtTime(58, t0 + 0.5);
      o.frequency.linearRampToValueAtTime(104, t0 + 0.9);
      o.frequency.linearRampToValueAtTime(66, t0 + 1.55);
      f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 2.5;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.12);
      g.gain.setValueAtTime(0.07, t0 + 1.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
      o.connect(f).connect(g).connect(ac.destination);
      o.start(t0);
      o.stop(t0 + 1.65);
    } catch { /* no audio */ }
  },
  mash:  () => tone(520 + Math.random() * 80, 0.03, 'square', 0.025),
  zap:   () => { tone(1400, 0.12, 'sawtooth', 0.03); tone(700, 0.2, 'sawtooth', 0.03, 0.06); noiseBurst(0.2, 3200, 0.08); },
  cart:  v => noiseBurst(0.06, 220 + v * 1.5, 0.02 + v / 170 * 0.035)
});

// the race music: a fast, bouncy chiptune chase in c major (alex asked for
// something in the spirit of kirby's gourmet race, so it borrows the feel,
// not the tune: a quick tempo, an oom-pah bass jumping between root and fifth,
// offbeat chord stabs, a busy snare and hats, and a square wave lead that
// scurries up and down the chord). the lead is built from scale steps over
// each bar's chord (RACE_MOTIFS), so it's its own melody. it plays from when
// darryl says go until you cross the line, then the victory fanfare if you
// won. bright: it opens up the lo-fi filter moe's theme uses.
const RACE_SCALE = [0, 2, 4, 5, 7, 9, 11];
const RACE_CHORD = { C: 0, Dm: 1, Em: 2, F: 3, G: 4, Am: 5 };
const RACE_BARS = [
  ['C', 0], ['C', 1], ['F', 0], ['G', 3],
  ['C', 0], ['Am', 2], ['F', 1], ['G', 4],
  ['F', 2], ['G', 1], ['Em', 0], ['Am', 3],
  ['F', 1], ['G', 2], ['C', 0], ['G', 4]
];
const RACE_MOTIFS = [
  { 0: 4, 2: 5, 4: 4, 6: 2, 8: 0, 10: 2, 12: 4, 14: 7 },
  { 0: 7, 1: 6, 2: 5, 3: 4, 4: 3, 6: 2, 8: 1, 10: 2, 12: 4, 14: 2 },
  { 0: 0, 3: 2, 6: 4, 8: 7, 11: 4, 12: 5, 14: 4 },
  { 0: 4, 2: 4, 3: 5, 4: 4, 6: 2, 7: 4, 8: 7, 12: 6, 14: 4 },
  { 0: 7, 4: 4, 6: 5, 8: 7, 10: 9, 12: 8 }
];
const raceNote = (ch, deg, base) => {
  const k = RACE_CHORD[ch] + deg;
  return base + 12 * Math.floor(k / 7) + RACE_SCALE[((k % 7) + 7) % 7];
};
function raceStep(bar, step, t) {
  const [ch, mo] = RACE_BARS[bar], st = 60 / RACE_TUNE.bpm / 4;
  const triad = [0, 2, 4].map(d => raceNote(ch, d, 48));
  // oom-pah bass: root on the beat, fifth on the backbeat, octaves between
  if (step % 2 === 0) {
    const n = step % 8 === 0 ? triad[0] - 12 : step % 8 === 4 ? triad[2] - 12 : triad[0];
    mNote('triangle', midiHz(n), t, st * 1.5, step % 4 === 0 ? 0.28 : 0.16, { rel: 0.03 });
  }
  // drums: kick on 1 and 3 (and a pickup), snare on 2 and 4, hats on every offbeat 16th
  if (step === 0 || step === 8 || step === 14) mNote('sine', 130, t, 0.07, 0.3, { slide: 50, slideT: 0.06, rel: 0.03 });
  if (step === 4 || step === 12) { mNoise(t, 0.09, 0.2, 'bandpass', 1900, 1); mNoise(t, 0.05, 0.08, 'highpass', 5000); }
  if (step % 2 === 1) mNoise(t, 0.02, 0.045, 'highpass', 7500);
  // chord stabs on the offbeats
  if (step % 4 === 2) triad.forEach(n => mNote('square', midiHz(n + 12), t, st * 0.6, 0.022, { lp: 2600, rel: 0.02 }));
  // the lead, doubled with a slightly detuned copy so it sounds fat
  const m = RACE_MOTIFS[mo], deg = m[step];
  if (deg !== undefined) {
    let next = 16;
    for (let k = step + 1; k < 16; k++) if (m[k] !== undefined) { next = k; break; }
    const n = raceNote(ch, deg, 72), len = st * (next - step) * 0.85;
    mNote('square', midiHz(n), t, len, 0.06, { lp: 5200, rel: 0.03 });
    mNote('square', midiHz(n), t, len, 0.025, { lp: 5200, rel: 0.03, detune: 9 });
  }
}
const RACE_TUNE = { bpm: 176, bars: RACE_BARS.length, loopFrom: 0, bright: true, step: raceStep };

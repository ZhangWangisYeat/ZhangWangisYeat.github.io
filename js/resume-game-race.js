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
  armless: false, fled: false, tutorial: false, seen: false, stash: {}, mined: [], chest: null
}, quest.darryl && typeof quest.darryl === 'object' ? quest.darryl : {});
const DQ = quest.darryl;
const STASH_SLOTS = ['head', 'chest', 'legs', 'feet', 'hand'];
DQ.stash = Object.fromEntries(STASH_SLOTS.map(k => [k, validStack(DQ.stash && DQ.stash[k])]));
DQ.mined = Array.isArray(DQ.mined) ? DQ.mined.filter(n => Number.isInteger(n)) : [];
DQ.losses = Math.max(0, DQ.losses | 0);

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
// read as a crown): a red bandana knotted round his skull with the tails
// hanging off the back, a faded denim vest hanging open over his ribs, a slouch
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
    // the bandana over the top of his skull, white spots, knotted at the back
    // with the two tails hanging off (they flap when he moves)
    for (let y = 1; y <= 3; y++) for (let x = Math.round(hx) - 6; x <= Math.round(hx) + 5; x++) {
      if (((x - hx) / 6.4) ** 2 + ((y - 5.5) / 5.4) ** 2 > 1) continue;
      put(x, y + Y, (x + y * 3) % 5 === 0 ? '#f6e9e0' : y === 3 ? '#a82a20' : '#d8392c');
    }
    const kx = Math.round(hx) - 6, flap = walk ? frame % 2 : 0;
    put(kx, 3 + Y, '#a82a20'); put(kx - 1, 3 + Y, '#d8392c');
    line(kx - 1, 4 + Y, kx - 4, 6 + Y + flap, '#d8392c');
    line(kx - 1, 4 + Y, kx - 3, 8 + Y - flap, '#a82a20');
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
  const G = pixelGrid(30, 18), r = mulberry32(7370 + v);
  const bone = (x0, y0, x1, y1) => { pxLine(G, x0, y0, x1, y1, BONE.mid); G.set(x0, y0, BONE.hi); G.set(x1, y1, BONE.hi); };
  const flip = v % 2 ? -1 : 1, cx = 15;
  pxBlob(G, cx + flip * 9, 8, 3.6, 3.2, (dx, dy) => (dx + dy < -0.3 ? BONE.hi : BONE.mid));
  G.set(cx + flip * 10, 8, BONE.gap); G.set(cx + flip * 8, 8, BONE.gap); G.set(cx + flip * 9, 10, BONE.gap);
  for (let k = 0; k < 4; k++) pxLine(G, cx - 3 - flip, 5 + k * 2, cx + 3 - flip, 5 + k * 2, k % 2 ? BONE.lo : BONE.hi);
  pxLine(G, cx - 5 * flip, 9, cx + 4 * flip, 9, BONE.mid);
  bone(cx - flip * 6, 10, cx - flip * 12, 13 + v % 3);
  bone(cx - flip * 6, 7, cx - flip * 13, 5 + (v % 2));
  bone(cx + flip * 2, 12, cx + flip * 5 + ((r() * 3) | 0), 16);
  bone(cx - flip, 3, cx - flip * 4, 1);
  return G.outline(() => '#1c1a16').canvas();
}
const REMAINS_ART = [0, 1, 2, 3].map(makeRemains);

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
    if (!left && !right) { G.set(x, y, '#060505'); continue; }
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
const DOOR_ART = [0, 0.25, 0.5, 0.75, 1].map(makeDoor);

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
function paintRaceLines(g) {
  [S_START, S_FIN].forEach(s => {
    for (let d = -HALF - 10; d <= HALF + 10; d++) for (let k = 0; k < 4; k++) {
      const p = trackPt(s + k - 2, d);
      if (raceSolid(p.x, p.y)) continue;
      g.fillStyle = (Math.floor((d + 80) / 4) + Math.floor(k / 2)) % 2 ? '#f2f0ea' : '#1c1c22';
      g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  });
}
function paintRaceRoom() {
  const c = mk(RACE_W, RACE_H), g = c.getContext('2d');
  for (let ty = 0; ty < RACE_ROWS; ty++) for (let tx = 0; tx < RACE_COLS; tx++) paintRaceTile(g, tx, ty);
  paintRaceLines(g);
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
  // the ladder comes up a couple of steps from the shaft, not in its mouth,
  // or still holding w would walk you straight back in
  outside: { x: shaftThing.x, y: shaftThing.y }, exit: { x: shaftThing.x, y: shaftThing.y + 34 },
  door: VAULT_DOOR,
  blocked: (x, y) => vaultWalls(x, y) || (Math.abs(x - 120) < 26 && y > 74 && y < 104) || ((x > 62 && x < 82) || (x > 158 && x < 178)) && y > 52 && y < 96,
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
  thing: shaftThing, tile: shaftPoi.at, room: raceRoom, name: 'Mine Shaft', open: shaftOpen,
  shut: ['Sealed', '? ? ?', 'Beat the bosses before it first.'], hint: () => shaftOpen() && !DQ.seen
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
const vaultChest = addStation('chest', 192, 124, vaultRoom);
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
// ten places along the walls for the skeletons, spread down the track on
// alternating sides
const remains = Array.from({ length: 10 }, (_, k) => {
  const s = S_START + 300 + (k * (S_FIN - S_START - 600)) / 9, side = k % 2 ? 1 : -1;
  let p = trackPt(s, side * (HALF - 14));
  for (let d = HALF - 14; d > 10 && !onFloor(p.x, p.y, 8); d -= 4) p = trackPt(s, side * d);
  const o = { flat: true, x: p.x, y: p.y + 8, frames: [REMAINS_ART[k % 4]], gone: true };
  raceRoom.things.push(o);
  return o;
});
const showRemains = () => remains.forEach((o, k) => { o.gone = k >= Math.min(10, DQ.losses); });
showRemains();
const door = { x: DOOR_X, y: DOOR_Y, frames: [DOOR_ART[DQ.doorOpen ? 4 : 0]], k: DQ.doorOpen ? 1 : 0 };
raceRoom.things.push(door);
raceRoom.glows.push({ x: DOOR_X, y: DOOR_Y + 8, rgb: GLOW.torch, rad: 3.2, flicker: true, strength: 0.26 });

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
raceRoom.things.push(darryl);

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
let helpOpen = false;

function parkCart(c, s, d) {
  const p = trackPt(s, d);
  Object.assign(c, { x: p.x, y: p.y, a: p.a, v: 0, s, d, dT: d, spin: null, hole: null, spinA: 0, sink: 0, vmul: 1, crack: 0, cool: {}, rider: null, fin: false, stopped: true, slipped: {} });
}
const darrylHome = () => trackPt(S_START - 56, 30);
function standDarryl(x, y, flip) { Object.assign(darryl, { x, y, flip, state: 'wait', t: 0, gone: false, alpha: 1, hop: 0, goal: null }); }
// back to before the race: everyone at the start line, every rock back in place
function resetRace() {
  Object.assign(race, { phase: 'pre', t: 0, riding: false, result: null, pFin: null, dFin: null, judge: null, thief: null, goT: 0 });
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
  Object.assign(race, { phase: 'free', t: 0, riding: false, result: null, pFin: null, dFin: null, judge: null, thief: null });
  obstacles.forEach(o => { if (o.thing) o.thing.gone = false; o.broken = false; });
  parkCart(carts.you, S_START, -30);
  parkCart(carts.darryl, S_STOP, 30);
  const p = trackPt(S_STOP + 40, 6);
  standDarryl(p.x, p.y, false);
  darryl.gone = DQ.fled;
  darryl.talked = false;
}
if (DQ.won) resetFree(); else resetRace();

// the moving bits of a cart that's yours to drive
function cartFits(x, y) { return onFloor(x, y, 8); }
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
  const auto = c.fin;
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
function startTalk(steps, done) {
  talk = { steps, i: -1, t: 0, done };
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
  talkName.textContent = st.you ? 'You' : 'Darryl';
  talkText.textContent = '';
  if (st.d) sfx.talk();
}
function advanceTalk() {
  if (!talk) return;
  const st = talk.steps[talk.i];
  if (st.act) return;
  const text = st.d || st.you;
  if (st.d && talk.t * TALK_RATE < text.length) { talk.t = text.length / TALK_RATE; return; }
  sfx.ui();
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
    talk.shown = n;
    talkText.textContent = (st.you ? '▶ ' : '') + text.slice(0, n);
    if (st.d && n < text.length && n % 3 === 0) sfx.blip();
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
    { d: 'It\'s at the end of this corridor, we\'ll have to take the minecarts.' },
    { you: 'Could you take me there?' },
    { d: 'Sure, but last one there\'s a rotting skeleton!' }
  );
}
function winTalk() {
  const bling = STASH_SLOTS.some(k => DQ.stash[k]);
  const steps = [
    { d: 'Wow, bested by some random dude.' },
    { d: 'Well, actually, you do look like this one guy from Universe N03e$, but I can\'t put my bony finger on it.' },
    { you: 'So I assume you can open that suspicious looking door?' },
    { d: 'A deal is a deal.' },
    { act: popArm, wait: 1.2 }
  ];
  if (bling) steps.push({ d: 'Sorry for taking your bling, I couldn\'t help it.' }, { act: giveBling, wait: 0.8 });
  return steps;
}
function coreTalk() {
  return [
    { d: 'Hey, what\'s that glowing in your bag?', mood: 'idle' },
    { d: 'Wait. No. No no no no no.', mood: 'scared' },
    { d: 'It\'s YOU! You came back! They said you\'d come back for it!', mood: 'scared' },
    { d: 'The gate, the timelines, Universe N03e$... I didn\'t touch anything, I swear! I just race carts!', mood: 'scared' },
    { you: 'Darryl, what are you talking about?' },
    { d: 'Take it! Take it and leave me alone!', mood: 'scared' },
    { act: fleeDarryl, wait: 0.6 }
  ];
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
  STASH_SLOTS.forEach(k => {
    const st = DQ.stash[k];
    if (!st) return;
    dropStack(st, player.x + (Math.random() - 0.5) * 30, player.y + 8 + Math.random() * 10, raceRoom, 0.6, { x: darryl.x, y: darryl.y - 14 });
    DQ.stash[k] = null;
  });
  sfx.pickup();
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
  setTimeout(() => toast('Darryl ran off', 'Crumpled Map', 'He dropped something...'), 900);
  markDirty();
}

// losing: he points at you and you turn to bones. if you had anything good on
// you he walks over and takes the best of it (see pickLoot).
const LOOT_RANK = { gold: 10, diamond: 3, emerald: 2, iron: 1 };
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
    burst(player.x, player.y - 14, '230,255,200', 26);
    sfx.zap();
    addShake(2);
  }
  if (j.t > 1.9 && !j.boned) {
    j.boned = true;
    race.judge = null;
    darryl.pose = null;
    DQ.losses++;
    const took = pickLoot();
    player.skeleton = 'pile';
    player.deathSoft = true;
    player.deathLen = DEATH + (took ? 4.6 : 0.4);
    race.thief = took ? { ...took, phase: 'wait', t: 0, x: player.x + 8, y: player.y + 4, say: brag(took.st) } : null;
    die();
    sfx.crunch();
    markDirty();
  }
}
// him strolling over to your bones, bending down for the loot, putting it on,
// and wandering back to the door
function tickThief(dt) {
  const th = race.thief;
  th.t += dt;
  if (th.phase === 'wait' && player.deadT > 0.7) { th.phase = 'walk'; walkDarryl(th.x + (darryl.x < th.x ? -12 : 12), th.y, 70); }
  if (th.phase === 'walk' && darryl.state === 'wait') { th.phase = 'grab'; th.t = 0; darryl.pose = 'grab'; darryl.flip = th.x < darryl.x; }
  if (th.phase === 'grab' && th.t > 0.45) { th.phase = 'lift'; th.t = 0; sfx.pickup(); }
  if (th.phase === 'lift' && th.t > 0.45) {
    th.phase = 'done';
    th.t = 0;
    darryl.pose = null;
    sfx.found();
  }
  // he admires it for a moment (see raceOverlay's speech bubble), then
  // wanders back to the door
  if (th.phase === 'done' && th.t > 1.8 && !th.left) {
    th.left = true;
    const p = trackPt(S_STOP + 40, 6);
    walkDarryl(p.x, p.y, 60);
  }
}

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
  if (helpOpen) { tickHelpDemo(dt); return; }
  tickTalk(dt);
  if (room === vaultRoom) { vaultTick(); return; }
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
        walkDarryl(Dc.x + 12, Dc.y + 2, 120, () => { darryl.state = 'hop'; darryl.t = 0; });
        if (!DQ.tutorial) { DQ.tutorial = true; openHelp(); markDirty(); }
      });
    } else if (race.phase === 'free' && DQ.won && !DQ.fled) {
      if (countItem('exotic-core')) startTalk(coreTalk());
      else if (!DQ.keyGiven) startTalk(winTalk());
      else startTalk([{ d: DQ.doorOpen ? 'Door\'s open, champ. Go on in.' : 'Go on, the key fits the door. Trust me, I\'d know.' }]);
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
  if (!race.riding && !player.dead && ['go', 'race', 'free'].includes(race.phase) && !Y.fin && Math.hypot(Y.x - player.x, Y.y - player.y) < 14) {
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
      if (!race.result) { race.result = 'win'; victoryJingle(); toast('Finish', 'You win!', 'Darryl\'s gonna hate this.'); }
      else toast('Finish', 'Darryl wins', 'Last one there\'s a rotting skeleton...');
    }
    if (!Y.fin && race.phase === 'free' && Y.s >= S_FIN) Y.fin = true;
    // stopped at the end: hop out next to the cart
    if (Y.fin && Math.abs(Y.v) < 3 && Y.s > S_STOP - 12) {
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
    // close enough to chat when you've won, a few steps back when he's about
    // to zap you
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
        startTalk([{ d: 'Sorry bro, but I guess I\'m still the best racer.', mood: 'frown' }], startJudge);
      }
    });
  }

  // the big door: the bone key opens it, then walk through
  if (!DQ.doorOpen && Math.hypot(player.x - DOOR_X, player.y - (DOOR_Y + 14)) < 30 && !player.dead) {
    if (countItem('bone-key')) {
      takeItem('bone-key', 1);
      DQ.doorOpen = true;
      door.k = 0;
      sfx.boom();
      addShake(2);
      toast('Unlocked', 'The big door', 'The key crumbles to dust in the lock.');
      afterInventoryChange();
      markDirty();
    } else if (performance.now() > (door.hintAt || 0)) {
      door.hintAt = performance.now() + 5000;
      toast('Locked', 'A big door', 'There\'s a bone-shaped keyhole...');
      sfx.deny();
    }
  }
  if (DQ.doorOpen && door.k < 1) door.k = Math.min(1, door.k + dt * 0.9);
  door.frames = [DOOR_ART[Math.round(door.k * 4)]];
  if (DQ.doorOpen && door.k > 0.7 && !player.dead && player.y < DOOR_Y + 8 && Math.abs(player.x - DOOR_X) < 14) enterRoom(vaultRoom);

  // the carts' lamps go where the carts go
  Object.values(carts).forEach(c => { c.lamp.x = c.x + Math.cos(c.a) * 10; c.lamp.y = c.y + Math.sin(c.a) * 10 - 4; });
}
// in the vault: the ladder up the back wall takes you outside
function vaultTick() {
  if (room !== vaultRoom || player.dead) return;
  if (Math.abs(player.x - 36) < 9 && player.y < 40 && (keys.has('KeyW') || keys.has('ArrowUp'))) {
    keys.delete('KeyW');
    keys.delete('ArrowUp');
    playLeaveRoom();
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
    }
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
  race.riding = false;
  if (DQ.won) resetFree(); else resetRace();
}
function raceHolds() { return !!talk || race.riding || !!race.judge || helpOpen || (room === raceRoom && darryl.state === 'walk' && race.phase === 'over'); }
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
    if ((e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) mashPress();
    if (MOVE_KEYS[e.code]) { e.preventDefault(); return false; }
    return ['e', 'q', 'f'].includes(e.key.toLowerCase());
  }
  return raceHolds() && ['e', 'q', 'f'].includes(e.key.toLowerCase());
}
function raceClick() { if (talk) advanceTalk(); }
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
  const th = race.thief, hide = th && th.phase !== 'done' ? th.slot : null;
  const gear = {};
  ['head', 'chest', 'legs', 'feet'].forEach(k => { if (DQ.stash[k] && k !== hide) gear[k] = ITEMS[DQ.stash[k].id].armor; });
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
  const tool = DQ.stash.hand && hide !== 'hand' ? ICON_CANVAS[DQ.stash.hand.id] : null;
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
  // his bony finger: a glow builds on the tip, then a beam that has no business
  // bending the way it does whips out in a loop and lands on you, thick and
  // bright with two strands corkscrewing round it and sparks flying off
  const J = race.judge;
  if (J && J.t < 1.3) {
    const fx = darryl.x + (darryl.flip ? -12 : 12), fy = darryl.y - 19, tx = player.x, ty = player.y - 14;
    ctx.globalCompositeOperation = 'lighter';
    const orb = Math.min(1, J.t / 0.3) * (J.t > 1 ? Math.max(0, (1.3 - J.t) / 0.3) : 1);
    const og = ctx.createRadialGradient(toX(fx), toY(fy), 0, toX(fx), toY(fy), (6 + orb * 6) * S);
    og.addColorStop(0, `rgba(240,255,230,${0.9 * orb})`);
    og.addColorStop(0.5, `rgba(120,255,150,${0.5 * orb})`);
    og.addColorStop(1, 'rgba(80,255,140,0)');
    ctx.fillStyle = og;
    ctx.fillRect(toX(fx) - 12 * S, toY(fy) - 12 * S, 24 * S, 24 * S);
    if (J.t > 0.3) {
      const k = Math.min(1, (J.t - 0.3) / 0.35), fade = J.t > 1 ? Math.max(0, (1.3 - J.t) / 0.3) : 1;
      const dx = tx - fx, dy = ty - fy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      // up and over in a big arc, with a wobble running down it
      const lift = 34 + Math.sin(J.t * 7 + J.seed) * 10;
      const pt = u => {
        const bx = fx + dx * u + nx * Math.sin(u * Math.PI) * lift * (darryl.flip ? -1 : 1) + Math.sin(u * 3 * Math.PI + J.t * 2) * 0;
        const by = fy + dy * u + ny * Math.sin(u * Math.PI) * lift * (darryl.flip ? -1 : 1) - Math.sin(u * Math.PI) * 18;
        return [bx, by];
      };
      const n = 46;
      for (let i = 0; i <= n * k; i++) {
        const u = i / n, [bx, by] = pt(u), w = 1 + Math.sin(u * 30 - J.t * 40) * 0.5;
        ctx.fillStyle = `rgba(90,255,140,${0.22 * fade})`;
        ctx.fillRect(toX(bx) - 4 * S, toY(by) - 4 * S, 8 * S, 8 * S);
        ctx.fillStyle = `rgba(170,255,190,${0.55 * fade})`;
        ctx.fillRect(toX(bx) - Math.round(2 * w) * S, toY(by) - Math.round(2 * w) * S, Math.round(4 * w) * S, Math.round(4 * w) * S);
        ctx.fillStyle = `rgba(255,255,255,${0.95 * fade})`;
        ctx.fillRect(toX(bx) - S, toY(by) - S, 2 * S, 2 * S);
        // the corkscrew strands
        const twist = u * 26 - J.t * 30;
        [0, Math.PI].forEach((ph, si) => {
          const off = Math.sin(twist + ph) * 5;
          ctx.fillStyle = si ? `rgba(200,140,255,${0.8 * fade})` : `rgba(120,240,255,${0.8 * fade})`;
          ctx.fillRect(toX(bx + nx * off), toY(by + ny * off), S, S);
        });
        if (!reduceMotion && Math.random() < 0.05) particles.push({ x: bx, y: by, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, g: 0, life: 0.3, t: 0, col: Math.random() < 0.5 ? '#c8ffd0' : '#ffffff', size: 1 });
      }
      if (k >= 1) {
        const rg = ctx.createRadialGradient(toX(tx), toY(ty), 0, toX(tx), toY(ty), 16 * S);
        rg.addColorStop(0, `rgba(240,255,230,${0.8 * fade})`);
        rg.addColorStop(1, 'rgba(80,255,140,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(toX(tx) - 16 * S, toY(ty) - 16 * S, 32 * S, 32 * S);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // the loot he's after, lying on your bones, then floating up into his hand
  const th = race.thief;
  // what he says about it, in a bubble over his head
  if (th && th.phase === 'done' && th.say) {
    const bfs = Math.max(8, 8 * Math.round((S * 4) / 8));
    ctx.font = `${bfs}px Silkscreen, monospace`;
    const tw = ctx.measureText(th.say).width, pad = bfs * 0.7;
    const bx = toX(darryl.x), by = toY(darryl.y - 44);
    const alpha = Math.min(1, th.t * 5) * Math.min(1, Math.max(0, (deathLen() - 0.7 - player.deadT) * 3));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#f2ede0';
    ctx.fillRect(bx - tw / 2 - pad, by - bfs * 1.1, tw + pad * 2, bfs * 2.2);
    ctx.fillRect(bx - 2 * S, by + bfs * 1.1, 4 * S, 2 * S);
    ctx.fillRect(bx - S, by + bfs * 1.1 + 2 * S, 2 * S, 2 * S);
    ctx.fillStyle = '#1c1a16';
    ctx.fillText(th.say, bx, by + 1);
    ctx.globalAlpha = 1;
    ctx.font = `${fs}px Silkscreen, monospace`;
  }
  if (th && th.phase !== 'done') {
    let x = th.x, y = th.y - 8 - (reduceMotion ? 0 : Math.round(Math.sin(t / 300)));
    if (th.phase === 'lift') { const u = Math.min(1, th.t / 0.45); x += (darryl.x - x) * u; y += (darryl.y - 20 - y) * u - Math.sin(u * Math.PI) * 10; }
    ctx.drawImage(ICON_CANVAS[th.st.id], toX(x - 6), toY(y - 6), 12 * S, 12 * S);
  }
}

// the controls card the first time you race. the race (and darryl) wait
// while it's up, and a little cart drives round a loop in it, showing which
// key does what as it goes.
const helpEl = $('#race-help'), helpDemo = $('#race-demo'), demoCtx = helpDemo.getContext('2d');
const demo = { t: 0 };
function openHelp() {
  helpOpen = true;
  helpEl.hidden = false;
  document.body.classList.add('is-help');
  demo.t = 0;
  setTimeout(() => $('#race-help-go').focus(), 50);
}
function closeHelp() {
  helpOpen = false;
  helpEl.hidden = true;
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
Object.assign(sfx, {
  talk:  () => tone(300, 0.04, 'square', 0.02),
  blip:  () => tone(240 + Math.random() * 120, 0.03, 'square', 0.015),
  mash:  () => tone(520 + Math.random() * 80, 0.03, 'square', 0.025),
  zap:   () => { tone(1400, 0.12, 'sawtooth', 0.03); tone(700, 0.2, 'sawtooth', 0.03, 0.06); noiseBurst(0.2, 3200, 0.08); },
  cart:  v => noiseBurst(0.06, 220 + v * 1.5, 0.02 + v / 170 * 0.035)
});

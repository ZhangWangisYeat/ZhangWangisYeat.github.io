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
// points (in tiles), smoothed into a curve, with the floor HALF px either side
// of it. it comes in through the bottom wall (the way in and out) and ends at
// the big door in the top wall on the right.
const RACE_COLS = 104, RACE_ROWS = 72;
const RACE_W = RACE_COLS * TILE, RACE_H = RACE_ROWS * TILE;
const HALF = 40, DS = 4;
const TRACK_PTS = [
  [8, 75], [8, 60], [9, 47], [16, 41], [27, 42], [31, 50], [33, 59], [42, 64], [56, 63], [63, 55],
  [58, 46], [45, 41], [39, 31], [26, 26], [13, 23], [11, 13], [20, 8], [34, 9], [45, 15], [57, 21],
  [70, 24], [79, 33], [77, 45], [80, 58], [92, 62], [97, 52], [93, 40], [89, 28], [88, 16], [88, 5]
];
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
// start line, the finish line comes a little before the end, the carts roll
// to a stop at S_STOP, and the door is the very end.
const S_START = 230, S_FIN = track.len - 170, S_STOP = track.len - 72, S_DOOR = track.len - 30;

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
// the walls wobble in and out a little, so it's dug, not drawn with a ruler
const edgeAt = (x, y) => HALF + (vnoise(x / 26, y / 26, 7311) - 0.5) * 12;
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
// room to stand (on foot) or to fit a cart: the floor, short of the walls, and
// not past the door while it's shut
function onFloor(x, y, margin) {
  const t = trackAt(x, y);
  if (!t || t.dist > edgeAt(x, y) - margin) return false;
  return t.s < (DQ.doorOpen ? track.len : S_DOOR);
}

// what's in the way. gems spin you out, jagged rocks crack your cart, holes
// swallow it, and mud and water slow you down (mud more). s is how far along,
// d is how far right of the centre line. darryl takes the gem at index MISTAKE.gem
// and the mud at MISTAKE.mud on purpose, his two slip ups.
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
const OB_SIZE = { gem: 7, rock: 9, hole: 11, mud: 15, water: 15 };
const PATCH_LEN = { mud: 30, water: 26 };
const obstacles = OBST.map(([f, kind, d, gem], n) => {
  const s = S_START + 120 + f * (S_FIN - S_START - 160);
  const p = trackPt(s, d);
  return { n, kind, s, d, x: p.x, y: p.y, a: p.a, r: OB_SIZE[kind], gem, along: PATCH_LEN[kind] || OB_SIZE[kind] };
});
const inPatch = (o, x, y) => {
  const dx = x - o.x, dy = y - o.y, c = Math.cos(-o.a), s = Math.sin(-o.a);
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return (lx / o.along) ** 2 + (ly / o.r) ** 2 <= 1;
};

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
const ORE_COL = { 'iron-ore': ['#f0ebe2', '#a39d94'], 'gold-ore': ['#ffe066', '#a8800f'], ruby: ['#ff6a5a', '#8a1a14'], emerald: ['#7ef0a6', '#1a6e3a'] };
function makeWallOre(id) {
  const G = pixelGrid(16, 14);
  pxBlob(G, 8, 8, 7, 5.5, (dx, dy, x, y) => {
    const lit = -(dx * 0.6 + dy * 0.8) + (hash2(x, y, 901) - 0.5) * 0.4;
    return lit > 0.4 ? '#8a8a8a' : lit > -0.2 ? '#6a6a6a' : '#4c4c4c';
  });
  const [hi, lo] = ORE_COL[id];
  [[5, 6], [9, 5], [11, 9], [6, 10], [8, 8]].forEach(([x, y]) => { G.set(x, y, hi); G.set(x + 1, y, lo); G.set(x, y + 1, lo); });
  return G.outline(() => '#1a1a1a').canvas();
}
const GEM_ART = Object.fromEntries(Object.keys(GEM_PAL).map(k => [k, makeGemCluster(k)]));
const JAGGED = makeJagged();
const WALL_ORE = Object.fromEntries(Object.keys(ORE_COL).map(k => [k, makeWallOre(k)]));

// a minecart seen from above, nose to the right, so it can be turned any way:
// a wooden tub with iron bands and rim, wheels at the corners and a lamp on
// the front. yours is plain wood, darryl's is painted black with bone trim.
function makeCartGrid(look) {
  const G = pixelGrid(26, 18);
  const [hi, mid, lo] = look.wood, rim = look.rim;
  [[5, 0], [16, 0], [5, 16], [16, 16]].forEach(([x, y]) => {
    for (let k = 0; k < 4; k++) { G.set(x + k, y, '#1c1c22'); G.set(x + k, y + 1, k === 1 || k === 2 ? '#6e6e78' : '#1c1c22'); }
  });
  for (let y = 2; y <= 15; y++) for (let x = 1; x <= 22; x++) {
    const edge = x === 1 || x === 22 || y === 2 || y === 15;
    const inside = x >= 4 && x <= 19 && y >= 5 && y <= 12;
    let col = edge ? rim : inside ? (y === 5 ? '#1e140c' : (y % 3 === 0 ? '#2e1e12' : '#3b2616')) : (y < 5 ? hi : y > 12 ? lo : mid);
    if (!inside && !edge && (x === 7 || x === 16)) col = look.band;
    G.set(x, y, col);
  }
  G.set(23, 8, '#ffd23f'); G.set(23, 9, '#ffd23f'); G.set(24, 8, '#fff3c4'); G.set(24, 9, '#fff3c4');
  if (look.skull) [[11, 8], [12, 8], [11, 9], [12, 9], [13, 8], [13, 9]].forEach(([x, y]) => G.set(x, y, '#e8e1cc'));
  return G.outline(() => '#141414');
}
const CART_STEPS = 32, CART_D = 34;
const CART_LOOK = {
  you: { wood: ['#d0955a', '#a8703f', '#74491f'], rim: '#5e5e66', band: '#8a8a94' },
  darryl: { wood: ['#4a4650', '#2e2b33', '#1c1a20'], rim: '#e8e1cc', band: '#b8af96', skull: true }
};
const CART_ROT = Object.fromEntries(Object.entries(CART_LOOK).map(([k, look]) => [k, rotSet(makeCartGrid(look), 12.5, 9, CART_D, CART_STEPS)]));

// darryl: a chibi skeleton about your size, facing right like every other
// creature. racing goggles pushed up on his skull and a red neckerchief. he
// wears whatever he's taken off you. plain is the same skeleton with none of
// that, which is what you turn into when you lose.
const BONE = { hi: '#f4eedc', mid: '#d6ccb2', lo: '#a39a80', gap: '#2a2620' };
const DARRYL_W = 26, DARRYL_H = 32;
function makeSkeleton(pose, frame, o = {}) {
  const G = pixelGrid(DARRYL_W, DARRYL_H);
  const put = (x, y, c) => G.set(x, y, c);
  const line = (x0, y0, x1, y1, c) => pxLine(G, x0, y0, x1, y1, c);
  if (pose === 'pile') {
    // what's left of you: a heap of bones with the skull on top
    [[5, 27, 13, 25], [9, 28, 18, 28], [14, 26, 21, 27], [4, 29, 10, 29], [16, 29, 22, 29]].forEach(([a, b, c, d], i) => line(a, b, c, d, i % 2 ? BONE.mid : BONE.hi));
    [[5, 26], [13, 24], [18, 27], [22, 26], [10, 29]].forEach(([x, y]) => put(x, y, BONE.hi));
    pxBlob(G, 12, 21, 4.5, 4, (dx, dy) => (dx + dy < -0.5 ? BONE.hi : dx + dy < 0.6 ? BONE.mid : BONE.lo));
    [[13, 20], [14, 20], [13, 21]].forEach(([x, y]) => put(x, y, BONE.gap));
    return G.outline(() => '#1c1a16').canvas();
  }
  const bob = ['idle', 'talk', 'frown'].includes(pose) && frame === 1 ? 1 : 0;
  const low = pose === 'grab' ? 3 : pose === 'kneel' ? 6 : 0;
  const Y = bob + low;
  const walk = ['walk', 'scared'].includes(pose);
  const stride = walk ? [2, 0, -2, 0][frame % 4] : 0, lift = walk && frame % 2 === 1 ? 1 : 0;
  const gear = o.gear || {};
  // legs: the far one darker, the near one lit. kneeling folds them under.
  const leg = (hipX, dx, c, raised) => {
    if (pose === 'kneel') { line(hipX, 23 + Y - 6, hipX + 3, 28, c); line(hipX + 3, 28, hipX - 2, 29, c); return; }
    line(hipX, 23 + Y, hipX + Math.round(dx / 2), 26 + Y - raised, c);
    line(hipX + Math.round(dx / 2), 26 + Y - raised, hipX + dx, 29 - raised, c);
    put(hipX + dx + 1, 29 - raised, c); put(hipX + dx + 2, 29 - raised, c);
  };
  leg(11, -stride, gear.legs ? MAT_PAL[gear.legs][2] : BONE.lo, frame % 4 === 3 ? lift : 0);
  leg(13, stride, gear.legs ? MAT_PAL[gear.legs][1] : BONE.mid, frame % 4 === 1 ? lift : 0);
  if (gear.feet) [[10 - stride, 29], [12 + stride, 29]].forEach(([x, y]) => { for (let k = -1; k <= 3; k++) put(x + k, y, MAT_PAL[gear.feet][k < 1 ? 0 : 2]); });
  // the far arm, behind the ribs
  const sh = 16 + Y;
  if (pose === 'scared') line(11, sh, 7, sh - 7, BONE.lo);
  else line(11, sh, 10 - Math.round(stride / 2), sh + 6, BONE.lo);
  // pelvis, spine and ribs
  for (let x = 10; x <= 14; x++) { put(x, 22 + Y, BONE.hi); put(x, 23 + Y, x === 12 ? BONE.gap : BONE.lo); }
  for (let y = 15; y <= 21; y++) put(10, y + Y, BONE.mid);
  [[16, 14], [18, 15], [20, 14]].forEach(([ry, x1]) => {
    for (let x = 10; x <= x1; x++) put(x, ry + Y, x === x1 ? BONE.lo : BONE.hi);
    if (ry < 20) for (let x = 11; x < x1; x++) put(x, ry + 1 + Y, BONE.gap);
  });
  put(15, 17 + Y, BONE.lo); put(15, 19 + Y, BONE.lo);
  if (gear.chest) {
    const P = MAT_PAL[gear.chest];
    for (let y = 15; y <= 21; y++) for (let x = 9; x <= 16; x++) put(x, y + Y, x === 9 || y === 15 ? P[0] : x === 16 || y === 21 ? P[2] : P[1]);
  }
  if (gear.legs) { const P = MAT_PAL[gear.legs]; for (let x = 9; x <= 15; x++) { put(x, 22 + Y, P[0]); put(x, 23 + Y, P[1]); } }
  // neck and the neckerchief
  put(11, 13 + Y, BONE.mid); put(12, 14 + Y, BONE.mid);
  if (!o.plain) {
    for (let x = 9; x <= 15; x++) put(x, 14 + Y, x < 12 ? '#e04a3a' : '#a82a20');
    put(9, 15 + Y, '#a82a20'); put(8, 16 + Y, '#e04a3a');
  }
  // the skull: big and round, lit from the top left, the eye socket and nose
  // on the front, and a jaw full of teeth that drops when he talks
  const open = pose === 'talk' && frame === 1 ? 1 : pose === 'scared' ? 2 : 0;
  pxBlob(G, 12.5, 7 + Y, 6, 5.4, (dx, dy) => (dx + dy < -0.7 ? BONE.hi : dx + dy < 0.5 ? BONE.mid : BONE.lo));
  for (let x = 11; x <= 18; x++) put(x, 12 + Y + open, x >= 13 && x % 2 ? BONE.hi : BONE.mid);
  for (let x = 13; x <= 18; x++) put(x, 11 + Y, open ? BONE.gap : x % 2 ? '#ffffff' : BONE.lo);
  if (open > 1) for (let x = 13; x <= 18; x++) put(x, 12 + Y, BONE.gap);
  const eye = pose === 'scared' ? [[14, 6], [15, 6], [16, 6], [14, 7], [15, 7], [16, 7], [15, 8]] : [[15, 6], [16, 6], [15, 7], [16, 7]];
  eye.forEach(([x, y]) => put(x, y + Y, BONE.gap));
  if (pose === 'frown') { put(14, 5 + Y, BONE.gap); put(15, 5 + Y, BONE.gap); put(16, 4 + Y, BONE.gap); }
  put(18, 9 + Y, BONE.gap);
  if (gear.head) {
    const P = MAT_PAL[gear.head];
    for (let y = 1; y <= 5; y++) for (let x = 6; x <= 19; x++) {
      if (!G.get(x, y + Y) && y > 2) continue;
      if (((x - 12.5) / 7) ** 2 + ((y - 6) / 5.5) ** 2 > 1) continue;
      put(x, y + Y, y === 5 ? P[2] : x < 11 ? P[0] : P[1]);
    }
  }
  if (!o.plain) {
    for (let x = 7; x <= 17; x++) put(x, 4 + Y, '#5a3a22');
    [[15, 3], [16, 3], [17, 3], [15, 4], [16, 4], [17, 4]].forEach(([x, y]) => put(x, y + Y, '#f2b33c'));
    put(16, 3 + Y, '#fff3c4');
  }
  // the near arm, in front of everything: hanging, swinging, pointing at you,
  // reaching down to pick something up, or thrown up in fright. no near arm
  // once it's been popped off for the key, just a nub where it was.
  if (o.armless) put(13, sh, BONE.lo);
  else if (pose === 'point') { line(13, sh, 21, sh - 1, BONE.hi); put(22, sh - 1, BONE.hi); put(23, sh - 1, BONE.mid); }
  else if (pose === 'grab') line(13, sh, 18, sh + 6, BONE.hi);
  else if (pose === 'scared') line(13, sh, 18, sh - 8, BONE.hi);
  else line(13, sh, 14 + Math.round(stride / 2), sh + 6, BONE.hi);
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

// painting the race room: rock everywhere, the track's packed floor dug
// through it, a lit rock face wherever the wall stands above the floor (the
// game's usual three quarter view), the start and finish lines, and the mud,
// water and holes, which never move so they're painted straight in
function paintRaceRoom() {
  const w = RACE_W, h = RACE_H, c = mk(w, h), g = c.getContext('2d');
  const img = g.createImageData(w, h), px = img.data;
  const floor = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = (y >> 2) * GW + (x >> 2), i = cellI[j];
    if (i < 0) continue;
    const dist = Math.hypot(x + 0.5 - track.xs[i], y + 0.5 - track.ys[i]);
    if (dist < HALF - 8 || (dist < HALF + 8 && dist < edgeAt(x, y))) floor[y * w + x] = dist < edgeAt(x, y) - 6 ? 1 : 2;
  }
  for (let x = 0; x < w; x++) {
    let since = 99;
    for (let y = h - 1; y >= 0; y--) {
      const f = floor[y * w + x], o = (y * w + x) * 4, n = hash2(x, y, 7320);
      let r, gg, b;
      if (f) {
        since = 0;
        const loose = vnoise(x / 18, y / 18, 7321) > 0.56;
        r = loose ? 104 : 92; gg = loose ? 86 : 76; b = loose ? 68 : 62;
        if (f === 2) { r -= 18; gg -= 16; b -= 14; }
        if (n < 0.08) { r -= 14; gg -= 12; b -= 10; } else if (n > 0.95) { r += 18; gg += 16; b += 14; }
      } else {
        since++;
        if (since <= 14) {
          // the rock face: lit at the top, darker down where it meets the floor
          const v = 108 - (14 - since) * 3 + (vnoise(x / 6, y / 30, 7322) - 0.5) * 18;
          r = v; gg = v - 6; b = v - 12;
          if (since === 14) { r += 20; gg += 20; b += 18; }
        } else {
          const m = vnoise(x / 16, y / 16, 7323);
          const v = 34 + m * 22;
          r = v; gg = v - 3; b = v - 5;
          if (n < 0.04) { r += 14; gg += 12; b += 10; }
        }
      }
      px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const dot = (x, y, col, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), ww, hh); };
  // mud, water and holes, each lying along the track
  obstacles.forEach(o => {
    if (o.kind !== 'mud' && o.kind !== 'water' && o.kind !== 'hole') return;
    const ca = Math.cos(o.a), sa = Math.sin(o.a);
    for (let y = Math.floor(o.y - 34); y <= o.y + 34; y++) for (let x = Math.floor(o.x - 34); x <= o.x + 34; x++) {
      const lx = (x - o.x) * ca + (y - o.y) * sa, ly = -(x - o.x) * sa + (y - o.y) * ca;
      const e = (lx / (o.along + 2)) ** 2 + (ly / (o.r + 2)) ** 2;
      if (e > 1) continue;
      const rim = e > 0.6, n = hash2(x, y, 7330 + o.n);
      let col;
      if (o.kind === 'mud') col = rim ? '#4a3420' : n < 0.12 ? '#7a5a38' : n < 0.5 ? '#5a3e24' : '#523822';
      else if (o.kind === 'water') col = rim ? '#2e5a7a' : n < 0.08 ? '#9fd3ff' : n < 0.5 ? '#3f7aa8' : '#386e98';
      else col = e > 0.75 ? '#6b5038' : e > 0.55 ? '#2a2018' : '#060505';
      dot(x, y, col);
    }
  });
  // a checkered line across the track at the start and the finish
  [S_START, S_FIN].forEach(s => {
    for (let d = -HALF + 2; d <= HALF - 2; d += 1) for (let k = 0; k < 4; k++) {
      const p = trackPt(s + k - 2, d);
      dot(p.x, p.y, (Math.floor((d + 40) / 4) + Math.floor(k / 2)) % 2 ? '#f2f0ea' : '#1c1c22');
    }
  });
  return c;
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
  [[64, 44], [160, 44]].forEach(([x0, y0]) => {
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

const DOOR_X = Math.round(track.xs[track.n - 1]), DOOR_Y = Math.round(track.ys[track.n - 1] - HALF + 8);
const raceRoom = {
  id: 'race', w: RACE_W, h: RACE_H, dust: '#6e5a46', shade: 0.62, underground: true, fight: false,
  canvas: paintRaceRoom(),
  outside: { x: shaftThing.x, y: shaftThing.y }, exit: { x: shaftThing.x, y: shaftThing.y + 10 },
  door: 8,
  // the floor, short of the walls, minus the gems and rocks in the way, and
  // nothing past the door until it's open
  blocked: (x, y) => !onFloor(x, y, 5) || (!DQ.doorOpen && y < DOOR_Y + 10) || obstacles.some(o => o.thing && !o.thing.gone && Math.hypot(x - o.x, y - o.y) < o.r + 3),
  things: [], glows: []
};
const vaultWalls = roomWalls(VAULT_COLS, VAULT_ROWS, VAULT_DOOR);
const vaultRoom = {
  id: 'vault', w: VAULT_COLS * TILE, h: VAULT_ROWS * TILE, dust: '#4e4650', shade: 0.5, underground: true,
  canvas: paintVault(),
  outside: { x: shaftThing.x, y: shaftThing.y }, exit: { x: shaftThing.x, y: shaftThing.y + 10 },
  door: VAULT_DOOR,
  blocked: (x, y) => vaultWalls(x, y) || (Math.abs(x - 120) < 26 && y > 62 && y < 92) || ((x > 62 && x < 82) || (x > 158 && x < 178)) && y > 42 && y < 86,
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
    { x: 72, y: 64, rgb: '255,140,40', rad: 3.2, flicker: true, strength: 0.32 },
    { x: 168, y: 64, rgb: '255,140,40', rad: 3.2, flicker: true, strength: 0.32 },
    { x: 120, y: 46, rgb: '255,170,60', rad: 2.6, flicker: true, strength: 0.26 },
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
vaultRoom.things.push({ x: 120, y: 90, frames: [LAVA_LORD] });
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
const vaultChest = addStation('chest', 190, 112, vaultRoom);
vaultChest.slots = DQ.chest;
vaultChest.where = 'in the vault';

// what's along the track: the gems and rocks you can hit, torches on the
// walls every so often, ore set into the walls (mineable once you've won),
// and the big door
obstacles.forEach(o => {
  if (o.kind === 'gem') o.thing = { x: o.x, y: o.y + 6, frames: [GEM_ART[o.gem]] };
  else if (o.kind === 'rock') o.thing = { x: o.x, y: o.y + 6, frames: [JAGGED] };
  if (o.thing) raceRoom.things.push(o.thing);
});
{
  const r = mulberry32(7340);
  let side = 1, n = 0;
  for (let s = 120; s < track.len - 90; s += 70) {
    side = -side;
    const torch = n++ % 3 === 0;
    const p = trackPt(s, side * (HALF + (torch ? 9 : 8)));
    const t = trackAt(p.x, p.y);
    // only on rock that belongs to this bit of the track (not the far side of
    // a wall that another bend runs along)
    if (!t || Math.abs(t.s - s) > 24 || onFloor(p.x, p.y, -4)) continue;
    if (torch) {
      const th = { x: p.x, y: p.y + 4, frames: TORCH, fps: 7, phase: s % 3 };
      raceRoom.things.push(th);
      raceRoom.glows.push({ x: th.x, y: th.y - 12, rgb: GLOW.torch, rad: 3.4, flicker: true, strength: 0.24 });
    } else if (s > S_START + 40 && s < S_FIN - 40) {
      const roll = r();
      const ore = roll < 0.55 ? 'iron-ore' : roll < 0.82 ? 'gold-ore' : roll < 0.97 ? 'ruby' : 'emerald';
      const idxOre = raceRoom.things.filter(o => o.trackOre).length;
      raceRoom.things.push({ x: p.x, y: p.y + 6, frames: [WALL_ORE[ore]], trackOre: true, ore, idx: idxOre, gone: DQ.mined.includes(idxOre) });
    }
  }
}
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
// darryl's top speed is a bit lower and he drives the centre line carefully,
// so a clean run beats him, but it doesn't take many slip ups to lose.
const RACE = { vmax: 170, acc: 125, brake: 280, coast: 26, grip: 290, turn: 3.2, mud: 0.45, water: 0.6 };
const DARRYL = { vmax: 150, grip: 250, acc: 110, brake: 240, lane: 70 };
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
const darrylHome = () => trackPt(S_START - 44, 14);
function standDarryl(x, y, flip) { Object.assign(darryl, { x, y, flip, state: 'wait', t: 0, gone: false, alpha: 1, hop: 0, goal: null }); }
// back to before the race: everyone at the start line, every rock back in place
function resetRace() {
  Object.assign(race, { phase: 'pre', t: 0, riding: false, result: null, pFin: null, dFin: null, judge: null, thief: null, goT: 0 });
  obstacles.forEach(o => { if (o.thing) o.thing.gone = false; o.broken = false; });
  parkCart(carts.you, S_START, -18);
  parkCart(carts.darryl, S_START, 18);
  const h = darrylHome();
  standDarryl(h.x, h.y, true);
  darryl.talked = false;
}
// once you've won: darryl and his cart wait at the door (unless he's run off),
// and your cart is back at the start so you can ride down to the door again
function resetFree() {
  Object.assign(race, { phase: 'free', t: 0, riding: false, result: null, pFin: null, dFin: null, judge: null, thief: null });
  obstacles.forEach(o => { if (o.thing) o.thing.gone = false; o.broken = false; });
  parkCart(carts.you, S_START, -18);
  parkCart(carts.darryl, S_STOP, 18);
  const p = trackPt(S_STOP + 30, 4);
  standDarryl(p.x, p.y, false);
  darryl.gone = DQ.fled;
  darryl.talked = false;
}
if (DQ.won) resetFree(); else resetRace();

// the moving bits of a cart that's yours to drive
function cartFits(x, y) { return onFloor(x, y, 9); }
function surfaceAt(x, y) {
  const p = obstacles.find(o => (o.kind === 'mud' || o.kind === 'water') && Math.abs(o.x - x) < 40 && Math.abs(o.y - y) < 40 && inPatch(o, x, y));
  return p ? p.kind : null;
}
function mashPress() {
  const c = carts.you;
  if (c.spin) { c.spin.meter = Math.min(1, c.spin.meter + 0.17); sfx.mash(); }
  else if (c.hole) { c.hole.meter = Math.min(1, c.hole.meter + 0.1); sfx.mash(); c.hole.wob = 0.12; }
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
    h.meter = Math.max(0, h.meter - 0.12 * dt);
    h.wob = Math.max(0, (h.wob || 0) - dt);
    c.v = 0;
    c.x += (h.o.x - c.x) * Math.min(1, dt * 10);
    c.y += (h.o.y - c.y) * Math.min(1, dt * 10);
    c.sink = Math.min(7, h.t * 40) - (h.wob > 0 ? 2 : 0);
    if (h.meter >= 1) {
      const out = trackPt(h.o.s + h.o.r + 18, clamp(h.o.d, -24, 24));
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
    c.spin.meter = Math.max(0, c.spin.meter - 0.3 * dt);
    c.spinA += dt * (9 + c.v / 14);
    c.v *= Math.exp(-0.85 * dt);
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
    const w = steer * Math.min(RACE.turn, RACE.grip / Math.max(sp, 40)) * Math.min(1, sp / 30) * (c.v < 0 ? -1 : 1);
    c.a += w * dt;
    if (steer) c.v -= c.v * 0.1 * dt;
    // sparks off the wheels in a hard turn at speed
    if (steer && sp > 120 && !reduceMotion && Math.random() < dt * 20) {
      particles.push({ x: c.x - Math.cos(c.a) * 8, y: c.y - Math.sin(c.a) * 8, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 20, g: 80, life: 0.3, t: 0, col: Math.random() < 0.5 ? '#ffd23f' : '#ff9a3c', size: 1 });
    }
  }
  moveCart(c, dt);
  hitObstacles(c, dt);
}
function moveCart(c, dt) {
  const nx = c.x + Math.cos(c.a) * c.v * dt, ny = c.y + Math.sin(c.a) * c.v * dt;
  if (cartFits(nx, ny)) { c.x = nx; c.y = ny; return; }
  // into the wall: bounce off it, losing speed, and turn along it
  const t = trackAt(c.x, c.y);
  if (!t) { c.v = 0; return; }
  const ox = (c.x - track.xs[t.i]) / (t.dist || 1), oy = (c.y - track.ys[t.i]) / (t.dist || 1);
  let vx = Math.cos(c.a) * c.v, vy = Math.sin(c.a) * c.v;
  const vn = vx * ox + vy * oy;
  if (vn > 0) { vx -= vn * ox * 1.6; vy -= vn * oy * 1.6; }
  const sp = Math.hypot(vx, vy) * 0.75;
  if (c.v >= 0) { c.a = Math.atan2(vy, vx); c.v = sp; } else { c.a = Math.atan2(-vy, -vx); c.v = -sp; }
  if (vn > 50) { addShake(1.5); sfx.hit(); burst(c.x + ox * 10, c.y + oy * 10, '140,140,140', 5); }
  const mx = c.x + Math.cos(c.a) * c.v * dt, my = c.y + Math.sin(c.a) * c.v * dt;
  if (cartFits(mx, my)) { c.x = mx; c.y = my; }
  else if (!cartFits(c.x, c.y)) {
    // somehow stuck in the wall: nudge it back towards the middle
    c.x -= ox * 2; c.y -= oy * 2;
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
  const pref = clamp(track.k[i] * 1300, -18, 18);
  const ahead = obstacles.filter(o => o.s > c.s - 6 && o.s < c.s + 200 && !o.broken);
  const slip = ahead.find(o => (o.n === MISTAKE.gem || o.n === MISTAKE.mud) && !c.slipped[o.n]);
  if (slip && slip.s < c.s + 150) return slip.d;
  let best = c.d, bestCost = Infinity;
  for (let lane = -28; lane <= 28; lane += 2) {
    let cost = Math.abs(lane - pref) + Math.abs(lane - c.d) * 0.4;
    ahead.forEach(o => {
      const gap = o.r + 11, off = Math.abs(lane - o.d);
      if (off < gap) cost += (1000 + (gap - off) * 20) * Math.max(0.2, 1 - (o.s - c.s) / 220);
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
    let vT = Math.min(DARRYL.vmax * c.vmul, DARRYL_V[i]);
    if (c.fin) vT = Math.min(vT, Math.sqrt(2 * 300 * Math.max(0, S_STOP - c.s)));
    const surf = surfaceAt(c.x, c.y);
    if (surf) vT = Math.min(vT, DARRYL.vmax * (surf === 'mud' ? RACE.mud : RACE.water));
    c.v += clamp(vT - c.v, -DARRYL.brake * dt, DARRYL.acc * dt);
  }
  if (!c.fin) c.dT = chooseLane(c);
  else c.dT = 18;
  c.d += clamp(c.dT - c.d, -DARRYL.lane * dt, DARRYL.lane * dt);
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
  const L = DQ.losses, lines = [{ d: 'Hey there buddy, looking for the next landmark?' }];
  if (L >= 1) lines.push({ d: 'Haven\'t I seen you before?' });
  if (L >= 3 && L <= 8) lines.push({ d: 'You really don\'t give up huh?' });
  if (L >= 9) lines.push({ d: `I think you should probably give up man. ${L + 1} tries is honestly embarrassing.` });
  return lines.concat(
    { you: 'Yeah, I am.' },
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
  dropStack(makeStack('bone-key'), (darryl.x + player.x) / 2, (darryl.y + player.y) / 2 + 6, raceRoom, 0.6, { x: darryl.x, y: darryl.y - 16 });
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
  race.judge = { t: 0, zapped: false, boned: false };
  darryl.pose = 'point';
  darryl.flip = player.x < darryl.x;
}
function tickJudge(dt) {
  const j = race.judge;
  j.t += dt;
  if (j.t > 0.55 && !j.zapped) {
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
  if (j.t > 1.5 && !j.boned) {
    j.boned = true;
    race.judge = null;
    darryl.pose = null;
    DQ.losses++;
    const took = pickLoot();
    player.skeleton = 'pile';
    player.deathSoft = true;
    player.deathLen = DEATH + (took ? 4.2 : 0.4);
    race.thief = took ? { ...took, phase: 'wait', t: 0, x: player.x + 8, y: player.y + 4 } : null;
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
    darryl.pose = null;
    floatText(`+1 ${ITEMS[th.st.id].name}`, darryl.x, darryl.y - 34, '#ffd23f');
    sfx.found();
    const p = trackPt(S_STOP + 30, 4);
    walkDarryl(p.x, p.y, 60);
  }
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
    Y.lane = -18;
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
      const p = trackPt(Y.s + 4, -34);
      player.x = p.x; player.y = p.y; player.face = 'up';
    }
  }
  if (Dc.rider === 'darryl') {
    if (race.phase === 'race') driveDarryl(Dc, dt);
    if (Dc.stopped && Dc.fin) {
      // out of the cart and over to the door
      Dc.rider = null;
      const p = trackPt(Dc.s + 6, 34);
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
    const side = player.x < darryl.x ? 20 : -20;
    walkDarryl(player.x + side, player.y, 70, () => {
      darryl.flip = player.x < darryl.x;
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
  if (Math.abs(player.x - 36) < 9 && player.y < 40 && (keys.has('KeyW') || keys.has('ArrowUp'))) playLeaveRoom();
}

function raceEnter(r) {
  if (r === raceRoom) {
    if (DQ.won) resetFree(); else resetRace();
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
function raceTarget(m) {
  if (room !== raceRoom) return null;
  const o = thingAt(m, q => q.trackOre);
  return o ? { type: 'trackore', thing: o, key: `to:${o.idx}`, cx: o.x, cy: o.y - 6, cls: 'ore', ore: o.ore } : null;
}
function raceMineOre(tgt, info) {
  const o = tgt.thing;
  o.gone = true;
  DQ.mined.push(o.idx);
  burst(o.x, o.y - 6, '140,140,140', 12);
  if (info.drops) gain(o.ore, 1, o.x, o.y - 14);
  else floatText('Nothing dropped', o.x, o.y - 14, '#bdbdbd');
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
    const hx = o.x + (o.flip ? -1 : 1) * (DQ.armless ? 2 : 3), hy = o.y - h + 2 - hop + 22;
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
  const img = CART_ROT[c.look][angIndex(a, CART_STEPS)];
  ctx.save();
  if (sink > 0) { ctx.beginPath(); ctx.rect(0, 0, canvas.width, toY(c.y + 2)); ctx.clip(); }
  else {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(toX(c.x - 10), toY(c.y + 3), 20 * S, 3 * S);
  }
  const rattle = c.v > 60 && !reduceMotion ? Math.round(Math.sin(t / 30) * 0.6) : 0;
  ctx.drawImage(img, toX(c.x - CART_D / 2), toY(c.y - CART_D / 2 - 3 + sink + rattle), CART_D * S, CART_D * S);
  // cracks in a cart that's hit a rock
  if (c.crack) {
    ctx.fillStyle = 'rgba(20,14,10,0.9)';
    const r = mulberry32(31 + c.crack);
    for (let k = 0; k < c.crack * 4; k++) ctx.fillRect(toX(c.x - 6 + r() * 12), toY(c.y - 7 + r() * 8 + sink), S, S);
  }
  if (c.rider === 'you') drawRider(c, toX, toY, sink + rattle);
  else if (c.rider === 'darryl') {
    const pose = c.spin ? 'scared' : 'idle';
    const im = skeletonFrame(pose, 0, { gear: Object.fromEntries(['head', 'chest'].filter(k => DQ.stash[k]).map(k => [k, ITEMS[DQ.stash[k].id].armor])), armless: DQ.armless });
    const flip = Math.cos(a) < -0.2;
    const x = toX(c.x - 13), y = toY(c.y - 3 - 22 + sink + rattle);
    if (flip) { ctx.translate(x + DARRYL_W * S, y); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, DARRYL_W, 23, 0, 0, DARRYL_W * S, 23 * S); ctx.setTransform(1, 0, 0, 1, 0, 0); }
    else ctx.drawImage(im, 0, 0, DARRYL_W, 23, x, y, DARRYL_W * S, 23 * S);
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
    const pulse = Math.floor(t / 120) % 2;
    ctx.fillStyle = 'rgba(12,12,16,0.9)';
    ctx.fillRect(bx - fs * 0.4, by - fs * 1.7, 28 * S + fs * 0.8, fs * 2.4);
    ctx.fillStyle = pulse ? '#ffd23f' : '#ffffff';
    ctx.fillText(Y.hole ? 'MASH W TO CLIMB OUT' : 'MASH W', toX(Y.x), by - fs * 0.85);
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(bx, by, 28 * S, 3 * S);
    ctx.fillStyle = '#9bf07a';
    ctx.fillRect(bx, by, Math.round(28 * S * k), 3 * S);
  }
  // his bony finger, crackling at you
  if (race.judge && race.judge.t > 0.15 && race.judge.t < 0.9) {
    const fx = darryl.x + (darryl.flip ? -11 : 11), fy = darryl.y - 16;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(200,255,170,0.85)';
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const u = i / n, jx = (Math.random() - 0.5) * 4, jy = (Math.random() - 0.5) * 4;
      ctx.fillRect(toX(fx + (player.x - fx) * u + jx), toY(fy + (player.y - 14 - fy) * u + jy), S * 2, S * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // the loot he's after, lying on your bones, then floating up into his hand
  const th = race.thief;
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
  const img = CART_ROT.you[angIndex(a, CART_STEPS)];
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

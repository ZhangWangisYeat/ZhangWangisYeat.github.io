// the playable layer on top of the overworld: items, tools and armor in seven
// tiers, durability, inventory, the 5x5 crafting table and its recipe book, the
// furnace, mining, health, combat, and the meadows' creatures. it leans on the
// globals from resume-game.js (tiles, things, player, cam, toast, sfx and so on)
// so it has to load after that file.
//
// the meadows run is the first "action" chapter of the bigger plan (discovery,
// action, then the multiverse gate, plus a secret ending). the other biomes get
// their own chapters later, so everything here is data driven where it can be.

'use strict';

// ranked weakest to strongest: wood = gold, stone = marble, iron, emerald,
// diamond. gold hits like wood and mines the fastest of anything, but it has
// the worst durability. harvest is how hard an ore a pickaxe can actually
// collect: below iron you can't get anything out of the precious ores, and
// wood can't even get iron out (gold can).
const TIERS = {
  wood:    { name: 'Wood',    dur: 24,  speed: 2,  sword: 1,   axe: 1.5, pick: 1,   harvest: 0 },
  gold:    { name: 'Gold',    dur: 10,  speed: 14, sword: 1,   axe: 1.5, pick: 1,   harvest: 1 },
  stone:   { name: 'Stone',   dur: 48,  speed: 4,  sword: 2,   axe: 2.5, pick: 1.5, harvest: 1 },
  marble:  { name: 'Marble',  dur: 48,  speed: 4,  sword: 2,   axe: 2.5, pick: 1.5, harvest: 1 },
  iron:    { name: 'Iron',    dur: 96,  speed: 6,  sword: 3,   axe: 3.5, pick: 2,   harvest: 2 },
  emerald: { name: 'Emerald', dur: 160, speed: 8,  sword: 3.5, axe: 4,   pick: 2.5, harvest: 3 },
  diamond: { name: 'Diamond', dur: 250, speed: 10, sword: 4,   axe: 4.5, pick: 3,   harvest: 4 }
};
const TIER_ORDER = ['wood', 'gold', 'stone', 'marble', 'iron', 'emerald', 'diamond'];

// armor blocks a flat percentage of every hit. hide keeps the bear at 1 heart
// a swipe, which is what it was tuned around. iron slows you down, gold shines.
const ARMORS = {
  wool:    { name: 'Wool',    block: 0.2 },
  gold:    { name: 'Gold',    block: 0.4, shine: true },
  hide:    { name: 'Hide',    block: 0.6 },
  iron:    { name: 'Iron',    block: 0.7, slow: 0.85 },
  emerald: { name: 'Emerald', block: 0.8 },
  diamond: { name: 'Diamond', block: 0.85 }
};

// dmg is in hearts, cd is seconds between swings, reach is in tiles, dur is how
// many hits or blocks a tool lasts.
const ITEMS = {
  wood:          { name: 'Wood', fuel: 2 },
  stick:         { name: 'Stick', fuel: 0.5 },
  stone:         { name: 'Stone' },
  marble:        { name: 'Marble' },
  hide:          { name: 'Hide' },
  iron:          { name: 'Iron Ingot' },
  gold:          { name: 'Gold Ingot' },
  'iron-ore':    { name: 'Raw Iron', cooksTo: 'iron' },
  'gold-ore':    { name: 'Raw Gold', cooksTo: 'gold' },
  ruby:          { name: 'Ruby' },
  emerald:       { name: 'Emerald' },
  diamond:       { name: 'Diamond' },
  wool:          { name: 'Wool' },
  'raw-chicken':    { name: 'Raw Chicken', food: 0.5, sat: 0.3, cooksTo: 'cooked-chicken' },
  'cooked-chicken': { name: 'Cooked Chicken', food: 1.5, sat: 1 },
  'raw-mutton':     { name: 'Raw Mutton', food: 0.75, sat: 0.3, cooksTo: 'cooked-mutton' },
  'cooked-mutton':  { name: 'Cooked Mutton', food: 2, sat: 1 },
  'raw-beef':       { name: 'Raw Beef', food: 1, sat: 0.3, cooksTo: 'cooked-beef' },
  'cooked-beef':    { name: 'Steak', food: 3, sat: 2 },
  bed:           { name: 'Bed', place: true },
  dagger:        { name: 'Dagger', tool: 'dagger', dmg: 0.5, cd: 0.45, reach: 1.5 }
};
TIER_ORDER.forEach(m => {
  const t = TIERS[m];
  ITEMS[`${m}-sword`] = { name: `${t.name} Sword`, tool: 'sword', mat: m, dmg: t.sword, cd: 0.45, reach: 2.2, dur: t.dur };
  ITEMS[`${m}-pickaxe`] = { name: `${t.name} Pickaxe`, tool: 'pickaxe', mat: m, dmg: t.pick, cd: 0.9, reach: 1.6, dur: t.dur, speed: t.speed, harvest: t.harvest };
  ITEMS[`${m}-axe`] = { name: `${t.name} Axe`, tool: 'axe', mat: m, dmg: t.axe, cd: 1.8, reach: 1.6, dur: t.dur, speed: t.speed };
});
Object.keys(ARMORS).forEach(m => {
  ITEMS[`${m}-armor`] = { name: `${ARMORS[m].name} Armor`, armor: m, mat: m };
});
// whatever you're holding that isn't a tool hits like a bare hand
const FIST = { name: 'Bare hands', dmg: 0.25, cd: 0.45, reach: 1.4 };
const STACK_MAX = 64;
const maxStack = id => (ITEMS[id].tool || ITEMS[id].armor || ITEMS[id].place ? 1 : STACK_MAX);

// mining: seconds with no bonus. a tool that can't harvest an ore takes three
// times as long and the block breaks with nothing to show for it.
const MINE_TIME = { wood: 2.4, stone: 5, ore: 8 };
const NO_HARVEST_SLOW = 3;
const REACH_TILES = 2.6;
const ORE_ITEM = { [T.GOLD]: 'gold-ore', [T.DIAMOND]: 'diamond', [T.RUBY]: 'ruby', [T.EMERALD]: 'emerald', [T.IRON]: 'iron-ore' };
const ORE_NEED = { 'iron-ore': 1, 'gold-ore': 2, ruby: 2, emerald: 2, diamond: 2 };
const STONE_TILES = new Set([T.STONE, T.PEAK, T.WALL, T.ICEROCK]);

// shapes inside the 5x5 table. a shape can sit anywhere in the grid and can be
// mirrored left to right, like minecraft. "." is an empty cell.
const RECIPES = [];
TIER_ORDER.forEach(m => {
  const key = { M: m, S: 'stick' };
  RECIPES.push(
    { out: `${m}-sword`, shape: ['M', 'M', 'S'], key },
    { out: `${m}-pickaxe`, shape: ['MMM', '.S.', '.S.'], key },
    { out: `${m}-axe`, shape: ['MM', 'MS', '.S'], key }
  );
});
RECIPES.push({ out: 'hide-armor', shape: ['HH.HH', 'HHHHH', '.HHH.', '.HHH.'], key: { H: 'hide' } });
['wool', 'gold', 'iron', 'emerald', 'diamond'].forEach(m => {
  RECIPES.push({ out: `${m}-armor`, shape: ['M.M', 'MMM', 'MMM'], key: { M: m } });
});
RECIPES.push({ out: 'bed', shape: ['WWW', 'PPP'], key: { W: 'wool', P: 'wood' } });
RECIPES.push({ out: 'stick', n: 4, shape: ['W'], key: { W: 'wood' } });
RECIPES.forEach(r => { r.n = r.n || 1; r.mats = [...new Set(Object.values(r.key))]; });

const COOK_RATE = 0.5;        // meat per second while the furnace has fuel

// dmg is in hearts before armor. distances are in tiles. box is the body
// hitbox in world px: touch it and you get hurt, lunge or not. windup is the
// crouch before a lunge (your window to sidestep) and cooldown is the wait
// before it can lunge again. the bear is still the quicker of the two.
const CREATURES = {
  hyena: {
    name: 'Marble Hyena', hp: 5, speed: 60, aggro: 7, leash: 16, range: 2.4,
    windup: 0.6, lunge: { speed: 220, time: 0.24 }, cooldown: 1.9, dmg: 1,
    knock: 140, h: 28, box: { w: 26, h: 14 }, rest: 'prowl', regen: 0.08, chip: '242,238,231',
    drops: [['marble', 5, 10]]
  },
  bear: {
    name: 'Grizzly', hp: 15, speed: 74, aggro: 5, leash: 22, range: 2.8,
    windup: 0.55, lunge: { speed: 270, time: 0.28 }, cooldown: 1.7, dmg: 2.5,
    knock: 18, h: 36, box: { w: 36, h: 20 }, rest: 'sleep',
    regen: 0.12, chip: '123,74,41',
    drops: [['hide', 15, 20]]
  },
  // passive livestock: wander, graze, and run when you hit them
  cow: {
    name: 'Cow', passive: true, hp: 3, speed: 20, flee: 64, h: 24, box: { w: 26, h: 12 },
    knock: 90, regen: 0.05, chip: '244,241,234', count: 3, drops: [['hide', 1, 2], ['raw-beef', 1, 3]]
  },
  sheep: {
    name: 'Sheep', passive: true, hp: 2.5, speed: 18, flee: 60, h: 22, box: { w: 22, h: 11 },
    knock: 90, regen: 0.05, chip: '243,241,236', count: 3, drops: [['wool', 1, 3], ['raw-mutton', 1, 2]]
  },
  chicken: {
    name: 'Chicken', passive: true, hp: 1, speed: 24, flee: 76, h: 15, box: { w: 12, h: 8 },
    knock: 110, regen: 0.05, chip: '251,250,246', count: 3, drops: [['raw-chicken', 1, 1]]
  }
};

function pxLine(G, x0, y0, x1, y1, c, wide = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    G.set(x, y, c);
    if (wide > 1) G.set(x + 1, y, c);
  }
}
// filled ellipse. colour is a string or a function of the normalised offset
// from the centre (and the pixel, for anything that wants noise)
function pxBlob(G, cx, cy, rx, ry, colour) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) G.set(x, y, typeof colour === 'function' ? colour(dx, dy, x, y) : colour);
    }
  }
}
// a white silhouette of a sprite, for the hit flash
function whiteOf(c) {
  const out = mk(c.width, c.height);
  const g = out.getContext('2d');
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  return out;
}

const MAT_PAL = {
  wood:    ['#e3b073', '#b07a42', '#74491f'],
  gold:    ['#fff4b0', '#f2c84b', '#a8800f'],
  stone:   ['#c9c9c9', '#969696', '#606060'],
  marble:  ['#ffffff', '#e2ddd4', '#a3acb9'],
  iron:    ['#f6f4f0', '#c9c4bd', '#827d77'],
  emerald: ['#b8f7cd', '#3fc46c', '#1a6e3a'],
  diamond: ['#e8fffc', '#5fe0d0', '#1d8b82'],
  hide:    ['#c08c5a', '#8a5a33', '#5e3a1e'],
  wool:    ['#ffffff', '#e6e3dc', '#b9b4aa']
};
const HANDLE = ['#9a6233', '#6b4020'];

function swordIcon(G, P) {
  pxLine(G, 6, 10, 14, 2, P[0], 2);
  pxLine(G, 7, 11, 14, 4, P[2]);
  pxLine(G, 4, 9, 7, 12, '#3b3f47');
  pxLine(G, 2, 14, 5, 11, HANDLE[0], 2);
}
function pickIcon(G, P) {
  pxLine(G, 3, 13, 11, 5, HANDLE[0], 2);
  pxLine(G, 4, 14, 11, 7, HANDLE[1]);
  [[3, 5], [5, 3], [8, 2], [11, 3], [13, 5], [14, 8]].reduce((a, b) => { pxLine(G, a[0], a[1], b[0], b[1], P[1], 2); return b; });
  G.set(6, 3, P[0]); G.set(8, 2, P[0]); G.set(3, 6, P[2]); G.set(14, 9, P[2]);
}
function axeIcon(G, P) {
  pxLine(G, 3, 13, 11, 5, HANDLE[0], 2);
  for (let y = 1; y <= 9; y++) {
    const span = Math.round(3.5 - Math.abs(y - 5) * 0.55);
    for (let x = 10; x <= 10 + span; x++) G.set(x, y, x === 10 + span ? P[2] : y < 4 ? P[0] : P[1]);
  }
}
function armorIcon(G, P) {
  for (let y = 3; y <= 13; y++) for (let x = 2; x <= 13; x++) {
    const sleeve = y <= 8 && (x <= 3 || x >= 12);
    const body = x >= 4 && x <= 11;
    if ((!sleeve && !body) || (y === 3 && x >= 6 && x <= 9)) continue;
    G.set(x, y, y === 10 ? P[2] : x < 8 ? P[0] : P[1]);
  }
  [5, 7].forEach(y => G.set(8, y, P[2]));
}
function gemIcon(G, pal) {
  [[8, 3], [5, 6], [11, 6]].forEach(([cx, top]) => {
    for (let y = top; y <= 13; y++) {
      const half = Math.min(2, (y - top) * 0.8);
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) G.set(x, y, x < cx ? pal.light : x > cx ? pal.mid : pal.hi);
    }
  });
}

function makeIcon(id) {
  const G = pixelGrid(16, 16);
  const it = ITEMS[id];
  if (it.tool && it.mat) ({ sword: swordIcon, pickaxe: pickIcon, axe: axeIcon })[it.tool](G, MAT_PAL[it.mat]);
  else if (it.armor) armorIcon(G, MAT_PAL[it.armor]);
  else switch (id) {
    case 'wood':
      for (let y = 6; y <= 11; y++) for (let x = 2; x <= 12; x++) G.set(x, y, y === 7 || y === 10 ? '#6e3a1e' : '#9a5230');
      pxBlob(G, 13, 8.5, 2, 3, (dx, dy) => (dx * dx + dy * dy < 0.35 ? '#a8703f' : '#dba56b'));
      break;
    case 'stick':
      pxLine(G, 3, 13, 12, 3, '#a0663a');
      pxLine(G, 4, 13, 13, 3, '#734522');
      break;
    case 'marble':
      pxBlob(G, 8, 9, 5.5, 4.5, (dx, dy) => (dy > 0.35 ? '#d6d0c5' : dy < -0.4 ? '#ffffff' : '#efebe4'));
      pxLine(G, 4, 8, 11, 11, '#9fb0c6');
      break;
    case 'stone':
      pxBlob(G, 8, 9, 5.5, 4.5, (dx, dy, x, y) => (hash2(x, y, 5) < 0.2 ? '#6a6a6a' : dy > 0.3 ? '#767676' : '#959595'));
      break;
    case 'hide':
      for (let y = 4; y <= 12; y++) for (let x = 3; x <= 12; x++) {
        const corner = (x < 5 || x > 10) && (y < 6 || y > 10);
        if (corner && !((x === 3 || x === 12) && (y === 4 || y === 12))) continue;
        G.set(x, y, x > 4 && x < 11 && y > 5 && y < 11 ? '#a8744a' : '#80522e');
      }
      break;
    case 'raw-mutton':
    case 'cooked-mutton':
    case 'raw-chicken':
    case 'cooked-chicken': {
      // drumsticks: mutton is red, chicken is pink, both brown up when cooked
      const [hi, lo] = {
        'raw-mutton': ['#ec9a95', '#c45c5c'], 'cooked-mutton': ['#c98552', '#7c4422'],
        'raw-chicken': ['#fbd0c6', '#eea596'], 'cooked-chicken': ['#f2c06a', '#c98a35']
      }[id];
      pxBlob(G, 9.5, 7, 4.5, 4, (dx, dy) => (dx + dy < -0.6 ? hi : lo));
      if (id.startsWith('raw')) { G.set(9, 6, '#ffffff'); G.set(10, 8, '#f5d0d3'); }
      pxLine(G, 6, 10, 3, 13, '#f2ede0', 2);
      G.set(2, 13, '#f2ede0'); G.set(3, 14, '#f2ede0');
      break;
    }
    case 'raw-beef':
    case 'cooked-beef': {
      const raw = id === 'raw-beef';
      pxBlob(G, 8, 9, 6, 4.2, (dx, dy) => (dy < -0.55 ? (raw ? '#f3d7c9' : '#b0703c') : raw ? '#c8414b' : '#7b4422'));
      if (raw) [[6, 9], [9, 10], [11, 8], [5, 11]].forEach(([x, y]) => G.set(x, y, '#f0b9b9'));
      else [5, 8, 11].forEach(x => pxLine(G, x, 8, x + 2, 11, '#4a2512'));
      break;
    }
    case 'wool':
      [[6, 9, 3.6], [10, 8, 3.8], [8, 11, 3.6], [11, 11, 3]].forEach(([cx, cy, r]) =>
        pxBlob(G, cx, cy, r, r, (dx, dy) => (dy < -0.4 ? '#ffffff' : dy > 0.5 ? '#d9d5cc' : '#f1efe9')));
      break;
    case 'bed':
      for (let y = 3; y <= 13; y++) for (let x = 3; x <= 12; x++) {
        G.set(x, y, x === 3 || x === 12 || y === 13 ? '#8a5a2e' : y <= 5 ? '#f4f1ea' : y === 6 ? '#e05a4a' : '#c0392b');
      }
      for (let x = 3; x <= 12; x++) G.set(x, 2, '#a86f3c');
      break;
    case 'dagger':
      pxLine(G, 8, 8, 13, 3, '#dfe3e8', 2);
      pxLine(G, 9, 9, 13, 5, '#98a2ad');
      pxLine(G, 5, 8, 8, 11, '#8a6a2e');
      pxLine(G, 3, 13, 6, 10, '#6b4422', 2);
      break;
    case 'iron':
    case 'gold': {
      // an ingot: a little bar with a lit top face
      const P = MAT_PAL[id];
      for (let y = 6; y <= 11; y++) for (let x = 2; x <= 13; x++) {
        if (y === 6 && (x < 4 || x > 11)) continue;
        G.set(x, y, y <= 7 ? P[0] : x >= 12 || y === 11 ? P[2] : P[1]);
      }
      break;
    }
    case 'iron-ore':
    case 'gold-ore':
      // a lump of stone with the metal showing through
      pxBlob(G, 8, 9, 5.5, 4.5, (dx, dy) => (dy > 0.3 ? '#767676' : '#959595'));
      [[6, 8], [9, 7], [10, 10], [5, 11], [8, 11]].forEach(([x, y]) => {
        G.set(x, y, id === 'gold-ore' ? '#f2c84b' : '#e0b896');
        G.set(x + 1, y, id === 'gold-ore' ? '#a8800f' : '#b08a6e');
      });
      break;
    default:
      gemIcon(G, CRYSTAL_PAL[id] || CRYSTAL_PAL.crystal);
  }
  return G.outline(() => '#141414').canvas();
}
// canvases for drawing items in your hand, data urls for the html slots
const ICON_CANVAS = Object.fromEntries(Object.keys(ITEMS).map(id => [id, makeIcon(id)]));
const ICON = Object.fromEntries(Object.entries(ICON_CANVAS).map(([id, c]) => [id, c.toDataURL()]));

// hearts for the hud: full, half, empty
function makeHeart(kind) {
  const rows = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'];
  const G = pixelGrid(11, 10);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== 'X') return;
    const filled = kind === 'full' || (kind === 'half' && x <= 4);
    G.set(x + 1, y + 1, filled ? ((x === 1 || x === 2) && y === 1 ? '#ffb3b3' : '#e8343a') : '#3b2a2d');
  }));
  return G.outline(() => '#1a0a0c').canvas().toDataURL();
}
const HEART = { full: makeHeart('full'), half: makeHeart('half'), empty: makeHeart('empty') };

// drumsticks for the hunger bar: full, half, empty
function makeDrum(kind) {
  const rows = ['....XXXX.', '...XXXXXX', '...XXXXXX', '...XXXXXX', '....XXXX.', '...BB....', '..BB.....', 'BBB......', '.B.......'];
  const G = pixelGrid(11, 11);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    const filled = kind === 'full' || (kind === 'half' && x <= 5);
    const col = ch === 'B' ? (filled ? '#f2ede0' : '#3b332e') : filled ? (y <= 1 ? '#e9a35e' : '#c8763c') : '#3b2f2a';
    G.set(x + 1, y + 1, col);
  }));
  return G.outline(() => '#1a0f08').canvas().toDataURL();
}
const DRUM = { full: makeDrum('full'), half: makeDrum('half'), empty: makeDrum('empty') };

function makeTable() {
  const G = pixelGrid(26, 21);
  for (let y = 12; y <= 19; y++) [3, 4, 21, 22].forEach(x => G.set(x, y, x === 3 || x === 21 ? '#7a4f26' : '#5a3818'));
  for (let y = 10; y <= 12; y++) for (let x = 2; x <= 23; x++) G.set(x, y, '#8a5a2e');
  for (let y = 3; y <= 9; y++) for (let x = 1; x <= 24; x++) {
    // a faint 5x5 grid burned into the top, so it reads as the crafting table
    const line = x % 5 === 0 || y === 5 || y === 7;
    G.set(x, y, line ? '#9b6a38' : y === 3 ? '#d9a066' : '#c48a4f');
  }
  pxLine(G, 17, 2, 21, 2, '#6b4422');
  [[21, 1], [22, 1], [21, 3], [22, 3], [22, 2]].forEach(([x, y]) => G.set(x, y, '#9a9a9a'));
  return G.outline(() => '#3b220f').canvas();
}

function makeFurnace(lit, frame) {
  const r = mulberry32(900 + frame);
  const G = pixelGrid(22, 26);
  for (let y = 4; y <= 24; y++) for (let x = 1; x <= 20; x++) {
    const course = Math.floor((y - 4) / 3);
    const mortar = (y - 4) % 3 === 2 || (x + (course % 2) * 3) % 6 === 0;
    G.set(x, y, mortar ? '#666666' : x < 6 ? '#9c9c9c' : '#878787');
  }
  for (let y = 2; y <= 4; y++) for (let x = 0; x <= 21; x++) G.set(x, y, y === 2 ? '#bdbdbd' : '#a5a5a5');
  for (let y = 0; y <= 2; y++) for (let x = 15; x <= 18; x++) G.set(x, y, '#7a7a7a');
  for (let y = 12; y <= 22; y++) for (let x = 6; x <= 15; x++) {
    if (y < 15 && Math.abs(x - 10.5) > (y - 11) * 1.8) continue;
    let col = '#1e1a17';
    if (lit && y >= 16) {
      const heat = (y - 15) / 7 - Math.abs(x - 10.5) / 6 + (r() - 0.5) * 0.5;
      col = heat > 0.55 ? '#fff1a8' : heat > 0.3 ? '#ffc23c' : heat > 0.08 ? '#ff7a1c' : '#7a2a10';
    }
    G.set(x, y, col);
  }
  if (lit) [6, 15].forEach(x => { for (let y = 15; y <= 22; y++) G.set(x, y, '#ffb347'); });
  return G.outline(() => '#2b2b2b').canvas();
}

function makeStump() {
  const G = pixelGrid(20, 13);
  for (let y = 4; y <= 11; y++) for (let x = 3; x <= 16; x++) G.set(x, y, x < 7 ? '#c4733f' : '#8b4726');
  [[2, 11], [17, 11], [1, 12], [18, 12]].forEach(([x, y]) => G.set(x, y, '#8b4726'));
  pxBlob(G, 9.5, 4, 7, 2.6, (dx, dy) => {
    const d = Math.sqrt(dx * dx + dy * dy);
    return d < 0.3 || (d > 0.55 && d < 0.7) ? '#a8703f' : '#e0ab70';
  });
  return G.outline(() => '#4a2412').canvas();
}

// the marble hyena: polished white stone with a glossy highlight along the
// back, two clean veins down the flank, a slate crest and a red eye. it's
// meant to read as a statue that got up and started hunting. frames 0-3 walk,
// 'crouch' is the windup and 'lunge' is the leap with its jaws open.
function makeHyena(frame, pose) {
  const G = pixelGrid(44, 29);
  const C = {
    hi: '#ffffff', base: '#f2eee7', mid: '#dcd6cc', shade: '#bdb6aa', far: '#a69f93',
    vein: '#9fb0c6', spot: '#b3ac9f', crest: '#4b515c', crestHi: '#6c7482', eye: '#ff3b30'
  };
  const ground = 27, leap = pose === 'lunge', crouch = pose === 'crouch' ? 2 : 0;
  const step = [[0, 1, 0, -1], [0, -1, 0, 1]];
  [[12, 0, true], [16, 1, true], [27, 1, false], [31, 0, false]].forEach(([lx, grp, far], n) => {
    let off = step[grp][frame % 4];
    if (leap) off = n < 2 ? -4 : 4;
    if (crouch) off = n < 2 ? 1 : -1;
    const top = 17 + crouch, foot = ground - (leap ? 1 : 0);
    for (let y = top; y <= foot; y++) {
      const x = lx + Math.round((off * (y - top)) / (ground - top));
      G.set(x, y, far ? C.far : C.mid);
      G.set(x + 1, y, far ? C.shade : C.base);
    }
    [0, 1, 2].forEach(k => G.set(lx + off + k, foot, far ? C.far : C.shade));
  });
  const tilt = leap ? 0.04 : 0.16;
  const spine = x => 14 + crouch - (x - 21) * tilt;
  const rx = leap ? 13.5 : 12, ry = 6;
  for (let y = 0; y < 29; y++) for (let x = 6; x <= 36; x++) {
    const dx = (x - 21) / rx, dy = (y - spine(x)) / ry;
    if (dx * dx + dy * dy > 1) continue;
    G.set(x, y, dy < -0.6 ? C.hi : dy < 0.1 ? C.base : dy < 0.55 ? C.mid : C.shade);
  }
  // two thin veins, broken every few pixels so they read as marble, not stripes
  for (let x = 11; x <= 31; x++) {
    [[0.5, 0], [2.6, 2.2]].forEach(([off, ph]) => {
      const y = Math.round(spine(x) + off + Math.sin(x * 0.42 + ph) * 1.1);
      const cur = G.get(x, y);
      if (cur && cur !== C.hi && x % 6 !== 0) G.set(x, y, C.vein);
    });
  }
  [[15, 2], [19, 3], [24, 2], [17, 4]].forEach(([x, k]) => {
    const y = Math.round(spine(x) + k);
    if (G.get(x, y)) { G.set(x, y, C.spot); G.set(x + 1, y, C.spot); }
  });
  for (let x = 13; x <= 30; x++) {
    const y = Math.round(spine(x) - ry);
    G.set(x, y, x % 3 === 0 ? C.crestHi : C.crest);
    if (x % 2 === 0) G.set(x, y - 1, C.crest);
  }
  const tailY = spine(7) - 1;
  [[8, 0], [7, 1], [6, 2], [5, 3], [5, 4]].forEach(([x, k]) => G.set(x, Math.round(tailY + k), C.mid));
  [[4, 5], [5, 5], [4, 6], [5, 6]].forEach(([x, k]) => G.set(x, Math.round(tailY + k), C.crest));

  const hx = leap ? 38 : 34, hy = (leap ? 12 : 9) + crouch;
  pxBlob(G, hx, hy, 4.8, 4, (dx, dy) => (dy < -0.5 ? C.hi : dy < 0.4 ? C.base : C.mid));
  for (let x = hx + 3; x <= hx + 6; x++) for (let y = hy; y <= hy + 2; y++) G.set(x, y, y === hy + 2 ? C.mid : C.base);
  G.set(hx + 7, hy, '#30333a');
  [[hx - 3, hy - 4], [hx - 3, hy - 5], [hx - 2, hy - 5], [hx, hy - 4], [hx, hy - 5], [hx + 1, hy - 5]].forEach(([x, y]) => G.set(x, y, C.crest));
  G.set(hx - 2, hy - 4, C.crestHi);
  G.set(hx + 1, hy - 1, C.eye);
  G.set(hx + 2, hy - 1, C.eye);
  G.set(hx + 1, hy - 2, '#ffd0cc');
  if (leap) {
    for (let x = hx + 3; x <= hx + 7; x++) {
      G.set(x, hy + 3, '#3a1b1b');
      G.set(x, hy + 2, x % 2 ? '#ffffff' : C.mid);
      G.set(x, hy + 4, x % 2 ? C.mid : '#ffffff');
    }
  }
  return G.outline(() => '#3a3d45').canvas();
}

// the grizzly: shoulder hump, pale muzzle, big pale claws. 'lunge' rears a
// front paw, 'scoop' is a reared-up pose (unused since the wave attack was
// cut, kept for later), 'sleep' is lying down with its eyes shut.
function makeBear(frame, pose) {
  const G = pixelGrid(54, 38);
  const C = { base: '#7b4a29', shade: '#5a3419', light: '#9b643a', muzzle: '#c89b6b', claw: '#ece4d4' };
  const ground = 36, sleep = pose === 'sleep', paw = pose === 'lunge' || pose === 'scoop';
  if (!sleep) {
    const step = [[0, 1, 0, -1], [0, -1, 0, 1]];
    [[10, 0], [17, 1], [32, 1], [38, 0]].forEach(([lx, grp], n) => {
      const lift = paw && n === 3 ? 6 : 0;
      const off = paw ? (n < 2 ? -2 : 1) : step[grp][frame % 4];
      for (let y = 24; y <= ground - lift; y++) {
        for (let k = 0; k < 4; k++) G.set(lx + k + Math.round((off * (y - 24)) / 12), y, n < 2 ? C.shade : k < 2 ? C.base : C.shade);
      }
      [0, 2].forEach(k => G.set(lx + k + off, ground - lift + 1, C.claw));
    });
  }
  const bodyY = sleep ? 27 : 20;
  pxBlob(G, 23, bodyY, 16, sleep ? 8 : 9.5, (dx, dy) => (dy < -0.45 ? C.light : dy > 0.4 ? C.shade : C.base));
  if (!sleep) pxBlob(G, 30, 14, 6.5, 5, (dx, dy) => (dy < -0.2 ? C.light : C.base));
  const hx = sleep ? 42 : pose === 'lunge' ? 44 : 40, hy = sleep ? 29 : pose === 'lunge' ? 19 : 17;
  pxBlob(G, hx, hy, 6.5, 6, (dx, dy) => (dy < -0.4 ? C.light : C.base));
  [[hx - 4, hy - 6], [hx + 2, hy - 6]].forEach(([x, y]) => pxBlob(G, x, y, 2, 2, C.shade));
  pxBlob(G, hx + 5, hy + 2, 3.2, 2.5, C.muzzle);
  G.set(hx + 8, hy + 1, '#1a1a1a'); G.set(hx + 8, hy + 2, '#1a1a1a');
  if (sleep) { G.set(hx + 1, hy - 1, '#2a170b'); G.set(hx + 2, hy - 1, '#2a170b'); }
  else G.set(hx + 2, hy - 2, '#140a05');
  if (pose === 'lunge') for (let x = hx + 4; x <= hx + 8; x++) { G.set(x, hy + 4, '#3a1010'); G.set(x, hy + 5, x % 2 ? '#ffffff' : '#3a1010'); }
  if (pose === 'scoop') [[46, 22], [48, 20], [47, 18], [50, 21]].forEach(([x, y]) => G.set(x, y, '#7ec3ff'));
  return G.outline(() => '#24140a').canvas();
}

function makeChest() {
  const G = pixelGrid(22, 18);
  for (let y = 7; y <= 16; y++) for (let x = 1; x <= 20; x++) G.set(x, y, y === 11 || y === 14 ? '#7a4a24' : x < 5 ? '#b07a42' : '#9a6233');
  for (let y = 2; y <= 6; y++) for (let x = 1; x <= 20; x++) G.set(x, y, y === 2 ? '#d29a5c' : y === 6 ? '#6e4020' : '#b98049');
  [3, 18].forEach(x => { for (let y = 2; y <= 16; y++) G.set(x, y, y === 2 ? '#9a9a9a' : '#6f6f6f'); });
  for (let y = 5; y <= 8; y++) for (let x = 10; x <= 11; x++) G.set(x, y, y === 5 ? '#ffe28a' : '#d9b23a');
  return G.outline(() => '#2b1a0c').canvas();
}

// a placed bed, seen from above: headboard, pillow, red blanket
function makeBed() {
  const G = pixelGrid(18, 28);
  for (let y = 2; y <= 25; y++) for (let x = 1; x <= 16; x++) {
    let col = x === 1 || x === 16 || y === 25 ? '#8a5a2e' : y <= 5 ? '#a86f3c' : y <= 9 ? (y === 6 || x === 2 ? '#ffffff' : '#ece8df') : y === 10 ? '#e05a4a' : x >= 13 ? '#9c2a20' : '#c0392b';
    if (y === 2 && x > 1 && x < 16) col = '#c48a4f';
    if (y > 10 && y < 25 && (y - 10) % 5 === 0 && x > 2 && x < 15) col = '#a83226';
    G.set(x, y, col);
  }
  [[1, 26], [2, 26], [15, 26], [16, 26]].forEach(([x, y]) => G.set(x, y, '#5a3818'));
  return G.outline(() => '#2b1a0c').canvas();
}

// livestock, all facing right like the other creatures. frames 0-3 walk.
const STEP = [[0, 1, 0, -1], [0, -1, 0, 1]];
function makeCow(frame) {
  const G = pixelGrid(36, 25);
  const C = { white: '#f4f1ea', shade: '#d6d0c4', black: '#2c2a2a', pink: '#f0a3a3', horn: '#ece2c4', hoof: '#3a2f2a' };
  const ground = 23;
  [[8, 0, true], [12, 1, true], [22, 1, false], [26, 0, false]].forEach(([lx, grp, far]) => {
    const off = STEP[grp][frame % 4];
    for (let y = 15; y < ground; y++) {
      const x = lx + Math.round((off * (y - 15)) / 8);
      G.set(x, y, far ? C.shade : C.white);
      G.set(x + 1, y, far ? C.shade : C.white);
    }
    G.set(lx + off, ground, C.hoof); G.set(lx + off + 1, ground, C.hoof);
  });
  for (let y = 5; y <= 17; y++) for (let x = 4; x <= 29; x++) {
    const dx = (x - 16.5) / 13, dy = (y - 11) / 6.5;
    if (dx ** 4 + dy ** 4 > 1) continue;
    let col = y >= 15 ? C.shade : C.white;
    if ((x - 11) ** 2 / 18 + (y - 9) ** 2 / 8 < 1 || (x - 22) ** 2 / 12 + (y - 13) ** 2 / 7 < 1) col = C.black;
    G.set(x, y, col);
  }
  for (let x = 11; x <= 13; x++) { G.set(x, 17, C.pink); G.set(x, 18, C.pink); }
  for (let y = 5; y <= 12; y++) for (let x = 28; x <= 33; x++) G.set(x, y, x <= 30 && y <= 8 ? C.black : C.white);
  for (let y = 10; y <= 13; y++) for (let x = 30; x <= 34; x++) G.set(x, y, C.pink);
  G.set(33, 11, '#7a3b3b'); G.set(31, 7, '#111111');
  [[29, 3], [29, 4], [32, 3], [32, 4]].forEach(([x, y]) => G.set(x, y, C.horn));
  G.set(27, 6, C.black); G.set(34, 6, C.black);
  for (let y = 7; y <= 13; y++) G.set(3, y, C.shade);
  [[2, 14], [3, 14], [2, 15], [3, 15]].forEach(([x, y]) => G.set(x, y, C.black));
  return G.outline(() => '#262322').canvas();
}
function makeSheep(frame) {
  const G = pixelGrid(31, 23);
  const C = { wool: '#f3f1ec', shade: '#d9d5cc', hi: '#ffffff', face: '#3b3431' };
  const ground = 21;
  [[8, 0], [11, 1], [18, 1], [21, 0]].forEach(([lx, grp]) => {
    const off = STEP[grp][frame % 4];
    for (let y = 14; y < ground; y++) G.set(lx + Math.round((off * (y - 14)) / 7), y, C.face);
    G.set(lx + off, ground, C.face);
  });
  [[9, 10, 4.5], [14, 8, 5], [19, 9, 4.8], [23, 11, 4], [15, 12, 5.5], [10, 13, 4]].forEach(([cx, cy, r]) =>
    pxBlob(G, cx, cy, r, r, (dx, dy, x, y) => (y > 15 ? C.shade : dy < -0.5 ? C.hi : hash2(x >> 1, y >> 1, 4) < 0.22 ? C.shade : C.wool)));
  pxBlob(G, 26, 10, 3, 3.6, C.face);
  [[24, 6], [23, 7]].forEach(([x, y]) => G.set(x, y, C.face));
  for (let x = 24; x <= 27; x++) G.set(x, 6, C.wool);
  G.set(27, 9, '#e9dfcf');
  return G.outline(() => '#2a2523').canvas();
}
function makeChicken(frame) {
  const G = pixelGrid(17, 16);
  const C = { white: '#fbfaf6', shade: '#dcd8cf', red: '#d8342b', beak: '#f0a52a', leg: '#e89a2a' };
  const ground = 14, bob = frame % 2;
  [[6, 1], [8, 3]].forEach(([x, liftFrame]) => {
    const lift = frame % 4 === liftFrame ? 1 : 0;
    for (let y = 11; y <= ground - lift; y++) G.set(x, y, C.leg);
  });
  pxBlob(G, 7, 8, 4.6, 3.4, (dx, dy) => (dy > 0.4 ? C.shade : C.white));
  for (let x = 5; x <= 8; x++) G.set(x, 8, '#cfcabd');
  [[2, 5], [2, 6], [3, 5], [3, 6], [3, 7], [1, 4]].forEach(([x, y]) => G.set(x, y, C.white));
  pxBlob(G, 11, 4 + bob, 2.3, 2.3, C.white);
  [[11, 1 + bob], [12, 1 + bob], [10, 2 + bob]].forEach(([x, y]) => G.set(x, y, C.red));
  G.set(14, 4 + bob, C.beak); G.set(14, 5 + bob, C.beak);
  G.set(12, 6 + bob, C.red);
  G.set(12, 3 + bob, '#1a1a1a');
  return G.outline(() => '#2a2a2a').canvas();
}
const PASSIVE_MAKERS = { cow: makeCow, sheep: makeSheep, chicken: makeChicken };

function creatureFrames(kind) {
  if (PASSIVE_MAKERS[kind]) {
    const walk = [0, 1, 2, 3].map(f => PASSIVE_MAKERS[kind](f));
    const set = { walk, crouch: walk[0], lunge: walk[0], scoop: walk[0], sleep: walk[0] };
    set.white = new Map(walk.map(c => [c, whiteOf(c)]));
    return set;
  }
  const make = kind === 'hyena' ? makeHyena : makeBear;
  const walk = [0, 1, 2, 3].map(f => make(f, 'walk'));
  const set = {
    walk,
    crouch: kind === 'hyena' ? make(0, 'crouch') : make(0, 'lunge'),
    lunge: make(0, 'lunge'),
    scoop: kind === 'bear' ? make(0, 'scoop') : walk[0],
    sleep: kind === 'bear' ? make(0, 'sleep') : walk[0]
  };
  set.white = new Map([...walk, set.crouch, set.lunge, set.scoop, set.sleep].map(c => [c, whiteOf(c)]));
  return set;
}

const SAVE_KEY = 'dm-save';
const inv = { slots: new Array(24).fill(null), armor: null, sel: 0 };   // slots 0-5 are the hotbar
const craftGrid = new Array(25).fill(null);
const furnaceState = { input: null, fuel: null, output: null, burn: 0, prog: 0 };
const quest = { greatTree: false, chopped: [], mined: [], killed: {}, seen: {}, crafted: {}, recipes: [], beds: [], spawnBed: null, day: 1 };
// hunger works like minecraft's. saturation is a hidden buffer on top of a full
// hunger bar: healing spends it, and it trickles away very slowly on its own (a
// bit faster while you walk). once it's empty, walking starts eating into hunger,
// and you only heal while hunger is completely full.
const HUNGER_MAX = 5;
const START_SAT = 2.5;
const SAT_DECAY_IDLE = 0.004;
const SAT_DECAY_MOVE = 0.012;
const HUNGER_DECAY = 0.02;       // per second of walking, only once saturation is gone
const REGEN_EVERY = 3;           // seconds per half heart while hunger is full
const STARVE_EVERY = 4;          // seconds per half heart lost at zero hunger
const STARVING_SLOW = 0.35;      // move speed at half a drumstick or less
const vitals = { hp: 5, max: 5, hunger: HUNGER_MAX, sat: START_SAT, invuln: 0, sinceHit: 99, regenT: 0, starveT: 0, kx: 0, ky: 0, atkCD: 0, eatCD: 0, slowT: 0 };
const creatures = [];
const stations = [];
const floats = [];
const chestSlots = new Array(18).fill(null);
// livestock spawns on its own every so often, out of sight, up to a cap
const PASSIVE_CAP = 12;
const SPAWN_WEIGHTS = [['cow', 0.35], ['sheep', 0.35], ['chicken', 0.3]];
let spawnT = 30;
// day and night: 4 minutes of light, 2 of dark. clock is seconds into the day.
const DAY_LEN = 360;
let clock = 30;
let ui = null;               // null, 'inv', 'craft' or 'furnace'
let bookOpen = false;
let heldStack = null;        // what's stuck to the cursor in the inventory
let mining = null;
const mouse = { x: 0, y: 0, down: false, inCanvas: false, touch: false };
let saveDirty = false, lastSave = 0, resetting = false;

// a fresh stack. tools and armor are one per slot and tools carry their
// remaining durability with them wherever they go.
function makeStack(id, n = 1) {
  const it = ITEMS[id];
  return it.dur ? { id, n: 1, dur: it.dur } : { id, n: it.armor ? 1 : n };
}
inv.slots[0] = makeStack('dagger');

function validStack(s) {
  if (!s || !ITEMS[s.id] || !(s.n > 0)) return null;
  const out = { id: s.id, n: Math.min(s.n, maxStack(s.id)) };
  if (ITEMS[s.id].dur) out.dur = clamp(+s.dur || ITEMS[s.id].dur, 1, ITEMS[s.id].dur);
  return out;
}
function loadSave() {
  const data = store.read(SAVE_KEY, null);
  if (!data || (data.v !== 1 && data.v !== 2)) return;
  if (Array.isArray(data.inv?.slots)) data.inv.slots.slice(0, 24).forEach((s, i) => { inv.slots[i] = validStack(s); });
  inv.armor = validStack(data.inv?.armor);
  inv.sel = clamp(data.inv?.sel | 0, 0, 5);
  if (data.quest) Object.assign(quest, data.quest);
  quest.recipes = Array.isArray(quest.recipes) ? quest.recipes.filter(id => ITEMS[id]) : [];
  if (typeof data.hp === 'number') vitals.hp = clamp(data.hp, 0.5, vitals.max);
  if (typeof data.hunger === 'number') vitals.hunger = clamp(data.hunger, 0, HUNGER_MAX);
  if (typeof data.sat === 'number') vitals.sat = clamp(data.sat, 0, vitals.hunger);
  if (Array.isArray(data.chest)) data.chest.slice(0, 18).forEach((st, i) => { chestSlots[i] = validStack(st); });
  if (typeof data.clock === 'number') clock = ((data.clock % DAY_LEN) + DAY_LEN) % DAY_LEN;
  quest.beds = Array.isArray(quest.beds) ? quest.beds : [];
  if (data.furnace) {
    ['input', 'fuel', 'output'].forEach(k => { furnaceState[k] = validStack(data.furnace[k]); });
    furnaceState.burn = +data.furnace.burn || 0;
  }
}
function saveNow() {
  if (resetting) return;
  store.write(SAVE_KEY, { v: 2, inv, quest, hp: vitals.hp, hunger: vitals.hunger, sat: vitals.sat, furnace: furnaceState, chest: chestSlots, clock });
  saveDirty = false;
  lastSave = performance.now();
}
const markDirty = () => { saveDirty = true; };
function playResetting() { resetting = true; }

function addItem(id, n) {
  const max = maxStack(id);
  if (max > 1) {
    for (const s of inv.slots) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < max) { const k = Math.min(max - s.n, n); s.n += k; n -= k; }
    }
  }
  for (let i = 0; i < inv.slots.length && n > 0; i++) {
    if (!inv.slots[i]) {
      const st = makeStack(id, Math.min(max, n));
      inv.slots[i] = st;
      n -= st.n;
    }
  }
  if (n > 0) toast('Bag full', `${n} ${ITEMS[id].name} lost`, 'Make some room in your inventory (E)');
  afterInventoryChange();
  return n;
}
// put an existing stack back in the bag, keeping its durability
function addStack(stack) {
  if (!stack) return;
  if (maxStack(stack.id) > 1) { addItem(stack.id, stack.n); return; }
  const free = inv.slots.findIndex(s => !s);
  if (free >= 0) { inv.slots[free] = stack; afterInventoryChange(); }
  else toast('Bag full', `${ITEMS[stack.id].name} lost`, 'Make some room in your inventory (E)');
}
function afterInventoryChange() {
  checkRecipeUnlocks();
  markDirty();
  renderHUD();
  if (ui) renderUI();
}
function gain(id, n, x, y) {
  if (n <= 0) return;
  addItem(id, n);
  floatText(`+${n} ${ITEMS[id].name}`, x, y, '#9bf07a');
  sfx.pickup();
}
const heldItem = () => inv.slots[inv.sel];
function heldTool() {
  const s = heldItem();
  return s && ITEMS[s.id].tool ? ITEMS[s.id] : FIST;
}
// knock durability off whatever's in your hand, and break it at zero
function wearHeld(cost) {
  const s = heldItem();
  if (!s || !ITEMS[s.id].dur) return;
  s.dur -= cost;
  if (s.dur <= 0) {
    inv.slots[inv.sel] = null;
    toast('Broken', ITEMS[s.id].name, 'Craft another at Base Camp');
    sfx.snap();
    burst(player.x, player.y - 14, '200,200,200', 10);
  }
  markDirty();
  renderHUD();
}
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// a recipe shows up in the book once you've held every kind of material it
// needs (any amount) or crafted it, and then it stays for good
function checkRecipeUnlocks() {
  const have = new Set(inv.slots.filter(Boolean).map(s => s.id));
  const fresh = RECIPES.filter(r => !quest.recipes.includes(r.out) && r.mats.every(m => have.has(m)));
  if (!fresh.length) return;
  fresh.forEach(r => quest.recipes.push(r.out));
  const first = ITEMS[fresh[0].out].name;
  toast('Recipe book', fresh.length > 1 ? `${fresh.length} new recipes` : first,
    fresh.length > 1 ? `Including the ${first}. Open the book at the crafting table.` : 'Open the book at the crafting table');
  markDirty();
}

function floatText(text, x, y, col = '#ffffff') {
  floats.push({ text, x, y, col, t: 0 });
}

const STUMP = makeStump();
const greatTree = POIS.find(p => p.id === 'ucla').thing;

function nearestOpen(tx, ty) {
  let best = [tx, ty], bestD = Infinity;
  for (let y = Math.max(0, ty - 8); y < Math.min(H, ty + 8); y++) for (let x = Math.max(0, tx - 8); x < Math.min(W, tx + 8); x++) {
    if (!reach[idx(x, y)] || SOLID[tiles[idx(x, y)]] || tiles[idx(x, y)] === T.WATER) continue;
    const d = (x - tx) ** 2 + (y - ty) ** 2;
    if (d < bestD) { bestD = d; best = [x, y]; }
  }
  return best;
}

function addStation(kind, tx, ty) {
  const frames = kind === 'craft' ? [makeTable()] : kind === 'chest' ? [makeChest()] : [makeFurnace(false, 0)];
  const st = { kind, x: tx * TILE + 8, y: ty * TILE + 14, frames, station: kind };
  if (kind === 'furnace') {
    st.unlit = frames;
    st.lit = [makeFurnace(true, 0), makeFurnace(true, 1), makeFurnace(true, 2)];
    st.fps = 8;
    st.glow = { x: st.x, y: st.y - 8, rgb: '255,140,50', rad: 2.6, flicker: true, always: true, off: true };
    glows.push(st.glow);
  }
  stations.push(st);
  things.push(st);
}

// the creature is the landmark itself: it takes over the stand-in thing the engine
// made for its poi, so the label and the "you found it" check follow it
function spawnCreature(kind, poi, opts = {}) {
  const def = CREATURES[kind];
  const [x, y] = nearestOpen(poi.at[0], poi.at[1]);
  const c = {
    kind, def, poi, frames: creatureFrames(kind), creature: true, labelH: def.h + 8,
    hx: x * TILE + 8, hy: y * TILE + 12, x: x * TILE + 8, y: y * TILE + 12,
    hp: def.hp, state: def.rest, t: 0, cd: 0, sinceHit: 99, anim: 0, flip: false, hurtT: 0, kx: 0, ky: 0,
    lx: 0, ly: 0, moving: false, wander: null, wanderT: 0,
    dormant: !!opts.dormant, gone: !!opts.dormant, draw: drawCreature
  };
  poi.thing = c;
  creatures.push(c);
  things.push(c);
  return c;
}

loadSave();

// replay the saved world edits: mined blocks and chopped trees
if (quest.mined.length) {
  quest.mined.forEach(i => {
    if (i >= 0 && i < W * H && SOLID[tiles[i]]) { tiles[i] = baseOf(i); reach[i] = 1; }
  });
  paintWorld();
}
for (let i = things.length - 1; i >= 0; i--) {
  if (things[i].tree && quest.chopped.includes(things[i].id)) things.splice(i, 1);
}
function stumpGreatTree() {
  greatTree.frames = [STUMP];
  greatTree.chopped = true;
  // its landmark glow was floating where the canopy used to be
  glows.forEach(g => { if (g.x === greatTree.x && g.y < greatTree.y - 10) g.off = true; });
}
if (quest.greatTree) stumpGreatTree();

// the camp workshop: crafting table, furnace and chest, two tiles apart in a
// tidy row just north-east of the fire
addStation('craft', CAMP.x + 2, CAMP.y - 3);
addStation('furnace', CAMP.x + 4, CAMP.y - 3);
addStation('chest', CAMP.x + 6, CAMP.y - 3);

const BED = makeBed();
function bedThing(b) {
  const o = { bed: true, id: b.id, x: b.x * TILE + 8, y: b.y * TILE + 14, frames: [BED] };
  things.push(o);
  return o;
}
quest.beds.forEach(bedThing);

// livestock: anywhere open in the meadows, away from the landmarks and camp
function grassSpot(r, minFromPlayer = 0) {
  for (let tries = 0; tries < 400; tries++) {
    const x = 2 + ((r() * (W - 4)) | 0), y = 2 + ((r() * (H - 4)) | 0);
    const i = idx(x, y);
    if (QUADS[quad[i]] !== 'meadows' || tiles[i] !== T.GRASS || !reach[i]) continue;
    if (POIS.some(p => Math.hypot(p.at[0] - x, p.at[1] - y) < 5)) continue;
    if (Math.hypot(player.x / TILE - x, player.y / TILE - y) < minFromPlayer) continue;
    return [x, y];
  }
  return null;
}
function spawnPassive(kind, r, minFromPlayer) {
  const spot = grassSpot(r, minFromPlayer);
  if (!spot) return null;
  const def = CREATURES[kind];
  const c = {
    kind, def, frames: creatureFrames(kind), creature: true,
    hx: spot[0] * TILE + 8, hy: spot[1] * TILE + 12, x: spot[0] * TILE + 8, y: spot[1] * TILE + 12,
    hp: def.hp, state: 'graze', t: 0, pause: 1 + r() * 4, sinceHit: 99, anim: 0, flip: r() < 0.5,
    hurtT: 0, kx: 0, ky: 0, moving: false, wander: null, draw: drawCreature
  };
  creatures.push(c);
  things.push(c);
  return c;
}
{
  const r = mulberry32(SEED + 555);
  ['cow', 'sheep', 'chicken'].forEach(kind => { for (let n = 0; n < CREATURES[kind].count; n++) spawnPassive(kind, r, 0); });
}

// the hyena (glastonbury hs) prowls between the great tree and the lakes, but
// only shows up once the great tree has come down
const hyena = spawnCreature('hyena', POIS.find(p => p.id === 'ghs'), { dormant: !quest.greatTree || quest.killed.hyena });
if (quest.killed.hyena) hyena.dead = true;
// the grizzly (acm teachla) sleeps in front of its den
const bearPoi = POIS.find(p => p.id === 'teachla-lead');
things.push({ decor: true, x: (bearPoi.at[0] - 1) * TILE, y: (bearPoi.at[1] - 2) * TILE + 12, frames: SPRITE.den });
const bear = spawnCreature('bear', bearPoi);
if (quest.killed.bear) { bear.dead = true; bear.gone = true; }
checkRecipeUnlocks();

const playerBox = () => ({ x0: player.x - 6, x1: player.x + 6, y0: player.y - 20, y1: player.y });
function creatureBox(c) {
  const b = c.def.box;
  return { x0: c.x - b.w / 2, x1: c.x + b.w / 2, y0: c.y - b.h, y1: c.y };
}
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

const aimOrigin = () => ({ x: player.x, y: player.y - 10 });
function mouseWorld() {
  return { x: cam.x + (mouse.x * dpr) / S, y: cam.y + (mouse.y * dpr) / S };
}
function aimAngle() {
  const o = aimOrigin(), m = mouseWorld();
  return Math.atan2(m.y - o.y, m.x - o.x);
}
function faceAngle(a) {
  const cx = Math.cos(a), cy = Math.sin(a);
  if (Math.abs(cx) > Math.abs(cy) * 0.9) { player.face = 'side'; player.flip = cx < 0; }
  else player.face = cy < 0 ? 'up' : 'down';
}
const creatureCenter = c => ({ x: c.x, y: c.y - c.def.box.h / 2 });

function inArc(c, a, tool) {
  if (c.dead || c.gone) return false;
  const o = aimOrigin(), b = creatureBox(c);
  // distance to the nearest point of its hitbox, not its centre, so big
  // animals are as easy to reach as their size suggests
  const nx = clamp(o.x, b.x0, b.x1), ny = clamp(o.y, b.y0, b.y1);
  const d = Math.hypot(nx - o.x, ny - o.y);
  if (d > tool.reach * TILE) return false;
  if (d < 6) return true;
  const cc = creatureCenter(c);
  let diff = Math.atan2(cc.y - o.y, cc.x - o.x) - a;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) < 1.15;
}

function attack() {
  const tool = heldTool();
  if (vitals.atkCD > 0) return;
  vitals.atkCD = tool.cd;
  const a = aimAngle();
  faceAngle(a);
  player.swing = 0;
  sfx.swing();
  let hit = false;
  creatures.forEach(c => { if (inArc(c, a, tool)) { hurtCreature(c, tool.dmg, a); hit = true; } });
  if (hit) wearHeld(1);
}

function hurtCreature(c, dmg, a) {
  c.hp = Math.max(0, c.hp - dmg);
  c.hurtT = 0.16;
  c.sinceHit = 0;
  // once it's committed to a windup or lunge, hits land but don't push it
  // around, otherwise you could juggle it out of range forever
  if (c.state !== 'windup' && c.state !== 'lunge') {
    c.kx = Math.cos(a) * c.def.knock;
    c.ky = Math.sin(a) * c.def.knock;
  }
  const cc = creatureCenter(c);
  floatText(`-${dmg}`, cc.x, cc.y - 12, '#ffd1d1');
  burst(cc.x, cc.y, c.def.chip, 6);
  sfx.hit();
  // livestock just bolts; hunters turn on you
  if (c.def.passive) { c.state = 'flee'; c.t = 0; c.path = null; c.pathT = 0; }
  else if (!['windup', 'lunge', 'recover'].includes(c.state)) aggro(c);
  if (c.hp <= 0) killCreature(c);
}

function aggro(c) {
  if (c.state === 'chase' || c.dead) return;
  if (c.state === 'sleep') sfx.roar();
  c.state = 'chase';
  if (!quest.seen[c.kind]) {
    quest.seen[c.kind] = true;
    toast(c.kind === 'hyena' ? 'Ambush' : 'You woke it', c.def.name,
      c.kind === 'hyena' ? 'It crouches before it leaps. Sidestep, then strike.' : '2.5 hearts a swipe. Dodge the lunge, then make it pay.');
    markDirty();
  }
}

function killCreature(c) {
  c.dead = true;
  c.gone = true;
  if (c.def.passive) {
    const cc = creatureCenter(c);
    burst(cc.x, cc.y, c.def.chip, 14);
    c.def.drops.forEach(([id, a, b], line) => gain(id, rand(a, b), cc.x, cc.y - 10 - line * 10));
    creatures.splice(creatures.indexOf(c), 1);
    things.splice(things.indexOf(c), 1);
    return;
  }
  quest.killed[c.kind] = true;
  const cc = creatureCenter(c);
  burst(cc.x, cc.y, c.def.chip, 26);
  c.def.drops.forEach(([id, a, b], line) => gain(id, rand(a, b), cc.x, cc.y - 14 - line * 10));
  // beating it is what unlocks its journal entry. the landmark toast goes
  // first, then the "what you got" one once it's had a moment on screen.
  discover(c.poi);
  setTimeout(() => toast('Defeated', c.def.name, c.kind === 'hyena' ? 'Marble makes tools at Base Camp' : 'Hide makes armor at Base Camp'), 2300);
  markDirty();
}

// armor takes its percentage off the top. two decimals is plenty; the hearts
// round it visually anyway.
function afterArmor(dmg) {
  const block = inv.armor ? ARMORS[ITEMS[inv.armor.id].armor].block : 0;
  return Math.round(dmg * (1 - block) * 100) / 100;
}

function hurtPlayer(raw, fromX, fromY) {
  if (player.dead || vitals.invuln > 0) return false;
  const dmg = afterArmor(raw);
  vitals.hp = Math.max(0, Math.round((vitals.hp - dmg) * 100) / 100);
  vitals.invuln = 0.75;
  vitals.sinceHit = 0;
  const a = Math.atan2(player.y - fromY, player.x - fromX);
  vitals.kx = Math.cos(a) * 210;
  vitals.ky = Math.sin(a) * 210;
  floatText(`-${dmg}`, player.x, player.y - 30, '#ff6b6b');
  sfx.hurt();
  const flash = $('#hurt-flash');
  flash.classList.remove('is-on');
  void flash.offsetWidth;
  flash.classList.add('is-on');
  if (vitals.hp <= 0) die();
  markDirty();
  renderHUD();
  return true;
}

function die() {
  player.dead = true;
  player.deadT = 0;
  player.swing = -1;
  mining = null;
  closeUI();
  sfx.die();
}
function respawn() {
  player.dead = false;
  player.x = SPAWN.x * TILE + 8;
  player.y = SPAWN.y * TILE + 12;
  vitals.hp = vitals.max;
  vitals.hunger = HUNGER_MAX;
  vitals.sat = START_SAT;
  vitals.invuln = 1.5;
  vitals.kx = vitals.ky = 0;
  vitals.slowT = 0;
  // your bed, if you've slept in one, otherwise camp
  const bedSpot = quest.spawnBed && quest.beds.find(b => b.id === quest.spawnBed);
  if (bedSpot) { player.x = bedSpot.x * TILE + 8; player.y = (bedSpot.y + 1) * TILE + 12; }
  Object.assign(cam, clampCam(camTarget()));
  // anything still alive goes home and heals, like the fight never happened
  creatures.forEach(c => {
    if (c.dead || c.dormant || c.def.passive) return;
    Object.assign(c, { x: c.hx, y: c.hy, hp: c.def.hp, state: c.def.rest, cd: 0, kx: 0, ky: 0 });
  });
  toast('You fell', bedSpot ? 'Back in your bed' : 'Back at Base Camp', 'You keep your stuff. Eat, craft armor, try again.');
  renderHUD();
  markDirty();
}

function moveBody(o, mx, my) {
  if (!blocked(o.x + mx, o.y)) o.x += mx;
  if (!blocked(o.x, o.y + my)) o.y += my;
}

function updateCreature(c, dt) {
  if (c.dead || c.dormant) return;
  const def = c.def;
  c.hurtT = Math.max(0, c.hurtT - dt);
  c.cd -= dt;
  c.sinceHit += dt;
  // very slow healing once it's been left alone for a bit
  if (c.hp < def.hp && c.sinceHit > 6) c.hp = Math.min(def.hp, c.hp + def.regen * dt);
  if (Math.abs(c.kx) + Math.abs(c.ky) > 1) {
    moveBody(c, c.kx * dt, c.ky * dt);
    c.kx *= Math.max(0, 1 - dt * 9);
    c.ky *= Math.max(0, 1 - dt * 9);
  }
  c.pathT = (c.pathT || 0) - dt;
  if (def.passive) { updatePassive(c, dt); return; }
  const dx = player.x - c.x, dy = player.y - c.y, d = Math.hypot(dx, dy);
  const homeD = Math.hypot(c.hx - c.x, c.hy - c.y);
  const alive = !player.dead;
  c.moving = false;
  // water drags everything down
  const wet = inWater(c) ? 0.6 : 1;
  const walk = (tx, ty, speed) => {
    speed *= wet;
    const vx = tx - c.x, vy = ty - c.y, l = Math.hypot(vx, vy);
    if (l < 2) return;
    moveBody(c, (vx / l) * speed * dt, (vy / l) * speed * dt);
    c.flip = vx < 0;
    c.moving = true;
  };
  // straight at the target when nothing's in the way, otherwise along a tile
  // path around the rocks, re-planned a couple of times a second as you move
  const steer = (tx, ty, speed) => {
    if (clearLine(c.x, c.y, tx, ty)) { c.path = null; walk(tx, ty, speed); return; }
    if (!c.path || !c.path.length || c.pathT <= 0) {
      c.path = pathToward(c, Math.floor(tx / TILE), Math.floor((ty - 2) / TILE), 20);
      c.pathT = 0.6;
    }
    followPath(c, walk, speed);
  };

  switch (c.state) {
    case 'sleep':
      if (alive && d < def.aggro * TILE) aggro(c);
      break;
    case 'prowl':
      c.wanderT -= dt;
      if (!c.wander || c.wanderT <= 0) {
        c.wander = { x: c.hx + (Math.random() - 0.5) * 6 * TILE, y: c.hy + (Math.random() - 0.5) * 4 * TILE };
        c.wanderT = 2 + Math.random() * 2.5;
      }
      steer(c.wander.x, c.wander.y, def.speed * 0.35);
      if (alive && d < def.aggro * TILE) aggro(c);
      break;
    case 'chase':
      if (!alive || homeD > def.leash * TILE) { c.state = 'return'; break; }
      if (d <= def.range * TILE && c.cd <= 0) { c.state = 'windup'; c.t = 0; c.flip = dx < 0; break; }
      // close in, but stop just short of touching you. contact still hurts,
      // it just has to come from you walking into it or from a lunge.
      if (d > def.box.w / 2 + 12) steer(player.x, player.y, def.speed);
      else c.flip = dx < 0;
      break;
    case 'windup':
      // the tell: it crouches and flashes a "!", then leaps at where you were
      // standing at that moment. step sideways and it sails past.
      c.t += dt;
      c.flip = dx < 0;
      if (c.t >= def.windup) {
        const l = d || 1;
        c.lx = dx / l; c.ly = dy / l;
        c.state = 'lunge'; c.t = 0;
        sfx.bite();
      }
      break;
    case 'lunge':
      c.t += dt;
      moveBody(c, c.lx * def.lunge.speed * wet * dt, c.ly * def.lunge.speed * wet * dt);
      c.moving = true;
      if (c.t >= def.lunge.time) { c.state = 'recover'; c.t = 0; c.cd = def.cooldown; }
      break;
    case 'recover':
      // hop back out of your space after a lunge so it doesn't sit inside you
      c.t += dt;
      if (d < def.box.w / 2 + 18 && d > 0) moveBody(c, (-dx / d) * def.speed * 0.7 * dt, (-dy / d) * def.speed * 0.7 * dt);
      if (c.t > 0.4) c.state = alive ? 'chase' : 'return';
      break;
    case 'return':
      steer(c.hx, c.hy, def.speed * 0.8);
      c.hp = Math.min(def.hp, c.hp + dt * 2);
      if (homeD < 6) { c.state = def.rest; c.hp = def.hp; }
      // come back within range while it's heading home and it turns round
      else if (alive && d < def.aggro * TILE * 1.4 && homeD < def.leash * TILE * 0.8) c.state = 'chase';
      break;
  }

  // touching it hurts, whatever it's doing. a sleeping bear you walk into
  // wakes up swinging.
  if (alive && overlap(playerBox(), creatureBox(c))) {
    if (c.state === 'sleep' || c.state === 'prowl') aggro(c);
    if (c.state !== 'return') hurtPlayer(def.dmg, c.x, c.y);
  }
  if (c.moving) c.anim += dt;
}

const inWater = o => tiles[idx(clamp(Math.floor(o.x / TILE), 0, W - 1), clamp(Math.floor((o.y - 2) / TILE), 0, H - 1))] === T.WATER;
// livestock: stand around, amble somewhere nearby, stand around again. hit one
// and it runs for a few seconds, along a real path to whatever reachable spot is
// farthest from you, so it goes around rocks instead of running into them.
function updatePassive(c, dt) {
  const def = c.def;
  const wet = inWater(c) ? 0.6 : 1;
  c.moving = false;
  c.t += dt;
  const go = (tx, ty, speed) => {
    const vx = tx - c.x, vy = ty - c.y, l = Math.hypot(vx, vy);
    if (l < 2) return;
    moveBody(c, (vx / l) * speed * wet * dt, (vy / l) * speed * wet * dt);
    c.flip = vx < 0;
    c.moving = true;
  };
  const settle = pause => { c.state = 'graze'; c.t = 0; c.pause = pause; c.path = null; };
  if (c.state === 'flee') {
    if (!c.path || !c.path.length || c.pathT <= 0) {
      c.path = pathAway(c, player.x / TILE, player.y / TILE, 8);
      c.pathT = 0.8;
    }
    followPath(c, go, def.flee);
    if (c.t > 3) settle(2 + Math.random() * 3);
  } else if (c.state === 'roam') {
    if (!followPath(c, go, def.speed) || c.t > 6) settle(2 + Math.random() * 4);
  } else if (c.t > c.pause) {
    c.state = 'roam';
    c.t = 0;
    c.path = pathRandom(c, 4);
  }
  if (c.moving) c.anim += dt;
}

// ground paths for creatures, using the same rules as the player's: 8 ways and
// no cutting corners past solid blocks. the search is boxed in around the
// creature (radius in tiles) so a long chase can't eat the frame.
function creatureSearch(c, radius, visit) {
  const sx = clamp(Math.floor(c.x / TILE), 0, W - 1), sy = clamp(Math.floor((c.y - 2) / TILE), 0, H - 1);
  const x0 = sx - radius, y0 = sy - radius, size = radius * 2 + 1;
  const prev = new Int32Array(size * size).fill(-1);
  const start = (sy - y0) * size + (sx - x0);
  const queue = [start];
  prev[start] = start;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = (i % size) + x0, y = ((i / size) | 0) + y0;
    if (visit(x, y, i) === true) break;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < x0 || ny < y0 || nx >= x0 + size || ny >= y0 + size || solidTile(nx, ny)) continue;
      if (dx && dy && (solidTile(x + dx, y) || solidTile(x, y + dy))) continue;
      const n = (ny - y0) * size + (nx - x0);
      if (prev[n] !== -1) continue;
      prev[n] = i;
      queue.push(n);
    }
  }
  return { prev, size, x0, y0, start };
}
function tracePath(r, end) {
  const pts = [];
  for (let i = end; i !== r.start; i = r.prev[i]) pts.push({ x: ((i % r.size) + r.x0) * TILE + 8, y: (((i / r.size) | 0) + r.y0) * TILE + 12 });
  return pts.reverse();
}
// toward a tile, or as close to it as it can get
function pathToward(c, tx, ty, radius) {
  let best = null, bestD = Infinity;
  const r = creatureSearch(c, radius, (x, y, i) => {
    const d = (x - tx) ** 2 + (y - ty) ** 2;
    if (d < bestD) { bestD = d; best = i; }
    return d === 0;
  });
  return best === null ? [] : tracePath(r, best);
}
// to the reachable tile farthest from a point
function pathAway(c, fx, fy, radius) {
  let best = null, bestD = -1;
  const r = creatureSearch(c, radius, (x, y, i) => {
    const d = (x - fx) ** 2 + (y - fy) ** 2;
    if (d > bestD) { bestD = d; best = i; }
  });
  return best === null ? [] : tracePath(r, best);
}
// somewhere random it can actually walk to, staying near its home patch
function pathRandom(c, radius) {
  const spots = [];
  const r = creatureSearch(c, radius, (x, y, i) => {
    if (tiles[idx(x, y)] !== T.WATER && Math.hypot(x - c.hx / TILE, y - c.hy / TILE) < 7) spots.push(i);
  });
  return spots.length ? tracePath(r, spots[(Math.random() * spots.length) | 0]) : [];
}
// walk the next leg of a creature's path. false once it's done.
function followPath(c, walk, speed) {
  if (!c.path || !c.path.length) return false;
  if (Math.hypot(c.path[0].x - c.x, c.path[0].y - c.y) < 3) c.path.shift();
  if (!c.path.length) return false;
  walk(c.path[0].x, c.path[0].y, speed);
  return true;
}
// can its feet get from a to b in a straight line?
function clearLine(ax, ay, bx, by) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (blocked(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

function updateSpawning(dt) {
  spawnT -= dt;
  if (spawnT > 0) return;
  spawnT = 25 + Math.random() * 20;
  if (creatures.filter(c => c.def.passive && !c.dead).length >= PASSIVE_CAP) return;
  let roll = Math.random();
  const kind = (SPAWN_WEIGHTS.find(([, w]) => (roll -= w) < 0) || SPAWN_WEIGHTS[0])[0];
  // 14+ tiles away, so nothing pops into existence in front of you
  spawnPassive(kind, Math.random, 14);
}

function drawCreature(c, toX, toY, t) {
  const F = c.frames;
  let img = F.walk[0];
  if (c.state === 'sleep') img = F.sleep;
  else if (c.state === 'windup') img = F.crouch;
  else if (c.state === 'lunge') img = F.lunge;
  else if (c.moving) img = F.walk[Math.floor(c.anim * (c.kind === 'hyena' ? 10 : c.def.passive ? 7 : 9)) % 4];
  if (c.hurtT > 0) img = F.white.get(img) || img;
  const w = img.width, h = img.height;
  const shake = c.state === 'windup' ? Math.round(Math.sin(t / 18)) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(toX(c.x - w * 0.3), toY(c.y - 1), Math.round(w * 0.6 * S), 2 * S);
  // in water it sinks a little and the legs disappear under the surface
  const wet = inWater(c), cut = wet ? 8 : 0, sink = wet ? 4 : 0;
  const x = toX(c.x - Math.floor(w / 2) + shake), y = toY(c.y - h + 2 + sink);
  ctx.save();
  if (c.flip) { ctx.translate(x + w * S, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h - cut, 0, 0, w * S, (h - cut) * S); }
  else ctx.drawImage(img, 0, 0, w, h - cut, x, y, w * S, (h - cut) * S);
  ctx.restore();
  if (wet) {
    const rw = w * 0.4 + (Math.floor(t / 250) % 2) * 3;
    ctx.fillStyle = 'rgba(230,244,255,0.85)';
    ctx.fillRect(toX(c.x - rw), toY(c.y - 3), Math.round(rw * 2 * S), S);
  }
  // polished marble: little four-point glints that wander over the hyena
  if (c.kind === 'hyena' && c.hurtT <= 0 && !reduceMotion) {
    const cycle = Math.floor(t / 650);
    const phase = (t % 650) / 650;
    if (phase < 0.4) {
      const r = mulberry32(cycle * 13 + 7);
      const gx = c.x + (r() - 0.5) * 22 * (c.flip ? -1 : 1), gy = c.y - 12 - r() * 8;
      const a = 1 - Math.abs(phase - 0.2) * 5;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, a)})`;
      ctx.fillRect(toX(gx), toY(gy) - S, S, S * 3);
      ctx.fillRect(toX(gx) - S, toY(gy), S * 3, S);
    }
  }
}

function thingAt(m, pred) {
  let best = null;
  for (const o of things) {
    if (o.gone || !pred(o)) continue;
    const f = o.frames[0], w = f.width, h = f.height;
    if (m.x >= o.x - w / 2 && m.x <= o.x + w / 2 && m.y >= o.y - h && m.y <= o.y + 2) {
      if (!best || o.y > best.y) best = o;
    }
  }
  return best;
}

// what's under the cursor that you could act on: a station, a tree, or a block
function targetAt(m) {
  const st = thingAt(m, o => o.station);
  if (st) return { type: 'station', st, key: `st:${st.kind}`, cx: st.x, cy: st.y - 8 };
  const bed = thingAt(m, o => o.bed);
  if (bed) return { type: 'bed', thing: bed, key: `bed:${bed.id}`, cx: bed.x, cy: bed.y - 10, cls: 'wood' };
  const tree = thingAt(m, o => o.tree || (o === greatTree && !greatTree.chopped));
  if (tree) return { type: 'tree', thing: tree, key: `tree:${tree.id || 'great'}`, cx: tree.x, cy: tree.y - 6, cls: 'wood', great: tree === greatTree };
  const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
  if (!inside(tx, ty)) return null;
  const tile = tiles[idx(tx, ty)];
  if (STONE_TILES.has(tile) || ORE_ITEM[tile]) {
    return { type: 'tile', tx, ty, key: `tile:${idx(tx, ty)}`, cx: tx * TILE + 8, cy: ty * TILE + 8, cls: ORE_ITEM[tile] ? 'ore' : 'stone', ore: ORE_ITEM[tile] };
  }
  return null;
}
const inReach = tgt => tgt && Math.hypot(tgt.cx - player.x, tgt.cy - (player.y - 8)) <= REACH_TILES * TILE;

// how long this takes with what you're holding, whether it drops anything, and
// how much durability it eats. time is Infinity if it's locked.
function mineInfo(tgt) {
  const s = heldItem(), it = s ? ITEMS[s.id] : null;
  // picking a bed back up is quick and free
  if (tgt.type === 'bed') return { time: 0.6, drops: true, cost: 0 };
  if (tgt.type === 'tree') {
    if (!tgt.great && !quest.greatTree) return { time: Infinity };
    const base = MINE_TIME.wood * (tgt.great ? 1.6 : 1);
    return { time: it && it.tool === 'axe' ? base / it.speed : base, drops: true, cost: 1 };
  }
  const pick = it && it.tool === 'pickaxe' ? it : null;
  if (tgt.cls === 'stone') return { time: pick ? MINE_TIME.stone / pick.speed : MINE_TIME.stone, drops: true, cost: 1 };
  const harvest = !!pick && pick.harvest >= ORE_NEED[tgt.ore];
  // iron is the lowest tier that can take a diamond, and it pays for it: three
  // diamonds and the pickaxe is done
  const cost = pick && pick.mat === 'iron' && tgt.ore === 'diamond' ? Math.ceil(pick.dur / 3) : 1;
  return {
    time: harvest ? MINE_TIME.ore / pick.speed : MINE_TIME.ore * NO_HARVEST_SLOW,
    drops: harvest, cost
  };
}

let lockHintT = 0, noDropHintT = 0;
function mineStep(tgt, dt) {
  const info = mineInfo(tgt);
  if (info.time === Infinity) {
    if (lockHintT <= 0) {
      toast('Too sturdy', 'Not yet', 'The Great Tree in the Meadows has to come down first');
      sfx.deny();
      lockHintT = 2.5;
    }
    mining = null;
    return;
  }
  if (!mining || mining.key !== tgt.key) {
    if (mining && mining.thing) mining.thing.shake = 0;
    mining = { key: tgt.key, t: 0, thing: tgt.thing, tgt };
    if (!info.drops && noDropHintT <= 0) {
      toast('Too hard', ITEMS[tgt.ore].name, ORE_NEED[tgt.ore] >= 2
        ? 'Needs an iron pickaxe or better. This will crumble to nothing.'
        : 'Needs a stone, marble or gold pickaxe or better.');
      noDropHintT = 4;
    }
  }
  mining.need = info.time;
  mining.t += dt;
  if (tgt.thing) tgt.thing.shake = 1;
  if (player.swing < 0) {
    player.swing = 0;
    faceAngle(Math.atan2(tgt.cy - (player.y - 10), tgt.cx - player.x));
    sfx.chip();
    const rgb = tgt.cls === 'wood' ? '160,102,58' : tgt.cls === 'ore' ? '200,200,200' : '140,140,140';
    burst(tgt.cx, tgt.cy, rgb, 3);
  }
  if (mining.t >= info.time) breakTarget(tgt, info);
}

function breakTarget(tgt, info) {
  if (tgt.thing) tgt.thing.shake = 0;
  mining = null;
  sfx.crunch();
  const held = heldItem();
  const tool = held && ITEMS[held.id];
  if (tgt.type === 'bed') {
    removeBed(tgt.thing);
    gain('bed', 1, tgt.cx, tgt.cy - 10);
  } else if (tgt.type === 'tree') {
    const o = tgt.thing;
    if (tgt.great) {
      stumpGreatTree();
      quest.greatTree = true;
      gain('wood', rand(10, 15), o.x, o.y - 40);
      gain('stick', rand(5, 10), o.x, o.y - 30);
      burst(o.x, o.y - 20, '98,178,64', 30);
      toast('Timber', 'The Great Tree falls', 'Every tree can be chopped now. Something stirs in the grass...');
      hyena.dormant = false;
      hyena.gone = false;
      hyena.state = 'prowl';
    } else {
      o.gone = true;
      things.splice(things.indexOf(o), 1);
      quest.chopped.push(o.id);
      const dead = o.tree === 'deadtree';
      gain('wood', dead ? rand(0, 1) : rand(2, 4), o.x, o.y - 30);
      gain('stick', dead ? rand(2, 4) : rand(1, 2), o.x, o.y - 20);
      burst(o.x, o.y - 16, o.tree === 'pine' ? '47,109,81' : dead ? '154,77,49' : '98,178,64', 16);
    }
  } else {
    const i = idx(tgt.tx, tgt.ty);
    tiles[i] = baseOf(i);
    reach[i] = 1;
    quest.mined.push(i);
    repaintAround(tgt.tx, tgt.ty);
    paintMinimap();
    burst(tgt.cx, tgt.cy, '140,140,140', 12);
    if (info.drops) gain(tgt.ore || 'stone', 1, tgt.cx, tgt.cy - 8);
    else floatText('Nothing dropped', tgt.cx, tgt.cy - 8, '#bdbdbd');
  }
  if (tool && tool.dur && info.cost !== 0) wearHeld(info.cost || 1);
  markDirty();
}

function placeBed() {
  const m = mouseWorld();
  const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
  const spot = { cx: tx * TILE + 8, cy: ty * TILE + 8 };
  const blockedSpot = !inside(tx, ty) || SOLID[tiles[idx(tx, ty)]] || tiles[idx(tx, ty)] === T.WATER
    || things.some(o => !o.gone && !o.creature && Math.hypot(o.x - spot.cx, o.y - (spot.cy + 6)) < 14);
  if (!inReach(spot)) { toast('Too far', 'Bed', 'Place it somewhere closer'); return; }
  if (blockedSpot) { toast('No room', 'Bed', 'Needs a clear patch of ground'); sfx.deny(); return; }
  const b = { id: `bed-${Date.now()}`, x: tx, y: ty };
  quest.beds.push(b);
  bedThing(b);
  inv.slots[inv.sel] = null;
  toast('Bed placed', 'Sleep tight', 'Right-click it at night to sleep. Hold left-click to pick it back up.');
  sfx.craft();
  afterInventoryChange();
}
function removeBed(o) {
  things.splice(things.indexOf(o), 1);
  quest.beds = quest.beds.filter(b => b.id !== o.id);
  if (quest.spawnBed === o.id) quest.spawnBed = null;
}
function sleepIn(o) {
  if (nightAmount() < 0.5) { toast('Not tired', 'It\'s daytime', 'You can only sleep at night'); sfx.deny(); return; }
  const hunted = creatures.some(c => !c.def.passive && !c.dead && !c.dormant && ['chase', 'windup', 'lunge', 'recover'].includes(c.state));
  if (hunted) { toast('Can\'t sleep', 'Something is hunting you', 'Deal with it first'); sfx.deny(); return; }
  quest.spawnBed = o.id;
  sleeping = { t: 0, bed: o, morning: false };
  eating = null;
  mining = null;
  player.path = null;
  player.sleeping = true;
  player.x = o.x;
  player.y = o.y + 1;   // just past the bed so you're drawn on top of the blanket
  markDirty();
}
// lying in bed: z's drift up while the screen dims, it holds black for a beat,
// the night is skipped, and it fades back in on the next morning
let sleeping = null;
const SLEEP_DIM = 2.2, SLEEP_HOLD = 1, SLEEP_WAKE = 1;
function tickSleep(dt) {
  if (!sleeping) return;
  const s = sleeping;
  s.t += dt;
  const w = $('#warp');
  w.style.transition = 'none';
  if (!reduceMotion && Math.random() < dt * 2.2) floatText('z', player.x + 6 + Math.random() * 6, player.y - 18, '#cfd8ff');
  if (s.t < SLEEP_DIM) {
    w.style.opacity = String(s.t / SLEEP_DIM);
  } else if (s.t < SLEEP_DIM + SLEEP_HOLD) {
    w.style.opacity = '1';
    if (!s.morning) {
      s.morning = true;
      clock = 0;
      quest.day = (quest.day || 1) + 1;
      vitals.hp = vitals.max;
      renderHUD();
      markDirty();
    }
  } else if (s.t < SLEEP_DIM + SLEEP_HOLD + SLEEP_WAKE) {
    w.style.opacity = String(1 - (s.t - SLEEP_DIM - SLEEP_HOLD) / SLEEP_WAKE);
  } else {
    w.style.opacity = '';
    w.style.transition = '';
    sleeping = null;
    player.sleeping = false;
    // step off the foot of the bed
    if (!blocked(player.x, s.bed.y + 14)) player.y = s.bed.y + 14;
    toast('Good morning', `Day ${quest.day}`, 'This bed is your respawn point now');
  }
}
// right-click: sleep in a bed you're pointing at, place a bed you're holding,
// or eat whatever food is in your hand
function useRight() {
  const tgt = targetAt(mouseWorld());
  if (tgt && tgt.type === 'bed') {
    if (inReach(tgt)) sleepIn(tgt.thing);
    else toast('Too far', 'Bed', 'Walk up to it first');
    return;
  }
  const s = heldItem();
  if (s && s.id === 'bed') { placeBed(); return; }
  eat();
}

// 0 at full day, 1 at full night, with a half-minute dusk and a short dawn
function nightAmount() {
  if (clock < 220) return 0;
  if (clock < 250) return smooth((clock - 220) / 30);
  if (clock < 340) return 1;
  return 1 - smooth((clock - 340) / 20);
}
function playNight() { return started ? nightAmount() : 0; }
let wasNight = false;
function tickClock(dt) {
  clock += dt;
  if (clock >= DAY_LEN) { clock -= DAY_LEN; quest.day = (quest.day || 1) + 1; }
  const night = nightAmount() > 0.5;
  if (night !== wasNight) {
    wasNight = night;
    if (night) toast('Night falls', `Night ${quest.day || 1}`, 'Craft a bed (3 wool over 3 wood) and sleep through it');
    renderHUD();
  }
}

// eating takes a second: you chew (crumbs, little crunches, a bar over your
// head), walk at half speed, and the food only counts once it's finished.
// switching slots or dying cancels it.
const EAT_TIME = 1.1;
let eating = null;
function eat() {
  const s = heldItem();
  const it = s && ITEMS[s.id];
  if (!it || !it.food || eating || sleeping || player.dead) return;
  if (vitals.hunger >= HUNGER_MAX) { floatText('Not hungry', player.x, player.y - 34, '#cfcfcf'); return; }
  eating = { t: 0, slot: inv.sel, id: s.id };
}
function tickEating(dt) {
  if (!eating) return;
  const s = inv.slots[eating.slot];
  if (!s || s.id !== eating.id || inv.sel !== eating.slot || player.dead) { eating = null; return; }
  const before = eating.t;
  eating.t += dt;
  if (Math.floor(eating.t / 0.27) !== Math.floor(before / 0.27)) {
    sfx.chew();
    for (let i = 0; i < 3; i++) {
      particles.push({ x: player.x + (Math.random() - 0.5) * 8, y: player.y - 22, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 20, g: 140, life: 0.4, t: 0, col: '#c98552', size: 1 });
    }
  }
  if (eating.t < EAT_TIME) return;
  const it = ITEMS[s.id];
  vitals.hunger = Math.min(HUNGER_MAX, vitals.hunger + it.food);
  vitals.sat = Math.min(vitals.hunger, vitals.sat + it.sat);
  floatText(`+${it.food} hunger`, player.x, player.y - 34, '#f2c06a');
  s.n--;
  if (!s.n) inv.slots[eating.slot] = null;
  eating = null;
  sfx.eat();
  markDirty();
  renderHUD();
}

function furnaceTick(dt) {
  const F = furnaceState;
  const cooked = F.input && ITEMS[F.input.id].cooksTo;
  const canCook = !!cooked && (!F.output || (F.output.id === cooked && F.output.n < STACK_MAX));
  const st = stations.find(s => s.kind === 'furnace');
  let changed = false;
  if (canCook) {
    // tiny tolerance: 1 wood is exactly 2 meat, and float sums land at 0.9999
    // otherwise, which left the second meat stuck one frame from done
    if (F.burn <= 1e-6 && F.fuel) {
      F.burn += ITEMS[F.fuel.id].fuel;
      F.fuel.n--;
      if (!F.fuel.n) F.fuel = null;
      changed = true;
    }
    if (F.burn > 1e-6) {
      const step = Math.min(dt * COOK_RATE, F.burn);
      F.prog += step;
      F.burn -= step;
      if (F.prog >= 1 - 1e-6) {
        F.prog = 0;
        F.input.n--;
        if (!F.input.n) F.input = null;
        F.output = F.output ? { id: cooked, n: F.output.n + 1 } : { id: cooked, n: 1 };
        changed = true;
      }
    }
  } else F.prog = 0;
  const lit = canCook && F.burn > 1e-6;
  st.frames = lit ? st.lit : st.unlit;
  st.glow.off = !lit;
  if (changed) { markDirty(); if (ui === 'furnace') renderUI(); }
  if (ui === 'furnace') {
    const flame = $('#f-flame'), arrow = $('#f-arrow');
    if (flame) flame.style.height = `${Math.min(1, F.burn / 2) * 100}%`;
    if (arrow) arrow.style.width = `${F.prog * 100}%`;
  }
}

// trim the grid down to the box that has items in it, then compare that box
// against each recipe's shape (and its mirror image)
function matchRecipe() {
  let x0 = 5, y0 = 5, x1 = -1, y1 = -1;
  craftGrid.forEach((s, i) => {
    if (!s) return;
    const x = i % 5, y = (i / 5) | 0;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  });
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  for (const r of RECIPES) {
    if (r.shape.length !== h || Math.max(...r.shape.map(row => row.length)) !== w) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
        const ch = r.shape[y][mirror ? w - 1 - x : x] || '.';
        const s = craftGrid[(y0 + y) * 5 + x0 + x];
        ok = ch === '.' ? !s : !!s && s.id === r.key[ch];
      }
      if (ok) return r;
    }
  }
  return null;
}
function takeCraft(toBag) {
  const r = matchRecipe();
  if (!r) return false;
  const made = makeStack(r.out, r.n);
  if (toBag) {
    if (maxStack(r.out) === 1 && !inv.slots.some(s => !s)) { hint('Your bag is full'); return false; }
  } else if (heldStack && (heldStack.id !== r.out || heldStack.n + r.n > maxStack(r.out))) return false;
  craftGrid.forEach((s, i) => { if (s) { s.n--; if (!s.n) craftGrid[i] = null; } });
  if (toBag) addStack(made);
  else heldStack = heldStack ? { id: r.out, n: heldStack.n + r.n } : made;
  if (!quest.recipes.includes(r.out)) quest.recipes.push(r.out);
  if (!quest.crafted[r.out]) {
    quest.crafted[r.out] = true;
    const it = ITEMS[r.out];
    toast('Crafted', it.name, it.armor ? 'Put it in your armor slot (E)' : '');
  }
  sfx.craft();
  markDirty();
  return true;
}
function recipeNeeds(r) {
  const need = {};
  r.shape.forEach(row => [...row].forEach(ch => { if (ch !== '.') need[r.key[ch]] = (need[r.key[ch]] || 0) + 1; }));
  return need;
}
// picking a recipe from the book pulls the ingredients from your bag into the
// grid in the right shape
function fillRecipe(r) {
  craftGrid.forEach((s, i) => { if (s) { craftGrid[i] = null; addStack(s); } });
  const missing = Object.entries(recipeNeeds(r)).filter(([id, n]) => countItem(id) < n);
  if (missing.length) {
    hint(`Missing ${missing.map(([id, n]) => `${n - countItem(id)} ${ITEMS[id].name}`).join(', ')}`);
    sfx.deny();
    renderUI();
    return;
  }
  r.shape.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    takeItem(r.key[ch], 1);
    craftGrid[y * 5 + x] = { id: r.key[ch], n: 1 };
  }));
  bookOpen = false;
  sfx.ui();
  renderUI();
}
function countItem(id) { return inv.slots.reduce((n, s) => n + (s && s.id === id ? s.n : 0), 0); }
function takeItem(id, n) {
  for (let i = inv.slots.length - 1; i >= 0 && n > 0; i--) {
    const s = inv.slots[i];
    if (!s || s.id !== id) continue;
    const k = Math.min(s.n, n);
    s.n -= k; n -= k;
    if (!s.n) inv.slots[i] = null;
  }
}

// every slot in the ui is addressed as "container:index"
function slotGet(ref) {
  const [box, i] = ref.split(':');
  if (box === 'inv') return inv.slots[+i];
  if (box === 'armor') return inv.armor;
  if (box === 'craft') return craftGrid[+i];
  if (box === 'chest') return chestSlots[+i];
  if (box === 'out') { const r = matchRecipe(); return r ? { id: r.out, n: r.n } : null; }
  return furnaceState[box];
}
function slotSet(ref, stack) {
  const [box, i] = ref.split(':');
  if (box === 'inv') inv.slots[+i] = stack;
  else if (box === 'armor') inv.armor = stack;
  else if (box === 'craft') craftGrid[+i] = stack;
  else if (box === 'chest') chestSlots[+i] = stack;
  else furnaceState[box] = stack;
}
// what each slot is allowed to hold, with the reason shown when it says no
function slotRefuses(ref, id) {
  const box = ref.split(':')[0], it = ITEMS[id];
  if (box === 'craft' && it.food) return 'Meat doesn\'t go on the crafting table';
  if (box === 'craft' && (it.tool || it.armor)) return 'Finished gear can\'t go back on the table';
  if (box === 'input' && !it.cooksTo) return it.fuel ? 'That\'s fuel. It goes in the bottom slot.' : 'The furnace only cooks raw food and smelts raw ore';
  if (box === 'fuel' && !it.fuel) return 'Only wood and sticks burn';
  if (box === 'armor' && !it.armor) return 'That isn\'t armor';
  if (box === 'output' || box === 'out') return 'You can only take from here';
  return '';
}

function slotClick(ref, button, shift) {
  const box = ref.split(':')[0];
  if (box === 'out') {
    if (shift) { while (takeCraft(true)) { /* craft as many as you can */ } }
    else takeCraft(false);
    renderUI();
    return;
  }
  const cur = slotGet(ref);

  if (shift && cur) {
    quickMove(ref, cur);
    return;
  }

  if (!heldStack) {
    if (!cur) return;
    if (button === 2 && cur.n > 1) {
      const half = Math.ceil(cur.n / 2);
      heldStack = { id: cur.id, n: half };
      cur.n -= half;
    } else {
      heldStack = cur;
      slotSet(ref, null);
    }
  } else {
    const why = slotRefuses(ref, heldStack.id);
    if (why) { hint(why); sfx.deny(); return; }
    const max = maxStack(heldStack.id);
    if (button === 2 && max > 1) {
      if (!cur) { slotSet(ref, { id: heldStack.id, n: 1 }); heldStack.n--; }
      else if (cur.id === heldStack.id && cur.n < max) { cur.n++; heldStack.n--; }
      if (heldStack.n <= 0) heldStack = null;
    } else if (!cur) {
      slotSet(ref, heldStack); heldStack = null;
    } else if (cur.id === heldStack.id && cur.n < max) {
      const k = Math.min(max - cur.n, heldStack.n);
      cur.n += k; heldStack.n -= k;
      if (heldStack.n <= 0) heldStack = null;
    } else {
      slotSet(ref, heldStack); heldStack = cur;
    }
  }
  sfx.ui();
  afterInventoryChange();
  if (!ui) return;
  renderUI();
}

// shift click moves things between your bag and whatever station is open
// (or between your bag and the armor slot)
function quickMove(ref, cur) {
  const box = ref.split(':')[0];
  if (box === 'inv' && ui === 'inv' && !ITEMS[cur.id].armor) { bagToHotbar(ref, cur); return; }
  if (box === 'inv') {
    let dest = null;
    if (ITEMS[cur.id].armor) dest = 'armor:0';
    else if (ui === 'furnace') dest = ITEMS[cur.id].cooksTo ? 'input' : ITEMS[cur.id].fuel ? 'fuel' : null;
    else if (ui === 'chest') {
      const same = chestSlots.findIndex(st => st && st.id === cur.id && st.n < maxStack(cur.id));
      const free = chestSlots.findIndex(st => !st);
      if (same >= 0 || free >= 0) dest = `chest:${same >= 0 ? same : free}`;
    }
    else if (ui === 'craft' && !slotRefuses('craft:0', cur.id)) {
      const free = craftGrid.findIndex(s => !s);
      if (free >= 0) dest = `craft:${free}`;
    }
    if (!dest) { hint(slotRefuses(ui === 'furnace' ? 'input' : 'craft:0', cur.id) || 'Nowhere to put that'); return; }
    const there = slotGet(dest);
    if (!there) { slotSet(dest, cur); slotSet(ref, null); }
    else if (dest === 'armor:0') { slotSet(dest, cur); slotSet(ref, there); }
    else if (there.id === cur.id) {
      const k = Math.min(maxStack(cur.id) - there.n, cur.n);
      there.n += k; cur.n -= k;
      if (!cur.n) slotSet(ref, null);
    }
  } else {
    slotSet(ref, null);
    addStack(cur);
  }
  sfx.ui();
  afterInventoryChange();
}

// in the plain inventory, shift click sends things from the bag to the hotbar
// and from the hotbar back to the bag. if there's no room it just doesn't move,
// no message, since nothing went anywhere it shouldn't.
function bagToHotbar(ref, cur) {
  const from = +ref.split(':')[1];
  const [lo, hi] = from < 6 ? [6, 24] : [0, 6];
  const max = maxStack(cur.id);
  for (let k = lo; k < hi && cur.n > 0; k++) {
    const s = inv.slots[k];
    if (s && s.id === cur.id && s.n < max) { const m = Math.min(max - s.n, cur.n); s.n += m; cur.n -= m; }
  }
  if (cur.n > 0) {
    for (let k = lo; k < hi; k++) if (!inv.slots[k]) { inv.slots[k] = cur; inv.slots[from] = null; break; }
  } else inv.slots[from] = null;
  sfx.ui();
  afterInventoryChange();
}

let hintTimer;
function hint(text) {
  const el = $('#inv-hint');
  if (!el) return;
  el.textContent = text;
  el.classList.add('is-warn');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { el.classList.remove('is-warn'); el.textContent = DEFAULT_HINT; }, 2200);
}
const DEFAULT_HINT = '';

const invWrap = $('#inv-wrap');
const heldEl = $('#held');

function durBar(stack) {
  const it = stack && ITEMS[stack.id];
  if (!it || !it.dur || stack.dur >= it.dur) return '';
  const f = stack.dur / it.dur;
  return `<s style="width:${Math.max(6, f * 100)}%;background:${f > 0.5 ? '#6fe07a' : f > 0.2 ? '#ffd23f' : '#ff5a4a'}"></s>`;
}
function slotHTML(ref, stack, extra = '') {
  const it = stack && ITEMS[stack.id];
  const label = it ? `${it.name}${stack.n > 1 ? ` ×${stack.n}` : ''}` : 'Empty';
  return `<button type="button" class="slot ${extra}" data-ref="${ref}" title="${label}" aria-label="${label}">
    ${it ? `<i style="background-image:url(${ICON[stack.id]})"></i>${stack.n > 1 ? `<b>${stack.n}</b>` : ''}${durBar(stack)}` : ''}
  </button>`;
}

function openUI(kind) {
  ui = kind;
  bookOpen = false;
  mining = null;
  mouse.down = false;
  keys.clear();
  invWrap.hidden = false;
  document.body.classList.add('inv-open');
  renderUI();
  sfx.ui();
}
function closeUI() {
  if (!ui) return;
  // anything on the cursor or still on the crafting grid goes back in the bag
  const back = [heldStack, ...craftGrid];
  heldStack = null;
  craftGrid.fill(null);
  ui = null;
  back.forEach(addStack);
  invWrap.hidden = true;
  heldEl.hidden = true;
  document.body.classList.remove('inv-open');
  markDirty();
  renderHUD();
}

function bookHTML() {
  const known = RECIPES.filter(r => quest.recipes.includes(r.out));
  if (!known.length) return '<p class="rb-empty">Nothing yet. A recipe shows up here once you\'ve held every material it needs.</p>';
  return `<ul class="rb-list">${known.map(r => {
    const need = recipeNeeds(r);
    const ready = Object.entries(need).every(([id, n]) => countItem(id) >= n);
    const w = Math.max(...r.shape.map(row => row.length));
    const cells = [];
    for (let y = 0; y < r.shape.length; y++) for (let x = 0; x < w; x++) {
      const ch = r.shape[y][x] || '.';
      cells.push(`<span style="grid-row:${y + 1};grid-column:${x + 1}">${ch === '.' ? '' : `<i style="background-image:url(${ICON[r.key[ch]]})"></i>`}</span>`);
    }
    const it = ITEMS[r.out];
    return `<li><button type="button" class="rb-item${ready ? ' is-ready' : ''}" data-fill="${RECIPES.indexOf(r)}">
      <span class="rb-out"><i style="background-image:url(${ICON[r.out]})"></i></span>
      <span class="rb-name">${it.name}${r.n > 1 ? ` ×${r.n}` : ''}</span>
      <span class="rb-shape" style="grid-template-columns:repeat(${w},10px)">${cells.join('')}</span>
    </button></li>`;
  }).join('')}</ul>`;
}

function stationHTML() {
  if (ui === 'craft') {
    const r = matchRecipe();
    return `<div class="st-craft">
      <div class="craft-main">
        <div class="craft-grid">${craftGrid.map((s, i) => slotHTML(`craft:${i}`, s)).join('')}</div>
        <span class="craft-arrow" aria-hidden="true">▶</span>
        ${slotHTML('out:0', r ? { id: r.out, n: r.n } : null, `slot-out${r ? ' is-ready' : ''}`)}
        <button type="button" class="rb-toggle${bookOpen ? ' is-open' : ''}" data-book aria-expanded="${bookOpen}">
          Recipe book<span>${quest.recipes.length}</span>
        </button>
      </div>
      ${bookOpen ? `<div class="recipe-book"><p class="rb-title">Recipes</p>${bookHTML()}</div>` : ''}
    </div>`;
  }
  if (ui === 'chest') {
    return `<div class="st-chest"><p class="inv-label">Chest <span>stays here at camp</span></p>
      <div class="chest-grid">${chestSlots.map((st, i) => slotHTML(`chest:${i}`, st)).join('')}</div></div>`;
  }
  if (ui === 'furnace') {
    const F = furnaceState;
    return `<div class="st-furnace">
      <div class="f-col">
        ${slotHTML('input', F.input, 'slot-meat')}
        <span class="f-flame" aria-hidden="true"><i id="f-flame" style="height:${Math.min(1, F.burn / 2) * 100}%"></i></span>
        ${slotHTML('fuel', F.fuel, 'slot-fuel')}
      </div>
      <span class="f-arrow" aria-hidden="true"><i id="f-arrow" style="width:${F.prog * 100}%"></i></span>
      ${slotHTML('output', F.output, 'slot-out')}
    </div>`;
  }
  return '';
}

function renderUI() {
  if (!ui) return;
  const title = { inv: 'Inventory', craft: 'Crafting Table', furnace: 'Furnace', chest: 'Chest' }[ui];
  const scroll = invWrap.querySelector('.rb-list')?.scrollTop || 0;
  invWrap.innerHTML = `
    <section class="inv px" role="dialog" aria-label="${title}">
      <header class="inv-head">
        <p class="inv-title">${title}</p>
        <button type="button" class="inv-close" data-close>Close | E</button>
      </header>
      ${ui !== 'inv' ? `<div class="inv-station">${stationHTML()}</div>` : ''}
      <div class="inv-body">
        <div class="inv-doll">
          <p class="inv-label">Armor</p>
          ${slotHTML('armor:0', inv.armor, 'slot-armor')}
        </div>
        <div class="inv-slots">
          <p class="inv-label">Bag</p>
          <div class="inv-bag">${inv.slots.slice(6).map((s, i) => slotHTML(`inv:${i + 6}`, s)).join('')}</div>
          <p class="inv-label">Hotbar <span>1–6</span></p>
          <div class="inv-hot">${inv.slots.slice(0, 6).map((s, i) => slotHTML(`inv:${i}`, s, i === inv.sel ? 'is-sel' : '')).join('')}</div>
        </div>
      </div>
      <p class="inv-hint" id="inv-hint">${DEFAULT_HINT}</p>
    </section>`;
  const list = invWrap.querySelector('.rb-list');
  if (list) list.scrollTop = scroll;
  paintHeld();
}

function paintHeld() {
  if (!heldStack) { heldEl.hidden = true; return; }
  heldEl.hidden = false;
  heldEl.innerHTML = `<i style="background-image:url(${ICON[heldStack.id]})"></i>${heldStack.n > 1 ? `<b>${heldStack.n}</b>` : ''}`;
  heldEl.style.left = `${mouse.x}px`;
  heldEl.style.top = `${mouse.y}px`;
}

let vitalsKey = '';
function renderVitals() {
  const key = `${vitals.hp}|${vitals.hunger.toFixed(2)}|${vitals.sat.toFixed(2)}|${inv.armor && inv.armor.id}|${vitals.slowT > 0}|${nightAmount() > 0.5}|${quest.day}`;
  if (key === vitalsKey) return;
  vitalsKey = key;
  const row = (val, set) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const v = val - i;
      out.push(`<i style="background-image:url(${v >= 1 ? set.full : v >= 0.5 ? set.half : set.empty})"></i>`);
    }
    return out.join('');
  };
  $('#hearts').innerHTML = row(vitals.hp, HEART)
    + (inv.armor ? `<span class="hud-armor" title="${ITEMS[inv.armor.id].name}"><i style="background-image:url(${ICON[inv.armor.id]})"></i></span>` : '');
  $('#hearts').setAttribute('aria-label', `Health ${vitals.hp} of ${vitals.max}`);
  $('#hunger').innerHTML = `<span class="hunger-icons">${row(vitals.hunger, DRUM)}</span>`
    + `<span class="sat-bar" title="Saturation"><i style="width:${(vitals.sat / HUNGER_MAX) * 100}%"></i></span>`;
  $('#hunger').setAttribute('aria-label', `Hunger ${vitals.hunger.toFixed(1)} of ${HUNGER_MAX}`);
  $('#hud-status').innerHTML = (vitals.slowT > 0 ? '<span class="hud-soaked">Soaked</span>' : '')
    + `<span class="hud-time${nightAmount() > 0.5 ? ' is-night' : ''}">${nightAmount() > 0.5 ? '☾ Night' : '☀ Day'} ${quest.day || 1}</span>`;
}

function renderHUD() {
  vitalsKey = '';
  renderVitals();
  $('#hotbar').innerHTML = inv.slots.slice(0, 6).map((s, i) => `
    <button type="button" class="hb-slot${i === inv.sel ? ' is-sel' : ''}" data-hotbar="${i}" title="${s ? ITEMS[s.id].name : 'Empty'}">
      <span class="hb-key">${i + 1}</span>
      ${s ? `<i style="background-image:url(${ICON[s.id]})"></i>${s.n > 1 ? `<b>${s.n}</b>` : ''}${durBar(s)}` : ''}
    </button>`).join('');
  const s = heldItem();
  $('#held-name').textContent = s
    ? `${ITEMS[s.id].name}${ITEMS[s.id].food ? ' | right-click to eat' : ''}${ITEMS[s.id].dur ? ` | ${s.dur}/${ITEMS[s.id].dur}` : ''}`
    : 'Bare hands';
}

function selectSlot(i) {
  inv.sel = (i + 6) % 6;
  mining = null;
  renderHUD();
  markDirty();
}

const WEAPON_TIERS = ['stone', 'marble', 'iron', 'emerald', 'diamond'];
const craftedWeapon = () => WEAPON_TIERS.some(m => ['sword', 'axe', 'pickaxe'].some(k => quest.crafted[`${m}-${k}`]));
const QUEST_STEPS = [
  { done: () => found.has('ucla'), title: 'Find the Great Tree' },
  { done: () => quest.greatTree, title: 'Chop down the Great Tree' },
  { done: () => quest.killed.hyena, title: () => (quest.seen.hyena ? 'Defeat the marble hyena' : 'Find the next landmark') },
  { done: craftedWeapon, title: 'Craft a weapon' },
  { done: () => quest.killed.bear, title: 'Defeat the grizzly' },
  { done: () => quest.crafted['hide-armor'], title: 'Craft hide armor' },
  { done: () => false, title: 'Meadows complete' }
];
const meadowsComplete = () => QUEST_STEPS.slice(0, -1).every(q => q.done());
let questKey = '';
function renderQuest() {
  const step = QUEST_STEPS.find(q => !q.done());
  const n = QUEST_STEPS.indexOf(step);
  const title = typeof step.title === 'function' ? step.title() : step.title;
  const key = `${n}|${title}`;
  if (key === questKey) return;
  const first = questKey === '';
  questKey = key;
  $('#quest-step').textContent = 'The Meadows';
  $('#quest-title').textContent = title;
  if (!first) {
    const q = $('#quest');
    q.classList.remove('is-new');
    void q.offsetWidth;
    q.classList.add('is-new');
  }
}

function noiseBurst(dur, freq, peak) {
  if (!soundOn) return;
  try {
    const a = getAudio();
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    const f = a.createBiquadFilter();
    const g = a.createGain();
    f.type = 'lowpass';
    f.frequency.value = freq;
    g.gain.value = peak;
    src.buffer = buf;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  } catch { /* no audio */ }
}
Object.assign(sfx, {
  hit:    () => { noiseBurst(0.08, 1800, 0.12); tone(140, 0.06, 'square', 0.03); },
  hurt:   () => { tone(220, 0.08, 'sawtooth', 0.05); tone(150, 0.12, 'sawtooth', 0.04, 0.06); },
  chip:   () => noiseBurst(0.04, 2600, 0.06),
  chew:   () => noiseBurst(0.05, 1100, 0.07),
  crunch: () => { noiseBurst(0.18, 900, 0.14); tone(90, 0.12, 'triangle', 0.05); },
  snap:   () => { noiseBurst(0.12, 3000, 0.14); tone(300, 0.1, 'square', 0.04); tone(180, 0.15, 'square', 0.04, 0.08); },
  pickup: () => tone(980, 0.05, 'square', 0.025),
  eat:    () => { noiseBurst(0.06, 1200, 0.08); setTimeout(() => noiseBurst(0.06, 1200, 0.08), 110); },
  craft:  () => { tone(520, 0.06); tone(780, 0.06, 'square', 0.035, 0.06); tone(1040, 0.1, 'square', 0.035, 0.12); },
  bite:   () => noiseBurst(0.1, 600, 0.12),
  splash: () => noiseBurst(0.25, 1400, 0.1),
  roar:   () => { tone(80, 0.5, 'sawtooth', 0.06); tone(60, 0.6, 'sawtooth', 0.05, 0.1); },
  die:    () => { tone(330, 0.15, 'triangle', 0.05); tone(247, 0.15, 'triangle', 0.05, 0.15); tone(165, 0.35, 'triangle', 0.05, 0.3); }
});

// the in-game sprite sheet has its dagger erased (img/player-swing.png), so
// whatever you're holding gets drawn into your hand instead. swing poses were
// read off the original dagger in each frame: x, y is the grip inside the 48px
// cell and a is the direction the blade points. frames without a pose (the
// follow-through) fall back to the resting grip for that facing.
const SWING_POSE = {
  6: [{ x: 17, y: 33, a: -117 }, { x: 31, y: 35, a: 10 }, { x: 31, y: 33, a: -30 }, null],
  7: [{ x: 29, y: 34, a: -100 }, { x: 22, y: 41, a: -160 }, { x: 30, y: 37, a: 20 }, null],
  8: [{ x: 32, y: 38, a: 63 }, { x: 15, y: 35, a: 162 }, { x: 17, y: 40, a: -162 }, null]
};
const REST_POSE = {
  down: { x: 29, y: 37, a: -60, front: true },
  side: { x: 27, y: 37, a: -45, front: true },
  up:   { x: 19, y: 37, a: -120, front: false }
};
// called by the engine just before (front false) and after (front true)
// it draws your sprite, so things held behind your back get covered by you
function playDrawHeld(dx, dy, row, col, front) {
  if (!started || player.dead || player.sleeping) return;
  const s = heldItem();
  if (!s) return;
  const face = ['down', 'side', 'up'][row % 3];
  const pose = (SWING_POSE[row] && SWING_POSE[row][col]) || REST_POSE[face];
  if ((pose.front !== false) !== front) return;
  const it = ITEMS[s.id], img = ICON_CANVAS[s.id];
  let x = pose.x, a = pose.a;
  if (player.flip) { x = CELL - x; a = 180 - a; }
  // tools are held by the handle and point along the swing, anything else is
  // just a smaller copy of its icon sitting in your hand
  const k = it.tool ? 0.72 : 0.55;
  ctx.save();
  if (player.blink) ctx.globalAlpha = 0.4;
  ctx.translate(dx + x * S, dy + pose.y * S);
  if (it.tool) {
    ctx.rotate(((a + 45) * Math.PI) / 180);
    ctx.drawImage(img, -3 * k * S, -13 * k * S, 16 * k * S, 16 * k * S);
  } else {
    ctx.drawImage(img, -8 * k * S, -8 * k * S, 16 * k * S, 16 * k * S);
  }
  ctx.restore();
}

function tickHunger(dt) {
  const walking = player.moving;
  if (vitals.sat > 0) vitals.sat = Math.max(0, vitals.sat - dt * (walking ? SAT_DECAY_MOVE : SAT_DECAY_IDLE));
  else if (walking) vitals.hunger = Math.max(0, vitals.hunger - dt * HUNGER_DECAY);
  if (vitals.hp < vitals.max && vitals.hunger >= HUNGER_MAX) {
    vitals.regenT += dt;
    if (vitals.regenT >= REGEN_EVERY) {
      vitals.regenT = 0;
      vitals.hp = Math.min(vitals.max, vitals.hp + 0.5);
      // healing is paid for out of saturation first, then hunger itself, which
      // knocks hunger below full and stops the healing until you eat
      if (vitals.sat >= 0.5) vitals.sat -= 0.5;
      else { vitals.hunger -= 0.5 - vitals.sat; vitals.sat = 0; }
      markDirty();
    }
  } else vitals.regenT = 0;
  // empty stomach: half a heart every few seconds until you eat something
  if (vitals.hunger <= 0 && !player.dead) {
    vitals.starveT += dt;
    if (vitals.starveT >= STARVE_EVERY) {
      vitals.starveT = 0;
      vitals.hp = Math.max(0, vitals.hp - 0.5);
      floatText('Starving', player.x, player.y - 34, '#ff6b6b');
      sfx.hurt();
      const flash = $('#hurt-flash');
      flash.classList.remove('is-on');
      void flash.offsetWidth;
      flash.classList.add('is-on');
      if (vitals.hp <= 0) die();
      markDirty();
    }
  } else vitals.starveT = 0;
  renderVitals();
}

// the biomes open one at a time. right now that's the meadows, then the rest
// once the meadows quest is finished. base camp is always open.
const OPEN_FIRST = ['camp', 'meadows'];
function playLandmarkLocked(p) {
  return !OPEN_FIRST.includes(p.region) && !meadowsComplete();
}
const sealHinted = new Set();
let wasComplete = null;
function checkSeals() {
  const done = meadowsComplete();
  if (wasComplete === false && done) {
    toast('Meadows complete', 'New lands open', 'The other biomes\' landmarks can be found now');
    sfx.found();
    renderJournal(journalRegion);
  }
  wasComplete = done;
  if (done) return;
  POIS.forEach(p => {
    if (sealHinted.has(p.id) || found.has(p.id) || !playLandmarkLocked(p) || p.thing.gone) return;
    if (Math.hypot(p.thing.x - player.x, p.thing.y - player.y) < TILE * 3.4) {
      sealHinted.add(p.id);
      toast('Sealed', '? ? ?', 'Finish the Meadows first');
      sfx.deny();
    }
  });
}

function playFrozen() { return ui !== null || player.dead || !!sleeping; }
// which layer of img/player-armor.png to paint over you, or -1 for none
const ARMOR_LAYERS = ['hide', 'wool', 'gold', 'marble', 'iron', 'emerald', 'diamond'];
function playArmorIndex() {
  return started && inv.armor ? ARMOR_LAYERS.indexOf(ITEMS[inv.armor.id].armor) : -1;
}
function playSpeedMult() {
  const armor = inv.armor && ARMORS[ITEMS[inv.armor.id].armor];
  return (vitals.slowT > 0 ? 0.55 : 1) * (armor && armor.slow ? armor.slow : 1)
    * (vitals.hunger <= 0.5 ? STARVING_SLOW : 1) * (eating ? 0.5 : 1);
}

let questT = 0, tipShown = false, wasSoaked = false;
function playUpdate(dt, t) {
  if (!started) return;
  vitals.invuln = Math.max(0, vitals.invuln - dt);
  vitals.atkCD -= dt;
  vitals.eatCD -= dt;
  vitals.sinceHit += dt;
  vitals.slowT = Math.max(0, vitals.slowT - dt);
  lockHintT -= dt;
  noDropHintT -= dt;
  player.blink = vitals.invuln > 0 && !player.dead && Math.floor(t / 90) % 2 === 0;
  if ((vitals.slowT > 0) !== wasSoaked) { wasSoaked = vitals.slowT > 0; renderHUD(); }

  if (player.dead) {
    player.deadT += dt;
    if (player.deadT > 2) respawn();
  } else {
    if (Math.abs(vitals.kx) + Math.abs(vitals.ky) > 1) {
      moveBody(player, vitals.kx * dt, vitals.ky * dt);
      vitals.kx *= Math.max(0, 1 - dt * 10);
      vitals.ky *= Math.max(0, 1 - dt * 10);
    }
    tickHunger(dt);
    // soaked: drips off you while it lasts
    if (vitals.slowT > 0 && Math.random() < dt * 14) {
      particles.push({ x: player.x + (Math.random() - 0.5) * 12, y: player.y - 18, vx: 0, vy: 20, g: 80, life: 0.4, t: 0, col: '#7ec3ff', size: 1 });
    }
    // gold armor catches the light
    const armor = inv.armor && ARMORS[ITEMS[inv.armor.id].armor];
    if (armor && armor.shine && !reduceMotion && Math.random() < dt * 6) {
      particles.push({ x: player.x + (Math.random() - 0.5) * 14, y: player.y - 8 - Math.random() * 18, vx: 0, vy: -6, g: 0, life: 0.5, t: 0, col: '#fff3a0', size: 1 });
    }
  }

  creatures.forEach(c => updateCreature(c, dt));
  updateSpawning(dt);
  tickClock(dt);
  tickEating(dt);
  tickSleep(dt);
  checkSeals();
  furnaceTick(dt);

  // holding the mouse: hit anything in the swing arc first, otherwise mine
  // whatever's under the cursor, otherwise just swing at the air
  if (mouse.down && !ui && !player.dead) {
    const tool = heldTool();
    const a = aimAngle();
    const tgt = targetAt(mouseWorld());
    const fighting = creatures.some(c => inArc(c, a, tool));
    if (!fighting && tgt && tgt.type !== 'station' && inReach(tgt)) mineStep(tgt, dt);
    else {
      if (mining && mining.thing) mining.thing.shake = 0;
      mining = null;
      attack();
    }
  } else if (mining) {
    if (mining.thing) mining.thing.shake = 0;
    mining = null;
  }

  // the first nudge, when you walk up to the great tree
  if (!tipShown && !quest.greatTree && Math.hypot(greatTree.x - player.x, greatTree.y - player.y) < TILE * 3.2) {
    tipShown = true;
    setTimeout(() => toast('The Great Tree', 'Chop it down', 'Hold left-click on the trunk with your dagger'), 1200);
  }

  for (let i = floats.length - 1; i >= 0; i--) {
    floats[i].t += dt;
    if (floats[i].t > 1.2) floats.splice(i, 1);
  }

  questT -= dt;
  if (questT <= 0) { questT = 0.25; renderQuest(); }
  if (saveDirty && performance.now() - lastSave > 1500) saveNow();

  // cursor: a hand over things you can use, crosshair otherwise
  if (mouse.inCanvas && !ui) {
    const tgt = targetAt(mouseWorld());
    canvas.style.cursor = tgt && inReach(tgt) && (tgt.type === 'station' || mineInfo(tgt).time !== Infinity) ? 'pointer' : 'crosshair';
  }
}

function playRenderOverlay(toX, toY, t) {
  if (!started) return;
  const fs = Math.max(16, 8 * Math.round((S * 5.3) / 8));

  // gold armor gets a soft warm halo
  const armor = inv.armor && ARMORS[ITEMS[inv.armor.id].armor];
  if (armor && armor.shine && !player.dead) {
    const gx = toX(player.x), gy = toY(player.y - 12), rad = TILE * S * 1.6;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
    g.addColorStop(0, `rgba(255,214,90,${0.18 + Math.sin(t / 300) * 0.05})`);
    g.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  // target outline + mining progress
  if (!ui && !player.dead && mouse.inCanvas && !mouse.touch) {
    const tgt = targetAt(mouseWorld());
    if (tgt) {
      const ok = inReach(tgt) && (tgt.type === 'station' || mineInfo(tgt).time !== Infinity);
      let x0, y0, w, h;
      if (tgt.type === 'tile') { x0 = tgt.tx * TILE; y0 = tgt.ty * TILE; w = h = TILE; }
      else {
        const o = tgt.st || tgt.thing, f = o.frames[0];
        x0 = o.x - f.width / 2; y0 = o.y - f.height; w = f.width; h = f.height;
      }
      // corner brackets, the minecraft "you're pointing at this" box
      ctx.fillStyle = ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)';
      const L = 4 * S, th = S;
      const X = toX(x0), Y = toY(y0), X2 = toX(x0 + w), Y2 = toY(y0 + h);
      [[X, Y, 1, 1], [X2, Y, -1, 1], [X, Y2, 1, -1], [X2, Y2, -1, -1]].forEach(([cx, cy, sx, sy]) => {
        ctx.fillRect(sx > 0 ? cx : cx - L, sy > 0 ? cy : cy - th, L, th);
        ctx.fillRect(sx > 0 ? cx : cx - th, sy > 0 ? cy : cy - L, th, L);
      });
    }
  }
  if (mining) {
    const tg = mining.tgt;
    const bx = toX(tg.cx - 10), by = toY(tg.cy - (tg.type === 'tile' ? 14 : 44));
    ctx.fillStyle = 'rgba(10,10,14,0.85)';
    ctx.fillRect(bx, by, 20 * S, 3 * S);
    // red bar when this one isn't going to drop anything
    ctx.fillStyle = mineInfo(tg).drops === false ? '#ff7b6b' : '#ffd23f';
    ctx.fillRect(bx + S, by + S, Math.round(18 * S * Math.min(1, mining.t / mining.need)), S);
    if (tg.type === 'tile') {
      // cracks spreading across the block
      const stage = Math.floor((mining.t / mining.need) * 4);
      ctx.fillStyle = 'rgba(20,20,20,0.7)';
      for (let k = 0; k <= stage; k++) {
        const r = mulberry32(tg.tx * 31 + tg.ty * 7 + k);
        let cx = 4 + r() * 8, cy = 4 + r() * 8;
        for (let s = 0; s < 4 + k; s++) {
          ctx.fillRect(toX(tg.tx * TILE + cx), toY(tg.ty * TILE + cy), S, S);
          cx = clamp(cx + Math.round(r() * 2 - 1), 0, 15);
          cy = clamp(cy + Math.round(r() * 2 - 1), 0, 15);
        }
      }
    }
  }

  // creature health bars + the windup "!"
  ctx.font = `${fs}px Silkscreen, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  creatures.forEach(c => {
    if (c.dead || c.gone) return;
    const top = c.y - c.def.h - 2;
    if (c.hp < c.def.hp || (!c.def.passive && ['chase', 'windup', 'lunge', 'recover'].includes(c.state))) {
      const bw = 26, bx = toX(c.x - bw / 2), by = toY(top);
      ctx.fillStyle = 'rgba(10,10,14,0.85)';
      ctx.fillRect(bx, by, bw * S, 3 * S);
      ctx.fillStyle = '#e8343a';
      ctx.fillRect(bx + S, by + S, Math.round((bw - 2) * S * (c.hp / c.def.hp)), S);
    }
    if (c.state === 'windup') {
      const mw = Math.round(fs * 0.9), mx = toX(c.x + (c.flip ? -16 : 16)) - mw / 2, my = toY(top - 2) - mw;
      ctx.fillStyle = '#ff4d3d';
      ctx.fillRect(mx, my, mw, mw);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('!', mx + mw / 2, my + mw / 2 + 1);
    }
    if (c.state === 'sleep' && !reduceMotion) {
      const k = (t / 1000) % 2;
      ctx.fillStyle = `rgba(255,255,255,${1 - k / 2})`;
      ctx.fillText('z', toX(c.x + 16 + k * 4), toY(top + 8 - k * 8));
    }
  });

  // the "hold click" bubble over the great tree until it's down
  if (!quest.greatTree && Math.hypot(greatTree.x - player.x, greatTree.y - player.y) < TILE * 4) {
    const text = 'HOLD CLICK TO CHOP';
    const tw = ctx.measureText(text).width, pad = fs * 0.5;
    // sits above the landmark label so it never covers you
    const x = toX(greatTree.x), y = toY(greatTree.y - greatTree.frames[0].height - 3) - fs * 3.4;
    ctx.fillStyle = 'rgba(12,12,16,0.85)';
    ctx.fillRect(x - tw / 2 - pad, y - fs * 0.8, tw + pad * 2, fs * 1.6);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(text, x, y + 1);
  }

  if (eating) {
    const bx = toX(player.x - 10), by = toY(player.y - 46);
    ctx.fillStyle = 'rgba(10,10,14,0.85)';
    ctx.fillRect(bx, by, 20 * S, 3 * S);
    ctx.fillStyle = '#f2c06a';
    ctx.fillRect(bx + S, by + S, Math.round(18 * S * Math.min(1, eating.t / EAT_TIME)), S);
  }

  // floating numbers and pickups
  floats.forEach(f => {
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
    ctx.fillStyle = '#000';
    ctx.fillText(f.text, toX(f.x) + S, toY(f.y - f.t * 18) + S);
    ctx.fillStyle = f.col;
    ctx.fillText(f.text, toX(f.x), toY(f.y - f.t * 18));
  });
  ctx.globalAlpha = 1;
}

// keys the engine hands over before its own handling. returns true if used.
function playKey(e, onControl) {
  const k = e.key.toLowerCase();
  if (k === 'e') { e.preventDefault(); if (ui) closeUI(); else openUI('inv'); return true; }
  if (k === 'escape' && ui) { closeUI(); return true; }
  if (ui) return MOVE_KEYS[e.key] !== undefined;
  if (/^[1-6]$/.test(k)) { selectSlot(Number(k) - 1); return true; }
  if (k === 'f' && !onControl) { eat(); return true; }
  return false;
}

canvas.addEventListener('pointermove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.inCanvas = true;
  mouse.touch = e.pointerType === 'touch';
});
canvas.addEventListener('pointerleave', () => { mouse.inCanvas = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (!started || ui || player.dead) return;
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.inCanvas = true;
  mouse.touch = e.pointerType === 'touch';
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (e.button === 2) { useRight(); return; }
  if (e.button !== 0) return;
  const tgt = targetAt(mouseWorld());
  if (tgt && tgt.type === 'station') {
    if (inReach(tgt)) openUI(tgt.st.kind);
    else toast('Too far', { craft: 'Crafting Table', furnace: 'Furnace', chest: 'Chest' }[tgt.st.kind], 'Walk up to it first');
    return;
  }
  // phones have no wasd, so a tap on empty ground still walks you there
  if (mouse.touch) {
    const tool = heldTool();
    const busy = (tgt && inReach(tgt)) || creatures.some(c => inArc(c, aimAngle(), tool));
    if (!busy) {
      const m = mouseWorld();
      const path = findPath(Math.floor(m.x / TILE), Math.floor(m.y / TILE));
      player.path = path.length ? path : null;
      return;
    }
  }
  mouse.down = true;
});
window.addEventListener('pointerup', () => { mouse.down = false; });
window.addEventListener('blur', () => { mouse.down = false; });
canvas.addEventListener('wheel', e => {
  if (!started || ui) return;
  e.preventDefault();
  selectSlot(inv.sel + (e.deltaY > 0 ? 1 : -1));
}, { passive: false });

document.addEventListener('mousemove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (heldStack) { heldEl.style.left = `${e.clientX}px`; heldEl.style.top = `${e.clientY}px`; }
});
invWrap.addEventListener('contextmenu', e => e.preventDefault());
// right drag: holding a stack, hold right click and sweep across slots to drop
// one in each, like laying three diamonds across the top of a pickaxe
let rightDrag = null;
invWrap.addEventListener('mousedown', e => {
  const slot = e.target.closest('[data-ref]');
  if (slot) {
    e.preventDefault();
    if (e.button === 2 && heldStack && !e.shiftKey) rightDrag = new Set([slot.dataset.ref]);
    slotClick(slot.dataset.ref, e.button, e.shiftKey);
    return;
  }
  const fill = e.target.closest('[data-fill]');
  if (fill && e.button === 0) { e.preventDefault(); fillRecipe(RECIPES[+fill.dataset.fill]); return; }
  if (e.target.closest('[data-book]') && e.button === 0) { e.preventDefault(); bookOpen = !bookOpen; sfx.ui(); renderUI(); return; }
  if (e.target.closest('[data-close]')) { e.preventDefault(); closeUI(); return; }
  // clicking the dim backdrop closes it too
  if (e.target === invWrap) closeUI();
});
invWrap.addEventListener('mouseover', e => {
  if (!rightDrag) return;
  if (!(e.buttons & 2) || !heldStack) { rightDrag = null; return; }
  const slot = e.target.closest('[data-ref]');
  if (!slot || rightDrag.has(slot.dataset.ref)) return;
  rightDrag.add(slot.dataset.ref);
  if (['out', 'output'].includes(slot.dataset.ref.split(':')[0])) return;
  slotClick(slot.dataset.ref, 2, false);
});
window.addEventListener('mouseup', e => { if (e.button === 2) rightDrag = null; });
$('#hotbar').addEventListener('click', e => {
  const b = e.target.closest('[data-hotbar]');
  if (b) { selectSlot(+b.dataset.hotbar); if (e.detail) b.blur(); }
});
window.addEventListener('pagehide', () => { if (saveDirty) saveNow(); });

renderHUD();
renderQuest();

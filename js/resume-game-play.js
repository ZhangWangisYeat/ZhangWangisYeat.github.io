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

// armor: guard scales the "with armor" damage each creature does (hide is the
// baseline the creature numbers were written for). iron slows you down, gold
// shines.
const ARMORS = {
  hide:    { name: 'Hide',    guard: 1 },
  gold:    { name: 'Gold',    guard: 1,    shine: true },
  marble:  { name: 'Marble',  guard: 0.8 },
  iron:    { name: 'Iron',    guard: 0.6,  slow: 0.85 },
  emerald: { name: 'Emerald', guard: 0.45 },
  diamond: { name: 'Diamond', guard: 0.3 }
};

// dmg is in hearts, cd is seconds between swings, reach is in tiles, dur is how
// many hits or blocks a tool lasts.
const ITEMS = {
  wood:          { name: 'Wood', fuel: 2 },
  stick:         { name: 'Stick', fuel: 0.5 },
  stone:         { name: 'Stone' },
  marble:        { name: 'Marble' },
  hide:          { name: 'Hide' },
  iron:          { name: 'Iron' },
  gold:          { name: 'Gold' },
  ruby:          { name: 'Ruby' },
  emerald:       { name: 'Emerald' },
  diamond:       { name: 'Diamond' },
  'raw-meat':    { name: 'Raw Meat', food: 0.5 },
  'cooked-meat': { name: 'Cooked Meat', food: 2 },
  dagger:        { name: 'Dagger', tool: 'dagger', dmg: 0.5, cd: 0.45, reach: 1.6 }
};
TIER_ORDER.forEach(m => {
  const t = TIERS[m];
  ITEMS[`${m}-sword`] = { name: `${t.name} Sword`, tool: 'sword', mat: m, dmg: t.sword, cd: 0.45, reach: 1.8, dur: t.dur };
  ITEMS[`${m}-pickaxe`] = { name: `${t.name} Pickaxe`, tool: 'pickaxe', mat: m, dmg: t.pick, cd: 0.9, reach: 1.7, dur: t.dur, speed: t.speed, harvest: t.harvest };
  ITEMS[`${m}-axe`] = { name: `${t.name} Axe`, tool: 'axe', mat: m, dmg: t.axe, cd: 1.8, reach: 1.7, dur: t.dur, speed: t.speed };
});
Object.keys(ARMORS).forEach(m => {
  ITEMS[`${m}-armor`] = { name: `${ARMORS[m].name} Armor`, armor: m, mat: m };
});
// whatever you're holding that isn't a tool hits like a bare hand
const FIST = { name: 'Bare hands', dmg: 0.25, cd: 0.45, reach: 1.4 };
const STACK_MAX = 64;
const maxStack = id => (ITEMS[id].tool || ITEMS[id].armor ? 1 : STACK_MAX);

// mining: seconds with no bonus. a tool that can't harvest an ore takes three
// times as long and the block breaks with nothing to show for it.
const MINE_TIME = { wood: 2.4, stone: 5, ore: 8 };
const NO_HARVEST_SLOW = 3;
const REACH_TILES = 2.6;
const ORE_ITEM = { [T.GOLD]: 'gold', [T.DIAMOND]: 'diamond', [T.RUBY]: 'ruby', [T.EMERALD]: 'emerald', [T.IRON]: 'iron' };
const ORE_NEED = { iron: 1, gold: 2, ruby: 2, emerald: 2, diamond: 2 };
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
['gold', 'marble', 'iron', 'emerald', 'diamond'].forEach(m => {
  RECIPES.push({ out: `${m}-armor`, shape: ['M.M', 'MMM', 'MMM'], key: { M: m } });
});
RECIPES.push({ out: 'stick', n: 4, shape: ['W'], key: { W: 'wood' } });
RECIPES.forEach(r => { r.n = r.n || 1; r.mats = [...new Set(Object.values(r.key))]; });

const COOK_RATE = 0.5;        // meat per second while the furnace has fuel

// dmg is [with hide armor, without]. distances are in tiles. box is the body
// hitbox in world px: touch it and you get hurt, lunge or not.
const CREATURES = {
  hyena: {
    name: 'Marble Hyena', hp: 5, speed: 80, aggro: 7, leash: 16, range: 2.4,
    windup: 0.34, lunge: { speed: 250, time: 0.22 }, cooldown: 1.1, dmg: [0.5, 1],
    knock: 140, h: 28, box: { w: 26, h: 14 }, rest: 'prowl',
    drops: [['marble', 5, 10]]
  },
  bear: {
    name: 'Grizzly', hp: 15, speed: 98, aggro: 5, leash: 13, range: 2.8,
    windup: 0.42, lunge: { speed: 300, time: 0.26 }, cooldown: 1.3, dmg: [1, 2.5],
    knock: 18, h: 36, box: { w: 36, h: 20 }, rest: 'sleep',
    // from a few tiles out it scoops water at you instead, which slows you
    splash: { min: 3.2, max: 7.5, cd: 4.5, windup: 0.4, speed: 200, slow: 3 },
    drops: [['hide', 15, 20], ['raw-meat', 10, 15]]
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
  hide:    ['#c08c5a', '#8a5a33', '#5e3a1e']
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
    case 'raw-meat':
    case 'cooked-meat': {
      const raw = id === 'raw-meat';
      pxBlob(G, 9.5, 7, 4.5, 4, (dx, dy) => (dx + dy < -0.6 ? (raw ? '#f39aa0' : '#d18a4e') : raw ? '#d0505b' : '#94562b'));
      if (raw) { G.set(9, 6, '#ffffff'); G.set(10, 8, '#f5d0d3'); }
      pxLine(G, 6, 10, 3, 13, '#f2ede0', 2);
      G.set(2, 13, '#f2ede0'); G.set(3, 14, '#f2ede0');
      break;
    }
    case 'dagger':
      pxLine(G, 8, 8, 13, 3, '#dfe3e8', 2);
      pxLine(G, 9, 9, 13, 5, '#98a2ad');
      pxLine(G, 5, 8, 8, 11, '#8a6a2e');
      pxLine(G, 3, 13, 6, 10, '#6b4422', 2);
      break;
    default:
      gemIcon(G, CRYSTAL_PAL[id] || CRYSTAL_PAL.crystal);
  }
  return G.outline(() => '#141414').canvas();
}
const ICON = Object.fromEntries(Object.keys(ITEMS).map(id => [id, makeIcon(id).toDataURL()]));

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
// front paw, 'scoop' is the water toss, 'sleep' is lying down eyes shut.
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

function creatureFrames(kind) {
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
const quest = { greatTree: false, chopped: [], mined: [], killed: {}, seen: {}, crafted: {}, recipes: [] };
const vitals = { hp: 5, max: 5, invuln: 0, sinceHit: 99, regenT: 0, kx: 0, ky: 0, atkCD: 0, eatCD: 0, slowT: 0 };
const creatures = [];
const stations = [];
const floats = [];
const shots = [];            // the bear's thrown water
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
  if (data.furnace) {
    ['input', 'fuel', 'output'].forEach(k => { furnaceState[k] = validStack(data.furnace[k]); });
    furnaceState.burn = +data.furnace.burn || 0;
  }
}
function saveNow() {
  if (resetting) return;
  store.write(SAVE_KEY, { v: 2, inv, quest, hp: vitals.hp, furnace: furnaceState });
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
  const frames = kind === 'craft' ? [makeTable()] : [makeFurnace(false, 0)];
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
    hp: def.hp, state: def.rest, t: 0, cd: 0, splashCD: 1.5, anim: 0, flip: false, hurtT: 0, kx: 0, ky: 0,
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

addStation('craft', CAMP.x + 3, CAMP.y - 2);
addStation('furnace', CAMP.x + 5, CAMP.y);

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
  // once it's committed to a windup or lunge, hits land but don't push it
  // around, otherwise you could juggle it out of range forever
  if (c.state !== 'windup' && c.state !== 'lunge') {
    c.kx = Math.cos(a) * c.def.knock;
    c.ky = Math.sin(a) * c.def.knock;
  }
  const cc = creatureCenter(c);
  floatText(`-${dmg}`, cc.x, cc.y - 12, '#ffd1d1');
  burst(cc.x, cc.y, c.kind === 'hyena' ? '242,238,231' : '123,74,41', 6);
  sfx.hit();
  if (!['windup', 'lunge', 'recover', 'scoop'].includes(c.state)) aggro(c);
  if (c.hp <= 0) killCreature(c);
}

function aggro(c) {
  if (c.state === 'chase' || c.dead) return;
  if (c.state === 'sleep') sfx.roar();
  c.state = 'chase';
  if (!quest.seen[c.kind]) {
    quest.seen[c.kind] = true;
    toast(c.kind === 'hyena' ? 'Ambush' : 'You woke it', c.def.name,
      c.kind === 'hyena' ? 'It crouches before it leaps. Sidestep, then strike.' : 'Fast, and it throws water to slow you. 2.5 hearts a swipe.');
    markDirty();
  }
}

function killCreature(c) {
  c.dead = true;
  c.gone = true;
  quest.killed[c.kind] = true;
  const cc = creatureCenter(c);
  burst(cc.x, cc.y, c.kind === 'hyena' ? '242,238,231' : '123,74,41', 26);
  sfx.found();
  c.def.drops.forEach(([id, a, b], line) => gain(id, rand(a, b), cc.x, cc.y - 14 - line * 10));
  toast('Defeated', c.def.name, c.kind === 'hyena' ? 'Marble makes tools at Base Camp' : 'Hide makes armor. Meat cooks in the furnace.');
  markDirty();
}

function damageFrom(c) {
  if (!inv.armor) return c.def.dmg[1];
  // round to the nearest half heart so the hud can always show it
  return Math.max(0.5, Math.round(c.def.dmg[0] * ARMORS[ITEMS[inv.armor.id].armor].guard * 2) / 2);
}

function hurtPlayer(c) {
  if (player.dead || vitals.invuln > 0) return false;
  const dmg = damageFrom(c);
  vitals.hp = Math.max(0, vitals.hp - dmg);
  vitals.invuln = 0.75;
  vitals.sinceHit = 0;
  const a = Math.atan2(player.y - c.y, player.x - c.x);
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
  vitals.invuln = 1.5;
  vitals.kx = vitals.ky = 0;
  vitals.slowT = 0;
  shots.length = 0;
  Object.assign(cam, clampCam(camTarget()));
  // anything still alive goes home and heals, like the fight never happened
  creatures.forEach(c => {
    if (c.dead || c.dormant) return;
    Object.assign(c, { x: c.hx, y: c.hy, hp: c.def.hp, state: c.def.rest, cd: 0, kx: 0, ky: 0 });
  });
  toast('You fell', 'Back at Base Camp', 'You keep your stuff. Eat, craft armor, try again.');
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
  c.splashCD -= dt;
  if (Math.abs(c.kx) + Math.abs(c.ky) > 1) {
    moveBody(c, c.kx * dt, c.ky * dt);
    c.kx *= Math.max(0, 1 - dt * 9);
    c.ky *= Math.max(0, 1 - dt * 9);
  }
  const dx = player.x - c.x, dy = player.y - c.y, d = Math.hypot(dx, dy);
  const homeD = Math.hypot(c.hx - c.x, c.hy - c.y);
  const alive = !player.dead;
  c.moving = false;
  const walk = (tx, ty, speed) => {
    const vx = tx - c.x, vy = ty - c.y, l = Math.hypot(vx, vy);
    if (l < 2) return;
    moveBody(c, (vx / l) * speed * dt, (vy / l) * speed * dt);
    c.flip = vx < 0;
    c.moving = true;
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
      walk(c.wander.x, c.wander.y, def.speed * 0.35);
      if (alive && d < def.aggro * TILE) aggro(c);
      break;
    case 'chase':
      if (!alive || homeD > def.leash * TILE) { c.state = 'return'; break; }
      if (def.splash && c.splashCD <= 0 && d > def.splash.min * TILE && d < def.splash.max * TILE) {
        c.state = 'scoop'; c.t = 0; c.flip = dx < 0; break;
      }
      if (d <= def.range * TILE && c.cd <= 0) { c.state = 'windup'; c.t = 0; c.flip = dx < 0; break; }
      if (d > TILE * 0.9) walk(player.x, player.y, def.speed);
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
      moveBody(c, c.lx * def.lunge.speed * dt, c.ly * def.lunge.speed * dt);
      c.moving = true;
      if (c.t >= def.lunge.time) { c.state = 'recover'; c.t = 0; c.cd = def.cooldown; }
      break;
    case 'scoop':
      c.t += dt;
      c.flip = dx < 0;
      if (c.t >= def.splash.windup) {
        const l = d || 1, sp = def.splash.speed;
        shots.push({ x: c.x + (c.flip ? -18 : 18), y: c.y - 20, vx: (dx / l) * sp, vy: (dy / l) * sp, t: 0, slow: def.splash.slow });
        c.splashCD = def.splash.cd;
        c.state = 'chase';
        sfx.splash();
      }
      break;
    case 'recover':
      c.t += dt;
      if (c.t > 0.4) c.state = alive ? 'chase' : 'return';
      break;
    case 'return':
      walk(c.hx, c.hy, def.speed * 0.8);
      c.hp = Math.min(def.hp, c.hp + dt * 2);
      if (homeD < 6) { c.state = def.rest; c.hp = def.hp; }
      else if (alive && d < def.aggro * TILE * 0.7 && homeD < def.leash * TILE * 0.6) c.state = 'chase';
      break;
  }

  // touching it hurts, whatever it's doing. a sleeping bear you walk into
  // wakes up swinging.
  if (alive && overlap(playerBox(), creatureBox(c))) {
    if (c.state === 'sleep' || c.state === 'prowl') aggro(c);
    if (c.state !== 'return') hurtPlayer(c);
  }
  if (c.moving) c.anim += dt;
}

function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const pb = playerBox();
    const hitPlayer = !player.dead && s.x > pb.x0 - 3 && s.x < pb.x1 + 3 && s.y > pb.y0 - 3 && s.y < pb.y1 + 3;
    const hitWall = solidTile(Math.floor(s.x / TILE), Math.floor((s.y + 12) / TILE));
    if (hitPlayer) {
      vitals.slowT = s.slow;
      floatText('Soaked!', player.x, player.y - 32, '#7ec3ff');
      sfx.splash();
    }
    if (hitPlayer || hitWall || s.t > 1.6) {
      burst(s.x, s.y, '126,195,255', 10);
      shots.splice(i, 1);
    }
  }
}

function drawCreature(c, toX, toY, t) {
  const F = c.frames;
  let img = F.walk[0];
  if (c.state === 'sleep') img = F.sleep;
  else if (c.state === 'windup') img = F.crouch;
  else if (c.state === 'lunge') img = F.lunge;
  else if (c.state === 'scoop') img = F.scoop;
  else if (c.moving) img = F.walk[Math.floor(c.anim * (c.kind === 'hyena' ? 10 : 9)) % 4];
  if (c.hurtT > 0) img = F.white.get(img) || img;
  const w = img.width, h = img.height;
  const shake = c.state === 'windup' ? Math.round(Math.sin(t / 18)) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(toX(c.x - w * 0.3), toY(c.y - 1), Math.round(w * 0.6 * S), 2 * S);
  const x = toX(c.x - Math.floor(w / 2) + shake), y = toY(c.y - h + 2);
  ctx.save();
  if (c.flip) { ctx.translate(x + w * S, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w * S, h * S); }
  else ctx.drawImage(img, x, y, w * S, h * S);
  ctx.restore();
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
  if (tgt.type === 'tree') {
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
  if (tool && tool.dur) wearHeld(info.cost || 1);
  markDirty();
}

function eat() {
  const s = heldItem();
  if (!s || !ITEMS[s.id].food || vitals.eatCD > 0 || player.dead) return;
  if (vitals.hp >= vitals.max) { floatText('Full', player.x, player.y - 34, '#cfcfcf'); return; }
  vitals.hp = Math.min(vitals.max, vitals.hp + ITEMS[s.id].food);
  vitals.eatCD = 0.6;
  floatText(`+${ITEMS[s.id].food} ♥`, player.x, player.y - 34, '#ff8a8a');
  s.n--;
  if (!s.n) inv.slots[inv.sel] = null;
  sfx.eat();
  markDirty();
  renderHUD();
}

function furnaceTick(dt) {
  const F = furnaceState;
  const canCook = F.input && F.input.id === 'raw-meat' && (!F.output || (F.output.id === 'cooked-meat' && F.output.n < STACK_MAX));
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
        F.output = F.output ? { id: 'cooked-meat', n: F.output.n + 1 } : { id: 'cooked-meat', n: 1 };
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
    toast('Crafted', it.name, it.tool ? `${it.dmg} hearts a hit · lasts ${it.dur} uses` : it.armor ? 'Drop it in your armor slot (E)' : '');
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
  if (box === 'out') { const r = matchRecipe(); return r ? { id: r.out, n: r.n } : null; }
  return furnaceState[box];
}
function slotSet(ref, stack) {
  const [box, i] = ref.split(':');
  if (box === 'inv') inv.slots[+i] = stack;
  else if (box === 'armor') inv.armor = stack;
  else if (box === 'craft') craftGrid[+i] = stack;
  else furnaceState[box] = stack;
}
// what each slot is allowed to hold, with the reason shown when it says no
function slotRefuses(ref, id) {
  const box = ref.split(':')[0], it = ITEMS[id];
  if (box === 'craft' && it.food) return 'Meat doesn\'t go on the crafting table';
  if (box === 'craft' && (it.tool || it.armor)) return 'Finished gear can\'t go back on the table';
  if (box === 'input' && id !== 'raw-meat') return it.fuel ? 'That\'s fuel. It goes in the bottom slot.' : 'The furnace only cooks raw meat';
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
  if (box === 'inv') {
    let dest = null;
    if (ITEMS[cur.id].armor) dest = 'armor:0';
    else if (ui === 'furnace') dest = cur.id === 'raw-meat' ? 'input' : ITEMS[cur.id].fuel ? 'fuel' : null;
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

let hintTimer;
function hint(text) {
  const el = $('#inv-hint');
  if (!el) return;
  el.textContent = text;
  el.classList.add('is-warn');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { el.classList.remove('is-warn'); el.textContent = DEFAULT_HINT; }, 2200);
}
const DEFAULT_HINT = 'Click to pick up and drop · right-click splits a stack · shift-click moves it across';

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
  const label = it ? `${it.name}${stack.n > 1 ? ` ×${stack.n}` : ''}${it.dur && stack.dur ? ` · ${stack.dur}/${it.dur}` : ''}` : 'Empty';
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
    const stat = it.tool ? `${it.dmg}♥ · ${it.dur} uses` : it.armor ? 'armor' : `makes ${r.n}`;
    return `<li><button type="button" class="rb-item${ready ? ' is-ready' : ''}" data-fill="${RECIPES.indexOf(r)}">
      <span class="rb-out"><i style="background-image:url(${ICON[r.out]})"></i></span>
      <span class="rb-name">${it.name}<small>${stat} · ${Object.entries(need).map(([id, n]) => `${n} ${ITEMS[id].name}`).join(', ')}</small></span>
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
      ${bookOpen ? `<div class="recipe-book"><p class="rb-title">Click a recipe to lay it out on the table</p>${bookHTML()}</div>` : ''}
    </div>`;
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
      <p class="f-note">Raw meat on top, fuel below.<br>1 wood cooks 2 meat · 1 stick cooks ½.<br>It keeps cooking after you walk away.</p>
    </div>`;
  }
  return '';
}

function renderUI() {
  if (!ui) return;
  const tool = heldTool();
  const held = heldItem();
  const armor = inv.armor && ARMORS[ITEMS[inv.armor.id].armor];
  const title = { inv: 'Inventory', craft: 'Crafting Table', furnace: 'Furnace' }[ui];
  const scroll = invWrap.querySelector('.rb-list')?.scrollTop || 0;
  invWrap.innerHTML = `
    <section class="inv px" role="dialog" aria-label="${title}">
      <header class="inv-head">
        <p class="inv-title">${title}</p>
        <button type="button" class="inv-close" data-close>Close · E</button>
      </header>
      ${ui !== 'inv' ? `<div class="inv-station">${stationHTML()}</div>` : ''}
      <div class="inv-body">
        <div class="inv-doll">
          <p class="inv-label">Armor</p>
          ${slotHTML('armor:0', inv.armor, 'slot-armor')}
          <dl class="inv-stats">
            <div><dt>Health</dt><dd>${vitals.hp} / ${vitals.max}</dd></div>
            <div><dt>Holding</dt><dd>${tool.name}</dd></div>
            <div><dt>Damage</dt><dd>${tool.dmg} ♥ / ${tool.cd}s</dd></div>
            ${held && ITEMS[held.id].dur ? `<div><dt>Durability</dt><dd>${held.dur} / ${ITEMS[held.id].dur}</dd></div>` : ''}
            <div><dt>Armor</dt><dd>${armor ? `${armor.name}${armor.slow ? ' · heavy' : ''}${armor.shine ? ' · shiny' : ''}` : 'None'}</dd></div>
          </dl>
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

function renderHUD() {
  const hearts = [];
  for (let i = 0; i < vitals.max; i++) {
    const v = vitals.hp - i;
    hearts.push(`<i style="background-image:url(${v >= 1 ? HEART.full : v >= 0.5 ? HEART.half : HEART.empty})"></i>`);
  }
  $('#hearts').innerHTML = hearts.join('')
    + (inv.armor ? `<span class="hud-armor" title="${ITEMS[inv.armor.id].name}"><i style="background-image:url(${ICON[inv.armor.id]})"></i></span>` : '')
    + (vitals.slowT > 0 ? '<span class="hud-soaked">Soaked</span>' : '');
  $('#hearts').setAttribute('aria-label', `Health ${vitals.hp} of ${vitals.max}`);
  $('#hotbar').innerHTML = inv.slots.slice(0, 6).map((s, i) => `
    <button type="button" class="hb-slot${i === inv.sel ? ' is-sel' : ''}" data-hotbar="${i}" title="${s ? ITEMS[s.id].name : 'Empty'}">
      <span class="hb-key">${i + 1}</span>
      ${s ? `<i style="background-image:url(${ICON[s.id]})"></i>${s.n > 1 ? `<b>${s.n}</b>` : ''}${durBar(s)}` : ''}
    </button>`).join('');
  const s = heldItem();
  $('#held-name').textContent = s
    ? `${ITEMS[s.id].name}${ITEMS[s.id].food ? ' · right-click to eat' : ''}${ITEMS[s.id].dur ? ` · ${s.dur}/${ITEMS[s.id].dur}` : ''}`
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
  { done: () => found.has('ucla'), title: 'Find the Great Tree', sub: 'It stands alone in the Meadows, west of Base Camp' },
  { done: () => quest.greatTree, title: 'Fell the Great Tree', sub: 'Hold left-click on it with your dagger' },
  { done: () => quest.killed.hyena, title: () => (quest.seen.hyena ? 'Defeat the marble hyena' : 'Find the next landmark'), sub: () => (quest.seen.hyena ? 'It crouches, then leaps. Sidestep and strike back.' : 'Every tree can be chopped now. Something prowls the grass...') },
  { done: craftedWeapon, title: 'Craft a real weapon', sub: 'Marble or stone, at the crafting table in Base Camp' },
  { done: () => quest.killed.bear, title: 'Slay the grizzly', sub: 'It sleeps by its den in the far southwest of the Meadows' },
  { done: () => quest.crafted['hide-armor'], title: 'Craft hide armor', sub: 'Then cook the meat in the camp furnace' },
  { done: () => false, title: 'Meadows cleared', sub: 'Mine deeper for better ores. More biomes open next patch.' }
];
let questKey = '';
function renderQuest() {
  const step = QUEST_STEPS.find(q => !q.done());
  const n = QUEST_STEPS.indexOf(step);
  const title = typeof step.title === 'function' ? step.title() : step.title;
  const sub = typeof step.sub === 'function' ? step.sub() : step.sub;
  const key = `${n}|${title}`;
  if (key === questKey) return;
  const first = questKey === '';
  questKey = key;
  $('#quest-step').textContent = `Meadows · ${Math.min(n + 1, QUEST_STEPS.length - 1)} / ${QUEST_STEPS.length - 1}`;
  $('#quest-title').textContent = title;
  $('#quest-sub').textContent = sub;
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

function playFrozen() { return ui !== null || player.dead; }
function playSpeedMult() {
  const armor = inv.armor && ARMORS[ITEMS[inv.armor.id].armor];
  return (vitals.slowT > 0 ? 0.55 : 1) * (armor && armor.slow ? armor.slow : 1);
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
    // slow regen once you've been out of a fight for a while, so the first
    // bear attempt isn't hopeless before you have any meat
    if (vitals.hp < vitals.max && vitals.sinceHit > 6) {
      vitals.regenT += dt;
      if (vitals.regenT >= 8) { vitals.regenT = 0; vitals.hp = Math.min(vitals.max, vitals.hp + 0.5); renderHUD(); markDirty(); }
    } else vitals.regenT = 0;
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
  updateShots(dt);
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

  // thrown water
  shots.forEach(s => {
    ctx.fillStyle = '#bfe3ff';
    ctx.fillRect(toX(s.x) - S, toY(s.y) - S, 3 * S, 3 * S);
    ctx.fillStyle = '#5aa8ff';
    ctx.fillRect(toX(s.x - s.vx * 0.02), toY(s.y - s.vy * 0.02), 2 * S, 2 * S);
    ctx.fillRect(toX(s.x - s.vx * 0.045), toY(s.y - s.vy * 0.045), S, S);
  });

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
    if (c.hp < c.def.hp || ['chase', 'windup', 'lunge', 'recover', 'scoop'].includes(c.state)) {
      const bw = 26, bx = toX(c.x - bw / 2), by = toY(top);
      ctx.fillStyle = 'rgba(10,10,14,0.85)';
      ctx.fillRect(bx, by, bw * S, 3 * S);
      ctx.fillStyle = '#e8343a';
      ctx.fillRect(bx + S, by + S, Math.round((bw - 2) * S * (c.hp / c.def.hp)), S);
    }
    if (c.state === 'windup' || c.state === 'scoop') {
      const mw = Math.round(fs * 0.9), mx = toX(c.x + (c.flip ? -16 : 16)) - mw / 2, my = toY(top - 2) - mw;
      ctx.fillStyle = c.state === 'scoop' ? '#3d8bff' : '#ff4d3d';
      ctx.fillRect(mx, my, mw, mw);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(c.state === 'scoop' ? '~' : '!', mx + mw / 2, my + mw / 2 + 1);
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
  if (e.button === 2) { eat(); return; }
  if (e.button !== 0) return;
  const tgt = targetAt(mouseWorld());
  if (tgt && tgt.type === 'station') {
    if (inReach(tgt)) openUI(tgt.st.kind);
    else toast('Too far', tgt.st.kind === 'craft' ? 'Crafting Table' : 'Furnace', 'Walk up to it first');
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
invWrap.addEventListener('mousedown', e => {
  const slot = e.target.closest('[data-ref]');
  if (slot) { e.preventDefault(); slotClick(slot.dataset.ref, e.button, e.shiftKey); return; }
  const fill = e.target.closest('[data-fill]');
  if (fill && e.button === 0) { e.preventDefault(); fillRecipe(RECIPES[+fill.dataset.fill]); return; }
  if (e.target.closest('[data-book]') && e.button === 0) { e.preventDefault(); bookOpen = !bookOpen; sfx.ui(); renderUI(); return; }
  if (e.target.closest('[data-close]')) { e.preventDefault(); closeUI(); return; }
  // clicking the dim backdrop closes it too
  if (e.target === invWrap) closeUI();
});
$('#hotbar').addEventListener('click', e => {
  const b = e.target.closest('[data-hotbar]');
  if (b) { selectSlot(+b.dataset.hotbar); if (e.detail) b.blur(); }
});
window.addEventListener('pagehide', () => { if (saveDirty) saveNow(); });

renderHUD();
renderQuest();

// the playable layer on top of the overworld: items, inventory, crafting, the
// furnace, mining, health, combat, and the meadows' creatures. it leans on the
// globals from resume-game.js (tiles, things, player, cam, toast, sfx and so on)
// so it has to load after that file.
//
// the meadows run is the first "action" chapter of the bigger plan (discovery,
// action, then the multiverse gate, plus a secret ending). the other biomes get
// their own chapters later, so everything here is data driven where it can be.

'use strict';

// dmg is in hearts, cd is seconds between swings, reach is in tiles. mine lists
// which material classes a tool is fast on, as a speed multiplier.
const ITEMS = {
  wood:             { name: 'Wood', fuel: 2 },
  stick:            { name: 'Stick', fuel: 0.5 },
  marble:           { name: 'Marble' },
  hide:             { name: 'Hide' },
  stone:            { name: 'Stone' },
  gold:             { name: 'Gold Ore' },
  diamond:          { name: 'Diamond' },
  ruby:             { name: 'Ruby' },
  emerald:          { name: 'Emerald' },
  iron:             { name: 'Iron Ore' },
  'raw-meat':       { name: 'Raw Meat', food: 0.5, cooksTo: 'cooked-meat' },
  'cooked-meat':    { name: 'Cooked Meat', food: 2 },
  dagger:           { name: 'Dagger', tool: true, dmg: 0.5, cd: 0.45, reach: 1.6 },
  'marble-sword':   { name: 'Marble Sword', tool: true, dmg: 2, cd: 0.45, reach: 1.8 },
  'marble-pickaxe': { name: 'Marble Pickaxe', tool: true, dmg: 1.5, cd: 0.9, reach: 1.7, mine: { stone: 6, ore: 6 } },
  'marble-axe':     { name: 'Marble Axe', tool: true, dmg: 2.5, cd: 1.8, reach: 1.7, mine: { wood: 5 } },
  'hide-armor':     { name: 'Hide Armor', armor: true }
};
// whatever you're holding that isn't a tool hits like a bare hand
const FIST = { name: 'Bare hands', dmg: 0.25, cd: 0.45, reach: 1.4 };
const STACK_MAX = 64;
const maxStack = id => (ITEMS[id].tool || ITEMS[id].armor ? 1 : STACK_MAX);

// seconds to break something with no bonus. the axe and pickaxe divide these.
const MINE_TIME = { wood: 2.4, stone: 5, ore: 8 };
const REACH_TILES = 2.6;      // how far away you can mine or open things
const ORE_ITEM = { [T.GOLD]: 'gold', [T.DIAMOND]: 'diamond', [T.RUBY]: 'ruby', [T.EMERALD]: 'emerald', [T.IRON]: 'iron' };
const STONE_TILES = new Set([T.STONE, T.PEAK, T.WALL, T.ICEROCK]);

// recipes are shapes inside the 5x5 table. a shape can sit anywhere in the
// grid and can be mirrored left to right, like minecraft. "." is an empty cell.
const RECIPES = [
  { out: 'marble-sword', n: 1, shape: ['M', 'M', 'S'], key: { M: 'marble', S: 'stick' } },
  { out: 'marble-pickaxe', n: 1, shape: ['MMM', '.S.', '.S.'], key: { M: 'marble', S: 'stick' } },
  { out: 'marble-axe', n: 1, shape: ['MM', 'MS', '.S'], key: { M: 'marble', S: 'stick' } },
  { out: 'hide-armor', n: 1, shape: ['HH.HH', 'HHHHH', '.HHH.', '.HHH.'], key: { H: 'hide' } },
  { out: 'stick', n: 4, shape: ['W'], key: { W: 'wood' } }
];

const COOK_RATE = 0.5;        // meat per second while the furnace has fuel

// dmg is [with armor, without]. ranges and aggro are in tiles.
const CREATURES = {
  hyena: {
    name: 'Marble Hyena', hp: 5, speed: 74, aggro: 7, leash: 16, range: 1.3,
    windup: 0.38, cooldown: 1.25, dmg: [0.5, 1], knock: 140, w: 38, h: 26, r: 10,
    rest: 'prowl', drops: [['marble', 5, 10]]
  },
  bear: {
    name: 'Grizzly', hp: 15, speed: 60, aggro: 4.5, leash: 11, range: 1.7,
    windup: 0.62, cooldown: 1.9, dmg: [1, 2.5], knock: 18, w: 50, h: 34, r: 14,
    rest: 'sleep', drops: [['hide', 15, 20], ['raw-meat', 10, 15]]
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
function pxBlob(G, cx, cy, rx, ry, colour) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) G.set(x, y, typeof colour === 'function' ? colour(x, y, dx, dy) : colour);
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

function makeIcon(id) {
  const G = pixelGrid(16, 16);
  const gem = pal => {
    [[8, 3, 11], [5, 6, 7], [11, 6, 7]].forEach(([cx, top, bot]) => {
      for (let y = top; y <= 13; y++) {
        const half = Math.min(2, (y - top) * 0.8);
        for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
          G.set(x, y, x < cx ? pal.light : x > cx ? pal.mid : pal.hi);
        }
      }
    });
  };
  switch (id) {
    case 'wood':
      for (let y = 6; y <= 11; y++) for (let x = 2; x <= 12; x++) G.set(x, y, y === 7 || y === 10 ? '#6e3a1e' : '#9a5230');
      pxBlob(G, 13, 8.5, 2, 3, (x, y, dx, dy) => (dx * dx + dy * dy < 0.35 ? '#a8703f' : '#dba56b'));
      break;
    case 'stick':
      pxLine(G, 3, 13, 12, 3, '#a0663a');
      pxLine(G, 4, 13, 13, 3, '#734522');
      break;
    case 'marble':
      pxBlob(G, 8, 9, 5.5, 4.5, (x, y, dx, dy) => (dy > 0.35 ? '#c9c3b8' : '#efebe4'));
      pxLine(G, 4, 8, 11, 11, '#8a95a3');
      G.set(9, 6, '#ffffff'); G.set(6, 7, '#ffffff');
      break;
    case 'stone':
      pxBlob(G, 8, 9, 5.5, 4.5, (x, y, dx, dy) => (hash2(x, y, 5) < 0.2 ? '#6a6a6a' : dy > 0.3 ? '#767676' : '#959595'));
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
      pxBlob(G, 9.5, 7, 4.5, 4, (x, y, dx, dy) => (dx + dy < -0.6 ? (raw ? '#f39aa0' : '#d18a4e') : raw ? '#d0505b' : '#94562b'));
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
    case 'marble-sword':
      pxLine(G, 6, 10, 14, 2, '#efebe4', 2);
      pxLine(G, 7, 11, 14, 4, '#bdb6aa');
      pxLine(G, 4, 9, 7, 12, '#4a4f58');
      pxLine(G, 2, 14, 5, 11, '#7a4a26', 2);
      break;
    case 'marble-pickaxe':
      pxLine(G, 3, 13, 11, 5, '#7a4a26', 2);
      [[3, 5], [5, 3], [8, 2], [11, 3], [13, 5], [14, 8]].reduce((a, b) => { pxLine(G, a[0], a[1], b[0], b[1], '#efebe4', 2); return b; });
      G.set(5, 4, '#bdb6aa'); G.set(13, 7, '#bdb6aa');
      break;
    case 'marble-axe':
      pxLine(G, 3, 13, 11, 5, '#7a4a26', 2);
      for (let y = 1; y <= 9; y++) {
        const span = Math.round(3.5 - Math.abs(y - 5) * 0.55);
        for (let x = 10; x <= 10 + span; x++) G.set(x, y, x === 10 + span ? '#bdb6aa' : '#efebe4');
      }
      break;
    case 'hide-armor':
      for (let y = 3; y <= 13; y++) for (let x = 2; x <= 13; x++) {
        const sleeve = y <= 8 && (x <= 3 || x >= 12);
        const body = x >= 4 && x <= 11;
        if (!sleeve && !body) continue;
        if (y === 3 && x >= 6 && x <= 9) continue;
        G.set(x, y, y === 10 ? '#4a2f1a' : x < 8 ? '#9a6638' : '#80522e');
      }
      [5, 7, 9].forEach(y => G.set(8, y, '#e2c79a'));
      break;
    default:
      if (CRYSTAL_PAL[id]) gem(CRYSTAL_PAL[id]);
      else if (id === 'gold') gem(CRYSTAL_PAL.gold);
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
  G.set(21, 1, '#9a9a9a'); G.set(22, 1, '#9a9a9a'); G.set(21, 3, '#9a9a9a'); G.set(22, 3, '#9a9a9a'); G.set(22, 2, '#9a9a9a');
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
    const arch = y < 15 ? Math.abs(x - 10.5) <= (y - 11) * 1.8 : true;
    if (!arch) continue;
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
  pxBlob(G, 9.5, 4, 7, 2.6, (x, y, dx, dy) => {
    const d = Math.sqrt(dx * dx + dy * dy);
    return d < 0.3 || (d > 0.55 && d < 0.7) ? '#a8703f' : '#e0ab70';
  });
  return G.outline(() => '#4a2412').canvas();
}

// the marble hyena: sloped back like a real hyena, veined white stone, red eye.
// frames 0-3 walk, pose 'atk' is the lunge with its mouth open.
function makeHyena(frame, pose) {
  const G = pixelGrid(40, 27);
  const C = { base: '#ece8e0', shade: '#cdc7bc', deep: '#a39c90', vein: '#8a95a3', mane: '#5d626b', spot: '#9e988c' };
  const ground = 25, atk = pose === 'atk', crouch = atk ? 2 : 0;
  const step = [[0, 1, 0, -1], [0, -1, 0, 1]];
  [[9, 0], [13, 1], [25, 1], [29, 0]].forEach(([lx, grp], n) => {
    const off = atk ? (n > 1 ? 2 : -1) : step[grp][frame % 4];
    for (let y = 15 + crouch; y <= ground; y++) {
      const x = lx + Math.round((off * (y - 15)) / 10);
      G.set(x, y, n < 2 ? C.deep : C.shade);
      G.set(x + 1, y, n < 2 ? C.shade : C.base);
    }
  });
  const spine = x => 12 + crouch - (x - 19) * 0.16;
  for (let y = 0; y < 27; y++) for (let x = 6; x <= 31; x++) {
    const dx = (x - 19) / 11.5, dy = (y - spine(x)) / 5.8;
    if (dx * dx + dy * dy > 1) continue;
    let col = dy > 0.35 ? C.shade : C.base;
    if (hash2(x >> 1, y >> 1, 3) < 0.13) col = C.spot;
    if (hash2(x, y, 7) < 0.06) col = C.vein;
    G.set(x, y, col);
  }
  for (let x = 13; x <= 27; x++) {
    const y = Math.round(spine(x) - 5.5);
    G.set(x, y, C.mane);
    if (x % 2) G.set(x, y - 1, C.mane);
  }
  [[8, 11], [7, 12], [6, 13], [5, 14], [5, 15], [4, 16]].forEach(([x, y]) => G.set(x, y + crouch, C.shade));
  G.set(3, 17 + crouch, C.mane); G.set(4, 17 + crouch, C.mane);
  const hx = atk ? 33 : 30, hy = (atk ? 11 : 8) + crouch;
  pxBlob(G, hx, hy, 4.6, 3.8, (x, y, dx, dy) => (dy > 0.4 ? C.shade : C.base));
  for (let x = hx + 3; x <= hx + 6; x++) for (let y = hy; y <= hy + 2; y++) G.set(x, y, y === hy + 2 ? C.shade : C.base);
  G.set(hx + 6, hy, '#262626');
  [[hx - 2, hy - 4], [hx - 2, hy - 5], [hx + 1, hy - 4], [hx + 1, hy - 5]].forEach(([x, y]) => G.set(x, y, C.mane));
  G.set(hx + 1, hy - 1, '#e3342b');
  if (atk) {
    for (let x = hx + 2; x <= hx + 6; x++) { G.set(x, hy + 2, '#3a1b1b'); G.set(x, hy + 3, x % 2 ? '#ffffff' : '#3a1b1b'); }
  }
  return G.outline(() => '#2c2d33').canvas();
}

// the grizzly: shoulder hump, pale muzzle, big pale claws. 'sleep' is lying
// down with its eyes shut.
function makeBear(frame, pose) {
  const G = pixelGrid(52, 36);
  const C = { base: '#7b4a29', shade: '#5a3419', light: '#9b643a', muzzle: '#c89b6b', claw: '#ece4d4' };
  const ground = 34, atk = pose === 'atk', sleep = pose === 'sleep';
  if (!sleep) {
    const step = [[0, 1, 0, -1], [0, -1, 0, 1]];
    [[10, 0], [17, 1], [32, 1], [38, 0]].forEach(([lx, grp], n) => {
      const lift = atk && n === 3 ? 5 : 0;
      const off = atk ? 0 : step[grp][frame % 4];
      for (let y = 22; y <= ground - lift; y++) {
        for (let k = 0; k < 4; k++) G.set(lx + k + Math.round((off * (y - 22)) / 12), y, n < 2 ? C.shade : k < 2 ? C.base : C.shade);
      }
      [0, 2].forEach(k => G.set(lx + k + off, ground - lift + 1, C.claw));
    });
  }
  const bodyY = sleep ? 25 : 18;
  pxBlob(G, 23, bodyY, 16, sleep ? 8 : 9.5, (x, y, dx, dy) => (dy < -0.45 ? C.light : dy > 0.4 ? C.shade : C.base));
  if (!sleep) pxBlob(G, 30, 12, 6.5, 5, (x, y, dx, dy) => (dy < -0.2 ? C.light : C.base));
  const hx = sleep ? 42 : atk ? 43 : 40, hy = sleep ? 27 : atk ? 17 : 15;
  pxBlob(G, hx, hy, 6.5, 6, (x, y, dx, dy) => (dy < -0.4 ? C.light : C.base));
  [[hx - 4, hy - 6], [hx + 2, hy - 6]].forEach(([x, y]) => pxBlob(G, x, y, 2, 2, C.shade));
  pxBlob(G, hx + 5, hy + 2, 3.2, 2.5, C.muzzle);
  G.set(hx + 8, hy + 1, '#1a1a1a'); G.set(hx + 8, hy + 2, '#1a1a1a');
  if (sleep) { G.set(hx + 1, hy - 1, '#2a170b'); G.set(hx + 2, hy - 1, '#2a170b'); }
  else G.set(hx + 2, hy - 2, '#140a05');
  if (atk) for (let x = hx + 4; x <= hx + 8; x++) { G.set(x, hy + 4, '#3a1010'); G.set(x, hy + 5, x % 2 ? '#ffffff' : '#3a1010'); }
  return G.outline(() => '#24140a').canvas();
}

function creatureFrames(kind) {
  const make = kind === 'hyena' ? makeHyena : makeBear;
  const walk = [0, 1, 2, 3].map(f => make(f, 'walk'));
  const set = { walk, atk: make(0, 'atk'), sleep: kind === 'bear' ? make(0, 'sleep') : walk[0] };
  set.white = new Map([...walk, set.atk, set.sleep].map(c => [c, whiteOf(c)]));
  return set;
}

const SAVE_KEY = 'dm-save';
const inv = { slots: new Array(24).fill(null), armor: null, sel: 0 };   // slots 0-5 are the hotbar
const craftGrid = new Array(25).fill(null);
const furnaceState = { input: null, fuel: null, output: null, burn: 0, prog: 0 };
const quest = { greatTree: false, chopped: [], mined: [], killed: {}, seen: {}, crafted: {} };
const vitals = { hp: 5, max: 5, invuln: 0, sinceHit: 99, regenT: 0, kx: 0, ky: 0, atkCD: 0, eatCD: 0 };
const creatures = [];
const stations = [];
const floats = [];
let ui = null;               // null, 'inv', 'craft' or 'furnace'
let heldStack = null;        // what's stuck to the cursor in the inventory
let mining = null;
const mouse = { x: 0, y: 0, down: false, inCanvas: false, touch: false };
let saveDirty = false, lastSave = 0, resetting = false;

inv.slots[0] = { id: 'dagger', n: 1 };

const validStack = s => (s && ITEMS[s.id] && s.n > 0 ? { id: s.id, n: Math.min(s.n, maxStack(s.id)) } : null);
function loadSave() {
  const data = store.read(SAVE_KEY, null);
  if (!data || data.v !== 1) return;
  if (Array.isArray(data.inv?.slots)) data.inv.slots.slice(0, 24).forEach((s, i) => { inv.slots[i] = validStack(s); });
  inv.armor = validStack(data.inv?.armor);
  inv.sel = clamp(data.inv?.sel | 0, 0, 5);
  if (data.quest) Object.assign(quest, data.quest);
  if (typeof data.hp === 'number') vitals.hp = clamp(data.hp, 0.5, vitals.max);
  if (data.furnace) {
    ['input', 'fuel', 'output'].forEach(k => { furnaceState[k] = validStack(data.furnace[k]); });
    furnaceState.burn = +data.furnace.burn || 0;
  }
}
function saveNow() {
  if (resetting) return;
  store.write(SAVE_KEY, { v: 1, inv, quest, hp: vitals.hp, furnace: furnaceState });
  saveDirty = false;
  lastSave = performance.now();
}
const markDirty = () => { saveDirty = true; };
function playResetting() { resetting = true; }

function addItem(id, n) {
  const max = maxStack(id);
  for (const s of inv.slots) {
    if (n <= 0) break;
    if (s && s.id === id && s.n < max) { const k = Math.min(max - s.n, n); s.n += k; n -= k; }
  }
  for (let i = 0; i < inv.slots.length && n > 0; i++) {
    if (!inv.slots[i]) { const k = Math.min(max, n); inv.slots[i] = { id, n: k }; n -= k; }
  }
  if (n > 0) toast('Bag full', `${n} ${ITEMS[id].name} lost`, 'Make some room in your inventory (E)');
  markDirty();
  renderHUD();
  if (ui) renderUI();
  return n;
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
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

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
  // keep its tile clear so you can't get stuck on it
  stations.push(st);
  things.push(st);
}

function spawnCreature(kind, tx, ty, opts = {}) {
  const def = CREATURES[kind];
  const [x, y] = nearestOpen(tx, ty);
  const c = {
    kind, def, frames: creatureFrames(kind), creature: true,
    hx: x * TILE + 8, hy: y * TILE + 12, x: x * TILE + 8, y: y * TILE + 12,
    hp: def.hp, state: def.rest, t: 0, cd: 0, anim: 0, flip: false, hurtT: 0, kx: 0, ky: 0,
    moving: false, wander: null, wanderT: 0, dormant: !!opts.dormant, gone: !!opts.dormant,
    draw: drawCreature
  };
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

// the hyena prowls the stretch between the great tree and glastonbury hs, but
// only shows up once the great tree has come down
const hyena = spawnCreature('hyena', 33, 61, { dormant: !quest.greatTree || quest.killed.hyena });
if (quest.killed.hyena) hyena.dead = true;
const bearDen = POIS.find(p => p.id === 'teachla-lead');
const bear = spawnCreature('bear', bearDen.at[0] + 3, bearDen.at[1] + 1);
if (quest.killed.bear) { bear.dead = true; bear.gone = true; }

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
const creatureCenter = c => ({ x: c.x, y: c.y - c.def.h * 0.4 });

function inArc(c, a, tool) {
  if (c.dead || c.gone) return false;
  const o = aimOrigin(), cc = creatureCenter(c);
  const d = Math.hypot(cc.x - o.x, cc.y - o.y) - c.def.r;
  if (d > tool.reach * TILE) return false;
  if (d < 6) return true;
  let diff = Math.atan2(cc.y - o.y, cc.x - o.x) - a;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) < 1.1;
}

function attack() {
  const tool = heldTool();
  if (vitals.atkCD > 0) return;
  vitals.atkCD = tool.cd;
  const a = aimAngle();
  faceAngle(a);
  player.swing = 0;
  sfx.swing();
  creatures.forEach(c => { if (inArc(c, a, tool)) hurtCreature(c, tool.dmg, a); });
}

function hurtCreature(c, dmg, a) {
  c.hp = Math.max(0, c.hp - dmg);
  c.hurtT = 0.16;
  // once it's winding up it's committed: hits still land but don't push it
  // back, otherwise you could juggle it out of range forever
  if (c.state !== 'windup') {
    c.kx = Math.cos(a) * c.def.knock;
    c.ky = Math.sin(a) * c.def.knock;
  }
  const cc = creatureCenter(c);
  floatText(`-${dmg}`, cc.x, cc.y - 10, '#ffd1d1');
  burst(cc.x, cc.y, c.kind === 'hyena' ? '236,232,224' : '123,74,41', 6);
  sfx.hit();
  if (c.state !== 'windup' && c.state !== 'recover') aggro(c);
  if (c.hp <= 0) killCreature(c);
}

function aggro(c) {
  if (c.state === 'chase' || c.dead) return;
  if (c.state === 'sleep') sfx.roar();
  c.state = 'chase';
  if (!quest.seen[c.kind]) {
    quest.seen[c.kind] = true;
    toast(c.kind === 'hyena' ? 'Ambush' : 'You woke it', c.def.name, c.kind === 'hyena' ? 'Left-click to fight. Back off when it rears up.' : 'Each swipe takes 2.5 hearts without armor');
    markDirty();
  }
}

function killCreature(c) {
  c.dead = true;
  c.gone = true;
  quest.killed[c.kind] = true;
  const cc = creatureCenter(c);
  burst(cc.x, cc.y, c.kind === 'hyena' ? '236,232,224' : '123,74,41', 26);
  sfx.found();
  let line = 0;
  c.def.drops.forEach(([id, a, b]) => { gain(id, rand(a, b), cc.x, cc.y - 14 - line * 10); line++; });
  toast('Defeated', c.def.name, c.kind === 'hyena' ? 'Marble can be crafted into tools at Base Camp' : 'Hide makes armor. Meat cooks in the furnace.');
  markDirty();
}

function hurtPlayer(c) {
  if (player.dead || vitals.invuln > 0) return;
  const dmg = c.def.dmg[inv.armor ? 0 : 1];
  vitals.hp = Math.max(0, vitals.hp - dmg);
  vitals.invuln = 0.8;
  vitals.sinceHit = 0;
  const a = Math.atan2(player.y - c.y, player.x - c.x);
  vitals.kx = Math.cos(a) * 190;
  vitals.ky = Math.sin(a) * 190;
  floatText(`-${dmg}`, player.x, player.y - 30, '#ff6b6b');
  sfx.hurt();
  const flash = $('#hurt-flash');
  flash.classList.remove('is-on');
  void flash.offsetWidth;
  flash.classList.add('is-on');
  if (vitals.hp <= 0) die();
  markDirty();
  renderHUD();
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
      if (d <= def.range * TILE && c.cd <= 0) { c.state = 'windup'; c.t = 0; c.flip = dx < 0; break; }
      if (d > def.range * TILE * 0.75) walk(player.x, player.y, def.speed);
      else c.flip = dx < 0;
      break;
    case 'windup':
      // the tell: it stops, flashes a "!" and then commits. step out of range
      // before it lands and the swipe whiffs.
      c.t += dt;
      if (c.t >= def.windup) {
        if (alive && d <= def.range * TILE * 1.2) hurtPlayer(c);
        c.state = 'recover';
        c.t = 0;
        c.cd = def.cooldown;
        sfx.bite();
      }
      break;
    case 'recover':
      c.t += dt;
      if (c.t > 0.45) c.state = alive ? 'chase' : 'return';
      break;
    case 'return':
      walk(c.hx, c.hy, def.speed * 0.8);
      c.hp = Math.min(def.hp, c.hp + dt * 2);
      if (homeD < 6) { c.state = def.rest; c.hp = def.hp; }
      else if (alive && d < def.aggro * TILE * 0.7 && homeD < def.leash * TILE * 0.6) c.state = 'chase';
      break;
  }
  if (c.moving) c.anim += dt;
}

function drawCreature(c, toX, toY, t) {
  const F = c.frames;
  let img = F.walk[0];
  if (c.state === 'sleep') img = F.sleep;
  else if (c.state === 'windup' || (c.state === 'recover' && c.t < 0.18)) img = F.atk;
  else if (c.moving) img = F.walk[Math.floor(c.anim * (c.kind === 'hyena' ? 10 : 7)) % 4];
  if (c.hurtT > 0) img = F.white.get(img) || img;
  const w = img.width, h = img.height;
  const shake = c.state === 'windup' ? Math.round(Math.sin(t / 20)) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(toX(c.x - w * 0.32), toY(c.y - 1), Math.round(w * 0.64 * S), 2 * S);
  const x = toX(c.x - Math.floor(w / 2) + shake), y = toY(c.y - h + 2);
  ctx.save();
  if (c.flip) { ctx.translate(x + w * S, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w * S, h * S); }
  else ctx.drawImage(img, x, y, w * S, h * S);
  ctx.restore();
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
    return { type: 'tile', tx, ty, key: `tile:${idx(tx, ty)}`, cx: tx * TILE + 8, cy: ty * TILE + 8, cls: ORE_ITEM[tile] ? 'ore' : 'stone' };
  }
  return null;
}
const inReach = tgt => tgt && Math.hypot(tgt.cx - player.x, tgt.cy - (player.y - 8)) <= REACH_TILES * TILE;

// how long this would take with what you're holding, or Infinity if it's locked
function mineTime(tgt) {
  if (tgt.type === 'tree' && !tgt.great && !quest.greatTree) return Infinity;
  const tool = heldTool();
  const bonus = (tool.mine && tool.mine[tgt.cls]) || 1;
  return (MINE_TIME[tgt.cls] * (tgt.great ? 1.6 : 1)) / bonus;
}

let lockHintT = 0;
function mineStep(tgt, dt) {
  const need = mineTime(tgt);
  if (need === Infinity) {
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
    mining = { key: tgt.key, t: 0, need, thing: tgt.thing, tgt };
  }
  mining.need = need;
  mining.t += dt;
  if (tgt.thing) tgt.thing.shake = 1;
  if (player.swing < 0) {
    player.swing = 0;
    faceAngle(Math.atan2(tgt.cy - (player.y - 10), tgt.cx - player.x));
    sfx.chip();
    const rgb = tgt.cls === 'wood' ? '160,102,58' : tgt.cls === 'ore' ? '200,200,200' : '140,140,140';
    burst(tgt.cx, tgt.cy, rgb, 3);
  }
  if (mining.t >= need) breakTarget(tgt);
}

function breakTarget(tgt) {
  if (tgt.thing) tgt.thing.shake = 0;
  mining = null;
  sfx.crunch();
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
    const was = tiles[i];
    tiles[i] = baseOf(i);
    reach[i] = 1;
    quest.mined.push(i);
    repaintAround(tgt.tx, tgt.ty);
    paintMinimap();
    burst(tgt.cx, tgt.cy, '140,140,140', 12);
    gain(ORE_ITEM[was] || 'stone', 1, tgt.cx, tgt.cy - 8);
  }
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
  if (!toBag) {
    if (heldStack && (heldStack.id !== r.out || heldStack.n + r.n > maxStack(r.out))) return false;
  }
  craftGrid.forEach((s, i) => { if (s) { s.n--; if (!s.n) craftGrid[i] = null; } });
  if (toBag) addItem(r.out, r.n);
  else heldStack = heldStack ? { id: r.out, n: heldStack.n + r.n } : { id: r.out, n: r.n };
  if (!quest.crafted[r.out]) {
    quest.crafted[r.out] = true;
    toast('Crafted', ITEMS[r.out].name, ITEMS[r.out].tool ? `${ITEMS[r.out].dmg} hearts per hit` : ITEMS[r.out].armor ? 'Put it in your armor slot (E)' : '');
  }
  sfx.craft();
  markDirty();
  return true;
}
// "fill" in the recipe book: pull the ingredients from your bag into the grid
function fillRecipe(r) {
  craftGrid.forEach((s, i) => { if (s) { addItem(s.id, s.n); craftGrid[i] = null; } });
  const need = {};
  r.shape.forEach(row => [...row].forEach(ch => { if (ch !== '.') need[r.key[ch]] = (need[r.key[ch]] || 0) + 1; }));
  const missing = Object.entries(need).filter(([id, n]) => countItem(id) < n);
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
    renderUI();
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
    if (button === 2) {
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
  markDirty();
  renderUI();
  renderHUD();
}

// shift click moves things between your bag and whatever station is open
// (or between your bag and the armor slot)
function quickMove(ref, cur) {
  const box = ref.split(':')[0];
  if (box === 'inv') {
    let dest = null;
    if (ITEMS[cur.id].armor && !inv.armor) dest = 'armor:0';
    else if (ui === 'furnace') dest = cur.id === 'raw-meat' ? 'input' : ITEMS[cur.id].fuel ? 'fuel' : null;
    else if (ui === 'craft' && !ITEMS[cur.id].food) {
      const free = craftGrid.findIndex(s => !s);
      if (free >= 0) dest = `craft:${free}`;
    }
    if (!dest) { hint(slotRefuses(ui === 'furnace' ? 'input' : 'craft', cur.id) || 'Nowhere to put that'); return; }
    const there = slotGet(dest);
    if (!there) { slotSet(dest, cur); slotSet(ref, null); }
    else if (there.id === cur.id) {
      const k = Math.min(maxStack(cur.id) - there.n, cur.n);
      there.n += k; cur.n -= k;
      if (!cur.n) slotSet(ref, null);
    }
  } else {
    slotSet(ref, null);
    const left = addItem(cur.id, cur.n);
    if (left) slotSet(ref, { id: cur.id, n: left });
  }
  sfx.ui();
  markDirty();
  renderHUD();
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

function slotHTML(ref, stack, extra = '') {
  const it = stack && ITEMS[stack.id];
  const label = it ? `${it.name}${stack.n > 1 ? ` ×${stack.n}` : ''}` : 'Empty';
  return `<button type="button" class="slot ${extra}" data-ref="${ref}" title="${label}" aria-label="${label}">
    ${it ? `<i style="background-image:url(${ICON[stack.id]})"></i>${stack.n > 1 ? `<b>${stack.n}</b>` : ''}` : ''}
  </button>`;
}

function openUI(kind) {
  ui = kind;
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
  if (heldStack) { addItem(heldStack.id, heldStack.n); heldStack = null; }
  craftGrid.forEach((s, i) => { if (s) { addItem(s.id, s.n); craftGrid[i] = null; } });
  ui = null;
  invWrap.hidden = true;
  heldEl.hidden = true;
  document.body.classList.remove('inv-open');
  markDirty();
  renderHUD();
}

function stationHTML() {
  if (ui === 'craft') {
    const r = matchRecipe();
    const book = RECIPES.map((rec, n) => {
      const cells = [];
      const w = Math.max(...rec.shape.map(row => row.length));
      for (let y = 0; y < rec.shape.length; y++) for (let x = 0; x < w; x++) {
        const ch = rec.shape[y][x] || '.';
        cells.push(`<span style="grid-row:${y + 1};grid-column:${x + 1}">${ch === '.' ? '' : `<i style="background-image:url(${ICON[rec.key[ch]]})"></i>`}</span>`);
      }
      return `<li class="rb-item">
        <span class="rb-shape" style="grid-template-columns:repeat(${w},12px)">${cells.join('')}</span>
        <span class="rb-name"><i style="background-image:url(${ICON[rec.out]})"></i>${ITEMS[rec.out].name}${rec.n > 1 ? ` ×${rec.n}` : ''}</span>
        <button type="button" class="rb-fill" data-fill="${n}">Fill</button>
      </li>`;
    }).join('');
    return `<div class="st-craft">
      <div class="craft-grid">${craftGrid.map((s, i) => slotHTML(`craft:${i}`, s)).join('')}</div>
      <span class="craft-arrow" aria-hidden="true">▶</span>
      ${slotHTML('out:0', r ? { id: r.out, n: r.n } : null, `slot-out${r ? ' is-ready' : ''}`)}
      <div class="recipe-book"><p class="rb-title">Recipes</p><ul>${book}</ul></div>
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
  const title = { inv: 'Inventory', craft: 'Crafting Table', furnace: 'Furnace' }[ui];
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
            <div><dt>Armor</dt><dd>${inv.armor ? ITEMS[inv.armor.id].name : 'None'}</dd></div>
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
  $('#hearts').innerHTML = hearts.join('') + (inv.armor ? `<span class="hud-armor" title="Hide armor equipped"><i style="background-image:url(${ICON[inv.armor.id]})"></i></span>` : '');
  $('#hearts').setAttribute('aria-label', `Health ${vitals.hp} of ${vitals.max}`);
  $('#hotbar').innerHTML = inv.slots.slice(0, 6).map((s, i) => `
    <button type="button" class="hb-slot${i === inv.sel ? ' is-sel' : ''}" data-hotbar="${i}" title="${s ? ITEMS[s.id].name : 'Empty'}">
      <span class="hb-key">${i + 1}</span>
      ${s ? `<i style="background-image:url(${ICON[s.id]})"></i>${s.n > 1 ? `<b>${s.n}</b>` : ''}` : ''}
    </button>`).join('');
  const s = heldItem();
  $('#held-name').textContent = s ? `${ITEMS[s.id].name}${ITEMS[s.id].food ? ' · right-click to eat' : ''}` : 'Bare hands';
}

function selectSlot(i) {
  inv.sel = (i + 6) % 6;
  mining = null;
  renderHUD();
  markDirty();
}

const marbleWeapon = () => ['marble-sword', 'marble-axe', 'marble-pickaxe'].some(id => quest.crafted[id]);
const QUEST_STEPS = [
  { done: () => found.has('ucla'), title: 'Find the Great Tree', sub: 'It stands alone in the Meadows, west of Base Camp' },
  { done: () => quest.greatTree, title: 'Fell the Great Tree', sub: 'Hold left-click on it with your dagger' },
  { done: () => quest.killed.hyena, title: () => (quest.seen.hyena ? 'Defeat the marble hyena' : 'Find the next landmark'), sub: () => (quest.seen.hyena ? 'Back off when it rears up, then strike' : 'Every tree can be chopped now. Something prowls the grass...') },
  { done: marbleWeapon, title: 'Craft a marble weapon', sub: 'Left-click the crafting table at Base Camp' },
  { done: () => quest.killed.bear, title: 'Slay the grizzly', sub: 'Its den is in the far southwest of the Meadows' },
  { done: () => quest.crafted['hide-armor'], title: 'Craft hide armor', sub: 'Then cook the meat in the camp furnace' },
  { done: () => false, title: 'Meadows cleared', sub: 'The other biomes open up in the next patch' }
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
  pickup: () => tone(980, 0.05, 'square', 0.025),
  eat:    () => { noiseBurst(0.06, 1200, 0.08); setTimeout(() => noiseBurst(0.06, 1200, 0.08), 110); },
  craft:  () => { tone(520, 0.06); tone(780, 0.06, 'square', 0.035, 0.06); tone(1040, 0.1, 'square', 0.035, 0.12); },
  bite:   () => noiseBurst(0.1, 600, 0.12),
  roar:   () => { tone(80, 0.5, 'sawtooth', 0.06); tone(60, 0.6, 'sawtooth', 0.05, 0.1); },
  die:    () => { tone(330, 0.15, 'triangle', 0.05); tone(247, 0.15, 'triangle', 0.05, 0.15); tone(165, 0.35, 'triangle', 0.05, 0.3); }
});

function playFrozen() { return ui !== null || player.dead; }

let questT = 0, tipShown = false;
function playUpdate(dt, t) {
  if (!started) return;
  vitals.invuln = Math.max(0, vitals.invuln - dt);
  vitals.atkCD -= dt;
  vitals.eatCD -= dt;
  vitals.sinceHit += dt;
  lockHintT -= dt;
  player.blink = vitals.invuln > 0 && !player.dead && Math.floor(t / 90) % 2 === 0;

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
  }

  creatures.forEach(c => updateCreature(c, dt));
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
    canvas.style.cursor = tgt && inReach(tgt) && mineTime(tgt) !== Infinity ? 'pointer' : 'crosshair';
  }
}

function playRenderOverlay(toX, toY, t) {
  if (!started) return;
  const fs = Math.max(16, 8 * Math.round((S * 5.3) / 8));

  // target outline + mining progress
  if (!ui && !player.dead && mouse.inCanvas && !mouse.touch) {
    const tgt = targetAt(mouseWorld());
    if (tgt) {
      const ok = inReach(tgt) && mineTime(tgt) !== Infinity;
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
    ctx.fillStyle = '#ffd23f';
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
    const top = c.y - c.def.h - 4;
    if (c.hp < c.def.hp || c.state === 'chase' || c.state === 'windup' || c.state === 'recover') {
      const bw = 26, bx = toX(c.x - bw / 2), by = toY(top);
      ctx.fillStyle = 'rgba(10,10,14,0.85)';
      ctx.fillRect(bx, by, bw * S, 3 * S);
      ctx.fillStyle = '#e8343a';
      ctx.fillRect(bx + S, by + S, Math.round((bw - 2) * S * (c.hp / c.def.hp)), S);
    }
    if (c.state === 'windup') {
      const mw = Math.round(fs * 0.9), mx = toX(c.x) - mw / 2, my = toY(top - 6) - mw;
      ctx.fillStyle = '#ff4d3d';
      ctx.fillRect(mx, my, mw, mw);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('!', mx + mw / 2, my + mw / 2 + 1);
    }
    if (c.state === 'sleep' && !reduceMotion) {
      const k = (t / 1000) % 2;
      ctx.fillStyle = `rgba(255,255,255,${1 - k / 2})`;
      ctx.fillText('z', toX(c.x + 14 + k * 4), toY(top + 6 - k * 8));
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

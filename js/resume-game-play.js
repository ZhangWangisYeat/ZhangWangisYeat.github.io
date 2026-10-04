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

// ranked weakest to strongest: wood = gold, stone, marble (a hair stronger
// than stone), iron, emerald, diamond. gold hits like wood and mines the fastest of anything, but it has
// the worst durability. harvest is how hard an ore a pickaxe can actually
// collect: below iron you can't get anything out of the precious ores, and
// wood can't even get iron out (gold can).
const TIERS = {
  wood:    { name: 'Wood',    dur: 24,  speed: 2,  sword: 1,   axe: 1.5, pick: 1,   harvest: 0 },
  gold:    { name: 'Gold',    dur: 10,  speed: 14, sword: 1,   axe: 1.5, pick: 1,   harvest: 1 },
  stone:   { name: 'Stone',   dur: 48,  speed: 4,  sword: 2,   axe: 2.5, pick: 1.5, harvest: 1 },
  marble:  { name: 'Marble',  dur: 48,  speed: 4,  sword: 2.25, axe: 2.75, pick: 1.75, harvest: 1 },
  iron:    { name: 'Iron',    dur: 96,  speed: 6,  sword: 3,   axe: 3.5, pick: 2,   harvest: 2 },
  emerald: { name: 'Emerald', dur: 160, speed: 8,  sword: 3.5, axe: 4,   pick: 2.5, harvest: 3 },
  diamond: { name: 'Diamond', dur: 250, speed: 10, sword: 4,   axe: 4.5, pick: 3,   harvest: 4 }
};
const TIER_ORDER = ['wood', 'gold', 'stone', 'marble', 'iron', 'emerald', 'diamond'];

// armor blocks a flat percentage of every hit. hide keeps the bear at 1 heart
// a swipe, which is what it was tuned around. iron slows you down, gold shines.
// dur is how many hits it soaks before breaking. the metals and gems borrow the
// number from their tools so a gold chestplate is as flimsy as a gold pickaxe,
// and wool and hide don't have tools so they get their own (hide sits with stone).
const ARMORS = {
  wool:    { name: 'Wool',    block: 0.2,  dur: 16 },
  gold:    { name: 'Gold',    block: 0.4,  dur: TIERS.gold.dur, shine: true },
  hide:    { name: 'Hide',    block: 0.6,  dur: 48 },
  iron:    { name: 'Iron',    block: 0.7,  dur: TIERS.iron.dur, slow: 0.85 },
  emerald: { name: 'Emerald', block: 0.8,  dur: TIERS.emerald.dur },
  diamond: { name: 'Diamond', block: 0.85, dur: TIERS.diamond.dur }
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
  dagger:        { name: 'Dagger', tool: 'dagger', dmg: 0.5, cd: 0.45, reach: 1.5 },
  snowball:      { name: 'Snowball', throw: true },
  feather:       { name: 'Feather' },
  string:        { name: 'String' },
  // off a zombie. a little hunger, and it might cost you up to a heart
  'poison-meat': { name: 'Poisoned Meat', food: 0.5, sat: 0, poison: true },
  // the bow fires the best arrows in your bag: hold right click to draw it,
  // let go to loose. its dmg is only for whacking something with it up close.
  bow:           { name: 'Bow', tool: 'bow', ranged: true, dmg: 0.25, cd: 0.8, reach: 1.4, dur: 120 }
};
TIER_ORDER.forEach(m => {
  const t = TIERS[m];
  ITEMS[`${m}-sword`] = { name: `${t.name} Sword`, tool: 'sword', mat: m, dmg: t.sword, cd: 0.45, reach: 2.2, dur: t.dur };
  ITEMS[`${m}-pickaxe`] = { name: `${t.name} Pickaxe`, tool: 'pickaxe', mat: m, dmg: t.pick, cd: 0.9, reach: 1.6, dur: t.dur, speed: t.speed, harvest: t.harvest };
  ITEMS[`${m}-axe`] = { name: `${t.name} Axe`, tool: 'axe', mat: m, dmg: t.axe, cd: 1.8, reach: 1.6, dur: t.dur, speed: t.speed };
});
// armor comes in four pieces. a full set of one material blocks that
// material's percentage, and each piece carries its share of it: the helmet
// and boots the least (and the same as each other), the leggings a bit more,
// and the chestplate the rest. every piece has the material's durability.
const ARMOR_SLOTS = [
  { key: 'head', piece: 'helmet', name: 'Helmet', share: 0.15 },
  { key: 'chest', piece: 'chestplate', name: 'Chestplate', share: 0.45 },
  { key: 'legs', piece: 'leggings', name: 'Leggings', share: 0.25 },
  { key: 'feet', piece: 'boots', name: 'Boots', share: 0.15 }
];
const SLOT_OF = Object.fromEntries(ARMOR_SLOTS.map(a => [a.key, a]));
// the marble sword is polished stone and shows it: a glossy icon, a glint in
// the hotbar and inventory, and a sparkle running up the blade in your hand
ITEMS['marble-sword'].shiny = true;
Object.keys(ARMORS).forEach(m => ARMOR_SLOTS.forEach(a => {
  ITEMS[`${m}-${a.piece}`] = { name: `${ARMORS[m].name} ${a.name}`, armor: m, slot: a.key, mat: m, dur: ARMORS[m].dur };
}));
// arrows, weakest to strongest. this is what one does fired from a full draw,
// point blank (a part drawn bow does less, see BOW). it grows very slightly the
// farther the arrow flies, up to 15% more at ARROW_FULL tiles.
const ARROW_DMG = { wood: 0.5, gold: 0.5, stone: 0.75, marble: 0.85, iron: 1, emerald: 1.25, diamond: 1.5 };
const ARROW_RANGE = 12, ARROW_FULL = 10;
TIER_ORDER.forEach(m => { ITEMS[`${m}-arrow`] = { name: `${TIERS[m].name} Arrow`, arrow: m, adm: ARROW_DMG[m] }; });
// the machine that holds a wormhole open takes four parts. only the first one
// exists so far (it makes the exotic matter, the negative mass that keeps the
// throat from collapsing). every part is called ??? until you've collected all
// four, and the real names are still to come, so they're ??? here too for now.
const MACHINE_PARTS = 4;
const PART_NAMES = { 'exotic-core': '???' };
function partsComplete() { return (quest.parts || []).length >= MACHINE_PARTS; }
ITEMS['exotic-core'] = { part: true, get name() { return partsComplete() ? PART_NAMES['exotic-core'] : '???'; } };
// the forest's heart is what powers the core. a forest guardian very rarely
// has one, and you only ever get the one. unlike the core it has a name you
// can see from the start, because that's what alex called it.
ITEMS['forest-heart'] = { part: true, name: 'Forest\'s Heart' };
// moe's drill, off moe the mole. hold right click and it spins up (see
// tickDrill). that's the only thing it does: left click with it in your hand
// does nothing at all, and it never hurts a creature. it never wears out and
// takes anything
// an emerald pickaxe can. stone and trees go in a blink, but the harder the
// ore the longer it grinds (oreSpeed): iron is still quick, diamond is about as
// slow as an iron pickaxe. it just packs snow down, so that's still a job for
// your hands.
ITEMS['moe-drill'] = {
  name: 'Moe\'s Drill', tool: 'drill', speed: 20, treeSpeed: 8, harvest: TIERS.emerald.harvest,
  oreSpeed: { 'iron-ore': 14, 'gold-ore': 11, ruby: 10, emerald: 9, diamond: TIERS.iron.speed }
};
// darryl's things (see js/resume-game-race.js). the key is his own arm, popped
// off when you beat him in the race, and it opens the big door at the end of
// the track. the map is what he drops when he runs off from the core. both
// are one of a kind, so they never despawn (keep).
ITEMS['bone-key'] = { name: 'Bone Key', keep: true };
ITEMS['old-map'] = { name: 'Crumpled Map', keep: true };
// whatever you're holding that isn't a tool hits like a bare hand
const FIST = { name: 'Bare hands', dmg: 0.25, cd: 0.45, reach: 1.4 };
const STACK_MAX = 64;
const maxStack = id => (ITEMS[id].tool || ITEMS[id].armor || ITEMS[id].place || ITEMS[id].part || ITEMS[id].keep ? 1 : ITEMS[id].throw ? 100 : STACK_MAX);

// mining: seconds with no bonus. stone and ore only drop for a pickaxe that's
// up to it; anything else takes longer and the block crumbles to nothing.
// trees want an axe: any other tool gets there slowly, bare hands (or a
// fistful of something) take ages. snow comes up with anything.
const MINE_TIME = { wood: 2.4, stone: 5, ore: 8, snow: 0.8 };
const NO_HARVEST_SLOW = 3;
const TREE_TOOL_SLOW = 3, TREE_HAND_SLOW = 5;
const REACH_TILES = 2.6;
// things you click once rather than hold down on
const CLICK_ONLY = new Set(['station', 'building', 'part']);
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
const ARMOR_SHAPES = { helmet: ['MMM', 'M.M'], chestplate: ['M.M', 'MMM', 'MMM'], leggings: ['MMM', 'M.M', 'M.M'], boots: ['M.M', 'M.M'] };
Object.keys(ARMORS).forEach(m => Object.entries(ARMOR_SHAPES).forEach(([piece, shape]) => {
  RECIPES.push({ out: `${m}-${piece}`, shape, key: { M: m } });
}));
RECIPES.push({ out: 'bed', shape: ['WWW', 'PPP'], key: { W: 'wool', P: 'wood' } });
RECIPES.push({ out: 'stick', n: 4, shape: ['W'], key: { W: 'wood' } });
// two arrows a craft: the material on the tip, a stick, a feather
TIER_ORDER.forEach(m => RECIPES.push({ out: `${m}-arrow`, n: 2, shape: ['M', 'S', 'F'], key: { M: m, S: 'stick', F: 'feather' } }));
// pulling a bit of wool apart on the table gives string, and string on a
// curve of wood makes the bow
RECIPES.push({ out: 'string', n: 3, shape: ['W'], key: { W: 'wool' } });
RECIPES.push({ out: 'bow', shape: ['.WS', 'W.S', '.WS'], key: { W: 'wood', S: 'string' } });
RECIPES.forEach(r => { r.n = r.n || 1; r.mats = [...new Set(Object.values(r.key))]; });

const COOK_RATE = 0.5;        // meat per second while the furnace has fuel

// dmg is in hearts before armor. distances are in tiles. box is the body
// hitbox in world px: touch it and you get hurt, lunge or not. windup is the
// crouch before a lunge (your window to sidestep) and cooldown is the wait
// before it can lunge again. the bear is still the quicker of the two.
const CREATURES = {
  hyena: {
    name: 'Marble Hyena', hp: 5, speed: 60, aggro: 8, leash: 24, range: 2.4, roam: 5,
    windup: 0.6, lunge: { speed: 220, time: 0.24 }, cooldown: 1.9, dmg: 1,
    knock: 140, h: 28, box: { w: 26, h: 14 }, rest: 'prowl', regen: 0.04, chip: '242,238,231',
    drops: [['marble', 5, 10]], intro: ['Ambush', 'It crouches before it leaps. Sidestep, then strike.']
  },
  bear: {
    name: 'Grizzly', hp: 15, speed: 74, aggro: 5, leash: 22, range: 2.8,
    windup: 0.55, lunge: { speed: 270, time: 0.28 }, cooldown: 1.7, dmg: 2.5,
    knock: 18, h: 36, box: { w: 36, h: 20 }, rest: 'sleep',
    regen: 0.06, chip: '123,74,41',
    drops: [['hide', 15, 20]], intro: ['You woke it', 'He does quite a bit of damage. Maybe use water to avoid the lunge.']
  },
  // night only, and they don't count bosses toward the cap. both have most
  // of the hyena's health. zombies shamble at you and burn up in the
  // daylight; a burning one sets you alight if it touches you. forest
  // guardians keep their distance and throw poison tipped sticks.
  zombie: {
    name: 'Zombie', hp: 4.5, speed: 40, aggro: 12, leash: 80, range: 1.6,
    windup: 0.45, lunge: { speed: 150, time: 0.18 }, cooldown: 1.3, dmg: 1,
    knock: 120, h: 30, box: { w: 14, h: 22 }, rest: 'prowl', regen: 0, chip: '111,174,90',
    nightly: true, burns: true, drops: [['poison-meat', 0, 2]],
    intro: ['Night', 'They burn up when the sun rises. Don\'t let its flames graze you.']
  },
  guardian: {
    name: 'Forest Guardian', hp: 4, speed: 46, aggro: 11, leash: 80, dmg: 0.5,
    knock: 110, h: 36, box: { w: 16, h: 26 }, rest: 'prowl', regen: 0, chip: '138,96,52',
    nightly: true, shooter: { range: 7.5, keep: 4, cd: 2.4, speed: 190, dmg: 0.5, poison: 2 },
    // the fourth number is a drop chance: 3% for the heart, and it stops
    // dropping once you have it
    drops: [['stick', 1, 3], ['forest-heart', 1, 1, 0.03]], intro: ['Night', 'Watch out for the poison...']
  },
  // the mines. moles wait under the floor of their burrows and come up when
  // you get close; about as tough as the hyena (they were 6 hp with a 1.25
  // heart bite, which alex found too much with two or three at once). moe the
  // mole is the first boss (updateMoe runs him): six times the
  // grizzly's health, 3 hearts if his drill lunge catches you, and 5 if he
  // comes up out of the floor right under you.
  mole: {
    name: 'Mole', hp: 5, speed: 62, aggro: 3.5, leash: 99, range: 2.2, minion: true,
    windup: 0.5, lunge: { speed: 240, time: 0.22 }, cooldown: 1.5, dmg: 1,
    knock: 120, h: 20, box: { w: 20, h: 12 }, rest: 'burrowed', regen: 0.04, chip: '120,104,150',
    drops: [['iron-ore', 0, 1]], intro: ['Ambush', 'Ugly moles. Mind the teeth.']
  },
  moe: {
    name: 'Moe the Mole', boss: true, steady: true, hp: 90, speed: 36, knock: 0, h: 50, box: { w: 34, h: 26 },
    windup: 0.7, lunge: { speed: 320, time: 0.32 }, dmg: 1, lungeDmg: 3, popDmg: 5, drillDmg: 4, regen: 0, rest: 'wait',
    chip: '106,91,130', drops: []
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
    knock: 110, regen: 0.05, chip: '251,250,246', count: 3, drops: [['raw-chicken', 1, 1], ['feather', 0, 2]]
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
// the marble sword: a pale blade with a hard white edge of light along it, a
// thin blue-grey vein through the middle, a cool sheen on the far edge and a
// bright point at the tip
function marbleSwordIcon(G) {
  swordIcon(G, ['#f4f1ea', '#e2ddd4', '#c3cedc']);
  pxLine(G, 6, 10, 14, 2, '#ffffff');
  [[9, 8, '#9fb0c6'], [11, 6, '#9fb0c6'], [12, 5, '#b8c6d8'], [8, 9, '#dfe6f0']].forEach(([x, y, c]) => G.set(x, y, c));
  G.set(15, 1, '#ffffff');
  G.set(14, 1, '#e6f2ff');
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
function helmetIcon(G, P) {
  for (let y = 3; y <= 11; y++) for (let x = 3; x <= 12; x++) {
    if (y === 3 && (x < 5 || x > 10)) continue;
    if (y === 4 && (x < 4 || x > 11)) continue;
    // the face opening, with cheek guards down either side
    if (y >= 8 && x >= 6 && x <= 9) continue;
    if (y >= 10 && (x === 5 || x === 10)) continue;
    G.set(x, y, y === 7 ? P[2] : x < 8 && y < 7 ? P[0] : P[1]);
  }
}
function leggingsIcon(G, P) {
  for (let y = 2; y <= 13; y++) for (let x = 3; x <= 12; x++) {
    if (y >= 6 && x >= 7 && x <= 8) continue;
    G.set(x, y, y <= 3 ? P[2] : x < 7 ? P[0] : P[1]);
  }
  G.set(7, 3, P[0]); G.set(8, 3, P[0]);
}
function bootsIcon(G, P) {
  [[2, 1], [9, 1]].forEach(([x0, toe]) => {
    for (let y = 6; y <= 12; y++) for (let x = x0; x <= x0 + 3; x++) G.set(x, y, y === 6 ? P[2] : x === x0 ? P[0] : P[1]);
    for (let x = x0 + 3; x <= x0 + 4 + toe; x++) { G.set(x, 11, P[1]); G.set(x, 12, P[2]); }
    for (let x = x0; x <= x0 + 4 + toe; x++) G.set(x, 13, P[2]);
  });
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
// the bow, one shape for its icon and for the bow you draw, so they're the
// same bow: wooden limbs curving back from a dark grip to dark tips, and the
// string from tip to tip, pulled back by `pull`. it faces along (ux, uy) with
// the grip at (gx, gy), and plot(x, y, colour) puts down one pixel. hands back
// where the nock is, for the arrow.
const BOW_L = 6.5, BOW_BEND = 3.5;
function bowShape(plot, gx, gy, ux, uy, L, bend, pull) {
  const vx = -uy, vy = ux;
  const limb = t => [gx + vx * L * t - ux * bend * t * t, gy + vy * L * t - uy * bend * t * t];
  const line = (x0, y0, x1, y1, col) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let i = 0; i <= n; i++) plot(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col);
  };
  const [ax, ay] = limb(-1), [bx, by] = limb(1);
  const nock = [gx - ux * (bend + pull), gy - uy * (bend + pull)];
  line(ax, ay, nock[0], nock[1], '#f2efe8');
  line(bx, by, nock[0], nock[1], '#f2efe8');
  for (let t = -1; t <= 1.001; t += 0.06) {
    const [x, y] = limb(t);
    plot(x, y, Math.abs(t) < 0.2 ? '#3b2412' : Math.abs(t) > 0.85 ? '#6b4020' : '#b07a42');
  }
  return nock;
}
function arrowIcon(G, P) {
  pxLine(G, 3, 13, 11, 5, HANDLE[0]);
  [[2, 12], [3, 14], [1, 12], [3, 15]].forEach(([x, y]) => G.set(x, y, '#f2efe8'));
  [[2, 13], [4, 14]].forEach(([x, y]) => G.set(x, y, '#d6d0c4'));
  [[12, 4, 0], [13, 3, 0], [14, 2, 0], [11, 4, 2], [12, 5, 2], [12, 3, 1], [13, 4, 1], [11, 3, 1], [13, 5, 2]].forEach(([x, y, k]) => G.set(x, y, P[k]));
}
function gemIcon(G, pal) {
  [[8, 3], [5, 6], [11, 6]].forEach(([cx, top]) => {
    for (let y = top; y <= 13; y++) {
      const half = Math.min(2, (y - top) * 0.8);
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) G.set(x, y, x < cx ? pal.light : x > cx ? pal.mid : pal.hi);
    }
  });
}

// the exotic matter core: an upright chrome torus around a pocket of nothing.
// the band is lit from the top left, a seam of light runs round the middle of
// it (cyan going one way, violet the other), and the hole in the middle is the
// negative mass itself, darker than anything else in the game, with light
// smeared round its rim like it's being bent in. a sleek base clamps it upright.
function coreArt(G, cx, cy, rx, ry, base) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1) continue;
    let col;
    if (d > 0.62) {
      const lit = -(dx * 0.7 + dy * 0.7);
      col = lit > 0.35 ? '#f4f8ff' : lit > -0.15 ? '#cdd5e1' : lit > -0.5 ? '#9aa4b5' : '#6b7486';
      if (d > 0.76 && d < 0.88) col = dx < 0 ? '#7ff7ff' : '#c08bff';
    } else if (d > 0.5) col = dx + dy < -0.3 ? '#e6d4ff' : '#3a1a6e';
    else col = '#05010d';
    G.set(x, y, col);
  }
  G.set(cx, cy, '#ffd6ff');
  if (!base) return;
  const by = Math.round(cy + ry) + 1;
  for (let x = Math.round(cx - rx * 0.75); x <= Math.round(cx + rx * 0.75); x++) {
    G.set(x, by, '#e8edf5');
    G.set(x, by + 1, x % 3 === 0 ? '#7ff7ff' : '#7b8496');
  }
  // two little emitters clamped to the sides of the ring
  [-1, 1].forEach(side => {
    const ex = Math.round(cx + side * (rx + 1));
    G.set(ex, cy - 1, '#2b3140'); G.set(ex, cy, '#7ff7ff'); G.set(ex, cy + 1, '#2b3140');
  });
}
function makeCoreSprite() {
  const G = pixelGrid(24, 24);
  coreArt(G, 11.5, 10, 8.5, 9, true);
  return G.outline(() => '#0d0f14').canvas();
}

function makeIcon(id) {
  const G = pixelGrid(16, 16);
  const it = ITEMS[id];
  if (id === 'marble-sword') marbleSwordIcon(G);
  else if (it.tool && it.mat) ({ sword: swordIcon, pickaxe: pickIcon, axe: axeIcon })[it.tool](G, MAT_PAL[it.mat]);
  else if (it.armor) ({ head: helmetIcon, chest: armorIcon, legs: leggingsIcon, feet: bootsIcon })[it.slot](G, MAT_PAL[it.armor]);
  else if (it.arrow) arrowIcon(G, MAT_PAL[it.arrow]);
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
    case 'exotic-core':
      coreArt(G, 7.5, 7, 5.5, 6, true);
      break;
    case 'moe-drill':
      drillIconArt(G, 0);
      break;
    case 'forest-heart': {
      // a heart of bark with a living green core and a sprout on top
      const rows = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'];
      rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch !== 'X') return;
        const dx = x - 4, dy = y - 3, d = Math.sqrt(dx * dx + dy * dy * 1.4);
        G.set(x + 3, y + 5, d < 1.3 ? '#e6ff9a' : d < 2.4 ? '#9dff6a' : d < 3.2 ? '#3f8f3a' : (x + y) % 3 ? '#7a4f2a' : '#5e3a1c');
      }));
      G.set(8, 4, '#62b240'); G.set(9, 3, '#62b240'); G.set(10, 3, '#3f8f3a'); G.set(8, 3, '#2d6b2a');
      break;
    }
    case 'snowball':
      pxBlob(G, 8, 8.5, 5, 5, (dx, dy) => (dx + dy < -0.7 ? '#ffffff' : dx + dy > 0.6 ? '#b9cbe6' : '#eef3fb'));
      break;
    case 'feather':
      for (let k = 1; k <= 9; k++) {
        const cx = 3 + k * 0.95, cy = 13 - k, half = Math.round(2.2 * Math.sin((Math.PI * k) / 10));
        for (let j = -half; j <= half; j++) G.set(cx + j * 0.7, cy + j * 0.7, j < 0 ? '#ffffff' : '#e3dfd4');
      }
      pxLine(G, 2, 14, 12, 3, '#b9b2a2');
      break;
    case 'string':
      pxLine(G, 2, 12, 6, 4, '#f2efe8'); pxLine(G, 6, 4, 10, 12, '#f2efe8'); pxLine(G, 10, 12, 14, 4, '#f2efe8');
      pxLine(G, 3, 13, 6, 6, '#bdb8ac'); pxLine(G, 10, 13, 13, 6, '#bdb8ac');
      break;
    case 'bone-key':
      // a bone with knobbly ends, and the teeth of a key cut into the far end
      pxLine(G, 4, 11, 11, 4, '#e9e1c8', 2);
      pxLine(G, 5, 12, 12, 5, '#b9ae92');
      [[11, 3], [13, 5], [3, 10], [5, 12]].forEach(([x, y]) => pxBlob(G, x, y, 1.6, 1.6, (dx, dy) => (dx + dy < -0.4 ? '#fffaea' : '#d9cfb2')));
      [[5, 13], [7, 13], [7, 14]].forEach(([x, y]) => G.set(x, y, '#b9ae92'));
      break;
    case 'old-map':
      // a crumpled scrap of map with a dotted trail and a red cross
      for (let y = 3; y <= 12; y++) for (let x = 2; x <= 13; x++) {
        if ((x === 2 || x === 13) && hash2(x, y, 801) < 0.4) continue;
        G.set(x, y, hash2(x, y, 802) < 0.18 ? '#cdb684' : (x + y) % 7 === 0 ? '#d9c497' : '#ecdcb0');
      }
      [[4, 10], [5, 9], [7, 9], [8, 7], [9, 6]].forEach(([x, y]) => G.set(x, y, '#7a5a3a'));
      [[10, 4], [12, 6], [11, 5], [12, 4], [10, 6]].forEach(([x, y]) => G.set(x, y, '#d0342c'));
      break;
    case 'bow':
      // the same bow you hold and draw (bowShape, see drawDrawnBow), at rest,
      // facing up and to the left (alex wanted it left facing)
      bowShape((x, y, c) => G.set(Math.round(x), Math.round(y), c), 5, 6, -Math.SQRT1_2, -Math.SQRT1_2, BOW_L, BOW_BEND, 0);
      break;
    case 'poison-meat':
      pxBlob(G, 8, 9, 6, 4.2, (dx, dy, x, y) => (hash2(x, y, 8) < 0.2 ? '#7a3f8f' : dy < -0.5 ? '#9fbf6a' : '#6f8f3a'));
      [[6, 8], [10, 10], [8, 11]].forEach(([x, y]) => G.set(x, y, '#c7f26b'));
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
      // raw iron: one craggy lump, pale rusty beige with darker pits, like
      // minecraft's (it used to be grey stone with flecks, same as raw gold,
      // and the two were hard to tell apart)
      [[8, 9, 5.8, 4.6], [5.5, 7.5, 3, 2.6], [10.5, 7, 2.8, 2.4]].forEach(([cx, cy, rx, ry]) =>
        pxBlob(G, cx, cy, rx, ry, (dx, dy, x, y) => (hash2(x, y, 11) < 0.16 ? '#8a604c' : dx + dy < -0.6 ? '#f2d8c4' : dx + dy > 0.6 ? '#a8806a' : '#d4ae94')));
      [[7, 10], [10, 9], [5, 8]].forEach(([x, y]) => G.set(x, y, '#6e4a3a'));
      break;
    case 'gold-ore':
      // raw gold: a cluster of three bright yellow nuggets with white glints
      [[5.5, 10, 3.4, 3], [10.5, 10.5, 3.6, 3.2], [8, 6, 3.4, 3]].forEach(([cx, cy, rx, ry]) =>
        pxBlob(G, cx, cy, rx, ry, (dx, dy) => (dx + dy < -0.7 ? '#fff6b8' : dx + dy > 0.5 ? '#c08a12' : '#f5c93a')));
      [[7, 5], [4, 9], [9, 9]].forEach(([x, y]) => G.set(x, y, '#ffffff'));
      break;
    default:
      gemIcon(G, CRYSTAL_PAL[id] || CRYSTAL_PAL.crystal);
  }
  return G.outline(() => '#141414').canvas();
}
// moe's drill in miniature, pointing up to the top right like the other tools:
// the grip, the chunky hazard striped motor, the collar and the threaded bit.
// it's worked out along the drill's own axis (u along it, v across it) so the
// shapes stay fat enough to read at 16px. spin moves the thread along, for
// the drill turning in your hand.
function drillIconArt(G, spin) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const px = x + 0.5 - 1.5, py = y + 0.5 - 14.5;
    const u = (px - py) / Math.SQRT2, v = (px + py) / Math.SQRT2;
    let half, col;
    if (u < 0 || u > 18.6) continue;
    if (u < 3) { half = 1.2; col = '#2b2b33'; }
    else if (u < 10) {
      half = 2.7;
      col = v < -1.6 ? '#fff0a0' : v > 1.6 ? '#a8800f' : Math.floor((u + v) * 0.7) % 2 ? '#1f1f24' : '#f2c84b';
    } else if (u < 11.2) { half = 2.3; col = v < 0 ? '#ffffff' : '#827d77'; }
    else {
      half = 2.2 * (1 - (u - 11.2) / 7.4) + 0.35;
      const thread = (((u * 1.1 + v + spin * 1.5) % 3) + 3) % 3 < 1;
      col = thread ? '#4f5768' : v < -0.3 ? '#eef2f8' : '#8a93a6';
    }
    if (Math.abs(v) > half) continue;
    G.set(x, y, col);
  }
  G.set(14, 1, '#ffffff');
}
// canvases for drawing items in your hand, data urls for the html slots
const ICON_CANVAS = Object.fromEntries(Object.keys(ITEMS).map(id => [id, makeIcon(id)]));
const ICON = Object.fromEntries(Object.entries(ICON_CANVAS).map(([id, c]) => [id, c.toDataURL()]));
const DRILL_SPIN = (() => { const G = pixelGrid(16, 16); drillIconArt(G, 1); return G.outline(() => '#141414').canvas(); })();

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

// armor points for the bar: a little chestplate, empty, then three fills for
// the three runs of 5 points. the first is plain steel, the second (past 5)
// a bright reinforced cyan with a gold trim, the third (past 10, for boss
// armor later) violet and white.
function makeArmorPoint(kind) {
  const rows = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', '.XXXXXXX.', '.XXXXXXX.', '.XXXXXXX.', '.XXXXXXX.', '..XXXXX..'];
  const P = {
    empty: ['#2e3038', '#2e3038', '#26272e', '#26272e'],
    steel: ['#ffffff', '#d6dbe3', '#a3abb8', '#7a8291'],
    reinforced: ['#ffffff', '#8ff8ff', '#3fc8d8', '#e0b14a'],
    mythic: ['#ffffff', '#e6c8ff', '#a86ce8', '#ffffff']
  }[kind];
  const G = pixelGrid(11, 10);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== 'X') return;
    const edge = x === 0 || x === 8 || y === 7 || row[x - 1] !== 'X' || row[x + 1] !== 'X';
    G.set(x + 1, y + 1, (x === 1 || x === 2) && y === 1 ? P[0] : edge ? P[3] : x < 4 ? P[1] : P[2]);
  }));
  return G.outline(() => '#0c0d12').canvas().toDataURL();
}
const ARMOR_PT = ['empty', 'steel', 'reinforced', 'mythic'].reduce((o, k) => ({ ...o, [k]: makeArmorPoint(k) }), {});

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

function makeChest(locked) {
  const G = pixelGrid(22, 18);
  for (let y = 7; y <= 16; y++) for (let x = 1; x <= 20; x++) G.set(x, y, y === 11 || y === 14 ? '#7a4a24' : x < 5 ? '#b07a42' : '#9a6233');
  for (let y = 2; y <= 6; y++) for (let x = 1; x <= 20; x++) G.set(x, y, y === 2 ? '#d29a5c' : y === 6 ? '#6e4020' : '#b98049');
  [3, 18].forEach(x => { for (let y = 2; y <= 16; y++) G.set(x, y, y === 2 ? '#9a9a9a' : '#6f6f6f'); });
  for (let y = 5; y <= 8; y++) for (let x = 10; x <= 11; x++) G.set(x, y, y === 5 ? '#ffe28a' : '#d9b23a');
  if (locked) {
    // chained shut: two chains across the front and a padlock on the clasp
    for (let k = 0; k <= 18; k++) {
      [[2 + k, 3 + Math.round(k * 0.7)], [2 + k, 16 - Math.round(k * 0.7)]].forEach(([x, y]) => G.set(x, y, k % 2 ? '#a6a6a6' : '#5f5f5f'));
    }
    [[9, 5], [9, 6], [10, 4], [11, 4], [12, 5], [12, 6]].forEach(([x, y]) => G.set(x, y, '#7a7a7a'));
    for (let y = 7; y <= 12; y++) for (let x = 8; x <= 13; x++) G.set(x, y, y === 7 ? '#ffe28a' : x === 13 || y === 12 ? '#a8800f' : '#d9b23a');
    G.set(10, 9, '#3a2a0a'); G.set(10, 10, '#3a2a0a');
  }
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

// the inside of the cave, 11 x 8 tiles. rough rock round the edge that bulges
// in and out, a gritty floor of stone and packed dirt, a few bones, and the
// way out at the bottom. the collision is still the plain rectangle (two rows
// of wall at the back, one tile everywhere else), the rock is just painted
// a little past it in places so the edge doesn't look ruled.
const CAVE_COLS = 11, CAVE_ROWS = 8, CAVE_MOUTH = 5;
function paintCaveRoom() {
  const w = CAVE_COLS * TILE, h = CAVE_ROWS * TILE;
  const c = mk(w, h), g = c.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  const mouthL = CAVE_MOUTH * TILE, mouthR = (CAVE_MOUTH + 1) * TILE;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const wob = (vnoise(x / 9, y / 9, 803) - 0.5) * 9;
    const top = 32 + wob, side = 16 + wob * 0.7, bot = h - 16 - wob * 0.7;
    const inMouth = x > mouthL + 1 && x < mouthR - 1 && y > h - 20;
    const fromWall = Math.min(y - top, x - side, w - side - x, inMouth ? 99 : bot - y);
    const n = hash2(x, y, 801);
    let r, gg, b;
    if (fromWall < 0) {
      // rock. the back wall shows its face (lighter just above the floor),
      // the rest is the top of the rock seen from above
      const face = y < top && y > top - 10 && x > side && x < w - side;
      const v = face ? 92 - (top - y) * 3 : fromWall > -2 ? 70 : 34;
      r = v; gg = v - 4; b = v - 8;
      if (n < 0.14) { r -= 14; gg -= 14; b -= 14; } else if (n > 0.93) { r += 16; gg += 16; b += 16; }
    } else {
      const dirt = vnoise(x / 20, y / 20, 802) > 0.58;
      r = dirt ? 98 : 86; gg = dirt ? 84 : 82; b = dirt ? 68 : 78;
      if (n < 0.1) { r -= 16; gg -= 16; b -= 16; } else if (n > 0.95) { r += 18; gg += 18; b += 18; }
      // a soft shadow along the foot of every wall
      if (fromWall < 4) { r -= 22 - fromWall * 5; gg -= 22 - fromWall * 5; b -= 22 - fromWall * 5; }
    }
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const px = (x, y, col, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  // old bones, and a puddle where the roof drips
  [[44, 88], [100, 104]].forEach(([x, y]) => {
    px(x, y, '#e8e2d2', 9, 2); px(x - 1, y - 1, '#e8e2d2', 2, 4); px(x + 8, y - 1, '#e8e2d2', 2, 4);
    px(x, y + 2, '#a8a294', 9, 1);
  });
  px(66, 46, '#3d4f63', 14, 4); px(64, 47, '#3d4f63', 18, 2); px(68, 46, '#7d98b3', 4, 1);
  // daylight coming in through the mouth
  const gr = g.createLinearGradient(0, h, 0, h - 30);
  gr.addColorStop(0, 'rgba(255,240,200,0.45)');
  gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr;
  g.fillRect(mouthL, h - 30, TILE, 30);
  return c;
}
// loose rocks for the cave floor. two shapes, and the one hiding the core is
// one of these too, so there's nothing to tell it apart.
function makeBoulder(v) {
  const G = pixelGrid(18, 14);
  const [rx, ry] = v ? [7.5, 5.5] : [6.5, 6];
  pxBlob(G, 9, 7.5, rx, ry, (dx, dy, x, y) => {
    const lit = -(dx * 0.6 + dy * 0.8) + (hash2(x, y, 90 + v) - 0.5) * 0.4;
    return lit > 0.5 ? '#a6a6a6' : lit > 0.05 ? '#8a8a8a' : lit > -0.4 ? '#6e6e6e' : '#575757';
  });
  return G.outline(() => '#262626').canvas();
}
// the grizzly's bed: a ring of flattened straw with tufts of brown fur in it
function makeNest() {
  const G = pixelGrid(32, 18);
  pxBlob(G, 16, 10, 14, 6.5, (dx, dy, x, y) => {
    const dd = dx * dx + dy * dy;
    if (dd < 0.3) return hash2(x, y, 72) < 0.3 ? '#7b4a29' : '#a37a2c';
    return hash2(x, y, 71) < 0.25 ? '#a37a2c' : dy < -0.3 ? '#ecd27a' : '#d9b45a';
  });
  return G.outline(() => '#5e4210').canvas();
}
// a clump of glowing mushrooms, the only light deep in the cave
function makeShrooms() {
  const G = pixelGrid(14, 12);
  [[4, 6, 2.6], [9, 4, 3.2], [11, 8, 2]].forEach(([x, y, r]) => {
    for (let k = y + 1; k <= 11; k++) G.set(x, k, '#cfe8e0');
    pxBlob(G, x, y, r, r * 0.7, (dx, dy) => (dy < -0.2 ? '#bffcf0' : '#5fe6c8'));
  });
  return G.outline(() => '#123a33').canvas();
}

// the inside of the tent, 11 x 8 tiles: canvas walls with the pole holding
// the back up and a lantern hung off it, a dirt floor, and the flap at the
// bottom. the workshop sits in a row at the left of the back wall and the rest
// of the floor is left open (there's room for a bed and more).
const HOME_COLS = 11, HOME_ROWS = 8, HOME_DOOR = 5;
function paintHomeRoom() {
  const w = HOME_COLS * TILE, h = HOME_ROWS * TILE;
  const c = mk(w, h), g = c.getContext('2d');
  const r = mulberry32(SEED + 808);
  const px = (x, y, col, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  // packed dirt, same as the clearing outside, with the odd pebble
  px(0, 0, '#9c7650', w, h);
  const dots = ['#8a6644', '#ad865c', '#7d5b3b', '#a67f56'];
  for (let i = 0; i < 900; i++) px((r() * w) | 0, (r() * h) | 0, dots[(r() * 4) | 0], r() < 0.3 ? 2 : 1, 1);
  for (let i = 0; i < 14; i++) { const x = (r() * w) | 0, y = 36 + ((r() * (h - 52)) | 0); px(x, y, '#b8b8b8', 2, 1); px(x, y + 1, '#7a7a7a', 2, 1); }
  // the back wall: canvas panels with seams, a lighter stripe, a darker hem
  for (let y = 0; y < 32; y++) for (let x = 0; x < w; x++) {
    let col = Math.floor(x / 22) % 2 ? '#d47636' : '#e0823f';
    if (x % 22 === 0) col = '#b3572a';
    if (y === 11 || y === 22) col = '#ec9a5c';
    if (y < 5) col = '#b3572a';
    if (y >= 29) col = '#8a3f1c';
    px(x, y, col);
  }
  // the pole, with the lantern hung off a hook on it. it stands a little
  // right of the middle so the workshop can sit in one tidy row to its left.
  px(110, 0, '#6b3a1e', 4, 35);
  px(110, 0, '#8a4f2a', 1, 35);
  px(114, 8, '#2b2b2b', 4, 1);
  px(117, 8, '#2b2b2b', 1, 3);
  px(114, 11, '#2b2b2b', 7, 2);
  px(115, 13, '#ffd77a', 5, 6);
  px(114, 19, '#2b2b2b', 7, 2);
  px(0, 32, 'rgba(0,0,0,0.3)', w, 3);
  // the canvas round the sides and front, seen from above
  const wallTop = (x, y, ww, hh) => { px(x, y, '#8a3f1c', ww, hh); px(x + 2, y + 2, '#b3572a', ww - 4, hh - 4); };
  wallTop(0, 0, 16, h);
  wallTop(w - 16, 0, 16, h);
  wallTop(0, h - 16, HOME_DOOR * TILE + 2, 16);
  wallTop((HOME_DOOR + 1) * TILE - 2, h - 16, w - (HOME_DOOR + 1) * TILE + 2, 16);
  px(0, 0, '#6e3014', w, 3);
  const gr = g.createLinearGradient(0, h, 0, h - 26);
  gr.addColorStop(0, 'rgba(255,240,200,0.4)');
  gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr;
  g.fillRect(HOME_DOOR * TILE, h - 26, TILE, 26);
  return c;
}
function makeHomeRug() {
  const w = 44, h = 28;
  const G = pixelGrid(w, h);
  for (let y = 2; y < h - 2; y++) for (let x = 3; x < w - 3; x++) {
    const border = y < 4 || y > h - 5 || x < 5 || x > w - 6;
    const dx = Math.abs(x - w / 2), dy = Math.abs(y - h / 2);
    G.set(x, y, border ? '#2b4a6b' : dx * 0.6 + dy < 5 && dx * 0.6 + dy > 3.4 ? '#e0b14a' : '#3f6e9c');
  }
  for (let y = 3; y < h - 3; y += 2) { G.set(1, y, '#efe2c0'); G.set(2, y, '#efe2c0'); G.set(w - 2, y, '#efe2c0'); G.set(w - 3, y, '#efe2c0'); }
  return G.outline(() => '#162638').canvas();
}
function makePlant() {
  const G = pixelGrid(16, 22);
  for (let y = 15; y <= 20; y++) for (let x = 4; x <= 11; x++) G.set(x, y, y === 15 ? '#d9845a' : x < 6 ? '#c46a3c' : '#a8552e');
  [[8, 9, 4, 4], [5, 7, 3, 3], [11, 6, 3, 3.5], [8, 4, 2.5, 3]].forEach(([cx, cy, rx, ry]) =>
    pxBlob(G, cx, cy, rx, ry, (dx, dy) => (dy < -0.3 ? '#62b240' : '#2d7d37')));
  return G.outline(() => '#123a1e').canvas();
}
function makeBookshelf() {
  const G = pixelGrid(24, 30);
  for (let y = 1; y <= 28; y++) for (let x = 1; x <= 22; x++) G.set(x, y, x <= 2 || x >= 21 || y <= 2 || y >= 27 || y === 10 || y === 18 ? '#6b4020' : '#3b2412');
  const cols = ['#c0392b', '#2f6d9c', '#d9b23a', '#3f8f3a', '#8a4fb0', '#e6e2d8'];
  [[3, 9], [11, 17], [19, 26]].forEach(([y0, y1], shelf) => {
    for (let x = 3, k = shelf; x <= 19; k++) {
      const bw = 2 + (k % 2), top = y0 + (k % 3);
      for (let y = top; y <= y1; y++) for (let i = 0; i < bw; i++) G.set(x + i, y, cols[k % cols.length]);
      x += bw + (k % 4 === 0 ? 1 : 0);
    }
  });
  return G.outline(() => '#24160a').canvas();
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

// a zombie shambling right with its arms out: flat two-tone green skin, a teal
// shirt with a ragged hem, dark trousers, and one sunken eye with a red pupil.
// kept clean on purpose (no noise), so it reads at a glance. 'lunge' leans into
// a grab.
function makeZombie(frame, pose) {
  const G = pixelGrid(28, 32);
  const C = { skin: '#8fc46a', skinD: '#6a9a4c', shirt: '#3f7d8f', shirtD: '#2c5d6b', pants: '#3b3f66', pantsD: '#2b2e4d', shoe: '#2a2420', hair: '#24301c', socket: '#1d2a14', eye: '#ff4a3a', mouth: '#2a1a12' };
  const ground = 30, lean = pose === 'lunge' ? 2 : 0;
  [[11, 0, true], [15, 1, false]].forEach(([lx, grp, far]) => {
    const off = pose === 'lunge' ? (far ? -2 : 2) : STEP[grp][frame % 4];
    for (let y = 22; y < ground; y++) {
      const x = lx + Math.round((off * (y - 22)) / 8);
      G.set(x, y, far ? C.pantsD : C.pants);
      G.set(x + 1, y, far ? C.pantsD : C.pants);
    }
    [0, 1, 2].forEach(k => G.set(lx + off + k, ground, C.shoe));
  });
  for (let x = 15 + lean; x <= 24 + lean; x++) { G.set(x, 12, C.skinD); G.set(x, 13, C.skinD); }
  for (let y = 12; y <= 22; y++) for (let x = 10; x <= 17; x++) {
    if (y === 22 && (x === 11 || x === 14 || x === 16)) continue;
    G.set(x + (y < 17 ? lean : 0), y, y === 12 ? C.shirtD : x < 12 ? C.shirtD : C.shirt);
  }
  for (let x = 15 + lean; x <= 25 + lean; x++) {
    G.set(x, 14, x < 18 + lean ? C.shirt : C.skin);
    G.set(x, 15, x < 18 + lean ? C.shirtD : C.skinD);
  }
  G.set(14 + lean, 11, C.skinD); G.set(15 + lean, 11, C.skinD);
  for (let y = 2; y <= 10; y++) for (let x = 11; x <= 19; x++) {
    let col = x === 11 ? C.skinD : C.skin;
    if (y <= 3 || (x <= 12 && y <= 6)) col = C.hair;
    G.set(x + lean, y, col);
  }
  [[17, 5], [18, 5], [17, 6], [18, 6]].forEach(([x, y]) => G.set(x + lean, y, C.socket));
  G.set(18 + lean, 5, C.eye);
  for (let x = 16; x <= 19; x++) G.set(x + lean, 9, C.mouth);
  return G.outline(() => '#1a2414').canvas();
}
// a forest guardian: a tall gnarled trunk on splayed roots, moss on its
// shoulders, a knotted skull of a head with deep sockets and two burning green
// eyes, a crown of antler branches, a glowing rune carved into its chest, and
// a long spear of a stick in its hand. 'lunge' is the throw, arm up and back.
function makeGuardian(frame, pose) {
  const G = pixelGrid(30, 38);
  const C = { bark: '#7a4f2a', barkD: '#4e3018', barkL: '#9a6a3c', moss: '#4f8a3a', mossL: '#79b84f', eye: '#c8ff5a', rune: '#9dff6a', antler: '#c9b48a', antlerD: '#8a7656', socket: '#160d05', spear: '#c48a4f', tip: '#7be05a' };
  const ground = 36, throwing = pose === 'lunge';
  [[11, 0], [16, 1]].forEach(([lx, grp]) => {
    const off = STEP[grp][frame % 4];
    for (let y = 27; y <= ground; y++) {
      const x = lx + Math.round((off * (y - 27)) / 9);
      G.set(x, y, C.barkD); G.set(x + 1, y, C.bark); G.set(x + 2, y, C.barkD);
    }
    G.set(lx + off - 1, ground, C.barkD); G.set(lx + off + 3, ground, C.barkD);
  });
  pxLine(G, 10, 15, 6, 25, C.barkD);
  G.set(5, 26, C.barkD); G.set(7, 26, C.barkD); G.set(6, 27, C.barkD);
  for (let y = 12; y <= 27; y++) {
    const half = y < 16 ? 6 : 5;
    for (let x = 15 - half; x <= 14 + half; x++) G.set(x, y, (x * 3 + (y >> 1)) % 7 === 0 ? C.barkD : x < 12 ? C.barkL : C.bark);
  }
  [[9, 12], [10, 12], [11, 11], [12, 12], [10, 13], [17, 12], [18, 11], [19, 12], [20, 12], [19, 13]].forEach(([x, y]) => G.set(x, y, (x + y) % 2 ? C.moss : C.mossL));
  [[14, 17], [14, 18], [14, 19], [13, 18], [15, 18], [14, 21], [13, 22], [15, 22], [14, 23]].forEach(([x, y]) => G.set(x, y, C.rune));
  // antlers first so the head sits in front of their roots
  pxLine(G, 13, 5, 9, 0, C.antlerD); pxLine(G, 11, 2, 8, 3, C.antlerD); G.set(9, 0, C.antler); G.set(8, 3, C.antler);
  pxLine(G, 17, 5, 21, 0, C.antler); pxLine(G, 19, 2, 23, 3, C.antler); G.set(21, 0, '#e6d6b0'); G.set(23, 3, '#e6d6b0');
  pxBlob(G, 15, 7.5, 4.5, 4, (dx, dy) => (dy < -0.4 ? C.barkL : C.bark));
  [[15, 7], [16, 7], [15, 8], [16, 8], [18, 7], [19, 7], [18, 8], [19, 8]].forEach(([x, y]) => G.set(x, y, C.socket));
  G.set(16, 7, C.eye); G.set(19, 7, C.eye);
  for (let x = 15; x <= 19; x++) G.set(x, 10, x % 2 ? C.socket : C.barkD);
  if (throwing) {
    pxLine(G, 18, 14, 24, 9, C.bark, 2);
    pxLine(G, 20, 13, 29, 3, C.spear);
    G.set(29, 2, C.tip);
  } else {
    pxLine(G, 18, 14, 22, 20, C.bark, 2);
    pxLine(G, 23, 6, 23, 31, C.spear);
    G.set(23, 5, C.tip); G.set(23, 4, C.tip);
  }
  return G.outline(() => '#1a0f06').canvas();
}
// where each night mob's eyes sit in its sprite, so they can glow in the dark
const EYES = { zombie: [[18, 5]], guardian: [[16, 7], [19, 7]] };
const HUNTER_MAKERS = { hyena: makeHyena, bear: makeBear, zombie: makeZombie, guardian: makeGuardian, mole: makeMole };

function creatureFrames(kind) {
  if (PASSIVE_MAKERS[kind]) {
    const walk = [0, 1, 2, 3].map(f => PASSIVE_MAKERS[kind](f));
    const set = { walk, crouch: walk[0], lunge: walk[0], scoop: walk[0], sleep: walk[0] };
    set.white = new Map(walk.map(c => [c, whiteOf(c)]));
    return set;
  }
  const make = HUNTER_MAKERS[kind];
  const walk = [0, 1, 2, 3].map(f => make(f, 'walk'));
  const set = {
    walk,
    crouch: kind === 'hyena' || kind === 'mole' ? make(0, 'crouch') : make(0, 'lunge'),
    lunge: make(0, 'lunge'),
    scoop: kind === 'bear' ? make(0, 'scoop') : walk[0],
    sleep: kind === 'bear' ? make(0, 'sleep') : walk[0]
  };
  set.white = new Map([...walk, set.crouch, set.lunge, set.scoop, set.sleep].map(c => [c, whiteOf(c)]));
  if (kind === 'mole') set.mound = [makeMoleMound(false), makeMoleMound(true)];
  return set;
}

// creatures of the same kind share their frames instead of redrawing them
const FRAME_CACHE = {};
const framesFor = kind => FRAME_CACHE[kind] || (FRAME_CACHE[kind] = creatureFrames(kind));

const CORE = makeCoreSprite();

const SAVE_KEY = 'dm-save';
const inv = { slots: new Array(24).fill(null), armor: { head: null, chest: null, legs: null, feet: null }, sel: 0 };   // slots 0-5 are the hotbar
const craftGrid = new Array(25).fill(null);
const furnaceState = { input: null, fuel: null, output: null, burn: 0, prog: 0 };
const quest = { greatTree: false, chopped: [], mined: [], killed: {}, seen: {}, crafted: {}, recipes: [], beds: [], spawnBed: null, day: 1, cave: {}, parts: [], caveChest: null, moe: {}, burrows: [], denChest: null };
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
const vitals = { hp: 5, max: 5, hunger: HUNGER_MAX, sat: START_SAT, invuln: 0, sinceHit: 99, regenT: 0, starveT: 0, kx: 0, ky: 0, atkCD: 0, eatCD: 0, slowT: 0, burn: null, poison: null };
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
  // armor used to be one item per material. one of those sitting in a bag or
  // a chest comes back as that material's chestplate.
  if (s && /-armor$/.test(s.id) && ITEMS[s.id.replace(/-armor$/, '-chestplate')]) s = { ...s, id: s.id.replace(/-armor$/, '-chestplate') };
  if (!s || !ITEMS[s.id] || !(s.n > 0)) return null;
  const out = { id: s.id, n: Math.min(s.n, maxStack(s.id)) };
  if (ITEMS[s.id].dur) out.dur = clamp(+s.dur || ITEMS[s.id].dur, 1, ITEMS[s.id].dur);
  return out;
}
let savedGround = [];
function loadSave() {
  const data = store.read(SAVE_KEY, null);
  if (!data || ![1, 2, 3].includes(data.v)) return;
  if (Array.isArray(data.ground)) savedGround = data.ground;
  if (Array.isArray(data.inv?.slots)) data.inv.slots.slice(0, 24).forEach((s, i) => { inv.slots[i] = validStack(s); });
  // a worn old-style armor becomes a full set of that material, same wear
  const worn = data.inv?.armor;
  if (worn && worn.id && /-armor$/.test(worn.id)) {
    const m = worn.id.replace(/-armor$/, '');
    if (ARMORS[m]) ARMOR_SLOTS.forEach(a => { inv.armor[a.key] = validStack({ id: `${m}-${a.piece}`, n: 1, dur: worn.dur }); });
  } else if (worn && typeof worn === 'object') {
    ARMOR_SLOTS.forEach(a => {
      const st = validStack(worn[a.key]);
      inv.armor[a.key] = st && ITEMS[st.id].slot === a.key ? st : null;
    });
  }
  inv.sel = clamp(data.inv?.sel | 0, 0, 5);
  if (data.quest) Object.assign(quest, data.quest);
  quest.recipes = Array.isArray(quest.recipes) ? quest.recipes.filter(id => ITEMS[id]) : [];
  if (typeof data.hp === 'number') vitals.hp = clamp(data.hp, 0.5, vitals.max);
  if (typeof data.hunger === 'number') vitals.hunger = clamp(data.hunger, 0, HUNGER_MAX);
  if (typeof data.sat === 'number') vitals.sat = clamp(data.sat, 0, vitals.hunger);
  if (Array.isArray(data.chest)) data.chest.slice(0, 18).forEach((st, i) => { chestSlots[i] = validStack(st); });
  if (typeof data.clock === 'number') clock = ((data.clock % DAY_LEN) + DAY_LEN) % DAY_LEN;
  quest.beds = Array.isArray(quest.beds) ? quest.beds : [];
  quest.cave = quest.cave && typeof quest.cave === 'object' ? quest.cave : {};
  quest.parts = Array.isArray(quest.parts) ? quest.parts.filter(id => ITEMS[id] && ITEMS[id].part) : [];
  if (Array.isArray(quest.caveChest)) quest.caveChest = Array.from({ length: 6 }, (_, i) => validStack(quest.caveChest[i]));
  quest.moe = quest.moe && typeof quest.moe === 'object' ? quest.moe : {};
  quest.burrows = Array.isArray(quest.burrows) ? quest.burrows.map(b => (b && typeof b === 'object' ? {
    visited: !!b.visited, dead: Array.isArray(b.dead) ? b.dead.map(Boolean) : [],
    chest: Array.isArray(b.chest) ? Array.from({ length: 6 }, (_, i) => validStack(b.chest[i])) : null
  } : null)) : [];
  if (Array.isArray(quest.denChest)) quest.denChest = Array.from({ length: 12 }, (_, i) => validStack(quest.denChest[i]));
  if (data.furnace) {
    ['input', 'fuel', 'output'].forEach(k => { furnaceState[k] = validStack(data.furnace[k]); });
    furnaceState.burn = +data.furnace.burn || 0;
    furnaceState.prog = clamp(+data.furnace.prog || 0, 0, 1);
  }
}
// older saves had the great tree as ucla. now the tree is glastonbury and ucla
// is the cave, which can only be found once both guards are dead, so a ucla
// without that is really the tree. checked every load rather than by save
// version, because dm-found can outlive dm-save.
function fixFoundIds() {
  const before = [...found].join();
  const both = quest.killed.hyena && quest.killed.bear;
  if (found.has('ucla') && !both) { found.delete('ucla'); found.add('ghs'); }
  if (quest.greatTree) found.add('ghs');
  if (both) found.add('ucla');
  // mines landmarks used to be found just by walking up to them. now each one
  // waits on its boss, so any found that way that are still guarded go back to
  // undiscovered, and a beaten boss's landmark always counts as found.
  let before0 = true;
  MINE_ORDER.forEach(p => {
    const boss = MINE_BOSSES[p.id], beaten = !!boss && boss.beaten();
    if (beaten && before0) found.add(p.id);
    if (!beaten || !before0) found.delete(p.id);
    before0 = before0 && found.has(p.id);
  });
  if ([...found].join() === before) return;
  store.write('dm-found', [...found]);
  paintMinimap();
  updateFoundUI();
}
function saveNow() {
  if (resetting) return;
  store.write(SAVE_KEY, { v: 3, inv, quest, ground: ground.map(g => ({ st: g.st, x: g.x, y: g.y, room: g.room, age: g.age })), hp: vitals.hp, hunger: vitals.hunger, sat: vitals.sat, furnace: furnaceState, chest: chestSlots, clock });
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
  if (n > 0) toast('Bag full...', `${n} ${ITEMS[id].name} lost`, 'Make some room in your inventory (E)');
  afterInventoryChange();
  return n;
}
// put an existing stack back in the bag, keeping its durability
function addStack(stack) {
  if (!stack) return;
  if (maxStack(stack.id) > 1) { addItem(stack.id, stack.n); return; }
  const free = inv.slots.findIndex(s => !s);
  if (free >= 0) { inv.slots[free] = stack; afterInventoryChange(); }
  else toast('Bag full...', `${ITEMS[stack.id].name} lost`, 'Make some room in your inventory (E)');
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
  return s && ITEMS[s.id].tool && ITEMS[s.id].tool !== 'drill' ? ITEMS[s.id] : FIST;
}
// knock durability off whatever's in your hand, and break it at zero
function wearHeld(cost) {
  const s = heldItem();
  if (!s || !ITEMS[s.id].dur) return;
  s.dur -= cost;
  if (s.dur <= 0) {
    inv.slots[inv.sel] = null;
    toast('Broken', ITEMS[s.id].name, 'Craft another one at Base Camp.');
    sfx.snap();
    burst(player.x, player.y - 14, '200,200,200', 10);
  }
  markDirty();
  renderHUD();
}
// every hit that lands costs each worn piece one point, whether it was a hyena
// nip or a full bear swipe, same as a sword losing one per swing no matter what
// it hits. pieces break on their own.
function wearArmor() {
  ARMOR_SLOTS.forEach(a => {
    const st = inv.armor[a.key];
    if (!st) return;
    st.dur -= 1;
    if (st.dur > 0) return;
    inv.armor[a.key] = null;
    toast('Broken', ITEMS[st.id].name, 'Craft another one at Base Camp.');
    sfx.snap();
    burst(player.x, player.y - 20, '200,200,200', 14);
  });
}
// add up something about each worn piece, weighted by that piece's share
function armorSum(f) {
  return ARMOR_SLOTS.reduce((n, a) => {
    const st = inv.armor[a.key];
    return st ? n + a.share * f(ARMORS[ITEMS[st.id].armor]) : n;
  }, 0);
}
const armorBlock = () => armorSum(A => A.block);
// armor points for the bar over your hearts. they follow how much longer you
// last rather than the raw percentage (block / (1 - block)), scaled so a full
// set of hide is exactly half the bar: wool 0.4, gold 1.1, hide 2.5, iron 3.9,
// emerald 6.7, diamond 9.4. past 5 the bar starts over in a shinier colour, and
// again past 10, for the boss armor still to come.
function armorPoints() {
  const b = Math.min(0.99, armorBlock());
  return Math.round(((5 / 3) * (b / (1 - b))) * 100) / 100;
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
  toast('Recipe Book', fresh.length > 1 ? `${fresh.length} new recipes` : first,
    fresh.length > 1 ? `Including the ${first}. Open the book at the crafting table.` : 'Open the book at the crafting table.');
  markDirty();
}

function floatText(text, x, y, col = '#ffffff') {
  floats.push({ text, x, y, col, t: 0 });
}

const STUMP = makeStump();
const greatTree = POIS.find(p => p.kind === 'bigtree').thing;

function nearestOpen(tx, ty) {
  let best = [tx, ty], bestD = Infinity;
  for (let y = Math.max(0, ty - 8); y < Math.min(H, ty + 8); y++) for (let x = Math.max(0, tx - 8); x < Math.min(W, tx + 8); x++) {
    if (!reach[idx(x, y)] || solidTile(x, y) || tiles[idx(x, y)] === T.WATER) continue;
    const d = (x - tx) ** 2 + (y - ty) ** 2;
    if (d < bestD) { bestD = d; best = [x, y]; }
  }
  return best;
}

// a station at x, y (pixels) inside a room
function addStation(kind, x, y, r) {
  const frames = kind === 'craft' ? [makeTable()] : kind === 'chest' ? [makeChest()] : [makeFurnace(false, 0)];
  const st = { kind, x, y, frames, station: kind };
  if (kind === 'furnace') {
    st.unlit = frames;
    st.lit = [makeFurnace(true, 0), makeFurnace(true, 1), makeFurnace(true, 2)];
    st.fps = 8;
    st.glow = { x: st.x, y: st.y - 8, rgb: '255,140,50', rad: 2.6, flicker: true, strength: 0.3, off: true };
    r.glows.push(st.glow);
  }
  stations.push(st);
  r.things.push(st);
  return st;
}

// a hunter with a home spot it prowls or sleeps at and goes back to
function spawnCreature(kind, tx, ty, opts = {}) {
  const def = CREATURES[kind];
  const [x, y] = nearestOpen(tx, ty);
  const c = {
    kind, def, frames: framesFor(kind), creature: true,
    hx: x * TILE + 8, hy: y * TILE + 12, x: x * TILE + 8, y: y * TILE + 12,
    hp: def.hp, state: def.rest, t: 0, cd: 0, sinceHit: 99, anim: 0, flip: false, hurtT: 0, kx: 0, ky: 0,
    lx: 0, ly: 0, moving: false, wander: null, wanderT: 0,
    dormant: !!opts.dormant, gone: !!opts.dormant, draw: drawCreature
  };
  creatures.push(c);
  things.push(c);
  return c;
}

// the mines' landmarks are the projects, and each has a boss guarding it.
// they go in the journal's order: beating a boss reveals its landmark, and every
// landmark after it stays sealed until all the ones before it are found. only
// moe exists so far, so the other four stay sealed until their bosses do.
const MINE_ORDER = POIS.filter(p => p.region === 'mines');
// mailsisibox's isn't a boss but darryl's race: it's found when you walk
// through the big door at the end of the track and see the statue. guard is
// what walking up to it before then says.
const MINE_BOSSES = {
  mailsisi: { beaten: () => !!quest.moe.dead, guard: 'Something is down there...' },
  mailsisibox: { beaten: () => !!(quest.darryl && quest.darryl.statue), guard: 'Someone is whistling down there...' }
};
function mineSealReason(p) {
  const i = MINE_ORDER.indexOf(p);
  if (i < 0) return '';
  if (MINE_ORDER.slice(0, i).some(q => !found.has(q.id))) return 'Beat the bosses before it first.';
  return MINE_BOSSES[p.id] ? '' : 'Its boss is still on the way.';
}

loadSave();
fixFoundIds();

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

const BED = makeBed();
// a bed out in the world, or one put down at home (its x, y are then tiles of
// the home room)
function bedThing(b) {
  const o = { bed: true, id: b.id, room: b.room, x: b.x * TILE + 8, y: b.y * TILE + 14, frames: [BED] };
  (b.room === 'home' ? homeRoom.things : things).push(o);
  return o;
}

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
    kind, def, frames: framesFor(kind), creature: true,
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

// ucla is the grizzly's cave on the lake island, and the two hunters are what
// stand between you and it. the hyena prowls the meadow between the great tree
// and the lake, but only shows up once the great tree has come down. the
// grizzly sleeps right in front of the cave mouth.
const cavePoi = POIS.find(p => p.kind === 'cave');
const caveThing = cavePoi.thing;
const hyena = spawnCreature('hyena', HYENA_HOME.x, HYENA_HOME.y, { dormant: !quest.greatTree || quest.killed.hyena });
if (quest.killed.hyena) hyena.dead = true;
const bear = spawnCreature('bear', cavePoi.at[0], cavePoi.at[1] + 2);
if (quest.killed.bear) { bear.dead = true; bear.gone = true; }
function playLandmarkGuarded(p) {
  if (p === cavePoi) return !(quest.killed.hyena && quest.killed.bear);
  return !!MINE_BOSSES[p.id] && !MINE_BOSSES[p.id].beaten();
}

// the cave mouth stays blocked until the grizzly is dead
const caveMouth = idx(cavePoi.at[0], cavePoi.at[1]);
const caveOpen = () => !!quest.killed.bear;
function openCave() { extraSolid.delete(caveMouth); }
if (caveOpen()) openCave();
else extraSolid.add(caveMouth);

// somebody's old chest at the back of the cave, still stocked with raw meat
if (!Array.isArray(quest.caveChest)) {
  quest.caveChest = [makeStack('raw-beef', 3), makeStack('raw-mutton', 4), makeStack('raw-chicken', 5), null, null, null];
}
// the walls of a room: two rows at the back, one tile everywhere else, plus a
// way out through the door gap in the bottom wall and nowhere else
function roomWalls(cols, rows, door) {
  return (x, y) => {
    const wall = (px, py) => {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if (tx === door && ty >= rows - 1) return false;
      return tx <= 0 || tx >= cols - 1 || ty <= 1 || ty >= rows - 1;
    };
    return wall(x - 4, y - 3) || wall(x + 3, y - 3) || wall(x - 4, y) || wall(x + 3, y);
  };
}
const caveRoom = {
  id: 'cave', w: CAVE_COLS * TILE, h: CAVE_ROWS * TILE, dust: '#6e6a64', shade: 0.95,
  canvas: paintCaveRoom(),
  outside: { x: caveThing.x, y: caveThing.y },
  exit: { x: caveThing.x, y: caveThing.y + 10 },
  door: CAVE_MOUTH,
  blocked: roomWalls(CAVE_COLS, CAVE_ROWS, CAVE_MOUTH),
  things: [],
  glows: [
    { x: 88, y: 122, rgb: '255,236,200', rad: 3.4, flicker: true, strength: 0.2 },
    { x: 26, y: 92, rgb: '95,230,200', rad: 2.6, flicker: true, strength: 0.26 },
    { x: 150, y: 44, rgb: '95,230,200', rad: 2.6, flicker: true, strength: 0.26 }
  ]
};
const caveChestSt = { kind: 'chest', station: 'chest', slots: quest.caveChest, where: 'in the cave', x: 40, y: 47, frames: [makeChest()] };
const BOULDERS = [makeBoulder(0), makeBoulder(1)];
// the core's rock is the third one along the right. it sits with the others
// and is drawn from the same two shapes, so nothing gives it away.
const ROCK_SPOT = { x: 134, y: 78 };
const secretRock = { x: ROCK_SPOT.x + (quest.cave.rock ? 18 : 0), y: ROCK_SPOT.y, frames: [BOULDERS[0]], slide: quest.cave.rock ? 1 : 0 };
// the hollow under it, with the core sitting in it. drawn by hand so the core
// can pulse and pull light in towards it.
const hollowThing = { flat: true, x: ROCK_SPOT.x, y: ROCK_SPOT.y + 2, gone: !quest.cave.rock, frames: [mk(24, 26)], draw: drawHollow };
caveRoom.things.push(
  caveChestSt, hollowThing, secretRock,
  { x: 58, y: 70, frames: [BOULDERS[1]] },
  { x: 96, y: 58, frames: [BOULDERS[0]] },
  { x: 74, y: 100, frames: [BOULDERS[1]] },
  { x: 144, y: 104, frames: [BOULDERS[1]] },
  { x: 120, y: 102, frames: [makeNest()] },
  { x: 26, y: 96, frames: [makeShrooms()] },
  { x: 150, y: 48, frames: [makeShrooms()] }
);
const coreGlow = { x: ROCK_SPOT.x, y: ROCK_SPOT.y - 10, rgb: '150,120,255', rad: 2.2, flicker: true, strength: 0.3, off: !quest.cave.rock || !!quest.cave.part };
caveRoom.glows.push(coreGlow);

// home: the tent at base camp. the crafting table, furnace and chest live in
// here along the back wall now, with a bookshelf, a plant and a rug, and the
// right half of the floor is left clear so you can put a bed down. the
// overworld (and everything hunting you) waits outside while you're in.
const homeRoom = {
  id: 'home', w: HOME_COLS * TILE, h: HOME_ROWS * TILE, dust: '#8a6644',
  canvas: paintHomeRoom(),
  outside: { x: campHouse.x, y: campHouse.y },
  exit: { x: campHouse.x, y: campHouse.y + 10 },
  door: HOME_DOOR,
  blocked: roomWalls(HOME_COLS, HOME_ROWS, HOME_DOOR),
  things: [
    { flat: true, x: 66, y: 98, frames: [makeHomeRug()] },
    { x: 26, y: 106, frames: [makePlant()] },
    { x: 147, y: 47, frames: [makeBookshelf()] }
  ],
  glows: [{ x: 117, y: 16, rgb: '255,190,110', rad: 4.5, flicker: true, strength: 0.25 }]
};
// side by side from the left wall, 4px apart (table 20-45, furnace 50-71,
// chest 76-97), so the rest of the tent stays open for other things
addStation('craft', 33, 47, homeRoom);
addStation('furnace', 61, 47, homeRoom);
addStation('chest', 87, 47, homeRoom);
quest.beds.forEach(bedThing);

// the buildings you can walk into. the cave opens once the grizzly is dead,
// home is always open. neither works in a biome that's still locked.
const BUILDINGS = [
  { thing: caveThing, tile: cavePoi.at, room: caveRoom, name: 'The Cave', open: caveOpen,
    shut: ['Not yet', 'Something dangerous sleeps here...', 'Deal with the grizzly first...'], hint: () => caveOpen() && !quest.cave.part },
  { thing: campHouse, tile: [HOUSE.x, HOUSE.y], room: homeRoom, name: 'Home', open: () => true, hint: () => !quest.homeVisited }
];

// the mines' art: the mole holes, the little moles, moe the mole and his drill,
// and the insides of the holes. everything here is drawn facing right like the
// other creatures.

// a hole in the mine floor, seen from above: a ring of fresh dirt thrown up
// round a dark pit, with a few pebbles in it. the edge is lumpy on purpose so
// it reads as clods of dirt and not a drawn oval.
function makeMoleHole() {
  const w = 36, h = 24, cx = 17.5, cy = 12.5;
  const G = pixelGrid(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - cx) / 16, dy = (y - cy) / 10.5;
    const d = Math.sqrt(dx * dx + dy * dy) - (hash2(x >> 1, y >> 1, 610) - 0.5) * 0.24;
    if (d > 1) continue;
    const pit = ((x - cx) / 9.5) ** 2 + ((y - cy - 0.5) / 5.2) ** 2;
    let col;
    if (pit <= 1) col = pit > 0.62 && y < cy ? '#2a2018' : '#0d0a08';
    else {
      const lit = -(dx * 0.5 + dy * 0.9) + (hash2(x, y, 611) - 0.5) * 0.5;
      col = lit > 0.45 ? '#a8865f' : lit > 0 ? '#8a6a4c' : lit > -0.4 ? '#6b5038' : '#4e3a28';
      if (hash2(x, y, 612) < 0.05) col = '#9a9a9a';
    }
    G.set(x, y, col);
  }
  return G.outline(() => '#2b1e14').canvas();
}

// a mole: dark velvet fur, a pink star of a nose, and two big front teeth
// (they're why it bites harder than the hyena). frames 0-3 shuffle along,
// 'crouch' bares the teeth, 'lunge' is the bite with the jaw open.
const MOLE_FUR = { light: '#8a7aa6', base: '#6a5b82', mid: '#54476a', shade: '#3d3350' };
function moleFur(F, seed) {
  return (dx, dy, x, y) => {
    const lit = -(dx * 0.55 + dy * 0.8);
    let c = lit > 0.55 ? F.light : lit > 0.05 ? F.base : lit > -0.45 ? F.mid : F.shade;
    // short darker strokes so the fur reads as velvet instead of plastic
    if (lit < 0.3 && lit > -0.45 && hash2(x >> 1, y, seed) < 0.07) c = F.shade;
    return c;
  };
}
function moleNose(G, nx, ny) {
  [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b]) => G.set(nx + a, ny + b, '#ff8fb6'));
  [[-1, -1], [1, -2], [2, -1], [2, 2], [1, 3], [-1, 2]].forEach(([a, b]) => G.set(nx + a, ny + b, '#ffc4d8'));
  G.set(nx + 2, ny, '#e66f98'); G.set(nx + 2, ny + 1, '#e66f98');
}
function makeMole(frame, pose) {
  const G = pixelGrid(34, 19);
  const ground = 17, lunge = pose === 'lunge', crouch = pose === 'crouch' ? 1 : 0, ahead = lunge ? 2 : 0;
  const fur = moleFur(MOLE_FUR, 620);
  [[8, 0], [12, 1], [17 + ahead, 1], [21 + ahead, 0]].forEach(([fx, grp], n) => {
    const off = lunge ? (n < 2 ? -1 : 1) : STEP[grp][frame % 4];
    G.set(fx + off, ground - 1, '#d68aa0'); G.set(fx + off + 1, ground - 1, '#d68aa0');
    G.set(fx + off, ground, '#ece4d4'); G.set(fx + off + 2, ground, '#ece4d4');
  });
  pxBlob(G, 13 + ahead / 2, 10 + crouch, 9.5 + ahead / 2, 6, fur);
  const hx = 21 + ahead, hy = 8 + crouch;
  pxBlob(G, hx, hy, 5, 4.5, fur);
  pxBlob(G, hx + 4, hy + 1.5, 2.6, 2, (dx, dy) => (dy < 0 ? MOLE_FUR.light : MOLE_FUR.base));
  moleNose(G, hx + 7, hy);
  G.set(hx + 1, hy - 1, '#120c18'); G.set(hx + 2, hy - 1, '#ff4a3a');
  const ty = hy + 3;
  if (lunge) {
    for (let x = hx + 2; x <= hx + 6; x++) G.set(x, ty + 1, '#2a0f18');
    [[3, 0], [4, 0], [3, 2], [4, 2], [3, 3]].forEach(([a, b]) => G.set(hx + a, ty + b, '#fffbe8'));
  } else {
    [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]].forEach(([a, b]) => G.set(hx + 3 + a, ty + b, b === 2 || a === 1 ? '#cfc3a6' : '#fffbe8'));
    if (crouch) { G.set(hx + 2, ty, '#2a0f18'); G.set(hx + 5, ty, '#2a0f18'); }
  }
  [[hx - 1, ground - 2], [hx, ground - 2], [hx + 1, ground - 1]].forEach(([x, y]) => G.set(x, y, '#ece4d4'));
  return G.outline(() => '#1a1222').canvas();
}
// a mole waiting under the floor: a hump of dirt with the tip of its nose
// poking out (it ducks back in every so often, that's the second frame)
function makeMoleMound(peek) {
  const G = pixelGrid(24, 12);
  pxBlob(G, 12, 8.5, 10, 4, (dx, dy, x, y) => {
    const lit = -(dx * 0.5 + dy * 0.9) + (hash2(x, y, 630) - 0.5) * 0.5;
    return lit > 0.4 ? '#a8865f' : lit > -0.1 ? '#8a6a4c' : '#6b5038';
  });
  if (peek) moleNose(G, 11, 3);
  return G.outline(() => '#2b1e14').canvas();
}

// moe the mole: a big pear of dark velvet fur in a yellow mining helmet with
// its lamp lit, a pink star nose, two huge front teeth, a scar across one
// squinting red eye, a tool belt with spare bits hanging off it, and a digging
// claw the size of your head held up behind him. his near hand holds the
// drill, which is drawn separately so it can point anywhere (see makeDrillGrid).
// each frame remembers how far it's shifted down (oy) so the hand and the lamp
// can follow it.
const MOE_W = 54, MOE_H = 50, MOE_HAND = { x: 39, y: 33 }, MOE_LAMP = { x: 44, y: 9 };
function makeMoe(frame, pose) {
  const G = pixelGrid(MOE_W, MOE_H);
  const F = { light: '#7d6d99', base: '#5c4e74', mid: '#473b5e', shade: '#31283f' };
  const ground = MOE_H - 2, crouch = pose === 'crouch' ? 2 : 0;
  const oy = crouch + (pose === 'walk' ? frame % 2 : pose === 'idle' ? frame : 0);
  const fur = moleFur(F, 640);
  // the far arm and its claw
  pxLine(G, 15, 30 + oy, 10, 24 + oy, F.shade, 2);
  pxLine(G, 14, 31 + oy, 9, 25 + oy, F.mid, 2);
  pxBlob(G, 9, 22 + oy, 4, 3.2, (dx, dy) => (dy < -0.2 ? '#e8a6ba' : '#c47890'));
  [[5, -1], [7, -0.5], [10, 0], [12, 0.5]].forEach(([x0, lean]) => {
    for (let i = 0; i < 5; i++) G.set(x0 + lean * i * 0.7, 20 + oy - i, i >= 3 ? '#ffffff' : '#ece4d4');
  });
  // feet
  [[13, 0], [30, 1]].forEach(([fx, grp]) => {
    const off = pose === 'walk' ? STEP[grp][frame % 4] : crouch ? (fx < 20 ? -1 : 1) : 0;
    for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) G.set(fx + off + x, ground - 3 + y, y <= 1 ? '#e8a6ba' : '#c47890');
    [1, 3, 5, 7].forEach(k => G.set(fx + off + k, ground + 1, '#ece4d4'));
  });
  // body, belly, tool belt with its buckle and two spare drill bits
  pxBlob(G, 25, 31 + oy, 17, 13, fur);
  pxBlob(G, 29, 34 + oy, 9, 8.5, (dx, dy) => (dy < -0.3 ? '#9a8ab2' : dx + dy > 0.6 ? '#73658a' : '#8a7aa0'));
  for (let x = 8; x <= 42; x++) {
    if (!G.get(x, 37 + oy)) continue;
    G.set(x, 37 + oy, '#6b4020');
    G.set(x, 38 + oy, '#4a2a14');
  }
  for (let y = 36; y <= 39; y++) for (let x = 30; x <= 33; x++) {
    G.set(x, y + oy, y === 36 || y === 39 || x === 30 || x === 33 ? '#a8800f' : '#e0b14a');
  }
  [16, 21].forEach(x => {
    [[0, 0, '#b4bccb'], [1, 0, '#7a8396'], [0, 1, '#b4bccb'], [1, 1, '#7a8396'], [0, 2, '#7a8396']].forEach(([a, b, c]) => G.set(x + a, 39 + oy + b, c));
  });
  // head and snout
  pxBlob(G, 35, 18 + oy, 12, 10, fur);
  pxBlob(G, 45, 22 + oy, 5.5, 3.8, (dx, dy) => (dy < -0.3 ? F.light : dy > 0.4 ? F.mid : F.base));
  // the star nose: a pink knot with tentacles fanning out round it
  const nx = 50, ny = 20 + oy;
  [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b]) => G.set(nx + a, ny + b, '#ff8fb6'));
  [[-1, -2], [1, -3], [3, -2], [3, 1], [2, 3], [0, 3], [-2, 2]].forEach(([a, b]) => {
    G.set(nx + a, ny + b, '#ffc4d8');
    G.set(nx + Math.round(a * 0.5), ny + Math.round(b * 0.5), '#e66f98');
  });
  G.set(nx, ny, '#ffd6e4');
  // mouth and the two big teeth
  for (let x = 42; x <= 48; x++) G.set(x, 25 + oy, '#1a1018');
  for (let y = 26; y <= 29; y++) [44, 45, 46, 47].forEach(x => G.set(x, y + oy, x === 45 || x === 47 || y === 29 ? '#cfc3a6' : '#fffbe8'));
  // the scar, then the eye: a mean little squint under a heavy brow, with a
  // red glint in it
  pxLine(G, 36, 12 + oy, 42, 21 + oy, '#c49aae');
  [[36, 15], [37, 15], [38, 16], [39, 16], [40, 16], [41, 16]].forEach(([x, y]) => G.set(x, y + oy, '#1a1018'));
  [[38, 17, '#120c18'], [39, 17, '#ff4a3a'], [40, 17, '#ffb09a'], [38, 18, '#120c18'], [39, 18, '#120c18'], [40, 18, '#120c18']].forEach(([x, y, c]) => G.set(x, y + oy, c));
  // mining helmet: a yellow dome lit from the top left, the brim, and the lamp
  for (let y = 3; y <= 13; y++) for (let x = 20; x <= 47; x++) {
    const dx = (x - 33.5) / 12.5, dy = (y - 13) / 8.5;
    if (dx * dx + dy * dy > 1) continue;
    const lit = -(dx * 0.6 + dy * 0.7);
    G.set(x, y + oy, lit > 0.75 ? '#fff0a0' : lit > 0.3 ? '#f2c84b' : '#c99a1e');
  }
  for (let x = 20; x <= 47; x++) { G.set(x, 13 + oy, '#d9b23a'); G.set(x, 14 + oy, '#a8800f'); }
  G.set(27, 7 + oy, '#ffffff'); G.set(28, 6 + oy, '#ffffff'); G.set(29, 6 + oy, '#fffbe0');
  for (let y = 6; y <= 11; y++) for (let x = 42; x <= 46; x++) G.set(x, y + oy, '#3a3f47');
  for (let y = 7; y <= 10; y++) for (let x = 43; x <= 45; x++) G.set(x, y + oy, '#fff6c0');
  G.set(44, 8 + oy, '#ffffff'); G.set(44, 9 + oy, '#ffffff');
  // near arm reaching forward to the drill
  pxLine(G, 31, 27 + oy, 38, 32 + oy, F.base, 2);
  pxLine(G, 31, 29 + oy, 37, 34 + oy, F.mid);
  pxBlob(G, 39, 33 + oy, 2.6, 2.4, (dx, dy) => (dy < 0 ? '#e8a6ba' : '#c47890'));
  const c = G.outline(() => '#1a1222').canvas();
  c.oy = oy;
  return c;
}

// the drill: a rubber grip with a trigger, a hazard striped motor housing
// with vents and a red light, a steel collar, and a long bit with a thread
// wound round it. it points right with the grip at (3, 7). there are three
// spin frames: the thread creeps along the bit, which is what makes it look
// like it's turning.
function makeDrillGrid(spin) {
  const G = pixelGrid(38, 15);
  for (let y = 5; y <= 9; y++) for (let x = 0; x <= 5; x++) G.set(x, y, y === 5 ? '#4a4a56' : '#2b2b33');
  G.set(6, 10, '#2b2b33'); G.set(6, 11, '#2b2b33'); G.set(7, 11, '#2b2b33');
  for (let y = 2; y <= 12; y++) for (let x = 6; x <= 17; x++) {
    if ((y === 2 || y === 12) && (x === 6 || x === 17)) continue;
    let col = y <= 3 ? '#fff0a0' : y >= 11 ? '#a8800f' : ((x + y) >> 1) % 2 ? '#f2c84b' : '#1f1f24';
    if (y === 2 && x % 3 === 0 && x > 7 && x < 17) col = '#1b1b20';
    G.set(x, y, col);
  }
  G.set(8, 4, '#ff3b30'); G.set(9, 4, '#ff8a80');
  for (let y = 3; y <= 11; y++) { G.set(18, y, y < 6 ? '#ffffff' : '#c9c4bd'); G.set(19, y, '#827d77'); }
  for (let x = 20; x <= 37; x++) {
    const r = 5.2 * (1 - (x - 20) / 18) + 0.4;
    for (let y = Math.ceil(7 - r); y <= Math.floor(7 + r); y++) {
      const v = (y - 7) / Math.max(r, 0.5);
      const thread = (((x + (y - 7) * 1.4 + spin * 1.33) % 4) + 4) % 4 < 1.3;
      let col = v < -0.35 ? '#eef2f8' : v < 0.35 ? '#b4bccb' : '#7a8396';
      if (thread) col = v < -0.35 ? '#9aa3b3' : '#4f5768';
      G.set(x, y, col);
    }
  }
  G.set(37, 7, '#ffffff');
  return G.outline(() => '#121218');
}
// turn a pixel grid round a pivot at every one of `steps` angles. it's the
// rotsprite trick from the title screen: blow it up 4x with scale2x first so
// the edges stay clean, rotate, then sample back down at 1x. the pivot ends
// up in the middle of each D x D canvas.
function rotSet(G, px, py, D, steps) {
  const P = rotPrep(G);
  return Array.from({ length: steps }, (_, k) => rotDraw(P, px, py, D, (k / steps) * Math.PI * 2, 1));
}
function rotPrep(G) {
  const w = G.w, h = G.h, src = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) src.push(G.get(x, y));
  return { big: epx2(epx2(src, w, h), w * 2, h * 2), BW: w * 4, BH: h * 4 };
}
// one angle, optionally blown up while staying on the 1x pixel grid: along
// stretches it down its length, across (if given) through its thickness
function rotDraw(P, px, py, D, a, along, across = along) {
  const ca = Math.cos(a), sa = Math.sin(a), c = mk(D, D), g = c.getContext('2d');
  for (let oy = 0; oy < D; oy++) for (let ox = 0; ox < D; ox++) {
    const vx = ox + 0.5 - D / 2, vy = oy + 0.5 - D / 2;
    const bx = Math.floor((px + (vx * ca + vy * sa) / along) * 4), by = Math.floor((py + (-vx * sa + vy * ca) / across) * 4);
    if (bx < 0 || by < 0 || bx >= P.BW || by >= P.BH) continue;
    const col = P.big[by * P.BW + bx];
    if (col) { g.fillStyle = col; g.fillRect(ox, oy, 1, 1); }
  }
  return c;
}
const DRILL_STEPS = 32, DRILL_D = 74;
const DRILL_ROT = [0, 1, 2].map(spin => rotSet(makeDrillGrid(spin), 3.5, 7.5, DRILL_D, DRILL_STEPS));
// when he comes up out of the floor the drill he's holding over his head is
// exactly as wide as his hole (13px thick x 4 = 52, HOLE_RX * 2), so what you
// see is what hurts you, but only 1.5 times as long (it was 2.4, which looked
// like a tower, alex wanted it squatter and more believable). it only ever
// points straight up, so that one angle is all that's drawn.
const DRILL_BIG = 1.5, DRILL_WIDE = 4, DRILL_BIG_D = 124;
const DRILL_UP = [0, 1, 2].map(spin => rotDraw(rotPrep(makeDrillGrid(spin)), 3.5, 7.5, DRILL_BIG_D, -Math.PI / 2, DRILL_BIG, DRILL_WIDE));

// a pile of rocks that comes down over the way out when the fight starts
function makeRubble() {
  const G = pixelGrid(34, 22);
  [[8, 15, 7, 6], [26, 15, 7, 6], [17, 13, 9, 8], [11, 8, 5, 4], [23, 8, 5, 4], [17, 5, 4, 3.5]].forEach(([cx, cy, rx, ry], i) =>
    pxBlob(G, cx, cy, rx, ry, (dx, dy, x, y) => {
      const lit = -(dx * 0.6 + dy * 0.8) + (hash2(x, y, 650 + i) - 0.5) * 0.4;
      return lit > 0.5 ? '#a6a6a6' : lit > 0.05 ? '#8a8a8a' : lit > -0.4 ? '#6e6e6e' : '#575757';
    }));
  return G.outline(() => '#262626').canvas();
}

// the inside of a mole hole: walls of packed earth and rock that bulge in and
// out, roots hanging through the back, the odd fleck of ore, a floor of loose
// dirt scored with claw marks, and the slope back up to daylight at the
// bottom (that's the way out). moe's den is the same thing much bigger, mostly
// rock, propped up by old mine timbers, with the floor pocked by holes he's
// filled back in. the collision is the plain rectangle from roomWalls, same as
// every other room.
function paintDig(cols, rows, door, seed, den) {
  const w = cols * TILE, h = rows * TILE;
  const c = mk(w, h), g = c.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  const doorL = door * TILE, doorR = (door + 1) * TILE;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const wob = (vnoise(x / 9, y / 9, seed) - 0.5) * 9;
    const top = 32 + wob, side = 16 + wob * 0.7, bot = h - 16 - wob * 0.7;
    const inDoor = x > doorL + 1 && x < doorR - 1 && y > h - 20;
    const fromWall = Math.min(y - top, x - side, w - side - x, inDoor ? 99 : bot - y);
    const n = hash2(x, y, seed + 1);
    let r, gg, b;
    if (fromWall < 0) {
      const face = y < top && y > top - 12 && x > side && x < w - side;
      const rock = vnoise(x / 14, y / 14, seed + 2) > (den ? 0.4 : 0.62);
      const v = face ? 96 - (top - y) * 3 : fromWall > -2 ? 74 : 38;
      if (rock) { r = v; gg = v - 3; b = v - 6; } else { r = v * 1.05; gg = v * 0.8; b = v * 0.58; }
      if (n < 0.12) { r -= 14; gg -= 12; b -= 10; } else if (n > 0.94) { r += 14; gg += 12; b += 10; }
    } else {
      const loose = vnoise(x / 16, y / 16, seed + 3) > 0.55;
      r = loose ? 112 : 100; gg = loose ? 86 : 78; b = loose ? 62 : 58;
      if (n < 0.1) { r -= 16; gg -= 14; b -= 12; } else if (n > 0.95) { r += 16; gg += 14; b += 12; }
      if (fromWall < 4) { const k = 22 - fromWall * 5; r -= k; gg -= k; b -= k; }
    }
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const rnd = mulberry32(seed + 4);
  const px = (x, y, col, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), ww, hh); };
  if (den) {
    // old holes he's filled back in: rings of darker loose dirt
    for (let k = 0; k < 14; k++) {
      const cx = 40 + rnd() * (w - 80), cy = 60 + rnd() * (h - 100), rx = 9 + rnd() * 6;
      for (let a = 0; a < Math.PI * 2; a += 0.08) {
        const rr = rx * (0.85 + rnd() * 0.3);
        px(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.45, 'rgba(60,42,28,0.55)', 2, 1);
      }
      px(cx - rx * 0.4, cy - 1, 'rgba(60,42,28,0.25)', rx * 0.8, 2);
    }
    // timbers holding the back wall up: posts with a beam across the top
    for (let x = 36; x < w - 30; x += 72) {
      px(x - 9, 4, '#5e3a1c', 24, 5); px(x - 9, 4, '#8a5a32', 24, 2);
      px(x, 6, '#8a5a32', 5, 26); px(x + 4, 6, '#5e3a1c', 1, 26); px(x, 6, '#a8703f', 1, 26);
    }
    // a pair of old rails coming in from the right wall and stopping short
    for (let x = w - 16; x > w - 120; x -= 1) { px(x, h - 46, '#6e6e6e'); px(x, h - 38, '#6e6e6e'); }
    for (let x = w - 18; x > w - 120; x -= 9) px(x, h - 47, '#5e3a1c', 3, 11);
  }
  // claw marks scored into the floor, three lines at a time
  for (let k = 0; k < (den ? 24 : 9); k++) {
    const x = 24 + rnd() * (w - 48), y = 44 + rnd() * (h - 70), a = rnd() * Math.PI;
    for (let j = -1; j <= 1; j++) for (let s = 0; s < 7; s++) {
      px(x + Math.cos(a) * s + j * 3 * Math.sin(a), y + Math.sin(a) * s - j * 3 * Math.cos(a), 'rgba(40,28,18,0.45)');
    }
  }
  // roots hanging through the back wall
  for (let k = 0; k < cols; k++) {
    if (rnd() < 0.45) continue;
    let x = 16 + rnd() * (w - 32), y = 6 + rnd() * 8;
    const len = 10 + rnd() * 16;
    for (let s = 0; s < len; s++) { px(x, y, '#6b4a2c'); x += (rnd() - 0.5) * 1.4; y += 1; }
  }
  // flecks of ore in the rock, mostly iron
  const ores = [['#e2ddd6', '#8f8a84'], ['#e6c541', '#9a7616'], ['#e0473a', '#7d1a14'], ['#86f2e2', '#2b9c90']];
  for (let k = 0; k < (den ? 22 : 8); k++) {
    const [hi, lo] = ores[rnd() < 0.6 ? 0 : 1 + ((rnd() * 3) | 0)];
    const onSide = rnd() < 0.5;
    const x = onSide ? (rnd() < 0.5 ? 3 + rnd() * 8 : w - 12 + rnd() * 8) : 16 + rnd() * (w - 32);
    const y = onSide ? 36 + rnd() * (h - 56) : 8 + rnd() * 16;
    px(x, y, hi, 2, 1); px(x + 1, y + 1, lo, 2, 1);
  }
  // the slope back up to daylight
  const gr = g.createLinearGradient(0, h, 0, h - 30);
  gr.addColorStop(0, 'rgba(255,240,200,0.45)');
  gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr;
  g.fillRect(doorL, h - 30, TILE, 30);
  return c;
}

// things on the ground: dropped with q, or spilled when you die. each one is a
// stack lying somewhere (out in the world, or in a room) that bobs a little
// and is picked up by walking over it. dropping the same thing on the same
// spot piles it onto what's already there. everything on the ground goes
// after 5 minutes, wherever you are (the last 15 seconds it blinks), except
// the special things.
const GROUND_LIFE = 300, PICKUP_R = 12;
const ground = [];
// quest parts and moe's drill are one of a kind, so they can be dropped (and
// spill when you die) like anything else, but they never despawn: they'd be
// gone for good
const special = st => !!ITEMS[st.id].part || !!ITEMS[st.id].keep || st.id === 'moe-drill';
function groundThing(g) {
  g.thing = { x: g.x, y: g.y, frames: [ICON_CANVAS[g.st.id]], draw: drawGround, ground: g };
  (g.room ? roomById(g.room).things : things).push(g.thing);
}
function dropStack(st, x, y, r, wait = 1, from = null) {
  const max = maxStack(st.id), rid = r ? r.id : null;
  if (max > 1) {
    const pile = ground.find(g => g.room === rid && g.st.id === st.id && g.st.n < max && Math.hypot(g.x - x, g.y - y) < 10);
    if (pile) {
      const k = Math.min(max - pile.st.n, st.n);
      pile.st.n += k;
      pile.age = 0;
      st = { ...st, n: st.n - k };
      if (!st.n) { markDirty(); return; }
    }
  }
  const g = { st: { ...st }, x, y, room: rid, age: 0, wait };
  // thrown from somewhere (your body when you die): it arcs over and lands
  if (from) g.fly = { x0: from.x, y0: from.y, t: 0, dur: 0.45 + Math.random() * 0.35, h: 16 + Math.random() * 18, spin: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3) };
  ground.push(g);
  groundThing(g);
  markDirty();
}
function removeGround(g) {
  ground.splice(ground.indexOf(g), 1);
  const list = g.room ? roomById(g.room).things : things;
  const i = list.indexOf(g.thing);
  if (i >= 0) list.splice(i, 1);
  markDirty();
}
// how many of a stack would fit in your bag right now
function roomFor(st) {
  const max = maxStack(st.id);
  if (max === 1) return inv.slots.some(s => !s) ? 1 : 0;
  return inv.slots.reduce((n, s) => n + (!s ? max : s.id === st.id ? max - s.n : 0), 0);
}
let fullHintT = 0;
function tickGround(dt) {
  fullHintT -= dt;
  const here = room ? room.id : null;
  for (let i = ground.length - 1; i >= 0; i--) {
    const g = ground[i];
    g.age += dt;
    g.wait = Math.max(0, g.wait - dt);
    if (g.fly) {
      g.fly.t += dt;
      if (g.fly.t >= g.fly.dur) {
        g.fly = null;
        burst(g.x, g.y - 2, '150,140,120', 4);
        sfx.chip();
      }
      continue;
    }
    if (g.age >= GROUND_LIFE && !special(g.st)) { removeGround(g); continue; }
    if (player.dead || g.wait > 0 || g.room !== here || Math.hypot(g.x - player.x, g.y - player.y) > PICKUP_R) continue;
    const k = Math.min(g.st.n, roomFor(g.st));
    if (!k) {
      if (fullHintT <= 0) { floatText('Bag full', player.x, player.y - 34, '#cfcfcf'); fullHintT = 2; }
      continue;
    }
    if (maxStack(g.st.id) === 1) addStack({ ...g.st });
    else addItem(g.st.id, k);
    floatText(`+${k} ${ITEMS[g.st.id].name}`, g.x, g.y - 14, '#9bf07a');
    sfx.pickup();
    g.st.n -= k;
    if (!g.st.n) removeGround(g);
  }
}
function drawGround(o, toX, toY, t) {
  const g = o.ground, img = ICON_CANVAS[g.st.id];
  // still in the air: along an arc from where it was thrown, spinning, with
  // its shadow sliding along the ground under it
  if (g.fly) {
    const f = g.fly, k = Math.min(1, f.t / f.dur), e = 1 - (1 - k) * (1 - k);
    const x = f.x0 + (g.x - f.x0) * e, gy = f.y0 + (g.y - f.y0) * e, lift = 4 * f.h * k * (1 - k);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(toX(x - 4), toY(gy - 1), 8 * S, 2 * S);
    ctx.save();
    ctx.translate(toX(x), toY(gy - 7 - lift));
    ctx.rotate(f.spin * k * Math.PI);
    ctx.drawImage(img, -6 * S, -6 * S, 12 * S, 12 * S);
    ctx.restore();
    return;
  }
  // blinking out in its last 15 seconds
  if (!special(g.st) && GROUND_LIFE - g.age < 15 && Math.floor(t / 150) % 2) return;
  const bob = reduceMotion ? 0 : Math.round(Math.sin(t / 350 + g.x) * 1.5);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(toX(g.x - 5), toY(g.y - 1), 10 * S, 2 * S);
  // a pile shows a second one peeking out behind
  if (g.st.n > 1) ctx.drawImage(img, toX(g.x - 4), toY(g.y - 15 + bob), 12 * S, 12 * S);
  ctx.drawImage(img, toX(g.x - 6), toY(g.y - 13 + bob), 12 * S, 12 * S);
}
function groundAt(m) {
  const here = room ? room.id : null;
  return ground.find(g => g.room === here && Math.abs(m.x - g.x) < 8 && m.y > g.y - 16 && m.y < g.y + 2) || null;
}
// out of a slot: one, or the whole stack. it lands a step in front of you,
// the way you're aiming (or at your feet if that's a wall).
function dropFrom(ref, all) {
  const st = slotGet(ref);
  if (!st || ref.startsWith('out')) return;
  const n = all ? st.n : 1;
  const out = { ...st, n };
  st.n -= n;
  if (!st.n) slotSet(ref, null);
  const a = aimAngle();
  let x = player.x + Math.cos(a) * 20, y = player.y + Math.sin(a) * 20;
  if (blocked(x, y)) { x = player.x; y = player.y + 2; }
  dropStack(out, x, y, room, 1.2);
  sfx.swing();
  afterInventoryChange();
}
// dying spills everything round where you fell: it all bursts out of you and
// arcs over to land in a ring round your body (see dropStack's from). it waits there for 5 minutes
// (the special things for good), even in a boss's den: walk back in (the boss
// starts again from full) and it's still lying on the floor.
function spillInventory() {
  const all = [];
  inv.slots.forEach((st, i) => { if (st) { all.push(st); inv.slots[i] = null; } });
  ARMOR_SLOTS.forEach(a => { if (inv.armor[a.key]) { all.push(inv.armor[a.key]); inv.armor[a.key] = null; } });
  all.forEach(st => {
    let x = player.x, y = player.y;
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 26;
      const tx = player.x + Math.cos(a) * d, ty = player.y + Math.sin(a) * d * 0.8;
      if (!blocked(tx, ty)) { x = tx; y = ty; break; }
    }
    dropStack(st, x, y, room, 2, { x: player.x, y: player.y - 4 });
  });
  markDirty();
}

// the mines, chapter two. moles have dug holes all over the early mines
// (MOLE_HOLES in the engine): three burrows, each with a chest of mine loot and
// a few moles with big teeth in it. every project landmark in the mines is a
// boss's lair, and the first one, mailsisi's, is moe the mole's den. beating
// him is what reveals it.
const HOLE = makeMoleHole();
// how far from a hole you come out, and how far in from a hole room's way out
// you start, so stopping just after going through never leaves you standing
// on the spot that takes you straight back
const HOLE_STEP = 30, HOLE_IN = 34;
const holeThings = MOLE_HOLES.map(([x, y]) => {
  const t = { flat: true, hole: true, x: x * TILE + 8, y: y * TILE + 14, frames: [HOLE] };
  things.push(t);
  return t;
});

// a creature that lives in a room instead of out in the world. it only moves
// while you're in there with it.
function spawnRoomCreature(kind, r, x, y) {
  const def = CREATURES[kind];
  const c = {
    kind, def, frames: framesFor(kind), creature: true, room: r,
    hx: x, hy: y, x, y, hp: def.hp, state: def.rest, t: 0, cd: 0.6, sinceHit: 99, anim: 0, flip: x > r.w / 2,
    hurtT: 0, kx: 0, ky: 0, lx: 0, ly: 0, moving: false, wander: null, wanderT: 0, draw: drawCreature
  };
  creatures.push(c);
  r.things.push(c);
  return c;
}

// a burrow's chest: a little of whatever the moles have dug up. raw iron is
// nearly always in there, gold and rubies sometimes, an emerald or a diamond
// hardly ever (those come from the later bosses), and sometimes a few iron arrows somebody dropped (handy for
// moe). rolled once, the first time the game sees it, and then saved.
function rollBurrowLoot() {
  const out = [];
  const add = (chance, id, a, b) => { if (Math.random() < chance) out.push(makeStack(id, rand(a, b))); };
  add(0.9, 'iron-ore', 2, 5);
  add(0.45, 'gold-ore', 1, 3);
  add(0.3, 'ruby', 1, 2);
  add(0.35, 'iron-arrow', 2, 4);
  add(0.03, 'emerald', 1, 1);
  add(0.02, 'diamond', 1, 1);
  if (out.length < 2) out.push(makeStack('stone', rand(3, 8)));
  return Array.from({ length: 6 }, (_, i) => out[i] || null);
}
// moe's chest is the better haul, and it's locked until he's beaten. iron
// ingots and raw gold for sure, then maybe a diamond, an emerald, a sword and
// a set of armor, each rarer than the one before. moe is the easiest boss, so
// a sword or armor is nearly always iron, and the diamonds and emeralds are
// kept mostly for the bosses after him.
function rollDenLoot() {
  const out = [makeStack('iron', rand(3, 6)), makeStack('gold-ore', rand(2, 4))];
  const add = (chance, id, a, b) => { if (Math.random() < chance) out.push(makeStack(id, rand(a, b))); };
  add(0.2, 'diamond', 1, 1);
  add(0.12, 'emerald', 1, 1);
  const tier = () => { const r = Math.random(); return r < 0.03 ? 'diamond' : r < 0.12 ? 'emerald' : 'iron'; };
  if (Math.random() < 0.2) out.push(makeStack(`${tier()}-sword`));
  if (Math.random() < 0.1) out.push(makeStack(`${tier()}-${ARMOR_SLOTS[(Math.random() * 4) | 0].piece}`));
  return Array.from({ length: 12 }, (_, i) => out[i] || null);
}

// the three burrows: where the moles wait under the floor, the chest, and a
// few things to look at. rooms are 13 x 8 tiles of floor inside the walls.
// the moles sit at least 3.5 tiles (their aggro range) from where you come
// in, so you get a moment to look around before they come up.
const BURROW_COLS = 13, BURROW_ROWS = 9, BURROW_DOOR = 6;
const BURROWS = [
  { moles: [[40, 60], [160, 78]], chest: [56, 47], shrooms: [[26, 100], [184, 60]], rocks: [[124, 62, 0], [172, 118, 1]] },
  { moles: [[40, 76], [176, 80], [120, 50]], chest: [152, 47], shrooms: [[182, 106], [28, 56]], rocks: [[80, 114, 1], [42, 116, 0]] },
  { moles: [[40, 50], [172, 86], [36, 96]], chest: [104, 47], shrooms: [[24, 62], [184, 116]], rocks: [[150, 56, 0], [64, 58, 1]] }
];
const doorLight = (cols, rows, door) => ({ x: door * TILE + 8, y: rows * TILE - 6, rgb: '255,236,200', rad: 3.2, flicker: true, strength: 0.2 });
const burrowRooms = BURROWS.map((B, i) => {
  const hole = holeThings[i];
  const save = quest.burrows[i] || (quest.burrows[i] = { visited: false, dead: [], chest: null });
  if (!Array.isArray(save.chest)) save.chest = rollBurrowLoot();
  const r = {
    id: `burrow-${i}`, burrow: i, w: BURROW_COLS * TILE, h: BURROW_ROWS * TILE, dust: '#7a5c40', shade: 0.95, fight: true,
    canvas: paintDig(BURROW_COLS, BURROW_ROWS, BURROW_DOOR, 7000 + i * 31, false),
    outside: { x: hole.x, y: hole.y }, exit: { x: hole.x, y: hole.y + HOLE_STEP }, door: BURROW_DOOR,
    blocked: roomWalls(BURROW_COLS, BURROW_ROWS, BURROW_DOOR), things: [],
    glows: [doorLight(BURROW_COLS, BURROW_ROWS, BURROW_DOOR)]
  };
  const st = addStation('chest', B.chest[0], B.chest[1], r);
  st.slots = save.chest;
  st.where = 'in the burrow';
  B.shrooms.forEach(([x, y]) => {
    r.things.push({ x, y, frames: [makeShrooms()] });
    r.glows.push({ x, y: y - 4, rgb: '95,230,200', rad: 2.4, flicker: true, strength: 0.24 });
  });
  B.rocks.forEach(([x, y, v]) => r.things.push({ x, y, frames: [BOULDERS[v]] }));
  B.moles.forEach(([x, y], j) => {
    if (save.dead[j]) return;
    const m = spawnRoomCreature('mole', r, x, y);
    m.onDeath = () => {
      save.dead[j] = true;
      markDirty();
      if (burrowsCleared()) setTimeout(() => toast('The Mines', 'Mole Holes cleared!', 'Something bigger is digging nearby...'), 900);
    };
  });
  return r;
});
// a hole is cleared once every mole in it is dead. moe's den stays shut until
// all three are (alex), so you've fought the little ones before the big one.
const burrowsCleared = () => BURROWS.every((B, i) => B.moles.every((_, j) => quest.burrows[i] && quest.burrows[i].dead[j]));
const burrowsLeft = () => BURROWS.filter((B, i) => !B.moles.every((_, j) => quest.burrows[i] && quest.burrows[i].dead[j])).length;

// moe's den: 24 x 16 tiles, too big to fit on screen, so the camera follows
// you round it (roomCam in the engine). torches on the timbers, a few loose
// rocks, the locked chest at the back, and moe himself waiting under the
// middle of the floor.
const DEN_COLS = 24, DEN_ROWS = 16, DEN_DOOR = 12;
const denPoi = POIS.find(p => p.kind === 'den');
const denHole = denPoi.thing;
const denWalls = roomWalls(DEN_COLS, DEN_ROWS, DEN_DOOR);
const denRoom = {
  id: 'den', w: DEN_COLS * TILE, h: DEN_ROWS * TILE, dust: '#7a5c40', shade: 0.42, fight: true, sealed: false,
  canvas: paintDig(DEN_COLS, DEN_ROWS, DEN_DOOR, 9100, true),
  outside: { x: denHole.x, y: denHole.y }, exit: { x: denHole.x, y: denHole.y + HOLE_STEP }, door: DEN_DOOR,
  // once the fight starts, the way out is buried under rocks until he's beaten
  blocked: (x, y) => denWalls(x, y) || (denRoom.sealed && y > DEN_ROWS * TILE - 26 && Math.abs(x - (DEN_DOOR * TILE + 8)) < 18),
  things: [], glows: [doorLight(DEN_COLS, DEN_ROWS, DEN_DOOR)]
};
if (!Array.isArray(quest.denChest)) quest.denChest = rollDenLoot();
const denChest = addStation('chest', denRoom.w / 2, 47, denRoom);
denChest.slots = quest.denChest;
denChest.where = 'in Moe\'s den';
const LOCKED_CHEST = makeChest(true);
function lockDenChest(locked) {
  denChest.locked = locked;
  denChest.frames = locked ? [LOCKED_CHEST] : [makeChest()];
}
lockDenChest(!quest.moe.dead);
[36, 108, 252, 324].forEach(x => {
  const t = { x: x + 2, y: 30, frames: TORCH, fps: 7, phase: x % 3 };
  denRoom.things.push(t);
  denRoom.glows.push({ x: t.x, y: t.y - 12, rgb: GLOW.torch, rad: 3, flicker: true, strength: 0.24 });
});
[[60, 90, 1], [330, 120, 0], [74, 200, 0], [300, 206, 1]].forEach(([x, y, v]) => denRoom.things.push({ x, y, frames: [BOULDERS[v]] }));
const rubble = { x: DEN_DOOR * TILE + 8, y: denRoom.h - 1, frames: [makeRubble()], gone: true };
denRoom.things.push(rubble);

// moe himself. he isn't an ordinary hunter: updateMoe runs his fight and
// drawMoe draws him, and the floor under him (the hole he's in, the bulge
// that chases you while he's underground, the cracks where he's about to come
// up) is its own flat thing so it always draws under everything else.
const MOE_FRAMES = {
  idle: [makeMoe(0, 'idle'), makeMoe(1, 'idle')],
  walk: [0, 1, 2, 3].map(f => makeMoe(f, 'walk')),
  crouch: makeMoe(0, 'crouch')
};
MOE_FRAMES.white = new Map([...MOE_FRAMES.idle, ...MOE_FRAMES.walk, MOE_FRAMES.crouch].map(c => [c, whiteOf(c)]));
const MOE_HOME = { x: denRoom.w / 2, y: 140 };
const moe = {
  kind: 'moe', def: CREATURES.moe, creature: true, room: denRoom, frames: [MOE_FRAMES.idle[0]], draw: drawMoe,
  hx: MOE_HOME.x, hy: MOE_HOME.y, x: MOE_HOME.x, y: MOE_HOME.y, hp: CREATURES.moe.hp, state: 'wait', t: 0, cd: 0,
  sinceHit: 99, anim: 0, flip: false, hurtT: 0, kx: 0, ky: 0, aim: Math.PI / 2, spin: 0, sink: 1, under: true,
  pops: 0, lunges: 0, trail: [], spot: null, tellK: null, mx: 0, my: 0,
  dead: !!quest.moe.dead, gone: !!quest.moe.dead
};
creatures.push(moe);
const moeFloor = { flat: true, x: 0, y: 0, frames: [mk(1, 1)], draw: drawMoeFloor };
denRoom.things.push(moe, moeFloor);
// his helmet lamp, and the patch of floor it lights up in front of him
const moeLamp = { x: 0, y: 0, rgb: '255,244,200', rad: 2.2, flicker: true, strength: 0.3, off: true };
const moeBeam = { x: 0, y: 0, rgb: '255,240,190', rad: 2.6, flicker: true, strength: 0.16, off: true };
denRoom.glows.push(moeLamp, moeBeam);

BUILDINGS.push(
  ...burrowRooms.map((r, i) => ({ thing: holeThings[i], tile: MOLE_HOLES[i], room: r, name: 'Mole Hole', hole: true, open: () => true, hint: () => false })),
  { thing: denHole, tile: denPoi.at, room: denRoom, name: 'Moe\'s Den', hole: true, pit: { x: denHole.x, y: denHole.y - 15, w: 12 },
    open: () => burrowsCleared() || !!quest.moe.dead, hint: () => false,
    shut: () => ['Not yet...', 'Something large lurks underneath', `Clear the mole holes first (${burrowsLeft()} left).`] }
);

// the numbers for the fight. tell is how long the floor cracks before he
// comes up (your time to get off it), stuck is how long he's half out of the
// ground and can't hurt you. under half health he gets angrier: quicker
// tells, shorter openings, more pops before he climbs out.
const MOE = {
  dig: 0.8, chase: 1.3, chaseAgain: 0.8, tell: 0.95, tellMad: 0.75, pop: 0.3, stuck: 2.4, stuckMad: 2, climb: 0.6,
  pops: 3, popsMad: 4, stuckSink: 0.42, under: 150, underMad: 190, mad: 0.5,
  // how far his drill reaches from his hand: anywhere in front of him closer
  // than this and the bit is in you
  reach: 40, keep: 4.5, backOff: 2.5
};
let cine = null, shakeAmp = 0;
const bossHints = new Set();
function bossHint(key, ...msg) {
  if (bossHints.has(key)) return;
  bossHints.add(key);
  toast(...msg);
}
const addShake = a => { shakeAmp = Math.max(shakeAmp, a); };
function playShake() { return shakeAmp; }
// during the intro the camera goes to moe, not you
function playCamFocus() {
  if (typeof raceCam === 'function') { const f = raceCam(); if (f) return f; }
  return cine && cine.t < 2.3 * cine.k ? { x: moe.hx, y: moe.hy - 24 } : null;
}
function playTravelBlocked() { return room === denRoom && (denRoom.sealed || !!cine); }

// where his hand (and so the drill's grip) and his lamp are in the world,
// for whichever frame he's on, sunk however far he is into the floor
function moePoint(c, p, img) {
  const left = c.x - Math.floor(MOE_W / 2), top = c.y - MOE_H + 2 + Math.round(c.sink * (MOE_H - 4)) + (img.oy || 0);
  return { x: c.flip ? left + (MOE_W - 1 - p.x) : left + p.x, y: top + p.y };
}
function moeFrame(c, t) {
  if (c.state === 'windup') return MOE_FRAMES.crouch;
  if (c.moving || c.state === 'lunge') return MOE_FRAMES.walk[Math.floor(c.anim * 8) % 4];
  return MOE_FRAMES.idle[Math.floor(t / 500) % 2];
}
const moeMad = c => c.hp < c.def.hp * MOE.mad;

function dirtSpray(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 40 + Math.random() * 90;
    particles.push({ x: x + (Math.random() - 0.5) * 16, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 260, life: 0.5 + Math.random() * 0.4, t: 0, col: Math.random() < 0.3 ? '#9a9a9a' : Math.random() < 0.5 ? '#8a6a4c' : '#6b5038', size: 1 + (Math.random() < 0.4) });
  }
}

function updateMoe(c, dt) {
  const def = c.def, mad = moeMad(c);
  c.hurtT = Math.max(0, c.hurtT - dt);
  c.t += dt;
  c.moving = false;
  c.spin += dt * (['windup', 'lunge', 'dig', 'pop', 'stuck'].includes(c.state) ? 30 : 12);
  const img = moeFrame(c, performance.now());
  const hand = moePoint(c, MOE_HAND, img);
  // aimed from the middle of his body, not his hand: the hand moves when he
  // turns round, which moved the aim, which turned him round again, and he
  // twitched back and forth whenever you were above or below him
  const toYou = Math.atan2(player.y - 10 - (c.y - 24), player.x - c.x);
  // the drill swings round smoothly (eased, with a top speed) instead of
  // snapping, and he only turns his body once the drill is well past straight
  // up or down, so it never flickers side to side
  const turn = (target, rate) => {
    const d = Math.atan2(Math.sin(target - c.aim), Math.cos(target - c.aim));
    c.aim += clamp(d * Math.min(1, dt * 8), -rate * dt, rate * dt);
  };
  const face = () => {
    const cx = Math.cos(c.aim);
    if (cx < -0.3) c.flip = true;
    else if (cx > 0.3) c.flip = false;
  };
  const d = Math.hypot(player.x - c.x, player.y - c.y);
  const walk = (tx, ty, speed) => {
    const vx = tx - c.x, vy = ty - c.y, l = Math.hypot(vx, vy);
    if (l < 2) return;
    moveBody(c, (vx / l) * speed * dt, (vy / l) * speed * dt);
    c.moving = true;
  };
  switch (c.state) {
    case 'face':
      // above ground the drill never stops pointing at you. he keeps about
      // four and a half tiles off and every couple of seconds he lunges.
      turn(toYou, 6);
      face();
      if (d > MOE.keep * TILE) walk(player.x, player.y, def.speed);
      else if (d < MOE.backOff * TILE && d > 0) walk(c.x - (player.x - c.x), c.y - (player.y - c.y), def.speed * 0.6);
      if (c.t > (c.lunges ? 1.2 : 1.8) && d < 6.5 * TILE && !player.dead) { c.state = 'windup'; c.t = 0; sfx.rev(); }
      break;
    case 'windup':
      turn(toYou, 6);
      face();
      if (Math.random() < dt * 30) burst(hand.x + Math.cos(c.aim) * 30, hand.y + Math.sin(c.aim) * 30, '255,220,140', 1);
      if (c.t >= def.windup) { c.lx = Math.cos(c.aim); c.ly = Math.sin(c.aim); c.state = 'lunge'; c.t = 0; sfx.bite(); }
      break;
    case 'lunge': {
      const bx = c.x, by = c.y;
      moveBody(c, c.lx * def.lunge.speed * dt, c.ly * def.lunge.speed * dt);
      c.moving = true;
      // ran the drill into the wall: it sticks in the rock for a moment, and
      // with it out of the way he's open from any side
      if (c.t > 0.05 && Math.hypot(c.x - bx, c.y - by) < def.lunge.speed * dt * 0.3) {
        c.state = 'dazed'; c.t = 0;
        addShake(3); sfx.clang();
        burst(hand.x + c.lx * 34, hand.y + c.ly * 34, '255,220,140', 14);
        break;
      }
      if (c.t >= def.lunge.time) { c.state = 'recover'; c.t = 0; }
      break;
    }
    case 'dazed':
      if (c.t > 1.3) { c.state = 'recover'; c.t = 0; }
      break;
    case 'recover':
      turn(toYou, 4);
      face();
      if (c.t > 0.5) {
        c.lunges++;
        c.t = 0;
        c.state = c.lunges >= (mad ? 1 : 2) ? 'dig' : 'face';
        if (c.state === 'dig') { sfx.rumble(); moeCallMoles(2); }
      }
      break;
    case 'dig':
      // drill pointed down, he sinks out of sight
      turn(Math.PI / 2, 10);
      c.sink = Math.min(1, c.t / MOE.dig);
      if (Math.random() < dt * 40) dirtSpray(c.x, c.y - 2, 2);
      addShake(1);
      if (c.t >= MOE.dig) {
        c.state = 'under'; c.t = 0; c.under = true; c.lunges = 0;
        c.mx = c.x; c.my = c.y; c.trail = [];
        bossHint('under', 'Watch the floor', 'He\'s digging...', 'Watch out for the cracks!');
      }
      break;
    case 'under': {
      // a bulge in the floor that runs you down
      const sp = mad ? MOE.underMad : MOE.under, vx = player.x - c.mx, vy = player.y - c.my, l = Math.hypot(vx, vy);
      if (l > 2) {
        c.mx = clamp(c.mx + (vx / l) * Math.min(l, sp * dt), 28, denRoom.w - 28);
        c.my = clamp(c.my + (vy / l) * Math.min(l, sp * dt), 50, denRoom.h - 26);
      }
      const lastT = c.trail[c.trail.length - 1];
      if (!lastT || Math.hypot(lastT[0] - c.mx, lastT[1] - c.my) > 5) { c.trail.push([c.mx, c.my]); if (c.trail.length > 40) c.trail.shift(); }
      addShake(0.7);
      if (Math.random() < dt * 20) dirtSpray(c.mx, c.my - 2, 1);
      if (c.t >= (c.pops ? MOE.chaseAgain : MOE.chase)) {
        c.state = 'tell'; c.t = 0;
        c.spot = { x: clamp(player.x, 28, denRoom.w - 28), y: clamp(player.y, 50, denRoom.h - 26) };
        c.mx = c.spot.x; c.my = c.spot.y;
        sfx.rumble();
      }
      break;
    }
    case 'tell': {
      // the floor cracks open right where he's coming up. get off it.
      const tell = mad ? MOE.tellMad : MOE.tell;
      c.tellK = Math.min(1, c.t / tell);
      addShake(0.6 + c.tellK * 1.2);
      if (Math.random() < dt * 14) dirtSpray(c.spot.x, c.spot.y - 2, 1);
      if (c.t >= tell) {
        c.state = 'pop'; c.t = 0; c.tellK = null;
        c.x = c.spot.x; c.y = c.spot.y; c.under = false; c.sink = 1; c.aim = -Math.PI / 2;
        dirtSpray(c.x, c.y - 4, 26);
        addShake(5); sfx.boom();
        if (!player.dead && inMoeHole(c)) hurtPlayer(def.popDmg, c.x, c.y + 6);
      }
      break;
    }
    case 'pop':
      c.sink = 1 - (1 - MOE.stuckSink) * Math.min(1, c.t / MOE.pop);
      c.aim = -Math.PI / 2;
      if (c.t >= MOE.pop) {
        c.state = 'stuck'; c.t = 0;
        bossHint('stuck', 'Moe\'s dizzy?', 'Hit him now!!!', 'Swings do the most damage while he\'s in the ground. Avoid the drill.');
      }
      break;
    case 'stuck':
      // half out of the hole and dizzy, but the drill he came up with is still
      // spinning over his head: stand on top of him and it keeps chewing on
      // you (see below). hit him from just outside the hole.
      c.aim = -Math.PI / 2;
      c.flip = player.x < c.x;
      if (Math.random() < dt * 30) burst(c.x + (Math.random() - 0.5) * 6, c.y - 4 - 34 * DRILL_BIG, Math.random() < 0.5 ? '255,220,140' : '255,140,60', 1);
      if (c.t >= (mad ? MOE.stuckMad : MOE.stuck)) {
        c.pops++;
        if (c.pops >= (mad ? MOE.popsMad : MOE.pops)) { c.state = 'climb'; c.t = 0; }
        // straight back under, carrying on from halfway down
        else { c.state = 'dig'; c.t = MOE.dig * MOE.stuckSink; sfx.rumble(); moeCallMoles(1); }
      }
      break;
    case 'climb':
      c.sink = MOE.stuckSink * Math.max(0, 1 - c.t / MOE.climb);
      turn(toYou, 6);
      face();
      if (c.t >= MOE.climb) { c.state = 'face'; c.t = 0; c.pops = 0; c.sink = 0; c.spot = null; }
      break;
    case 'dying':
      // sparks, shaking, flashing, then he's gone in a burst of dirt
      addShake(1.5);
      c.hurtT = Math.floor(c.t * 10) % 2 ? 0.05 : 0;
      if (Math.random() < dt * 24) burst(hand.x + (Math.random() - 0.5) * 30, hand.y - Math.random() * 30, Math.random() < 0.5 ? '255,220,140' : '106,91,130', 2);
      if (c.t >= 1.8) finishMoe(c);
      break;
  }
  // touching him above ground hurts, and a lunge hurts a lot. half buried,
  // the big drill still roaring over him hurts anyone standing in his hole:
  // a heart less than coming up under you did (drillDmg 4 to popDmg's 5), every
  // time you're open to it.
  // above ground his reach is the whole length of the drill, and since it's
  // always pointed at you, getting anywhere near him means getting drilled
  const up = ['face', 'windup', 'lunge', 'recover', 'climb'].includes(c.state);
  // (except mid dash: then only his body counts, the old hitbox. with the
  // drill's whole reach a dash was a guaranteed hit, there was no dodging it.)
  if (!player.dead && !c.under && up && (overlap(playerBox(), creatureBox(c)) || (c.state !== 'lunge' && Math.hypot(player.x - hand.x, player.y - 10 - hand.y) < MOE.reach))) {
    hurtPlayer(c.state === 'lunge' ? def.lungeDmg : def.dmg, c.x, c.y - 10);
  }
  if (!player.dead && (c.state === 'pop' || c.state === 'stuck') && inMoeHole(c)) {
    hurtPlayer(def.drillDmg, c.x, c.y + 6);
  }
  if (c.moving) c.anim += dt;
  // the lamp follows his helmet, and the beam goes the way the drill points
  const lampOn = !c.under && c.sink < 0.8 && c.state !== 'wait';
  const lamp = moePoint(c, MOE_LAMP, img);
  Object.assign(moeLamp, { x: lamp.x, y: lamp.y, off: !lampOn });
  Object.assign(moeBeam, { x: lamp.x + Math.cos(c.state === 'stuck' ? (c.flip ? Math.PI : 0) : c.aim) * 34, y: lamp.y + 18 + Math.sin(c.aim) * 20, off: !lampOn });
}

// how much a hit on moe actually does. above ground his drill is between you
// and him: swings barely scratch him unless you've caught him
// side on (straight after a lunge), but arrows get round it. half out of the
// ground he can't turn, so swings land for a quarter again as much (it was
// half, alex toned it down). underground you can't hit him at all.
function bossHit(c, dmg, how) {
  if (c.under || ['wait', 'intro', 'tell', 'dying'].includes(c.state)) return { dmg: 0 };
  if (c.state === 'stuck' || c.state === 'pop') return how === 'arrow' ? { dmg } : { dmg: dmg * 1.25, col: '#ffd23f' };
  if (how === 'arrow' || ['dazed', 'dig', 'climb'].includes(c.state)) return { dmg };
  const img = moeFrame(c, performance.now()), hand = moePoint(c, MOE_HAND, img);
  const toYou = Math.atan2(player.y - 10 - hand.y, player.x - hand.x);
  if (Math.abs(Math.atan2(Math.sin(toYou - c.aim), Math.cos(toYou - c.aim))) > 1.1) return { dmg };
  sfx.clang();
  burst(hand.x + Math.cos(c.aim) * 26, hand.y + Math.sin(c.aim) * 26, '255,220,140', 6);
  bossHint('blocked', 'Blocked', 'He sees you...', 'Maybe arrows while he\'s up, and melee him when he\'s stuck.');
  return { dmg: dmg * 0.15, col: '#aeb8c8' };
}
function bossDown(c) {
  c.state = 'dying'; c.t = 0; c.under = false;
  bossBar(false);
  bossMusic(false);
  sfx.roar();
}
// every time he goes under, moles burst up out of the floor round you: two
// when he first digs down, one more each time he dives back in between pops,
// up to 3 at once (4 when he's angry). they're what makes the underground part
// dangerous: you have to keep moving for the tells while they're biting you.
function moeCallMoles(n) {
  const alive = creatures.filter(k => k.summoned && !k.dead).length;
  const cap = moeMad(moe) ? 4 : 3;
  for (let i = 0; i < n && alive + i < cap; i++) {
    let x = player.x, y = player.y;
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2, d = (3 + Math.random() * 2) * TILE;
      x = clamp(player.x + Math.cos(a) * d, 32, denRoom.w - 32);
      y = clamp(player.y + Math.sin(a) * d, 56, denRoom.h - 28);
      if (Math.hypot(x - player.x, y - player.y) > 2.5 * TILE && Math.hypot(x - moe.x, y - moe.y) > 2 * TILE) break;
    }
    const m = spawnRoomCreature('mole', denRoom, x, y);
    m.summoned = true;
    dirtSpray(x, y - 2, 12);
    aggro(m);
  }
}
function clearMoeMoles(poof) {
  for (let i = creatures.length - 1; i >= 0; i--) {
    const k = creatures[i];
    if (!k.summoned) continue;
    if (poof && !k.dead) burst(k.x, k.y - 6, k.def.chip, 10);
    creatures.splice(i, 1);
    const j = denRoom.things.indexOf(k);
    if (j >= 0) denRoom.things.splice(j, 1);
  }
}
function finishMoe(c) {
  c.dead = true;
  c.gone = true;
  // his moles scatter back underground when he goes
  clearMoeMoles(true);
  quest.moe.dead = true;
  quest.killed.moe = true;
  dirtSpray(c.x, c.y - 10, 40);
  burst(c.x, c.y - 24, '106,91,130', 30);
  addShake(4);
  sfx.boom();
  moeLamp.off = moeBeam.off = true;
  // the way out clears, and the chest comes unlocked
  denRoom.sealed = false;
  rubble.gone = true;
  burst(rubble.x, rubble.y - 10, '140,140,140', 20);
  lockDenChest(false);
  // his drill drops where he went down (special, so it never despawns), and
  // the victory jingle plays
  lootOut('moe-drill', 1, c.x, c.y - 10);
  victoryJingle();
  setTimeout(() => discover(MINE_ORDER[0]), 900);
  setTimeout(() => toast('Moe is no Moe', c.def.name, 'Is that a drill?'), 3200);
  markDirty();
  renderHUD();
}

// moe's theme, written for this game and played live by the synth below (no
// audio file). alex loves the song he picked for moe, so this follows it as
// closely as it can without using its melody (that's the part that would be
// copying). everything else comes from measuring that track: f sharp minor at
// 105 bpm, a strong 3-3-2 pulse (a hit every dotted quarter, then a quick
// one), an 8 bar quiet opening sitting on A, then the bass moving F#, E, F#,
// E, C#, a long stretch on A, and round again, and a warm, muffled, bass
// heavy sound with almost nothing up top. on top of that it keeps the chill,
// whimsical feel alex asked for: a half time backbeat, a plinky marimba, a
// music box lead, plucked bass, and a lo-fi filter over the whole thing. the
// lead is made up as it goes from each bar's chord in 3-3-2 rhythms, so it's
// its own tune.
const SONG = { bpm: 105, steps: 16 };
const REST = null;
const CH = {
  A: [57, 61, 64], Fm: [54, 57, 61], E: [52, 56, 59], C: [49, 53, 56], B: [59, 63, 66], FA: [54, 59, 61]
};
// the long stretches on A in the original have A in the bass but its notes
// centre on F# and B, so FA is an airy F#, B, C# over A (a soft lo-fi chord)
const BASS_ROOT = { FA: 45 };
// one entry per bar. the lead plays a motif (an index into MOTIFS), or holds
// a long note to end a phrase.
const ARR = [
  { ch: 'FA', part: 'intro' }, { ch: 'FA', part: 'intro' }, { ch: 'Fm', part: 'intro' }, { ch: 'A', part: 'intro' },
  { ch: 'FA', part: 'intro2' }, { ch: 'C', part: 'intro2' }, { ch: 'FA', part: 'intro2' }, { ch: 'B', part: 'intro2' },
  { ch: 'Fm', lead: 0, part: 'full' }, { ch: 'E', lead: 1, part: 'full' }, { ch: 'Fm', lead: 2, part: 'full' }, { ch: 'E', lead: 'hold', part: 'full' },
  { ch: 'C', lead: 3, part: 'full' }, { ch: 'FA', lead: 0, part: 'full' }, { ch: 'A', lead: 1, part: 'full' }, { ch: 'FA', lead: 'hold', part: 'full' },
  { ch: 'E', lead: 2, part: 'full' }, { ch: 'Fm', lead: 3, part: 'full' }, { ch: 'E', lead: 0, part: 'full' }, { ch: 'A', lead: 'hold', part: 'full' },
  { ch: 'Fm', lead: 1, part: 'full' }, { ch: 'E', lead: 2, part: 'full' }, { ch: 'C', lead: 3, part: 'full' }, { ch: 'A', lead: 'hold', part: 'full' },
  { ch: 'FA', part: 'break' }, { ch: 'A', part: 'break' }, { ch: 'Fm', part: 'break' }, { ch: 'FA', part: 'break' },
  { ch: 'E', part: 'break' }, { ch: 'A', part: 'break' }, { ch: 'C', part: 'break' }, { ch: 'A', part: 'break' }
];
const LOOP_FROM = 8;
// lead motifs: when the notes fall (3-3-2 rhythms) and which chord tone each
// one is (0 the root, 1 the third, 2 the fifth, 3 the root an octave up)
const MOTIFS = [
  { at: [0, 3, 6, 10, 12], tone: [2, 1, 0, 1, 3] },
  { at: [0, 3, 6, 8, 11, 14], tone: [0, 1, 2, 3, 2, 1] },
  { at: [0, 6, 8, 10, 12], tone: [3, 2, 1, 2, 4] },
  { at: [2, 4, 6, 10, 14], tone: [1, 2, 3, 2, 1] }
];
// the 3-3-2 groove: plucked bass and a soft kick on 1, the "and" of 2, and 4
const PULSE = [0, 6, 12];
const BASS = { 0: 0, 6: 0, 12: 7, 14: 12 };
const MARIMBA = [0, REST, REST, 2, REST, REST, 1, REST, 2, REST, REST, 1, REST, REST, 2, REST];
const midiHz = m => 440 * 2 ** ((m - 69) / 12);

// a tiny synth on the shared audio context. everything goes through one bus,
// a lowpass for the warm lo-fi top end, and a compressor so nothing clips.
let musicAC = null, musicBus = null, noiseBuf = null;
function musicSetup(ac) {
  musicAC = ac;
  const comp = ac.createDynamicsCompressor(), warm = ac.createBiquadFilter();
  comp.threshold.value = -16; comp.ratio.value = 3;
  warm.type = 'lowpass'; warm.frequency.value = 3400; warm.Q.value = 0.5;
  musicBus = ac.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(warm).connect(comp).connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function mNote(type, f, t, dur, vol, o = {}) {
  const ac = musicAC, osc = ac.createOscillator(), g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + (o.slideT || dur));
  if (o.detune) osc.detune.value = o.detune;
  if (o.lp) {
    const fl = ac.createBiquadFilter();
    fl.type = 'lowpass';
    fl.Q.value = o.q || 1;
    fl.frequency.setValueAtTime(o.lp, t);
    if (o.lpTo) fl.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur);
    osc.connect(fl).connect(g);
  } else osc.connect(g);
  const at = o.at || 0.004, rel = o.rel || 0.04;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + at);
  g.gain.setValueAtTime(vol, t + Math.max(at, dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
  g.connect(musicBus);
  osc.start(t);
  osc.stop(t + dur + rel + 0.02);
  if (o.vib) {
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = o.vib;
    lg.gain.value = f * 0.008;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t + 0.15);
    lfo.stop(t + dur + rel);
  }
}
function mNoise(t, dur, vol, type, freq, q = 1) {
  const ac = musicAC, src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf;
  fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl).connect(g).connect(musicBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}
// a struck note that dies away on its own, with a few partials on top: the
// marimba (warm), or the music box (brighter, rings longer)
function mallet(f, t, vol, ring, bright) {
  mNote('sine', f, t, 0.01, vol, { at: 0.002, rel: ring });
  mNote('sine', f * 2, t, 0.01, vol * (bright ? 0.35 : 0.12), { at: 0.002, rel: ring * 0.6 });
  mNote('sine', f * 4, t, 0.005, vol * (bright ? 0.2 : 0.1), { at: 0.001, rel: 0.06 });
}
// everything that happens on one 16th note
function songStep(bar, step, t) {
  const b = ARR[bar], chord = CH[b.ch], st = 60 / SONG.bpm / 4, root = BASS_ROOT[b.ch] || chord[0] - 12;
  const full = b.part === 'full', intro = b.part.startsWith('intro'), late = b.part === 'intro2' || b.part === 'break';
  // pads: a soft chord held through each bar outside the main section
  if (step === 0 && !full) chord.forEach(n => mNote('triangle', midiHz(n), t, st * 15, 0.04, { lp: 1200, at: 0.5, rel: 0.6 }));
  // the marimba picking out the chord in the 3-3-2 rhythm
  const m = MARIMBA[step];
  if (m !== REST) mallet(midiHz(chord[m] + 12), t, intro ? 0.24 : 0.2, 0.35, false);
  // plucked bass, from the second half of the intro on
  if ((full || late) && BASS[step] !== undefined) {
    mNote('triangle', midiHz(root + BASS[step]), t, st * (step === 14 ? 1 : 2.2), step === 14 ? 0.08 : 0.15, { lp: 1000, rel: 0.08 });
    mNote('sine', midiHz(root + BASS[step] - 12), t, st * 2, step === 14 ? 0.03 : 0.06);
  }
  if (full) {
    // a soft kick on the 3-3-2 pulse and a half time clap on beat 3, which
    // keeps it laid back
    if (PULSE.includes(step)) mNote('sine', 95, t, 0.1, 0.24, { slide: 48, slideT: 0.09, rel: 0.06 });
    if (step === 8) { mNoise(t, 0.09, 0.2, 'bandpass', 1500, 1.2); mNoise(t + 0.012, 0.07, 0.12, 'bandpass', 2200, 1.5); }
    // a very quiet shaker on the eighths
    if (step % 2 === 0) mNoise(t, 0.03, 0.025, 'highpass', 6000);
  }
  // the lead, a music box: a motif built from the chord, or a long note to
  // end the phrase
  if (b.lead === 'hold' && step === 0) {
    mallet(midiHz(chord[0] + 24), t, 0.32, 1.2, true);
    mNote('triangle', midiHz(chord[0] + 24), t, st * 10, 0.09, { at: 0.05, vib: 5 });
  } else if (b.lead !== undefined && b.lead !== 'hold') {
    const mo = MOTIFS[b.lead], k = mo.at.indexOf(step);
    if (k >= 0) {
      const ladder = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12];
      mallet(midiHz(ladder[mo.tone[k]] + 24), t, 0.32, 0.5, true);
      mNote('triangle', midiHz(ladder[mo.tone[k]] + 12), t, st * 1.5, 0.07, { lp: 2400 });
    }
  }
}
// the scheduler: looks a little ahead and books each 16th note on the audio
// clock, which keeps time even when a frame stutters
const song = { on: false, timer: null, next: 0, bar: 0, step: 0 };
function songStart() {
  if (song.on) return;
  const ac = getAudio();
  if (musicAC !== ac) musicSetup(ac);
  song.on = true;
  song.bar = 0; song.step = 0;
  song.next = ac.currentTime + 0.1;
  musicBus.gain.cancelScheduledValues(ac.currentTime);
  musicBus.gain.setValueAtTime(0.0001, ac.currentTime);
  musicBus.gain.exponentialRampToValueAtTime(0.85, ac.currentTime + 0.4);
  clearInterval(song.timer);
  song.timer = setInterval(songTick, 25);
  songTick();
}
function songTick() {
  if (!song.on) return;
  const st = 60 / SONG.bpm / 4;
  while (song.next < musicAC.currentTime + 0.15) {
    songStep(song.bar, song.step, song.next);
    song.next += st;
    if (++song.step === 16) { song.step = 0; song.bar = song.bar + 1 >= ARR.length ? LOOP_FROM : song.bar + 1; }
  }
}
function songStop() {
  if (!song.on) return;
  song.on = false;
  const now = musicAC.currentTime;
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), now);
  musicBus.gain.exponentialRampToValueAtTime(0.0001, now + 1);
  clearTimeout(song.stopT);
  song.stopT = setTimeout(() => { if (!song.on) clearInterval(song.timer); }, 1200);
}

// moe's theme plays from the intro to the end of the fight, on a loop. it
// follows the sound button like every other sound (off by default, and turning
// sound off mid fight stops it), and it fades out when he goes down, when you
// die or when you leave. the next fight starts it from the top.
let musicOn = false;
function bossMusic(on) {
  musicOn = on;
  if (on && soundOn) songStart();
  else songStop();
}
soundBtn.addEventListener('click', () => bossMusic(musicOn));

// the cave music (from desperate measures itself) plays underground: out in
// the mines, down the mole holes, in the grizzly's cave, and in moe's den once
// he's beaten. moe's theme takes over while he's fighting. it fades in and out
// rather than cutting, and follows the sound button.
const caveMusic = new Audio('audio/cave.mp3');
caveMusic.loop = true;
caveMusic.preload = 'auto';
const CAVE_VOL = 0.35;
// after a boss, the victory jingle gets the stage before the cave music fades
// back in
let musicQuietUntil = 0;
function victoryJingle() {
  musicQuietUntil = performance.now() + 4200;
  // a bright little fanfare in F#: up the chord, a quick turn, and a held top note
  [[66, 0], [69, 0.13], [73, 0.26], [78, 0.39], [76, 0.62], [78, 0.75], [81, 0.9]].forEach(([n, at], i) =>
    tone(440 * 2 ** ((n - 69) / 12), i === 6 ? 0.9 : 0.16, 'square', 0.045, 0.6 + at));
  [54, 61, 66].forEach(n => tone(440 * 2 ** ((n - 69) / 12), 1.1, 'triangle', 0.05, 0.6 + 0.9));
}
function tickMusic(dt) {
  const under = room ? room === caveRoom || room === denRoom || room.burrow !== undefined || !!room.underground : amb.mines > 0.5;
  const want = soundOn && started && under && !musicOn && performance.now() > musicQuietUntil;
  if (want) {
    if (caveMusic.paused) { caveMusic.volume = 0; caveMusic.play().catch(() => { /* no audio, carry on */ }); }
    caveMusic.volume = Math.min(CAVE_VOL, caveMusic.volume + dt * 0.4);
  } else if (!caveMusic.paused) {
    const v = caveMusic.volume - dt * 0.6;
    if (v > 0) caveMusic.volume = v;
    else caveMusic.pause();
  }
}

// the intro, every time you walk in while he's alive: black bars, the camera
// goes to the middle of the room, the floor cracks, he bursts up out of it and
// revs the drill, his name comes up, and the rocks come down over the way you
// came in. the first time it plays at full length, after that it's quicker.
const cineEl = $('#cine');
function startMoeIntro() {
  const first = !quest.moe.introSeen;
  cine = { t: 0, prev: 0, k: first ? 1 : 0.6 };
  Object.assign(moe, { x: moe.hx, y: moe.hy, state: 'intro', t: 0, under: true, sink: 1, aim: Math.PI / 2, spot: { x: moe.hx, y: moe.hy }, tellK: null, flip: false });
  mouse.down = false;
  bowDraw = null;
  stopDrill();
  eating = null;
  bossMusic(true);
  $('#cine-eyebrow').textContent = 'The Mines | Boss';
  $('#cine-title').textContent = moe.def.name;
  $('#cine-sub').textContent = 'Oops, wrong hole...';
  document.body.classList.add('is-cine');
}
function tickCine(dt) {
  if (!cine) return;
  const c = cine, k = c.k, beat = s => c.prev < s * k && c.t >= s * k;
  c.prev = c.t;
  c.t += dt;
  if (beat(0.3)) sfx.rumble();
  // the floor cracks where he's about to come up
  if (c.t > 0.3 * k && c.t < 1.1 * k) {
    moe.tellK = (c.t - 0.3 * k) / (0.8 * k);
    addShake(0.5 + moe.tellK);
  }
  if (beat(1.1)) {
    moe.tellK = null;
    moe.under = false;
    dirtSpray(moe.x, moe.y - 4, 30);
    addShake(5);
    sfx.boom();
  }
  if (c.t > 1.1 * k) {
    moe.sink = Math.max(0, 1 - (c.t - 1.1 * k) / (0.45 * k));
    moe.aim = -Math.PI / 2 + Math.min(1, Math.max(0, (c.t - 1.5 * k) / (0.3 * k))) * (Math.atan2(player.y - moe.y, player.x - moe.x) + Math.PI / 2);
    moe.flip = Math.cos(moe.aim) < 0;
    moe.spin += dt * 30;
  }
  if (beat(1.6)) { cineEl.classList.add('show-card'); sfx.roar(); }
  if (beat(2.3)) {
    // the way out caves in behind you
    denRoom.sealed = true;
    rubble.gone = false;
    burst(rubble.x, rubble.y - 12, '140,140,140', 24);
    addShake(3);
    sfx.crunch();
  }
  if (c.t >= 3.3 * k) endCine(true);
}
function endCine(fight) {
  cine = null;
  document.body.classList.remove('is-cine');
  cineEl.classList.remove('show-card');
  if (!fight) return;
  Object.assign(moe, { state: 'face', t: 0, sink: 0, under: false, pops: 0, lunges: 0 });
  quest.moe.introSeen = true;
  markDirty();
  bossBar(true);
}
// back to how it was before you walked in, after you die or leave
function resetMoe() {
  if (cine) endCine(false);
  bossMusic(false);
  clearMoeMoles(false);
  denRoom.sealed = false;
  rubble.gone = true;
  bossBar(false);
  if (moe.dead) return;
  Object.assign(moe, { x: moe.hx, y: moe.hy, hp: moe.def.hp, state: 'wait', t: 0, under: true, sink: 1, pops: 0, lunges: 0, aim: Math.PI / 2, hurtT: 0, tellK: null, spot: null, trail: [] });
  moeLamp.off = moeBeam.off = true;
}

// the health bar across the top of the screen while you fight him. the
// pale bar behind the red one is the damage you just did, catching up.
const bossBarEl = $('#boss-bar'), bossFill = $('#boss-fill'), bossLag = $('#boss-lag');
let bossLagHp = 0;
function bossBar(on) {
  bossBarEl.classList.toggle('is-on', on);
  if (on) { $('#boss-name').textContent = moe.def.name; bossLagHp = moe.hp; }
}
function tickBossBar(dt) {
  if (!bossBarEl.classList.contains('is-on')) return;
  const f = clamp(moe.hp / moe.def.hp, 0, 1);
  bossLagHp = Math.max(moe.hp, bossLagHp - moe.def.hp * dt * 0.35);
  bossFill.style.width = `calc((100% - 6px) * ${f.toFixed(4)})`;
  bossLag.style.width = `calc((100% - 6px) * ${clamp(bossLagHp / moe.def.hp, 0, 1).toFixed(4)})`;
  bossBarEl.classList.toggle('is-mad', moeMad(moe));
}

function drawMoe(c, toX, toY, t) {
  if (c.state === 'wait' || (c.under && c.state !== 'dying') || c.sink >= 1) return;
  let img = moeFrame(c, t);
  const base = img;
  if (c.hurtT > 0) img = MOE_FRAMES.white.get(img) || img;
  const shake = ['windup', 'dazed', 'dying'].includes(c.state) ? Math.round(Math.sin(t / 25)) : 0;
  const sinkPx = Math.round(c.sink * (MOE_H - 4));
  const left = c.x - Math.floor(MOE_W / 2) + shake, top = c.y - MOE_H + 2 + sinkPx;
  if (sinkPx === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(toX(c.x - 18), toY(c.y - 1), 36 * S, 2 * S);
  }
  const hand = moePoint(c, MOE_HAND, base);
  hand.x += shake;
  // up out of the floor he holds the drill over his head, bigger, glowing hot
  // at the tip and throwing sparks (see the glow after he's drawn)
  const raised = c.state === 'stuck' || c.state === 'pop';
  // stuck, the drill stands straight up out of the middle of his hole, as
  // wide as the hole (its bottom down in it), and only his dizzy head pokes
  // out in front of it (stuckSink)
  if (raised) { hand.x = c.x; hand.y = c.y - 4; }
  const k = ((Math.round((c.aim / (Math.PI * 2)) * DRILL_STEPS) % DRILL_STEPS) + DRILL_STEPS) % DRILL_STEPS;
  const drill = raised
    ? () => ctx.drawImage(DRILL_UP[Math.floor(c.spin) % 3], toX(hand.x - DRILL_BIG_D / 2), toY(hand.y - DRILL_BIG_D / 2), DRILL_BIG_D * S, DRILL_BIG_D * S)
    : () => ctx.drawImage(DRILL_ROT[Math.floor(c.spin) % 3][k], toX(hand.x - DRILL_D / 2), toY(hand.y - DRILL_D / 2), DRILL_D * S, DRILL_D * S);
  // pointing up, the drill goes behind him
  const behind = Math.sin(c.aim) < -0.35;
  ctx.save();
  // whatever's below the middle of the hole is down it
  if (sinkPx > 0) { ctx.beginPath(); ctx.rect(0, 0, canvas.width, toY(c.y - 2)); ctx.clip(); }
  if (behind) drill();
  if (c.flip) {
    ctx.translate(toX(left) + MOE_W * S, toY(top));
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, MOE_W * S, MOE_H * S);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else ctx.drawImage(img, toX(left), toY(top), MOE_W * S, MOE_H * S);
  if (!behind) drill();
  ctx.restore();
  if (sinkPx > 0) drawHoleRim(c, toX, toY, true);
  if (raised) {
    const tx = toX(hand.x), ty = toY(hand.y - 34 * DRILL_BIG), pulse = reduceMotion ? 0.8 : 0.7 + Math.sin(t / 45) * 0.3;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 14 * S);
    g.addColorStop(0, `rgba(255,236,170,${0.55 * pulse})`);
    g.addColorStop(0.4, `rgba(255,140,50,${0.3 * pulse})`);
    g.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(tx - 14 * S, ty - 14 * S, 28 * S, 28 * S);
    ctx.globalCompositeOperation = 'source-over';
  }
  // the tell before a lunge, same red "!" as everything else
  if (c.state === 'windup') {
    const fs = Math.max(16, 8 * Math.round((S * 5.3) / 8)), mw = Math.round(fs * 0.9);
    const mx = toX(c.x) - mw / 2, my = toY(top - 6) - mw;
    ctx.fillStyle = '#ff4d3d';
    ctx.fillRect(mx, my, mw, mw);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${fs}px Silkscreen, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', mx + mw / 2, my + mw / 2 + 1);
  }
  // stars going round his head while he's stuck or dazed
  if ((c.state === 'stuck' || c.state === 'dazed') && !reduceMotion) {
    for (let i = 0; i < 3; i++) {
      const a = t / 220 + (i * Math.PI * 2) / 3, sx = c.x + Math.cos(a) * 12, sy = top + 4 + Math.sin(a) * 4;
      ctx.fillStyle = i ? '#ffd23f' : '#ffffff';
      ctx.fillRect(toX(sx) - S, toY(sy), S * 3, S);
      ctx.fillRect(toX(sx), toY(sy) - S, S, S * 3);
    }
  }
}
// the hole moe digs: a dark pit with a ring of thrown up dirt round it, lit on
// top. drawn in two halves, the back (with the pit) under him and the front
// lip over him, so he looks like he's standing down in it.
const HOLE_RX = 26, HOLE_RY = 10;
// standing anywhere in the hole (feet inside it, give or take your width) is
// what the pop and the stuck drill hit, and the tell ring is drawn the same size,
// so the warning, the hole and the danger all match
function inMoeHole(c) {
  const cx = c.spot ? c.spot.x : c.x, cy = (c.spot ? c.spot.y : c.y) - 3;
  return ((player.x - cx) / (HOLE_RX + 5)) ** 2 + ((player.y - cy) / (HOLE_RY + 3)) ** 2 < 1;
}
function drawHoleRim(c, toX, toY, front) {
  const cx = Math.round(c.x), cy = Math.round(c.y - 3);
  for (let y = -HOLE_RY - 1; y <= HOLE_RY + 1; y++) {
    if (front ? y < 0 : y >= 0 && y > 2) continue;
    for (let x = -HOLE_RX - 1; x <= HOLE_RX + 1; x++) {
      const d = Math.sqrt((x / HOLE_RX) ** 2 + (y / HOLE_RY) ** 2) + (hash2(x >> 1, y, 91) - 0.5) * 0.12;
      if (d > 1.06) continue;
      let col;
      if (d > 1) col = '#2b1e14';
      else if (d > 0.74) {
        const lit = -y / HOLE_RY + (hash2(x, y, 92) - 0.5) * 0.6;
        col = d < 0.8 ? '#4e3a28' : lit > 0.3 ? '#c09a70' : lit > -0.3 ? '#a8865f' : '#7a5c40';
      } else if (front) continue;
      else col = d > 0.62 ? '#2a1e14' : '#0d0a08';
      ctx.fillStyle = col;
      ctx.fillRect(toX(cx + x), toY(cy + y), S, S);
    }
  }
}
// cracks for the tell: a few jagged lines out from the middle, worked out once
const CRACKS = (() => {
  const r = mulberry32(4242), out = [];
  for (let k = 0; k < 7; k++) {
    let a = (k / 7) * Math.PI * 2 + r() * 0.5, x = 0, y = 0;
    const line = [];
    for (let s = 0; s < 9; s++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 2.2; y += Math.sin(a) * 1.3; line.push([Math.round(x), Math.round(y)]); }
    out.push(line);
  }
  return out;
})();
function drawMoeFloor(o, toX, toY, t) {
  const c = moe;
  if (c.gone || c.state === 'wait') return;
  const P = (x, y, col, w = 1, h = 1) => { ctx.fillStyle = col; ctx.fillRect(toX(x), toY(y), w * S, h * S); };
  // the hole he's in: the dark pit and the back half of its rim (the front
  // half is drawn over him, in drawMoe)
  if (!c.under && c.sink > 0.02) drawHoleRim(c, toX, toY, false);
  // the furrow he pushes up behind him under the floor, fading out the
  // further back it goes, and the bulge where he is right now
  if (c.state === 'under' || c.state === 'tell') {
    const n = c.trail.length;
    c.trail.forEach(([x, y], i) => {
      ctx.globalAlpha = 0.25 + (0.75 * i) / n;
      P(x - 2, y - 2, '#a8865f', 4, 1);
      P(x - 2, y - 1, '#6b5038', 4, 1);
    });
    ctx.globalAlpha = 1;
  }
  if (c.state === 'under') {
    const j = reduceMotion ? 0 : Math.round(Math.sin(t / 40));
    P(c.mx - 12, c.my, 'rgba(0,0,0,0.25)', 24, 2);
    // a lumpy dome of dirt, lit on top
    for (let y = -9; y <= 0; y++) {
      const half = Math.round(Math.sqrt(1 - (y / 9.5) ** 2) * 11 + (hash2(y, Math.floor(t / 120), 77) - 0.5) * 2);
      P(c.mx - half - 1 + j, c.my - 1 + y, '#3e2e20', half * 2 + 2, 1);
      if (y > -9) P(c.mx - half + j, c.my - 1 + y, y < -6 ? '#c09a70' : y < -2 ? '#a8865f' : '#7a5c40', half * 2, 1);
    }
    [[-6, -6], [3, -7], [8, -4]].forEach(([dx, dy]) => P(c.mx + dx + j, c.my + dy, '#9a9a9a', 2, 1));
  }
  // the tell: the floor glows red and cracks open where he's about to come up,
  // with a thick ring round the edge pulsing faster and faster. it has to be
  // impossible to miss, it's the whole point of the fight.
  if (c.tellK !== null && c.spot) {
    const k = c.tellK, sx = c.spot.x, sy = c.spot.y - 3, R = HOLE_RX, RY = HOLE_RY;
    const pulse = reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(t / (70 - 40 * k));
    ctx.fillStyle = `rgba(255,50,30,${(0.12 + 0.18 * pulse) * Math.min(1, k * 2)})`;
    for (let y = -RY; y <= RY; y++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - (y / (RY + 0.5)) ** 2)) * R);
      ctx.fillRect(toX(sx - half), toY(sy + y), half * 2 * S, S);
    }
    CRACKS.forEach(line => line.slice(0, Math.ceil(line.length * Math.min(1, k * 1.4))).forEach(([x, y]) => {
      P(sx + x, sy + y - 1, '#c09a70', 2, 1);
      P(sx + x, sy + y, '#140c06', 2, 2);
    }));
    const ring = `rgba(255,${Math.round(90 + 120 * pulse)},60,${Math.min(1, 0.45 + 0.55 * pulse) * Math.min(1, k * 2.5)})`;
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * Math.PI * 2;
      P(sx + Math.cos(a) * R - 1, sy + Math.sin(a) * RY - 1, ring, 2, 2);
    }
  }
}

// moe's drill in your hands: hold right click and it spins up and bores into
// whatever block or tree you're pointing at (at the speeds in mineInfo). it
// doesn't hurt anything alive. let go, switch slots or open a menu and it
// winds down.
let drilling = null;
function startDrill() {
  if (drilling || player.dead || cine) return;
  drilling = { t: 0, buzzT: 0, slot: inv.sel };
}
function stopDrill() {
  if (!drilling) return;
  drilling = null;
  if (mining && mining.thing) mining.thing.shake = 0;
  mining = null;
}
function tickDrill(dt) {
  if (!drilling) return;
  const s = heldItem();
  if (ui || player.dead || sleeping || cine || inv.sel !== drilling.slot || !s || ITEMS[s.id].tool !== 'drill') { stopDrill(); return; }
  drilling.t += dt;
  drilling.buzzT -= dt;
  faceAngle(aimAngle());
  if (drilling.buzzT <= 0) { drilling.buzzT = 0.09; sfx.drill(); }
  const tgt = targetAt(mouseWorld());
  if (tgt && !CLICK_ONLY.has(tgt.type) && tgt.type !== 'bed' && inReach(tgt)) {
    mineStep(tgt, dt);
    if (mining && Math.random() < dt * 30) burst(tgt.cx, tgt.cy, tgt.cls === 'ore' ? '220,220,220' : '150,150,150', 1);
  } else if (mining) {
    if (mining.thing) mining.thing.shake = 0;
    mining = null;
  }
}

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
// is it in the same place as you (the overworld, or the room you're in), and
// can it be hit at all? moe can't be while he's underground.
const here = c => (c.room || null) === room;
const hittable = c => !c.dead && !c.gone && !c.dormant && !c.under && here(c);

function inArc(c, a, tool, cone = 1.15) {
  if (!hittable(c)) return false;
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
  return Math.abs(diff) < cone;
}

// how long a click waits for the swing cooldown to finish before it's dropped
const SWING_BUFFER = 0.15;
let swingAsk = 0;
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

// how it was hit ('melee' or 'arrow') matters to moe, see bossHit
function hurtCreature(c, dmg, a, how = 'melee') {
  let col = '#ffd1d1';
  if (c.def.boss) {
    const hit = bossHit(c, dmg, how);
    if (!hit.dmg) return;
    dmg = Math.round(hit.dmg * 100) / 100;
    col = hit.col || col;
  }
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
  floatText(`-${dmg}`, cc.x, cc.y - 12, col);
  sfx.hit();
  burst(cc.x, cc.y, c.def.chip, 6);
  // livestock just bolts; hunters turn on you
  if (c.def.passive) { c.state = 'flee'; c.t = 0; c.path = null; c.pathT = 0; }
  else if (!c.def.boss && !['windup', 'lunge', 'recover'].includes(c.state)) aggro(c);
  if (c.hp <= 0) { if (c.def.boss) bossDown(c); else killCreature(c); }
}

function aggro(c) {
  if (c.state === 'chase' || c.dead) return;
  if (c.state === 'sleep') sfx.roar();
  // a mole bursts up out of its mound
  if (c.state === 'burrowed') { burst(c.x, c.y - 6, '138,106,76', 14); sfx.crunch(); }
  c.state = 'chase';
  if (!quest.seen[c.kind]) {
    quest.seen[c.kind] = true;
    const [eyebrow, sub] = c.def.intro || ['Hostile', ''];
    toast(eyebrow, c.def.name, sub);
    markDirty();
  }
}

// a creature's drop. a drop with a chance only sometimes happens, and a machine
// part only ever drops once and never into a full bag (where it'd be lost).
// loot isn't put straight in your bag: it pops out of the body and lands on
// the ground next to it, to be picked up like anything else (x, y is where
// it comes from, a little above the creature's feet)
function lootOut(id, n, x, y) {
  if (n <= 0) return;
  let lx = x, ly = y + 12;
  for (let tries = 0; tries < 8; tries++) {
    const tx = x + (Math.random() - 0.5) * 30, ty = y + 8 + Math.random() * 14;
    if (!blocked(tx, ty)) { lx = tx; ly = ty; break; }
  }
  dropStack(makeStack(id, n), lx, ly, room, 0.5, { x, y });
}
function dropLoot(id, n, chance, x, y) {
  if (chance && Math.random() >= chance) return;
  if (!ITEMS[id].part) { lootOut(id, n, x, y); return; }
  if (quest.parts.includes(id)) return;
  lootOut(id, 1, x, y);
  quest.parts.push(id);
  burst(x, y, '200,255,90', 30);
  sfx.found();
  setTimeout(() => toast('Found', ITEMS[id].name, `Part ${quest.parts.length} of ${MACHINE_PARTS}. ${countItem('exotic-core') ? 'The core in your bag starts to hum.' : 'It\'s pulsing...'}`), 600);
  markDirty();
}

function killCreature(c) {
  c.dead = true;
  c.gone = true;
  if (c.def.passive || c.def.nightly || c.def.minion) {
    const cc = creatureCenter(c);
    burst(cc.x, cc.y, c.def.chip, 14);
    c.def.drops.forEach(([id, a, b, chance]) => dropLoot(id, rand(a, b), chance, cc.x, cc.y));
    creatures.splice(creatures.indexOf(c), 1);
    const list = c.room ? c.room.things : things;
    list.splice(list.indexOf(c), 1);
    if (c.onDeath) c.onDeath();
    return;
  }
  quest.killed[c.kind] = true;
  const cc = creatureCenter(c);
  burst(cc.x, cc.y, c.def.chip, 26);
  c.def.drops.forEach(([id, a, b]) => lootOut(id, rand(a, b), cc.x, cc.y));
  if (c.kind === 'bear') openCave();
  // ucla is the pair of them, so it's found the moment the second one falls.
  // the landmark toast goes first, then the "what you got" one once it's had
  // a moment on screen.
  const both = quest.killed.hyena && quest.killed.bear;
  if (both) discover(cavePoi);
  const after = c.kind === 'hyena' ? 'Marble makes beautiful tools.' : 'Hide makes armor. Check the cave!';
  setTimeout(() => toast('Defeated', c.def.name, after), both ? 2300 : 0);
  markDirty();
}

// armor takes its percentage off the top. two decimals is plenty; the hearts
// round it visually anyway.
function afterArmor(dmg) {
  const block = armorBlock();
  return Math.round(dmg * (1 - block) * 100) / 100;
}

function hurtPlayer(raw, fromX, fromY) {
  if (player.dead || vitals.invuln > 0) return false;
  const dmg = afterArmor(raw);
  wearArmor();
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

// dying: you crumple (the sheet's death frames), everything you carry bursts
// out of you, a burst of red goes up, the world closes in to a dark ring round
// you, your ghost drifts up out of your body, and the screen fades to black
// before you wake up at your bed or camp. DEATH is how long all that takes.
const DEATH = 2.8;
function die() {
  player.dead = true;
  player.deadT = 0;
  player.swing = -1;
  mining = null;
  bowDraw = null;
  stopDrill();
  closeUI();
  spillInventory();
  burst(player.x, player.y - 14, '230,60,60', 22);
  addShake(3);
  renderHUD();
  sfx.die();
}
// how long this death lasts (darryl's takes longer, he has loot to collect)
const deathLen = () => player.deathLen || DEATH;
function drawDeath(toX, toY) {
  const k = player.deadT, len = deathLen();
  // the world closing in round you (not as far when darryl's walking over, so
  // you can see him take your things)
  const cx = toX(player.x), cy = toY(player.y - 14), dark = Math.min(player.deathSoft ? 0.5 : 0.75, k * 0.45);
  const g = ctx.createRadialGradient(cx, cy, TILE * S * Math.max(player.deathSoft ? 6 : 1, 5 - k * 2), cx, cy, TILE * S * 12);
  g.addColorStop(0, 'rgba(20,0,4,0)');
  g.addColorStop(1, `rgba(20,0,4,${dark})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // your ghost, a pale copy of you rising out of the body and fading
  const img = sheetPlay.naturalWidth ? sheetPlay : sheet;
  if (k > 0.7 && img.naturalWidth && !player.skeleton) {
    const u = Math.min(1, (k - 0.7) / 1.8);
    ctx.save();
    ctx.globalAlpha = 0.55 * (1 - u);
    ctx.globalCompositeOperation = 'lighter';
    const sway = reduceMotion ? 0 : Math.sin(k * 5) * 2;
    ctx.drawImage(img, 0, 0, CELL, CELL, toX(player.x - 24 + sway), toY(player.y - 42 - u * 30), CELL * S, CELL * S);
    ctx.restore();
  }
  // and the fade to black at the end
  if (k > len - 0.6) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, (k - (len - 0.6)) / 0.5)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}
function respawn() {
  if (room) playLeaveRoom(true);
  player.dead = false;
  player.skeleton = false;
  player.deathLen = 0;
  player.deathSoft = false;
  vitals.burn = vitals.poison = null;
  projectiles.length = 0;
  // the night's monsters don't wait around for you to come back
  for (let i = creatures.length - 1; i >= 0; i--) {
    if (creatures[i].def.nightly) { things.splice(things.indexOf(creatures[i]), 1); creatures.splice(i, 1); }
  }
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
  if (bedSpot && bedSpot.room === 'home') enterRoom(homeRoom, true);
  if (bedSpot) { player.x = bedSpot.x * TILE + 8; player.y = (bedSpot.y + 1) * TILE + 12; }
  if (!room) Object.assign(cam, clampCam(camTarget()));
  // anything still alive goes home and heals, like the fight never happened
  creatures.forEach(c => {
    if (c.dead || c.dormant || c.def.passive) return;
    Object.assign(c, { x: c.hx, y: c.hy, hp: c.def.hp, state: c.def.rest, cd: 0, kx: 0, ky: 0 });
  });
  toast('You fell', bedSpot ? 'Back in your bed' : 'Back at Base Camp', 'Your things are where you fell. You have 5 minutes to get them back.');
  renderHUD();
  markDirty();
}

function moveBody(o, mx, my) {
  if (!blocked(o.x + mx, o.y)) o.x += mx;
  if (!blocked(o.x, o.y + my)) o.y += my;
}

function updateCreature(c, dt) {
  if (c.dead || c.dormant) return;
  if (c.def.boss) { updateMoe(c, dt); return; }
  const def = c.def;
  if (def.burns) burnInDaylight(c, dt);
  if (c.dead) return;
  // once it's day, the night's monsters quietly leave when you can't see them
  if (def.nightly && nightAmount() < 0.35 && Math.hypot(c.x - player.x, c.y - player.y) > 26 * TILE) { c.despawn = true; return; }
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
  // (indoors there's nothing to path round, and the tile paths are for the
  // overworld anyway, so a creature in a room just heads straight for you)
  const steer = (tx, ty, speed) => {
    if (c.room || clearLine(c.x, c.y, tx, ty)) { c.path = null; walk(tx, ty, speed); return; }
    if (!c.path || !c.path.length || c.pathT <= 0) {
      c.path = pathToward(c, Math.floor(tx / TILE), Math.floor((ty - 2) / TILE), 20);
      c.pathT = 0.6;
    }
    followPath(c, walk, speed);
  };

  switch (c.state) {
    case 'sleep':
    case 'burrowed':
      if (alive && d < def.aggro * TILE) aggro(c);
      break;
    case 'prowl':
      c.wanderT -= dt;
      if (!c.wander || c.wanderT <= 0) {
        const roam = def.roam || 3;
        c.wander = { x: c.hx + (Math.random() - 0.5) * 2 * roam * TILE, y: c.hy + (Math.random() - 0.5) * 1.4 * roam * TILE };
        c.wanderT = 2 + Math.random() * 2.5;
      }
      steer(c.wander.x, c.wander.y, def.speed * 0.35);
      if (alive && d < def.aggro * TILE) aggro(c);
      break;
    case 'chase':
      if (!alive || homeD > def.leash * TILE) { c.state = 'return'; break; }
      if (def.shooter) { shooterChase(c, dt, d, dx, dy, steer, walk); break; }
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
      // walking home doesn't heal it any more. it gets its health back slowly
      // through regen, so backing off for a breather doesn't reset the fight.
      steer(c.hx, c.hy, def.speed * 0.8);
      if (homeD < 6) c.state = def.rest;
      // come back within range while it's heading home and it turns round
      else if (alive && d < def.aggro * TILE * 1.4 && homeD < def.leash * TILE * 0.8) c.state = 'chase';
      break;
  }

  // touching it hurts, whatever it's doing. a sleeping bear you walk into
  // wakes up swinging.
  if (alive && overlap(playerBox(), creatureBox(c))) {
    if (['sleep', 'prowl', 'burrowed'].includes(c.state)) aggro(c);
    if (c.state !== 'return') hurtPlayer(def.dmg, c.x, c.y);
    if (c.burning) ignite();
  }
  // creatures in a room (the moles) shove each other apart instead of piling
  // up on one spot and walking through each other
  if (c.room) creatures.forEach(o => {
    if (o === c || o.room !== c.room || o.dead || o.gone || o.def.boss || o.state === 'burrowed') return;
    const dx = c.x - o.x, dy = c.y - o.y, dd = Math.hypot(dx, dy), min = (def.box.w + o.def.box.w) / 2 - 2;
    if (dd >= min) return;
    const k = (min - dd) / 2, ux = dd ? dx / dd : Math.random() - 0.5, uy = dd ? dy / dd : Math.random() - 0.5;
    moveBody(c, ux * k, uy * k);
    moveBody(o, -ux * k, -uy * k);
  });
  if (c.moving) c.anim += dt;
}

const inWater = o => !(o.room || (o === player && room)) && tiles[idx(clamp(Math.floor(o.x / TILE), 0, W - 1), clamp(Math.floor((o.y - 2) / TILE), 0, H - 1))] === T.WATER;

// zombies catch fire in daylight (unless they're standing in water) and lose
// half a heart a second until they're gone
function burnInDaylight(c, dt) {
  c.burning = nightAmount() < 0.35 && !inWater(c);
  if (!c.burning) { c.burnT = 0; return; }
  c.burnT = (c.burnT || 0) + dt;
  if (!reduceMotion && Math.random() < dt * 14) {
    particles.push({ x: c.x + (Math.random() - 0.5) * 12, y: c.y - 6 - Math.random() * 20, vx: 0, vy: -24, g: -10, life: 0.4, t: 0, col: Math.random() < 0.5 ? '#ffc93c' : '#ff7b1c', size: 1 });
  }
  if (c.burnT >= 1) {
    c.burnT -= 1;
    c.hp = Math.max(0, c.hp - 0.5);
    c.hurtT = 0.1;
    if (c.hp <= 0) killCreature(c);
  }
}
// a forest guardian keeps its distance: it walks in until you're in range,
// backs off if you get close, and every couple of seconds throws a poison
// tipped stick at you if it can see you
function shooterChase(c, dt, d, dx, dy, steer, walk) {
  const sh = c.def.shooter;
  c.aimT = Math.max(0, (c.aimT || 0) - dt);
  if (d > sh.range * TILE * 0.9) steer(player.x, player.y, c.def.speed);
  else if (d < sh.keep * TILE && d > 0) walk(c.x - (dx / d) * 24, c.y - (dy / d) * 24, c.def.speed * 0.8);
  c.flip = dx < 0;
  if (c.cd <= 0 && d <= sh.range * TILE && clearLine(c.x, c.y, player.x, player.y)) {
    c.cd = sh.cd;
    c.aimT = 0.35;
    const a = Math.atan2(player.y - 10 - (c.y - 14), player.x - c.x);
    shoot('stick', c.x, c.y - 14, a, sh.speed, sh.range * TILE + 24, { from: 'mob', dmg: sh.dmg, poison: sh.poison });
    sfx.swing();
  }
}

// monsters only come out at night, out of sight (13 to 22 tiles away), never
// at camp, and only a handful at once. guardians only grow in the meadows.
// bosses (when they exist) don't count toward the cap.
const HOSTILE_CAP = 5;
let hostileT = 4;
function updateNightSpawns(dt) {
  if (nightAmount() < 0.5) { hostileT = 4; return; }
  hostileT -= dt;
  if (hostileT > 0) return;
  hostileT = 7 + Math.random() * 6;
  if (creatures.filter(c => c.def.nightly && !c.dead).length >= HOSTILE_CAP) return;
  const px = player.x / TILE, py = player.y / TILE;
  for (let tries = 0; tries < 40; tries++) {
    const a = Math.random() * Math.PI * 2, d = 13 + Math.random() * 9;
    const tx = Math.floor(px + Math.cos(a) * d), ty = Math.floor(py + Math.sin(a) * d);
    if (!inside(tx, ty) || solidTile(tx, ty) || !reach[idx(tx, ty)] || tiles[idx(tx, ty)] === T.WATER) continue;
    const where = regionAt(tx + 0.5, ty + 0.5);
    if (where === 'camp') continue;
    spawnHostile(where === 'meadows' && Math.random() < 0.4 ? 'guardian' : 'zombie', tx, ty);
    return;
  }
}
function spawnHostile(kind, tx, ty) {
  const def = CREATURES[kind];
  const c = {
    kind, def, frames: framesFor(kind), creature: true,
    hx: tx * TILE + 8, hy: ty * TILE + 12, x: tx * TILE + 8, y: ty * TILE + 12,
    hp: def.hp, state: 'prowl', t: 0, cd: 1, sinceHit: 99, anim: 0, flip: false, hurtT: 0, kx: 0, ky: 0,
    lx: 0, ly: 0, moving: false, wander: null, wanderT: 0, draw: drawCreature
  };
  creatures.push(c);
  things.push(c);
  return c;
}

// anything flying: thrown snowballs, your arrows, the guardians' sticks. they
// fly at chest height, so hits are checked against bodies, and the tile under
// them is what stops them on rock.
const projectiles = [];
function shoot(kind, x, y, a, speed, range, extra = {}) {
  projectiles.push({ kind, x, y, a, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, range, dist: 0, from: 'player', ...extra });
}
const pointIn = (p, b, pad) => p.x > b.x0 - pad && p.x < b.x1 + pad && p.y > b.y0 - pad && p.y < b.y1 + pad;
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const sx = p.vx * dt, sy = p.vy * dt;
    p.x += sx; p.y += sy; p.dist += Math.hypot(sx, sy);
    const wall = room ? room.blocked(p.x, p.y + 10) : solidTile(Math.floor(p.x / TILE), Math.floor((p.y + 10) / TILE));
    if (p.dist > p.range || wall) {
      burst(p.x, p.y, p.kind === 'snow' ? '240,244,252' : '160,102,58', 4);
      projectiles.splice(i, 1);
      continue;
    }
    if (p.from === 'mob') {
      if (!player.dead && pointIn(p, playerBox(), 2)) {
        if (hurtPlayer(p.dmg, p.x - p.vx, p.y - p.vy) && p.poison) poisonPlayer(p.poison);
        projectiles.splice(i, 1);
      }
      continue;
    }
    const c = creatures.find(k => hittable(k) && pointIn(p, creatureBox(k), 3));
    if (!c) continue;
    if (p.kind === 'snow') snowHit(c, p.a);
    else hurtCreature(c, Math.round(p.dmg * (1 + 0.15 * Math.min(1, p.dist / (ARROW_FULL * TILE))) * 100) / 100, p.a, 'arrow');
    projectiles.splice(i, 1);
  }
}
// snowballs never hurt anything (a flaming boss will be the exception), they
// just shove it back a step, whatever it's doing. an ice boss shrugs them off.
function snowHit(c, a) {
  const cc = creatureCenter(c);
  burst(cc.x, cc.y, '240,244,252', 8);
  sfx.snow();
  if (c.def.fiery) { hurtCreature(c, 1, a); return; }
  if (!c.def.icy && !c.def.steady) {
    const k = Math.max(45, c.def.knock * 0.6);
    c.kx = Math.cos(a) * k;
    c.ky = Math.sin(a) * k;
  }
  if (c.def.passive) { c.state = 'flee'; c.t = 0; c.path = null; c.pathT = 0; }
  else if (['sleep', 'prowl', 'burrowed'].includes(c.state)) aggro(c);
}
// left click with something you throw or shoot. a snowball goes where you
// point, a bow fires the best arrow you're carrying. nothing flies indoors,
// except in the mole holes, where there's fighting to do.
let noArrowT = 0;
const shootsHere = () => !room || !!room.fight;
function useRanged(it) {
  if (vitals.atkCD > 0 || !shootsHere()) return;
  const a = aimAngle(), o = aimOrigin();
  faceAngle(a);
  player.swing = 0;
  if (it.throw) {
    const s = heldItem();
    s.n--;
    if (!s.n) inv.slots[inv.sel] = null;
    shoot('snow', o.x, o.y, a, 230, 8 * TILE);
    vitals.atkCD = 0.35;
    sfx.swing();
    afterInventoryChange();
    return;
  }
}

// the bow: hold right click to draw, aim with the cursor while you hold (you
// turn to face it and the bow follows), let go to loose. the longer you draw,
// up to BOW.draw seconds, the harder and farther the arrow flies: a quick tap
// barely does anything, a full draw hits for 1.4 times the arrow's damage
// (it was 1.2, alex found the bow felt weak).
// switching slots, opening a menu or dying while drawn lets the string go
// without wasting the arrow.
const BOW = { draw: 1, minMult: 0.35, maxMult: 1.4, minSpeed: 180, maxSpeed: 380, minRange: 5, maxRange: ARROW_RANGE };
let bowDraw = null;
const bowCharge = () => (bowDraw ? Math.min(1, bowDraw.t / BOW.draw) : 0);
function startBowDraw() {
  if (!shootsHere() || bowDraw || vitals.atkCD > 0 || player.dead || cine) return;
  if (!bestArrow()) {
    if (noArrowT <= 0) { floatText('No arrows', player.x, player.y - 34, '#cfcfcf'); noArrowT = 1.5; }
    return;
  }
  bowDraw = { t: 0, slot: inv.sel };
  sfx.draw();
}
function tickBow(dt) {
  if (!bowDraw) return;
  const s = heldItem();
  if (ui || player.dead || sleeping || cine || !shootsHere() || inv.sel !== bowDraw.slot || !s || !ITEMS[s.id].ranged) { bowDraw = null; return; }
  bowDraw.t += dt;
  faceAngle(aimAngle());
}
function releaseBow() {
  if (!bowDraw) return;
  const charge = bowCharge();
  bowDraw = null;
  const arrow = bestArrow(), s = heldItem();
  if (charge < 0.08 || !arrow || !s || !ITEMS[s.id].ranged) return;
  const a = aimAngle(), o = aimOrigin();
  faceAngle(a);
  takeItem(arrow, 1);
  shoot('arrow', o.x, o.y, a, BOW.minSpeed + (BOW.maxSpeed - BOW.minSpeed) * charge, (BOW.minRange + (BOW.maxRange - BOW.minRange) * charge) * TILE,
    { dmg: ITEMS[arrow].adm * (BOW.minMult + (BOW.maxMult - BOW.minMult) * charge), mat: ITEMS[arrow].arrow });
  vitals.atkCD = 0.25;
  sfx.bow();
  wearHeld(1);
  afterInventoryChange();
}
function bestArrow() {
  let best = null;
  inv.slots.forEach(s => { if (s && ITEMS[s.id].arrow && (!best || ITEMS[s.id].adm > ITEMS[best].adm)) best = s.id; });
  return best;
}

// damage that isn't a hit: starving, burning, poison, bad meat. armor doesn't
// help with any of it, and there's no knockback or blink afterwards.
function loseHp(amount, label, col = '#ff6b6b') {
  if (player.dead || amount <= 0) return;
  vitals.hp = Math.max(0, Math.round((vitals.hp - amount) * 100) / 100);
  floatText(label, player.x, player.y - 34, col);
  sfx.hurt();
  const flash = $('#hurt-flash');
  flash.classList.remove('is-on');
  void flash.offsetWidth;
  flash.classList.add('is-on');
  if (vitals.hp <= 0) die();
  markDirty();
  renderVitals();
}
// on fire: half a heart a second for five seconds, and any water puts it out.
// poisoned: half a heart a second for as long as the poison lasts.
const BURN_TICKS = 5;
function ignite() {
  if (room || player.dead || inWater(player)) return;
  if (!vitals.burn) { floatText('On fire!', player.x, player.y - 40, '#ff9a3c'); sfx.ignite(); }
  vitals.burn = { left: BURN_TICKS, t: 0 };
  renderHUD();
}
function poisonPlayer(ticks) {
  vitals.poison = { left: Math.max(ticks, vitals.poison ? vitals.poison.left : 0), t: 0 };
  renderHUD();
}
function tickStatus(dt) {
  if (vitals.burn) {
    if (!room && inWater(player)) {
      vitals.burn = null;
      floatText('Put out', player.x, player.y - 34, '#9fd3ff');
      sfx.splash();
      burst(player.x, player.y - 12, '220,230,240', 10);
      renderHUD();
    } else {
      if (!reduceMotion && Math.random() < dt * 18) {
        particles.push({ x: player.x + (Math.random() - 0.5) * 12, y: player.y - 4 - Math.random() * 20, vx: 0, vy: -26, g: -10, life: 0.4, t: 0, col: Math.random() < 0.5 ? '#ffc93c' : '#ff7b1c', size: 1 });
      }
      vitals.burn.t += dt;
      if (vitals.burn.t >= 1) {
        vitals.burn.t -= 1;
        vitals.burn.left--;
        loseHp(0.5, 'Burning', '#ff9a3c');
        if (vitals.burn && vitals.burn.left <= 0) { vitals.burn = null; renderHUD(); }
      }
    }
  }
  if (vitals.poison) {
    if (!reduceMotion && Math.random() < dt * 8) {
      particles.push({ x: player.x + (Math.random() - 0.5) * 10, y: player.y - 10 - Math.random() * 14, vx: 0, vy: -12, g: 0, life: 0.5, t: 0, col: '#9be35a', size: 1 });
    }
    vitals.poison.t += dt;
    if (vitals.poison.t >= 1) {
      vitals.poison.t -= 1;
      vitals.poison.left--;
      loseHp(0.5, 'Poison', '#9be35a');
      if (vitals.poison && vitals.poison.left <= 0) { vitals.poison = null; renderHUD(); }
    }
  }
}
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
  if (c.state === 'burrowed') {
    const m = F.mound[Math.floor(t / 900 + c.hx) % 3 ? 1 : 0];
    ctx.drawImage(m, toX(c.x - 12), toY(c.y - 10), m.width * S, m.height * S);
    return;
  }
  let img = F.walk[0];
  if (c.state === 'sleep') img = F.sleep;
  else if (c.state === 'windup') img = F.crouch;
  else if (c.state === 'lunge' || c.aimT > 0) img = F.lunge;
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
  // flames licking up a zombie caught in the sun
  if (c.burning) {
    const r = mulberry32(Math.floor(t / 90) + c.x);
    for (let k = 0; k < 9; k++) {
      ctx.fillStyle = k % 3 ? '#ff7b1c' : '#ffd23f';
      ctx.fillRect(toX(c.x - 7 + r() * 14), toY(c.y - 4 - r() * 24), S, S * (1 + ((r() * 2) | 0)));
    }
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
  for (const o of room ? room.things : things) {
    if (o.gone || !pred(o)) continue;
    const f = o.frames[0], w = f.width, h = f.height;
    if (m.x >= o.x - w / 2 && m.x <= o.x + w / 2 && m.y >= o.y - h && m.y <= o.y + 2) {
      if (!best || o.y > best.y) best = o;
    }
  }
  return best;
}

// what's under the cursor that you could act on: a station, a tree, or a block.
// in the cave it's only the chest, or the core once it's been uncovered. the
// rocks are never targets, on purpose (see tickSecretRock).
function targetAt(m) {
  const st = thingAt(m, o => o.station);
  if (st) return { type: 'station', st, key: `st:${st.kind}`, cx: st.x, cy: st.y - 8 };
  const bed = thingAt(m, o => o.bed);
  if (bed) return { type: 'bed', thing: bed, key: `bed:${bed.id}`, cx: bed.x, cy: bed.y - 10, cls: 'wood' };
  if (room) {
    if (room === caveRoom && quest.cave.rock && !quest.cave.part && thingAt(m, o => o === hollowThing)) {
      return { type: 'part', thing: hollowThing, key: 'part', cx: hollowThing.x, cy: hollowThing.y - 10 };
    }
    return typeof raceTarget === 'function' ? raceTarget(m) : null;
  }
  const b = BUILDINGS.find(bd => thingAt(m, o => o === bd.thing));
  if (b) return { type: 'building', b, thing: b.thing, key: `b:${b.room.id}`, cx: b.thing.x, cy: b.thing.y - 10 };
  const tree = thingAt(m, o => o.tree || (o === greatTree && !greatTree.chopped));
  if (tree) return { type: 'tree', thing: tree, key: `tree:${tree.id || 'great'}`, cx: tree.x, cy: tree.y - 6, cls: 'wood', great: tree === greatTree };
  const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
  if (!inside(tx, ty)) return null;
  const tile = tiles[idx(tx, ty)];
  if (STONE_TILES.has(tile) || ORE_ITEM[tile] || tile === T.SNOWBLOCK) {
    const cls = tile === T.SNOWBLOCK ? 'snow' : ORE_ITEM[tile] ? 'ore' : 'stone';
    return { type: 'tile', tx, ty, key: `tile:${idx(tx, ty)}`, cx: tx * TILE + 8, cy: ty * TILE + 8, cls, ore: ORE_ITEM[tile] };
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
  if (CLICK_ONLY.has(tgt.type)) return { time: Infinity };
  // snow is the one thing you can dig anywhere, cleared or not. moe's drill
  // just packs it down.
  if (tgt.cls === 'snow') {
    return it && it.tool === 'drill' ? { time: Infinity, hint: ['Too soft...', 'Snow', 'The drill just packs it down. Use your hands.'] } : { time: MINE_TIME.snow, drops: true, cost: 0 };
  }
  const where = room ? null : regionAt(tgt.cx / TILE, tgt.cy / TILE);
  if (where && !biomeOpen(where)) return { time: Infinity, locked: where };
  // the walls along darryl's track won't budge until you've beaten him
  if (tgt.type === 'racetile' && !raceWon()) return { time: Infinity, hint: ['Not now', tgt.ore ? ITEMS[tgt.ore].name : 'Stone', 'Darryl won\'t let you touch the track. Beat him first.'] };
  if (tgt.type === 'tree') {
    if (!tgt.great && !quest.greatTree) return { time: Infinity };
    const base = MINE_TIME.wood * (tgt.great ? 1.4 : 1);
    const time = it && it.tool === 'axe' ? base / it.speed
      : it && it.treeSpeed ? base / it.treeSpeed
      : it && ['sword', 'pickaxe', 'dagger'].includes(it.tool) ? base * TREE_TOOL_SLOW : base * TREE_HAND_SLOW;
    return { time, drops: true, cost: 1 };
  }
  // moe's drill counts as a pickaxe, a very fast one
  const pick = it && (it.tool === 'pickaxe' || it.tool === 'drill') ? it : null;
  if (tgt.cls === 'stone') {
    return pick ? { time: MINE_TIME.stone / pick.speed, drops: true, cost: 1 } : { time: MINE_TIME.stone * 2, drops: false, cost: 1 };
  }
  const harvest = !!pick && pick.harvest >= ORE_NEED[tgt.ore];
  // iron is the lowest tier that can take a diamond, and it pays for it: three
  // diamonds and the pickaxe is done
  const cost = pick && pick.mat === 'iron' && tgt.ore === 'diamond' ? Math.ceil(pick.dur / 3) : 1;
  return {
    time: harvest ? MINE_TIME.ore / ((pick.oreSpeed && pick.oreSpeed[tgt.ore]) || pick.speed) : MINE_TIME.ore * NO_HARVEST_SLOW,
    drops: harvest, cost
  };
}

let lockHintT = 0, noDropHintT = 0;
function mineStep(tgt, dt) {
  const info = mineInfo(tgt);
  if (info.time === Infinity) {
    if (info.locked) lockedToast(info.locked);
    else if (lockHintT <= 0) {
      if (info.hint) toast(...info.hint);
      else toast('Too sturdy', 'Not yet', 'The Great Tree in the Meadows has to come down first.');
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
      if (tgt.cls === 'stone') toast('Needs a pickaxe...', 'Stone', 'Without one it just crumbles to nothing.');
      else toast('Too hard...', ITEMS[tgt.ore].name, ORE_NEED[tgt.ore] >= 2
        ? 'Needs an iron pickaxe or better. This will crumble to nothing.'
        : 'Needs a stone, marble or gold pickaxe or better.');
      noDropHintT = 4;
    }
  }
  mining.need = info.time;
  mining.t += dt;
  if (tgt.thing) tgt.thing.shake = 1;
  // (the drill doesn't swing, it just keeps boring in)
  if (player.swing < 0 && !drilling) {
    player.swing = 0;
    faceAngle(Math.atan2(tgt.cy - (player.y - 10), tgt.cx - player.x));
    sfx.chip();
    const rgb = tgt.cls === 'wood' ? '160,102,58' : tgt.cls === 'ore' ? '200,200,200' : tgt.cls === 'snow' ? '235,240,250' : '140,140,140';
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
  } else if (tgt.type === 'racetile') {
    raceMineTile(tgt, info);
  } else {
    const i = idx(tgt.tx, tgt.ty);
    tiles[i] = baseOf(i);
    reach[i] = 1;
    quest.mined.push(i);
    repaintAround(tgt.tx, tgt.ty);
    paintMinimap();
    burst(tgt.cx, tgt.cy, tgt.cls === 'snow' ? '240,244,252' : '140,140,140', 12);
    if (tgt.cls === 'snow') gain('snowball', rand(3, 10), tgt.cx, tgt.cy - 8);
    else if (info.drops) gain(tgt.ore || 'stone', 1, tgt.cx, tgt.cy - 8);
    else floatText('Nothing dropped', tgt.cx, tgt.cy - 8, '#bdbdbd');
  }
  if (tool && tool.dur && info.cost !== 0) wearHeld(info.cost || 1);
  markDirty();
}

function placeBed() {
  if (room && room !== homeRoom) { toast('No room...', 'Bed', 'Put it down outside, or at home.'); sfx.deny(); return; }
  const m = mouseWorld();
  const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
  const spot = { cx: tx * TILE + 8, cy: ty * TILE + 8 };
  let blockedSpot;
  if (room) {
    // indoors it needs floor under the whole bed, clear of the furniture
    blockedSpot = ty < 3 || room.blocked(spot.cx, spot.cy + 6) || room.blocked(spot.cx, spot.cy - 12)
      || room.things.some(o => !o.gone && !o.flat && Math.abs(o.x - spot.cx) < 16 && Math.abs(o.y - (spot.cy + 6)) < 22);
  } else {
    const where = regionAt(tx + 0.5, ty + 0.5);
    if (!biomeOpen(where)) { lockedToast(where); return; }
    blockedSpot = !inside(tx, ty) || solidTile(tx, ty) || tiles[idx(tx, ty)] === T.WATER
      || things.some(o => !o.gone && !o.creature && !o.flat && Math.hypot(o.x - spot.cx, o.y - (spot.cy + 6)) < 14);
  }
  if (!inReach(spot)) { toast('Too far...', 'Bed', 'Place it somewhere closer...'); return; }
  if (blockedSpot) { toast('No room...', 'Bed', 'Needs a clear patch of ground...'); sfx.deny(); return; }
  const b = { id: `bed-${Date.now()}`, x: tx, y: ty };
  if (room) b.room = 'home';
  quest.beds.push(b);
  bedThing(b);
  inv.slots[inv.sel] = null;
  toast('Bed placed.', 'Sleep tight!', 'Right-click it at night to sleep. Hold left-click to pick it back up.');
  sfx.craft();
  afterInventoryChange();
}
function removeBed(o) {
  const list = o.room === 'home' ? homeRoom.things : things;
  list.splice(list.indexOf(o), 1);
  quest.beds = quest.beds.filter(b => b.id !== o.id);
  if (quest.spawnBed === o.id) quest.spawnBed = null;
}
function sleepIn(o) {
  if (nightAmount() < 0.5) { toast('Not tired...', 'It\'s daytime.', 'You can only sleep at night.'); sfx.deny(); return; }
  // nothing can follow you indoors, so a bed at home always works
  const hunted = !room && creatures.some(c => !c.def.passive && !c.dead && !c.dormant && ['chase', 'windup', 'lunge', 'recover'].includes(c.state));
  if (hunted) { toast('Can\'t sleep...', 'Something is hunting you...', 'Deal with it first.'); sfx.deny(); return; }
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
    toast('Good morning!', `Day ${quest.day}`, 'This bed is your respawn point now.');
  }
}
// put on the armor piece in a slot. whatever you were wearing in that spot
// swaps back into the slot it came from.
function wearFrom(ref) {
  const st = slotGet(ref), key = ITEMS[st.id].slot, was = inv.armor[key];
  inv.armor[key] = st;
  slotSet(ref, was);
  floatText(was ? `Swapped for ${ITEMS[st.id].name}` : `Put on ${ITEMS[st.id].name}`, player.x, player.y - 34, '#cfe8ff');
  sfx.craft();
  afterInventoryChange();
}
// right-click: sleep in a bed you're pointing at, place a bed you're holding,
// put on armor you're holding, or eat whatever food is in your hand
function useRight() {
  const tgt = targetAt(mouseWorld());
  if (tgt && tgt.type === 'bed') {
    if (inReach(tgt)) sleepIn(tgt.thing);
    else toast('Too far...', 'Bed', 'Walk up to it first...');
    return;
  }
  const s = heldItem();
  if (s && s.id === 'bed') { placeBed(); return; }
  if (s && ITEMS[s.id].ranged) { startBowDraw(); return; }
  if (s && ITEMS[s.id].tool === 'drill') { startDrill(); return; }
  if (s && ITEMS[s.id].armor) { wearFrom(`inv:${inv.sel}`); return; }
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
    if (night) toast('Night falls', `Night ${quest.day || 1}`, 'Monsters come out. Sleep through it, or get home.');
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
  // whatever doesn't fit on the hunger bar isn't wasted, it tops up saturation
  const total = vitals.hunger + it.food;
  vitals.hunger = Math.min(HUNGER_MAX, total);
  vitals.sat = Math.min(vitals.hunger, vitals.sat + it.sat + Math.max(0, total - HUNGER_MAX));
  if (it.poison) loseHp(Math.round(Math.random() * 100) / 100, 'Food poisoning', '#9be35a');
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
    // otherwise
    if (F.burn <= 1e-6 && F.fuel) {
      F.burn += ITEMS[F.fuel.id].fuel;
      F.fuel.n--;
      if (!F.fuel.n) F.fuel = null;
      changed = true;
    }
    if (F.burn > 1e-6) {
      // never cook past the end of the piece on the fire. the frame that
      // finished one used to run a little over, that bit of fuel was burned and
      // thrown away, and the second meat off a wood came up just short with the
      // fire out
      const step = Math.min(dt * COOK_RATE, F.burn, 1 - F.prog);
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
    toast('Crafted', it.name, it.armor ? 'Wear it from your inventory (E)' : '');
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
  if (box === 'armor') return inv.armor[i];
  if (box === 'craft') return craftGrid[+i];
  if (box === 'chest') return openChest[+i];
  if (box === 'out') { const r = matchRecipe(); return r ? { id: r.out, n: r.n } : null; }
  return furnaceState[box];
}
function slotSet(ref, stack) {
  const [box, i] = ref.split(':');
  if (box === 'inv') inv.slots[+i] = stack;
  else if (box === 'armor') inv.armor[i] = stack;
  else if (box === 'craft') craftGrid[+i] = stack;
  else if (box === 'chest') openChest[+i] = stack;
  else furnaceState[box] = stack;
}
// what each slot is allowed to hold, with the reason shown when it says no
function slotRefuses(ref, id) {
  const [box, i] = ref.split(':'), it = ITEMS[id];
  if (box === 'craft' && it.food) return 'Meat doesn\'t go on the crafting table';
  if (box === 'craft' && (it.tool || it.armor)) return 'Finished gear can\'t go back on the table';
  if (box === 'craft' && it.part) return 'That doesn\'t go on the table';
  if (box === 'input' && !it.cooksTo) return it.fuel ? 'That\'s fuel. It goes in the bottom slot.' : 'The furnace only cooks raw food and smelts raw ore';
  if (box === 'fuel' && !it.fuel) return 'Only wood and sticks burn';
  if (box === 'armor' && !it.armor) return 'That isn\'t armor';
  if (box === 'armor' && it.slot !== i) return `That goes in the ${SLOT_OF[it.slot].name.toLowerCase()} slot`;
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
// (or between your bag and the armor piece's slot)
function quickMove(ref, cur) {
  const box = ref.split(':')[0];
  if (box === 'inv' && ui === 'inv' && !ITEMS[cur.id].armor) { bagToHotbar(ref, cur); return; }
  if (box === 'inv') {
    let dest = null;
    if (ITEMS[cur.id].armor) dest = `armor:${ITEMS[cur.id].slot}`;
    else if (ui === 'furnace') dest = ITEMS[cur.id].cooksTo ? 'input' : ITEMS[cur.id].fuel ? 'fuel' : null;
    else if (ui === 'chest') {
      const same = openChest.findIndex(st => st && st.id === cur.id && st.n < maxStack(cur.id));
      const free = openChest.findIndex(st => !st);
      if (same >= 0 || free >= 0) dest = `chest:${same >= 0 ? same : free}`;
    }
    else if (ui === 'craft' && !slotRefuses('craft:0', cur.id)) {
      const free = craftGrid.findIndex(s => !s);
      if (free >= 0) dest = `craft:${free}`;
    }
    if (!dest) { hint(slotRefuses(ui === 'furnace' ? 'input' : 'craft:0', cur.id) || 'Nowhere to put that'); return; }
    const there = slotGet(dest);
    if (!there) { slotSet(dest, cur); slotSet(ref, null); }
    else if (dest.startsWith('armor:')) { slotSet(dest, cur); slotSet(ref, there); }
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
// the name goes in data-tip for the in-game tooltip (see showTip), not in a
// title, which would pop up the browser's own grey box
function slotHTML(ref, stack, extra = '', ghost = '') {
  const it = stack && ITEMS[stack.id];
  const label = it ? `${it.name}${stack.n > 1 ? ` ×${stack.n}` : ''}` : '';
  return `<button type="button" class="slot ${extra}" data-ref="${ref}"${label ? ` data-tip="${label}"` : ''} aria-label="${label || 'Empty'}">
    ${it ? `<i${it.shiny ? ' class="shine"' : ''} style="background-image:url(${ICON[stack.id]})"></i>${stack.n > 1 ? `<b>${stack.n}</b>` : ''}${durBar(stack)}` : ghost ? `<i class="ghost" style="background-image:url(${ghost})"></i>` : ''}
  </button>`;
}
// faint outlines for the empty armor slots, so you can tell which is which
const ARMOR_GHOST = Object.fromEntries(ARMOR_SLOTS.map(a => {
  const G = pixelGrid(16, 16);
  ({ head: helmetIcon, chest: armorIcon, legs: leggingsIcon, feet: bootsIcon })[a.key](G, ['#3a3d47', '#33363f', '#2c2e36']);
  return [a.key, G.canvas().toDataURL()];
}));

// which chest is open (home, the cave, a burrow or moe's) and where it is
let openChest = chestSlots, openWhere = 'at home';
function openUI(kind, st) {
  ui = kind;
  openChest = (st && st.slots) || chestSlots;
  openWhere = (st && st.where) || 'at home';
  if (st && st === denChest && !quest.moe.chestOpened) { quest.moe.chestOpened = true; markDirty(); }
  stopDrill();
  bookOpen = false;
  mining = null;
  mouse.down = false;
  // held keys aren't dropped: you can't move with a menu open anyway, and
  // whatever you're still holding when it closes carries on straight away
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
  tipEl.hidden = true;
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
    return `<div class="st-chest"><p class="inv-label">Chest <span>${openWhere}</span></p>
      <div class="chest-grid">${openChest.map((st, i) => slotHTML(`chest:${i}`, st)).join('')}</div></div>`;
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
          <div class="armor-slots">${ARMOR_SLOTS.map(a => slotHTML(`armor:${a.key}`, inv.armor[a.key], 'slot-armor', ARMOR_GHOST[a.key])).join('')}</div>
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
  showTip(mouse.x, mouse.y);
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
  const key = `${vitals.hp}|${vitals.hunger.toFixed(2)}|${ARMOR_SLOTS.map(a => inv.armor[a.key] && inv.armor[a.key].id).join()}|${vitals.slowT > 0}|${!!vitals.burn}|${!!vitals.poison}|${nightAmount() > 0.5}|${quest.day}`;
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
  // hearts fill to the hundredth, so a hit shows exactly what it took after
  // armor (there's no number next to them, alex didn't want the decimals)
  let hearts = '';
  for (let i = 0; i < 5; i++) {
    const f = clamp(vitals.hp - i, 0, 1);
    hearts += `<i style="background-image:url(${HEART.empty})"><b style="width:${(f * 100).toFixed(2)}%;background-image:url(${HEART.full})"></b></i>`;
  }
  $('#hearts').innerHTML = hearts;
  // the armor bar: each icon fills with steel for the first 5 points, then the
  // shinier runs lay over the top of it, like minecraft's extra heart rows
  const pts = armorPoints(), tier = pts > 10 ? 2 : pts > 5 ? 1 : 0;
  let plates = '';
  for (let i = 0; i < 5; i++) {
    const layer = (k, img) => { const f = clamp(pts - k * 5 - i, 0, 1); return f > 0 ? `<b style="width:${(f * 100).toFixed(2)}%;background-image:url(${img})"></b>` : ''; };
    plates += `<i style="background-image:url(${ARMOR_PT.empty})">${layer(0, ARMOR_PT.steel)}${layer(1, ARMOR_PT.reinforced)}${layer(2, ARMOR_PT.mythic)}</i>`;
  }
  const bar = $('#armor-bar');
  bar.innerHTML = plates;
  bar.className = `armor-bar${tier ? ` is-tier${tier}` : ''}`;
  bar.setAttribute('aria-label', `Armor ${pts.toFixed(2)} points, blocks ${Math.round(armorBlock() * 100)}% of every hit`);
  $('#hearts').setAttribute('aria-label', `Health ${vitals.hp.toFixed(2)} of ${vitals.max}`);
  // saturation stays hidden, like minecraft's
  $('#hunger').innerHTML = `<span class="hunger-icons">${row(vitals.hunger, DRUM)}</span>`;
  $('#hunger').setAttribute('aria-label', `Hunger ${vitals.hunger.toFixed(1)} of ${HUNGER_MAX}`);
  $('#hud-status').innerHTML = (vitals.slowT > 0 ? '<span class="hud-soaked">Soaked</span>' : '')
    + (vitals.burn ? '<span class="hud-burning">Burning</span>' : '')
    + (vitals.poison ? '<span class="hud-poisoned">Poisoned</span>' : '')
    + `<span class="hud-time${nightAmount() > 0.5 ? ' is-night' : ''}">${nightAmount() > 0.5 ? '☾ Night' : '☀ Day'} ${quest.day || 1}</span>`;
}

function renderHUD() {
  vitalsKey = '';
  renderVitals();
  $('#hotbar').innerHTML = inv.slots.slice(0, 6).map((s, i) => `
    <button type="button" class="hb-slot${i === inv.sel ? ' is-sel' : ''}" data-hotbar="${i}"${s ? ` data-tip="${ITEMS[s.id].name}${s.n > 1 ? ` ×${s.n}` : ''}"` : ''} aria-label="${s ? ITEMS[s.id].name : 'Empty'}">
      <span class="hb-key">${i + 1}</span>
      ${s ? `<i${ITEMS[s.id].shiny ? ' class="shine"' : ''} style="background-image:url(${ICON[s.id]})"></i>${s.n > 1 ? `<b>${s.n}</b>` : ''}${durBar(s)}` : ''}
    </button>`).join('');
  const s = heldItem();
  $('#held-name').textContent = s
    ? `${ITEMS[s.id].name}${ITEMS[s.id].food ? ' | right-click to eat' : ''}${ITEMS[s.id].throw ? ' | click to throw' : ''}${ITEMS[s.id].ranged ? ` | hold right-click to draw | ${countArrows()} arrows` : ''}${ITEMS[s.id].tool === 'drill' ? ' | hold right-click to drill' : ''}${ITEMS[s.id].dur ? ` | ${s.dur}/${ITEMS[s.id].dur}` : ''}`
    : 'Bare hands';
}

const countArrows = () => inv.slots.reduce((n, st) => n + (st && ITEMS[st.id].arrow ? st.n : 0), 0);
function selectSlot(i) {
  inv.sel = (i + 6) % 6;
  mining = null;
  renderHUD();
  markDirty();
}

const WEAPON_TIERS = ['stone', 'marble', 'iron', 'emerald', 'diamond'];
const craftedWeapon = () => WEAPON_TIERS.some(m => ['sword', 'axe', 'pickaxe'].some(k => quest.crafted[`${m}-${k}`]));
const QUEST_STEPS = [
  { done: () => found.has('ghs'), title: 'Find the Great Tree' },
  { done: () => quest.greatTree, title: 'Chop down the Great Tree' },
  { done: () => quest.killed.hyena, title: () => (quest.seen.hyena ? 'Defeat the Marble Hyena' : 'Find the next landmark') },
  { done: craftedWeapon, title: 'Craft a weapon' },
  { done: () => quest.killed.bear, title: 'Defeat the grizzly' },
  { done: () => false, title: 'Meadows complete' }
];
const meadowsComplete = () => QUEST_STEPS.slice(0, -1).every(q => q.done());
// the mines so far: clear the holes, beat moe, open his chest, then race
// darryl for the second landmark. the other three come later.
const raceWon = () => !!(quest.darryl && quest.darryl.won);
const MINES_STEPS = [
  { done: () => burrowsCleared() || !!quest.moe.dead, title: () => `Clear the mole holes (${BURROWS.length - burrowsLeft()} of ${BURROWS.length})` },
  { done: () => !!quest.moe.dead, title: () => (quest.moe.introSeen ? 'Defeat Moe the Mole' : 'Find what\'s doing all the digging') },
  { done: () => !!quest.moe.chestOpened, title: 'Open Moe\'s chest' },
  { done: () => !!(quest.darryl && quest.darryl.met), title: 'Find the next landmark' },
  { done: () => raceWon(), title: 'Beat Darryl in the minecart race' },
  { done: () => !!(quest.darryl && quest.darryl.statue), title: 'Open the big door' },
  { done: () => false, title: 'More coming soon' }
];
let questKey = '';
function renderQuest() {
  const mines = meadowsComplete(), steps = mines ? MINES_STEPS : QUEST_STEPS;
  const step = steps.find(q => !q.done());
  const n = steps.indexOf(step);
  const title = typeof step.title === 'function' ? step.title() : step.title;
  const key = `${mines}|${n}|${title}`;
  if (key === questKey) return;
  const first = questKey === '';
  questKey = key;
  $('#quest-step').textContent = mines ? 'The Mines' : 'The Meadows';
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
  snow:   () => noiseBurst(0.07, 2600, 0.08),
  bow:    () => { tone(420, 0.05, 'triangle', 0.05); noiseBurst(0.06, 3200, 0.06); },
  draw:   () => { tone(180, 0.25, 'triangle', 0.025); tone(240, 0.3, 'triangle', 0.02, 0.1); },
  ignite: () => { noiseBurst(0.3, 700, 0.12); tone(110, 0.2, 'sawtooth', 0.04); },
  die:    () => { tone(330, 0.15, 'triangle', 0.05); tone(247, 0.15, 'triangle', 0.05, 0.15); tone(165, 0.35, 'triangle', 0.05, 0.3); },
  boom:   () => { noiseBurst(0.5, 380, 0.22); tone(55, 0.4, 'sawtooth', 0.06); },
  rumble: () => { noiseBurst(0.45, 200, 0.1); tone(48, 0.4, 'triangle', 0.04); },
  rev:    () => { tone(90, 0.2, 'sawtooth', 0.03); tone(140, 0.25, 'sawtooth', 0.03, 0.15); tone(210, 0.3, 'sawtooth', 0.03, 0.35); },
  clang:  () => { tone(880, 0.06, 'square', 0.04); tone(1320, 0.1, 'triangle', 0.03, 0.02); noiseBurst(0.05, 4000, 0.06); },
  drill:  () => { tone(70 + Math.random() * 30, 0.1, 'sawtooth', 0.018); if (mining) noiseBurst(0.06, 3000, 0.035); }
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
  const it = ITEMS[s.id], img = ICON_CANVAS[s.id];
  // the bow goes behind you when it points up, in front otherwise
  if (it.ranged && !it.throw) {
    if ((Math.sin(bowAng) > -0.35) === front) drawDrawnBow(dx + 24 * S, dy + 42 * S);
    return;
  }
  if ((pose.front !== false) !== front) return;
  let x = pose.x, a = pose.a;
  if (player.flip) { x = CELL - x; a = 180 - a; }
  // the drill points where you're drilling, spins, and shudders in your hands
  const spinning = drilling && it.tool === 'drill';
  if (spinning) a = (aimAngle() * 180) / Math.PI;
  // tools are held by the handle and point along the swing, anything else is
  // just a smaller copy of its icon sitting in your hand. the drill is a big
  // thing, so it's held bigger.
  const k = it.tool === 'drill' ? 0.9 : it.tool ? 0.72 : 0.55;
  ctx.save();
  if (player.blink) ctx.globalAlpha = 0.4;
  ctx.translate(dx + x * S + (spinning ? Math.round(Math.random() - 0.5) * S : 0), dy + pose.y * S);
  if (it.tool) {
    ctx.rotate(((a + 45) * Math.PI) / 180);
    ctx.drawImage(spinning && Math.floor(drilling.t * 30) % 2 ? DRILL_SPIN : img, -3 * k * S, -13 * k * S, 16 * k * S, 16 * k * S);
    // a shiny blade: every so often a four-point glint runs from the guard to
    // the tip (drawn upright, whatever angle the blade's at)
    const ph = (performance.now() % 1500) / 1500;
    if (it.shiny && !reduceMotion && ph < 0.4) {
      const u = ph / 0.4, glow = 1 - Math.abs(u - 0.5) * 2;
      ctx.translate((-3 + 7 + u * 7) * k * S, (-13 + 9 - u * 7) * k * S);
      ctx.rotate((-(a + 45) * Math.PI) / 180);
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.65 * glow})`;
      ctx.fillRect(-S / 2, -1.5 * S, S, 3 * S);
      ctx.fillRect(-1.5 * S, -S / 2, 3 * S, S);
      if (glow > 0.6) { ctx.fillRect(-S / 2, -2.5 * S, S, S); ctx.fillRect(-S / 2, 1.5 * S, S, S); }
    }
  } else {
    ctx.drawImage(img, -8 * k * S, -8 * k * S, 16 * k * S, 16 * k * S);
  }
  ctx.restore();
}

// the bow in your hand, drawn for real instead of as its rotated icon (that
// turned round the icon's corner, so the bow sat at odd angles and the arrow
// wasn't on it). it's the same bow whether you're drawing it or not (alex):
// at rest it's held out at your side, and when you draw it swings round to
// your aim (bowAng eases between the two, see tickBowAngle), an arrow appears
// on the string and you pull it back. the grip is out in front of you along
// bowAng, the limbs curve back towards you and bend further the more you draw,
// and the arrow lies along the aim with its nock on the string. it's built
// exactly like the inventory icon (same size, same colours, same dark
// outline, alex wanted them to match) on a little grid, which is cached by
// angle and draw so it isn't rebuilt every frame. hx, hy is your feet on
// screen.
let bowAng = Math.PI / 2;
function bowRestAngle() {
  // held low at your side in your bow hand, a little out from the body,
  // pointing left when you face the camera (alex: left facing, like the icon)
  if (player.face === 'down') return Math.PI - 0.6;
  if (player.face === 'up') return -Math.PI + 0.6;
  return player.flip ? Math.PI - 0.3 : 0.3;
}
function tickBowAngle(dt) {
  const aiming = bowDraw || player.swing >= 0;
  const want = aiming ? aimAngle() : bowRestAngle();
  let d = want - bowAng;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  bowAng += d * Math.min(1, dt * (aiming ? 22 : 12));
}
const BOW_GRID = 56, BOW_OX = 28, BOW_OY = 34, bowCache = new Map();
function heldBowCanvas(a, c, mat) {
  const steps = 64, k = ((Math.round((a / (Math.PI * 2)) * steps) % steps) + steps) % steps;
  const ck = Math.round(c * 12), key = `${k}|${ck}|${mat}`;
  let cv = bowCache.get(key);
  if (cv) return cv;
  const ang = (k / steps) * Math.PI * 2, ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux, cc = ck / 12;
  const G = pixelGrid(BOW_GRID, BOW_GRID);
  const plot = (x, y, col) => G.set(Math.round(x) + BOW_OX, Math.round(y) + BOW_OY, col);
  const line = (x0, y0, x1, y1, col) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let i = 0; i <= n; i++) plot(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col);
  };
  const nock = bowShape(plot, ux * 10, -9 + uy * 9, ux, uy, BOW_L, BOW_BEND + cc * 2.5, cc * 5);
  // the arrow, only while you're drawing
  if (mat) {
    const head = MAT_PAL[mat], tip = [nock[0] + ux * 13, nock[1] + uy * 13];
    line(nock[0], nock[1], tip[0] - ux * 2, tip[1] - uy * 2, '#c48a4f');
    line(tip[0] - ux * 2, tip[1] - uy * 2, tip[0], tip[1], head[1]);
    plot(tip[0], tip[1], head[0]);
    plot(nock[0] + ux + vx, nock[1] + uy + vy, '#ffffff');
    plot(nock[0] + ux - vx, nock[1] + uy - vy, '#ffffff');
  }
  cv = G.outline(() => '#141414').canvas();
  if (bowCache.size > 600) bowCache.clear();
  bowCache.set(key, cv);
  return cv;
}
function drawDrawnBow(hx, hy) {
  const mat = bowDraw ? ITEMS[bestArrow() || 'wood-arrow'].arrow : '';
  const cv = heldBowCanvas(bowAng, bowCharge(), mat);
  ctx.save();
  if (player.blink) ctx.globalAlpha = 0.4;
  ctx.drawImage(cv, hx - BOW_OX * S, hy - BOW_OY * S, BOW_GRID * S, BOW_GRID * S);
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
      loseHp(0.5, 'Starving');
    }
  } else vitals.starveT = 0;
  renderVitals();
}

// the biomes open one at a time, in this order. one you haven't reached yet
// can still be walked and its landmarks found (it's a résumé, after all), but
// you can't mine, chop, build or go inside anything there until the one before
// it is cleared. snow is the exception, see mineInfo. the mines, dunes and
// tundra chapters aren't built yet, so for now only the meadows can be cleared.
// base camp is always open.
const CHAPTERS = ['meadows', 'mines', 'dunes', 'tundra'];
const CHAPTER_DONE = { meadows: () => meadowsComplete(), mines: () => false, dunes: () => false, tundra: () => false };
function biomeOpen(id) {
  const i = CHAPTERS.indexOf(id);
  return i <= 0 || CHAPTER_DONE[CHAPTERS[i - 1]]();
}
// fast travel works in a biome once it's cleared, and home with the meadows
function playBiomeCleared(id) { return id === 'camp' ? CHAPTER_DONE.meadows() : !!CHAPTER_DONE[id] && CHAPTER_DONE[id](); }
const prevBiome = id => regionById[CHAPTERS[CHAPTERS.indexOf(id) - 1]].biome;
function playRegionNote(id) { return biomeOpen(id) ? '' : `Sealed. Clear ${prevBiome(id)} first.`; }
// a landmark in a biome that isn't open yet is sealed: you can see it from a
// distance but it can't be found until the biome before it is fully cleared
function playSealNote(p) {
  if (!biomeOpen(p.region)) return `Sealed. Clear ${prevBiome(p.region)} first.`;
  const why = mineSealReason(p);
  return why ? `Sealed. ${why}` : '';
}
const sealHinted = new Set();
function lockedToast(id) {
  if (lockHintT > 0) return;
  lockHintT = 2.5;
  toast('Locked', regionById[id].biome, `Clear ${prevBiome(id)} first.`);
  sfx.deny();
}
let wasComplete = null;
function checkChapters() {
  const done = meadowsComplete();
  if (wasComplete === false && done) {
    // the grizzly is the last step, and its own landmark and "defeated" toasts
    // go first, so this one waits its turn instead of wiping them off
    setTimeout(() => { toast('Meadows complete', 'The Mines are open', 'Fast travel works in the Meadows now.'); sfx.found(); }, 4600);
    renderJournal(journalRegion);
    paintMinimap();
  }
  wasComplete = done;
  if (room) return;
  // walking up to a sealed landmark tells you once why nothing happened. a
  // mines landmark whose boss is still alive says where to look instead.
  POIS.forEach(p => {
    const guarded = !!MINE_BOSSES[p.id] && playLandmarkGuarded(p);
    if (sealHinted.has(p.id) || found.has(p.id) || p.thing.gone || !(playSealNote(p) || guarded)) return;
    if (Math.hypot(p.thing.x - player.x, p.thing.y - player.y) < TILE * 3.4) {
      sealHinted.add(p.id);
      if (playSealNote(p)) toast('Sealed', '? ? ?', playSealNote(p).replace(/^Sealed\. /, ''));
      else toast('Guarded', '? ? ?', (MINE_BOSSES[p.id] && MINE_BOSSES[p.id].guard) || 'Something is down there...');
      sfx.deny();
    }
  });
}

// asleep you lie on your back in the bed: head on the pillow with your eyes
// shut and the blanket pulled up to your chin. it's the facing-down idle
// frame with the bottom of the bed drawn back over your body, instead of the
// sideways death frame, which stuck out over the edge of the bed.
function playDrawSleeper(toX, toY) {
  const bed = sleeping && sleeping.bed;
  if (!bed) return;
  const img = sheetPlay.naturalWidth ? sheetPlay : sheet;
  const bx = bed.x - Math.floor(BED.width / 2), by = bed.y - BED.height + 1;
  // the head is rows 22 to 34 of the cell and about 25px across, so this puts
  // it on the pillow, centred on the bed
  const px = bed.x - 25, py = by + 4 - 22;
  ctx.drawImage(img, 0, 0, CELL, CELL, toX(px), toY(py), CELL * S, CELL * S);
  // eyes are 2px tall at x 22 and 26; covering the top pixel shuts them
  ctx.fillStyle = '#c1ac8f';
  [22, 26].forEach(ex => ctx.fillRect(toX(px + ex), toY(py + 30), S, S));
  const top = 17;
  ctx.drawImage(BED, 0, top, BED.width, BED.height - top, toX(bx), toY(by + top), BED.width * S, (BED.height - top) * S);
  // the sheet folded over the top of the blanket
  ctx.fillStyle = '#ece8df';
  ctx.fillRect(toX(bx + 2), toY(by + top), 14 * S, S);
  ctx.fillStyle = '#e05a4a';
  ctx.fillRect(toX(bx + 2), toY(by + top + 1), 14 * S, S);
}

// going in and out of buildings. you come in at the door facing the back
// wall, and leave onto the ground just outside it facing out.
function enterRoom(r, quiet) {
  room = r;
  player.x = r.door * TILE + 8;
  player.y = r.h - 6;
  player.face = 'up';
  player.path = null;
  mining = null;
  rockT = 0;
  particles.length = 0;
  projectiles.length = 0;
  // (held keys carry on through the door: you keep walking in)
  // down a mole hole you start a couple of steps in from the way out
  if (r === denRoom || r.burrow !== undefined) player.y = r.h - HOLE_IN;
  if (r === denRoom && !moe.dead) startMoeIntro();
  if (typeof raceEnter === 'function') raceEnter(r);
  Object.assign(cam, roomCam());
  if (quiet) return;
  sfx.region();
  if (r.burrow !== undefined && !quest.burrows[r.burrow].visited) {
    quest.burrows[r.burrow].visited = true;
    toast('Underground', 'A mole hole', 'Something has burrowed down there...');
    markDirty();
  }
  if (r === denRoom && moe.dead) toast('Inside', 'Moe\'s den', 'Awkward silence...');
  if (r === caveRoom && !quest.cave.visited) {
    quest.cave.visited = true;
    toast('Inside', 'The Cave', 'It smells like bear in here...');
    markDirty();
  }
  if (r === homeRoom && !quest.homeVisited) {
    quest.homeVisited = true;
    toast('Home', 'Your workshop', 'Craft, cook and store things in here. Maybe a bed?');
    markDirty();
  }
}
function playLeaveRoom(quiet) {
  const r = room;
  if (r === denRoom) resetMoe();
  if (typeof raceLeave === 'function') raceLeave(r);
  // anything down there goes back to where it started (moles back under their
  // mounds), so walking back in doesn't drop you straight into their teeth
  creatures.forEach(c => {
    if (c.room !== r || c.dead || c.def.boss) return;
    Object.assign(c, { x: c.hx, y: c.hy, state: c.def.rest, t: 0, cd: 0.6, kx: 0, ky: 0, path: null, moving: false });
  });
  room = null;
  projectiles.length = 0;
  player.x = r.exit.x;
  player.y = r.exit.y;
  player.face = 'down';
  mining = null;
  particles.length = 0;
  // (held keys carry on out of it too)
  Object.assign(cam, clampCam(camTarget()));
  if (!quiet) sfx.ui();
}
const buildingOpen = b => biomeOpen(regionAt(b.tile[0] + 0.5, b.tile[1] + 0.5));
// walking up into an open doorway takes you in, same as clicking the building
// a mole hole you just walk into (you have to actually be walking, so
// stepping back out of one doesn't drop you straight back in)
function checkDoors() {
  if (room || player.dead) return;
  const pushing = keys.has('KeyW') || keys.has('ArrowUp');
  for (const b of BUILDINGS) {
    if (b.hole) {
      const pit = b.pit || { x: b.thing.x, y: b.thing.y - 9, w: 9 };
      if (!player.moving || Math.abs(player.x - pit.x) > pit.w || Math.abs(player.y - pit.y) > 5) continue;
      if (!buildingOpen(b)) lockedToast(regionAt(b.tile[0] + 0.5, b.tile[1] + 0.5));
      else if (b.open()) enterRoom(b.room);
      // a shut hole: say so once in a while, not every frame you walk over it
      else if (performance.now() > (b.shutAt || 0)) { b.shutAt = performance.now() + 4000; toast(...b.shut()); sfx.deny(); }
      return;
    }
    // a doorway takes you in as soon as you've stepped into it far enough to
    // be drawn behind the building. it used to need you pushing up inside the
    // top few pixels of the doorway, so you could stand in the tent's flap,
    // hidden behind the canvas, and still be outside.
    const doorX = b.tile[0] * TILE + 8, doorY = b.tile[1] * TILE;
    const inDoor = Math.abs(player.x - doorX) < 8 && player.y > doorY - 4 && player.y < b.thing.y;
    if (inDoor && (player.moving || pushing) && b.open() && buildingOpen(b)) { enterRoom(b.room); return; }
  }
}
function useBuilding(b) {
  if (!buildingOpen(b)) { lockedToast(regionAt(b.tile[0] + 0.5, b.tile[1] + 0.5)); return; }
  if (b.open()) { enterRoom(b.room); return; }
  toast(...(typeof b.shut === 'function' ? b.shut() : b.shut));
  sfx.deny();
}

// the rock with the core under it looks exactly like the other rocks: it's
// never a target, so there's no outline, no hand cursor and no progress bar.
// hold the mouse on it (in reach) and you stop swinging and lean on it. it
// takes about 5 seconds, and from about 3 seconds in it starts to give: it
// rocks harder and harder, dust shakes out from under it, and the core's
// violet light leaks out round its edges. then it rolls aside. letting go
// starts the count over.
const ROCK_TIME = 5, ROCK_GIVE = 3;
let rockT = 0, onRock = false;
function tickSecretRock(dt) {
  if (quest.cave.rock) {
    // finish rolling it out of the way after it gives
    if (secretRock.slide < 1) {
      secretRock.slide = Math.min(1, secretRock.slide + dt * 2.5);
      secretRock.x = ROCK_SPOT.x + smooth(secretRock.slide) * 18;
    }
    return;
  }
  const m = mouseWorld(), f = secretRock.frames[0];
  // a few pixels of slack round the rock and a little extra reach, since it's
  // small and there's nothing telling you you're on it
  const over = m.x >= secretRock.x - f.width / 2 - 4 && m.x <= secretRock.x + f.width / 2 + 4 && m.y >= secretRock.y - f.height - 4 && m.y <= secretRock.y + 4;
  const near = Math.hypot(secretRock.x - player.x, secretRock.y - 6 - (player.y - 8)) <= (REACH_TILES + 0.5) * TILE;
  onRock = room === caveRoom && mouse.down && !ui && !player.dead && !cine && over && near;
  rockT = onRock ? rockT + dt : 0;
  if (onRock) faceAngle(Math.atan2(secretRock.y - 6 - (player.y - 10), secretRock.x - player.x));
  const k = clamp((rockT - ROCK_GIVE) / (ROCK_TIME - ROCK_GIVE), 0, 1);
  secretRock.shake = k > 0 ? 0.6 + k * 1.6 : 0;
  coreGlow.off = !(k > 0);
  coreGlow.strength = 0.12 + 0.45 * k;
  if (k > 0 && !reduceMotion) {
    if (Math.random() < dt * (6 + 14 * k)) particles.push({ x: secretRock.x + (Math.random() - 0.5) * 18, y: secretRock.y - 1, vx: (Math.random() - 0.5) * 20, vy: -8 - Math.random() * 10, g: 40, life: 0.5, t: 0, col: Math.random() < 0.5 ? '#8a8a8a' : '#6e6a64', size: 1 });
    if (Math.random() < dt * (3 + 12 * k)) particles.push({ x: secretRock.x + (Math.random() - 0.5) * 20, y: secretRock.y - 2, vx: (Math.random() - 0.5) * 6, vy: -14 - Math.random() * 12, g: 0, life: 0.7, t: 0, col: Math.random() < 0.5 ? '#c08bff' : '#7ff7ff', size: 1 });
  }
  if (rockT >= ROCK_TIME) moveRock();
}
function moveRock() {
  quest.cave.rock = true;
  rockT = 0;
  onRock = false;
  secretRock.shake = 0;
  coreGlow.strength = 0.3;
  secretRock.slide = 0;
  hollowThing.gone = false;
  coreGlow.off = !!quest.cave.part;
  sfx.crunch();
  burst(ROCK_SPOT.x, ROCK_SPOT.y - 4, '140,140,140', 18);
  toast('Under the rock', 'Something in the floor?', 'Something down there is humming...');
  markDirty();
}
function takePart() {
  if (!inv.slots.some(st => !st)) { toast('Bag full', '???', 'Make some room in your inventory (E)'); sfx.deny(); return; }
  addItem('exotic-core', 1);
  quest.cave.part = true;
  if (!quest.parts.includes('exotic-core')) quest.parts.push('exotic-core');
  coreGlow.off = true;
  burst(hollowThing.x, hollowThing.y - 10, '150,120,255', 24);
  toast('Found', '???', `Part ${quest.parts.length} of ${MACHINE_PARTS}`);
  sfx.found();
  markDirty();
}
// the hollow the rock was sitting on: a dark pit in the floor with the core
// standing in it, a slow pulse of light round the ring and a darker breath in
// the middle
function drawHollow(o, toX, toY, t) {
  const cx = o.x, py = o.y - 6;
  for (let y = -5; y <= 5; y++) {
    const half = Math.round(Math.sqrt(1 - (y / 5.5) ** 2) * 11);
    ctx.fillStyle = Math.abs(y) >= 4 ? '#3a3532' : '#0b0908';
    ctx.fillRect(toX(cx - half), toY(py + y), half * 2 * S, S);
  }
  if (quest.cave.part) return;
  const bob = reduceMotion ? 0 : Math.round(Math.sin(t / 500));
  const cy = py - 9 + bob;
  ctx.drawImage(CORE, toX(cx - 12), toY(cy - 11), 24 * S, 24 * S);
  const pulse = reduceMotion ? 0.5 : 0.5 + Math.sin(t / 380) * 0.5;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(toX(cx), toY(cy), 3 * S, toX(cx), toY(cy), 13 * S);
  g.addColorStop(0, 'rgba(127,247,255,0)');
  g.addColorStop(0.55, `rgba(127,247,255,${0.12 + pulse * 0.18})`);
  g.addColorStop(0.8, `rgba(192,139,255,${0.1 + pulse * 0.12})`);
  g.addColorStop(1, 'rgba(192,139,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(toX(cx - 14), toY(cy - 14), 28 * S, 28 * S);
  ctx.globalCompositeOperation = 'source-over';
}
// light falling into the core instead of coming off it
function coreMotes(dt) {
  if (room !== caveRoom || !quest.cave.rock || quest.cave.part || reduceMotion || Math.random() > dt * 9) return;
  const a = Math.random() * Math.PI * 2, d = 16 + Math.random() * 10;
  const cx = hollowThing.x, cy = hollowThing.y - 15;
  particles.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: -Math.cos(a) * d * 1.6, vy: -Math.sin(a) * d * 1.6, g: 0, life: 0.6, t: 0, col: Math.random() < 0.5 ? '#7ff7ff' : '#c08bff', size: 1 });
}

// raceBusy: talking to darryl, riding a minecart, or his little show after a
// race (all in js/resume-game-race.js). the engine leaves you alone then.
const raceBusy = () => typeof raceHolds === 'function' && raceHolds();
function playFrozen() { return ui !== null || player.dead || !!sleeping || !!cine || raceBusy(); }
// which layer of img/player-armor.png to paint over you, or -1 for none
const ARMOR_LAYERS = ['hide', 'wool', 'gold', 'marble', 'iron', 'emerald', 'diamond'];
// every worn piece is painted on you: the chestplate from img/player-armor.png,
// the helmet, leggings and boots from img/player-armor-pieces.png (blocks 0, 1
// and 2 of seven materials each). boots and leggings go down first, then the
// chestplate, then the helmet.
const PIECE_BLOCK = { head: 0, legs: 1, feet: 2 };
function playArmorLayers() {
  if (!started) return [];
  const out = [];
  ['feet', 'legs', 'chest', 'head'].forEach(k => {
    const st = inv.armor[k];
    if (!st) return;
    const m = ARMOR_LAYERS.indexOf(ITEMS[st.id].armor);
    out.push(k === 'chest' ? ['torso', m] : ['pieces', PIECE_BLOCK[k] * 7 + m]);
  });
  return out;
}
// how much of you is in gold, for the shine
const goldShare = () => armorSum(A => (A.shine ? 1 : 0));
function playSpeedMult() {
  // iron slows you down by its share: a full set is the old 85%. drawing the
  // bow slows you a little too, like holding it steady.
  const slow = 1 - armorSum(A => 1 - (A.slow || 1));
  return (vitals.slowT > 0 ? 0.55 : 1) * slow
    * (vitals.hunger <= 0.5 ? STARVING_SLOW : 1) * (eating ? 0.5 : 1) * (bowDraw ? 0.65 : 1);
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
    if (player.deadT > deathLen()) respawn();
  } else {
    if (Math.abs(vitals.kx) + Math.abs(vitals.ky) > 1) {
      moveBody(player, vitals.kx * dt, vitals.ky * dt);
      vitals.kx *= Math.max(0, 1 - dt * 10);
      vitals.ky *= Math.max(0, 1 - dt * 10);
    }
    tickHunger(dt);
    tickStatus(dt);
    // soaked: drips off you while it lasts
    if (vitals.slowT > 0 && Math.random() < dt * 14) {
      particles.push({ x: player.x + (Math.random() - 0.5) * 12, y: player.y - 18, vx: 0, vy: 20, g: 80, life: 0.4, t: 0, col: '#7ec3ff', size: 1 });
    }
    // gold armor catches the light, more the more of it you're wearing
    const gold = goldShare();
    if (gold > 0 && !reduceMotion && Math.random() < dt * 6 * gold) {
      particles.push({ x: player.x + (Math.random() - 0.5) * 14, y: player.y - 8 - Math.random() * 18, vx: 0, vy: -6, g: 0, life: 0.5, t: 0, col: '#fff3a0', size: 1 });
    }
  }

  // only what's where you are moves: the overworld waits while you're indoors,
  // and a room's creatures wait while you're out
  creatures.forEach(c => { if (here(c)) updateCreature(c, dt); });
  updateProjectiles(dt);
  if (!room) {
    for (let i = creatures.length - 1; i >= 0; i--) {
      if (creatures[i].despawn) { things.splice(things.indexOf(creatures[i]), 1); creatures.splice(i, 1); }
    }
    updateSpawning(dt);
    updateNightSpawns(dt);
    checkDoors();
  } else if (!room.sealed && player.y > room.h - 3) {
    // a room can lead somewhere other than outside (the statue room's way down
    // goes back to the race track)
    if (room.bottomTo) room.bottomTo();
    else playLeaveRoom();
  }
  shakeAmp = Math.max(0, shakeAmp - dt * 10);
  tickGround(dt);
  if (typeof raceTick === 'function') raceTick(dt);
  tickCine(dt);
  tickBossBar(dt);
  tickMusic(dt);
  tickDrill(dt);
  noArrowT -= dt;
  tickSecretRock(dt);
  coreMotes(dt);
  tickClock(dt);
  tickEating(dt);
  tickBow(dt);
  tickSleep(dt);
  checkChapters();
  furnaceTick(dt);

  // holding the mouse: hit anything in the swing arc first, otherwise mine
  // whatever's under the cursor, otherwise just swing at the air
  // (holding a snowball throws it instead of swinging, unless you're pointing
  // at something you can dig or chop right in front of you. the bow is drawn
  // with the right button, see startBowDraw, and moe's drill only works on the
  // right button too, so left click with it does nothing. holding on the
  // rock with the core under it doesn't swing either, see tickSecretRock.)
  const held = heldItem() && ITEMS[heldItem().id];
  tickBowAngle(dt);
  swingAsk = Math.max(0, swingAsk - dt);
  if (mouse.down && !ui && !player.dead && !cine && !raceBusy() && !drilling && !onRock && !(held && held.tool === 'drill')) {
    const tool = heldTool();
    const a = aimAngle();
    const tgt = targetAt(mouseWorld());
    const ranged = shootsHere() && held && held.throw;
    const diggable = tgt && !CLICK_ONLY.has(tgt.type) && inReach(tgt) && (!ranged || mineInfo(tgt).time !== Infinity);
    const fighting = !ranged && creatures.some(c => inArc(c, a, tool));
    if (!fighting && diggable) { mineStep(tgt, dt); swingAsk = 0; }
    else {
      if (mining && mining.thing) mining.thing.shake = 0;
      mining = null;
      if (ranged) useRanged(held);
      // a swing is one click (alex): holding the button down doesn't keep
      // swinging, so you have to time your hits. a click that lands just
      // before the cooldown runs out still counts (swingAsk), otherwise
      // quick clicking would feel like it eats your clicks.
      else if (swingAsk > 0 && vitals.atkCD <= 0) { attack(); swingAsk = 0; }
    }
  } else if (mining && !drilling) {
    if (mining.thing) mining.thing.shake = 0;
    mining = null;
  }

  // the first nudge, when you walk up to the great tree
  if (!room && !tipShown && !quest.greatTree && Math.hypot(greatTree.x - player.x, greatTree.y - player.y) < TILE * 3.2) {
    tipShown = true;
    setTimeout(() => toast('The Great Tree', 'Chop it down', 'Hold left-click on the trunk with your dagger.'), 1200);
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
    canvas.style.cursor = tgt && inReach(tgt) && (CLICK_ONLY.has(tgt.type) || mineInfo(tgt).time !== Infinity) ? 'pointer' : 'crosshair';
  }
}

// what you can actually see in the dark: everything by day, and at night (or in
// the mines) only what's near you or near a flame, same idea as the signs
function visibleInDark(x, y) {
  // rooms are small and have their own lights, so everything in one counts
  if (room) return true;
  const night = nightAmount() > 0.5, mine = amb.mines > 0.5;
  if (!night && !mine) return true;
  if (Math.hypot(x - player.x, y - player.y) < TILE * 3.6) return true;
  return glows.some(gl => !gl.off && gl.flicker && Math.hypot(gl.x - x, gl.y - y) < gl.rad * TILE * 1.2);
}
function drawEyes(c, toX, toY, t) {
  const img = c.frames.walk[0], w = img.width, h = img.height;
  const lean = c.kind === 'zombie' && c.state === 'lunge' ? 2 : 0;
  const x0 = c.x - Math.floor(w / 2), y0 = c.y - h + 2 + (inWater(c) ? 4 : 0);
  const col = c.kind === 'zombie' ? '255,74,58' : '200,255,90';
  const pulse = reduceMotion ? 1 : 0.75 + Math.sin(t / 260 + c.x) * 0.25;
  EYES[c.kind].forEach(([ex, ey]) => {
    const px = c.flip ? x0 + (w - 1 - ex - lean) : x0 + ex + lean, py = y0 + ey;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(toX(px + 0.5), toY(py + 0.5), 0, toX(px + 0.5), toY(py + 0.5), 4 * S);
    g.addColorStop(0, `rgba(${col},${0.5 * pulse})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(toX(px - 4), toY(py - 4), 9 * S, 9 * S);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${col},${pulse})`;
    ctx.fillRect(toX(px), toY(py), S, S);
  });
}

function playRenderOverlay(toX, toY, t) {
  if (!started) return;
  if (player.dead) drawDeath(toX, toY);
  const fs = Math.max(16, 8 * Math.round((S * 5.3) / 8));

  // gold armor gets a soft warm halo, brighter the more of it you're wearing
  const gold = goldShare();
  if (gold > 0 && !player.dead) {
    const gx = toX(player.x), gy = toY(player.y - 12), rad = TILE * S * 1.6;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
    g.addColorStop(0, `rgba(255,214,90,${(0.18 + Math.sin(t / 300) * 0.05) * gold})`);
    g.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  // target outline + mining progress
  if (!ui && !player.dead && mouse.inCanvas && !mouse.touch) {
    const tgt = targetAt(mouseWorld());
    if (tgt) {
      const ok = inReach(tgt) && (CLICK_ONLY.has(tgt.type) || mineInfo(tgt).time !== Infinity);
      let x0, y0, w, h;
      if (tgt.type === 'tile' || tgt.type === 'racetile') { x0 = tgt.tx * TILE; y0 = tgt.ty * TILE; w = h = TILE; }
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
    const blockish = tg.type === 'tile' || tg.type === 'racetile';
    const bx = toX(tg.cx - 10), by = toY(tg.barY !== undefined ? tg.barY : tg.cy - (blockish ? 14 : 44));
    ctx.fillStyle = 'rgba(10,10,14,0.85)';
    ctx.fillRect(bx, by, 20 * S, 3 * S);
    // red bar when this one isn't going to drop anything
    ctx.fillStyle = mineInfo(tg).drops === false ? '#ff7b6b' : '#ffd23f';
    ctx.fillRect(bx + S, by + S, Math.round(18 * S * Math.min(1, mining.t / mining.need)), S);
    if (blockish) {
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
    if (!here(c) || c.dead || c.gone || c.def.boss || c.state === 'burrowed') return;
    // in the dark you only see what's lit, so no health bars or tells out
    // there, just a night mob's eyes glinting back at you
    if (!visibleInDark(c.x, c.y)) { if (EYES[c.kind]) drawEyes(c, toX, toY, t); return; }
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

  // hint bubbles that sit above a landmark's label so they never cover you:
  // "hold click" on the great tree until it's down, "click" on the open cave
  const bubble = (o, text) => {
    const tw = ctx.measureText(text).width, pad = fs * 0.5;
    const x = toX(o.x), y = toY(o.y - o.frames[0].height - 3) - fs * 3.4;
    ctx.fillStyle = 'rgba(12,12,16,0.85)';
    ctx.fillRect(x - tw / 2 - pad, y - fs * 0.8, tw + pad * 2, fs * 1.6);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(text, x, y + 1);
  };
  if (!room && !quest.greatTree && Math.hypot(greatTree.x - player.x, greatTree.y - player.y) < TILE * 4) bubble(greatTree, 'HOLD CLICK TO CHOP');
  if (!room) BUILDINGS.forEach(b => { if (b.hint() && b.open() && Math.hypot(b.thing.x - player.x, b.thing.y - player.y) < TILE * 4) bubble(b.thing, 'CLICK TO ENTER'); });

  // things in flight, each with a little shadow on the ground under it
  if (shootsHere()) projectiles.forEach(p => {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(toX(p.x - 1), toY(p.y + 10), 2 * S, S);
    if (p.kind === 'snow') {
      ctx.fillStyle = '#f4f8ff';
      ctx.fillRect(toX(p.x - 1), toY(p.y - 1), 3 * S, 3 * S);
      ctx.fillStyle = '#b9cbe6';
      ctx.fillRect(toX(p.x), toY(p.y + 1), 2 * S, S);
      return;
    }
    const ux = Math.cos(p.a), uy = Math.sin(p.a);
    const tip = p.kind === 'arrow' ? MAT_PAL[p.mat][1] : '#7be05a';
    for (let k = -5; k <= 3; k++) {
      ctx.fillStyle = k >= 2 ? tip : k <= -4 ? (p.kind === 'arrow' ? '#f2efe8' : '#5e3a1c') : (p.kind === 'arrow' ? '#c48a4f' : '#8b4726');
      ctx.fillRect(toX(p.x + ux * k), toY(p.y + uy * k), S, S);
    }
  });

  // drawing the bow: a bar filling over your head, and a dotted line out the
  // way it'll go, longer the further you draw (the bow and the nocked arrow
  // are drawn with you, see drawDrawnBow)
  if (bowDraw) {
    const charge = bowCharge(), a = aimAngle(), o = aimOrigin();
    const bx = toX(player.x - 10), by = toY(player.y - 46);
    ctx.fillStyle = 'rgba(10,10,14,0.85)';
    ctx.fillRect(bx, by, 20 * S, 3 * S);
    ctx.fillStyle = charge >= 1 ? '#ffffff' : '#ffd23f';
    ctx.fillRect(bx + S, by + S, Math.round(18 * S * charge), S);
    const ux = Math.cos(a), uy = Math.sin(a);
    const reachPx = (BOW.minRange + (BOW.maxRange - BOW.minRange) * charge) * TILE;
    ctx.fillStyle = `rgba(255,240,200,${0.45 + charge * 0.45})`;
    for (let d = 24; d < reachPx; d += 7) ctx.fillRect(toX(o.x + ux * d), toY(o.y + uy * d), S * 2, S * 2);
  }

  if (eating) {
    const bx = toX(player.x - 10), by = toY(player.y - 46);
    ctx.fillStyle = 'rgba(10,10,14,0.85)';
    ctx.fillRect(bx, by, 20 * S, 3 * S);
    ctx.fillStyle = '#f2c06a';
    ctx.fillRect(bx + S, by + S, Math.round(18 * S * Math.min(1, eating.t / EAT_TIME)), S);
  }

  if (typeof raceOverlay === 'function') raceOverlay(toX, toY, t);

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
// the slot under the mouse in an open inventory, if there's anything in it
function hoveredRef() {
  const el = document.elementFromPoint(mouse.x, mouse.y)?.closest('[data-ref]');
  return el && slotGet(el.dataset.ref) ? el.dataset.ref : null;
}
// a number key over a slot sends what's in it to that hotbar slot. whatever
// was already there goes into your bag (back where the new one came from if
// that was in the bag), and if there's no room at all it's dropped at your feet
function toHotbar(ref, i) {
  const target = `inv:${i}`;
  if (ref === target || ref.startsWith('out')) return;
  const st = slotGet(ref), there = inv.slots[i];
  slotSet(ref, null);
  inv.slots[i] = st;
  if (there) {
    const [box, j] = ref.split(':');
    const free = inv.slots.findIndex((x, n) => n >= 6 && !x);
    if (box === 'inv' && +j >= 6) inv.slots[+j] = there;
    else if (free >= 0) inv.slots[free] = there;
    else if (box === 'inv') inv.slots[+j] = there;
    else { dropStack(there, player.x, player.y + 4, room, 1.5); hint(`Bag full, dropped the ${ITEMS[there.id].name}`); }
  }
  sfx.ui();
  afterInventoryChange();
}
function playKey(e, onControl) {
  if (typeof raceKey === 'function' && raceKey(e)) return true;
  const k = e.key.toLowerCase();
  if (k === 'e') { e.preventDefault(); if (ui) closeUI(); else openUI('inv'); return true; }
  if (k === 'escape' && ui) { closeUI(); return true; }
  // q drops one, shift q the whole stack: whatever's under the mouse with the
  // inventory open, otherwise whatever's in your hand
  if (k === 'q' && !onControl && !player.dead && !cine) {
    if (ui) { const ref = hoveredRef(); if (ref) dropFrom(ref, e.shiftKey); }
    else if (heldItem()) dropFrom(`inv:${inv.sel}`, e.shiftKey);
    return true;
  }
  if (ui && /^[1-6]$/.test(k)) { const ref = hoveredRef(); if (ref) toHotbar(ref, Number(k) - 1); return true; }
  if (ui) return MOVE_KEYS[e.code] !== undefined;
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
  if (!started || ui || player.dead || cine) return;
  if (raceBusy()) { if (typeof raceClick === 'function') raceClick(e); return; }
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.inCanvas = true;
  mouse.touch = e.pointerType === 'touch';
  // keep the release coming to us even if it happens off the canvas or outside
  // the window, and don't let the press start a text selection or a drag (a
  // drag cancels the pointer and the release never arrives)
  if (!mouse.touch) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported, the button check below still covers it */ }
  }
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (e.button === 2) { useRight(); return; }
  if (e.button !== 0) return;
  const tgt = targetAt(mouseWorld());
  if (tgt && CLICK_ONLY.has(tgt.type)) {
    const name = tgt.type === 'station' ? { craft: 'Crafting Table', furnace: 'Furnace', chest: 'Chest' }[tgt.st.kind] : tgt.type === 'building' ? tgt.b.name : '???';
    if (!inReach(tgt)) toast('Too far...', name, 'Walk up to it first');
    else if (tgt.type === 'station' && tgt.st.locked) { toast('Locked', 'Moe\'s Loot', 'Defeat Moe the Mole first.'); sfx.deny(); }
    else if (tgt.type === 'station') openUI(tgt.st.kind, tgt.st);
    else if (tgt.type === 'building') useBuilding(tgt.b);
    else takePart();
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
  swingAsk = SWING_BUFFER;
});
window.addEventListener('pointerup', e => { if (e.button === 2) { releaseBow(); stopDrill(); } else mouse.down = false; });
// letting go of one button while holding the other comes through as a move,
// not a pointerup, so every move also checks which buttons are actually still
// down. a cancelled pointer lets go of everything.
window.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return;
  if (mouse.down && !(e.buttons & 1)) mouse.down = false;
  if (!(e.buttons & 2)) { if (bowDraw) releaseBow(); stopDrill(); }
});
const letGo = () => { mouse.down = false; bowDraw = null; stopDrill(); };
canvas.addEventListener('pointercancel', letGo);
canvas.addEventListener('lostpointercapture', e => { if (!(e.buttons & 1)) mouse.down = false; });
window.addEventListener('blur', () => { mouse.down = false; bowDraw = null; stopDrill(); });
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
// right drag: with a stack on the cursor (or after right-pressing a stack to
// pick half of it up), hold right click and sweep across squares to leave one
// in each, like laying three diamonds across the top of a pickaxe. it used to
// listen for mouseover, which broke two ways: every square redraws the
// inventory, and the browser can follow a redraw with a mouseover that says
// no button is down, which ended the drag (often after two squares), and a
// quick sweep could skip a square between two events. now the drag lasts from
// the press to the release, and each move checks every few pixels of the path
// it covered for squares it hasn't filled yet.
let rightDrag = null, dragFrom = null, lastClick = { x: -99, y: -99, t: 0 };
function sweepTo(x, y) {
  const n = Math.max(1, Math.ceil(Math.hypot(x - dragFrom.x, y - dragFrom.y) / 6));
  for (let k = 1; k <= n && heldStack; k++) {
    const el = document.elementFromPoint(dragFrom.x + ((x - dragFrom.x) * k) / n, dragFrom.y + ((y - dragFrom.y) * k) / n)?.closest('[data-ref]');
    if (!el || rightDrag.has(el.dataset.ref)) continue;
    const ref = el.dataset.ref, cur = slotGet(ref);
    rightDrag.add(ref);
    if (['out', 'output'].includes(ref.split(':')[0]) || slotRefuses(ref, heldStack.id)) continue;
    if (cur && (cur.id !== heldStack.id || cur.n >= maxStack(cur.id))) continue;
    slotClick(ref, 2, false);
  }
  dragFrom = { x, y };
}
// double click while holding a stack that isn't full (like minecraft): it
// pulls more of the same thing onto the cursor from everything on screen, your
// bag and hotbar plus whatever's open (a chest, the crafting grid, the
// furnace), the smallest stacks first so full ones aren't broken up, until
// it's full or there's none left
function gatherHeld() {
  if (!heldStack || maxStack(heldStack.id) <= 1) return;
  const max = maxStack(heldStack.id), id = heldStack.id;
  const open = ui === 'chest' ? openChest.map((_, i) => `chest:${i}`)
    : ui === 'craft' ? craftGrid.map((_, i) => `craft:${i}`)
    : ui === 'furnace' ? ['input', 'fuel', 'output'] : [];
  const refs = [...inv.slots.map((_, i) => `inv:${i}`), ...open]
    .filter(r => { const x = slotGet(r); return x && x.id === id; })
    .sort((a, b) => slotGet(a).n - slotGet(b).n);
  for (const r of refs) {
    if (heldStack.n >= max) break;
    const x = slotGet(r), k = Math.min(max - heldStack.n, x.n);
    heldStack.n += k;
    x.n -= k;
    if (!x.n) slotSet(r, null);
  }
  sfx.ui();
  afterInventoryChange();
}
invWrap.addEventListener('mousedown', e => {
  const slot = e.target.closest('[data-ref]');
  if (slot) {
    e.preventDefault();
    const ref = slot.dataset.ref, now = performance.now();
    // a real dblclick event can't be used: the first click redraws the
    // inventory, so the two clicks land on different elements. it used to
    // also need both clicks on the same slot within 350ms, which missed
    // doubles that were a little slow or landed a pixel over the edge of the
    // slot. now it's any second press within half a second and a few pixels
    // of the first (or one the browser itself counts as a double). the second
    // click of a double gathers instead of putting the stack down.
    const dbl = e.button === 0 && !e.shiftKey && (e.detail >= 2 || (now - lastClick.t < 500 && Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 16));
    lastClick = { x: e.clientX, y: e.clientY, t: dbl ? 0 : now };
    if (dbl && heldStack) { gatherHeld(); return; }
    // right click an armor piece in your bag or hotbar (with nothing on the
    // cursor) to put it on
    if (e.button === 2 && !heldStack && ref.startsWith('inv:') && slotGet(ref) && ITEMS[slotGet(ref).id].armor) { wearFrom(ref); return; }
    slotClick(ref, e.button, e.shiftKey);
    if (e.button === 2 && heldStack && !e.shiftKey) { rightDrag = new Set([ref]); dragFrom = { x: e.clientX, y: e.clientY }; }
    return;
  }
  const fill = e.target.closest('[data-fill]');
  if (fill && e.button === 0) { e.preventDefault(); fillRecipe(RECIPES[+fill.dataset.fill]); return; }
  if (e.target.closest('[data-book]') && e.button === 0) { e.preventDefault(); bookOpen = !bookOpen; sfx.ui(); renderUI(); return; }
  if (e.target.closest('[data-close]')) { e.preventDefault(); closeUI(); return; }
  // clicking the dim backdrop closes it too
  if (e.target === invWrap) closeUI();
});
document.addEventListener('mousemove', e => {
  if (!rightDrag) return;
  if (!heldStack || !ui) { rightDrag = null; return; }
  sweepTo(e.clientX, e.clientY);
});
window.addEventListener('mouseup', e => { if (e.button === 2) rightDrag = null; });
$('#hotbar').addEventListener('click', e => {
  const b = e.target.closest('[data-hotbar]');
  if (b) { selectSlot(+b.dataset.hotbar); if (e.detail) b.blur(); }
});
// item names on hover, in the game's own pixel font and panel instead of the
// browser's tooltip. anything with a data-tip shows it, next to the cursor.
// it's checked on every move (and after the inventory redraws under a still
// mouse) rather than on mouseover/out, because a redraw swaps the element out
// from under the cursor without telling anyone.
const tipEl = $('#tip');
function showTip(x, y) {
  const under = !heldStack && document.elementFromPoint(x, y);
  const el = under && under.closest('[data-tip]');
  // a pile on the ground: its name, and how many if there's more than one
  const pile = under === canvas && started && !ui && groundAt({ x: cam.x + (x * dpr) / S, y: cam.y + (y * dpr) / S });
  if (!el && !pile) { tipEl.hidden = true; return; }
  tipEl.textContent = el ? el.dataset.tip : `${ITEMS[pile.st.id].name}${pile.st.n > 1 ? ` ×${pile.st.n}` : ''}`;
  tipEl.hidden = false;
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = `${Math.min(x + 14, window.innerWidth - w - 6)}px`;
  tipEl.style.top = `${y - h - 10 < 6 ? y + 18 : y - h - 10}px`;
}
document.addEventListener('mousemove', e => showTip(e.clientX, e.clientY));
document.addEventListener('mouseleave', () => { tipEl.hidden = true; });
window.addEventListener('pagehide', () => { if (saveDirty) saveNow(); });

// put back whatever was lying on the ground last time. it waits until every
// script has run, because the race track and the statue room are made in
// js/resume-game-race.js, which loads after this file.
const EXTRA_ROOMS = [];
const roomById = id => [caveRoom, homeRoom, denRoom, ...burrowRooms, ...EXTRA_ROOMS].find(r => r.id === id) || null;
document.addEventListener('DOMContentLoaded', () => savedGround.forEach(g => {
  const st = validStack(g && g.st);
  if (!st || (!(g.age < GROUND_LIFE) && !special(st)) || (g.room && !roomById(g.room))) return;
  const item = { st, x: +g.x, y: +g.y, room: g.room || null, age: +g.age || 0, wait: 0 };
  ground.push(item);
  groundThing(item);
}));

renderHUD();
renderQuest();

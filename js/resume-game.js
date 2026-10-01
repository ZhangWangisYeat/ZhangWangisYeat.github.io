// desperate measures: the résumé as a walkable overworld.
//
// the map is generated at load from a fixed seed (same idea as the real game),
// split into the four biomes from its minimap, and every résumé entry is a
// landmark you can walk up to. all the actual content lives in REGIONS right
// below, so editing the cv means editing that array and nothing else. the
// journal panel is plain html, so the résumé is still readable (and
// screen-reader friendly) even if you never touch the controls.

'use strict';

// `at` is a tile coordinate on the 120 x 84 map. the quadrants are split around
// (60, 42): dunes top-left, tundra top-right, meadows bottom-left, mines
// bottom-right, same layout as the game's minimap. keep landmarks at least ~6
// tiles from the split lines or they'll end up in the wrong biome.

const PROFILE = {
  name: 'Alex Zhang',
  stats: [
    ['Class', 'Software Engineer'],
    ['Guild', 'CSE @ UCLA'],
    ['Region', 'Los Angeles, CA'],
    ['Status', 'Open to work', 'open']
  ]
};

const REGIONS = [
  {
    id: 'camp',
    biome: 'Base Camp',
    label: 'Contact',
    accent: '#ff9a3c',
    blurb: 'Where every run starts. Say hi, or head out into the biomes.',
    blocks: [
      { type: 'profile' },
      {
        type: 'contact',
        heading: 'Credits',
        poi: { id: 'camp', kind: 'fire', at: [60, 41], label: 'Base Camp' },
        items: [
          { key: 'Email', label: 'azhang25@g.ucla.edu', href: 'mailto:azhang25@g.ucla.edu' },
          { key: 'Website', label: 'Portfolio', href: 'https://zhangwangisyeat.github.io' },
          { key: 'GitHub', label: 'ZhangWangisYeat', href: 'https://github.com/ZhangWangisYeat' },
          { key: 'LinkedIn', label: 'Alex Zhang', href: 'https://www.linkedin.com/in/alexzhangwang' },
          { key: 'Based', label: 'Los Angeles, CA' }
        ]
      },
      {
        type: 'chips',
        heading: 'Interests',
        items: ['Basketball', 'Golf', 'Football', 'Violin', 'Video Games', 'Poker', 'Reading', 'Game Development']
      },
      { type: 'guide', heading: 'World guide' },
      {
        type: 'note',
        heading: 'About this world',
        html: 'The terrain, tiles, and character come from <strong>Desperate Measures</strong>, the 2D co-op sandbox i\'m building: explore, build, and fight across multiverses procedurally generated from a single seed. <a href="https://github.com/codeArjya/DesperateMeasures" target="_blank" rel="noopener">See the repo ↗</a>'
      }
    ]
  },
  {
    id: 'meadows',
    biome: 'The Meadows',
    label: 'Education',
    accent: '#5fd068',
    blurb: 'Where the save file starts. Two campuses, one long tutorial.',
    blocks: [
      {
        type: 'entries',
        heading: 'Education',
        items: [
          {
            title: 'University of California, Los Angeles',
            date: 'Sep 2025 – Present',
            sub: 'B.S. Computer Science & Engineering · Henry Samueli College of Engineering · Los Angeles, CA · Expected Jun 2029',
            poi: { id: 'ucla', kind: 'bigtree', at: [21, 54], label: 'UCLA' }
          },
          {
            title: 'Glastonbury High School',
            date: 'Aug 2021 – Jun 2025',
            sub: 'High School Diploma, Summa Cum Laude · Glastonbury, CT · GPA 4.80 / 4.00',
            poi: { id: 'ghs', kind: 'hyena', at: [33, 62], label: 'Glastonbury HS' }
          }
        ]
      },
      {
        type: 'entries',
        heading: 'Activities',
        blurb: 'Teaching the next party how to play.',
        items: [
          {
            title: 'School Team Lead — ACM TeachLA',
            date: 'Jan 2026 – Present',
            sub: 'Association for Computing Machinery at UCLA · Ex-React & Next.js Lead (North Hollywood HS) · Unity Lead (Walt Whitman HS)',
            desc: 'Planned curriculum and ran weekly hands-on workshops where students built dynamic websites in React and Next.js and 2D games in Unity, including their own versions of Flappy Bird, Street Fighter, and Terraria.',
            poi: { id: 'teachla-lead', kind: 'bear', at: [16, 75], label: 'ACM TeachLA' }
          }
        ]
      }
    ]
  },
  {
    id: 'dunes',
    biome: 'The Dunes',
    label: 'Work Experience',
    accent: '#f0c93f',
    blurb: 'Shipping under real constraints, for people who are counting on it.',
    blocks: [
      {
        type: 'entries',
        heading: 'Work Experience',
        items: [
          {
            title: 'Software Developer Intern — MSISI',
            date: 'Jun 2026 – Aug 2026',
            sub: 'Med/Surgical Information Services International, Inc. · Glastonbury, CT',
            desc: "Trained Delphi's Kai agentic AI model to identify and facility-match new records in ACFM instantly. Integrated Delphi MCP to automate the nonlinear data importing process, reducing the import bottleneck by 90%. Engineered the MailSISI and MailSISIBox file-tool workflow to automate hundreds of thousands of data downloads. Worked on automating the UOM standardization process for their Trace Rebate Correction (TRC) software.",
            poi: { id: 'msisi-26', kind: 'deadtree', at: [19, 14], label: 'MSISI · 2026' }
          },
          {
            title: 'Software Engineering Intern — MSISI',
            date: 'Jun 2025 – Aug 2025',
            sub: 'Med/Surgical Information Services International, Inc. · Glastonbury, CT',
            desc: 'Researched and analyzed fuzzy-matching algorithms, testing multiple candidates to compare efficiency and yield. Improved the Address Correction Facility Matching (ACFM) software in Delphi by implementing Damerau-Levenshtein metrics for facility fuzzy matching and database filtering.',
            poi: { id: 'msisi-25', kind: 'deadtree', at: [41, 27], label: 'MSISI · 2025' }
          }
        ]
      }
    ]
  },
  {
    id: 'mines',
    biome: 'The Mines',
    label: 'Projects',
    accent: '#5ee6d0',
    blurb: 'Things built off the critical path, including the game this world comes from.',
    blocks: [
      {
        type: 'entries',
        heading: 'Projects',
        items: [
          {
            title: 'MailSISI',
            date: 'Jun 2026 – Aug 2026',
            desc: 'Desktop tool that instantly downloads and organizes hundreds of thousands of Excel attachments, replacing a manual monthly workflow with automated distributor and manufacturer classification. Whitelisted email monitoring, email threading, and SHA-256 hashing track attachments and their superseded versions.',
            loot: ['Python', 'IMAP', 'SHA-256', 'SQLite', 'Tkinter'],
            poi: { id: 'mailsisi', kind: 'emerald', at: [96, 49], label: 'MailSISI' }
          },
          {
            title: 'MailSISIBox',
            date: 'Jun 2026 – Aug 2026',
            desc: "PowerShell tool that transfers files up to 100 GB between remote desktops. Picks the fastest available TCP connection, verifies every transfer end to end with SHA-256, and lets you copy and paste files through a remote desktop connection's clipboard.",
            loot: ['PowerShell', 'TCP Sockets', 'SHA-256', '.NET', 'Clipboard IPC'],
            poi: { id: 'mailsisibox', kind: 'iron', at: [108, 76], label: 'MailSISIBox' }
          },
          {
            title: 'BruinPop',
            date: 'Mar 2026 – Jun 2026',
            desc: 'Full-stack social platform for pop-ups around UCLA. Built an interactive, location-aware posting interface. Secured with NextAuth JWTs and bcrypt encryption. 100+ campus users.',
            loot: ['React', 'Next.js', 'Tailwind CSS', 'Leaflet', 'NextAuth'],
            poi: { id: 'bruinpop', kind: 'diamond', at: [78, 55], label: 'BruinPop' }
          },
          {
            title: 'Desperate Measures',
            date: 'Jul 2026 – Present',
            flag: 'This world',
            desc: '2D co-op sandbox inspired by Minecraft and Terraria: explore, build, and fight across an infinite multiverse procedurally generated from a single seed. Each seed follows a set plot with its own world generation and progression timing, and you can interact with other multiverses within a single playthrough. Alpha tested by 50+ users; beta releases Sep 2026.',
            loot: ['Unity', 'C#', 'Lua', 'Procedural Gen', 'Physics', '2D Sandbox'],
            poi: { id: 'desperate', kind: 'gold', at: [101, 62], label: 'Desperate Measures' }
          },
          {
            title: 'ACM TeachLA "Static" Website',
            date: 'Sep 2025',
            desc: 'Set up the login-system backend deployed on Netlify. Built blog and events pages with HTML5/CSS3 and implemented static category filtering. Transitioning the static site to be fully dynamic.',
            loot: ['HTML5', 'CSS3', 'Netlify'],
            poi: { id: 'teachla-site', kind: 'ruby', at: [84, 74], label: 'TeachLA Site' }
          }
        ]
      }
    ]
  },
  {
    id: 'tundra',
    biome: 'The Tundra',
    label: 'Skills',
    accent: '#8fc6f0',
    blurb: 'Full loadout: languages, frameworks, and the theory behind them.',
    blocks: [
      {
        type: 'skills',
        heading: 'Loadout',
        groups: [
          {
            title: 'Languages',
            items: ['C++', 'Java', 'Python', 'JavaScript', 'Delphi', 'PHP', 'C#', 'HTML', 'CSS3', 'Lua', 'R', 'PowerShell', 'SQL', 'Batch'],
            poi: { id: 'languages', kind: 'crystal', at: [76, 12], label: 'Languages' }
          },
          {
            title: 'Frameworks & Tools',
            items: ['React', 'Next.js', 'PyTorch', 'TensorFlow', 'RLlib', 'MongoDB', 'MySQL', 'SQLite', 'Git', 'Unity', 'Azure', 'Claude Code', 'Codex', 'Kai', 'Tkinter', 'WinForms / .NET', 'PyInstaller', 'imap-tools', 'PyYAML'],
            poi: { id: 'frameworks', kind: 'crystal', at: [101, 19], label: 'Frameworks & Tools' }
          },
          {
            title: 'Concepts',
            items: ['Data Structures & Algorithms', 'Object-Oriented Programming', 'Software Construction Principles', 'Hardware Principles', 'Digital Design', 'Distributed Systems', 'Data Processing & Analysis', 'Statistics', 'Physics Modeling', 'Advanced Mathematics', 'Assembly', 'TCP Sockets & Network Protocols', 'IMAP & MIME Parsing', 'Fuzzy String Matching', 'SHA-256 Hashing & Integrity', 'Chunked, Resumable Transfer', 'Constant-Memory Streaming', 'Base64 & Data Compression', 'SMB / UNC Redirection', 'Win32 P/Invoke Interop'],
            poi: { id: 'concepts', kind: 'crystal', at: [86, 31], label: 'Concepts' }
          }
        ]
      }
    ]
  }
];

const TILE = 16;
const W = 120;
const H = 84;
const SEED = 20250701;
const CAMP = { x: 60, y: 42, r: 6.5 };
const SPAWN = { x: 60, y: 45 };
const QUADS = ['dunes', 'tundra', 'meadows', 'mines'];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = sel => document.querySelector(sel);

// flatten every landmark out of the content so the world and the journal agree
const POIS = [];
REGIONS.forEach(region => region.blocks.forEach(block => {
  if (block.poi) POIS.push({ ...block.poi, region: region.id });
  (block.items || block.groups || []).forEach(item => {
    if (item.poi) POIS.push({ ...item.poi, region: region.id });
  });
}));
const regionById = Object.fromEntries(REGIONS.map(r => [r.id, r]));

const store = {
  read(key, fallback, area = 'localStorage') {
    try {
      const raw = window[area].getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  write(key, value, area = 'localStorage') {
    try { window[area].setItem(key, JSON.stringify(value)); } catch { /* no-op */ }
  }
};
const found = new Set(store.read('dm-found', []).filter(id => POIS.some(p => p.id === id)));
let soundOn = store.read('dm-sound', false);

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s) {
  return vnoise(x, y, s) * 0.55 + vnoise(x * 2.03, y * 2.03, s + 1) * 0.3 + vnoise(x * 4.1, y * 4.1, s + 2) * 0.15;
}
const smooth = t => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const T = {
  SAND: 0, STONE: 1, PEAK: 2, WATER: 3, SNOW: 4, ICE: 5, ICEROCK: 6,
  GRASS: 7, FLOOR: 8, WALL: 9, GOLD: 10, DIAMOND: 11, RUBY: 12, IRON: 13, EMERALD: 14
};
const SOLID = new Uint8Array(15);
[T.STONE, T.PEAK, T.ICEROCK, T.WALL, T.GOLD, T.DIAMOND, T.RUBY, T.IRON, T.EMERALD].forEach(t => { SOLID[t] = 1; });

// colours are pulled from the game's screenshots, then knocked down a notch so
// four biomes side by side don't vibrate (the real grass is pure #09b509).
const PAL = {
  [T.SAND]:    { base: '#dfbb3d', dots: ['#cfa82f', '#ebcd62', '#c49b28', '#e6c552'], n: 44, style: 'speckle' },
  [T.STONE]:   { base: '#8a8a8a', dots: ['#7a7a7a', '#9a9a9a'], line: '#6e6e6e', style: 'brick' },
  [T.PEAK]:    { base: '#eceff6', dots: ['#dde1ee', '#d2d7e8', '#ffffff'], n: 34, style: 'speckle' },
  [T.WATER]:   { base: '#2380de', dots: ['#1b6ec4', '#3a93ec', '#62acf2'], n: 34, style: 'speckle' },
  [T.SNOW]:    { base: '#eaedf6', dots: ['#dbe0ee', '#e2ddef', '#f7f8fc', '#d3d9ea'], n: 50, style: 'speckle' },
  [T.ICE]:     { base: '#77a0d5', dots: ['#6890c7', '#8db3e1', '#c4daf3'], n: 34, style: 'speckle' },
  [T.ICEROCK]: { base: '#51627a', dots: ['#8ec3eb', '#6ca2d2', '#3c4a5e'], style: 'chunks' },
  [T.GRASS]:   { base: '#22a534', dots: ['#1a8f2a', '#30b943', '#137a22', '#2aae3c'], n: 52, style: 'speckle' },
  [T.FLOOR]:   { base: '#7e7e7e', dots: ['#6a6a6a', '#8e8e8e'], style: 'ticks' },
  [T.WALL]:    { base: '#2a2622', dots: ['#3b352f', '#1e1b18'], style: 'ticks' },
  [T.GOLD]:    { base: '#858585', vein: ['#e6c541', '#9a7616'], style: 'ore' },
  [T.DIAMOND]: { base: '#858585', vein: ['#86f2e2', '#2b9c90'], style: 'ore' },
  [T.RUBY]:    { base: '#858585', vein: ['#e0473a', '#7d1a14'], style: 'ore' },
  [T.IRON]:    { base: '#858585', vein: ['#e2ddd6', '#8f8a84'], style: 'ore' },
  [T.EMERALD]: { base: '#858585', vein: ['#5fe08a', '#1f7a43'], style: 'ore' }
};
const MINI = { [T.GOLD]: '#e6c541', [T.DIAMOND]: '#86f2e2', [T.RUBY]: '#e0473a', [T.IRON]: '#cfcac3', [T.EMERALD]: '#5fe08a' };

const BIOMES = {
  dunes:   { base: T.SAND,  rock: T.STONE,   cap: T.PEAK,    wet: T.WATER, rockAt: 0.6,  capAt: 0.69, wetAt: 0.67, scale: 8 },
  tundra:  { base: T.SNOW,  rock: T.ICEROCK, cap: T.ICEROCK, wet: T.ICE,   rockAt: 0.6,  capAt: 9,    wetAt: 0.62, scale: 7 },
  meadows: { base: T.GRASS, rock: T.STONE,   cap: T.PEAK,    wet: T.WATER, rockAt: 0.61, capAt: 0.7,  wetAt: 0.65, scale: 8 },
  mines:   { base: T.FLOOR, rock: T.WALL,    cap: T.WALL,    wet: T.WATER, rockAt: 0.53, capAt: 9,    wetAt: 0.74, scale: 7 }
};

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// each tile type gets four 16px variants so the repeat isn't obvious
function makeTileTexture(type, variant) {
  const c = mk(TILE, TILE);
  const g = c.getContext('2d');
  const r = mulberry32(SEED + type * 131 + variant * 17);
  const P = PAL[type];
  const pick = arr => arr[(r() * arr.length) | 0];
  const dot = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  g.fillStyle = P.base;
  g.fillRect(0, 0, TILE, TILE);

  if (P.style === 'speckle') {
    for (let i = 0; i < P.n; i++) dot((r() * 16) | 0, (r() * 16) | 0, pick(P.dots), r() < 0.3 ? 2 : 1, 1);
  } else if (P.style === 'brick') {
    // chunky cobbles like the game's stone: 4px courses, staggered joints
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      dot(0, y + 3, P.line, 16, 1);
      const off = (row % 2 ? 3 : 10) + ((r() * 3) | 0);
      dot(off % 16, y, P.line, 1, 3);
      dot((off + 7) % 16, y, P.line, 1, 3);
    }
    for (let i = 0; i < 20; i++) dot((r() * 16) | 0, (r() * 16) | 0, pick(P.dots));
  } else if (P.style === 'chunks') {
    for (let i = 0; i < 8; i++) dot((r() * 14) | 0, (r() * 14) | 0, i % 3 ? P.dots[0] : P.dots[1], 2 + ((r() * 3) | 0), 2 + ((r() * 2) | 0));
    for (let i = 0; i < 12; i++) dot((r() * 16) | 0, (r() * 16) | 0, P.dots[2]);
  } else if (P.style === 'ticks' || P.style === 'ore') {
    const ticks = P.style === 'ore' ? ['#747474', '#959595'] : P.dots;
    for (let i = 0; i < 16; i++) {
      const x = (r() * 15) | 0, y = (r() * 15) | 0, col = pick(ticks);
      dot(x, y, col); dot(x + 1, y + 1, col);
      if (r() < 0.5) dot(x + 2, y + 1, col);
    }
    if (P.style === 'ore') {
      // three little veins, each a lit pixel run with a shadow under it
      for (let i = 0; i < 3; i++) {
        const x = 2 + ((r() * 10) | 0), y = 2 + ((r() * 10) | 0);
        dot(x, y + 1, P.vein[1], 3, 1); dot(x + 1, y + 2, P.vein[1], 2, 1);
        dot(x, y, P.vein[0], 2, 1); dot(x + 1, y + 1, P.vein[0], 2, 1);
      }
    }
  }
  return c;
}
const TEX = Object.keys(PAL).map(t => [0, 1, 2, 3].map(v => makeTileTexture(Number(t), v)));

// a 2x2 patch of a tile as a data url, for the css swatches in the ui
function swatch(type) {
  const c = mk(32, 32);
  const g = c.getContext('2d');
  [[0, 0], [16, 0], [0, 16], [16, 16]].forEach(([x, y], i) => g.drawImage(TEX[type][i], x, y));
  return c.toDataURL();
}
const SWATCH = {
  camp: swatch(T.GRASS), meadows: swatch(T.GRASS), dunes: swatch(T.SAND),
  tundra: swatch(T.SNOW), mines: swatch(T.FLOOR)
};
// camp gets a warmer swatch: sand + grass, like where the biomes meet
SWATCH.camp = (() => {
  const c = mk(32, 32);
  const g = c.getContext('2d');
  g.drawImage(TEX[T.SAND][0], 0, 0); g.drawImage(TEX[T.SNOW][1], 16, 0);
  g.drawImage(TEX[T.GRASS][2], 0, 16); g.drawImage(TEX[T.FLOOR][3], 16, 16);
  return c.toDataURL();
})();

function pixelGrid(w, h) {
  const px = new Array(w * h).fill(null);
  const G = {
    w, h,
    set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = c; },
    get(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? px[y * w + x] : null; },
    outline(colourFor) {
      const add = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (G.get(x, y)) continue;
        const n = G.get(x - 1, y) || G.get(x + 1, y) || G.get(x, y - 1) || G.get(x, y + 1);
        if (n) add.push([x, y, colourFor(n)]);
      }
      add.forEach(([x, y, c]) => G.set(x, y, c));
      return G;
    },
    canvas() {
      const c = mk(w, h);
      const g = c.getContext('2d');
      for (let i = 0; i < px.length; i++) if (px[i]) { g.fillStyle = px[i]; g.fillRect(i % w, (i / w) | 0, 1, 1); }
      return c;
    }
  };
  return G;
}

const BARK = ['#c4733f', '#8b4726'];
function makeTree(seed, big) {
  const r = mulberry32(seed);
  const w = big ? 38 : 28, h = big ? 46 : 34;
  const G = pixelGrid(w, h);
  const cx = Math.floor(w / 2), ground = h - 2;
  const R = big ? 13.5 : 9.5, cy = R + 2;
  for (let y = Math.floor(cy + R * 0.3); y <= ground; y++) {
    const flare = y >= ground - 1 ? 1 : 0;
    for (let x = -2 - flare; x <= 1 + flare; x++) G.set(cx + x, y, x < 0 ? BARK[0] : BARK[1]);
  }
  // canopy is a union of blobs, each lit from the top-left on its own, which
  // gives the clumpy highlights the game's trees have instead of one flat ball
  const blobs = [[cx, cy, R]];
  const k = big ? 7 : 5;
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2 + r() * 0.7;
    blobs.push([cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.46, R * (0.42 + r() * 0.2)]);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = -9;
    for (const [bx, by, br] of blobs) {
      const dx = (x - bx) / br, dy = (y - by) / br, d = dx * dx + dy * dy;
      if (d <= 1) best = Math.max(best, -(dx * 0.55 + dy * 0.85) * (1 - d * 0.25));
    }
    if (best === -9) continue;
    const v = best + (hash2(x, y, seed) - 0.5) * 0.5;
    G.set(x, y, v > 0.6 ? '#c6e257' : v > 0.2 ? '#62b240' : v > -0.3 ? '#2d7d37' : '#1d562f');
  }
  return G.outline(n => (BARK.includes(n) ? '#4a2412' : '#113a20')).canvas();
}

function makePine(seed) {
  const w = 22, h = 34, cx = 10.5, ground = h - 2;
  const G = pixelGrid(w, h);
  for (let y = ground - 4; y <= ground; y++) for (let x = -1; x <= 1; x++) G.set(cx + x, y, x < 0 ? '#9b5a32' : '#6e3b1f');
  // bottom tier first so each upper tier drapes over the one below it
  const tiers = [{ top: 14, bot: 28, hw: 10 }, { top: 7, bot: 20, hw: 7.5 }, { top: 1, bot: 12, hw: 5 }];
  for (const t of tiers) {
    for (let y = t.top; y <= t.bot; y++) {
      const half = 0.8 + ((y - t.top) / (t.bot - t.top)) * t.hw;
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        if (Math.abs(dx) > half) continue;
        const snowLine = t.top + 2.2 + Math.abs(dx) * 0.35;
        let col = dx < 0 ? '#2f6d51' : '#1e4b3a';
        if (y < snowLine || (y === t.bot && hash2(x, y, seed) < 0.5)) col = dx < 1 ? '#f1f5fc' : '#cfdaeb';
        else if (hash2(x, y, seed + 1) < 0.07) col = '#dbe6f5';
        G.set(x, y, col);
      }
    }
  }
  return G.outline(n => (n === '#9b5a32' || n === '#6e3b1f' ? '#3b1f10' : '#0f2a22')).canvas();
}

function makeDeadTree(seed, big) {
  const r = mulberry32(seed);
  const w = big ? 34 : 24, h = big ? 38 : 28;
  const G = pixelGrid(w, h);
  const branch = (x, y, ang, len, wid, depth) => {
    for (let s = 0; s < len; s++) {
      x += Math.cos(ang); y += Math.sin(ang);
      for (let i = 0; i < wid; i++) G.set(x + i - Math.floor(wid / 2), y, i === 0 && wid > 1 ? '#c77d55' : '#9a4d31');
    }
    if (depth <= 0) return;
    const spread = 0.42 + r() * 0.3;
    branch(x, y, ang - spread, len * (0.58 + r() * 0.14), Math.max(1, wid - 1), depth - 1);
    branch(x, y, ang + spread * (0.8 + r() * 0.4), len * (0.55 + r() * 0.14), Math.max(1, wid - 1), depth - 1);
    if (depth > 2 && r() < 0.4) branch(x, y, ang + (r() - 0.5) * 0.3, len * 0.45, 1, depth - 2);
  };
  branch(w / 2, h - 1, -Math.PI / 2 + (r() - 0.5) * 0.1, big ? 13 : 9, 3, big ? 4 : 3);
  // root flare so it sits in the sand instead of balancing on a point
  G.set(w / 2 - 3, h - 2, '#9a4d31'); G.set(w / 2 + 2, h - 2, '#9a4d31');
  return G.outline(() => '#4a2016').canvas();
}

const CRYSTAL_PAL = {
  crystal: { out: '#1c3350', dark: '#3f6ea3', mid: '#69a5dc', light: '#a8d7f4', hi: '#effaff' },
  gold:    { out: '#4a3408', dark: '#9a7412', mid: '#d9b73a', light: '#f3dc6b', hi: '#fff6c2' },
  diamond: { out: '#0e3d38', dark: '#1d8b82', mid: '#4ed6c6', light: '#9df4e8', hi: '#f0fffc' },
  ruby:    { out: '#3c0c0c', dark: '#7c1c1c', mid: '#c4392b', light: '#ef6a5a', hi: '#ffd0c8' },
  emerald: { out: '#0c3a1e', dark: '#1d7a40', mid: '#3fc46c', light: '#8eeaa9', hi: '#eafff0' },
  iron:    { out: '#2e2e2e', dark: '#77726c', mid: '#b3ada6', light: '#dcd7d0', hi: '#ffffff' }
};
function makeCrystal(kind) {
  const P = CRYSTAL_PAL[kind];
  const rocky = kind !== 'crystal';
  const w = 26, h = 32, base = h - (rocky ? 5 : 3);
  const G = pixelGrid(w, h);
  const shards = [
    { cx: 13, hw: 3, h: 24 }, { cx: 8, hw: 2, h: 15 }, { cx: 18, hw: 2.4, h: 18 },
    { cx: 4.5, hw: 1.5, h: 8 }, { cx: 21.5, hw: 1.5, h: 10 }
  ];
  for (const s of shards) {
    for (let x = Math.floor(s.cx - s.hw); x <= Math.ceil(s.cx + s.hw); x++) {
      const dx = x - s.cx;
      if (Math.abs(dx) > s.hw + 0.01) continue;
      const tip = base - s.h + Math.abs(dx) * 1.5;
      for (let y = Math.ceil(tip); y <= base; y++) {
        let col = dx < -0.6 ? P.light : dx > 0.6 ? P.mid : P.hi;
        if (dx >= s.hw - 0.5 || y > base - 2) col = P.dark;
        G.set(x, y, col);
      }
    }
  }
  if (rocky) {
    // chunk of cave rock the ore is growing out of
    for (let y = base - 1; y < h - 1; y++) for (let x = 3; x < w - 3; x++) {
      const dx = (x - w / 2) / 10, dy = (y - (base + 1)) / 3.2;
      if (dx * dx + dy * dy > 1) continue;
      G.set(x, y, dy < -0.2 ? '#a3a3a3' : hash2(x, y, 9) < 0.3 ? '#6a6a6a' : '#7d7d7d');
    }
  }
  return G.outline(n => (n.startsWith('#a3') || n.startsWith('#7d') || n.startsWith('#6a') ? '#343434' : P.out)).canvas();
}

function makeTent() {
  const w = 34, h = 28, cx = 16.5, top = 3, base = 25;
  const G = pixelGrid(w, h);
  for (let y = top; y <= base; y++) {
    const t = (y - top) / (base - top), half = 1 + t * 14;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      if (Math.abs(dx) > half) continue;
      let col = dx < 0 ? '#e0823f' : '#b3572a';
      if ((y - top) % 6 === 5) col = dx < 0 ? '#ec9a5c' : '#c4683a';
      const doorTop = base - 11;
      if (y > doorTop && Math.abs(dx) <= (y - doorTop) * 0.5) col = y > doorTop + 3 ? '#2a150d' : '#4a2616';
      G.set(x, y, col);
    }
  }
  G.set(cx - 0.5, top - 1, '#6b3a1e'); G.set(cx - 0.5, top - 2, '#6b3a1e');
  return G.outline(() => '#3a1a0c').canvas();
}

// the grizzly's den: a mossy dome of rock with a dark mouth at the bottom
function makeDen() {
  const w = 46, h = 32, cx = 23, ground = h - 2;
  const G = pixelGrid(w, h);
  for (let y = 0; y <= ground; y++) for (let x = 0; x < w; x++) {
    const dx = (x - cx) / 21, dy = (y - ground) / 27;
    if (dx * dx + dy * dy > 1) continue;
    const lit = -(dx * 0.6 + dy * 0.8) + (hash2(x, y, 41) - 0.5) * 0.5;
    let col = lit > 0.55 ? '#a6a6a6' : lit > 0.15 ? '#8a8a8a' : lit > -0.25 ? '#727272' : '#5a5a5a';
    if (hash2(x >> 2, y >> 1, 42) < 0.12) col = '#666666';
    if (y < 7 + hash2(x, 0, 43) * 4 && hash2(x, y, 44) < 0.65) col = hash2(x, y, 45) < 0.5 ? '#3f8f3a' : '#2f7330';
    const mx = (x - cx) / 8.5, my = (y - ground) / 13;
    if (mx * mx + my * my <= 1) col = mx * mx + my * my > 0.7 ? '#2e241d' : '#140f0c';
    G.set(x, y, col);
  }
  return G.outline(() => '#262626').canvas();
}

function makeFireFrames(count, small) {
  const frames = [];
  for (let f = 0; f < count; f++) {
    const r = mulberry32(700 + f * 37 + (small ? 99 : 0));
    const w = small ? 10 : 20, h = small ? 20 : 24;
    const G = pixelGrid(w, h);
    const cx = w / 2 - 0.5;
    if (small) {
      // wall torch: stick + a small flame
      for (let y = 9; y < h; y++) { G.set(cx, y, '#8a4f2a'); G.set(cx + 1, y, '#5e331b'); }
      G.set(cx - 1, 9, '#6b6b6b'); G.set(cx + 2, 9, '#6b6b6b');
    } else {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const sx = cx + Math.cos(a) * 8, sy = h - 4 + Math.sin(a) * 2.3;
        G.set(sx, sy, '#8f8f8f'); G.set(sx + 1, sy, '#8f8f8f'); G.set(sx, sy + 1, '#5c5c5c'); G.set(sx + 1, sy + 1, '#5c5c5c');
      }
      for (let i = 0; i < 10; i++) {
        G.set(cx - 5 + i, h - 5 - i * 0.3, '#6d3b1f'); G.set(cx - 5 + i, h - 4 - i * 0.3, '#4b2813');
        G.set(cx - 5 + i, h - 8 + i * 0.3, '#7c4524'); G.set(cx - 5 + i, h - 7 + i * 0.3, '#4b2813');
      }
    }
    const fBase = small ? 9 : h - 6, fTop = small ? 1 : 3, fHalf = small ? 2.4 : 5;
    for (let y = fTop; y <= fBase; y++) {
      const up = (fBase - y) / (fBase - fTop);
      const half = fHalf * Math.pow(1 - up, 0.7) + (r() - 0.5) * 1.3;
      for (let x = 0; x < w; x++) {
        const dx = Math.abs(x - cx);
        if (dx > half) continue;
        const heat = 1 - (dx / (half + 0.01)) * 0.6 - up * 0.55 + (r() - 0.5) * 0.3;
        G.set(x, y, heat > 0.72 ? '#fff4b4' : heat > 0.48 ? '#ffc93c' : heat > 0.26 ? '#ff7b1c' : '#d23a16');
      }
    }
    frames.push(G.canvas());
  }
  return frames;
}

const FIRE = makeFireFrames(4, false);
const TORCH = makeFireFrames(3, true);
const SPRITE = {
  bigtree: [makeTree(11, true)],
  tree: [makeTree(23, false)],
  deadtree: [makeDeadTree(5, true)],
  crystal: [makeCrystal('crystal')],
  gold: [makeCrystal('gold')],
  diamond: [makeCrystal('diamond')],
  ruby: [makeCrystal('ruby')],
  emerald: [makeCrystal('emerald')],
  iron: [makeCrystal('iron')],
  fire: FIRE,
  tent: [makeTent()],
  den: [makeDen()]
};
const DECOR = {
  tree: [makeTree(41, false), makeTree(57, false), makeTree(73, false)],
  pine: [makePine(3), makePine(8), makePine(13)],
  deadtree: [makeDeadTree(17, false), makeDeadTree(29, false)]
};
const GLOW = {
  fire: '255,140,50', gold: '255,210,80', diamond: '95,240,224', ruby: '255,90,74', emerald: '90,230,130', iron: '230,226,220', crystal: '160,214,255', torch: '255,150,60'
};

// the four biomes meet at a wobbly cross instead of a ruler-straight one
const splitX = y => W / 2 + (vnoise(y / 7, 3.3, SEED + 11) - 0.5) * 8;
const splitY = x => H / 2 + (vnoise(x / 7, 7.7, SEED + 12) - 0.5) * 8;
function quadAt(x, y) {
  const left = x < splitX(y), top = y < splitY(x);
  return top ? (left ? 0 : 1) : (left ? 2 : 3);
}
function regionAt(x, y) {
  if (Math.hypot(x - CAMP.x, (y - CAMP.y) * 1.15) < CAMP.r) return 'camp';
  return QUADS[quadAt(x, y)];
}

const tiles = new Uint8Array(W * H);
const quad = new Uint8Array(W * H);
const reach = new Uint8Array(W * H);
const idx = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const solidTile = (x, y) => !inside(x, y) || SOLID[tiles[idx(x, y)]] === 1;
const baseOf = i => BIOMES[QUADS[quad[i]]].base;

function generate() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = quadAt(x + 0.5, y + 0.5);
    const B = BIOMES[QUADS[q]];
    const n1 = fbm(x / B.scale, y / B.scale, SEED + q * 31);
    const n2 = fbm(x / 11, y / 11, SEED + q * 31 + 17);
    let t = B.base;
    if (n2 > B.wetAt) t = B.wet;
    else if (n1 > B.rockAt) t = n1 > B.capAt ? B.cap : B.rock;
    tiles[idx(x, y)] = t;
    quad[idx(x, y)] = q;
  }

  const clear = (cx, cy, rad, wetToo) => {
    for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
      for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
        if (!inside(x, y) || Math.hypot(x - cx, y - cy) > rad) continue;
        const i = idx(x, y);
        if (wetToo || SOLID[tiles[i]]) tiles[i] = baseOf(i);
      }
    }
  };

  // carve a wandering trail from camp to every landmark so nothing is walled
  // off. only solid tiles get carved, which is why lakes survive the trail.
  POIS.forEach((p, n) => {
    const [px, py] = p.at;
    const steps = Math.ceil(Math.hypot(px - CAMP.x, py - CAMP.y) * 1.6);
    const nx = -(py - CAMP.y), ny = px - CAMP.x, nl = Math.hypot(nx, ny) || 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const wob = Math.sin(t * Math.PI) * (vnoise(t * 4, n, SEED + 5) - 0.5) * 14;
      clear(CAMP.x + (px - CAMP.x) * t + (nx / nl) * wob, CAMP.y + (py - CAMP.y) * t + (ny / nl) * wob, 1.3, false);
    }
  });
  clear(CAMP.x, CAMP.y, CAMP.r + 0.5, true);
  POIS.forEach(p => clear(p.at[0], p.at[1] + 1, 3.2, true));

  // flood fill from spawn, then fill anything unreachable with rock so the
  // map never shows you a meadow you can't actually get to
  const q = [idx(SPAWN.x, SPAWN.y)];
  reach[q[0]] = 1;
  while (q.length) {
    const i = q.pop(), x = i % W, y = (i / W) | 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      if (solidTile(nx, ny)) return;
      const n = idx(nx, ny);
      if (!reach[n]) { reach[n] = 1; q.push(n); }
    });
  }
  for (let i = 0; i < W * H; i++) {
    if (!reach[i] && !SOLID[tiles[i]]) tiles[i] = BIOMES[QUADS[quad[i]]].rock;
  }

  // ore veins: sprinkled along exposed cave walls, and clustered around each
  // project so the landmark looks like it's being mined out of the rock
  const r = mulberry32(SEED + 404);
  const ORE_WEIGHTS = [[T.IRON, 50], [T.GOLD, 22], [T.RUBY, 16], [T.DIAMOND, 10], [T.EMERALD, 6]];
  const pickOre = () => {
    let roll = r() * 100;
    for (const [t, w] of ORE_WEIGHTS) { roll -= w; if (roll < 0) return t; }
    return T.IRON;
  };
  const CLUSTER = { iron: 0.5, gold: 0.22, ruby: 0.18, diamond: 0.04, emerald: 0.03 };
  const exposed = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(x + dx, y + dy) && !solidTile(x + dx, y + dy));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (tiles[i] !== T.WALL || !exposed(x, y)) continue;
    const nearPoi = POIS.find(p => p.region === 'mines' && Math.hypot(p.at[0] - x, p.at[1] - y) < 6.5);
    if (nearPoi && r() < CLUSTER[nearPoi.kind]) tiles[i] = { gold: T.GOLD, diamond: T.DIAMOND, ruby: T.RUBY, emerald: T.EMERALD, iron: T.IRON }[nearPoi.kind];
    else if (r() < 0.1) tiles[i] = pickOre();
  }
}

const CREATURE_POIS = new Set(['hyena', 'bear']);
const things = [];   // everything y-sorted with the player
const glows = [];

function placeDecor() {
  const r = mulberry32(SEED + 77);
  const farFromLandmarks = (x, y, d) =>
    POIS.every(p => Math.hypot(p.at[0] - x, p.at[1] - y) > d) && Math.hypot(CAMP.x - x, CAMP.y - y) > CAMP.r + 3;
  const openArea = (x, y, type) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!inside(x + dx, y + dy) || tiles[idx(x + dx, y + dy)] !== type) return false;
    }
    return true;
  };
  const scatter = (region, tileType, pool, count, kind) => {
    let placed = 0, tries = 0;
    while (placed < count && tries++ < 4000) {
      const x = 2 + ((r() * (W - 4)) | 0), y = 2 + ((r() * (H - 4)) | 0);
      if (QUADS[quad[idx(x, y)]] !== region || !openArea(x, y, tileType) || !farFromLandmarks(x, y, 5)) continue;
      if (things.some(t => t.decor && Math.hypot(t.tx - x, t.ty - y) < 3.5)) continue;
      things.push({ decor: true, tree: kind, id: `${region}-${placed}`, tx: x, ty: y, x: x * TILE + 8, y: y * TILE + 14, frames: [pool[(r() * pool.length) | 0]] });
      placed++;
    }
  };
  scatter('meadows', T.GRASS, DECOR.tree, 22, 'tree');
  scatter('tundra', T.SNOW, DECOR.pine, 20, 'pine');
  scatter('dunes', T.SAND, DECOR.deadtree, 7, 'deadtree');

  // wall torches in the mines: floor tiles with rock directly above them
  let torches = 0, tries = 0;
  while (torches < 16 && tries++ < 6000) {
    const x = 1 + ((r() * (W - 2)) | 0), y = 1 + ((r() * (H - 2)) | 0);
    if (QUADS[quad[idx(x, y)]] !== 'mines' || tiles[idx(x, y)] !== T.FLOOR || tiles[idx(x, y - 1)] !== T.WALL) continue;
    if (things.some(t => t.torch && Math.hypot(t.tx - x, t.ty - y) < 7)) continue;
    const thing = { decor: true, torch: true, tx: x, ty: y, x: x * TILE + 8, y: y * TILE + 6, frames: TORCH, fps: 7, phase: r() * 3 };
    things.push(thing);
    glows.push({ x: thing.x, y: thing.y - 12, rgb: GLOW.torch, rad: 2.6, flicker: true, mine: true });
    torches++;
  }

  // camp: tent behind the fire
  things.push({ decor: true, x: (CAMP.x - 3) * TILE, y: (CAMP.y - 1) * TILE + 6, frames: SPRITE.tent });

  POIS.forEach(p => {
    // creature landmarks get a stand-in here; the play layer swaps in the
    // actual animal so the label and the "near" check follow it around
    if (CREATURE_POIS.has(p.kind)) {
      p.thing = { poi: p, x: p.at[0] * TILE + 8, y: p.at[1] * TILE + 14, gone: true, frames: [mk(1, 1)] };
      return;
    }
    const t = {
      poi: p, tx: p.at[0], ty: p.at[1],
      x: p.at[0] * TILE + 8, y: p.at[1] * TILE + 14,
      frames: SPRITE[p.kind], fps: p.kind === 'fire' ? 8 : 0
    };
    p.thing = t;
    things.push(t);
    glows.push({
      x: t.x, y: t.y - t.frames[0].height * 0.45, rgb: GLOW[p.kind] || GLOW.crystal,
      rad: p.kind === 'fire' ? 4.2 : 2.4, flicker: p.kind === 'fire', mine: p.region === 'mines', always: p.kind === 'fire'
    });
  });
}

let worldCanvas, miniCanvas;
// one tile plus its depth shading. cheap depth: solid blocks get a darker cliff
// face on their bottom edge and cast a short shadow on the tile below, water
// gets a foam line up top. the shading only looks at the tiles directly above
// and below, which is why repainting a 3x3 block is enough after mining.
function paintTile(g, x, y) {
  const t = tiles[idx(x, y)], px = x * TILE, py = y * TILE;
  g.drawImage(TEX[t][(hash2(x, y, SEED) * 4) | 0], px, py);
  const below = y + 1 < H ? tiles[idx(x, y + 1)] : t;
  const above = y > 0 ? tiles[idx(x, y - 1)] : t;
  if (SOLID[t]) {
    if (!SOLID[below]) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(px, py + 13, TILE, 3); }
    if (!SOLID[above]) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px, py, TILE, 1); }
  } else {
    if (SOLID[above]) { g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(px, py, TILE, 3); }
    if ((t === T.WATER || t === T.ICE) && above !== t && !SOLID[above]) {
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(px, py, TILE, 1);
    }
  }
}
function repaintAround(x, y) {
  const g = worldCanvas.getContext('2d');
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (inside(x + dx, y + dy)) paintTile(g, x + dx, y + dy);
  }
}

function paintWorld() {
  worldCanvas = mk(W * TILE, H * TILE);
  const g = worldCanvas.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintTile(g, x, y);

  miniCanvas = $('#minimap');
  miniCanvas.width = W;
  miniCanvas.height = H;
  paintMinimap();
}

function paintMinimap() {
  const g = miniCanvas.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tiles[idx(x, y)];
    g.fillStyle = MINI[t] || PAL[t].base;
    g.fillRect(x, y, 1, 1);
  }
  // only landmarks you've found go on the map. undiscovered ones stay off it
  // entirely, so the minimap can't be used as a treasure map
  POIS.filter(canTravel).forEach(p => {
    const [x, y] = p.at;
    g.fillStyle = '#000';
    g.fillRect(x - 2, y - 2, 5, 5);
    g.fillStyle = regionById[p.region].accent;
    g.fillRect(x - 1, y - 1, 3, 3);
  });
}

const sheet = new Image();
sheet.src = 'img/player.png';
// the in-game copy with the dagger erased from the swing frames, so the play
// layer can draw whatever you're actually holding. the title screen keeps the
// original, dagger and all.
const sheetPlay = new Image();
sheetPlay.src = 'img/player-swing.png';
// armor layers to paint over the torso: seven sheets stacked top to bottom
// (hide, wool, gold, marble, iron, emerald, diamond), each 10 rows of 48px
// cells lined up with player-swing.png. only the chest pixels are filled in.
const armorSheet = new Image();
armorSheet.src = 'img/player-armor.png';

// rows on the sheet: idle, walk, swing, each facing down / side (right) / up
const ROWS = { idle: { down: 0, side: 1, up: 2 }, walk: { down: 3, side: 4, up: 5 }, swing: { down: 6, side: 7, up: 8 } };
const CELL = 48;
const SPEED = 92;       // world px per second, about 5.75 tiles

const player = {
  x: SPAWN.x * TILE + 8, y: SPAWN.y * TILE + 12,
  face: 'down', flip: false, moving: false,
  anim: 0, swing: -1, path: null, dustT: 0,
  heading: Math.PI / 2      // last walking direction in radians, starts facing down
};

function blocked(x, y) {
  const hit = (px, py) => solidTile(Math.floor(px / TILE), Math.floor(py / TILE));
  return hit(x - 4, y - 3) || hit(x + 3, y - 3) || hit(x - 4, y) || hit(x + 3, y);
}

// bfs on the tile grid (8-way, no corner cutting). if the target can't be
// reached, it walks you to the closest tile it could reach instead.
function findPath(tx, ty) {
  const sx = Math.floor(player.x / TILE), sy = Math.floor(player.y / TILE);
  const prev = new Int32Array(W * H).fill(-1);
  const queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  const start = idx(sx, sy);
  prev[start] = start;
  queue[tail++] = start;
  let best = start, bestD = Infinity;
  while (head < tail) {
    const i = queue[head++], x = i % W, y = (i / W) | 0;
    const d = (x - tx) ** 2 + (y - ty) ** 2;
    if (d < bestD) { best = i; bestD = d; if (d === 0) break; }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (solidTile(nx, ny)) continue;
      if (dx && dy && (solidTile(x + dx, y) || solidTile(x, y + dy))) continue;
      const n = idx(nx, ny);
      if (prev[n] !== -1) continue;
      prev[n] = i;
      queue[tail++] = n;
    }
  }
  const path = [];
  for (let i = best; i !== start; i = prev[i]) path.push({ x: (i % W) * TILE + 8, y: ((i / W) | 0) * TILE + 12 });
  return path.reverse();
}

const keys = new Set();
const MOVE_KEYS = {
  ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
  ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0]
};

let audio;
function getAudio() {
  audio = audio || new (window.AudioContext || window['webkitAudioContext'])();
  return audio;
}
function tone(freq, duration = 0.06, type = 'square', peak = 0.035, delay = 0) {
  if (!soundOn) return;
  try {
    getAudio();
    const t0 = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(peak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  } catch { /* no audio, silence is fine */ }
}
function whoosh() {
  if (!soundOn) return;
  try {
    getAudio();
    const len = audio.sampleRate * 0.14;
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, audio.currentTime);
    filter.frequency.exponentialRampToValueAtTime(3200, audio.currentTime + 0.12);
    gain.gain.value = 0.09;
    src.buffer = buf;
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start();
  } catch { /* no audio */ }
}
const sfx = {
  ui:     () => tone(620, 0.05),
  region: () => { tone(523, 0.08, 'triangle', 0.05); tone(784, 0.14, 'triangle', 0.05, 0.08); },
  found:  () => { tone(660, 0.07); tone(880, 0.07, 'square', 0.035, 0.07); tone(1320, 0.12, 'square', 0.035, 0.14); },
  deny:   () => tone(170, 0.14, 'square', 0.03),
  warp:   () => { tone(900, 0.1, 'sawtooth', 0.02); tone(450, 0.14, 'sawtooth', 0.02, 0.08); },
  swing:  whoosh
};

const soundBtn = $('#sound-toggle');
function paintSound() {
  soundBtn.textContent = `Sound: ${soundOn ? 'on' : 'off'}`;
  soundBtn.setAttribute('aria-pressed', String(soundOn));
}
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  store.write('dm-sound', soundOn);
  paintSound();
  sfx.ui();
});
paintSound();

const journal = $('#journal');
const journalBody = $('#journal-body');
const regionNav = $('#regions');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderTabs() {
  regionNav.innerHTML = REGIONS.map((r, i) => `
    <button type="button" class="region-tab" data-view="${r.id}" style="--accent:${r.accent}" aria-label="${esc(r.biome)}: ${esc(r.label)}">
      <span class="rt-swatch" style="background-image:url(${SWATCH[r.id]})"></span>
      <span class="rt-key" aria-hidden="true">${i + 1}</span>
      <span class="rt-name">${esc(r.biome.replace(/^The /, ''))}<span class="rt-sec">${esc(r.label)}</span></span>
    </button>`).join('');
}

function foundCount() { return `${found.size} / ${POIS.length}`; }

// the journal only shows what you've actually found. until then a landmark's
// card is a locked "? ? ?" placeholder with blacked-out bars roughly the shape
// of the real text, plus the walk-here button, since walking there is how you
// unlock it. camp is known from the start so contact info is never hidden.
const known = poi => !poi || poi.id === 'camp' || found.has(poi.id);
const poiById = Object.fromEntries(POIS.map(p => [p.id, p]));

function lockedCard(poi, skill) {
  const where = regionById[poiById[poi.id].region].biome;
  const bars = [0, 1, 2].map(i => `<i style="width:${Math.round(55 + hash2(i, poi.id.length, poi.id.charCodeAt(0)) * 40)}%"></i>`).join('');
  return `
      <article class="entry is-locked px${skill ? ' skill-group' : ''}" data-poi="${poi.id}">
        <div class="entry-head">
          <h4 class="entry-title">? ? ?</h4>
          <span class="entry-date">???</span>
        </div>
        <p class="entry-sub">Undiscovered. Somewhere in ${esc(where)}.</p>
        <div class="redacted" aria-hidden="true">${bars}</div>
        <div class="entry-foot"><span></span>${gotoHTML(poi)}</div>
      </article>`;
}

function entryCard(it) {
  if (!known(it.poi)) return lockedCard(it.poi, false);
  return `
      <article class="entry px${it.poi ? ' is-found' : ''}" ${it.poi ? `data-poi="${it.poi.id}"` : ''}>
        <div class="entry-head">
          <h4 class="entry-title">${esc(it.title)}${it.flag ? `<span class="entry-flag">${esc(it.flag)}</span>` : ''}</h4>
          <span class="entry-date">${esc(it.date)}</span>
        </div>
        ${it.sub ? `<p class="entry-sub">${esc(it.sub)}</p>` : ''}
        ${it.desc ? `<p class="entry-desc">${esc(it.desc)}</p>` : ''}
        <div class="entry-foot">
          <ul class="loot">${(it.loot || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>
          ${gotoHTML(it.poi)}
        </div>
      </article>`;
}

function skillCard(gr) {
  if (!known(gr.poi)) return lockedCard(gr.poi, true);
  return `
      <article class="entry skill-group px is-found" data-poi="${gr.poi.id}">
        <div class="entry-head">
          <h4 class="entry-title">${esc(gr.title)}</h4>
          <span class="entry-date">${gr.items.length} items</span>
        </div>
        <ul class="loot">${gr.items.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="entry-foot"><span></span>${gotoHTML(gr.poi)}</div>
      </article>`;
}

// looks up the content item behind a landmark so its card can be re-rendered
function cardFor(id) {
  for (const r of REGIONS) for (const b of r.blocks) {
    const it = (b.items || []).find(i => i.poi && i.poi.id === id);
    if (it) return entryCard(it);
    const gr = (b.groups || []).find(g => g.poi.id === id);
    if (gr) return skillCard(gr);
  }
  return '';
}

function blockHTML(block) {
  const head = block.heading ? `<h3 class="j-sec-title">${esc(block.heading)}</h3>` : '';
  const blurb = block.blurb ? `<p class="j-sec-blurb">${esc(block.blurb)}</p>` : '';

  if (block.type === 'entries') {
    return `<section class="j-section">${head}${blurb}${block.items.map(entryCard).join('')}</section>`;
  }

  if (block.type === 'skills') {
    return `<section class="j-section">${head}${block.groups.map(skillCard).join('')}</section>`;
  }

  if (block.type === 'profile') {
    const pct = Math.round((found.size / POIS.length) * 100);
    return `<section class="j-section">
      <div class="sheet px">
        <div class="avatar px" style="--avatar-bg:url(${SWATCH.meadows})"><span class="avatar-sprite"></span></div>
        <div>
          <p class="sheet-name">${esc(PROFILE.name)}</p>
          <dl class="stats">${PROFILE.stats.map(([k, v, cls]) => `<div><dt>${esc(k)}</dt><dd${cls ? ` class="${cls}"` : ''}>${esc(v)}</dd></div>`).join('')}</dl>
        </div>
        <div class="xp">
          <span class="xp-label">Explored</span>
          <span class="xp-bar"><i style="width:${pct}%"></i></span>
          <span class="xp-count" data-found-count>${foundCount()}</span>
          <button type="button" class="xp-reset" data-reset>Reset</button>
        </div>
      </div></section>`;
  }

  if (block.type === 'contact') {
    return `<section class="j-section">${head}<div class="contact-rows">${block.items.map(c => c.href
      ? `<a class="contact-row px" href="${c.href}"${c.href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}><span class="ck">${esc(c.key)}</span><span class="cv">${esc(c.label)}</span></a>`
      : `<div class="contact-row px"><span class="ck">${esc(c.key)}</span><span class="cv">${esc(c.label)}</span></div>`
    ).join('')}</div></section>`;
  }

  if (block.type === 'chips') {
    return `<section class="j-section">${head}<ul class="loot chips">${block.items.map(c => `<li>${esc(c)}</li>`).join('')}</ul></section>`;
  }

  if (block.type === 'guide') {
    return `<section class="j-section">${head}<div class="guide">${REGIONS.filter(r => r.id !== 'camp').map(r => `
      <button type="button" class="guide-row px" data-view="${r.id}" style="--row-accent:${r.accent}">
        <span class="guide-swatch" style="background-image:url(${SWATCH[r.id]})"></span>
        <span class="guide-name">${esc(r.biome)}<span class="guide-sec">${esc(r.label)}</span></span>
        <span class="guide-go">Read ▸</span>
      </button>`).join('')}</div></section>`;
  }

  // note
  return `<section class="j-section">${head}<p class="game-note">${block.html}</p></section>`;
}

function gotoHTML(poi) {
  if (!poi) return '';
  return canTravel(poi)
    ? `<button type="button" class="goto" data-travel="${poi.id}">▸ Travel here</button>`
    : `<button type="button" class="goto" data-goto="${poi.id}">▸ Walk here</button>`;
}

let journalRegion = null;
function renderJournal(id) {
  const R = regionById[id];
  journalRegion = id;
  const n = REGIONS.indexOf(R);
  document.documentElement.style.setProperty('--accent', R.accent);
  journalBody.innerHTML = `
    <header class="j-head" style="background-image:url(${SWATCH[id]})">
      <p class="eyebrow"><span class="dot"></span>Region 0${n + 1} · ${esc(R.biome)}</p>
      <h2 class="j-title">${esc(R.label)}</h2>
      <p class="j-blurb">${esc(R.blurb)}</p>
    </header>
    <div class="j-body">${R.blocks.map(blockHTML).join('')}</div>`;
  journalBody.scrollTop = 0;
  regionNav.querySelectorAll('.region-tab').forEach(b => b.classList.toggle('is-active', b.dataset.view === id));
  if (nearPoi) markNear(nearPoi, true);
}

function markNear(poi, quiet) {
  journalBody.querySelectorAll('.entry.is-near').forEach(el => el.classList.remove('is-near'));
  if (!poi) return;
  const el = journalBody.querySelector(`[data-poi="${poi.id}"]`);
  if (!el) return;
  el.classList.add('is-near');
  if (!quiet && !document.body.classList.contains('journal-closed')) {
    el.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
}

// progress only lives in this visitor's localStorage, so a reset just empties
// it. two clicks instead of a confirm() dialog: "reset" arms it, "sure?" does it,
// and it disarms itself after a few seconds if you wander off.
let resetArmed = null;
function resetProgress(btn) {
  if (resetArmed !== btn) {
    clearTimeout(resetArmed && resetArmed.timer);
    resetArmed = btn;
    btn.textContent = 'Sure?';
    btn.classList.add('is-armed');
    btn.timer = setTimeout(() => {
      btn.textContent = 'Reset';
      btn.classList.remove('is-armed');
      if (resetArmed === btn) resetArmed = null;
    }, 3000);
    sfx.deny();
    return;
  }
  clearTimeout(btn.timer);
  resetArmed = null;
  store.write('dm-found', []);
  store.write('dm-save', null);
  if (typeof playResetting === 'function') playResetting();
  store.write('dm-started', true, 'sessionStorage');
  try { history.replaceState(null, '', location.pathname); } catch { /* file:// */ }
  location.reload();
}

function updateFoundUI() {
  $('#mm-found').textContent = `${foundCount()} found`;
  document.querySelectorAll('[data-found-count]').forEach(el => { el.textContent = foundCount(); });
  const bar = journalBody.querySelector('.xp-bar i');
  if (bar) bar.style.width = `${Math.round((found.size / POIS.length) * 100)}%`;
}

let toastTimer;
function toast(eyebrow, title, sub = '') {
  $('#toast-eyebrow').textContent = eyebrow;
  $('#toast-title').textContent = title;
  $('#toast-sub').textContent = sub;
  const el = $('#toast');
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
}

const canvas = $('#world');
const ctx = canvas.getContext('2d');
let S = 3;              // device pixels per world pixel, always an integer
let vw = 0, vh = 0, dpr = 1;
let focusX = 0, focusY = 0;    // where on screen (device px) the player should sit
const cam = { x: 0, y: 0 };

function resize() {
  dpr = window.devicePixelRatio || 1;
  vw = window.innerWidth;
  vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  // integer scale only, otherwise pixel columns come out uneven widths
  S = Math.max(2, Math.round((vw >= 1280 ? 3 : 2) * dpr));
  ctx.imageSmoothingEnabled = false;
  updateFocus();
  sizeHero();
}

function updateFocus() {
  const small = vw <= 820;
  const open = !document.body.classList.contains('journal-closed') && !document.body.classList.contains('is-title');
  // centre the player in the part of the screen the journal isn't covering
  const coverR = !small && open ? journal.offsetWidth + 20 : 0;
  const coverB = small && open ? journal.offsetHeight + 10 : small ? 44 : 0;
  focusX = ((vw - coverR) / 2) * dpr;
  focusY = ((vh - coverB) / 2 + (small ? 40 : 0)) * dpr;
  document.body.style.setProperty('--focus-x', `${(vw - coverR) / 2}px`);
}

function camTarget() {
  return { x: player.x - focusX / S, y: player.y - 10 - focusY / S };
}
function clampCam(c) {
  const maxX = W * TILE - canvas.width / S, maxY = H * TILE - canvas.height / S;
  c.x = maxX < 0 ? maxX / 2 : clamp(c.x, 0, maxX);
  c.y = maxY < 0 ? maxY / 2 : clamp(c.y, 0, maxY);
  return c;
}

let started = false;
let region = 'camp';
let pendingRegion = null, pendingT = 0;
let nearPoi = null;
const amb = { camp: 1, meadows: 0, dunes: 0, tundra: 0, mines: 0 };
const particles = [];
const flakes = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 0.8, p: Math.random() * 6 }));

function enterRegion(id, quiet) {
  if (id === region && journalRegion === id) return;
  region = id;
  renderJournal(id);
  const R = regionById[id];
  $('#mm-region').textContent = R.biome;
  $('.brand-mark').style.background = R.accent;
  if (!quiet) { toast('Entering', R.biome, R.label); sfx.region(); }
  if (started) {
    try { history.replaceState(null, '', `#${id}`); } catch { /* file:// in some browsers */ }
  }
}

function discover(poi) {
  if (found.has(poi.id)) return;
  found.add(poi.id);
  store.write('dm-found', [...found]);
  paintMinimap();
  updateFoundUI();
  const el = journalBody.querySelector(`[data-poi="${poi.id}"]`);
  if (el && el.classList.contains('is-locked')) {
    el.outerHTML = cardFor(poi.id);
    const fresh = journalBody.querySelector(`[data-poi="${poi.id}"]`);
    if (fresh) {
      fresh.classList.add('just-found');
      if (poi === nearPoi) fresh.classList.add('is-near');
    }
  } else if (el) {
    el.classList.add('is-found');
  }
  if (found.size === POIS.length) toast('World explored', 'All landmarks found', 'Thanks for playing. Now let\'s talk.');
  else toast(`Landmark ${foundCount()}`, poi.label, regionById[poi.region].label);
  sfx.found();
  burst(poi.thing.x, poi.thing.y - 10, GLOW[poi.kind] || GLOW.crystal, 18);
}

function burst(x, y, rgb, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 60;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, g: 120, life: 0.6 + Math.random() * 0.4, t: 0, col: `rgb(${rgb})`, size: 1 + (Math.random() < 0.3) });
  }
}

function warpTo(tx, ty) {
  // nearest reachable tile to wherever you asked for
  let best = null, bestD = Infinity;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!reach[idx(x, y)] || SOLID[tiles[idx(x, y)]]) continue;
    const d = (x - tx) ** 2 + (y - ty) ** 2;
    if (d < bestD) { bestD = d; best = [x, y]; }
  }
  if (!best) return;
  const land = () => {
    player.x = best[0] * TILE + 8;
    player.y = best[1] * TILE + 12;
    player.path = null;
    Object.assign(cam, clampCam(camTarget()));
    // the fade hides the jump, so snap the ambience (dark, snow) too
    const here = regionAt(player.x / TILE, player.y / TILE);
    for (const k in amb) amb[k] = k === here ? 1 : 0;
  };
  sfx.warp();
  if (reduceMotion) { land(); return; }
  const w = $('#warp');
  w.classList.add('is-on');
  setTimeout(() => { land(); w.classList.remove('is-on'); }, 170);
}

// fast travel only goes to landmarks you've already reached on foot, and it
// drops you right in front of that landmark instead of on whatever tile you
// clicked. camp counts as found from the start because that's where you spawn.
function canTravel(poi) { return poi.id === 'camp' || found.has(poi.id); }

function travelTo(poi) {
  if (!canTravel(poi)) {
    toast('Uncharted', '? ? ?', `Somewhere in ${regionById[poi.region].biome}. Find it on foot first.`);
    sfx.deny();
    return;
  }
  if (poi.id === 'camp') warpTo(SPAWN.x, SPAWN.y);
  else warpTo(poi.at[0], poi.at[1] + 2);
}

function viewRegion(id) {
  openJournal();
  if (id === journalRegion) return;
  renderJournal(id);
  sfx.ui();
}

// only used by deep links (#mines etc), which are for sharing a region
// directly, so they skip the explore-first rule
function warpToRegion(id) {
  if (id === 'camp') { warpTo(SPAWN.x, SPAWN.y); return; }
  const first = POIS.find(p => p.region === id);
  warpTo(first.at[0], first.at[1] + 2);
}

function openJournal() {
  if (!document.body.classList.contains('journal-closed')) return;
  toggleJournal();
}
function toggleJournal() {
  const closed = document.body.classList.toggle('journal-closed');
  $('#journal-toggle').setAttribute('aria-expanded', String(!closed));
  updateFocus();
}

function update(dt, t) {
  let ix = 0, iy = 0;
  const frozen = typeof playFrozen === 'function' && playFrozen();
  if (started && !frozen) keys.forEach(k => { const m = MOVE_KEYS[k]; if (m) { ix += m[0]; iy += m[1]; } });
  if (frozen) player.path = null;
  if (ix || iy) player.path = null;

  const tileUnder = tiles[idx(clamp(Math.floor(player.x / TILE), 0, W - 1), clamp(Math.floor((player.y - 1) / TILE), 0, H - 1))];
  const wading = tileUnder === T.WATER;
  const speed = SPEED * (wading ? 0.6 : 1) * (typeof playSpeedMult === 'function' ? playSpeedMult() : 1);

  if (!ix && !iy && player.path && player.path.length) {
    const wp = player.path[0];
    const dx = wp.x - player.x, dy = wp.y - player.y, d = Math.hypot(dx, dy);
    if (d < speed * dt + 0.5) { player.path.shift(); ix = dx / (speed * dt || 1); iy = dy / (speed * dt || 1); }
    else { ix = dx / d; iy = dy / d; }
    if (!player.path.length) player.path = null;
  }

  const swinging = player.swing >= 0;
  const len = Math.hypot(ix, iy);
  player.moving = len > 0.01;
  if (player.moving) {
    const n = len > 1 ? len : 1;
    const vx = (ix / n) * speed, vy = (iy / n) * speed;
    player.heading = Math.atan2(vy, vx);
    const nx = player.x + vx * dt, ny = player.y + vy * dt;
    if (!blocked(nx, player.y)) player.x = nx;
    if (!blocked(player.x, ny)) player.y = ny;
    // mid-swing you keep facing where you aimed, not where you're walking
    if (!swinging) {
      if (Math.abs(ix) > Math.abs(iy) * 1.1) { player.face = 'side'; player.flip = ix < 0; }
      else if (Math.abs(iy) > 0.01) player.face = iy < 0 ? 'up' : 'down';
    }

    // little puffs from your feet, coloured by whatever you're walking on
    player.dustT -= dt;
    if (player.dustT <= 0 && !reduceMotion) {
      player.dustT = wading ? 0.18 : 0.11;
      const base = PAL[tileUnder] ? PAL[tileUnder].dots[0] : '#888';
      particles.push({
        x: player.x + (Math.random() - 0.5) * 6, y: player.y - 1, vx: (Math.random() - 0.5) * 16, vy: -10 - Math.random() * 12,
        g: 30, life: 0.35, t: 0, col: wading ? 'rgba(255,255,255,0.8)' : base, size: 1
      });
    }
  }
  player.anim += dt;
  if (swinging) {
    player.swing += dt;
    if (player.swing > 0.3) player.swing = -1;
  }
  if (typeof playUpdate === 'function') playUpdate(dt, t);

  // region, with a short hysteresis so wobbling on a border doesn't flicker
  const here = regionAt(player.x / TILE, player.y / TILE);
  if (started) {
    if (here !== region) {
      if (pendingRegion !== here) { pendingRegion = here; pendingT = 0; }
      pendingT += dt;
      if (pendingT > 0.2) { enterRegion(here); pendingRegion = null; }
    } else pendingRegion = null;
  }
  for (const k in amb) amb[k] += ((k === here ? 1 : 0) - amb[k]) * Math.min(1, dt * 2.5);

  // nearest landmark within a few tiles lights up its journal entry
  let near = null, nearD = TILE * 3.4;
  POIS.forEach(p => {
    // a creature landmark only counts once you've beaten it, so walking past
    // a live one doesn't light it up
    if (p.thing.gone || (p.thing.creature && !found.has(p.id))) return;
    const d = Math.hypot(p.thing.x - player.x, p.thing.y - player.y);
    if (d < nearD) { near = p; nearD = d; }
  });
  if (started && near !== nearPoi) {
    nearPoi = near;
    // if you were reading another region's page, flip back quietly (no banner)
    if (near && near.region !== journalRegion) renderJournal(near.region);
    markNear(near);
    if (near) discover(near);
  }

  // campfire embers
  if (!reduceMotion && Math.random() < dt * 7) {
    const f = POIS.find(p => p.kind === 'fire').thing;
    particles.push({ x: f.x + (Math.random() - 0.5) * 8, y: f.y - 10, vx: (Math.random() - 0.5) * 10, vy: -18 - Math.random() * 20, g: -4, life: 1 + Math.random(), t: 0, col: Math.random() < 0.5 ? '#ffc93c' : '#ff7b1c', size: 1 });
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t > p.life) { particles.splice(i, 1); continue; }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  // camera: follow when playing, slow drift around camp on the title screen
  let target;
  if (started) target = camTarget();
  else {
    const drift = reduceMotion ? 0 : t / 1000;
    target = { x: player.x + Math.sin(drift * 0.09) * 180 - focusX / S, y: player.y + Math.cos(drift * 0.07) * 110 - focusY / S };
  }
  clampCam(target);
  const k = reduceMotion ? 1 : Math.min(1, dt * (started ? 7 : 1.5));
  cam.x += (target.x - cam.x) * k;
  cam.y += (target.y - cam.y) * k;
}

function render(t) {
  const cw = canvas.width, ch = canvas.height;
  // snap the camera to whole device pixels so tiles never shimmer
  const camX = Math.round(cam.x * S), camY = Math.round(cam.y * S);
  const toX = wx => Math.round(wx * S) - camX;
  const toY = wy => Math.round(wy * S) - camY;

  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, cw, ch);
  const sx = Math.max(0, Math.floor(camX / S)), sy = Math.max(0, Math.floor(camY / S));
  const sw = Math.min(W * TILE - sx, Math.ceil(cw / S) + 2), sh = Math.min(H * TILE - sy, Math.ceil(ch / S) + 2);
  ctx.drawImage(worldCanvas, sx, sy, sw, sh, sx * S - camX, sy * S - camY, sw * S, sh * S);

  // water glints: a couple of pixels per visible water tile blink on and off
  const tx0 = Math.floor(sx / TILE), ty0 = Math.floor(sy / TILE);
  const tick = Math.floor(t / 420);
  for (let y = ty0; y < ty0 + sh / TILE + 1 && y < H; y++) {
    for (let x = tx0; x < tx0 + sw / TILE + 1 && x < W; x++) {
      const tt = tiles[idx(x, y)];
      if (tt !== T.WATER && tt !== T.ICE) continue;
      const h = hash2(x, y, tick);
      if (h > 0.22) continue;
      ctx.fillStyle = tt === T.ICE ? 'rgba(255,255,255,0.8)' : 'rgba(210,235,255,0.75)';
      ctx.fillRect(toX(x * TILE + ((h * 97) % 12) + 2), toY(y * TILE + ((h * 53) % 12) + 2), 2 * S, S);
    }
  }

  // y-sorted sprites
  const view = { l: cam.x - 48, r: cam.x + cw / S + 48, t: cam.y - 64, b: cam.y + ch / S + 64 };
  const drawList = things.filter(o => !o.gone && o.x > view.l && o.x < view.r && o.y > view.t && o.y < view.b);
  drawList.push({ isPlayer: true, y: player.y });
  drawList.sort((a, b) => a.y - b.y);
  for (const o of drawList) {
    if (o.isPlayer) { drawPlayer(toX, toY, t); continue; }
    if (o.draw) { o.draw(o, toX, toY, t); continue; }
    const frame = o.frames.length > 1 ? o.frames[Math.floor((t / 1000) * (o.fps || 6) + (o.phase || 0)) % o.frames.length] : o.frames[0];
    const w = frame.width, h = frame.height;
    if (!o.torch) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(toX(o.x - w * 0.3), toY(o.y - 1), Math.round(w * 0.6 * S), 2 * S);
    }
    // anything being chopped wobbles a pixel either way
    const shake = o.shake ? Math.round(Math.sin(t / 30) * o.shake) : 0;
    ctx.drawImage(frame, toX(o.x - Math.floor(w / 2) + shake), toY(o.y - h + 1), w * S, h * S);
  }

  // particles
  for (const p of particles) {
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = p.col;
    ctx.fillRect(toX(p.x), toY(p.y), p.size * S, p.size * S);
  }
  ctx.globalAlpha = 1;

  // mines: it's dark down there, you get a lantern radius
  const dark = amb.mines;
  if (dark > 0.01) {
    const px = toX(player.x), py = toY(player.y - 12);
    const g = ctx.createRadialGradient(px, py, TILE * S * 2.6, px, py, TILE * S * 8.5);
    g.addColorStop(0, 'rgba(4,4,10,0)');
    g.addColorStop(1, `rgba(4,4,10,${0.74 * dark})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }

  const night = typeof playNight === 'function' ? playNight() : 0;
  if (night > 0.01) {
    const px = toX(player.x), py = toY(player.y - 12);
    const g = ctx.createRadialGradient(px, py, TILE * S * 1.5, px, py, TILE * S * 7);
    g.addColorStop(0, `rgba(10,14,40,${0.45 * night})`);
    g.addColorStop(1, `rgba(5,7,22,${0.8 * night})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }
  const lit = Math.max(dark, night);

  // light sources, added on top so they punch through the dark
  ctx.globalCompositeOperation = 'lighter';
  for (const gl of glows) {
    if (gl.off) continue;
    const gx = toX(gl.x), gy = toY(gl.y);
    const rad = gl.rad * TILE * S * (gl.flicker ? 0.94 + Math.sin(t / 90 + gl.x) * 0.04 + Math.random() * 0.03 : 1);
    if (gx < -rad || gy < -rad || gx > cw + rad || gy > ch + rad) continue;
    const strength = gl.always ? 0.16 + 0.3 * lit : gl.mine ? 0.1 + 0.4 * dark : 0.1 + 0.15 * night;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
    g.addColorStop(0, `rgba(${gl.rgb},${strength})`);
    g.addColorStop(1, `rgba(${gl.rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  // tundra snowfall, in screen space so it doesn't scroll with the map
  if (amb.tundra > 0.02 && !reduceMotion) {
    ctx.fillStyle = `rgba(255,255,255,${0.85 * amb.tundra})`;
    const secs = t / 1000;
    for (const f of flakes) {
      const y = ((f.y + secs * 0.05 * f.s) % 1) * ch;
      const x = ((f.x + Math.sin(secs * 0.8 + f.p) * 0.01 - (cam.x * S) / cw * 0.15) % 1 + 1) % 1 * cw;
      const size = f.s > 0.9 ? 2 * S : S;
      ctx.fillRect(Math.round(x), Math.round(y), size, size);
    }
  }

  drawLabels(toX, toY, t);
  if (typeof playRenderOverlay === 'function') playRenderOverlay(toX, toY, t);
}

function drawPlayer(toX, toY, t) {
  if (!sheet.complete || !sheet.naturalWidth) return;
  let row, col;
  if (player.dead) {
    row = 9;
    col = Math.min(2, Math.floor(player.deadT / 0.22));
  } else if (player.swing >= 0) {
    row = ROWS.swing[player.face];
    col = Math.min(3, Math.floor(player.swing / 0.075));
  } else if (player.moving) {
    row = ROWS.walk[player.face];
    col = Math.floor(player.anim * 11) % 6;
  } else {
    row = ROWS.idle[player.face];
    col = Math.floor(player.anim * 5) % 6;
  }
  const tileUnder = tiles[idx(clamp(Math.floor(player.x / TILE), 0, W - 1), clamp(Math.floor((player.y - 1) / TILE), 0, H - 1))];
  const wading = tileUnder === T.WATER && player.swing < 0;
  // wading: sink the sprite a few pixels and cut the legs off at the waterline
  const sink = wading ? 3 : 0;
  const srcH = wading ? CELL - 8 : CELL;
  const dx = toX(player.x - 24), dy = toY(player.y - 42 + sink);
  const img = sheetPlay.complete && sheetPlay.naturalWidth ? sheetPlay : sheet;
  const armor = typeof playArmorIndex === 'function' ? playArmorIndex() : -1;
  const armorY = armor >= 0 && armorSheet.naturalWidth ? (armor * 10 + row) * CELL : -1;
  if (typeof playDrawHeld === 'function') playDrawHeld(dx, dy, row, col, false);
  ctx.save();
  if (player.blink) ctx.globalAlpha = 0.4;
  if (player.flip) {
    ctx.translate(dx + CELL * S, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, col * CELL, row * CELL, CELL, srcH, 0, 0, CELL * S, srcH * S);
    if (armorY >= 0) ctx.drawImage(armorSheet, col * CELL, armorY, CELL, srcH, 0, 0, CELL * S, srcH * S);
  } else {
    ctx.drawImage(img, col * CELL, row * CELL, CELL, srcH, dx, dy, CELL * S, srcH * S);
    if (armorY >= 0) ctx.drawImage(armorSheet, col * CELL, armorY, CELL, srcH, dx, dy, CELL * S, srcH * S);
  }
  ctx.restore();
  if (typeof playDrawHeld === 'function') playDrawHeld(dx, dy, row, col, true);
  if (wading) {
    const w = 8 + (Math.floor(t / 250) % 2) * 3;
    ctx.fillStyle = 'rgba(230,244,255,0.8)';
    ctx.fillRect(toX(player.x - w), toY(player.y - 3), w * 2 * S, S);
  }
}

function drawLabels(toX, toY, t) {
  // silkscreen is drawn on an 8px grid, so keep it on multiples of 8 or the
  // letters smear (a C starts looking like an O)
  const fs = Math.max(16, 8 * Math.round((S * 5.3) / 8));
  ctx.font = `${fs}px Silkscreen, monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const bob = reduceMotion ? 0 : Math.floor(t / 400) % 2;
  for (const p of POIS) {
    const o = p.thing;
    if (o.gone) continue;
    const x = toX(o.x), topY = toY(o.y - (o.labelH || o.frames[0].height) - 3);
    if (x < -200 || x > canvas.width + 200 || topY < -60 || topY > canvas.height + 60) continue;
    const near = p === nearPoi, got = found.has(p.id);
    const text = known(p) ? p.label.toUpperCase() : '? ? ?';
    const tw = ctx.measureText(text).width;
    const pad = Math.round(fs * 0.5), bh = Math.round(fs * 1.6);
    const bx = Math.round(x - tw / 2 - pad), by = Math.round(topY - bh);
    ctx.fillStyle = near ? regionById[p.region].accent : 'rgba(12,12,16,0.82)';
    ctx.fillRect(bx, by, Math.round(tw + pad * 2), bh);
    ctx.fillStyle = near ? '#111' : got ? '#bdb9b0' : '#ffffff';
    ctx.fillText(text, x, by + bh / 2 + 1);
    if (!got) {
      // quest marker until you've been there
      const mw = Math.round(fs * 0.9), my = by - mw - 4 * S + bob * S;
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(Math.round(x - mw / 2), my, mw, mw);
      ctx.fillStyle = '#111';
      ctx.fillText('!', x, my + mw / 2 + 1);
    }
  }
}

// the title screen's character: standing on a little floating chunk of the
// meadow, idling and swinging the sword every few seconds
const hero = $('#hero');
const heroCtx = hero.getContext('2d');
const HERO_W = 80, HERO_H = 76;
let island;
function buildIsland() {
  island = mk(HERO_W, HERO_H);
  const g = island.getContext('2d');
  const rowTiles = (type, y, x0, x1) => {
    for (let x = x0; x < x1; x += TILE) g.drawImage(TEX[type][(x / TILE) % 4 | 0], 0, 0, Math.min(TILE, x1 - x), TILE, x, y, Math.min(TILE, x1 - x), TILE);
  };
  rowTiles(T.GRASS, 44, 8, 72);
  rowTiles(T.STONE, 60, 14, 66);
  rowTiles(T.STONE, 68, 26, 54);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(14, 60, 52, 2);
  g.fillRect(26, 68, 28, 2);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(8, 44, 64, 1);
  g.fillStyle = '#1d562f';
  [[12, 60], [20, 62], [58, 61], [63, 60], [30, 70], [49, 71]].forEach(([x, y]) => g.fillRect(x, y, 1, 3 + (x % 3)));
}
function sizeHero() {
  const k = vw > 900 ? 5 : 3;
  hero.width = HERO_W * k;
  hero.height = HERO_H * k;
  hero.style.width = `${HERO_W * k}px`;
  hero.style.height = `${HERO_H * k}px`;
  heroCtx.imageSmoothingEnabled = false;
  hero.dataset.k = k;
}
function renderHero(t) {
  if (started || !sheet.naturalWidth) return;
  const k = Number(hero.dataset.k);
  heroCtx.clearRect(0, 0, hero.width, hero.height);
  const bobY = reduceMotion ? 0 : (Math.floor(t / 900) % 2);
  heroCtx.drawImage(island, 0, bobY * k, HERO_W * k, HERO_H * k);
  // 4.2s loop: idle, swing down, idle, swing to the side
  const loop = reduceMotion ? 0 : (t / 1000) % 4.2;
  let row = 0, col = Math.floor((t / 1000) * 5) % 6, flip = false;
  if (loop > 1.6 && loop < 1.9) { row = 6; col = Math.min(3, Math.floor((loop - 1.6) / 0.075)); }
  if (loop > 3.4 && loop < 3.7) { row = 7; col = Math.min(3, Math.floor((loop - 3.4) / 0.075)); flip = Math.floor(t / 4200) % 2 === 1; }
  const dx = (40 - 24) * k, dy = (46 - 42 + bobY) * k;
  heroCtx.save();
  if (flip) { heroCtx.translate(dx + CELL * k, dy); heroCtx.scale(-1, 1); heroCtx.drawImage(sheet, col * CELL, row * CELL, CELL, CELL, 0, 0, CELL * k, CELL * k); }
  else heroCtx.drawImage(sheet, col * CELL, row * CELL, CELL, CELL, dx, dy, CELL * k, CELL * k);
  heroCtx.restore();
}

generate();
placeDecor();
paintWorld();
buildIsland();
renderTabs();
resize();
renderJournal('camp');
updateFoundUI();
$('#biome-strip').innerHTML = ['meadows', 'dunes', 'mines', 'tundra'].map(id => `<span style="background-image:url(${SWATCH[id]})"></span>`).join('');
Object.assign(cam, clampCam(camTarget()));

function start(regionId) {
  if (started) return;
  started = true;
  document.body.classList.remove('is-title');
  store.write('dm-started', true, 'sessionStorage');
  updateFocus();
  sfx.region();
  if (regionId && regionId !== 'camp') {
    warpToRegion(regionId);
    enterRegion(regionId, true);
  } else {
    region = 'camp';
    toast('Welcome to', 'Base Camp', 'Walk up to a landmark to read it');
  }
  canvas.focus?.();
}

const hashRegion = location.hash.slice(1);
if (regionById[hashRegion]) start(hashRegion);
else if (store.read('dm-started', false, 'sessionStorage')) start();

let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  update(dt, t);
  render(t);
  renderHero(t);
  // minimap marker follows the player
  const mm = $('#mm-frame');
  const mx = (player.x / (W * TILE)) * mm.clientWidth, my = (player.y / (H * TILE)) * mm.clientHeight;
  marker.style.left = `${mx}px`;
  marker.style.top = `${my}px`;
  // the arrow art points down, so it's heading minus 90deg, snapped to 8 ways
  // so it clicks between directions like a sprite instead of spinning smoothly
  const deg = Math.round(((player.heading * 180) / Math.PI - 90) / 45) * 45;
  marker.style.transform = `rotate(${deg}deg)`;
  requestAnimationFrame(frame);
}
const marker = $('#mm-marker');
requestAnimationFrame(frame);

window.addEventListener('resize', resize);
journal.addEventListener('transitionend', updateFocus);

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const onControl = e.target.closest && e.target.closest('button, a');

  if (!started) {
    if (e.key === 'Enter' || e.key === ' ' || MOVE_KEYS[e.key]) {
      if (onControl && (e.key === 'Enter' || e.key === ' ') && e.target.id !== 'start-btn') return;
      e.preventDefault();
      start();
    }
    return;
  }

  if (typeof playKey === 'function' && playKey(e, onControl)) return;
  if (MOVE_KEYS[e.key]) { e.preventDefault(); keys.add(e.key); return; }
  if (e.key === 'j' || e.key === 'J') { toggleJournal(); return; }
});
document.addEventListener('keyup', e => keys.delete(e.key));
window.addEventListener('blur', () => keys.clear());

$('#start-btn').addEventListener('click', () => start());
$('#title').addEventListener('click', e => { if (!e.target.closest('a, button')) start(); });

// clicking the world is the play layer's job (attack, mine, open stations);
// here it only needs to get you past the title screen
canvas.addEventListener('pointerdown', () => {
  if (!started) start();
});

$('#mm-frame').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  const tx = ((e.clientX - r.left) / r.width) * W, ty = ((e.clientY - r.top) / r.height) * H;
  // snap to the nearest landmark you've found. undiscovered ones are ignored
  // here on purpose, otherwise clicking around would hint where they are
  const foundNear = POIS.filter(canTravel)
    .map(p => [p, Math.hypot(p.at[0] - tx, p.at[1] - ty)])
    .sort((a, b) => a[1] - b[1])
    .find(([, d]) => d < 12);
  if (foundNear) travelTo(foundNear[0]);
  else { toast('Uncharted', 'Nothing found here yet', 'Walk out and find a landmark first'); sfx.deny(); }
});

document.addEventListener('click', e => {
  const resetBtn = e.target.closest('[data-reset]');
  if (resetBtn) {
    resetProgress(resetBtn);
    return;
  }
  const viewBtn = e.target.closest('[data-view]');
  if (viewBtn) {
    viewRegion(viewBtn.dataset.view);
    // pointer clicks shouldn't leave focus on the button, otherwise the next
    // space press re-triggers it instead of swinging
    if (e.detail) viewBtn.blur();
    return;
  }
  const travelBtn = e.target.closest('[data-travel]');
  if (travelBtn) {
    travelTo(POIS.find(q => q.id === travelBtn.dataset.travel));
    if (e.detail) travelBtn.blur();
    return;
  }
  const go = e.target.closest('[data-goto]');
  if (go) {
    const p = POIS.find(q => q.id === go.dataset.goto);
    const path = findPath(p.at[0], p.at[1] + 1);
    player.path = path.length ? path : null;
    if (e.detail) go.blur();
  }
});

$('#journal-toggle').addEventListener('click', toggleJournal);

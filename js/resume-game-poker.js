// the mines' fourth landmark, desperate measures: a lava cavern where five
// miners have been playing no limit hold'em round a stone table for longer than
// anyone can remember. it's a minigame and a boss at once: sit down, play them
// at their own game with ores for chips, and be the last one standing. the
// winner gets ace's lava key, which opens the last room in the mines (the
// teachla site's landmark). loads after resume-game-wolf.js.
//
// the file is in two halves. the first is the poker itself (cards, the hand
// evaluator, the table rules and the five players' brains), and it touches
// nothing from the rest of the game, so it can be run on its own in node to
// play thousands of hands between the bots. the second half is everything you
// see: the cavern, the table, the miners, the chips, the cards and the talking.

// poker core start
// the chips are ores, counted in iron (one iron is $100). the blinds are one and
// two iron, and a straddle is four. every seat starts at 200 iron, 100 big blinds.
const PK = { SB: 1, BB: 2, STRADDLE: 4, START: 200, MIN_BUYIN: 2, MAX_BUYIN: 200, DOLLARS: 100, LEVEL_HANDS: 40, SEVEN_DEUCE: 10 };
// the seven deuce game (a house rule): win a pot holding seven deuce off suit
// and everyone else at the table pays you SEVEN_DEUCE iron ($1,000), whether
// they were in the hand or not. set it to 0 to turn the rule off.
const pkIs72 = c => !!c && c.length === 2 && ((c[0] >> 2) + (c[1] >> 2) === 5) && ((c[0] >> 2) === 5 || (c[0] >> 2) === 0) && (c[0] & 3) !== (c[1] & 3);
// the blinds go up every LEVEL_HANDS hands ("the lava rises"). at one and two
// for good, a last one standing game between six players runs to about 700
// hands, which is hours. set LEVEL_HANDS to 0 to keep them at one and two.
const PK_LEVELS = [[1, 2], [2, 4], [3, 6], [5, 10], [8, 16], [10, 20], [15, 30], [25, 50], [40, 80], [60, 120], [100, 200]];
function pkBlinds(T) {
  const L = PK_LEVELS[Math.min(PK_LEVELS.length - 1, PK.LEVEL_HANDS ? Math.floor((T.hand - 1) / PK.LEVEL_HANDS) : 0)];
  return { sb: L[0], bb: L[1], straddle: L[1] * 2 };
}
const PK_IDS = ['you', 'brutus', 'neville', 'ace', 'brock', 'sparks'];

// cards are 0 to 51: rank is c >> 2 (0 is a deuce, 12 an ace), suit is c & 3
const PK_RANKS = '23456789TJQKA', PK_SUITS = 'cdhs';
const pkRank = c => c >> 2, pkSuit = c => c & 3;
const pkName = c => PK_RANKS[c >> 2] + PK_SUITS[c & 3];

// the evaluator: best five of up to seven cards as one number, bigger is
// better. the category goes in the top bits (0 high card up to 8 straight
// flush) and the ranks that break ties in four bits each under it.
const PK_CNT = new Int8Array(13), PK_SM = new Int32Array(4), PK_SC = new Int8Array(4);
function pkStraight(m) {
  const w = (m << 1) | ((m >> 12) & 1);
  for (let h = 13; h >= 4; h--) if (((w >> (h - 4)) & 31) === 31) return h - 1;
  return -1;
}
function pkEval(cs, n) {
  let rm = 0;
  PK_CNT.fill(0); PK_SM.fill(0); PK_SC.fill(0);
  for (let i = 0; i < n; i++) { const c = cs[i], r = c >> 2, s = c & 3; PK_CNT[r]++; PK_SM[s] |= 1 << r; PK_SC[s]++; rm |= 1 << r; }
  for (let s = 0; s < 4; s++) if (PK_SC[s] >= 5) {
    const st = pkStraight(PK_SM[s]);
    if (st >= 0) return (8 << 20) | (st << 16);
    let k = 0, sh = 16, v = 5 << 20;
    for (let r = 12; r >= 0 && k < 5; r--) if (PK_SM[s] & (1 << r)) { v |= r << sh; sh -= 4; k++; }
    return v;
  }
  let quad = -1, trip = -1, trip2 = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) {
    const c = PK_CNT[r];
    if (c === 4) quad = r;
    else if (c === 3) { if (trip < 0) trip = r; else if (trip2 < 0) trip2 = r; }
    else if (c === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
  }
  const kick = (want, ex1, ex2, sh) => {
    let v = 0, k = 0;
    for (let r = 12; r >= 0 && k < want; r--) if ((rm & (1 << r)) && r !== ex1 && r !== ex2) { v |= r << sh; sh -= 4; k++; }
    return v;
  };
  if (quad >= 0) return (7 << 20) | (quad << 16) | kick(1, quad, -1, 12);
  if (trip >= 0 && (trip2 >= 0 || p1 >= 0)) return (6 << 20) | (trip << 16) | (Math.max(trip2, p1) << 12);
  const st = pkStraight(rm);
  if (st >= 0) return (4 << 20) | (st << 16);
  if (trip >= 0) return (3 << 20) | (trip << 16) | kick(2, trip, -1, 12);
  if (p2 >= 0) return (2 << 20) | (p1 << 16) | (p2 << 12) | kick(1, p1, p2, 8);
  if (p1 >= 0) return (1 << 20) | (p1 << 16) | kick(3, p1, -1, 12);
  return kick(5, -1, -1, 16);
}
const PK_BUF = new Int32Array(7);
function pkEval2(a, b, board) {
  PK_BUF[0] = a; PK_BUF[1] = b;
  for (let i = 0; i < board.length; i++) PK_BUF[i + 2] = board[i];
  return pkEval(PK_BUF, board.length + 2);
}
const PK_PLURAL = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
const PK_WORD = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
function pkHandName(v) {
  const cat = v >> 20, a = (v >> 16) & 15, b = (v >> 12) & 15;
  switch (cat) {
    case 8: return a === 12 ? 'Royal Flush' : `Straight Flush, ${PK_WORD[a]} High`;
    case 7: return `Four ${PK_PLURAL[a]}`;
    case 6: return `Full House, ${PK_PLURAL[a]} Full of ${PK_PLURAL[b]}`;
    case 5: return `Flush, ${PK_WORD[a]} High`;
    case 4: return `Straight, ${PK_WORD[a]} High`;
    case 3: return `Three ${PK_PLURAL[a]}`;
    case 2: return `Two Pair, ${PK_PLURAL[a]} and ${PK_PLURAL[b]}`;
    case 1: return `Pair of ${PK_PLURAL[a]}`;
    default: return `${PK_WORD[a]} High`;
  }
}

// the 169 starting hands, best first. worked out offline with this evaluator:
// a blend of how often each one wins heads up and how often it wins three ways,
// with a nudge for pairs and suited hands (they flop well, so they play better
// than their raw equity). pkPct is how far down that list a hand is, from 0
// (aces) to 1 (seven deuce off), counted in combos.
const PK_ORDER = ('AA KK QQ JJ TT 99 AKs 88 AQs AJs AKo KQs 77 ATs AQo KJs AJo KTs 66 A9s KQo QJs A8s ATo QTs KJo A7s K9s JTs 55 '
  + 'A9o A5s KTo A6s QJo A4s Q9s A3s K8s A8o J9s QTo K7s K9o A2s K6s T9s JTo A7o Q8s 44 K5s A5o J8s A6o Q9o K4s A4o Q7s T8s '
  + 'K8o 98s K3s A3o J9o Q5s J7s Q6s T9o K7o T7s 33 K2s Q8o K6o Q4s A2o J8o J6s Q3s 97s K5o 87s J5s T6s Q2s K4o Q7o T8o 22 96s '
  + '98o K3o Q6o J4s J7o J3s 86s 76s K2o T5s Q5o T7o J2s 95s 97o Q4o 85s T4s J6o 75s 65s T3s 87o Q3o T6o J5o 94s T2s Q2o 64s '
  + '54s 96o 93s 74s 84s J4o 92s 86o J3o 76o 53s 63s T5o 83s J2o T4o 73s 65o 95o 82s 85o 75o 43s T3o 52s 42s 72s T2o 62s 94o '
  + '54o 74o 32s 64o 84o 93o 92o 53o 63o 83o 73o 82o 43o 52o 62o 42o 72o 32o').split(' ');
const PK_CLASS_PCT = {};
(() => {
  let acc = 0;
  PK_ORDER.forEach(k => { const n = k.length === 2 ? 6 : k[2] === 's' ? 4 : 12; PK_CLASS_PCT[k] = (acc + n / 2) / 1326; acc += n; });
})();
function pkClass(a, b) {
  const ra = a >> 2, rb = b >> 2, hi = Math.max(ra, rb), lo = Math.min(ra, rb);
  return hi === lo ? PK_RANKS[hi] + PK_RANKS[lo] : PK_RANKS[hi] + PK_RANKS[lo] + ((a & 3) === (b & 3) ? 's' : 'o');
}
const pkPct = (a, b) => PK_CLASS_PCT[pkClass(a, b)];

// every two card combo (1326 of them), so a range is just a weight for each
const PK_C1 = new Int8Array(1326), PK_C2 = new Int8Array(1326), PK_CPCT = new Float32Array(1326);
const PK_SUITED = new Uint8Array(1326);
(() => {
  let i = 0;
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
    PK_C1[i] = a; PK_C2[i] = b; PK_CPCT[i] = pkPct(a, b); PK_SUITED[i] = (a & 3) === (b & 3) ? 1 : 0; i++;
  }
})();
const pkSig = x => 1 / (1 + Math.exp(-x));

// strengths on a board, for every combo that doesn't clash with it: s is how
// far up the made hands it is (0 to 1, among all live combos), draw is 0 for
// nothing, 1 for a gutshot or a backdoor-ish weak draw, 2 for a flush draw or
// an open ender, 3 for both, and se is s with the draw counted in (a draw
// behaves like a middling hand until the river)
function pkStrengths(board) {
  const n = 1326, val = new Float64Array(n), ok = new Uint8Array(n), s = new Float32Array(n), se = new Float32Array(n), draw = new Uint8Array(n);
  const dead = new Uint8Array(52);
  board.forEach(c => { dead[c] = 1; });
  const order = [];
  for (let i = 0; i < n; i++) {
    if (dead[PK_C1[i]] || dead[PK_C2[i]]) continue;
    ok[i] = 1;
    val[i] = board.length ? pkEval2(PK_C1[i], PK_C2[i], board) : PK_CPCT[i] * -1;
    order.push(i);
  }
  order.sort((x, y) => val[x] - val[y]);
  const m = order.length;
  for (let k = 0; k < m;) {
    let j = k;
    while (j + 1 < m && val[order[j + 1]] === val[order[k]]) j++;
    const p = m > 1 ? ((k + j) / 2) / (m - 1) : 0.5;
    for (let q = k; q <= j; q++) s[order[q]] = p;
    k = j + 1;
  }
  const late = board.length >= 5 || !board.length;
  let bm = 0;
  const bsc = [0, 0, 0, 0];
  board.forEach(c => { bm |= 1 << (c >> 2); bsc[c & 3]++; });
  const boardOuts = late ? 0 : pkStraightOuts(bm);
  for (let i = 0; i < n; i++) {
    if (!ok[i]) continue;
    let d = 0;
    if (!late) {
      const a = PK_C1[i], b = PK_C2[i];
      const made = val[i] >> 20;
      let fd = false;
      if (made < 5) for (let su = 0; su < 4; su++) {
        const k = bsc[su] + ((a & 3) === su) + ((b & 3) === su);
        if (k === 4 && k > bsc[su]) fd = true;
      }
      let sd = 0;
      if (made < 4) {
        const outs = pkStraightOuts(bm | (1 << (a >> 2)) | (1 << (b >> 2))) - boardOuts;
        sd = outs >= 2 ? 2 : outs >= 1 ? 1 : 0;
      }
      d = fd && sd ? 3 : fd || sd === 2 ? 2 : sd === 1 ? 1 : 0;
    }
    draw[i] = d;
    const bonus = [0, 0.09, 0.26, 0.38][d] * (board.length === 3 ? 1 : 0.6);
    se[i] = Math.min(0.98, s[i] + bonus * (1 - s[i]));
  }
  return { val, ok, s, se, draw };
}
// how many ranks would make a straight that isn't already there
function pkStraightOuts(m) {
  if (pkStraight(m) >= 0) return 0;
  let n = 0;
  for (let r = 0; r < 13; r++) if (!(m & (1 << r)) && pkStraight(m | (1 << r)) >= 0) n++;
  return n;
}

// equity by sampling: deal each opponent a hand from their range (weighted),
// run the rest of the board out, and count how often hero wins (ties split).
// nobody ever looks at anyone else's real cards, only at the ranges they've
// been put on from what they did.
const PK_USED = new Int32Array(52);
let pkStamp = 1;
function pkPrepRange(r, dead) {
  const idx = [], cum = [];
  let tot = 0;
  for (let i = 0; i < 1326; i++) {
    const w = r ? r[i] : 1;
    if (w <= 0.001 || dead[PK_C1[i]] || dead[PK_C2[i]]) continue;
    tot += w; idx.push(i); cum.push(tot);
  }
  if (!tot) return pkPrepRange(null, dead);
  return { idx, cum, tot };
}
function pkPick(L) {
  const u = Math.random() * L.tot;
  let lo = 0, hi = L.cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (L.cum[mid] < u) lo = mid + 1; else hi = mid; }
  return L.idx[lo];
}
function pkEquity(hero, board, ranges, trials) {
  const dead = new Uint8Array(52);
  hero.forEach(c => { dead[c] = 1; });
  board.forEach(c => { dead[c] = 1; });
  const lists = ranges.map(r => pkPrepRange(r, dead));
  const need = 5 - board.length, cs = new Int32Array(7), opp = new Int32Array(ranges.length * 2);
  let score = 0, done = 0;
  for (let t = 0; t < trials; t++) {
    const st = ++pkStamp;
    hero.forEach(c => { PK_USED[c] = st; });
    board.forEach(c => { PK_USED[c] = st; });
    let bad = false;
    for (let o = 0; o < lists.length && !bad; o++) {
      let got = false;
      for (let k = 0; k < 14; k++) {
        const i = pkPick(lists[o]), a = PK_C1[i], b = PK_C2[i];
        if (PK_USED[a] === st || PK_USED[b] === st) continue;
        PK_USED[a] = st; PK_USED[b] = st; opp[o * 2] = a; opp[o * 2 + 1] = b; got = true;
        break;
      }
      if (!got) bad = true;
    }
    if (bad) continue;
    for (let i = 0; i < board.length; i++) cs[i + 2] = board[i];
    let k = board.length + 2;
    for (let j = 0; j < need;) {
      const c = (Math.random() * 52) | 0;
      if (PK_USED[c] === st) continue;
      PK_USED[c] = st; cs[k++] = c; j++;
    }
    cs[0] = hero[0]; cs[1] = hero[1];
    const me = pkEval(cs, 7);
    let best = -1, ties = 0;
    for (let o = 0; o < lists.length; o++) {
      cs[0] = opp[o * 2]; cs[1] = opp[o * 2 + 1];
      const v = pkEval(cs, 7);
      if (v > best) { best = v; ties = 0; }
      if (v === best) ties++;
    }
    if (me > best) score += 1;
    else if (me === best) score += 1 / (ties + 1);
    done++;
  }
  return done ? score / done : 0.5;
}

// the table. seats go clockwise round it, which is the way the button and the
// action move. everything that happens is pushed onto T.ev as an event, so the
// game can animate them one at a time at its own pace while the rules have
// already moved on to the next decision.
function pkTable(stacks) {
  return {
    seats: PK_IDS.map((id, i) => ({ id, i, stack: stacks[i], out: !(stacks[i] > 0), cards: null, folded: true, allIn: false, bet: 0, total: 0, acted: -1, need: false, won: 0, vol: 0 })),
    button: -1, hand: 0, board: [], deck: [], pot: 0, bet: 0, lastRaise: PK.BB, blinds: { sb: PK.SB, bb: PK.BB, straddle: PK.STRADDLE }, raises: 0, fullId: 0, street: null,
    toAct: -1, first: -1, ev: [], aggressor: -1, prevAggressor: -1, straddle: -1, sb: -1, bb: -1, over: true, ai: null, log: []
  };
}
const pkLive = T => T.seats.filter(s => !s.out);
const pkInHand = s => !s.out && !s.folded;
const pkCanAct = s => pkInHand(s) && !s.allIn;
function pkNext(T, i, test = s => !s.out) {
  for (let k = 1; k <= 6; k++) { const s = T.seats[(i + k) % 6]; if (test(s)) return s.i; }
  return -1;
}
const pkPotNow = T => T.pot + T.seats.reduce((n, s) => n + s.bet, 0);
function pkPut(T, s, amt) {
  amt = Math.min(amt, s.stack);
  s.stack -= amt; s.bet += amt; s.total += amt;
  if (s.stack === 0) s.allIn = true;
  return amt;
}
function pkShuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
// a new hand: the button moves to the next player still in the game, the
// blinds go in (heads up the button is the small blind), the player under the
// gun can straddle if there are four or more of you, and everyone gets two
// cards, one at a time starting left of the button
function pkStartHand(T, wantsStraddle) {
  T.hand++;
  T.ev = [];
  T.over = false;
  const B = T.blinds = pkBlinds(T);
  T.seats.forEach(s => Object.assign(s, { cards: null, folded: s.out, allIn: false, bet: 0, total: 0, acted: -1, need: false, won: 0, vol: 0, shown: false, foldedPre: false }));
  T.seven = null;
  Object.assign(T, { board: [], pot: 0, bet: B.bb, lastRaise: B.bb, raises: 0, fullId: 0, street: 'preflop', aggressor: -1, prevAggressor: -1, straddle: -1 });
  const live = pkLive(T);
  if (T.button < 0 || T.seats[T.button].out) T.button = T.button < 0 ? live[(Math.random() * live.length) | 0].i : pkNext(T, T.button);
  else T.button = pkNext(T, T.button);
  const heads = live.length === 2;
  T.sb = heads ? T.button : pkNext(T, T.button);
  T.bb = pkNext(T, T.sb);
  T.ev.push({ t: 'hand', hand: T.hand, button: T.button, sb: T.sb, bb: T.bb, blinds: B, stacks: T.seats.map(s => s.stack), levelUp: PK.LEVEL_HANDS > 0 && T.hand > 1 && (T.hand - 1) % PK.LEVEL_HANDS === 0 });
  T.ev.push({ t: 'post', seat: T.sb, amount: pkPut(T, T.seats[T.sb], B.sb), kind: 'sb' });
  T.ev.push({ t: 'post', seat: T.bb, amount: pkPut(T, T.seats[T.bb], B.bb), kind: 'bb' });
  let first = pkNext(T, T.bb);
  if (live.length >= 4 && T.seats[first].stack > B.straddle * 2 && wantsStraddle && wantsStraddle(first, T)) {
    T.straddle = first;
    T.ev.push({ t: 'post', seat: first, amount: pkPut(T, T.seats[first], B.straddle), kind: 'straddle' });
    T.bet = B.straddle;
    T.lastRaise = B.straddle;
    first = pkNext(T, first);
  }
  T.deck = pkShuffle([...Array(52).keys()]);
  const order = [];
  for (let k = 0; k < 6; k++) { const s = T.seats[(T.button + 1 + k) % 6]; if (!s.out) order.push(s.i); }
  order.forEach(i => { T.seats[i].cards = [T.deck.pop()]; });
  order.forEach(i => { T.seats[i].cards.push(T.deck.pop()); });
  T.ev.push({ t: 'deal', order });
  T.first = first;
  T.seats.forEach(s => { s.need = pkCanAct(s); });
  if (T.ai) pkAiHandStart(T);
  T.toAct = -1;
  pkAdvance(T, (first + 5) % 6);
}
// who acts next, starting after seat from
function pkAdvance(T, from) {
  if (T.seats.filter(pkInHand).length === 1) { pkEndStreet(T, true); return; }
  const actors = T.seats.filter(pkCanAct).length;
  for (let k = 1; k <= 6; k++) {
    const s = T.seats[(from + k) % 6];
    if (!pkCanAct(s)) continue;
    const facing = s.bet < T.bet;
    if (!s.need && !facing) continue;
    // (alone with chips against players who are all in, and nothing to call:
    // nothing left to decide)
    if (actors === 1 && !facing) continue;
    T.toAct = s.i;
    return;
  }
  T.toAct = -1;
  pkEndStreet(T, false);
}
// what the player to act may do
function pkLegal(T, seat = T.toAct) {
  const s = T.seats[seat], toCall = Math.max(0, T.bet - s.bet), all = s.bet + s.stack;
  const others = T.seats.some(o => o.i !== seat && pkCanAct(o));
  const reopened = s.acted !== T.fullId;
  const canRaise = all > T.bet && others && reopened;
  const minTo = Math.min(all, T.bet + T.lastRaise);
  return { toCall: Math.min(toCall, s.stack), canCheck: toCall === 0, canRaise, minTo, maxTo: all, bet: T.bet, pot: pkPotNow(T), isBet: T.bet === 0 };
}
// someone does something. a = { type: fold, check, call or raise, to }. a
// raise is to a total for this street; anything at or over the stack is all
// in. a raise that's smaller than the last one (only possible all in) doesn't
// reopen the betting for anyone who's already acted.
function pkAct(T, seat, a) {
  const s = T.seats[seat], L = pkLegal(T, seat);
  let type = a.type;
  if (type === 'check' && !L.canCheck) type = 'call';
  if (type === 'call' && L.toCall === 0) type = 'check';
  if (type === 'raise' && !L.canRaise) type = L.toCall ? 'call' : 'check';
  const before = { pot: pkPotNow(T), toCall: L.toCall, level: T.raises, street: T.street, bet: T.bet, mine: s.bet };
  if (type === 'fold') {
    s.folded = true;
    if (T.street === 'preflop') s.foldedPre = true;
    T.ev.push({ t: 'act', seat, kind: 'fold' });
  } else if (type === 'check') {
    T.ev.push({ t: 'act', seat, kind: 'check' });
  } else if (type === 'call') {
    const amt = pkPut(T, s, L.toCall);
    if (T.street === 'preflop') s.vol = 1;
    T.ev.push({ t: 'act', seat, kind: s.allIn ? 'allin' : 'call', amount: amt, to: s.bet, stack: s.stack });
  } else {
    const to = Math.max(L.minTo, Math.min(L.maxTo, Math.round(a.to)));
    const size = to - T.bet, full = size >= T.lastRaise;
    const wasBet = T.bet === 0, put = pkPut(T, s, to - s.bet);
    if (T.street === 'preflop') s.vol = 2;
    if (full) {
      T.lastRaise = size;
      T.fullId++;
      T.raises++;
      T.aggressor = seat;
      T.seats.forEach(o => { if (o.i !== seat && pkCanAct(o)) o.need = true; });
    } else T.seats.forEach(o => { if (o.i !== seat && pkCanAct(o) && o.bet < to) o.need = true; });
    T.bet = Math.max(T.bet, to);
    T.ev.push({ t: 'act', seat, kind: s.allIn ? 'allin' : wasBet ? 'bet' : 'raise', amount: put, to: s.bet, stack: s.stack, full });
  }
  s.need = false;
  s.acted = T.fullId;
  if (T.ai) pkAiSaw(T, seat, type === 'raise' ? 'raise' : type, before);
  pkAdvance(T, seat);
}
// the end of a betting round: an uncalled bet comes back, the bets go in the
// pot, and the next card comes, or everyone left is all in and the board runs
// out, or it's the river and it's showdown. lone means everyone else folded.
function pkEndStreet(T, lone) {
  const bets = T.seats.map(s => s.bet).sort((x, y) => y - x);
  if (bets[0] > bets[1]) {
    const top = T.seats.find(s => s.bet === bets[0]), back = bets[0] - bets[1];
    top.bet -= back; top.stack += back; top.total -= back;
    if (top.stack > 0) top.allIn = false;
    T.ev.push({ t: 'refund', seat: top.i, amount: back });
  }
  const sum = T.seats.reduce((n, s) => n + s.bet, 0);
  T.pot += sum;
  T.seats.forEach(s => { s.bet = 0; });
  if (sum) T.ev.push({ t: 'collect', pot: T.pot });
  const inH = T.seats.filter(pkInHand);
  if (lone || inH.length === 1) { pkAward(T, false); return; }
  const actors = inH.filter(s => !s.allIn);
  if (T.street === 'river') { pkShowdown(T); return; }
  if (actors.length <= 1) {
    // everyone's in: cards on their backs, and the rest of the board
    if (!T.runout) {
      T.runout = true;
      T.ev.push({ t: 'runout', seats: inH.map(s => s.i) });
      inH.forEach(s => { if (!s.shown) { s.shown = true; T.ev.push({ t: 'reveal', seat: s.i, cards: s.cards.slice() }); } });
    }
    pkNextStreet(T);
    pkEndStreet(T, false);
    return;
  }
  pkNextStreet(T);
  T.seats.forEach(s => { s.need = pkCanAct(s); s.acted = -1; });
  pkAdvance(T, T.button);
}
function pkNextStreet(T) {
  T.prevAggressor = T.aggressor;
  T.aggressor = -1;
  T.deck.pop();
  const add = T.street === 'preflop' ? 3 : 1;
  const cards = [];
  for (let k = 0; k < add; k++) cards.push(T.deck.pop());
  T.board.push(...cards);
  T.street = { preflop: 'flop', flop: 'turn', turn: 'river' }[T.street];
  Object.assign(T, { bet: 0, lastRaise: T.blinds.bb, raises: 0, fullId: 0 });
  T.ev.push({ t: 'board', street: T.street, cards, board: T.board.slice() });
  if (T.ai) pkAiStreet(T);
}
// side pots from what everyone put in: a layer for each different amount an
// all in player is in for. folded players' chips count towards the pots but
// they can't win any of it.
function pkPots(T) {
  const inH = T.seats.filter(pkInHand), levels = [...new Set(inH.map(s => s.total))].sort((a, b) => a - b), pots = [];
  let prev = 0;
  levels.forEach(L => {
    const amount = T.seats.reduce((n, s) => n + Math.max(0, Math.min(s.total, L) - prev), 0);
    if (amount > 0) pots.push({ amount, elig: inH.filter(s => s.total >= L).map(s => s.i) });
    prev = L;
  });
  // (anything put in past the biggest live stack would have come back as an
  // uncalled bet already, but just in case, it goes in the last pot)
  const extra = T.seats.reduce((n, s) => n + Math.max(0, s.total - prev), 0);
  if (extra && pots.length) pots[pots.length - 1].amount += extra;
  return pots;
}
// showdown: whoever bet or raised last on the river shows first (or the first
// player left of the button if it was checked down), then everyone round from
// them, and every pot goes to its best hand. odd chips go to the first winner
// left of the button.
function pkShowdown(T) {
  const inH = T.seats.filter(pkInHand);
  const start = T.aggressor >= 0 && pkInHand(T.seats[T.aggressor]) ? T.aggressor : pkNext(T, T.button, pkInHand);
  const order = [];
  for (let k = 0; k < 6; k++) { const s = T.seats[(start + k) % 6]; if (pkInHand(s)) order.push(s); }
  T.ev.push({ t: 'showdown', order: order.map(s => s.i) });
  order.forEach(s => {
    s.value = pkEval2(s.cards[0], s.cards[1], T.board);
    if (!s.shown) { s.shown = true; T.ev.push({ t: 'reveal', seat: s.i, cards: s.cards.slice() }); }
  });
  pkAward(T, true, inH);
}
function pkAward(T, showdown, inH) {
  const pots = showdown ? pkPots(T) : [{ amount: T.pot, elig: T.seats.filter(pkInHand).map(s => s.i) }];
  let mainWin = [];
  pots.forEach((p, k) => {
    const el = p.elig.map(i => T.seats[i]);
    let best = -1;
    el.forEach(s => { if (showdown && s.value > best) best = s.value; });
    const win = showdown ? el.filter(s => s.value === best) : el;
    const each = Math.floor(p.amount / win.length), share = win.map(() => each);
    let odd = p.amount - each * win.length;
    for (let k2 = 1; k2 <= 6 && odd > 0; k2++) {
      const j = win.indexOf(T.seats[(T.button + k2) % 6]);
      if (j >= 0) { share[j]++; odd--; }
    }
    if (k === 0) mainWin = win;
    win.forEach((s, j) => {
      s.stack += share[j]; s.won += share[j];
      T.ev.push({ t: 'win', seat: s.i, amount: share[j], pot: k, side: k > 0, value: showdown ? s.value : null, name: showdown ? pkHandName(s.value) : null, split: win.length > 1 });
    });
  });
  T.pot = 0;
  T.over = true;
  T.toAct = -1;
  T.runout = false;
  if (PK.SEVEN_DEUCE && mainWin.length === 1 && pkIs72(mainWin[0].cards)) {
    const w = mainWin[0], paid = [];
    if (!w.shown) { w.shown = true; T.ev.push({ t: 'reveal', seat: w.i, cards: w.cards.slice(), seven: true }); }
    T.seats.forEach(o => {
      if (o.i === w.i || o.out) return;
      const n = Math.min(PK.SEVEN_DEUCE, o.stack);
      if (n <= 0) return;
      o.stack -= n; w.stack += n; w.won += n;
      paid.push([o.i, n]);
    });
    T.seven = { seat: w.i, paid };
    T.ev.push({ t: 'seven', seat: w.i, paid, total: paid.reduce((a, b) => a + b[1], 0) });
  }
  const busted = [];
  T.seats.forEach(s => { if (!s.out && s.stack <= 0) { s.out = true; busted.push(s.i); T.ev.push({ t: 'bust', seat: s.i }); } });
  if (T.ai) pkAiHandEnd(T, showdown, busted);
  T.ev.push({ t: 'end', showdown });
}

// the players' brains. each has a personality first and a skill second (alex:
// personalities take precedence): the same reading of ranges and odds sits
// under all five, and their personalities bend what they do with it.
//
// ranges: everyone keeps a range for everyone else, a weight on every combo,
// starting even and squeezed by every action, on how likely each combo is to
// have done that. there are two copies. the standard one assumes a solid,
// textbook player, and it's the only one ace uses: she plays her charts and
// her frequencies and never adapts (alex: she follows gto too religiously, so
// crazy plays get through her). the adaptive one stretches or shrinks the
// thresholds by how loose and aggressive each player has actually been lately,
// so the others start calling a tilted brutus lighter, and calling you lighter
// if you've been splashing around.
const PK_PERSONA = {
  you: { name: 'You' },
  brutus: { skill: 0.05, loose: 1.05, aggro: 1.3, bluff: 1.35, cr: 2.4, callAdj: 0, slow: 0, wildSize: 0.32, straddle: 0.08 },
  neville: { skill: 0.05, loose: 0.6, aggro: 0.45, bluff: 0.03, cr: 0.1, callAdj: -0.08, slow: 0.3, wildSize: 0, straddle: 0 },
  ace: { skill: 0.015, loose: 1, aggro: 1, bluff: 1, cr: 1, callAdj: 0, slow: 0.15, wildSize: 0, straddle: 0, gto: true },
  // ace against the miners: still precise, but reading them and leaning on
  // their leaks instead of balancing (pkAceTarget picks the leak)
  aceExploit: { skill: 0.015, loose: 1.2, aggro: 1.1, bluff: 1, cr: 0.9, callAdj: 0, slow: 0.1, wildSize: 0, straddle: 0, exploit: true },
  brock: { skill: 0.06, loose: 1.25, aggro: 1.2, bluff: 1.2, cr: 1.2, callAdj: 0.02, slow: 0.1, wildSize: 0.08, straddle: 0.12 },
  sparks: { skill: 0.035, loose: 1.05, aggro: 1.05, bluff: 1.05, cr: 1.1, callAdj: 0, slow: 0.1, wildSize: 0.05, straddle: 0.05 }
};
// how wide a solid player opens, by how many players are still to act behind
// them (the button has two, the cutoff three and so on)
const PK_OPEN = [0.9, 0.42, 0.44, 0.28, 0.2, 0.155, 0.14];
function pkMood() {
  return {
    brutus: { tilt: false, losses: 0, wins: 0, folds: 0, quiet: 0 },
    neville: { comfort: [0, 0, 0, 0, 0, 0], read: { l: 1, b: 1 } },
    ace: { respect: 0, read: { l: 1, b: 1 } },
    brock: { grudge: 0, target: false },
    sparks: { wild: true, losses: 0, read: { l: 1, b: 1 } }
  };
}
// a saved mood from an older game, filled in with anything it's missing
function pkMoodFix(m) {
  const d = pkMood();
  Object.keys(d).forEach(k => { d[k] = Object.assign(d[k], m && m[k]); });
  if (!Array.isArray(d.neville.comfort) || d.neville.comfort.length !== 6) d.neville.comfort = [0, 0, 0, 0, 0, 0];
  return d;
}
// the bots' state for a game: moods (kept between hands), what they've seen
// everyone do lately (for the adaptive ranges), and this hand's ranges
function pkAiInit(T, mood) {
  T.ai = {
    mood: pkMoodFix(mood),
    stats: T.seats.map(() => ({ vpip: 0.24, pfr: 0.17, agg: 0.4, ftb: 0.42, n: 0 })),
    std: [], adp: [], str: null, lastSaw: [], hand: {}, results: null
  };
}
function pkAiHandStart(T) {
  const A = T.ai;
  A.std = T.seats.map(() => new Float32Array(1326).fill(1));
  A.adp = T.seats.map(() => new Float32Array(1326).fill(1));
  A.str = pkStrengths([]);
  A.hand = { betThis: [], postAgg: T.seats.map(() => 0), postAct: T.seats.map(() => 0), faced: T.seats.map(() => 0), folded: T.seats.map(() => 0), checked: T.seats.map(() => false), brockTarget: false, startStacks: T.seats.map(s => s.stack + s.total) };
  A.mood.brock.target = false;
}
function pkAiStreet(T) {
  const A = T.ai;
  A.str = pkStrengths(T.board);
  A.hand.checked = T.seats.map(() => false);
}
// what a seat's play has looked like lately, as multipliers on a solid player's
// thresholds (1 is solid, 2 is twice as loose)
function pkEst(T, seat, std) {
  if (std) return { l: 1, a: 1, b: 1, f: 1 };
  const st = T.ai.stats[seat];
  return { l: clampN(st.vpip / 0.24, 0.45, 3.2), a: clampN(st.pfr / 0.17, 0.4, 3.6), b: clampN(st.agg / 0.4, 0.4, 2.2), f: clampN(st.ftb / 0.42, 0.5, 3) };
}
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
// how many players still act after seat in this preflop round
function pkBehind(T, seat) {
  let n = 0;
  for (let k = 1; k < 6; k++) {
    const s = T.seats[(seat + k) % 6];
    if (s.i === T.first) break;
    if (pkCanAct(s)) n++;
  }
  return n;
}
// in position: nobody still in the hand acts after you on this street
function pkInPosition(T, seat) {
  for (let k = 1; k < 6; k++) {
    const s = T.seats[(T.button + k) % 6];
    if (s.i === seat) {
      for (let j = k + 1; j <= 6; j++) if (pkCanAct(T.seats[(T.button + j) % 6]) && (T.button + j) % 6 !== seat) return false;
      return true;
    }
  }
  return true;
}
// squeezing a range after an action. preflop it's by where the combo sits in
// the starting hand order; after the flop it's by its strength on the board.
function pkPreLikelihood(p, kind, level, behind, est) {
  const open = Math.min(0.95, PK_OPEN[Math.min(6, behind)] * est.a);
  const thr = [open, 0.07 * est.a, 0.03 * Math.pow(est.a, 1.2), 0.014 * Math.pow(est.a, 1.3)][Math.min(level, 3)];
  if (kind === 'raise') return Math.max(pkSig((thr - p) / 0.02), level >= 1 && p > 0.12 && p < 0.4 ? 0.14 * est.b : 0);
  if (kind === 'call') {
    if (level === 0) return 0.12 + 0.88 * pkSig((0.6 * est.l - p) / 0.06) * (1 - 0.6 * pkSig((open * 0.5 - p) / 0.02));
    const width = (0.15 * est.l) / level;
    return pkSig((thr + width - p) / 0.04) * (1 - 0.65 * pkSig((thr * 0.5 - p) / 0.01));
  }
  if (kind === 'check') return 1 - 0.8 * pkSig((0.12 - p) / 0.02);
  return 1;
}
function pkPostLikelihood(se, d, kind, frac, street, est, back) {
  if (kind === 'raise' || kind === 'bet') {
    const vT = 0.6 + 0.09 * Math.min(frac, 2) + (kind === 'raise' ? 0.12 : 0) + (street === 'river' ? 0.05 : 0);
    const bluff = est.b * (d >= 2 ? 0.55 : d === 1 ? 0.25 : 0.12) * (street === 'river' ? 0.6 : 1);
    return Math.max(pkSig((se - vT) / 0.06), bluff * (1 - se));
  }
  if (kind === 'call') {
    const cT = 0.32 + 0.14 * Math.min(frac, 2) - 0.05 * (est.l - 1);
    return Math.max(pkSig((se - cT) / 0.08) * (1 - 0.45 * pkSig((se - 0.94) / 0.02)), d >= 2 ? 0.6 : 0);
  }
  if (kind === 'check') return 1 - (back ? 0.62 : 0.3) * pkSig((se - 0.82) / 0.05);
  return 1;
}
// a bet or raise, read the way a solver builds one: the value part is every
// combo strong enough for the size, and the bluffs are added on top in the
// share that keeps the bet balanced (bluffs to value of b / (1 + b) for a bet of
// b pots on the river, more on earlier streets where bluffs are draws with
// equity of their own). bluffs are draws first, then the weakest hands; middling
// hands hardly ever bluff. a check raise is weighted a bit more to value, and a
// player who's been aggressive lately (est.b) gets more bluffs in their range.
// the old version gave every weak combo a flat chance of betting, so after a
// couple of checks and a big raise most of the range still read as air.
function pkPolarSqueeze(R, S, kind, frac, street, est, checkRaise) {
  const vT = 0.62 + 0.07 * Math.min(frac, 2) + (kind === 'raise' ? 0.1 : 0) + (checkRaise ? 0.04 : 0) + (street === 'river' ? 0.04 : 0);
  const wv = new Float32Array(1326), wb = new Float32Array(1326);
  let V = 0, B = 0;
  for (let i = 0; i < 1326; i++) {
    if (!(R[i] > 0) || !S.ok[i]) continue;
    const se = S.se[i], d = street === 'river' ? 0 : S.draw[i];
    wv[i] = pkSig((se - vT) / 0.05);
    // (on the flop and turn the bluffs are draws, with only a little pure air;
    // on the river there are no draws left, so it's the weakest hands)
    const air = street === 'river' ? 0.35 : street === 'turn' ? 0.06 : 0.14;
    wb[i] = (1 - wv[i]) * (d >= 2 ? 1 : d === 1 ? 0.45 : se < 0.45 ? air : air * 0.15);
    V += R[i] * wv[i]; B += R[i] * wb[i];
  }
  const b = Math.min(3, Math.max(0.2, frac));
  const ratio = (b / (1 + b)) * ({ flop: 1.7, turn: 1.25, river: 1 }[street] || 1) * (checkRaise ? 0.75 : 1) * est.b;
  // (never more bluffs than there are hands to bluff with)
  const k = B > 0 ? Math.min(1, (ratio * V) / B) : 0;
  for (let i = 0; i < 1326; i++) if (R[i] > 0 && S.ok[i]) R[i] *= Math.max(0.003, wv[i] + k * wb[i]);
}
// every action narrows that player's ranges in everyone's eyes
function pkAiSaw(T, seat, kind, before) {
  const A = T.ai;
  if (before.street !== 'preflop' && before.toCall > 0) { A.hand.faced[seat]++; if (kind === 'fold') A.hand.folded[seat]++; }
  if (kind === 'fold') return;
  if (kind === 'check' && T.street !== 'preflop') A.hand.checked[seat] = true;
  const frac = before.pot ? Math.max(0, (T.seats[seat].bet - before.mine) / before.pot) : 1;
  [true, false].forEach(std => {
    // (ace's textbook ranges for you bend to what you've shown her)
    const r = A.mood.ace.read;
    const R = std ? A.std[seat] : A.adp[seat], est = std && seat === 0 ? { l: r.l, a: r.b, b: r.b, f: 1 } : pkEst(T, seat, std);
    if (before.street === 'preflop') {
      const behind = pkBehind(T, seat);
      for (let i = 0; i < 1326; i++) if (R[i] > 0) R[i] *= Math.max(0.01, pkPreLikelihood(PK_CPCT[i], kind, before.level, behind, est));
    } else {
      const S = A.str, k = kind === 'raise' && before.bet === 0 ? 'bet' : kind;
      if (k === 'bet' || k === 'raise') pkPolarSqueeze(R, S, k, frac, before.street, est, k === 'raise' && A.hand.checked[seat]);
      else {
        // (checking first, out of position, is what a good player does with
        // most of their range, strong hands included; checking it back when
        // they could have bet says a lot more)
        const back = k === 'check' && before.street !== 'preflop' && pkInPosition(T, seat);
        for (let i = 0; i < 1326; i++) if (R[i] > 0 && S.ok[i]) R[i] *= Math.max(0.01, pkPostLikelihood(S.se[i], S.draw[i], k, frac, before.street, est, back));
      }
    }
  });
  if (before.street !== 'preflop') {
    A.hand.postAct[seat]++;
    if (kind === 'raise') { A.hand.postAgg[seat]++; A.hand.betThis[seat] = before.street; }
  }
}
// a weighted average of strength over a range (for range advantage)
function pkRangeMean(R, S) {
  let w = 0, t = 0, nut = 0;
  for (let i = 0; i < 1326; i++) if (S.ok[i] && R[i] > 0) { w += R[i]; t += R[i] * S.s[i]; if (S.s[i] > 0.9) nut += R[i]; }
  return w ? { mean: t / w, nut: nut / w } : { mean: 0.5, nut: 0 };
}
const pkGauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const pkRound = x => Math.max(1, Math.round(x));
// a raise to a total, kept legal: at least the minimum, at most all in, and
// shoved instead if it would leave the stack nearly empty anyway
function pkRaiseTo(L, to, me) {
  to = Math.round(to);
  if (to >= L.maxTo * 0.82 || (L.maxTo - to) < L.pot * 0.25) to = L.maxTo;
  return Math.max(L.minTo, Math.min(L.maxTo, to));
}

// a decision for whoever's to act. returns { type, to, why } where why is a
// tag the game uses to pick something for them to say.
function pkDecide(T, seat) {
  const s = T.seats[seat], id = s.id, M = T.ai.mood, L = pkLegal(T, seat);
  let P = PK_PERSONA[id];
  T.ai.aceExploit = null;
  if (id === 'ace') {
    // she respects you: if you're in the hand she plays strictly by the book,
    // unless you've shown her enough of your cards to read you (two shows and
    // she starts treating you like the rest of them)
    const youIn = pkInHand(T.seats[0]);
    if (!youIn || (M.ace.shown || 0) >= 2) {
      T.ai.aceExploit = pkAceTarget(T);
      P = PK_PERSONA.aceExploit;
    }
  }
  const d = T.street === 'preflop' ? pkDecidePre(T, s, id, P, M, L) : pkDecidePost(T, s, id, P, M, L);
  // (and now and then she says so, to whoever she's going after)
  const tg = T.ai.aceExploit;
  if (tg && tg.weak && (d.type === 'raise' || d.type === 'call') && Math.random() < 0.3) d.why = 'exploit_' + T.seats[tg.seat].id;
  return d;
}
// who ace is up against and how soft they are right now: brutus on tilt,
// neville any time, brock with a grudge or out to prove himself, sparks when
// he's wild
function pkAceTarget(T) {
  const M = T.ai.mood;
  const opp = T.seats.filter(o => o.i !== 3 && pkInHand(o) && (T.street !== 'preflop' || o.vol || o.i === T.aggressor));
  const soft = o => (o.i === 1 && M.brutus.tilt) || o.i === 2 || (o.i === 4 && (M.brock.grudge >= 2 || T.ai.hand.brockTarget)) || (o.i === 5 && M.sparks.wild);
  const main = T.aggressor >= 0 && T.aggressor !== 3 ? T.seats[T.aggressor] : opp[0];
  const seat = main ? main.i : -1;
  return { seat, weak: !!main && soft(main), all: opp.length > 0 && opp.every(soft), opp: opp.map(o => o.i) };
}
// the range one player puts another on. ace knows the other miners inside
// out after all these years and reads brutus, neville and brock off how
// they've actually been playing (which is why she eats them alive), but she
// plays you and sparks strictly by the book: you're new, and sparks is too
// random for her charts. that's her weakness (alex): a crazy line from either
// of you gets read as the textbook hand it represents.
function pkRangeFor(T, me, them) {
  if (me === 3 && T.ai.aceExploit && them !== 0) return T.ai.adp[them];
  if (PK_PERSONA[T.seats[me].id].gto && (them === 0 || them === 5)) return T.ai.std[them];
  return T.ai.adp[them];
}
function pkEstFor(T, me, them) {
  const e = pkEst(T, them, PK_PERSONA[T.seats[me].id].gto && (them === 0 || them === 5));
  const r = them === 0 && T.ai.mood[T.seats[me].id] && T.ai.mood[T.seats[me].id].read;
  return r ? { ...e, l: e.l * r.l, a: e.a * r.b, b: e.b * r.b } : e;
}
// who's still in against seat, and their ranges as seat sees them
function pkOpps(T, s) {
  const opp = T.seats.filter(o => o.i !== s.i && pkInHand(o));
  return { opp, ranges: opp.map(o => pkRangeFor(T, s.i, o.i)) };
}
const pkHeroIn = T => pkInHand(T.seats[0]);
function pkDecidePre(T, s, id, P, M, L) {
  const p = pkPct(s.cards[0], s.cards[1]), level = T.raises, behind = pkBehind(T, s.i);
  const suited = (s.cards[0] & 3) === (s.cards[1] & 3), pair = (s.cards[0] >> 2) === (s.cards[1] >> 2);
  const hiR = Math.max(s.cards[0] >> 2, s.cards[1] >> 2), loR = Math.min(s.cards[0] >> 2, s.cards[1] >> 2);
  const unit = T.straddle >= 0 ? T.blinds.straddle : T.blinds.bb;
  const limpers = T.seats.filter(o => o.i !== s.i && pkInHand(o) && o.bet === T.bet && o.vol).length;
  // in position after the flop against whoever raised: closer to the button
  const postIdx = i => (i - T.button + 5) % 6;
  const stackBB = (s.stack + s.bet) / T.blinds.bb;
  const rnd = Math.random();
  const heroAggro = T.aggressor === 0;
  // brock with a grudge against you, when you're the one he's up against
  const g = id === 'brock' ? M.brock.grudge : 0;
  const tilt = id === 'brutus' && M.brutus.tilt, wild = id === 'sparks' && M.sparks.wild;
  const fold = () => (L.canCheck ? { type: 'check', why: 'check' } : { type: 'fold', why: 'fold' });
  const call = why => (L.canCheck ? { type: 'check', why: 'check' } : { type: 'call', why: why || 'call' });
  const raise = (to, why) => (L.canRaise ? { type: 'raise', to: pkRaiseTo(L, to, s), why } : call(why));
  const shove = why => raise(L.maxTo, why);
  // the price to call, and what the hand's worth against whoever's raised
  const needed = L.toCall / (L.pot + L.toCall);
  // (only against the players who've put money in: the ones still to act
  // behind will mostly fold)
  const eqVs = () => {
    const ranges = T.seats.filter(o => o.i !== s.i && pkInHand(o) && (o.vol || o.i === T.aggressor)).map(o => pkRangeFor(T, s.i, o.i));
    const eq = pkEquity(s.cards, [], ranges.length ? ranges : [null], 420);
    return clampN(eq + pkGauss() * P.skill, 0, 1);
  };
  const lastRaiseTo = T.bet;
  if (id === 'neville') return pkNevillePre(T, s, M, L, { p, level, pair, suited, hiR, unit, limpers, call, raise, lastRaiseTo });
  if (PK.SEVEN_DEUCE && pkIs72(s.cards) && level <= 1) {
    const go = { sparks: M.sparks.wild ? 0.55 : 0.1, brutus: M.brutus.tilt ? 0.35 : 0, brock: 0.15 }[id] || 0;
    if (Math.random() < go) return level === 0 && !L.canCheck ? raise(unit * 2.5 + unit * limpers, 'seven') : level === 1 ? raise(lastRaiseTo * 3, 'seven') : raise(T.bet + unit * 3, 'seven');
  }

  // the straddler or big blind with nothing to call: check, or raise the limpers
  if (level === 0 && L.canCheck) {
    const thr = 0.1 * P.aggro * (tilt ? 4 : wild ? 3.5 : 1);
    if (p < thr || (wild && rnd < 0.25) || (tilt && rnd < 0.3)) return raise(T.bet + unit * (3 + limpers) * (tilt ? 1.8 : 1), tilt ? 'tilt' : wild ? 'wild' : 'value');
    return { type: 'check', why: 'check' };
  }

  // nobody's raised yet: open, or limp, or fold
  if (level === 0) {
    let open = PK_OPEN[Math.min(6, behind)] * P.loose;
    // heads up the button opens most hands, and three handed a bit wider too
    const liveN = pkLive(T).length;
    if (liveN === 2) open = Math.min(0.95, 0.8 * P.loose);
    else if (liveN === 3) open = Math.max(open, 0.5 * P.loose);
    if (limpers) open *= 0.72;
    // steal more when the players left to act are tight (they'll fold)
    const left = T.seats.filter(o => o.i !== s.i && pkCanAct(o) && !o.vol);
    if (left.length && id !== 'neville') {
      const tight = left.reduce((n, o) => n + clampN(pkEstFor(T, s.i, o.i).l, 0.5, 1.5), 0) / left.length;
      open *= 1 + 0.45 * (1 - tight);
    }
    let size = unit * (behind === 1 && T.sb === s.i ? 3 : 2.5) + unit * limpers;
    if (tilt) { open = 0.55; size = unit * (5 + Math.random() * 4) + unit * limpers; }
    if (wild) { open = 0.62; if (rnd < 0.3) size = unit * (4 + Math.random() * 3); }
    if (P.exploit) {
      const soft = i => (i === 1 && M.brutus.tilt) || i === 2 || (i === 5 && M.sparks.wild);
      if (T.seats.some(o => o.i !== s.i && pkCanAct(o) && !o.vol && soft(o.i))) open *= 1.3;
      if (limpers && T.seats.some(o => o.i === 2 && o.vol && pkInHand(o))) { open = Math.max(open, 0.38); size += unit; }
    }
    if (id === 'ace') {
      // a mixed strategy at the edge of the range, like a solver: hands just
      // outside it open some of the time
      if (p < open || (p < open * 1.18 && rnd < (open * 1.18 - p) / (open * 0.18) * 0.5)) return raise(size, 'open');
      return fold();
    }
    if (p < open) return raise(size, tilt ? 'tilt' : wild ? 'wild' : 'open');
    if (wild && p < 0.8 && rnd < 0.5) return call('wildcall');
    if (limpers && p < open * 1.6 && (pair || suited)) return call('limp');
    return fold();
  }

  // facing a raise (or more). work out how big the raises have been and who
  // made the last one
  const agg = T.seats[T.aggressor >= 0 ? T.aggressor : T.bb];
  const ip = postIdx(s.i) > postIdx(agg.i);
  const vsHero = T.aggressor === 0;
  const callers = T.seats.filter(o => o.i !== s.i && o.i !== agg.i && pkInHand(o) && o.bet === T.bet).length;
  const aggEst = pkEstFor(T, s.i, agg.i);
  const commit = L.toCall / (s.stack + s.bet);

  // brutus on tilt: crazy raises before the flop, and he barely folds
  if (tilt) {
    if (level <= 1 && p < 0.42) return raise(lastRaiseTo * (3.2 + Math.random() * 2) + L.toCall * callers, 'tilt');
    if (level >= 2 && (p < 0.3 || rnd < 0.28)) return shove('tilt');
    if (p < 0.6 && commit < 0.35) return call('tilt');
    if (level >= 2 && p < 0.45 && commit < 0.6) return call('tilt');
    return fold();
  }
  // sparks while he's wild: he can't say no before the flop
  if (wild) {
    if (level >= 2 && (p < 0.18 || rnd < 0.09)) return shove(p < 0.18 ? 'wildvalue' : 'wildshove');
    if (level === 1 && (p < 0.08 || (p < 0.55 && rnd < 0.28))) return raise(lastRaiseTo * 3 + L.toCall * callers, p < 0.08 ? 'value' : 'wild3');
    if (level >= 2 && p < 0.3 && rnd < 0.35) return raise(lastRaiseTo * 2.3, 'wild3');
    if (p < 0.72 && commit < 0.18) return call('wildcall');
    if (p < 0.3 && commit < 0.5) return call('wildcall');
    return fold();
  }
  // brock against you, once you've got under his skin: he's out to put you in
  // your place, so he cold four bets your three bets and five bets your four
  // bets, whatever he's holding
  if (id === 'brock' && g > 0 && vsHero) {
    T.ai.hand.brockTarget = true;
    if (level === 1 && rnd < Math.min(0.5, 0.11 * g) && p < 0.75) return raise(lastRaiseTo * 3.2 + L.toCall * callers, 'grudge3');
    if (level === 2 && rnd < Math.min(0.65, 0.17 * g) && p < 0.8) return raise(lastRaiseTo * 2.4, 'grudge4');
    if (level >= 3 && rnd < Math.min(0.55, 0.12 * g) && p < 0.85) return shove('grudge5');
    if (p < 0.5 + 0.05 * g && commit < 0.3 + 0.04 * g) return call('grudgecall');
  }

  // a solid player: value raises off the top of the range (wider against a
  // loose raiser), the odd bluff with hands that block the top or play well,
  // and calls when the price is right
  const looser = Math.max(1, aggEst.a * 0.85);
  const vThr = [0, 0.062, 0.03, 0.031, 0.012][Math.min(level, 4)] * P.aggro * looser * (id === 'neville' ? 0.5 : 1);
  const bluffBand = (level === 1 && ((suited && (hiR === 12 || (hiR - loR <= 2 && loR >= 3))) || (hiR === 12 && loR <= 3)))
    || (level === 2 && hiR === 12 && loR <= 3 && suited);
  const bluffP = (level === 1 ? 0.5 : level === 2 ? 0.55 : 0) * P.bluff * (id === 'neville' ? 0 : 1);
  const sizeUp = level === 1 ? (ip ? 3 : 3.8) : level === 2 ? 2.3 : 10;
  const raiseTo = level >= 3 || stackBB < 40 ? L.maxTo : lastRaiseTo * sizeUp + L.toCall * callers;
  if (p < vThr) {
    // ace mixes in a call now and then with the top so she's never only raising it
    if (P.gto && level <= 2 && p > 0.01 && rnd < 0.18) return call('trap');
    return raise(raiseTo, level >= 3 ? 'jam' : 'value');
  }
  if (level <= 2 && bluffBand && rnd < bluffP) return raise(raiseTo, 'bluff3');
  // calling: the hand has to have the equity for the price, a bit more out of
  // position (it'll be harder to realise), and big commitments get looked at
  // harder
  if (L.toCall === 0) return { type: 'check', why: 'check' };
  const eq = eqVs();
  // (cold calling from outside the blinds is a leak against good players, so
  // it needs a bit more; the big blind is getting a discount already)
  const blind = s.i === T.bb || s.i === T.sb || s.i === T.straddle;
  const real = (ip ? 0.9 : 0.76) - 0.04 * callers - (blind || level >= 2 ? 0 : 0.05) + (pair || suited ? 0.05 : 0) * (stackBB > 60 && level <= 1 ? 1 : 0);
  let margin = P.callAdj + (commit > 0.4 ? 0.02 : 0);
  if (id === 'brock') margin += 0.015 + 0.02 * g;
  if (P.exploit && T.ai.aceExploit && T.ai.aceExploit.weak && T.ai.aceExploit.seat !== 2) margin += 0.04;
  if (P.exploit && agg.i === 2) margin -= 0.04;
  if (eq * real + margin >= needed) return call(level >= 3 ? 'calljam' : 'call');
  return fold();
}

// neville is a nervous beginner (alex): he plays on fear, not on the maths.
// before the flop he limps and calls a lot of hands he likes the look of and
// only raises his very best, small. what makes him fold is the size of a
// raise, not his cards: an open bigger than about three and a half big blinds,
// or any three bet, and he lets go of hands he'd happily call smaller. he's
// jumpier still against you and ace, tighter against anyone who's been beating
// him, and looser against anyone he's been beating (comfort).
function pkNevillePre(T, s, M, L, h) {
  const { p, level, pair, suited, hiR, unit, limpers, call, raise, lastRaiseTo } = h;
  const rnd = Math.random();
  const nope = why => (L.canCheck ? { type: 'check', why: 'check' } : { type: 'fold', why });
  if (level === 0) {
    if (L.canCheck) return p < 0.035 ? raise(T.bet + unit * 2 * (1 + limpers), 'raise') : { type: 'check', why: 'check' };
    if (p < 0.06) return raise(unit * 2 + unit * limpers, 'raise');
    if (p < 0.36 || pair || (suited && hiR >= 8) || (hiR >= 10 && p < 0.5)) return call('limp');
    return nope('fold');
  }
  const agg = T.aggressor >= 0 ? T.aggressor : T.bb;
  const comfort = M.neville.comfort[agg] || 0, jumpy = agg === 0 || agg === 3 ? 0.82 : 1;
  const big = level >= 2 || T.bet / T.blinds.bb > 3.5;
  const commit = L.toCall / (s.stack + s.bet);
  if (level === 1) {
    if (p < 0.02 && rnd < 0.6) return raise(lastRaiseTo * 2.4, 'raise');
    const width = (big ? 0.07 : 0.3) * (1 + 0.5 * comfort) * jumpy;
    if (p < width && commit < 0.3) return call('call');
    return nope(p < 0.3 ? 'scaredfold' : 'fold');
  }
  // a three bet or more: only the very top goes on, and aces get it in
  if (p < 0.008) return rnd < 0.5 && L.toCall < s.stack * 0.5 ? call('call') : raise(L.maxTo, 'allin');
  if (p < 0.03 * (1 + 0.5 * comfort) * jumpy && commit < 0.35) return call('call');
  return nope(p < 0.06 ? 'scaredfold' : 'fold');
}

function pkDecidePost(T, s, id, P, M, L) {
  const A = T.ai, S = A.str, board = T.board, street = T.street, rnd = Math.random();
  const { opp, ranges } = pkOpps(T, s);
  const nOpp = opp.length, tilt = id === 'brutus' && M.brutus.tilt, wild = id === 'sparks' && M.sparks.wild;
  const g = id === 'brock' ? M.brock.grudge : 0;
  const vsHero = opp.some(o => o.i === 0);
  // brock stays out to prove a point for the whole hand once he's gone after
  // you, even if you fold and someone else is left holding the real goods
  const target = id === 'brock' && g > 0 && (vsHero || A.hand.brockTarget);
  if (target) A.hand.brockTarget = true;
  const ci = pkComboIndex(s.cards[0], s.cards[1]);
  const mySe = S.se[ci], myS = S.s[ci], draw = S.draw[ci];
  const myVal = pkEval2(s.cards[0], s.cards[1], board);
  let eq = pkEquity(s.cards, board, ranges, street === 'river' ? 520 : 680);
  eq = clampN(eq + pkGauss() * P.skill, 0, 1);
  // neville overrates a decent ace on a paired, busy board, and top pair in
  // general: he'll call down with them when he should let go
  let perceived = eq;
  const boardPaired = new Set(board.map(pkRank)).size < board.length;
  const flushy = [0, 1, 2, 3].some(su => board.filter(c => pkSuit(c) === su).length >= 3);
  const wet = flushy || [0, 1, 2, 3].some(su => board.filter(c => pkSuit(c) === su).length === 2) || pkStraightOuts(board.reduce((m, c) => m | (1 << pkRank(c)), 0)) >= 2;
  const topBoard = Math.max(...board.map(pkRank));
  const hasAce = s.cards.some(c => pkRank(c) === 12), kick = Math.min(...s.cards.map(pkRank));
  const topPair = (myVal >> 20) === 1 && ((myVal >> 16) & 15) === topBoard;
  const pot = L.pot, toCall = L.toCall, needed = toCall / (pot + toCall);
  const ip = pkInPosition(T, s.i);
  const eff = Math.min(s.stack + s.bet, Math.max(...opp.map(o => o.stack + o.bet)));
  const spr = eff / Math.max(1, pot);
  // range advantage: is this board better for my range than for theirs?
  // (brutus bluffs when it is)
  const myR = pkRangeMean(A.adp[s.i], S);
  const theirR = opp.map(o => pkRangeMean(pkRangeFor(T, s.i, o.i), S));
  const adv = myR.mean - Math.max(...theirR.map(r => r.mean)) + (myR.nut - Math.max(...theirR.map(r => r.nut))) * 0.5;
  const wasAggressor = T.prevAggressor === s.i;
  // where this hand sits in my own range (the fraction of it that's stronger)
  const own = A.adp[s.i];
  let ownW = 0, ownAbove = 0;
  for (let i = 0; i < 1326; i++) if (S.ok[i] && own[i] > 0) { ownW += own[i]; if (S.se[i] > mySe) ownAbove += own[i]; }
  const rank = ownW ? ownAbove / ownW : 0.5;
  const fold = why => (L.canCheck ? { type: 'check', why: 'check' } : { type: 'fold', why: why || 'fold' });
  const check = why => ({ type: 'check', why: why || 'check' });
  const call = why => (L.canCheck ? check() : { type: 'call', why: why || 'call' });
  const bet = (frac, why) => {
    if (!L.canRaise) return L.canCheck ? check() : call(why);
    const to = L.isBet ? pot * frac : L.bet + (pot + toCall) * frac + toCall * 0;
    return { type: 'raise', to: pkRaiseTo(L, Math.max(L.minTo, to)), why };
  };
  const raiseTo = (mult, why) => {
    if (!L.canRaise) return call(why);
    return { type: 'raise', to: pkRaiseTo(L, Math.max(L.minTo, L.bet * mult + (pot - L.bet) * 0.4)), why };
  };
  // sizes, by who they are and what the board looks like
  const sizeFor = kind => {
    if (id === 'neville') return 0.5;
    if (X === 'neville') return kind === 'value' ? 0.4 : street === 'flop' ? 0.66 : 1.1;
    if (X && kind === 'value') return 0.8;
    if (id === 'brutus' && kind === 'bluff' && adv > 0 && rnd < P.wildSize * (tilt ? 1.6 : 1)) return 2 + Math.random() * 2.5;
    if (target && kind === 'bluff' && rnd < 0.45) return 1.2 + Math.random() * 1.3;
    if (P.gto) {
      const nutEdge = myR.nut - Math.max(...theirR.map(r => r.nut));
      if (street !== 'flop' && nutEdge > 0.12 && (eq > 0.85 || kind === 'bluff')) return 1.25;
      if (street === 'river') return eq > 0.85 || kind === 'bluff' ? (rnd < 0.35 ? 1.4 : 0.85) : 0.6;
      return !wet && adv > 0 ? 0.33 : wet ? 0.7 : 0.5;
    }
    if (id === 'brutus') return kind === 'value' ? 0.8 + Math.random() * 0.3 : 0.75;
    if (id === 'brock') return 0.66;
    return wet ? 0.66 : 0.5;
  };
  let valueT = 0.6 + 0.07 * (nOpp - 1) + (street === 'river' ? 0.03 : 0);
  // ace going after a leak: against neville she bets thin and small for value
  // (he calls small bets with any pair) and bluffs big, the turn most of all
  // (big bets scare him off his hand); against a tilting brutus, a cocky brock
  // or a punting sparks she bets thinner for value, hardly bluffs (they call)
  // and calls them down lighter
  const X = P.exploit && T.ai.aceExploit && T.ai.aceExploit.weak ? T.seats[T.ai.aceExploit.seat].id : null;
  if (X === 'neville') valueT -= 0.08;
  else if (X) valueT -= 0.07;

  // neville after the flop. big bets frighten him, on the turn most of all,
  // so he lets go of top pair and second pair he should call down with. small
  // bets he calls with any pair, like a beginner. and he overrates his weaker
  // strong hands: top pair on a wet board or a paired one, a straight with a
  // flush possible, a flush on a double paired board. with those he feels
  // safe, calls anything and even raises. he bets small when he likes his
  // hand, and never bluffs.
  if (id === 'neville') {
    const cat = myVal >> 20;
    const counts = {};
    board.forEach(c => { counts[pkRank(c)] = (counts[pkRank(c)] || 0) + 1; });
    const doublePaired = Object.values(counts).filter(n => n >= 2).length >= 2;
    const overrated = (topPair && (wet || boardPaired)) || (cat === 4 && flushy) || (cat === 5 && doublePaired);
    const agg = T.aggressor >= 0 && T.aggressor !== s.i ? T.aggressor : -1;
    const comfort = agg >= 0 ? M.neville.comfort[agg] || 0 : 0;
    const feel = overrated ? Math.max(eq, 0.82) : eq;
    if (L.canCheck) {
      if (feel > 0.7 && rnd < 0.75) return bet(0.4 + Math.random() * 0.15, overrated && eq < 0.7 ? 'overvalue' : 'value');
      return check();
    }
    const bf = toCall / Math.max(1, pot - toCall);
    const fear = bf >= 0.7 ? (street === 'turn' ? 0.55 : street === 'river' ? 0.72 : 0.78) : bf <= 0.5 ? 1.12 : 1;
    let f = overrated ? feel : feel * fear * (agg === 0 || agg === 3 ? 0.92 : 1);
    f *= 1 + 0.15 * comfort;
    if (bf <= 0.5 && myS > 0.45 && !overrated) f = Math.max(f, needed + 0.05);
    if ((overrated || eq > 0.86) && L.canRaise && rnd < (overrated ? 0.35 : 0.6)) return raiseTo(2.6, overrated && eq < 0.7 ? 'overvalue' : 'value');
    const nreal = (ip ? 1 : 0.9) * (street === 'river' ? 1 : 0.96);
    if (f * nreal >= needed) return call(overrated && eq * nreal < needed + 0.1 ? 'overvalue' : 'call');
    return fold(eq * nreal >= needed ? 'scaredfold' : 'fold');
  }

  if (L.canCheck) {
    // checked to us: bet for value, bluff some, check the rest
    // (ace only value bets what's genuinely strong on the board, not
    // anything that's ahead of a range she thinks is weak: a middling pair
    // under an ace wants to see a showdown cheaply, not build a pot)
    // she also asks the solver's question: if she bets, will worse hands
    // call? that's her equity against just the part of your range that would
    // call this size, and it has to be better than even
    let strongEnough = true;
    if (P.gto && perceived > valueT) {
      const cT = 0.32 + 0.14 * Math.min(sizeFor('value'), 2);
      const callers = ranges.map(R => {
        const C = new Float32Array(1326);
        for (let i = 0; i < 1326; i++) if (R[i] > 0 && S.ok[i]) C[i] = R[i] * Math.max(pkSig((S.se[i] - cT) / 0.06), S.draw[i] >= 2 && street !== 'river' ? 0.7 : 0);
        return C;
      });
      const eqCall = pkEquity(s.cards, board, callers, 420);
      strongEnough = eqCall > 0.52 || eq > 0.9;
    }
    if (perceived > valueT && strongEnough) {
      if (rnd < P.slow * (eq > 0.88 ? 1 : 0.3) && street !== 'river' && !tilt) return check('slowplay');
      return bet(sizeFor('value'), 'value');
    }
    if (id === 'neville') return check();
    // how often to bluff. ace works it out like a solver: enough bluffs to go
    // with her value bets that her bet can't be read, given the size. the
    // others start from a feel for it, lean on their personality, and bluff
    // more at anyone they've seen folding too much (neville, mostly).
    let bp;
    const size = sizeFor('bluff');
    if (P.gto && myS > 0.45 && draw < 2) return check('pot control');
    if (P.gto) {
      const R = A.adp[s.i];
      let w = 0, v = 0;
      for (let i = 0; i < 1326; i++) if (S.ok[i] && R[i] > 0) { w += R[i]; if (S.se[i] > 0.78) v += R[i]; }
      const V = w ? v / w : 0.2, ratio = street === 'river' ? size / (1 + 2 * size) : (size / (1 + 2 * size)) * 1.6;
      bp = Math.min(0.85, (V * ratio) / Math.max(0.15, 1 - V) / (1 - ratio));
      // she bluffs with her worst hands and her draws, and checks the middle
      bp *= draw >= 2 ? 1.6 : myS < 0.3 ? 1.1 : 0.25;
      if (nOpp > 1) bp *= 0.5;
    } else {
      bp = (street === 'flop' ? 0.24 : street === 'turn' ? 0.17 : 0.12) * P.bluff;
      if (wasAggressor) bp *= 1.5;
      if (draw >= 2) bp *= 1.8;
      if (nOpp > 1) bp *= 0.45;
      else bp *= pkEstFor(T, s.i, opp[0].i).f;
      if (id === 'brutus') bp *= adv > 0.03 ? 2.1 : adv < -0.03 ? 0.25 : 1;
      if (tilt) bp *= 1.8;
      if (target) bp += 0.08 * g;
      if (PK.SEVEN_DEUCE && pkIs72(s.cards)) bp = Math.min(0.85, bp * 2.5);
      if (myS > 0.45 && myS < 0.75 && street !== 'river') bp *= 0.5;
      if (X === 'neville') bp = Math.min(0.9, bp * (street === 'turn' ? 2.6 : 2));
      else if (X) bp *= 0.35;
    }
    if (rnd < bp) return bet(size, id === 'brutus' && size > 1.6 ? 'wildbluff' : target ? 'grudgebluff' : 'bluff');
    return check();
  }

  // facing a bet
  const betFrac = toCall / Math.max(1, pot - toCall);
  const real = (ip ? 1 : 0.9) * (street === 'river' ? 1 : 0.96);
  const implied = draw >= 2 && street !== 'river' && spr > 1.5 ? 0.04 : 0;
  let margin = P.callAdj;
  if (wild) margin += 0.04;
  if (tilt) margin += 0.05;
  if (X && X !== 'neville') margin += 0.06;
  // (and when neville raises, he has it)
  if (X === 'neville' && T.aggressor === 2 && T.raises >= 1 && A.hand.postAgg[2]) margin -= 0.08;
  if (target) margin += 0.05 * g;
  const raiseT = (id === 'neville' ? 0.88 : 0.8) + 0.04 * (nOpp - 1) + (street === 'river' ? 0.04 : 0);
  if (eq > raiseT && L.canRaise) {
    if (rnd < P.slow * 0.6 && street !== 'river' && !tilt && eq < 0.95) return call('slowplay');
    return raiseTo(id === 'neville' ? 2.6 : 3, 'value');
  }
  // getting it in when the stacks are short compared to the pot
  if (spr < 1.2 && eq > 0.45 && L.canRaise && id !== 'neville' && (!P.gto || rank < 0.3)) return raiseTo(10, 'commit');
  // where this hand sits in my own range, for bluff catching: against a
  // normal sized bet a decent player doesn't fold so much of their range that
  // any two cards can bet and win (the minimum defence). ace keeps to it
  // strictly. against an overbet it doesn't apply, and everyone just asks
  // whether the hand has the equity, which against the strong range a big bet
  // stands for, it usually doesn't (that's the hole in ace: bet huge at her
  // with nothing and she lays it down).
  const mdf = 1 / (1 + betFrac);
  if (P.gto) {
    // she continues with the top of her own range, as much of it as the size
    // says she has to (the minimum defence), and folds the rest, however good
    // the price looks against her read. a raise is judged the same way: her
    // range after betting twice is strong, so a pair under the top card sits
    // low in it and goes. she trims it a little against huge overbets (her
    // charts don't have enough bluffs in them there), which is the opening a
    // brave enough bluffer can use. draws with the price to continue still do.
    // against a raise (she bet and got raised) it's stricter: raising ranges
    // are heavier on value than betting ones, so she defends less of her range
    // and only with hands that really have the price, with a bit extra for
    // the river still to come (tens on a paired ace high board facing a big
    // check raise used to call here)
    const raised = !!(A.hand.betThis && A.hand.betThis[s.i] === street);
    const defend = mdf * (betFrac > 1.5 ? 0.85 : 1) * (raised ? 0.75 : 1);
    const price = raised ? needed + (street === 'river' ? 0 : 0.03) : needed * 0.8;
    if (draw >= 2 && street !== 'river' && rank < defend && Math.random() < 0.18 && L.canRaise) return raiseTo(3, 'semibluff');
    if (rank < defend && eq * real > price) return call('defend');
    if (draw >= 2 && street !== 'river' && eq * real + implied >= needed) return call('call');
    return fold('fold');
  }
  if (perceived * real + implied + margin >= needed) {
    return call(id === 'neville' && perceived > eq + 0.1 ? 'overvalue' : wild && eq * real < needed ? 'wildcall' : target && eq * real < needed ? 'grudgecall' : 'call');
  }
  if (id !== 'neville' && betFrac <= 0.9 && nOpp === 1 && rank < mdf * 0.8 && eq > needed * 0.7) return call('catch');
  // the odd raise as a bluff: brutus check raises a lot, especially with a
  // draw or when the board's his
  let crP = (draw >= 2 ? 0.12 : 0.035) * P.cr * (A.hand.checked[s.i] ? 1.5 : 0.6);
  if (id === 'brutus') crP *= adv > 0.02 ? 1.8 : 0.5;
  if (nOpp > 1) crP *= 0.4;
  else crP *= pkEstFor(T, s.i, opp[0].i).f;
  if (target) crP += 0.06 * g;
  if (L.canRaise && Math.random() < (street !== 'river' ? crP : crP * 0.4)) {
    const huge = id === 'brutus' && Math.random() < P.wildSize ? 4.5 : 3;
    return raiseTo(huge, A.hand.checked[s.i] ? 'checkraise' : 'bluffraise');
  }
  return fold(id === 'neville' ? 'scaredfold' : 'fold');
}
function pkComboIndex(a, b) {
  if (a > b) [a, b] = [b, a];
  return a * 51 - (a * (a - 1)) / 2 + (b - a - 1);
}
// whether the player under the gun straddles this hand
function pkAiStraddle(T, seat) {
  const id = T.seats[seat].id, M = T.ai.mood, P = PK_PERSONA[id];
  if (id === 'you') return false;
  let p = P.straddle;
  if (id === 'brutus' && M.brutus.tilt) p = 0.4;
  if (id === 'sparks' && M.sparks.wild) p = 0.45;
  if (id === 'brock' && M.brock.grudge >= 2) p = 0.3;
  return Math.random() < p;
}
// after a hand: update what everyone's seen of each other, and the moods.
// brutus tilts after a couple of losses and calms down after a few wins in a
// row; sparks settles down once he's lost a lot or a few in a row and goes wild
// again once he's got a big stack; brock's grudge against you grows every time
// you take a pot off him (and more when he thinks you got lucky).
function pkAiHandEnd(T, showdown, busted) {
  const A = T.ai, M = A.mood, H = A.hand;
  T.seats.forEach((s, i) => {
    if (!H.startStacks || s.out && !busted.includes(i)) return;
    const st = A.stats[i], a = 0.07;
    if (s.cards) {
      st.vpip += ((s.vol ? 1 : 0) - st.vpip) * a;
      st.pfr += ((s.vol === 2 ? 1 : 0) - st.pfr) * a;
      if (H.postAct[i]) st.agg += ((H.postAgg[i] / H.postAct[i]) - st.agg) * a * 1.5;
      if (H.faced[i]) st.ftb += ((H.folded[i] / H.faced[i]) - st.ftb) * a * 1.5;
      st.n++;
    }
  });
  const net = T.seats.map((s, i) => s.stack - H.startStacks[i]);
  const invested = T.seats.map(s => s.total);
  const res = { net, invested, winners: T.seats.filter(s => s.won > 0).map(s => s.i), showdown, busted, events: [] };
  // brutus
  const b = T.seats[1];
  if (b.cards && !b.out || busted.includes(1)) {
    const won = b.won > 0;
    const bm = M.brutus, lost = !won && b.vol && b.total > 0, foldedPre = !won && !b.vol && b.cards;
    if (won) { bm.wins++; bm.losses = 0; bm.folds = 0; }
    else if (lost) { bm.losses++; bm.wins = 0; bm.folds = 0; }
    else if (foldedPre) bm.folds = (bm.folds || 0) + 1;
    // (on tilt he only calms down by winning two hands in a row: any hand he
    // doesn't win, folded or lost, starts the count again, so a bad run can
    // keep him on tilt for the rest of the game)
    if (bm.tilt && !won && b.cards) bm.wins = 0;
    if (!bm.tilt && (bm.losses >= 3 || bm.folds >= 5)) { bm.tilt = true; bm.why = bm.folds >= 5 ? 'cardDead' : 'unlucky'; res.events.push('brutusTilt'); }
    else if (bm.tilt && bm.wins >= 2) { bm.tilt = false; bm.losses = 0; bm.wins = 0; bm.folds = 0; res.events.push('brutusCalm'); }
    if (lost && (bm.tilt || busted.includes(1))) res.events.push('brutusThrow');
  }
  // neville: losing pots to someone makes him more scared of them, winning
  // them makes him a bit braver against them, and it fades slowly
  const nv = T.seats[2], nm = M.neville;
  if (nv.cards && invested[2] >= T.blinds.bb * 2) {
    T.seats.forEach((o, j) => {
      if (j === 2 || !o.cards || invested[j] < T.blinds.bb * 2) return;
      if (net[2] < 0 && o.won > 0) nm.comfort[j] = clampN(nm.comfort[j] - 0.2, -1, 1);
      else if (net[2] > 0 && net[j] < 0) nm.comfort[j] = clampN(nm.comfort[j] + 0.15, -1, 1);
    });
  }
  nm.comfort = nm.comfort.map(c => c * 0.985);
  // sparks
  const sp = T.seats[5];
  if (!sp.out || busted.includes(5)) {
    const sm = M.sparks;
    if (net[5] < 0 && invested[5] >= T.blinds.bb * 2) sm.losses++; else if (net[5] > 0) sm.losses = 0;
    if (sm.wild && (sp.stack < PK.START * 0.7 || sm.losses >= 3)) { sm.wild = false; sm.losses = 0; res.events.push('sparksSettle'); }
    else if (!sm.wild && sp.stack >= PK.START * 1.45) { sm.wild = true; res.events.push('sparksWild'); }
  }
  // brock's grudge against you
  const bk = T.seats[4], you = T.seats[0];
  if ((bk.cards && you.cards) && invested[4] >= T.blinds.bb * 2) {
    if (net[0] > 0 && net[4] < 0) {
      let k = 1;
      if (showdown && you.shown && bk.shown && pkPct(you.cards[0], you.cards[1]) > pkPct(bk.cards[0], bk.cards[1])) k++;
      if (!showdown) k += 0.5;
      M.brock.grudge = Math.min(7, M.brock.grudge + k);
      res.events.push('brockGrudge');
    } else if (net[4] > 0 && net[0] < 0) M.brock.grudge = Math.max(0, M.brock.grudge - 0.5);
  }
  // seven deuce: if you won with it, brutus starts steaming and brock wants
  // blood, as long as they were in the hand past the first round of betting
  if (T.seven) {
    res.seven = T.seven;
    if (T.seven.seat === 0) {
      const stayed = i => T.seats[i].cards && !T.seats[i].foldedPre && T.seats[i].total > 0;
      if (stayed(1) && !M.brutus.tilt) { M.brutus.tilt = true; M.brutus.wins = 0; M.brutus.why = 'seven'; res.events.push('brutusTilt'); }
      if (stayed(4)) { M.brock.grudge = Math.min(7, M.brock.grudge + 2); res.events.push('brockSeven'); }
    }
  }
  // ace's respect for you grows when you take a pot off her
  if (net[0] > 0 && net[3] < 0 && invested[3] >= T.blinds.bb * 2) { M.ace.respect++; res.events.push('aceBeaten'); }
  A.results = res;
}
// you've shown your cards after a hand (bluff says whether it was one, lost
// is everyone who lost chips in it, folded everyone who folded). ace takes it
// to heart and bends her reads of you; sparks does too, a bit, because he
// doesn't care that much; neville gets more scared of you and learns only a
// tiny bit; brock, if he lost to you, takes it personally; and brutus, if you
// bluffed him off his hand, is that much closer to tilting.
function pkAiYouShowed(T, bluff, lost, folded) {
  const M = T.ai.mood, out = [];
  const lean = (r, k) => {
    r.b = clampN(r.b * (bluff ? 1 + 0.3 * k : 1 - 0.15 * k), 0.6, 2.4);
    r.l = clampN(r.l * (bluff ? 1 + 0.12 * k : 1 - 0.05 * k), 0.6, 2);
  };
  lean(M.ace.read, 1);
  M.ace.shown = (M.ace.shown || 0) + 1;
  lean(M.sparks.read, 0.4);
  lean(M.neville.read, 0.1);
  M.neville.comfort[0] = clampN(M.neville.comfort[0] - 0.15, -1, 1);
  if (lost.includes(4)) { M.brock.grudge = Math.min(7, M.brock.grudge + 1); out.push('brockShown'); }
  if (bluff && folded.includes(1)) {
    const bm = M.brutus;
    bm.losses++;
    out.push('brutusShown');
    if (!bm.tilt && bm.losses >= 3) { bm.tilt = true; bm.why = 'shown'; bm.wins = 0; out.push('brutusTilt'); }
  }
  return out;
}
// how weak a hand was by the end (for telling bluffs from value when it's
// shown): before the flop by where it sits in the starting hands, after it by
// how far up the made hands on the board it is
function pkWeak(cards, board) {
  if (board.length < 3) return pkPct(cards[0], cards[1]) > 0.45;
  return pkStrengths(board).s[pkComboIndex(cards[0], cards[1])] < 0.45;
}
// poker core end

// poker art start
// the miners. they're built like you (the same chibi proportions as the
// player sprite: a big head about thirteen pixels across on a short body, black
// outline, lit from the top left), and each one's look comes from who they
// are. brutus is a burly, bearded brute in a dented hard hat; neville is a
// skinny, hunched lad drowning in a helmet two sizes too big; ace has her hair
// down, round glasses and a neat teal hard hat tipped back; brock is a jock
// with a blond quiff, a letterman vest and his hat shoved back on his head; and
// sparks has spiky orange hair under a pair of welding goggles. the side seats
// (brutus and sparks) are drawn three quarters on, like your own side frames.
// their arms aren't in the sprite: they're drawn live, so they can deal,
// slam, throw and shove.
const MINER_W = 26, MINER_H = 28;
const MINER = {
  brutus: {
    skin: ['#e0a27a', '#c17f58', '#93573a'], hair: ['#4a3426', '#2e1f15'], beard: ['#3b2a1f', '#22160e'],
    hat: ['#f07a2a', '#c4561a', '#8c3a10'], cloth: ['#7a7f88', '#5a5e66', '#3e4148'], strap: ['#7a4a26', '#52301a'],
    sleeve: null, shoulders: 8.6, headTop: 4, hatKind: 'hard', lamp: true, eyes: 'small', bald: true
  },
  neville: {
    skin: ['#f3d9c0', '#dcb898', '#b48f70'], hair: ['#e8d49a', '#bfa866'], hat: ['#f6d64a', '#d4ab22', '#9a7812'],
    cloth: ['#8a9a5a', '#6a7a40', '#4a562a'], sleeve: ['#8a9a5a', '#6a7a40'], shoulders: 5, headTop: 2, hatKind: 'big', lamp: true, eyes: 'wide', tall: true
  },
  ace: {
    skin: ['#f6d2bc', '#e3ad92', '#bf8a70'], hair: ['#3a2630', '#24161e'], hat: ['#5ad0c4', '#2ea89c', '#1a7068'],
    cloth: ['#3aa6a0', '#287c78', '#1a5452'], shirt: ['#f4f2ee', '#cfcbc4'], sleeve: ['#3aa6a0', '#287c78'],
    shoulders: 6.2, headTop: 4, hatKind: 'tipped', lamp: true, eyes: 'lash', glasses: true
  },
  brock: {
    skin: ['#e8b48a', '#cc9468', '#9e6a46'], hair: ['#f6dc7a', '#d6b24a'], hat: ['#e8e4dc', '#bdb7ac', '#8a8478'],
    cloth: ['#c8322c', '#9a2420', '#6a1614'], shirt: ['#f4f2ee', '#cfcbc4'], sleeve: ['#f4f2ee', '#cfcbc4'],
    shoulders: 7.8, headTop: 4, hatKind: 'back', lamp: false, eyes: 'small'
  },
  sparks: {
    skin: ['#f6caa4', '#e0a67e', '#b67c58'], hair: ['#ff8a2a', '#d4561a'], goggle: ['#d6dbe2', '#8a929e', '#4a525e'],
    cloth: ['#3a6ad0', '#2a4ea0', '#1c3470'], stripe: '#f6c83a', sleeve: ['#3a6ad0', '#2a4ea0'],
    shoulders: 6.4, headTop: 5, hatKind: 'goggles', lamp: false, eyes: 'big', freckles: true
  }
};
// one frame of a miner: turn 0 is facing you, 1 is three quarters on facing
// right (flip it for facing left). mood picks the brows, eyes and mouth:
// idle, happy, grin, smug, angry, fume, scared, shock, sad, think. look moves
// the eyes (-1 left, 1 right, 2 down at the cards), blink shuts them, and talk
// opens the mouth.
function makeMiner(id, turn, mood = 'idle', look = 0, blink = false, talk = false) {
  const C = MINER[id], G = pixelGrid(MINER_W, MINER_H);
  const put = (x, y, c) => G.set(x, y, c);
  const cx = 12.5 + turn * 0.5, top = C.headTop, hy = top + 6.5;
  const fx = cx + turn * 1.6;
  const [sl, sm, sd] = C.skin;
  // the body: seated, shoulders to waist (the table or the chair hides the
  // rest), shoulders rounded off, lit down the left
  const by = top + 12, sw = C.shoulders;
  for (let y = by; y < MINER_H; y++) {
    const u = (y - by) / (MINER_H - by);
    const half = y === by ? sw - 1.5 : y === by + 1 ? sw - 0.5 : sw - u * (id === 'neville' ? 0.6 : 1.4);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const k = (x - (cx - half)) / (half * 2);
      put(x, y, k < 0.22 ? C.cloth[0] : k > 0.78 ? C.cloth[2] : C.cloth[1]);
    }
  }
  // what each of them wears on top
  const mid = Math.round(cx + turn * 1.2);
  if (id === 'brutus') {
    // a grey vest with brown braces over his shoulders, chest hair poking out
    // of the neck, and the buckles
    for (let y = by + 1; y < MINER_H; y++) {
      put(mid - 4, y, C.strap[0]); put(mid - 3, y, C.strap[1]);
      put(mid + 3, y, C.strap[0]); put(mid + 4, y, C.strap[1]);
    }
    [[mid - 1, by], [mid, by], [mid + 1, by], [mid, by + 1]].forEach(([x, y]) => put(x, y, C.beard[0]));
    put(mid - 4, by + 7, '#d8c070'); put(mid + 4, by + 7, '#d8c070');
  } else if (id === 'neville') {
    // a baggy jacket buttoned up wrong, a collar, and a patch on one side
    for (let y = by + 1; y < MINER_H; y++) put(mid, y, y % 3 === 0 ? '#d8d0b0' : C.cloth[2]);
    put(mid - 1, by, C.cloth[0]); put(mid - 2, by, C.cloth[0]); put(mid + 1, by, C.cloth[0]); put(mid + 2, by, C.cloth[1]);
    put(mid - 3, by + 6, '#b8a878'); put(mid - 3, by + 7, '#b8a878');
  } else if (id === 'ace') {
    // a fitted teal vest over a white collared shirt, a pen in the pocket and
    // a little gold pin
    [[-2, 0], [-1, 0], [1, 0], [2, 0], [-1, 1], [1, 1], [0, 1], [0, 2]].forEach(([dx, dy]) => put(mid + dx, by + dy, dy === 0 ? C.shirt[0] : C.shirt[1]));
    for (let y = by + 3; y < MINER_H; y++) put(mid, y, C.cloth[2]);
    put(mid + 3, by + 4, '#e04040'); put(mid + 3, by + 5, '#2a2a3a'); put(mid + 2, by + 6, C.cloth[2]); put(mid + 3, by + 6, C.cloth[2]); put(mid + 4, by + 6, C.cloth[2]);
    put(mid - 3, by + 7, '#f6e9a0');
  } else if (id === 'brock') {
    // a red letterman vest with white trim over a tee, and a big B on it
    for (let y = by; y < MINER_H; y++) { put(mid - 1, y, C.shirt[0]); put(mid, y, C.shirt[0]); put(mid + 1, y, C.shirt[1]); }
    for (let y = by; y < MINER_H; y++) { put(mid - 2, y, '#f4f2ee'); put(mid + 2, y, '#f4f2ee'); }
    const bx = mid - 6, bty = by + 3;
    [[0, 0], [1, 0], [0, 1], [2, 1], [0, 2], [1, 2], [0, 3], [2, 3], [0, 4], [1, 4]].forEach(([x, y]) => put(bx + x, bty + y, '#f4f2ee'));
  } else if (id === 'sparks') {
    // a blue jumpsuit with a yellow stripe across the chest, grease smudges,
    // and the zip
    for (let x = Math.round(cx - sw); x <= Math.round(cx + sw); x++) { if (G.get(x, by + 4)) put(x, by + 4, C.stripe); }
    for (let y = by + 1; y < MINER_H; y++) put(mid, y, y === by + 4 ? C.stripe : C.cloth[2]);
    put(mid - 3, by + 7, '#1a1a24'); put(mid - 2, by + 8, '#1a1a24'); put(mid + 3, by + 2, '#1a1a24');
  }
  // the neck (neville's is long and thin)
  const nx = Math.round(fx), thick = id === 'brutus' ? 2 : 1;
  for (let y = top + 10; y <= by; y++) for (let x = nx - thick; x <= nx + thick; x++) if (!G.get(x, y) || y < by) put(x, y, x > fx ? sd : sm);

  // the head: the back of it in hair (or skin, for brutus, who's bald under
  // the hat), then the face, lower and to the front
  const R = { x: 5.7, y: 5.5 };
  pxBlob(G, cx, hy, R.x, R.y, (dx, dy) => (C.bald ? (dx > 0.5 ? sd : dx < -0.3 && dy < -0.2 ? sl : sm) : (dx > 0.45 || dy > 0.6 ? C.hair[1] : C.hair[0])));
  // long hair hanging down either side (ace)
  if (id === 'ace') {
    for (let y = Math.round(hy - 1); y <= Math.round(hy + 9); y++) {
      const w = y > hy + 6 ? 1 : 2;
      for (let k = 0; k < w; k++) {
        put(Math.round(cx - R.x) + k - turn, y, k ? C.hair[0] : C.hair[1]);
        if (!turn || y < hy + 5) put(Math.round(cx + R.x) - k + turn, y, k ? C.hair[0] : C.hair[1]);
      }
    }
  }
  // the face
  const fr = { x: 4.4 - turn * 0.4, y: 4 };
  const fcy = hy + 1.4;
  pxBlob(G, fx, fcy, fr.x, fr.y, (dx, dy) => (dx > 0.62 ? sd : dx < -0.45 && dy < 0.3 ? sl : sm));
  // a square jaw for brock and brutus
  if (id === 'brock' || id === 'brutus') for (let x = Math.round(fx - 3); x <= Math.round(fx + 3); x++) put(x, Math.round(fcy + fr.y), x > fx + 1 ? sd : sm);
  // the hair over the forehead
  const fxr = Math.round(fx), fyr = Math.round(fcy);
  if (id === 'ace') {
    // bangs, swept to one side
    for (let x = -4; x <= 4; x++) { put(fxr + x, fyr - 3, C.hair[0]); if (x < 2) put(fxr + x, fyr - 2, x < -1 ? C.hair[1] : C.hair[0]); }
    put(fxr - 4, fyr - 1, C.hair[1]);
  } else if (id === 'neville') {
    [-3, -1, 2].forEach(x => put(fxr + x, fyr - 3, C.hair[0]));
    put(fxr - 4, fyr - 1, C.hair[1]); put(fxr + 4, fyr - 1, C.hair[1]);
  } else if (id === 'brock') {
    // the quiff, swept up off his forehead
    for (let x = -4; x <= 3; x++) put(fxr + x, fyr - 3, C.hair[x > 1 ? 1 : 0]);
    for (let x = -3; x <= 2; x++) put(fxr + x, fyr - 4, C.hair[0]);
    for (let x = -2; x <= 3; x++) put(fxr + x, fyr - 5, x === -2 ? C.hair[1] : C.hair[0]);
    put(fxr + 4, fyr - 5, C.hair[0]); put(fxr + 5, fyr - 6, C.hair[0]);
  } else if (id === 'sparks') {
    [-4, -3, -1, 0, 2, 3].forEach(x => put(fxr + x, fyr - 3, C.hair[0]));
  }

  // hats and the like
  if (C.hatKind === 'hard' || C.hatKind === 'big') {
    // a hard hat: a dome, a brim all round (longer at the front when turned),
    // and the lamp on the front. neville's is too big and sits right down
    // over his eyebrows.
    const big = C.hatKind === 'big', rx = big ? 7.2 : 6.4, base = big ? hy - 1.6 : hy - 2, rh = big ? 6 : 5.2;
    const [h0, h1, h2] = C.hat;
    for (let y = Math.floor(base - rh); y <= base; y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - base) / rh;
      if (dx * dx + dy * dy > 1) continue;
      put(x, y, dx < -0.35 && dy < -0.3 ? h0 : dx > 0.5 ? h2 : h1);
    }
    // a ridge down the middle, and the dents (brutus)
    for (let y = Math.floor(base - rh + 1); y < base; y++) put(Math.round(cx + turn), y, h0);
    if (id === 'brutus') { put(Math.round(cx) - 3, Math.round(base - 3), h2); put(Math.round(cx) - 2, Math.round(base - 2), h2); put(Math.round(cx) + 3, Math.round(base - 4), h2); }
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1 + turn); x++) put(x, Math.round(base) + 1, x > cx + rx * 0.4 ? h2 : h1);
    if (C.lamp) {
      const lx = Math.round(cx + turn * 3), ly = Math.round(base - 2);
      [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(([dx, dy]) => put(lx + dx, ly + dy, '#4a4a52'));
      put(lx, ly, '#fff6c4'); put(lx, ly + 1, '#ffd23f');
    }
  } else if (C.hatKind === 'tipped') {
    // ace's: smaller, tipped back on her head so her bangs show
    const [h0, h1, h2] = C.hat, base = hy - 3.5;
    for (let y = Math.floor(base - 4); y <= base; y++) for (let x = Math.floor(cx - 5.6); x <= Math.ceil(cx + 5.6); x++) {
      const dx = (x - cx) / 5.6, dy = (y - base) / 4.4;
      if (dx * dx + dy * dy > 1) continue;
      put(x, y, dx < -0.3 && dy < -0.3 ? h0 : dx > 0.5 ? h2 : h1);
    }
    for (let x = Math.floor(cx - 6.4); x <= Math.ceil(cx + 6.4 + turn); x++) put(x, Math.round(base) + 1, x > cx + 2 ? h2 : h1);
    const lx = Math.round(cx + turn * 3), ly = Math.round(base - 2);
    put(lx, ly, '#fff6c4'); put(lx, ly + 1, '#ffd23f'); put(lx - 1, ly + 1, '#2a6a64'); put(lx + 1, ly + 1, '#2a6a64');
  } else if (C.hatKind === 'back') {
    // brock's hat shoved right back on his head, the brim up at the back
    const [h0, h1, h2] = C.hat, base = hy - 4.6;
    for (let y = Math.floor(base - 4); y <= base; y++) for (let x = Math.floor(cx - 5.2); x <= Math.ceil(cx + 5.2); x++) {
      const dx = (x - cx) / 5.2, dy = (y - base) / 4.2;
      if (dx * dx + dy * dy > 1) continue;
      put(x, y, dx < -0.3 && dy < -0.3 ? h0 : dx > 0.5 ? h2 : h1);
    }
    for (let y = Math.floor(base - 3.4); y < base; y++) put(Math.round(cx + turn), y, h0);
    // (cocked: the brim's a pixel higher on one side)
    for (let x = Math.floor(cx - 6); x <= Math.ceil(cx + 6 + turn); x++) put(x, Math.round(base) + (x < cx - 1 ? 1 : 0), x > cx + 2 ? h2 : h1);
  } else if (C.hatKind === 'goggles') {
    // spikes of hair sticking up everywhere, and welding goggles strapped
    // round his forehead
    const sp = [[-6, -2], [-5, -5], [-3, -7], [-1, -8], [1, -8], [3, -7], [5, -5], [6, -2], [-7, 1], [7, 1]];
    sp.forEach(([dx, dy], k) => {
      const bx = cx + dx * 0.8, by2 = hy + dy * 0.8, tx = cx + dx * 1.15, ty = hy + dy * 1.12 - (k % 2);
      pxLine(G, bx, by2, tx, ty, k % 3 ? C.hair[0] : C.hair[1]);
      pxLine(G, bx + 1, by2, tx + (dx > 0 ? 0 : 1), ty + 1, C.hair[0]);
    });
    const gy = fyr - 3;
    for (let x = Math.round(cx - R.x); x <= Math.round(cx + R.x + turn); x++) put(x, gy, '#3a2a22');
    [fxr - 2, fxr + 2].forEach((x, k) => {
      if (turn && k === 0) x += 1;
      [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => put(x + dx, gy + dy, dx === 0 && dy === 0 ? '#9fe6ff' : C.goggle[(dx + dy) < 0 ? 0 : 1]));
      put(x - 1, gy - 1, '#ffffff');
    });
  }

  // the face itself. eyes sit on one row (two tall, like yours), brows a row
  // or two above, the mouth below. three quarters on, the far eye is nearer the
  // edge.
  const ey = fyr + (C.hatKind === 'big' ? 1 : 0) - (C.glasses ? 0 : 0);
  const eyesX = turn ? [fxr - 1, fxr + 2] : [fxr - 2, fxr + 2];
  const dark = '#1a1014', white = '#ffffff';
  const lx = look === -1 ? -1 : look === 1 ? 1 : 0, ly = look === 2 ? 1 : 0;
  const wide = C.eyes === 'wide' || mood === 'scared' || mood === 'shock';
  eyesX.forEach((x, k) => {
    if (blink) { put(x, ey + 1, dark); if (C.eyes !== 'small') put(x + (k ? 1 : -1), ey + 1, dark); return; }
    if (wide) {
      // big round eyes, white with the pupil to whichever side they're looking
      const x0 = k ? x : x - 1;
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy]) => put(x0 + dx, ey + dy, white));
      const px = lx < 0 ? x0 : lx > 0 ? x0 + 1 : x0 + (k ? 0 : 1);
      put(px, ey + ly, dark); put(px, ey + 1, dark);
    } else if (C.eyes === 'big') {
      put(x + lx, ey + ly, dark); put(x + lx, ey + 1, dark); put(x + lx + (k ? -1 : 1), ey, white);
    } else {
      put(x + lx, ey + ly, dark); put(x + lx, ey + 1, dark);
      if (C.eyes === 'lash') put(x + lx + (k ? 1 : -1), ey - 1 + ly, dark);
    }
  });
  // glasses (ace): a round frame round each eye with a little bridge
  if (C.glasses) {
    // (a light lens over the top of each eye, so they read as glasses and not
    // shades)
    const gc = '#4a3a5a';
    if (!blink) eyesX.forEach(x => { put(x + lx, ey, '#d8eeff'); put(x + lx, ey + 1, dark); });
    eyesX.forEach(x => {
      [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [-1, 2], [0, 2], [1, 2]].forEach(([dx, dy]) => put(x + dx, ey + dy, gc));
    });
    for (let x = eyesX[0] + 2; x <= eyesX[1] - 2; x++) put(x, ey, gc);
    put(eyesX[0] - 1, ey - 1, '#cfe9ff');
    put(eyesX[1] - 1, ey - 1, '#8ab8d8');
  }
  // brows
  const bc = C.bald ? C.beard[1] : C.hair[1];
  const brow = (x, y) => put(x, y, bc);
  const bY = ey - (C.glasses ? 2 : 1) - (wide ? 1 : 0);
  eyesX.forEach((x, k) => {
    const inner = k === 0 ? 1 : -1, outer = -inner;
    // (neville's helmet sits over his, unless he's terrified)
    if (C.hatKind === 'big' && mood !== 'shock' && mood !== 'scared') return;
    switch (mood) {
      case 'angry': case 'fume':
        brow(x + inner, bY + 1); brow(x, bY + 1); brow(x + outer, bY); break;
      case 'scared': case 'sad':
        brow(x + inner, bY - 1); brow(x, bY); brow(x + outer, bY + (mood === 'sad' ? 1 : 0)); break;
      case 'shock':
        brow(x, bY - 1); brow(x + outer, bY - 1); brow(x + inner, bY - 1); break;
      case 'smug':
        if (k === 1) { brow(x, bY - 1); brow(x + outer, bY - 1); } else { brow(x, bY); brow(x + inner, bY + 1); } break;
      case 'think':
        if (k === 0) { brow(x, bY - 1); brow(x + outer, bY - 1); } else { brow(x, bY); brow(x + outer, bY); } break;
      default:
        if (id === 'brutus') { brow(x + inner, bY + 1); brow(x, bY); brow(x + outer, bY); } else { brow(x, bY); brow(x + outer, bY); }
    }
  });
  // (brutus's brows meet in the middle when he's cross)
  if (id === 'brutus' && (mood === 'angry' || mood === 'fume')) for (let x = eyesX[0] + 1; x < eyesX[1]; x++) put(x, bY + 1, bc);
  // the mouth
  const mx = Math.round(fx + turn * 0.6), my = ey + 3;
  const mc = '#5a2424', teeth = '#ffffff';
  const open = talk || mood === 'shock' || mood === 'scared';
  if (open && mood !== 'grin') {
    put(mx, my, mc); put(mx + 1, my, mc); put(mx, my + 1, mood === 'shock' ? mc : '#8a3a3a'); put(mx + 1, my + 1, mc);
    if (mood === 'scared') put(mx + 1, my + 1, teeth);
  } else switch (mood) {
    case 'happy':
      put(mx - 1, my, mc); put(mx, my + 1, mc); put(mx + 1, my + 1, mc); put(mx + 2, my, mc); break;
    case 'grin':
      for (let x = mx - 2; x <= mx + 2; x++) put(x, my, x === mx - 2 || x === mx + 2 ? mc : teeth);
      for (let x = mx - 1; x <= mx + 1; x++) put(x, my + 1, mc);
      break;
    case 'smug':
      put(mx - 1, my + 1, mc); put(mx, my + 1, mc); put(mx + 1, my, mc); put(mx + 2, my - 1, mc); break;
    case 'angry': case 'fume':
      for (let x = mx - 1; x <= mx + 2; x++) put(x, my, x === mx - 1 || x === mx + 2 ? mc : teeth);
      put(mx - 1, my + 1, mc); put(mx + 2, my + 1, mc);
      break;
    case 'sad':
      put(mx - 1, my + 1, mc); put(mx, my, mc); put(mx + 1, my, mc); put(mx + 2, my + 1, mc); break;
    case 'think':
      put(mx, my, mc); put(mx + 1, my, mc); put(mx + 2, my - 1, mc); break;
    default:
      put(mx, my, mc); put(mx + 1, my, mc);
  }
  // beards, freckles, blush and the rest
  if (id === 'brutus') {
    // a full black beard round the jaw and a moustache over the mouth
    const [b0, b1] = C.beard;
    for (let x = Math.round(fx - 4); x <= Math.round(fx + 4); x++) {
      for (let y = my - 1; y <= Math.round(fcy + fr.y) + 1; y++) {
        const edge = Math.abs(x - fx) > 2.5 || y >= my + 1;
        if (!edge || (y < my && Math.abs(x - fx) < 3.5)) continue;
        if (G.get(x, y) === teeth || G.get(x, y) === mc) continue;
        put(x, y, (x + y) % 3 ? b0 : b1);
      }
    }
    for (let x = mx - 1; x <= mx + 2; x++) if (G.get(x, my - 1) !== teeth) put(x, my - 1, b1);
    put(fxr - 4, ey - 1, '#b05a40');
    if (mood === 'fume') {
      // red in the face, and a vein standing out on his temple
      for (let y = 0; y < MINER_H; y++) for (let x = 0; x < MINER_W; x++) {
        const c = G.get(x, y);
        if (c === sm) put(x, y, '#d8644a'); else if (c === sl) put(x, y, '#ec8a6a'); else if (c === sd) put(x, y, '#a83a2a');
      }
      put(fxr + 3, ey - 2, '#7a1010'); put(fxr + 4, ey - 3, '#7a1010'); put(fxr + 4, ey - 1, '#7a1010');
    }
  }
  if (C.freckles) { put(eyesX[0] - 1, ey + 2, sd); put(eyesX[0], ey + 3, sd); put(eyesX[1] + 1, ey + 2, sd); put(eyesX[1], ey + 3, sd); }
  if (id === 'ace' || (id === 'neville' && mood === 'scared')) { put(eyesX[0] - 1, ey + 2, '#f09a9a'); put(eyesX[1] + 1, ey + 2, '#f09a9a'); }
  if (id === 'neville' && (mood === 'scared' || mood === 'sad')) { put(fxr + 5, ey - 1, '#9fd8ff'); put(fxr + 5, ey, '#d8f2ff'); }
  return G.outline(() => '#000000');
}
// frames are cached by everything that makes them
const MINER_CACHE = new Map();
function minerFrame(id, turn, mood, look, blink, talk) {
  const k = `${id}|${turn}|${mood}|${look}|${blink ? 1 : 0}|${talk ? 1 : 0}`;
  let c = MINER_CACHE.get(k);
  if (!c) { c = makeMiner(id, turn, mood, look, blink, talk).canvas(); MINER_CACHE.set(k, c); }
  return c;
}
// poker art end

// the cards: carved stone, a standard deck of 52. the face is pale granite with
// the rank and suit cut into it and inlaid (ruby for hearts and diamonds,
// obsidian for spades and clubs) and a chip of diamond in the corner; the back
// is dark basalt carved in a diamond lattice with a gem set in the middle.
const PK_CARD_W = 14, PK_CARD_H = 20;
const PK_GLYPH = {
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'], T: ['10111', '10101', '10101', '10101', '10111'],
  J: ['011', '001', '001', '101', '111'], Q: ['010', '101', '101', '110', '011'], K: ['101', '110', '100', '110', '101'], A: ['010', '101', '111', '101', '101']
};
const PK_SUIT5 = [
  ['01110', '01110', '11111', '11011', '00100'],
  ['00100', '01110', '11111', '01110', '00100'],
  ['01010', '11111', '11111', '01110', '00100'],
  ['00100', '01110', '11111', '11111', '00100']
];
const PK_SUIT7 = [
  ['0011100', '0011100', '1101011', '1111111', '1101011', '0001000', '0011100'],
  ['0001000', '0011100', '0111110', '1111111', '0111110', '0011100', '0001000'],
  ['0110110', '1111111', '1111111', '1111111', '0111110', '0011100', '0001000'],
  ['0001000', '0011100', '0111110', '1111111', '1111111', '0001000', '0011100']
];
const PK_RED = c => (c & 3) === 1 || (c & 3) === 2;
function pkGlyph(G, rows, x0, y0, col, hi) {
  rows.forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') G.set(x0 + x, y0 + y, hi && (x === 0 || y === 0) && G.get(x0 + x, y0 + y) !== col ? hi : col); }));
}
function makeCardFace(c) {
  const G = pixelGrid(PK_CARD_W, PK_CARD_H);
  for (let y = 0; y < PK_CARD_H; y++) for (let x = 0; x < PK_CARD_W; x++) {
    const edge = x === 0 || y === 0 || x === PK_CARD_W - 1 || y === PK_CARD_H - 1;
    if (edge) { if (!((x === 0 || x === PK_CARD_W - 1) && (y === 0 || y === PK_CARD_H - 1))) G.set(x, y, '#2a2620'); continue; }
    const n = hash2(x, y, 2201 + c);
    let col = n < 0.08 ? '#cfc9bc' : n < 0.14 ? '#f6f2ea' : '#e6e1d6';
    if (x === 1 || y === 1) col = '#faf7f0';
    if (x === PK_CARD_W - 2 || y === PK_CARD_H - 2) col = '#b9b2a4';
    G.set(x, y, col);
  }
  const red = PK_RED(c), ink = red ? '#b8302a' : '#25222c', lit = red ? '#ef6a5a' : '#5a566a';
  const g = PK_GLYPH[PK_RANKS[c >> 2]];
  pkGlyph(G, g, 2, 2, ink);
  pkGlyph(G, PK_SUIT5[c & 3], 2, 8, ink);
  pkGlyph(G, PK_SUIT7[c & 3], 6, 11, ink, lit);
  G.set(12, 2, '#9df4e8'); G.set(11, 2, '#4ed6c6');
  return G.canvas();
}
function makeCardBack() {
  const G = pixelGrid(PK_CARD_W, PK_CARD_H);
  for (let y = 0; y < PK_CARD_H; y++) for (let x = 0; x < PK_CARD_W; x++) {
    const edge = x === 0 || y === 0 || x === PK_CARD_W - 1 || y === PK_CARD_H - 1;
    if (edge) { if (!((x === 0 || x === PK_CARD_W - 1) && (y === 0 || y === PK_CARD_H - 1))) G.set(x, y, '#120f16'); continue; }
    const lattice = (x + y) % 4 === 0 || (x - y + 40) % 4 === 0;
    let col = lattice ? '#4e4658' : hash2(x, y, 2290) < 0.15 ? '#2e2836' : '#3a3442';
    if (x === 1 || y === 1 || x === PK_CARD_W - 2 || y === PK_CARD_H - 2) col = '#6a5a7a';
    G.set(x, y, col);
  }
  pkGlyph(G, ['00100', '01110', '11111', '01110', '00100'], 4, 7, '#4ed6c6');
  G.set(6, 7, '#e8fffc'); G.set(5, 8, '#9df4e8'); G.set(6, 8, '#9df4e8'); G.set(7, 10, '#1d8b82'); G.set(7, 9, '#1d8b82');
  return G.canvas();
}
const PK_FACE = Array.from({ length: 52 }, (_, c) => makeCardFace(c));
// a card greyed out (your cards after you fold): no colour, and darker
const PK_GREY = new Map();
function pkGrey(im) {
  if (PK_GREY.has(im)) return PK_GREY.get(im);
  const c = mk(im.width, im.height), g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = (d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11) * 0.55;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  PK_GREY.set(im, c);
  return c;
}
const PK_BACK = makeCardBack();

// the chips are the ores themselves in little stacks: ingots for iron and
// gold, cut gems for ruby, emerald and diamond. one iron is $100, gold five
// iron, ruby ten, emerald twenty and diamond a hundred (each one divides into
// the next up, so any amount always makes change).
const PK_ORES = ['iron', 'gold', 'ruby', 'emerald', 'diamond'];
const PK_VAL = { iron: 1, gold: 5, ruby: 10, emerald: 20, diamond: 100 };
const PK_CHIP = {
  iron: ['#ffffff', '#dcd7d0', '#a8a29a', '#6e6a64'], gold: ['#fff6c2', '#f3d35a', '#c99a1c', '#7c5a0a'],
  ruby: ['#ffd0c8', '#ef6a5a', '#c4392b', '#7c1c1c'], emerald: ['#eafff0', '#8eeaa9', '#3fc46c', '#1d7a40'], diamond: ['#f0fffc', '#9df4e8', '#4ed6c6', '#1d8b82']
};
// how a pile of chips is made up: some of each so it looks like real money,
// with the small stuff topped up to a decent stack and the rest in the big
// ones (iron up to 10, gold 6, ruby 5, emerald 4, diamonds for the rest)
function pkChips(n) {
  const out = { iron: 0, gold: 0, ruby: 0, emerald: 0, diamond: 0 }, want = [10, 6, 5, 4, Infinity];
  let rest = Math.max(0, Math.round(n));
  PK_ORES.forEach((id, k) => {
    const v = PK_VAL[id], next = PK_ORES[k + 1];
    if (!next) { out[id] = Math.floor(rest / v); rest -= out[id] * v; return; }
    const nv = PK_VAL[next], step = nv / v;
    let c = (rest % nv) / v;
    while (c + step <= want[k] && (c + step) * v <= rest) c += step;
    out[id] = c; rest -= c * v;
  });
  return out;
}
const pkDollars = n => `$${(Math.round(n) * PK.DOLLARS).toLocaleString('en-US')}`;
// one stack of up to ten, seen from the front and a little above
function makeChipStack(ore, n) {
  const P = PK_CHIP[ore], gem = PK_VAL[ore] >= 10, w = 6, h = n + 2;
  const G = pixelGrid(w, h);
  for (let k = 0; k < n; k++) {
    const y = h - 1 - k;
    for (let x = 0; x < w; x++) G.set(x, y, x === 0 ? P[1] : x === w - 1 ? P[3] : k % 2 ? P[2] : (gem ? P[1] : P[2]));
    if (k % 2 === 0) G.set(gem ? 2 : 1, y, P[3]);
  }
  for (let x = 0; x < w; x++) { G.set(x, 1, x < 2 ? P[0] : P[1]); if (x > 0 && x < w - 1) G.set(x, 0, gem && x === 2 ? '#ffffff' : P[0]); }
  return G.outline(() => '#0c0a0e').canvas();
}
const PK_STACK = Object.fromEntries(PK_ORES.map(o => [o, Array.from({ length: 11 }, (_, n) => (n ? makeChipStack(o, n) : null))]));

// the table: one slab of dark basalt on a thick stone base, with a rim of
// lighter granite round it carved with notches, a ring and a diamond cut
// into the middle of the playing surface, and lava glowing in the cracks down
// its sides. rx, ry are the top surface's radii.
const PK_TRX = 142, PK_TRY = 62, PK_TDEPTH = 11;
function makePokerTable(rx, ry, depth) {
  const w = rx * 2 + 4, h = ry * 2 + depth + 4, cx = w / 2, cy = ry + 2;
  const c = mk(w, h), g = c.getContext('2d'), cracks = [];
  const dot = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
    if (d <= 1) {
      const din = ((x + 0.5 - cx) / (rx - 9)) ** 2 + ((y + 0.5 - cy) / (ry - 7)) ** 2;
      const n = hash2(x, y, 2301), v = vnoise(x / 7, y / 5, 2302);
      if (din > 1) {
        // the granite rim, lit from the top left, with notches cut round it
        const a = Math.atan2(dy, dx), notch = Math.abs(((a / (Math.PI * 2)) * 36 + 36) % 1 - 0.5) < 0.06 && din > 1.08 && d < 0.985;
        const lit = -dy * 0.6 - dx * 0.3;
        let col = lit > 0.35 ? '#8a8490' : lit > -0.2 ? '#6e6874' : '#55505c';
        if (n < 0.1) col = '#4a4652';
        if (d > 0.975) col = dy > 0 ? '#3a3640' : '#9a94a0';
        if (din < 1.06) col = '#1c1a20';
        if (notch) col = '#3e3a44';
        dot(x, y, col);
      } else {
        // the playing surface: dark basalt, a faint grain, a carved ring and a
        // big diamond shape cut into the middle
        let col = v > 0.66 ? '#34313c' : n < 0.05 ? '#3c3846' : '#2c2a33';
        const ring = Math.abs(Math.sqrt(din) - 0.72) < 0.012;
        const dia = Math.abs(Math.abs(x + 0.5 - cx) / (rx * 0.3) + Math.abs(y + 0.5 - cy) / (ry * 0.42) - 1) < 0.03;
        if (ring || dia) col = '#24222a';
        if ((ring || dia) && hash2(x, y, 2303) < 0.5) col = '#3a3644';
        if (din > 0.93) col = '#242129';
        dot(x, y, col);
      }
    } else if (dy > 0 && Math.abs(dx) <= 1) {
      // the side of the slab, under the front half of the ellipse
      const top = cy + ry * Math.sqrt(1 - dx * dx);
      const k = y + 0.5 - top;
      if (k < 0 || k > depth) continue;
      const shade = Math.round(58 - k * 2.4 - Math.abs(dx) * 10);
      let col = `rgb(${shade},${shade - 4},${shade + 4})`;
      if (k > depth - 1) col = '#141218';
      if (vnoise(x / 3, k / 2, 2304) > 0.74 && k > 1 && k < depth - 1) { col = '#ff8a1c'; cracks.push([x, y]); }
      dot(x, y, col);
    }
  }
  return { canvas: c, cracks, w, h, cx, cy };
}
const PK_TABLE = makePokerTable(PK_TRX, PK_TRY, PK_TDEPTH);

// the dealer button: a little stone disc with a D carved in it
function makeDealerButton() {
  const G = pixelGrid(9, 8);
  pxBlob(G, 4, 3.5, 4, 3.4, (dx, dy) => (dy > 0.5 ? '#9a9286' : dx + dy < -0.4 ? '#fffaf0' : '#e8e1d2'));
  [[3, 2], [4, 2], [3, 3], [5, 3], [3, 4], [5, 4], [3, 5], [4, 5]].forEach(([x, y]) => G.set(x, y, '#2a2620'));
  return G.outline(() => '#0c0a0e').canvas();
}
const PK_BUTTON = makeDealerButton();
// a stone seat: a block with a backrest, seen from behind (the top seats) or
// from the side
function makeStoneChair(kind) {
  const G = pixelGrid(22, 16);
  if (kind === 'back') {
    for (let y = 0; y < 16; y++) for (let x = 2; x < 20; x++) {
      if (y < 2 && (x < 4 || x > 17)) continue;
      G.set(x, y, y === 0 ? '#8a8490' : x < 5 ? '#6e6874' : x > 16 ? '#3e3a44' : (hash2(x, y, 2310) < 0.1 ? '#4a4652' : '#55505c'));
    }
  } else {
    for (let y = 6; y < 16; y++) for (let x = 3; x < 19; x++) G.set(x, y, y === 6 ? '#8a8490' : y > 13 ? '#3a3640' : x < 6 ? '#6e6874' : '#55505c');
  }
  return G.outline(() => '#0c0a0e').canvas();
}
const PK_CHAIR_BACK = makeStoneChair('back'), PK_STOOL = makeStoneChair('stool');

// the cavern round the table: a dark stone floor warmed by the lava, a river
// of lava running along the back with a crust of black rock on its bank, pools
// of it in the corners, and stalagmites. lava is remembered pixel by pixel so
// it can bubble and glow every frame.
function makeCavern(w, h, tx, ty) {
  const c = mk(w, h), g = c.getContext('2d'), lava = [];
  const img = g.createImageData(w, h), d = img.data;
  const river = x => ty - 104 + Math.sin(x / 37) * 5 + Math.sin(x / 13 + 1) * 2;
  const pools = [[tx - 236, ty + 98, 70, 30], [tx + 236, ty + 98, 70, 30], [tx - 300, ty - 10, 46, 70], [tx + 300, ty - 10, 46, 70]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, n = hash2(x, y, 2401), v = vnoise(x / 9, y / 9, 2402), r = river(x);
    let inLava = y < r - 3, bank = !inLava && y < r + 3;
    let poolD = Infinity;
    pools.forEach(([px, py, rx, ry]) => { poolD = Math.min(poolD, Math.hypot((x - px) / rx, (y - py) / ry)); });
    if (poolD < 1) inLava = true; else if (poolD < 1.12) bank = true;
    let R, Gc, B;
    if (inLava) {
      const t = vnoise(x / 11, y / 6, 2403);
      [R, Gc, B] = t > 0.72 ? [255, 214, 90] : t > 0.5 ? [255, 140, 36] : t > 0.3 ? [228, 88, 26] : [168, 44, 18];
      if (n < 0.02) [R, Gc, B] = [255, 240, 170];
      lava.push(x, y);
    } else if (bank) {
      [R, Gc, B] = n < 0.3 ? [26, 18, 16] : [40, 28, 24];
      if (hash2(x, y, 2404) < 0.12) [R, Gc, B] = [120, 46, 20];
    } else {
      // the floor: warmer the closer it is to lava
      const warm = Math.max(0, 1 - (y - r) / 70) * 0.6 + Math.max(0, 1.6 - poolD) * 0.35;
      const base = v > 0.62 ? 46 : v > 0.4 ? 38 : 32;
      R = base + warm * 40; Gc = base - 6 + warm * 12; B = base - 4;
      if (n < 0.04) { R -= 12; Gc -= 12; B -= 12; }
      if (n > 0.985) { R += 30; Gc += 22; B += 18; }
    }
    d[i] = R; d[i + 1] = Gc; d[i + 2] = B; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // stalagmites and boulders out of the way of the table
  const rr = mulberry32(2405);
  for (let k = 0; k < 26; k++) {
    const x = rr() * w, y = river(x) + 8 + rr() * (h - river(x) - 8);
    if (Math.abs(x - tx) < 230 && y > ty - 100 && y < ty + 125) continue;
    const hh = 8 + rr() * 16, ww = 4 + rr() * 5;
    for (let yy = 0; yy < hh; yy++) {
      const half = ww * (1 - yy / hh);
      for (let xx = -half; xx <= half; xx++) {
        g.fillStyle = xx < -half * 0.3 ? '#5a4c46' : xx > half * 0.4 ? '#2a221f' : '#40362f';
        g.fillRect(Math.round(x + xx), Math.round(y - yy), 1, 1);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(Math.round(x - ww), Math.round(y + 1), Math.round(ww * 2), 2);
  }
  return { canvas: c, lava, river };
}

// the table view: its own full screen canvas over the world, drawn at a whole
// number scale like everything else, with the buttons, the chat and the rules
// in html on top. where everything sits round the table, relative to the
// middle of its top (you at the bottom, then clockwise: brutus on the left,
// neville, ace and brock along the back, sparks on the right). cards is the
// middle of a seat's two cards, stack and bet are the bottom middle of their
// chips, plate is their name and stack.
const PK_SEATS = [
  { view: 'back', body: [0, 100], cards: [0, 48], stack: [-48, 57], bet: [38, 40], plate: [0, 108] },
  { view: 'side', flip: false, body: [-151, 20], cards: [-120, -2], stack: [-112, 24], bet: [-86, 12], plate: [-151, 38] },
  { view: 'front', body: [-74, -47], cards: [-72, -35], stack: [-104, -27], bet: [-56, -19], plate: [-74, -97] },
  { view: 'front', body: [0, -56], cards: [0, -44], stack: [-34, -34], bet: [6, -20], plate: [0, -104] },
  { view: 'front', body: [74, -47], cards: [72, -35], stack: [104, -27], bet: [56, -19], plate: [74, -97] },
  { view: 'side', flip: true, body: [151, 20], cards: [120, -2], stack: [112, 24], bet: [86, 12], plate: [151, 38] }
];
const PK_DECK = [24, -44];
const PK_NAMES = { you: 'You', brutus: 'Brutus', neville: 'Neville', ace: 'Ace', brock: 'Brock', sparks: 'Sparks' };
const PK_COLOR = { you: '#ffffff', brutus: '#ff8a4a', neville: '#e8d878', ace: '#6fe0d4', brock: '#ff6a6a', sparks: '#ffb03a' };
// what each of them looks like when nothing's happening
const pkBaseMood = (id, M) => (id === 'brutus' ? (M && M.brutus.tilt ? 'fume' : 'angry') : id === 'brock' ? 'smug' : id === 'sparks' ? (M && !M.sparks.wild ? 'idle' : 'grin') : 'idle');

const pkRoot = $('#poker'), pkCv = $('#pk-canvas'), pkCtx = pkCv.getContext('2d');
let PV = null;
let PS = 3, PW = 400, PH = 250, PTX = 200, PTY = 110, POX = 0, POY = 0;
let pkCave = null;
function pvLayout() {
  const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  pkCv.width = Math.round(w * dpr); pkCv.height = Math.round(h * dpr);
  pkCv.style.width = `${w}px`; pkCv.style.height = `${h}px`;
  PS = Math.max(2, Math.floor(Math.min(pkCv.width / 410, pkCv.height / 250)));
  PW = Math.ceil(pkCv.width / PS); PH = Math.ceil(pkCv.height / PS);
  PTX = Math.round(PW / 2);
  PTY = Math.round(clamp(PH * 0.45, 112, PH - 124));
  POX = 0; POY = 0;
  pkCave = makeCavern(PW, PH, PTX, PTY);
  pkCtx.imageSmoothingEnabled = false;
}
const pX = x => Math.round(x * PS + POX), pY = y => Math.round(y * PS + POY);
function pRect(x, y, w, h, col) { pkCtx.fillStyle = col; pkCtx.fillRect(pX(x), pY(y), Math.round(w * PS), Math.round(h * PS)); }
function pImg(im, x, y, flip) {
  if (!im) return;
  if (flip) {
    pkCtx.save();
    pkCtx.translate(pX(x) + im.width * PS, pY(y));
    pkCtx.scale(-1, 1);
    pkCtx.drawImage(im, 0, 0, im.width * PS, im.height * PS);
    pkCtx.restore();
  } else pkCtx.drawImage(im, pX(x), pY(y), im.width * PS, im.height * PS);
}
const pkFont = k => `${Math.max(16, 8 * Math.round(PS * k * 0.6))}px Silkscreen, monospace`;
const seatAt = (i, key) => { const p = PK_SEATS[i][key]; return { x: PTX + p[0], y: PTY + p[1] }; };

// a fresh view of the table for a game in progress
function pvSeats(T) {
  return T.seats.map((s, i) => ({
    i, id: s.id, stack: s.stack, bet: 0, cards: [], folded: s.out, out: s.out, mood: pkBaseMood(s.id, T.ai && T.ai.mood), moodT: 0,
    blinkT: 1 + Math.random() * 3, look: 0, lookT: 0, talkT: 0, pose: 'rest', poseT: 0, poseTo: null, steamT: 0, bob: Math.random() * 6
  }));
}
function pvMood(i, mood, dur = 2) {
  const v = PV.seats[i];
  if (!v || v.id === 'you') return;
  v.mood = mood; v.moodT = dur;
}
function pvPose(i, pose, dur, to) {
  const v = PV.seats[i];
  v.pose = pose; v.poseT = dur; v.poseDur = dur; v.poseTo = to || null;
}
// something sliding across the table: a card, or a pile of chips
function pvTween(o, x1, y1, dur, delay = 0, done) {
  o.x0 = o.x; o.y0 = o.y; o.x1 = x1; o.y1 = y1; o.mt = -delay; o.md = dur; o.mdone = done || null;
  if (!PV.movers.includes(o)) PV.movers.push(o);
}
function pvFly(n, from, to, dur = 0.38, delay = 0, done) {
  if (n <= 0) { if (done) done(); return; }
  const f = { n, x: from.x, y: from.y, fly: true };
  PV.flights.push(f);
  pvTween(f, to.x, to.y, dur, delay, () => { PV.flights.splice(PV.flights.indexOf(f), 1); if (done) done(); });
}
function pvTick(dt) {
  PV.time += dt;
  for (let k = PV.movers.length - 1; k >= 0; k--) {
    const o = PV.movers[k];
    o.mt += dt;
    if (o.mt < 0) continue;
    const u = Math.min(1, o.mt / o.md), e = 1 - (1 - u) ** 3;
    o.x = o.x0 + (o.x1 - o.x0) * e; o.y = o.y0 + (o.y1 - o.y0) * e - (o.arc ? Math.sin(u * Math.PI) * o.arc : 0);
    if (o.fade) o.a = 1 - u;
    if (u >= 1) { PV.movers.splice(k, 1); if (o.mdone) o.mdone(); }
  }
  PV.seats.forEach(v => {
    v.moodT -= dt;
    if (v.moodT <= 0 && v.id !== 'you') v.mood = pkBaseMood(v.id, PV.T.ai.mood);
    v.blinkT -= dt;
    if (v.blinkT < -0.12) v.blinkT = 2 + Math.random() * 3.5;
    v.lookT -= dt;
    if (v.lookT <= 0) v.look = 0;
    v.talkT = Math.max(0, v.talkT - dt);
    v.poseT -= dt;
    if (v.poseT <= 0 && v.pose !== 'rest') { v.pose = 'rest'; v.poseTo = null; }
    // brutus steams out of his ears while he's on tilt
    if (v.id === 'brutus' && PV.T.ai.mood.brutus.tilt && !v.out && !reduceMotion) {
      v.steamT -= dt;
      if (v.steamT <= 0) {
        v.steamT = 0.09 + Math.random() * 0.12;
        const b = seatAt(v.i, 'body');
        [-6, 7].forEach(o => PV.parts.push({ x: b.x + o + (Math.random() - 0.5) * 3, y: b.y - 22, vx: o * 1.6 + (Math.random() - 0.5) * 6, vy: -16 - Math.random() * 10, g: -4, life: 0.9 + Math.random() * 0.4, t: 0, col: Math.random() < 0.5 ? '#f2f2f2' : '#c8c8cc', size: Math.random() < 0.4 ? 2 : 1, puff: true }));
      }
    }
  });
  for (let k = PV.parts.length - 1; k >= 0; k--) {
    const p = PV.parts[k];
    p.t += dt;
    if (p.t >= p.life) { PV.parts.splice(k, 1); continue; }
    p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.spin !== undefined) p.spin += dt * 14;
  }
  // embers drifting up off the lava
  if (!reduceMotion && pkCave && Math.random() < dt * 14) {
    const k = ((Math.random() * pkCave.lava.length) / 2 | 0) * 2;
    if (pkCave.lava.length) PV.parts.push({ x: pkCave.lava[k], y: pkCave.lava[k + 1], vx: (Math.random() - 0.5) * 8, vy: -10 - Math.random() * 14, g: 0, life: 1.2 + Math.random(), t: 0, col: Math.random() < 0.5 ? '#ffd23f' : '#ff8a1c', size: 1, ember: true });
  }
  for (let k = PV.bubbles.length - 1; k >= 0; k--) { PV.bubbles[k].t += dt; if (PV.bubbles[k].t > PV.bubbles[k].dur) PV.bubbles.splice(k, 1); }
  pvSayTick();
  PV.shake = Math.max(0, PV.shake - dt * 8);
  pvFlips(dt);
}

// drawing
function pvDrawChips(n, x, y, maxCols = 9) {
  if (n <= 0) return;
  const parts = pkChips(n), cols = [];
  PK_ORES.slice().reverse().forEach(o => { let c = parts[o]; while (c > 0) { cols.push([o, Math.min(10, c)]); c -= 10; } });
  const show = cols.slice(0, maxCols), w = show.length * 7 + 1;
  show.forEach(([o, k], j) => pImg(PK_STACK[o][k], x - w / 2 + j * 7, y - k - 4));
}
function pvDrawCard(o) {
  if (o.a === 0) return;
  const big = o.big ? 1 : 1;
  if (o.a !== undefined && o.a < 1) pkCtx.globalAlpha = Math.max(0, o.a);
  let up = o.up, sx = 1;
  if (o.flip !== undefined && o.flip >= 0 && o.flip < 1) { sx = Math.abs(1 - o.flip * 2); up = o.flip >= 0.5 ? o.flipTo : !o.flipTo; }
  const im = o.grey ? pkGrey(up ? PK_FACE[o.c] : PK_BACK) : up ? PK_FACE[o.c] : PK_BACK;
  const w = PK_CARD_W * big, h = PK_CARD_H * big;
  pkCtx.fillStyle = 'rgba(0,0,0,0.35)';
  pkCtx.fillRect(pX(o.x - w / 2 + 1), pY(o.y - h / 2 + 2), Math.round(w * PS * sx), h * PS);
  if (sx < 1) {
    const cw = Math.max(1, Math.round(w * PS * sx));
    pkCtx.drawImage(im, pX(o.x) - (cw >> 1), pY(o.y - h / 2), cw, h * PS);
  } else pkCtx.drawImage(im, pX(o.x - w / 2), pY(o.y - h / 2), w * PS, h * PS);
  if (o.glow) { pkCtx.strokeStyle = '#ffd23f'; pkCtx.lineWidth = Math.max(2, PS); pkCtx.strokeRect(pX(o.x - w / 2) - 1, pY(o.y - h / 2) - 1, w * PS + 2, h * PS + 2); }
  pkCtx.globalAlpha = 1;
}
// a forearm on the table, from the elbow to the hand: a sleeve two pixels
// thick with an outline, and the hand on the end
function pvArm(x0, y0, x1, y1, sleeve, skin) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
  [[2.1, '#000000'], [1.5, sleeve]].forEach(([r, col]) => {
    pkCtx.fillStyle = col;
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
      pkCtx.fillRect(pX(x - r), pY(y - r), Math.round(r * 2 * PS), Math.round(r * 2 * PS));
    }
  });
  pRect(x1 - 2.5, y1 - 2.5, 5, 5, '#000000');
  pRect(x1 - 1.5, y1 - 1.5, 3, 3, skin);
}
// where a seat's hands are right now, for whatever they're doing
function pvHands(v, t) {
  const S0 = PK_SEATS[v.i], c = seatAt(v.i, 'cards'), b = seatAt(v.i, 'body'), u = v.poseDur ? 1 - Math.max(0, v.poseT) / v.poseDur : 0;
  const side = S0.view === 'side', dir = S0.flip ? -1 : 1;
  let L = { x: c.x - 8, y: c.y + 7 }, R = { x: c.x + 8, y: c.y + 7 };
  if (S0.view === 'front') {
    // resting on the table just in front of them, either side of their cards
    const edge = PTY - PK_TRY * Math.sqrt(Math.max(0, 1 - ((b.x - PTX) / PK_TRX) ** 2));
    L = { x: b.x - 11, y: edge + 9 }; R = { x: b.x + 11, y: edge + 9 };
    if (v.id === 'ace') R = { x: PTX + PK_DECK[0] - 6, y: PTY + PK_DECK[1] + 4 };
  }
  if (side) { L = { x: b.x + dir * 15, y: b.y - 6 }; R = { x: b.x + dir * 18, y: b.y - 1 }; }
  const to = v.poseTo;
  const lerp = (a, p, k) => ({ x: a.x + (p.x - a.x) * k, y: a.y + (p.y - a.y) * k });
  const there = k => Math.sin(Math.min(1, k) * Math.PI);
  switch (v.pose) {
    case 'deal': if (to) R = lerp(R, to, there(u) * 0.55); break;
    case 'knock': R = { x: R.x, y: R.y - (Math.sin(u * Math.PI * 4) > 0 ? 3 : 0) }; break;
    case 'push': if (to) { L = lerp(L, { x: to.x - 6, y: to.y }, Math.min(1, u * 1.6)); R = lerp(R, { x: to.x + 6, y: to.y }, Math.min(1, u * 1.6)); } break;
    case 'reach': if (to) R = lerp(R, to, there(u) * 0.8); break;
    case 'slam': {
      // fist up, then down hard
      const up = u < 0.45 ? u / 0.45 : Math.max(0, 1 - (u - 0.45) / 0.1);
      R = { x: R.x, y: R.y - up * 14 };
      L = { x: L.x, y: L.y - up * 9 };
      break;
    }
    case 'throw': if (to) R = lerp({ x: b.x + dir * 4, y: b.y - 20 }, to, Math.min(1, u * 2) * 0.35); break;
    case 'chin': R = { x: b.x + 3, y: b.y - 12 }; break;
  }
  return { L, R };
}
function pvDrawMiner(v, t) {
  const S0 = PK_SEATS[v.i], b = seatAt(v.i, 'body'), C = MINER[v.id];
  const turn = S0.view === 'side' ? 1 : 0;
  const bob = reduceMotion ? 0 : Math.round(Math.max(0, Math.sin(t / 700 + v.bob)) * 0.9);
  const talk = v.talkT > 0 && Math.floor(t / 110) % 2 === 0;
  // neville looking at whoever he's up against and back at his cards
  let look = v.look;
  if (S0.flip && (look === -1 || look === 1)) look = -look;
  const im = minerFrame(v.id, turn, v.mood, look, v.blinkT < 0, talk);
  const x = b.x - MINER_W / 2 - (turn ? 0.5 : 0), y = b.y - MINER_H + bob;
  if (v.out) pkCtx.globalAlpha = 0.55;
  pImg(im, x, y, S0.flip);
  pkCtx.globalAlpha = 1;
}
function pvDrawArms(v, t) {
  if (v.out || v.id === 'you') return;
  const S0 = PK_SEATS[v.i], b = seatAt(v.i, 'body'), C = MINER[v.id];
  const sleeve = (C.sleeve || C.skin)[1], skin = C.skin[1];
  const hands = pvHands(v, t);
  // (an arm only reaches so far: a hand heading further than that stops at
  // the end of it)
  const reach = (from, h, max) => {
    const d = Math.hypot(h.x - from.x, h.y - from.y);
    return d <= max ? h : { x: from.x + ((h.x - from.x) / d) * max, y: from.y + ((h.y - from.y) / d) * max };
  };
  let { L, R } = hands;
  if (S0.view === 'front') {
    const e0 = { x: b.x - 7, y: b.y - 6 }, e1 = { x: b.x + 7, y: b.y - 6 };
    L = reach(e0, L, 26); R = reach(e1, R, 30);
    // the forearms come over the table edge from the elbows
    const edge = PTY - Math.round(PK_TRY * Math.sqrt(Math.max(0, 1 - ((b.x - PTX) / PK_TRX) ** 2))) + 2;
    pvArm(b.x - 7 + (L.x - b.x + 7) * 0.25, Math.max(edge, L.y - 10), L.x, L.y, sleeve, skin);
    pvArm(b.x + 7 + (R.x - b.x - 7) * 0.25, Math.max(edge, R.y - 10), R.x, R.y, sleeve, skin);
  } else {
    // (from the shoulders, below the chin, and no longer than the others' arms)
    const dir = S0.flip ? -1 : 1, sy = b.y - 9;
    L = reach({ x: b.x + dir * 3, y: sy }, L, 16); R = reach({ x: b.x + dir * 6, y: sy }, R, 18);
    pvArm(b.x + dir * 3, sy, L.x, L.y, sleeve, skin);
    pvArm(b.x + dir * 6, sy + 1, R.x, R.y, sleeve, skin);
  }
}
// you, from behind, in the seat at the bottom: your own sprite's facing away
// idle frame, the chair's back over your legs
function pvDrawYou(t) {
  const b = seatAt(0, 'body'), img = sheetPlay.complete && sheetPlay.naturalWidth ? sheetPlay : sheet;
  if (!img.naturalWidth) return;
  const col = Math.floor(t / 200) % 6;
  pkCtx.drawImage(img, col * CELL, ROWS.idle.up * CELL, CELL, CELL - 8, pX(b.x - 24), pY(b.y - 42), CELL * PS, (CELL - 8) * PS);
  pImg(PK_CHAIR_BACK, b.x - 11, b.y - 9);
}
function pvText(text, x, y, col, k = 1, align = 'center', base = 'middle') {
  pkCtx.font = pkFont(k);
  pkCtx.textAlign = align;
  pkCtx.textBaseline = base;
  pkCtx.fillStyle = '#000';
  pkCtx.fillText(text, pX(x) + Math.max(1, PS / 2), pY(y) + Math.max(1, PS / 2));
  pkCtx.fillStyle = col;
  pkCtx.fillText(text, pX(x), pY(y));
}
// a name plate: the name over the stack, on a dark panel, lit up yellow round
// the edge while it's their turn
function pvPlate(v) {
  const p = seatAt(v.i, 'plate'), T = PV.T, s = T.seats[v.i];
  const turn = T.toAct === v.i && !T.over && !PV.T.ev.length;
  pkCtx.font = pkFont(1);
  // (before you've sat down your plate's just your name; once you're
  // playing it shows what your hand is too)
  const seated = v.i || PV.started;
  const name = PK_NAMES[v.id], money = !seated ? '' : v.out ? 'OUT' : v.stack <= 0 && s.allIn ? 'ALL IN' : pkDollars(v.stack);
  const extra = v.i === 0 && PV.handName ? PV.handName.toUpperCase() : '';
  pkCtx.font = pkFont(1);
  let tw = Math.max(pkCtx.measureText(name).width, pkCtx.measureText(money).width);
  if (extra) { pkCtx.font = pkFont(0.8); tw = Math.max(tw, pkCtx.measureText(extra).width); }
  const w = tw / PS + 8, h = extra ? 22 : 15;
  const x = p.x - w / 2, y = p.y;
  pkCtx.globalAlpha = v.folded && !v.out ? 0.6 : 1;
  pRect(x, y, w, h, turn ? '#ffd23f' : '#000000');
  pRect(x + 1, y + 1, w - 2, h - 2, v.out ? '#2a2628' : '#1a1418');
  pRect(x + 1, y + 1, w - 2, 1, '#3a2e30');
  pvText(name, p.x, y + 4.5, v.out ? '#8a8486' : PK_COLOR[v.id]);
  pvText(money, p.x, y + 10.5, v.out ? '#6a6466' : '#f6ecd0');
  if (extra) pvText(extra, p.x, y + 17, '#bfe9a6', 0.8);
  pkCtx.globalAlpha = 1;
  // thinking dots over whoever's deciding
  if (turn && v.i !== 0 && PV.think) {
    const n = Math.floor(PV.time * 3) % 4;
    for (let k = 0; k < 3; k++) pRect(p.x - 4 + k * 3, y - 4, 2, 2, k < n ? '#ffd23f' : '#5a4a3a');
  }
}
// a speech bubble over someone: the game's popup style, a dark panel with
// notched corners and an orange edge, their name small in orange and the line
// in cream
function pvBubble(bb) {
  const v = PV.seats[bb.seat], S0 = PK_SEATS[bb.seat], b = seatAt(bb.seat, 'body');
  const a = Math.min(1, bb.t / 0.12, (bb.dur - bb.t) / 0.25);
  if (a <= 0) return;
  pkCtx.globalAlpha = a;
  pkCtx.font = pkFont(1);
  const maxW = 104 * PS, words = bb.text.split(' '), lines = [];
  let line = '';
  words.forEach(wd => { const tr = line ? `${line} ${wd}` : wd; if (pkCtx.measureText(tr).width > maxW && line) { lines.push(line); line = wd; } else line = tr; });
  if (line) lines.push(line);
  const lh = 7, w = Math.max(...lines.map(l => pkCtx.measureText(l).width)) / PS + 10, h = lines.length * lh + 11;
  let cx = b.x, top;
  if (bb.seat === 0) { top = b.y - 40 - h; }
  else if (S0.view === 'front') top = b.y - MINER_H - h - 18;
  else top = b.y - MINER_H - h - 4;
  cx = clamp(cx, w / 2 + 2, PW - w / 2 - 2);
  top = Math.max(2, top);
  const x = Math.round(cx - w / 2);
  pRect(x + 1, top, w - 2, h, '#ff9a3a');
  pRect(x, top + 1, w, h - 2, '#ff9a3a');
  pRect(x + 1, top + 1, w - 2, h - 2, '#16121a');
  pRect(b.x - 1, top + h, 3, 1, '#ff9a3a'); pRect(b.x, top + h + 1, 1, 2, '#ff9a3a');
  pvText(PK_NAMES[v.id].toUpperCase(), x + 4, top + 4.5, '#ff9a3a', 0.8, 'left');
  lines.forEach((l, k) => pvText(l, x + 4, top + 11 + k * lh, '#f6ecd0', 1, 'left'));
  pkCtx.globalAlpha = 1;
}
function pvDraw(t) {
  const c = pkCtx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#0c0808';
  c.fillRect(0, 0, pkCv.width, pkCv.height);
  if (!pkCave) return;
  const sh = PV.shake > 0 && !reduceMotion ? Math.round(Math.sin(t / 20) * PV.shake) : 0;
  POX = 0; POY = 0;
  c.drawImage(pkCave.canvas, 0, 0, PW * PS, PH * PS);
  // the lava breathing: a soft glow over it that swells and fades, and bright
  // bubbles popping up and down its length
  c.globalCompositeOperation = 'lighter';
  const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t / 900);
  const gr = c.createLinearGradient(0, pY(PTY - 130), 0, pY(PTY - 70));
  gr.addColorStop(0, `rgba(255,120,30,${0.1 + pulse * 0.08})`);
  gr.addColorStop(1, 'rgba(255,120,30,0)');
  c.fillStyle = gr;
  c.fillRect(0, 0, pkCv.width, pY(PTY - 70));
  if (!reduceMotion) for (let k = 0; k < 26; k++) {
    const seed = Math.floor(t / 400 + k * 7.3), j = ((hash2(seed, k, 2501) * pkCave.lava.length) / 2 | 0) * 2, life = ((t / 400 + k * 7.3) % 1);
    if (!pkCave.lava.length) break;
    c.fillStyle = `rgba(255,236,150,${0.7 * Math.sin(life * Math.PI)})`;
    c.fillRect(pX(pkCave.lava[j]), pY(pkCave.lava[j + 1]), PS * (k % 3 ? 1 : 2), PS);
  }
  c.globalCompositeOperation = 'source-over';
  POX = sh;
  // the back row: their chairs, then them, behind the table
  [2, 3, 4].forEach(i => { const b = seatAt(i, 'body'); pImg(PK_CHAIR_BACK, b.x - 11, b.y - 22); });
  [2, 3, 4].forEach(i => pvDrawMiner(PV.seats[i], t));
  // the table, and the lava in its cracks flickering
  const tb = PK_TABLE, tx = PTX - tb.cx, ty = PTY - tb.cy;
  c.fillStyle = 'rgba(0,0,0,0.45)';
  for (let k = 0; k < 4; k++) c.fillRect(pX(tx + 6 - k * 2), pY(ty + tb.h - 2 + k), (tb.w - 12 + k * 4) * PS, PS);
  pImg(tb.canvas, tx, ty);
  if (!reduceMotion) {
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < tb.cracks.length; k += 2) {
      const [x, y] = tb.cracks[k], f = 0.5 + 0.5 * Math.sin(t / 260 + x * 0.7);
      c.fillStyle = `rgba(255,${180 + Math.round(f * 60)},80,${0.25 + f * 0.4})`;
      c.fillRect(pX(tx + x), pY(ty + y), PS, PS);
    }
    c.globalCompositeOperation = 'source-over';
  }
  // the side seats, beside the table
  [1, 5].forEach(i => {
    const b = seatAt(i, 'body');
    pImg(PK_STOOL, b.x - 11, b.y - 6);
    pvDrawMiner(PV.seats[i], t);
  });
  // what's on the table: the deck by ace, the button, stacks, bets, the pot,
  // the cards, chips in the air
  if (PV.deck) { for (let k = 0; k < 3; k++) pImg(PK_BACK, PTX + PK_DECK[0] - 7 - k * 0.5, PTY + PK_DECK[1] - 10 - k); }
  if (PV.buttonAt) pImg(PK_BUTTON, PV.buttonAt.x - 4, PV.buttonAt.y - 4);
  PV.seats.forEach(v => {
    if (v.out) return;
    const st = seatAt(v.i, 'stack');
    if (!v.pushing) pvDrawChips(v.stack, st.x, st.y);
  });
  PV.seats.forEach(v => {
    if (v.bet > 0) {
      const bt = seatAt(v.i, 'bet');
      pvDrawChips(v.bet, bt.x, bt.y, 5);
      pvText(pkDollars(v.bet), bt.x, bt.y + 4, '#f6ecd0', 0.8);
    }
  });
  if (PV.pot > 0) {
    pvDrawChips(PV.pot, PTX, PTY + 28, 7);
    pvText(`POT ${pkDollars(PV.pot)}`, PTX, PTY + 11, '#ffd23f');
  } else if (PV.T && PV.T.blinds && !PV.board.length) pvText(`BLINDS ${pkDollars(PV.T.blinds.sb)} / ${pkDollars(PV.T.blinds.bb)}`, PTX, PTY + 14, '#8a7a6a', 0.8);
  PV.board.forEach(pvDrawCard);
  PV.seats.forEach(v => v.cards.forEach(pvDrawCard));
  PV.flights.forEach(f => pvDrawChips(f.n, f.x, f.y + 6, 6));
  // arms over the table edge and onto it
  PV.seats.forEach(v => pvDrawArms(v, t));
  pvDrawYou(t);
  PV.seats.forEach(pvPlate);
  if (PV.winText) {
    const w = PV.winText, a = Math.min(1, w.t / 0.2);
    pkCtx.globalAlpha = a;
    pvText(w.text, w.x, w.y - Math.min(8, w.t * 10), '#ffd23f', 1);
    if (w.sub) pvText(w.sub, w.x, w.y + 8 - Math.min(8, w.t * 10), '#f6ecd0', 0.8);
    pkCtx.globalAlpha = 1;
  }
  PV.parts.forEach(p => {
    const k = 1 - p.t / p.life;
    if (p.card !== undefined) {
      // a card spinning through the air (brutus throwing his)
      c.save();
      c.translate(pX(p.x), pY(p.y));
      c.rotate(p.spin);
      c.drawImage(PK_BACK, -PK_CARD_W * PS / 2, -PK_CARD_H * PS / 2, PK_CARD_W * PS, PK_CARD_H * PS);
      c.restore();
      return;
    }
    c.globalAlpha = p.puff ? k * 0.8 : k;
    c.fillStyle = p.col;
    const sz = (p.size || 1) * (p.puff ? 1 + (1 - k) * 1.5 : 1);
    c.fillRect(pX(p.x), pY(p.y), Math.ceil(sz * PS), Math.ceil(sz * PS));
  });
  c.globalAlpha = 1;
  PV.bubbles.forEach(pvBubble);
  POX = 0;
}

// what's saved: whether you've met them, won, been given the key, who last
// knocked you out (they remember), brock's grudge and ace's respect carried
// between games, and a game in progress (stacks, button, moods), saved after
// every hand so a reload puts you back in your seat
quest.poker = Object.assign({ met: false, won: false, keyGiven: false, visits: 0, busts: 0, lastBeater: null, table: null, grudge: 0, respect: 0, wins: 0, hideRules: false },
  quest.poker && typeof quest.poker === 'object' ? quest.poker : {});
const PQ = quest.poker;

// everyone's voice: a little blip per letter or two, like darryl's, each in
// their own register
Object.assign(sfx, {
  pkVoice: id => {
    const j = 0.96 + Math.random() * 0.08;
    if (id === 'brutus') { tone(110 * j, 0.05, 'sawtooth', 0.028); noiseBurst(0.02, 700, 0.02); }
    else if (id === 'neville') tone(520 * j * (1 + Math.sin(performance.now() / 40) * 0.04), 0.04, 'sine', 0.03);
    else if (id === 'ace') tone(330 * j, 0.05, 'triangle', 0.032);
    else if (id === 'brock') { tone(196 * j, 0.045, 'square', 0.022); tone(392 * j, 0.02, 'square', 0.008); }
    else if (id === 'sparks') tone(440 * j * (Math.random() < 0.5 ? 1 : 1.25), 0.03, 'square', 0.024);
    else sfx.you('x x');
  },
  pkCard: () => { noiseBurst(0.03, 3800, 0.04); tone(1500, 0.015, 'triangle', 0.012); },
  pkChips: n => { for (let k = 0; k < Math.min(4, 1 + (n > 10) + (n > 50) + (n > 150)); k++) tone(2400 + Math.random() * 900, 0.025, 'triangle', 0.02, k * 0.035); },
  pkKnock: () => { noiseBurst(0.03, 400, 0.12); noiseBurst(0.03, 400, 0.1); },
  pkSlam: () => { noiseBurst(0.2, 260, 0.22); tone(60, 0.25, 'square', 0.06); },
  pkFold: () => noiseBurst(0.06, 2400, 0.04),
  pkWin: () => [72, 76, 79, 84].forEach((n, i) => tone(midiHz(n), 0.12, 'triangle', 0.035, i * 0.07))
});

// lines. a few of each so they don't repeat too much; {x} is filled in.
const PK_LINES = {
  brutus: {
    raise: ['RAISE.', 'You want some? Come get some.', 'Raise. Deal with it.', 'Bigger. BIGGER.'],
    allin: ['ALL IN. TRY ME.', 'Everything. NOW.', 'Push it all in. Go on, call.'],
    bluff: ['Bet. Let\'s see you call THAT.', 'Go on. Fold.'],
    wildbluff: ['Let\'s see you call THAT.', 'Big bet. Bigger guts.', 'Your whole stack is shaking, I can hear it.'],
    checkraise: ['Check. HA. Raise!', 'Gotcha. Raise.'],
    tilt: ['RAISE. EVERYTHING. NOW.', 'I\'m not folding ANYTHING.', 'Come on, come ON.'],
    call: ['Fine. Call.', 'Call. Whatever.'],
    fold: ['Bah.', 'Garbage. Fold.', 'Not worth my time.'],
    win: ['HA! That\'s MINE.', 'Get that ore over here.', 'Finally, some respect.', 'Read it and weep.'],
    lose: ['ARGH!', 'This deck is RIGGED.', 'Unbelievable.', 'Are you KIDDING me?'],
    tiltStart: ['THAT\'S IT. NO MORE MR NICE GUY.', 'Every. Single. Time.', 'I\'m gonna crush ALL of you.'],
    tiltCardDead: ['Five hands. FIVE. I haven\'t seen a playable card all night!', 'I\'m so card dead I forgot what a pair looks like!', 'Nine three. Eight two. Every. Single. Hand!'],
    tiltUnlucky: ['Every time! I get it in good and the river KILLS me!', 'Unbelievable luck. UNBELIEVABLE.', 'How do you all keep HITTING?!'],
    tiltSeven: ['SEVEN DEUCE?! You beat me with SEVEN DEUCE?!', 'That\'s not poker, that\'s a CRIME!'],
    tiltShown: ['You BLUFFED me?! That\'s IT!', 'You showed me THAT?! Oh, it\'s ON!'],
    stillTilt: ['I\'m NOT calm. Don\'t ask.', 'One win. ONE. That doesn\'t count!'],
    toAceExploit: ['Shut UP, Ace.', 'I\'m NOT tilting!', 'Watch me, calculator.'],
    payOut: ['Rigged. RIGGED.', 'Take it. TAKE IT.'],
    calm: ['...Fine. I\'m calm. I\'m calm.', 'Okay. Breathing. Like Ace said.', 'Alright. Back to business.'],
    throw: ['STUPID CARDS!', 'TAKE YOUR CARDS BACK!', 'WHO SHUFFLED THIS?!'],
    bust: ['This is a JOKE!', 'Rigged. Rigged I tell you!'],
    vsSparks: ['Shut it, Sparks.', 'Keep laughing, matchstick.', 'One more word, Sparks.'],
    beatSparks: ['Who\'s laughing now, Sparks?', 'Take THAT, matchstick!'],
    toSparksLoss: ['Laugh it up, matchstick.', 'Next time, Sparks. NEXT TIME.'],
    sorry: ['...Sorry, Ace.', 'Hmph. Fine.', 'They slipped.'],
    breathe: ['I AM breathing!', 'Don\'t tell me to breathe!'],
    thanks: ['Hmph. Obviously.', 'Course it was.'],
    beatenByYou: ['You got lucky. Next one\'s MINE.', 'Don\'t get comfortable over there.', 'I\'ll remember that, newbie.'],
    show: ['LOOK AT IT! LOOK!', 'Read it and weep!'],
    seeBluff: ['YOU HAD THAT?!', 'You bluffed ME? With THAT?!']
  },
  neville: {
    fold: ['I-I fold.', 'Too rich for me.', 'Nope. Nope nope.', 'I\'ll sit this one out.'],
    scaredfold: ['N-nope. Fold.', 'Too scary. Fold.', 'That\'s a big bet. I fold.'],
    call: ['Okay... call.', 'I guess I call?'],
    overvalue: ['I... I think I have to call this one.', 'Okay, okay. I have to call. I have to.', 'This is a good hand. Right? Call.'],
    raise: ['I, um... raise?', 'R-raise.', 'Raise. Sorry.'],
    allin: ['A-all in. Sorry. Sorry.', 'I\'m all in. I have to be.'],
    vsYou: ['Why are you looking at me like that?', 'You\'re new. New people are scary.', 'I don\'t know what you have. I hate that.', 'Are you bluffing? Please be bluffing.'],
    vsAce: ['Ace, please, not again...', 'She knows. She always knows.', 'Why is it always you, Ace?'],
    win: ['Oh! I won? I won!', 'Phew.', 'Sorry! Sorry. But I won.'],
    lose: ['I knew it. I knew it.', 'Why do I even play.', 'Of course.'],
    bust: ['I\'m going to go sit by the lava and think about my choices.', 'That\'s it. I\'m out. Good game.'],
    toSparks: ['I-I\'m blinking! See?', 'Please don\'t do that.'],
    toAceExploit: ['I-it is a bit big, yes.', 'S-sorry. I mean, okay.'],
    payOut: ['But I folded!', 'That rule is so mean.'],
    thanks: ['R-really? Thanks, Ace!', 'Oh! Um. Thank you!'],
    beatenByYou: ['I-I knew you had it. I knew it!', 'Why do you always have it against me?', 'Okay. I\'m folding to you from now on.'],
    show: ['O-okay... here.', 'Fine. It\'s not much.'],
    seeBluff: ['S-so you DO bluff...', 'That\'s... that\'s mean.'],
    seeValue: ['I knew you had it. I always fold to you for a reason.']
  },
  ace: {
    raise: ['Raise.', 'I\'ll make it {x}.', 'Raise to {x}.'],
    call: ['Call.', 'I\'ll call.'],
    allin: ['All in.', 'I\'m all in.'],
    win: ['Nice hand.', 'As expected.', 'The numbers rarely lie.'],
    praise_brutus: ['Well played, Brutus.', 'Good hand, Brutus. Don\'t let it go to your head.'],
    praise_neville: ['Nice hand, Neville. Really.', 'See, Neville? You can do it.'],
    praise_brock: ['Fine. Good hand, Brock.', 'Well played. Don\'t make it weird, Brock.'],
    praise_sparks: ['Good call, Sparks. Annoyingly good.', 'That shouldn\'t work. And yet.'],
    beatenByYou: ['Hm. Well played.', 'I\'ll adjust.', 'You found the one line I didn\'t account for.'],
    toSparks: ['Done. It\'s still a losing play, Sparks.', 'I did the math. You\'re still behind.'],
    toBrockWin: ['Enjoy it. Variance evens out.', 'Long run, Brock. Long run.'],
    toBrockLose: ['It\'s called a range, Brock.', 'Luck had nothing to do with it.'],
    toNeville: ['Nothing personal, Neville.', 'Breathe. It\'s just cards.'],
    noted: ['Noted.', 'Interesting. I\'ll remember that.', 'So that\'s how you play it.'],
    exploit_brutus: ['You\'re tilting, Brutus. I\'ll take it.', 'Call. You\'re steaming, so you\'re bluffing.', 'Breathe, Brutus. Or don\'t. Raise.'],
    exploit_neville: ['Too big for you, Neville?', 'Your blind, Neville. I\'ll take it.', 'Fold, Neville. You know you want to.'],
    exploit_brock: ['Confidence isn\'t a strategy, Brock.', 'Call. You always have it, don\'t you, Brock?', 'Go on, Brock. Prove it.'],
    exploit_sparks: ['Call. Thank you, Sparks.', 'Punting again, Sparks? I\'ll take it.', 'Every time, Sparks.'],
    payOut: ['...Fine. A rule\'s a rule.', 'Annoying. But fair.'],
    shocked: ['...Huh. I didn\'t expect that.', 'Interesting. That shouldn\'t have worked.', 'You\'re full of surprises.', 'Wait, what?'],
    impressed: ['Okay. You\'re actually good.', 'I\'m starting to think you know exactly what you\'re doing.', 'You play like nobody I\'ve seen down here.'],
    chastise: ['Brutus. The cards did nothing to you.', 'Throw the cards at me again and you\'re dealt out.', 'Brutus! Pick those up.', 'Really, Brutus? Again?'],
    tilt: ['Breathe, Brutus.', 'Someone\'s tilting.', 'Here we go.'],
    level: ['The lava\'s rising. Blinds are now {sb} and {bb}.', 'Blinds up. {sb} and {bb}.'],
    deal: ['Shuffle up and deal.', 'Cards in the air.', 'Next hand.'],
    bust: ['Good game.', 'Well played, everyone.'],
    vsBrock: ['Run the numbers, Brock. Oh, right.', 'Statistically, Brock, that was terrible.']
  },
  brock: {
    raise: ['Watch and learn.', 'Raise. Obviously.', 'Let me show you how it\'s done.'],
    grudge3: ['Not this time, rookie.', 'Three bet. Learn your place.', 'You think you can push ME around?'],
    grudge4: ['Four bet. Fold, beginner.', 'Cute three bet. Four bet.', 'Nice try, newbie.'],
    grudge5: ['Five bet. Your move, newbie.', 'All in. Call it, I dare you.', 'Fold, rookie. FOLD.'],
    grudgecall: ['I know you\'re bluffing.', 'Call. You\'ve got nothing.', 'Beginners always bluff. Call.'],
    grudgebluff: ['Big bet. Scared yet, rookie?', 'Bet. Go ahead and fold.'],
    allin: ['All in, baby!', 'Push it. All of it.'],
    call: ['Call.', 'Yeah, I\'ll call.'],
    beatYou: ['That\'s what I\'m talking about! Read you like a book.', 'Welcome to the big leagues, rookie.', 'Should\'ve stuck to mining, beginner.'],
    loseYou: ['Lucky. So lucky.', 'You don\'t even know what you\'re doing!', 'That\'s not how poker works, beginner!', 'Rookie luck. Enjoy it while it lasts.'],
    loseAce: ['Calculator girl got lucky again.', 'Ugh. Do you ever NOT have it, Ace?', 'Spreadsheet poker. So boring.'],
    beatAce: ['Who\'s the calculator now, Ace?', 'Math THAT, Ace.'],
    slam: ['ARE YOU KIDDING ME?!', 'NO WAY. NO WAY!', 'UNREAL!'],
    win: ['Too easy.', 'And that\'s why they call me the best.', 'Ship it.'],
    lose: ['Whatever.', 'I let you have that one.'],
    bust: ['Whatever. I let you win.', 'This game is so rigged.'],
    beatenByYou: ['Beginner\'s luck doesn\'t last forever!', 'You won\'t get that lucky twice, rookie.'],
    toSparks: ['Laugh it up, Sparks.', 'At least I look at my cards.'],
    toAce: ['Nobody asked, Ace.', 'Numbers don\'t win pots. I do.'],
    thanks: ['I know.', 'Obviously.'],
    showBluffYou: ['Nothing! I had NOTHING! Learn something, rookie.', 'Ha! Look at that. Nothing. You folded to NOTHING.'],
    showBluff: ['Ha! Nothing! You folded to NOTHING!', 'Bluffed. Get used to it.'],
    seeShow: ['Rub it in, why don\'t you.', 'Whatever. Lucky.', 'You think that\'s funny, rookie?'],
    toAceExploit: ['We\'ll see who\'s confident at the river.', 'Watch it, calculator.'],
    seven: ['SEVEN DEUCE?! On ME? You\'re dead to me, rookie!', 'Seven deuce. Against ME. Oh, it\'s ON.'],
    payOut: ['This rule is stupid.', 'Ugh. Fine.']
  },
  sparks: {
    wildcall: ['I guess I have to call.', 'I can\'t win if I don\'t call!', 'Call! Obviously.', 'Strawberry Jam!'],
    wildshove: ['I\'m all in again I guess.', 'Strawberry Jam!', 'All in! Let\'s gooo!', 'Why not? All in!'],
    wildvalue: ['All in! For real this time!', 'Strawberry Jam!'],
    wild3: ['Raise! Because why not.', 'Let\'s make it spicy.', 'Bigger! I like bigger.'],
    wild: ['Raise it up!', 'Let\'s gamble!'],
    allin: ['I\'m all in again I guess.', 'All in! Wheee!'],
    call: ['Call!', 'Sure, call.'],
    win: ['Ha! Pay up!', 'That\'s how it\'s done!', 'Strawberry Jam! I win!'],
    lose: ['Worth it.', 'Eh, ore comes and goes.', 'Strawberry Jam...', 'Oops!'],
    settle: ['Alright, alright. Sparks is focusing now.', 'Okay. Serious face.', 'Maybe I should actually look at my cards.'],
    goWild: ['Big stack Sparks is back, baby!', 'Look at all this ore! Time to have fun!'],
    tauntBrutus: ['Careful Brutus, your hat\'s whistling.', 'Is that steam or are you just happy to see me?', 'Somebody get Brutus a bucket of water!'],
    beatBrutus: ['Sorry, big guy! Not sorry!', 'Brutus! Buddy! Pal! Thanks for the ore!'],
    tauntBrock: ['Nice hand, champ. Oh wait.', 'Brock, buddy, maybe try a different game?'],
    tauntNeville: ['Neville, you can blink, you know.', 'Boo! Hehe.'],
    tauntAce: ['Ace, do the math on THAT.', 'Calculate this!'],
    bust: ['Strawberry Jam... Good game, everybody!', 'Out! That was fun though.'],
    toBrutus: ['Ooh, scary!', 'Love you too, big guy!', 'Hehe, he\'s steaming!'],
    thanks: ['Strawberry Jam! Thanks, Ace!', 'Aw, shucks.'],
    beatenByYou: ['Ha! You got me! Strawberry Jam!', 'Nice one! I\'ll get you back!', 'Ooh, you\'re good!'],
    show: ['Read \'em and weep!', 'Just so you know, I had THIS!', 'Look! Look what I had!'],
    askNeville: ['Come on Neville, show us!', 'Show! Show! Show!', 'Neville! What did you have?'],
    knows: ['Hahaha! This guy really knows how to play!'],
    toAceExploit: ['Strawberry Jam! Gotta gamble!', 'Can\'t win if I don\'t play!'],
    seven: ['SEVEN DEUCE! HAHAHA! Pay up, everybody!', 'The seven deuce! Strawberry Jam!'],
    sevenMine: ['The seven deuce never fails! Pay up, pay up!', 'SEVEN DEUCE, BABY! A thousand each!'],
    payOut: ['Hahaha, worth it!', 'Here you go! Nice!']
  },
  you: {}
};
const pkAny = a => a[(Math.random() * a.length) | 0];
const pkFill = (s, o = {}) => s.replace(/\{(\w+)\}/g, (_, k) => (o[k] !== undefined ? o[k] : ''));

// the chat box: everything that happens, and everything anyone says
const pkChat = $('#pk-chat-log');
function pvLog(html, cls = '') {
  const p = document.createElement('p');
  p.className = cls;
  p.innerHTML = html;
  pkChat.appendChild(p);
  while (pkChat.children.length > 80) pkChat.removeChild(pkChat.firstChild);
  pkChat.scrollTop = pkChat.scrollHeight;
}
const pkWho = i => `<b style="color:${PK_COLOR[PK_IDS[i]]}">${PK_NAMES[PK_IDS[i]]}</b>`;
// (you fold, brutus folds)
const PK_YOU_VERB = { folds: 'fold', checks: 'check', calls: 'call', bets: 'bet', raises: 'raise', is: 'are', shows: 'show', wins: 'win', splits: 'split', straddles: 'straddle' };
const pkV = (i, verb) => (i ? verb : verb.replace(/^\w+/, w => PK_YOU_VERB[w] || w));
// someone says something over the table. force skips the cooldown that stops
// them chattering every action.
function pvSay(i, text, force = false, dur) {
  if (!PV || !text) return;
  const v = PV.seats[i];
  if (!force && v.saidAt && PV.time - v.saidAt < 5) return;
  v.saidAt = PV.time;
  if (PV.sayQ.length > 4 && !force) return;
  PV.sayQ.push({ i, text, dur, force, at: PV.time });
}
function pvSpeak(q) {
  const v = PV.seats[q.i];
  PV.bubbles.length = 0;
  PV.bubbles.push({ seat: q.i, text: q.text, t: 0, dur: q.dur || 1.9 + q.text.length * 0.04 });
  v.talkT = Math.min(1.6, 0.3 + q.text.length * 0.035);
  pvLog(`${pkWho(q.i)}: ${q.text.replace(/</g, '&lt;')}`, 'talk');
  const n = Math.min(8, Math.ceil(q.text.length / 3));
  for (let k2 = 0; k2 < n; k2++) setTimeout(() => sfx.pkVoice(PK_IDS[q.i]), k2 * 70);
  if (q.then) q.then();
}
function pvSayTick() {
  const b = PV.bubbles[0];
  if (b && b.t < b.dur - 0.15) return;
  while (PV.sayQ.length && !PV.sayQ[0].force && PV.time - PV.sayQ[0].at > 3.5) PV.sayQ.shift();
  if (PV.sayQ.length) pvSpeak(PV.sayQ.shift());
}
// a line at someone else, and their answer straight after it: nobody gets
// talked at and says nothing back
function pvBanter(from, key, to, replyKey, o) {
  const L = PK_LINES[PK_IDS[from]][key], R = PK_LINES[PK_IDS[to]][replyKey];
  if (!L || !R || PV.seats[from].out || PV.seats[to].out) return false;
  pvSay(from, pkFill(pkAny(L), o), true);
  pvSay(to, pkFill(pkAny(R), o), true);
  return true;
}
// the miners only bicker with each other about a hand they were both in, and
// not while you're playing one (you've got enough to think about)
function pvTogether(a, b) {
  const T = PV.T, inIt = i => T.seats[i].cards && !T.seats[i].out && (T.over ? T.seats[i].total > 0 && (T.seats[i].vol || T.seats[i].won > 0 || !T.seats[i].folded) : pkInHand(T.seats[i]));
  const youIn = T.seats[0].cards && !T.seats[0].folded && !T.seats[0].out;
  return inIt(a) && inIt(b) && !youIn;
}
function pvSayPick(i, key, chance = 1, o, force) {
  const L = PK_LINES[PK_IDS[i]][key];
  if (!L || Math.random() > chance) return false;
  pvSay(i, pkFill(pkAny(L), o), force);
  return true;
}

// the human's controls
const pkUI = {
  actions: $('#pk-actions'), fold: $('#pk-fold'), call: $('#pk-call'), raise: $('#pk-raise'), allin: $('#pk-allin'),
  slider: $('#pk-slider'), amount: $('#pk-amount'), minus: $('#pk-minus'), plus: $('#pk-plus'), presets: $('#pk-presets'),
  straddle: $('#pk-straddle'), fast: $('#pk-fast'), leave: $('#pk-leave'), rulesBtn: $('#pk-rules-btn'), status: $('#pk-status'), show: $('#pk-show')
};
function pvRaiseVal() { return clamp(Math.round(+pkUI.slider.value), +pkUI.slider.min, +pkUI.slider.max); }
function pvSetRaise(v) {
  const L = PV.legal;
  v = clamp(Math.round(v), L.minTo, L.maxTo);
  pkUI.slider.value = v;
  pkUI.amount.textContent = pkDollars(v);
  pkUI.raise.innerHTML = `${v >= L.maxTo ? 'All in' : L.isBet ? 'Bet' : 'Raise to'} <b>${pkDollars(v)}</b>`;
}
function pvShowControls() {
  const T = PV.T, L = pkLegal(T, 0);
  PV.legal = L;
  PV.human = true;
  pkUI.actions.classList.add('is-turn');
  pkUI.call.innerHTML = L.canCheck ? 'Check <kbd>C</kbd>' : `Call <b>${pkDollars(L.toCall)}</b> <kbd>C</kbd>`;
  // (no folding when checking is free)
  pkUI.fold.disabled = L.canCheck;
  pkUI.call.disabled = false;
  const can = L.canRaise;
  [pkUI.raise, pkUI.slider, pkUI.minus, pkUI.plus].forEach(el => { el.disabled = !can; });
  pkUI.presets.querySelectorAll('button').forEach(b => { b.disabled = !can; });
  pkUI.allin.disabled = !(L.maxTo > T.bet && (can || L.toCall >= T.seats[0].stack));
  pkUI.slider.min = L.minTo; pkUI.slider.max = L.maxTo; pkUI.slider.step = 1;
  if (can) pvSetRaise(L.minTo);
  else { pkUI.raise.innerHTML = 'Raise'; pkUI.amount.textContent = ''; }
  pkUI.status.textContent = 'Your turn';
  sfx.ui();
}
function pvHideControls() {
  PV.human = false;
  pkUI.actions.classList.remove('is-turn');
  [pkUI.fold, pkUI.call, pkUI.raise, pkUI.allin, pkUI.slider, pkUI.minus, pkUI.plus].forEach(el => { el.disabled = true; });
  pkUI.presets.querySelectorAll('button').forEach(b => { b.disabled = true; });
  pkUI.status.textContent = '';
}
function pvHuman(type, to) {
  if (!PV || !PV.human || PV.scene) return;
  const L = PV.legal;
  if (type === 'allin') { type = L.canRaise ? 'raise' : 'call'; to = L.maxTo; }
  pvHideControls();
  PV.lastWhy[0] = type;
  pkAct(PV.T, 0, { type, to });
}
pkUI.fold.addEventListener('click', () => pvHuman('fold'));
pkUI.call.addEventListener('click', () => pvHuman(PV.legal.canCheck ? 'check' : 'call'));
pkUI.raise.addEventListener('click', () => pvHuman('raise', pvRaiseVal()));
pkUI.allin.addEventListener('click', () => pvHuman('allin'));
pkUI.slider.addEventListener('input', () => pvSetRaise(+pkUI.slider.value));
pkUI.minus.addEventListener('click', () => pvSetRaise(pvRaiseVal() - PV.T.blinds.bb));
pkUI.plus.addEventListener('click', () => pvSetRaise(pvRaiseVal() + PV.T.blinds.bb));
pkUI.presets.addEventListener('click', e => {
  const b = e.target.closest('button[data-p]');
  if (!b || !PV || !PV.legal) return;
  const L = PV.legal, p = b.dataset.p;
  // a fraction of the pot after you've called, like everywhere online
  const potAfter = L.pot + L.toCall, base = PV.T.bet;
  const to = p === 'min' ? L.minTo : p === 'max' ? L.maxTo : base + potAfter * +p;
  pvSetRaise(to);
});
pkUI.straddle.addEventListener('change', () => { if (PV) PV.youStraddle = pkUI.straddle.checked; });
pkUI.fast.addEventListener('click', () => {
  if (!PV) return;
  PV.fast = !PV.fast;
  pkUI.fast.classList.toggle('is-on', PV.fast);
  pkUI.fast.setAttribute('aria-pressed', String(PV.fast));
});
pkUI.leave.addEventListener('click', () => pvAskLeave());
pkUI.show.addEventListener('click', () => pvYouShow());
pkUI.rulesBtn.addEventListener('click', () => pvRules(!PV.rulesOpen));

// what your two cards are called before the flop
function pkPreName(a, b) {
  const ra = a >> 2, rb = b >> 2, hi = Math.max(ra, rb), lo = Math.min(ra, rb);
  if (hi === lo) return `Pocket ${PK_PLURAL[hi]}`;
  return `${PK_WORD[hi]} ${PK_WORD[lo]}${(a & 3) === (b & 3) ? ' Suited' : ''}`;
}
function pvUpdateHandName() {
  const s = PV.T.seats[0];
  if (!s.cards || s.folded || s.out) { PV.handName = ''; return; }
  const shown = PV.board.filter(c => c.up).map(c => c.c);
  PV.handName = shown.length >= 3 ? pkHandName(pkEval2(s.cards[0], s.cards[1], shown)) : pkPreName(s.cards[0], s.cards[1]);
}
const pvCardSpot = (i, k) => {
  const c = seatAt(i, 'cards');
  return i === 0 ? { x: c.x + (k ? 8 : -8), y: c.y } : { x: c.x + (k ? 4 : -4), y: c.y + (k ? 1 : 0) };
};

// playing the engine's events out one at a time. each handler sets up its
// animation and returns how long to wait before the next.
const PV_EV = {
  hand(ev) {
    const T = PV.T;
    PV.seats.forEach(v => {
      v.cards = []; v.bet = 0; v.out = T.seats[v.i].out; v.folded = v.out; v.stack = ev.stacks[v.i]; v.pushing = false;
    });
    PV.board = []; PV.pot = 0; PV.handName = ''; PV.winText = null; PV.deck = true; PV.wins = []; PV.runout = false;
    PV.showInfo = null; pkUI.show.disabled = true; pkUI.show.hidden = true;
    const b = seatAt(ev.button, 'stack'), bt = { x: b.x + (ev.button === 0 ? 30 : PK_SEATS[ev.button].view === 'front' ? 0 : PK_SEATS[ev.button].flip ? -14 : 14), y: b.y + (PK_SEATS[ev.button].view === 'front' ? 10 : ev.button === 0 ? 2 : -14) };
    if (!PV.buttonAt) PV.buttonAt = { ...bt };
    pvTween(PV.buttonAt, bt.x, bt.y, 0.4);
    pvLog(`<span class="dim">Hand ${ev.hand} | Blinds ${pkDollars(ev.blinds.sb)} / ${pkDollars(ev.blinds.bb)}</span>`, 'sys');
    if (ev.levelUp) { pvSayPick(3, 'level', 1, { sb: pkDollars(ev.blinds.sb), bb: pkDollars(ev.blinds.bb) }, true); return 1.6; }
    if (!T.seats[3].out && Math.random() < 0.08) pvSayPick(3, 'deal', 1);
    pvChatter();
    return 0.45;
  },
  post(ev) {
    const v = PV.seats[ev.seat];
    v.stack -= ev.amount;
    pvFly(ev.amount, seatAt(ev.seat, 'stack'), seatAt(ev.seat, 'bet'), 0.3, 0, () => { v.bet += ev.amount; sfx.pkChips(ev.amount); });
    if (ev.kind === 'straddle') {
      pvLog(`${pkWho(ev.seat)} ${pkV(ev.seat, 'straddles')} ${pkDollars(ev.amount)}`);
      if (ev.seat === 5 && PV.T.ai.mood.sparks.wild) pvSay(5, 'Straddle! Strawberry Jam!');
    }
    return 0.3;
  },
  deal(ev) {
    const T = PV.T, n = ev.order.length;
    let k = 0;
    [0, 1].forEach(round => ev.order.forEach(i => {
      const o = { c: T.seats[i].cards[round], up: false, x: PTX + PK_DECK[0], y: PTY + PK_DECK[1], arc: 6 };
      PV.seats[i].cards.push(o);
      const spot = pvCardSpot(i, round), d = k * 0.08;
      setTimeout(() => { if (PV) { pvPose(3, 'deal', 0.16, spot); sfx.pkCard(); } }, d * 1000 / PV.speed);
      pvTween(o, spot.x, spot.y, 0.22, d, () => {
        if (i === 0) { o.flipTo = true; pvFlip(o); }
      });
      k++;
    }));
    return n * 2 * 0.08 + 0.4;
  },
  act(ev) {
    const v = PV.seats[ev.seat], why = PV.lastWhy[ev.seat] || '', id = v.id;
    const say = { fold: 'folds', check: 'checks', call: `calls ${pkDollars(ev.amount)}`, bet: `bets ${pkDollars(ev.to)}`, raise: `raises to ${pkDollars(ev.to)}`, allin: `is all in for ${pkDollars(ev.to)}` }[ev.kind];
    pvLog(`${pkWho(ev.seat)} ${pkV(ev.seat, say)}`);
    if (ev.kind === 'fold') {
      v.folded = true;
      if (ev.seat === 0) {
        // yours slide a little way in, as if mucked, and stay there greyed out
        v.cards.forEach((o, k) => { const tx = o.x + (PTX - o.x) * 0.1 + (k ? 2 : -2), ty = o.y + 4; pvTween(o, tx, ty, 0.3, k * 0.04, () => { o.grey = true; }); });
      } else v.cards.forEach((o, k) => { o.a = 1; pvTween(o, PTX + (k ? 3 : -3), PTY - 4, 0.35, k * 0.04, () => { o.a = 0; }); o.fade = true; });
      sfx.pkFold();
      pvReact(ev, why);
      if (ev.seat === 0) PV.handName = '';
      return 0.45;
    }
    if (ev.kind === 'check') {
      pvPose(ev.seat, 'knock', 0.35);
      sfx.pkKnock();
      pvReact(ev, why);
      return 0.42;
    }
    const amt = ev.amount;
    v.stack = ev.stack;
    if (ev.kind === 'allin' && id === 'sparks') {
      // sparks shoves the lot into the middle with both arms
      const bt = seatAt(ev.seat, 'bet');
      pvPose(ev.seat, 'push', 0.9, bt);
      pvFly(amt, seatAt(ev.seat, 'stack'), bt, 0.7, 0.15, () => { v.bet = ev.to; sfx.pkChips(amt); PV.shake = Math.max(PV.shake, 1); });
      pvMood(ev.seat, 'grin', 2.5);
      pvReact(ev, why);
      return 1.3;
    }
    pvPose(ev.seat, 'reach', 0.35, seatAt(ev.seat, 'bet'));
    pvFly(amt, seatAt(ev.seat, 'stack'), seatAt(ev.seat, 'bet'), 0.32, 0, () => { v.bet = ev.to; sfx.pkChips(amt); });
    pvReact(ev, why);
    return ev.kind === 'allin' ? 1 : 0.6;
  },
  refund(ev) {
    const v = PV.seats[ev.seat];
    v.bet -= ev.amount;
    pvFly(ev.amount, seatAt(ev.seat, 'bet'), seatAt(ev.seat, 'stack'), 0.3, 0, () => { v.stack += ev.amount; });
    pvLog(`<span class="dim">${pkDollars(ev.amount)} back to ${ev.seat ? PK_NAMES[v.id] : 'you'}</span>`);
    return 0.35;
  },
  collect(ev) {
    const to = { x: PTX, y: PTY + 28 };
    let any = false;
    PV.seats.forEach(v => {
      if (v.bet <= 0) return;
      const n = v.bet;
      v.bet = 0;
      any = true;
      pvFly(n, seatAt(v.i, 'bet'), to, 0.35);
    });
    setTimeout(() => { if (PV) { PV.pot = ev.pot; sfx.pkChips(ev.pot); } }, 360 / PV.speed);
    return any ? 0.5 : 0.1;
  },
  board(ev) {
    const start = PV.board.length;
    ev.cards.forEach((c, k) => {
      const o = { c, up: false, x: PTX + PK_DECK[0], y: PTY + PK_DECK[1], arc: 4 };
      PV.board.push(o);
      const slot = { x: PTX - 32 + (start + k) * 16, y: PTY - 4 };
      setTimeout(() => { if (PV) { pvPose(3, 'deal', 0.18, slot); sfx.pkCard(); } }, k * 120 / PV.speed);
      pvTween(o, slot.x, slot.y, 0.25, k * 0.12, () => { o.flipTo = true; pvFlip(o, () => pvUpdateHandName()); });
    });
    pvLog(`<span class="dim">${{ flop: 'Flop', turn: 'Turn', river: 'River' }[ev.street]}: ${ev.board.map(pkCardHtml).join(' ')}</span>`, 'sys');
    return (ev.street === 'flop' ? 1 : 0.7) + (PV.runout ? 0.7 : 0);
  },
  runout() {
    PV.runout = true;
    PV.winText = { text: 'ALL IN', x: PTX, y: PTY - 26, t: 0 };
    return 0.6;
  },
  reveal(ev) {
    const v = PV.seats[ev.seat];
    if (ev.seat !== 0) v.cards.forEach(o => { o.flipTo = true; pvFlip(o); });
    if (ev.seat === 0) v.cards.forEach(o => { o.grey = false; });
    pvLog(`${pkWho(ev.seat)} ${pkV(ev.seat, 'shows')} ${ev.cards.map(pkCardHtml).join(' ')}${ev.seven ? ' (seven deuce!)' : ''}`);
    if (ev.seat !== 0) pvPose(ev.seat, 'reach', 0.3, seatAt(ev.seat, 'cards'));
    return PV.runout ? 0.4 : 0.6;
  },
  showdown() { PV.winText = null; return 0.25; },
  win(ev) {
    const v = PV.seats[ev.seat];
    PV.pot = Math.max(0, PV.pot - ev.amount);
    pvFly(ev.amount, { x: PTX, y: PTY + 28 }, seatAt(ev.seat, 'stack'), 0.5, 0.1, () => { v.stack += ev.amount; sfx.pkChips(ev.amount); });
    PV.wins.push(ev);
    const p = seatAt(ev.seat, 'cards');
    PV.winText = { text: `${PK_NAMES[v.id].toUpperCase()} ${pkV(ev.seat, ev.split ? 'splits' : 'wins').toUpperCase()} ${pkDollars(ev.amount)}`, sub: ev.name || '', x: PTX, y: PTY - 26, t: 0 };
    if (ev.name) v.cards.forEach(o => { o.glow = true; });
    pvLog(`${pkWho(ev.seat)} ${pkV(ev.seat, ev.split ? 'splits' : 'wins')} ${ev.side ? 'a side pot of ' : ''}${pkDollars(ev.amount)}${ev.name ? ` with ${ev.name}` : ''}`, 'win');
    if (ev.seat === 0) sfx.pkWin();
    pvMood(ev.seat, ev.seat === 5 || ev.seat === 4 ? 'grin' : 'happy', 2.5);
    void p;
    return PV.wins.length > 1 ? 0.8 : 1.15;
  },
  bust(ev) {
    const v = PV.seats[ev.seat];
    v.out = true; v.folded = true;
    pvLog(`${pkWho(ev.seat)} ${pkV(ev.seat, 'is')} out of the game`, 'bust');
    if (ev.seat !== 0) {
      pvMood(ev.seat, ev.seat === 5 ? 'grin' : ev.seat === 2 ? 'sad' : 'angry', 3);
      setTimeout(() => { if (PV) pvSayPick(ev.seat, 'bust', 1, null, true); }, 300);
    }
    return 1.2;
  },
  seven(ev) {
    const w = PV.seats[ev.seat];
    ev.paid.forEach(([i, n], k) => {
      const v = PV.seats[i];
      v.stack -= n;
      pvFly(n, seatAt(i, 'stack'), seatAt(ev.seat, 'stack'), 0.5, 0.1 + k * 0.12, () => { w.stack += n; sfx.pkChips(n); });
    });
    PV.winText = { text: 'SEVEN DEUCE!', sub: `${pkDollars(PK.SEVEN_DEUCE)} from everyone | ${pkDollars(ev.total)}`, x: PTX, y: PTY - 26, t: 0 };
    w.cards.forEach(o => { o.glow = true; o.grey = false; });
    pvLog(`${pkWho(ev.seat)} ${pkV(ev.seat, 'wins')} the seven deuce game: ${pkDollars(PK.SEVEN_DEUCE)} from everyone, ${pkDollars(ev.total)}`, 'win');
    if (ev.seat === 0) { sfx.pkWin(); if (!PV.T.seats[5].out) pvSayPick(5, 'seven', 1, null, true); }
    else if (ev.seat === 5) pvSayPick(5, 'sevenMine', 1, null, true);
    else pvSayPick(ev.seat, 'win', 1, null, true);
    // one of the payers grumbles about it
    const grumbler = ev.paid.map(x => x[0]).filter(i => i && i !== 5 && i !== ev.seat);
    if (grumbler.length && Math.random() < 0.6) pvSayPick(pkAny(grumbler), 'payOut', 1, null, true);
    return 1.6 + ev.paid.length * 0.12;
  },
  end(ev) { return pvAfterHand(ev); }
};
const pkCardHtml = c => `<span class="pk-c${PK_RED(c) ? ' red' : ''}">${PK_RANKS[c >> 2] === 'T' ? '10' : PK_RANKS[c >> 2]}${'♣♦♥♠'[c & 3]}</span>`;
// a card turning over: it narrows to nothing, swaps face, and widens again
function pvFlip(o, done) {
  o.flip = 0;
  o.flipDone = done || null;
  sfx.pkCard();
}
function pvFlips(dt) {
  const all = PV.board.concat(...PV.seats.map(v => v.cards));
  all.forEach(o => {
    if (o.flip === undefined || o.flip < 0) return;
    o.flip += dt / 0.22;
    if (o.flip >= 1) { o.flip = -1; o.up = o.flipTo; if (o.flipDone) { const f = o.flipDone; o.flipDone = null; f(); } }
  });
}

// reacting to an action: what they say (the decision's why picks the line),
// faces, and anyone with feelings about it
function pvReact(ev, why) {
  const i = ev.seat, id = PK_IDS[i], T = PV.T, M = T.ai.mood;
  const big = ev.kind === 'allin' || (ev.to && ev.to >= T.blinds.bb * 12);
  if (id === 'sparks') {
    if (['wildcall', 'wildshove', 'wildvalue', 'wild3', 'wild'].includes(why)) pvSayPick(i, why, why === 'wildcall' ? 0.45 : 0.85);
    else if (ev.kind === 'allin') pvSayPick(i, 'allin', 0.8);
  } else if (id === 'brutus') {
    if (why === 'tilt' && ev.kind !== 'call') pvSayPick(i, 'tilt', 0.55);
    else if (ev.kind === 'allin') pvSayPick(i, 'allin', 0.8);
    else if (why === 'wildbluff') pvSayPick(i, 'wildbluff', 0.8);
    else if (why === 'checkraise') pvSayPick(i, 'checkraise', 0.7);
    else if (why === 'bluff') pvSayPick(i, 'bluff', 0.4);
    else if (ev.kind === 'raise' || ev.kind === 'bet') pvSayPick(i, 'raise', 0.25);
    else if (ev.kind === 'fold') pvSayPick(i, 'fold', 0.15);
    if (ev.kind !== 'fold' && ev.kind !== 'check') pvMood(i, M.brutus.tilt ? 'fume' : 'angry', 1.5);
  } else if (id === 'neville') {
    if (why === 'scaredfold') { pvSayPick(i, 'scaredfold', 0.6); pvMood(i, 'scared', 1.5); }
    else if (why === 'overvalue') pvSayPick(i, 'overvalue', 0.7);
    else if (ev.kind === 'allin') { pvSayPick(i, 'allin', 0.9); pvMood(i, 'scared', 2); }
    else if (ev.kind === 'raise' || ev.kind === 'bet') pvSayPick(i, 'raise', 0.5);
    else if (ev.kind === 'fold') pvSayPick(i, 'fold', 0.2);
  } else if (id === 'brock') {
    if (why.startsWith('grudge')) { pvSayPick(i, why, 0.85); pvMood(i, 'smug', 2); }
    else if (ev.kind === 'allin') pvSayPick(i, 'allin', 0.7);
    else if ((ev.kind === 'raise' || ev.kind === 'bet') && T.street !== 'preflop' && pkInHand(T.seats[3]) && Math.random() < 0.3) pvSayPick(i, 'raise', 1);
    else if (ev.kind === 'raise') pvSayPick(i, 'raise', 0.2);
  } else if (id === 'ace') {
    if (why.startsWith('exploit_')) {
      const tg = PK_IDS.indexOf(why.slice(8));
      if (tg > 0 && !pkInHand(T.seats[0])) pvBanter(3, why, tg, 'toAceExploit');
    } else if (ev.kind === 'allin') pvSayPick(i, 'allin', 0.6);
    else if (ev.kind === 'raise' || ev.kind === 'bet') pvSayPick(i, 'raise', 0.2, { x: pkDollars(ev.to) });
  }
  // brock folding to ace in a hand the two of them are in: she can't resist
  if (i === 4 && ev.kind === 'fold' && T.aggressor === 3 && T.seats[4].vol && pkInHand(T.seats[3]) && !pkInHand(T.seats[0]) && Math.random() < 0.3) pvBanter(3, 'vsBrock', 4, 'toAce');
  // and now and then a word when they call
  if (ev.kind === 'call' && id !== 'you' && !PV.bubbles.some(bb => bb.seat === i)) pvSayPick(i, 'call', 0.1);
  // neville gets nervous when you or ace put money in against him (and ace,
  // if he says so, answers him)
  if ((i === 0 || i === 3) && (ev.kind === 'raise' || ev.kind === 'bet' || ev.kind === 'allin') && pkInHand(T.seats[2]) && !T.seats[2].allIn) {
    pvMood(2, 'scared', 2.5);
    if (Math.random() < 0.4) {
      if (i === 0) pvSayPick(2, 'vsYou', 1);
      else if (pvTogether(2, 3)) pvBanter(2, 'vsAce', 3, 'toNeville');
    }
  }
  // sparks needles brutus whenever he's steaming, and they go at each other
  // when they're in a hand together
  if (i === 1 && big && Math.random() < 0.35 && (M.brutus.tilt || pvTogether(1, 5))) pvBanter(5, 'tauntBrutus', 1, 'vsSparks');
  else if (i === 5 && big && Math.random() < 0.3 && pvTogether(1, 5)) pvBanter(1, 'vsSparks', 5, 'toBrutus');
}
// a bit of table talk now and then at the start of a hand
// between hands the only one who can't keep quiet is sparks, and only when
// brutus is steaming (who answers him, every time)
function pvChatter() {
  const T = PV.T;
  if (T.ai.mood.brutus.tilt && !T.seats[1].out && !T.seats[5].out && Math.random() < 0.25) pvBanter(5, 'tauntBrutus', 1, 'vsSparks');
}
// after a hand: winners and losers react, moods change (with brutus's steam,
// brock's slam, and cards thrown at ace), and the game's saved
function pvAfterHand() {
  const T = PV.T, res = T.ai.results || { net: [0, 0, 0, 0, 0, 0], events: [] };
  let extra = 0;
  const net = res.net, ws = PV.wins.map(w => w.seat);
  const top = ws.length ? ws.reduce((a, b) => (net[b] > net[a] ? b : a)) : -1;
  const losers = net.map((n, i) => [n, i]).filter(([n]) => n < 0).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  const bigPot = Math.max(...net.map(Math.abs)) >= T.blinds.bb * 10;
  const ev = res.events;
  const later = (fn, ms) => setTimeout(() => { if (PV && !PV.closing) fn(); }, ms / PV.speed);
  const alive = i => !T.seats[i].out;
  // the biggest loser among the miners, for who reacts
  const victim = losers.find(i => i > 0 && alive(i));
  if (top === 0 && bigPot && victim !== undefined) {
    // you beat them: whoever lost the most to you has something to say to you,
    // and only them, so they don't all talk at once
    if (victim === 4) {
      later(() => {
        pvPose(4, 'slam', 0.7);
        pvMood(4, 'angry', 3);
        setTimeout(() => { if (PV) { PV.shake = 3; sfx.pkSlam(); pvSayPick(4, Math.random() < 0.5 ? 'loseYou' : 'beatenByYou', 1, null, true); } }, 330 / PV.speed);
      }, 600);
      extra += 0.8;
    } else if (victim === 3) {
      PQ.respect = T.ai.mood.ace.respect;
      pvMood(3, 'shock', 2.5);
      pvSayPick(3, T.ai.mood.ace.respect >= 3 ? 'impressed' : Math.random() < 0.5 ? 'shocked' : 'beatenByYou', 1, null, true);
    } else {
      pvMood(victim, victim === 2 ? 'sad' : victim === 1 ? (T.ai.mood.brutus.tilt ? 'fume' : 'angry') : 'grin', 2.5);
      pvSayPick(victim, 'beatenByYou', victim === 5 ? 0.7 : 0.9, null, true);
    }
  } else if (top > 0 && bigPot) {
    // a miner won it. if you weren't in it, the two of them might have words
    // (and the other one always answers); otherwise the winner just crows
    const id = PK_IDS[top], beat = victim;
    let said = false;
    if (beat !== undefined && pvTogether(top, beat)) {
      if (id === 'brock' && beat === 3) said = pvBanter(4, 'beatAce', 3, 'toBrockWin');
      else if (id === 'ace' && beat === 4) {
        pvPose(4, 'slam', 0.7); setTimeout(() => { if (PV) { PV.shake = 3; sfx.pkSlam(); } }, 330 / PV.speed);
        said = pvBanter(4, 'loseAce', 3, 'toBrockLose'); extra += 0.6;
      } else if (id === 'brutus' && beat === 5) said = pvBanter(1, 'beatSparks', 5, 'toBrutus');
      else if (id === 'sparks' && beat === 1) said = pvBanter(5, 'beatBrutus', 1, 'toSparksLoss');
      else if (id === 'sparks' && beat === 4) said = pvBanter(5, 'tauntBrock', 4, 'toSparks');
      else if (id === 'sparks' && beat === 2) said = pvBanter(5, 'tauntNeville', 2, 'toSparks');
      else if (id === 'sparks' && beat === 3 && Math.random() < 0.5) said = pvBanter(5, 'tauntAce', 3, 'toSparks');
      else if (beat === 3) said = pvBanter(3, 'praise_' + id, top, 'thanks');
    }
    if (!said) {
      if (id === 'brock' && losers.includes(0)) pvSayPick(top, 'beatYou', 0.7, null, true);
      else pvSayPick(top, 'win', 0.45, null, true);
    }
  }
  if (losers.includes(2) && bigPot && alive(2)) pvMood(2, 'sad', 2.5);
  if (losers.includes(1) && bigPot && alive(1)) pvMood(1, T.ai.mood.brutus.tilt ? 'fume' : 'angry', 2);
  // brutus's moods
  if (ev.includes('brutusTilt')) {
    later(() => {
      pvMood(1, 'fume', 3);
      const why = T.ai.mood.brutus.why;
      pvSayPick(1, { cardDead: 'tiltCardDead', unlucky: 'tiltUnlucky', seven: 'tiltSeven', shown: 'tiltShown' }[why] || 'tiltStart', 1, null, true);
      if (pvTogether(1, 3) && Math.random() < 0.7) pvBanter(3, 'tilt', 1, 'breathe');
    }, 900);
    extra += 1.2;
  }
  if (ev.includes('brutusThrow') && !PV.seats[3].out) {
    later(() => pvThrow(), 900);
    extra += 2;
  }
  if (ev.includes('brutusCalm')) later(() => pvSayPick(1, 'calm', 1, null, true), 1200);
  else if (T.ai.mood.brutus.tilt && T.ai.mood.brutus.wins === 1 && !ev.includes('brutusTilt') && Math.random() < 0.5) later(() => pvSayPick(1, 'stillTilt', 1, null, true), 1200);
  if (ev.includes('brockSeven') && alive(4)) {
    later(() => {
      pvPose(4, 'slam', 0.7); pvMood(4, 'angry', 3);
      setTimeout(() => { if (PV) { PV.shake = 3; sfx.pkSlam(); pvSayPick(4, 'seven', 1, null, true); } }, 330 / PV.speed);
    }, 1400);
    extra += 0.8;
  }
  // showing cards: you can for a moment, and some of them do
  extra += pvShowsAfter(res, top, losers);
  if (ev.includes('sparksSettle')) later(() => pvSayPick(5, 'settle', 1, null, true), 1500);
  if (ev.includes('sparksWild')) later(() => pvSayPick(5, 'goWild', 1, null, true), 1500);
  if (ev.includes('brockGrudge')) PQ.grudge = T.ai.mood.brock.grudge;
  // save where the game's at, unless it's over
  const live = T.seats.filter(s => !s.out);
  if (T.seats[0].out || live.length <= 1) PQ.table = null;
  else PQ.table = { stacks: T.seats.map(s => s.stack), button: T.button, hand: T.hand, mood: T.ai.mood, stats: T.ai.stats };
  markDirty();
  if (T.seats[0].out) { PV.gameOver = 'bust'; PV.beater = top > 0 ? top : 3; }
  else if (live.length === 1) PV.gameOver = 'win';
  return 1.5 + extra;
}
function pvShowsAfter(res, top, losers) {
  const T = PV.T, net = res.net, board = T.board.slice();
  const you = T.seats[0];
  PV.showInfo = null;
  if (you.cards && !you.shown && !you.out) {
    PV.showInfo = { cards: you.cards.slice(), board, bluff: pkWeak(you.cards, board) && net[0] > 0,
      lost: losers.filter(i => i > 0), folded: T.seats.filter(o => o.i && o.cards && o.folded && o.total > 0).map(o => o.i) };
    pkUI.show.disabled = false;
    pkUI.show.hidden = false;
  }
  // one of them shows, at most, and only when nobody saw it at a showdown
  if (res.showdown || top <= 0) return PV.showInfo ? 0.8 : 0;
  const w = T.seats[top], id = w.id, M = T.ai.mood, weak = pkWeak(w.cards, board);
  let shows = false, line = null;
  if (id === 'sparks') shows = Math.random() < 0.45;
  else if (id === 'brock' && weak) { shows = true; line = losers.includes(0) || T.seats[0].folded && T.seats[0].total > 0 ? 'showBluffYou' : 'showBluff'; }
  else if (id === 'brutus') shows = !M.brutus.tilt && w.stack >= PK.START * 1.4 && Math.random() < 0.5;
  else if (id === 'neville' && !T.seats[5].out && Math.random() < 0.6) {
    pvSayPick(5, 'askNeville', 1, null, true);
    shows = Math.random() < 0.8;
  }
  if (!shows) return PV.showInfo ? 0.8 : 0;
  pvShowCards(top);
  pvSayPick(top, line || 'show', 1, null, true);
  return 1.2;
}
// someone turns their cards over after the hand
function pvShowCards(i) {
  const v = PV.seats[i], c = PV.T.seats[i].cards;
  if (!c) return;
  if (i === 0) {
    v.cards.forEach(o => { o.grey = false; o.a = 1; o.glow = true; });
    pvTween(v.cards[0], v.cards[0].x, v.cards[0].y - 3, 0.2);
    pvTween(v.cards[1], v.cards[1].x, v.cards[1].y - 3, 0.2);
  } else v.cards.forEach(o => { if (!o.up) { o.flipTo = true; pvFlip(o); } });
  pvLog(`${pkWho(i)} ${pkV(i, 'shows')} ${c.map(pkCardHtml).join(' ')}`);
}
// you show yours: the table takes notice (see pkAiYouShowed), and they let
// you know what they think of it
function pvYouShow() {
  const info = PV && PV.showInfo;
  if (!info) return;
  PV.showInfo = null;
  pkUI.show.disabled = true;
  sfx.ui();
  pvShowCards(0);
  const out = pkAiYouShowed(PV.T, info.bluff, info.lost, info.folded);
  const alive = i => !PV.T.seats[i].out;
  if (alive(5)) pvSayPick(5, 'knows', 1, null, true);
  if (out.includes('brutusShown') && alive(1)) { pvMood(1, 'fume', 3); pvSayPick(1, 'seeBluff', 1, null, true); }
  else if (out.includes('brockShown') && alive(4)) { pvMood(4, 'angry', 2.5); pvSayPick(4, 'seeShow', 1, null, true); }
  else if (alive(2) && info.lost.concat(info.folded).includes(2)) { pvMood(2, 'scared', 2.5); pvSayPick(2, info.bluff ? 'seeBluff' : 'seeValue', 1, null, true); }
  if (alive(3) && Math.random() < 0.6) pvSayPick(3, 'noted', 1, null, true);
  if (out.includes('brutusTilt')) pvSayPick(1, 'tiltShown', 1, null, true);
  PQ.grudge = PV.T.ai.mood.brock.grudge;
  PV.wait = Math.max(PV.wait, 2.2);
  markDirty();
}

// brutus, on tilt and losing, throws his cards at ace, and she tells him off
function pvThrow() {
  const b = seatAt(1, 'body'), a = seatAt(3, 'body');
  pvPose(1, 'throw', 0.5, a);
  pvMood(1, 'fume', 3);
  pvSayPick(1, 'throw', 1, null, true);
  [0, 1].forEach(k => {
    const p = { card: true, x: b.x + 6, y: b.y - 16, vx: (a.x - b.x) / 0.55 + (k ? 12 : -10), vy: (a.y - 14 - b.y) / 0.55 - 30, g: 110, life: 0.55, t: 0, spin: k };
    PV.parts.push(p);
  });
  sfx.pkFold();
  setTimeout(() => {
    if (!PV) return;
    pvMood(3, 'angry', 2.5);
    PV.shake = 1;
    pvBanter(3, 'chastise', 1, 'sorry');
  }, 650);
}

// whose go is it: the bots think for a moment (neville keeps looking from
// whoever he's up against to his cards and back before he does anything) and
// you get your buttons
function pvAiThink(dt) {
  const T = PV.T, seat = T.toAct, id = PK_IDS[seat], v = PV.seats[seat], M = T.ai.mood;
  if (!PV.think) {
    const d = pkDecide(T, seat), L = pkLegal(T, seat);
    const bigSpot = L.toCall > (T.seats[seat].stack + T.seats[seat].bet) * 0.25 || (d.type === 'raise' && d.to >= T.seats[seat].stack + T.seats[seat].bet);
    let t = { ace: 0.9 + Math.random() * 0.5, brutus: M.brutus.tilt ? 0.35 + Math.random() * 0.3 : 0.6 + Math.random() * 0.5, neville: 1 + Math.random() * 0.6, brock: 0.8 + Math.random() * 0.5, sparks: M.sparks.wild ? 0.4 + Math.random() * 0.45 : 0.8 + Math.random() * 0.4 }[id];
    if (bigSpot) t += 0.7;
    // neville hesitates when he's facing a bet, or up against you or ace
    const agg = T.aggressor >= 0 ? T.aggressor : 0;
    const hes = id === 'neville' && (L.toCall > 0 || pkInHand(T.seats[0]) || pkInHand(T.seats[3]));
    if (hes) t = 2.5;
    PV.think = { seat, d, t, t0: t, hes, agg };
    if (id === 'ace' && bigSpot) pvMood(3, 'think', t);
    if (id === 'brock' && Math.random() < 0.3) pvPose(4, 'chin', t);
    return;
  }
  const th = PV.think;
  th.t -= dt;
  if (th.hes) {
    // look at them, at the cards, at them, at the cards, at them, and decide
    const k = Math.floor((th.t0 - th.t) / 0.42);
    const opp = th.agg === 2 ? 0 : th.agg;
    const dir = seatAt(opp, 'body').x < seatAt(2, 'body').x ? -1 : 1;
    v.look = k % 2 === 0 ? dir : 2;
    v.lookT = 0.5;
    if (k === 0 && (opp === 0 || opp === 3)) pvMood(2, 'scared', 3);
  }
  if (th.t > 0) return;
  PV.think = null;
  PV.lastWhy[seat] = th.d.why;
  v.look = 0;
  pkAct(T, seat, th.d);
}
function pvStep(dt) {
  if (PV.scene || PV.modal || PV.gameOverRun) return;
  PV.wait -= dt;
  if (PV.wait > 0) return;
  const T = PV.T;
  if (T.ev.length) { const ev = T.ev.shift(), h = PV_EV[ev.t]; PV.wait = h ? h(ev) : 0; return; }
  if (T.over) {
    if (PV.gameOver) { PV.gameOverRun = true; pvGameOver(PV.gameOver); return; }
    if (PV.leaving) { PV.gameOverRun = true; pvLeaveNow(); return; }
    pkStartHand(T, (seat, TT) => (seat === 0 ? !!PV.youStraddle && TT.seats[0].stack > TT.blinds.straddle * 2 : pkAiStraddle(TT, seat)));
    return;
  }
  if (T.toAct === 0) { if (!PV.human) pvShowControls(); return; }
  if (T.toAct > 0) pvAiThink(dt);
}

// conversations at the table: a box along the bottom, typed out a letter at a
// time in each speaker's voice, click, space or enter to go on. steps are
// { who: seat, text, mood }, { you: text } or { act, wait }.
const pkTalk = $('#pk-talk'), pkTalkName = $('#pk-talk-name'), pkTalkText = $('#pk-talk-text');
function pvScene(steps, done) {
  PV.scene = { steps, i: -1, t: 0, done };
  pvHideControls();
  pvSceneNext();
}
function pvSceneNext() {
  const sc = PV.scene;
  sc.i++;
  if (sc.i >= sc.steps.length) {
    PV.scene = null;
    PV.speaker = -1;
    pkTalk.hidden = true;
    if (sc.done) sc.done();
    return;
  }
  const st = sc.steps[sc.i];
  sc.t = 0; sc.shown = -1;
  if (st.act) { pkTalk.hidden = true; PV.speaker = -1; st.act(); return; }
  pkTalk.hidden = false;
  pkTalk.classList.toggle('is-reply', !!st.you);
  const id = st.you ? 'you' : PK_IDS[st.who];
  pkTalkName.textContent = st.you ? 'You' : st.name || PK_NAMES[id];
  pkTalkName.style.color = st.you ? '#f6ecd0' : PK_COLOR[id];
  pkTalkText.textContent = '';
  PV.speaker = st.you ? 0 : st.who;
  if (!st.you && st.mood) pvMood(st.who, st.mood, 4);
  if (st.look !== undefined && !st.you) { PV.seats[st.who].look = st.look; PV.seats[st.who].lookT = 3; }
  if (st.all) PV.seats.forEach(v => { if (v.i) { v.look = st.all; v.lookT = 2.5; } });
}
function pvSceneTick(dt) {
  const sc = PV && PV.scene;
  if (!sc) return;
  const st = sc.steps[sc.i];
  sc.t += dt;
  if (st.act) { if (sc.t >= (st.wait || 0)) pvSceneNext(); return; }
  const text = st.text || st.you;
  const n = st.you ? text.length : Math.min(text.length, Math.floor(sc.t * 44));
  if (n !== sc.shown) {
    const was = sc.shown;
    sc.shown = n;
    pkTalkText.textContent = (st.you ? '▶ ' : '') + text.slice(0, n);
    if (!st.you && n > was && /[a-z0-9]/i.test(text[n - 1] || '') && n % 2 === 0) sfx.pkVoice(PK_IDS[st.who]);
    if (!st.you) PV.seats[st.who].talkT = n < text.length ? 0.2 : 0;
  }
}
function pvSceneAdvance() {
  const sc = PV && PV.scene;
  if (!sc) return;
  const st = sc.steps[sc.i];
  if (st.act) return;
  const text = st.text || st.you;
  if (!st.you && sc.t * 44 < text.length) { sc.t = text.length / 44; return; }
  if (st.you) sfx.you(text); else sfx.ui();
  pvSceneNext();
}
pkTalk.addEventListener('click', () => pvSceneAdvance());

// the rules: up before every game you sit down to, and on R any time
const pkRulesEl = $('#pk-rules');
function pvRules(open, then) {
  if (!PV) return;
  PV.rulesOpen = open;
  pkRulesEl.hidden = !open;
  PV.modal = open || !!PV.buyin;
  if (open) { PV.rulesThen = then || PV.rulesThen || null; setTimeout(() => $('#pk-rules-go').focus(), 40); }
  else if (PV.rulesThen) { const f = PV.rulesThen; PV.rulesThen = null; f(); }
}
$('#pk-rules-go').addEventListener('click', () => { sfx.ui(); pvRules(false); });

// your ores: ingots or raw, they're all money down here (the miners smelt it
// themselves)
const PK_ITEM = { iron: ['iron', 'iron-ore'], gold: ['gold', 'gold-ore'], ruby: ['ruby'], emerald: ['emerald'], diamond: ['diamond'] };
function pkWealth() { return PK_ORES.reduce((n, o) => n + PK_ITEM[o].reduce((m, id) => m + countItem(id), 0) * PK_VAL[o], 0); }
// paying in: the biggest ores first, without going over, then one bigger
// piece if it's needed, with the change given back in smaller ores
function pkTakeOre(amount) {
  let need = amount;
  PK_ORES.slice().reverse().forEach(o => PK_ITEM[o].forEach(id => {
    const v = PK_VAL[o], k = Math.min(countItem(id), Math.floor(need / v));
    if (k > 0) { takeItem(id, k); need -= k * v; }
  }));
  if (need > 0) {
    for (const o of PK_ORES) {
      const id = PK_ITEM[o].find(x => countItem(x) > 0);
      if (id && PK_VAL[o] >= need) { takeItem(id, 1); pkPayout(PK_VAL[o] - need, true); need = 0; break; }
    }
  }
  afterInventoryChange();
}
// cashing out: the chips go back into your bag as ores, the same mix as the
// stack looked on the table
function pkPayout(n, quiet) {
  if (n <= 0) return;
  const c = pkChips(n);
  PK_ORES.forEach(o => { if (c[o]) addItem(o, c[o]); });
  if (!quiet) toast('Cashed out', pkDollars(n), PK_ORES.filter(o => c[o]).map(o => `${c[o]} ${ITEMS[o].name}`).join(', '));
}

// the buy in, for every visit after the first: as much as you like up to 100
// big blinds, at least one
const pkBuyEl = $('#pk-buyin'), pkBuySlider = $('#pk-buy-slider'), pkBuyAmt = $('#pk-buy-amount');
function pvBuyIn(done) {
  const have = pkWealth(), max = Math.min(PK.MAX_BUYIN, have);
  PV.buyin = { done };
  PV.modal = true;
  pkBuyEl.hidden = false;
  $('#pk-buy-have').textContent = `You have ${pkDollars(have)} in ore`;
  pkBuySlider.min = PK.MIN_BUYIN; pkBuySlider.max = max; pkBuySlider.value = max;
  pkBuyAmt.textContent = pkDollars(max);
  setTimeout(() => $('#pk-buy-go').focus(), 40);
}
pkBuySlider.addEventListener('input', () => { pkBuyAmt.textContent = pkDollars(+pkBuySlider.value); });
$('#pk-buy-go').addEventListener('click', () => {
  if (!PV || !PV.buyin) return;
  const n = clamp(Math.round(+pkBuySlider.value), PK.MIN_BUYIN, Math.min(PK.MAX_BUYIN, pkWealth()));
  const done = PV.buyin.done;
  PV.buyin = null; PV.modal = false;
  pkBuyEl.hidden = true;
  sfx.ui();
  pkTakeOre(n);
  done(n);
});
$('#pk-buy-back').addEventListener('click', () => {
  if (!PV) return;
  PV.buyin = null; PV.modal = false;
  pkBuyEl.hidden = true;
  pvClose();
});

// opening the table: the view, a game (fresh or the one you left), and the
// music. it starts paused until the rules are read.
let pkRaf = 0, pkLast = 0;
function pvOpen() {
  pvLayout();
  PV = {
    T: pkTable(PK_IDS.map((_, i) => (i ? PK.START : 0))), seats: null, board: [], pot: 0, movers: [], flights: [], bubbles: [], parts: [], wait: 0.4,
    think: null, human: false, scene: null, modal: false, lastWhy: [], speed: 1, fast: false, shake: 0, time: 0, deck: true, buttonAt: null,
    speaker: -1, wins: [], started: false, youStraddle: false, sayQ: []
  };
  pkAiInit(PV.T);
  PV.seats = pvSeats(PV.T);
  pkChat.innerHTML = '';
  pkUI.straddle.checked = false;
  pkUI.show.hidden = true;
  pkUI.fast.classList.remove('is-on');
  pvHideControls();
  pkRoot.hidden = false;
  document.body.classList.add('is-poker');
  pkLast = performance.now();
  cancelAnimationFrame(pkRaf);
  pkRaf = requestAnimationFrame(pvLoop);
  bossMusic(true, POKER_TUNE);
}
function pvClose() {
  if (!PV) return;
  const won = PV.gameOver === 'win';
  PV.closing = true;
  pkRoot.hidden = true;
  pkTalk.hidden = true; pkRulesEl.hidden = true; pkBuyEl.hidden = true;
  document.body.classList.remove('is-poker');
  cancelAnimationFrame(pkRaf);
  PV = null;
  if (musicOn && musicTune === POKER_TUNE) bossMusic(false);
  renderHUD();
  markDirty();
  if (won && !found.has('desperate')) setTimeout(() => { victoryJingle(); discover(desperatePoi); }, 400);
}
function pvLoop(ts) {
  if (!PV) return;
  const raw = Math.min(0.05, Math.max(0, (ts - pkLast) / 1000));
  pkLast = ts;
  // quicker when you're not in the hand, and quicker again with fast on
  const out = !PV.T.seats[0] || PV.T.seats[0].folded || PV.T.seats[0].out;
  PV.speed = (PV.fast ? 2.2 : 1) * (out && PV.started && !PV.scene ? 1.7 : 1);
  const dt = raw * PV.speed;
  pvTick(dt);
  pvSceneTick(raw);
  if (PV && PV.started) pvStep(dt);
  if (PV) pvDraw(ts);
  if (PV && PV.speaker >= 0) {
    // a little marker over whoever's talking in a conversation
    const b = seatAt(PV.speaker, 'body'), y = b.y - (PV.speaker === 0 ? 46 : MINER_H + 6) - (Math.floor(ts / 250) % 2);
    pRect(b.x - 2, y, 5, 1, '#ffd23f'); pRect(b.x - 1, y + 1, 3, 1, '#ffd23f'); pRect(b.x, y + 2, 1, 1, '#ffd23f');
  }
  if (PV) pkRaf = requestAnimationFrame(pvLoop);
}
window.addEventListener('resize', () => { if (PV) pvLayout(); });

// a game: you in seat 0 with what you brought, everyone else at 200 iron (or
// where they were if you're picking up a game you left)
function pvNewGame(youStack) {
  const T = pkTable(PK_IDS.map((_, i) => (i ? PK.START : youStack)));
  const mood = pkMood();
  mood.brock.grudge = Math.min(4, PQ.grudge * 0.5);
  mood.ace.respect = PQ.respect;
  pkAiInit(T, mood);
  PV.T = T;
  PV.seats = pvSeats(T);
  PQ.table = { stacks: T.seats.map(s => s.stack), button: -1, hand: 0, mood, stats: T.ai.stats };
  markDirty();
}
function pvResume(saved) {
  const T = pkTable(saved.stacks);
  T.button = saved.button; T.hand = saved.hand;
  pkAiInit(T, Object.assign(pkMood(), saved.mood));
  if (Array.isArray(saved.stats) && saved.stats.length === 6) T.ai.stats = saved.stats;
  PV.T = T;
  PV.seats = pvSeats(T);
}
function pvBegin() {
  pvRules(true, () => {
    PV.started = true;
    PV.wait = 0.3;
    pvLog('<span class="dim">Ace shuffles up and deals.</span>', 'sys');
  });
}

// the first time: they're mid argument when you walk up, notice you, and
// sparks offers you a seat and a stack on the house
const PK_OPENERS = [
  [{ who: 1, text: 'Deal the cards, Ace. I\'ve been waiting all day.', mood: 'angry' }, { who: 3, text: 'You\'ve been waiting forty seconds.' },
    { who: 5, text: 'Strawberry Jam! New hand, new me!', mood: 'grin' }, { who: 4, text: 'Same old you. Same old losing.', mood: 'smug' }],
  [{ who: 4, text: 'I\'m telling you, I had him. It was a perfect bluff.', mood: 'smug' }, { who: 3, text: 'You bluffed into a full house, Brock.' },
    { who: 4, text: 'A PERFECT bluff.' }, { who: 5, text: 'Hahaha! He called so fast!', mood: 'grin' }],
  [{ who: 2, text: 'Is it hot in here? It\'s hot in here.', mood: 'scared' }, { who: 1, text: 'We\'re sitting next to LAVA, Neville.', mood: 'angry' },
    { who: 2, text: 'Right. Right. That explains it.' }, { who: 3, text: 'Your blind, Neville.' }]
];
function pvIntro() {
  const opener = pkAny(PK_OPENERS);
  pvScene([
    ...opener,
    { who: 2, text: 'Um. Guys. Someone\'s here.', mood: 'scared', look: 2 },
    { act: () => { PV.seats.forEach(v => { if (v.i) { v.look = 2; v.lookT = 3; } }); pvMood(5, 'shock', 1.5); }, wait: 0.7 },
    { who: 5, text: 'Whoa! A visitor! Nobody ever comes down here!', mood: 'grin' },
    { who: 4, text: 'Great. Another tourist.', mood: 'smug' },
    { who: 5, text: 'Hey, you play poker? Course you do. Everybody plays poker.', mood: 'grin' },
    { you: 'I don\'t really play that much poker...' },
    { who: 4, text: 'Ha! A beginner. Perfect. Easy ore.', mood: 'grin' },
    { who: 5, text: 'Even better! Grab a seat! Your first stack\'s on me!', mood: 'grin' },
    { who: 3, text: 'Sparks. That\'s my ore you\'re giving away.', mood: 'angry' },
    { who: 5, text: 'It\'s OUR ore. Communal ore. Strawberry Jam ore.', mood: 'grin' },
    { who: 3, text: '...Fine. Twenty thousand in ore. No limit hold\'em, last one standing.' },
    { who: 1, text: 'And no crying when you lose it.', mood: 'angry' },
    { you: 'What do I get if I win?' },
    { who: 3, text: 'Nobody\'s beaten this table in years.', mood: 'smug' },
    { who: 3, text: 'But if you do, I have a key that opens a door nobody\'s opened in a very long time.' },
    { who: 5, text: 'Ooooh. Spooky. Sit, sit!', mood: 'grin' }
  ], () => {
    PQ.met = true;
    PQ.visits++;
    pvNewGame(PK.START);
    toast('On the house', pkDollars(PK.START), '1 Diamond, 1 Emerald, 4 Rubies, 6 Gold, 10 Iron');
    pvBegin();
  });
}
// coming back: whoever knocked you out last time has something to say about
// it, then it's your own ore this time
function pvReturn() {
  const b = PQ.lastBeater, steps = [];
  if (PQ.won) steps.push({ who: 1, text: 'YOU. Sit down. I want my ore back.', mood: 'fume' }, { who: 3, text: 'The champion returns.', mood: 'smug' });
  else if (b === 'brutus') steps.push({ who: 1, text: 'Back for another beating? I\'ll take your ore again.', mood: 'angry' }, { who: 3, text: 'Good to see you. Try again, you\'ll get him.' });
  else if (b === 'neville') steps.push({ who: 2, text: 'Oh no, you\'re back. I-I didn\'t mean to knock you out last time!', mood: 'scared' }, { who: 3, text: 'You can beat him. Try again.' });
  else if (b === 'brock') steps.push({ who: 4, text: 'Look who crawled back. Rookie wants another lesson.', mood: 'grin' }, { who: 3, text: 'Ignore him. Try again.' });
  else if (b === 'sparks') steps.push({ who: 5, text: 'My favourite donor! Kidding, kidding. Sit down!', mood: 'grin' }, { who: 3, text: 'Try again. You were close.' });
  else if (b === 'ace') steps.push({ who: 3, text: 'You came back. Good. Did you learn anything?', mood: 'smug' }, { who: 3, text: 'Try again.' });
  else steps.push({ who: 5, text: 'Hey, it\'s you! Welcome back!', mood: 'grin' }, { who: 3, text: 'Ready for another go?' });
  steps.push({ who: 5, text: 'No free stack this time though. Bring your own ore!', mood: 'grin' });
  const have = pkWealth();
  if (have < PK.MIN_BUYIN) {
    steps.push({ who: 4, text: `You need at least ${pkDollars(PK.MIN_BUYIN)} in ore to sit down. That's one big blind, rookie.`, mood: 'smug' },
      { who: 5, text: 'Go mine something and come back!', mood: 'grin' });
    pvScene(steps, () => pvClose());
    return;
  }
  if (have < 10) steps.push({ who: 4, text: `That's it? ${pkDollars(have)}? Adorable.`, mood: 'grin' }, { who: 3, text: 'Ore is ore. Let them sit.' });
  pvScene(steps, () => {
    PQ.visits++;
    pvBuyIn(n => { pvNewGame(n); pvBegin(); });
  });
}
function pokerSit() {
  if (PV) return;
  pvOpen();
  if (PQ.table && Array.isArray(PQ.table.stacks) && PQ.table.stacks.length === 6 && PQ.table.stacks[0] > 0) {
    pvResume(PQ.table);
    pvScene([{ who: 5, text: 'Your seat\'s still warm! Where\'d you go?', mood: 'grin' }, { who: 3, text: 'Let\'s carry on.' }], () => pvBegin());
  } else if (!PQ.met) pvIntro();
  else pvReturn();
}

// leaving: you stand up after the hand you're in, and take your stack with you
let pkLeaveAsk = 0;
function pvAskLeave() {
  if (!PV || !PV.started || PV.gameOverRun) { if (PV && !PV.started && !PV.scene) pvClose(); return; }
  if (performance.now() - pkLeaveAsk > 2500) {
    pkLeaveAsk = performance.now();
    pkUI.leave.textContent = 'Sure?';
    setTimeout(() => { pkUI.leave.textContent = 'Leave'; }, 2500);
    return;
  }
  pkUI.leave.textContent = 'Leaving...';
  PV.leaving = true;
  if (PV.human) pvHuman(PV.legal.canCheck ? 'check' : 'fold');
}
function pvLeaveNow() {
  const n = PV.T.seats[0].stack;
  pvScene([
    { who: 3, text: 'Cashing out? Fair enough.' },
    { who: 4, text: 'Running away already, rookie?', mood: 'smug' }
  ], () => {
    PQ.table = null;
    pkPayout(n);
    pkUI.leave.textContent = 'Leave';
    pvClose();
  });
}
// the end of a game: you went bust, or you're the last one standing
function pvGameOver(kind) {
  pvHideControls();
  if (kind === 'bust') {
    const b = PV.beater, id = PK_IDS[b];
    PQ.busts++;
    PQ.lastBeater = id;
    PQ.table = null;
    const gloat = {
      brutus: [{ who: 1, text: 'HA! Get out of my sight!', mood: 'grin' }],
      neville: [{ who: 2, text: 'I\'m so sorry! Wait. I won? I won!', mood: 'happy' }],
      brock: [{ who: 4, text: 'And THAT is why you don\'t play with the big boys, rookie.', mood: 'grin' }],
      sparks: [{ who: 5, text: 'Strawberry Jam! Don\'t worry, ore always comes back around!', mood: 'grin' }],
      ace: [{ who: 3, text: 'Good game. You played better than you think.', mood: 'happy' }]
    }[id] || [];
    pvScene([...gloat, { who: 3, text: 'Come back when you\'ve got more ore. The seat\'s yours.' }], () => pvClose());
    return;
  }
  // you won. they argue, sparks laughs, and ace gives you the key
  const n = PV.T.seats[0].stack;
  PQ.won = true;
  PQ.wins++;
  PQ.table = null;
  pvScene([
    { act: () => { pvPose(4, 'slam', 0.7); setTimeout(() => { if (PV) { PV.shake = 3; sfx.pkSlam(); } }, 300); }, wait: 0.8 },
    { who: 4, text: 'This is YOUR fault, Brutus! You handed them half your stack!', mood: 'angry' },
    { who: 1, text: 'MY fault? You five bet a beginner with nine four!', mood: 'fume' },
    { who: 4, text: 'It was SUITED!', mood: 'angry' },
    { who: 2, text: 'I... I think the new one was just good?', mood: 'scared' },
    { who: 1, text: 'STAY OUT OF THIS, NEVILLE.', mood: 'fume' },
    { who: 4, text: 'STAY OUT OF THIS, NEVILLE.', mood: 'angry' },
    { who: 5, text: 'Hahahaha! Strawberry Jam! Best night EVER!', mood: 'grin' },
    { who: 3, text: 'Enough.' },
    { act: () => { PV.seats.forEach(v => { if (v.i && v.i !== 3) { v.look = 2; v.lookT = 2; } }); }, wait: 0.6 },
    { who: 3, text: 'Congratulations. That was... genuinely impressive.', mood: 'happy' },
    { who: 3, text: 'I said nobody\'s beaten this table in years. I meant it.' },
    { who: 3, text: 'A deal\'s a deal.' },
    { act: () => {
      if (!PQ.keyGiven) { PQ.keyGiven = true; addItem('lava-key', 1); toast('Got it', 'Lava Key', 'It\'s warm to the touch...'); sfx.found(); }
      pkPayout(n);
    }, wait: 1.2 },
    { who: 3, text: 'The Lava Key. It opens the old door at the bottom of the mines.' },
    { who: 3, text: 'Whatever\'s down there has been asleep a long time. Be careful.' },
    { you: 'Thanks. Good game, everyone.' },
    { who: 1, text: 'Don\'t come back!', mood: 'angry' },
    { who: 5, text: 'DO come back!', mood: 'grin' }
  ], () => pvClose());
}

// keys while you're at the table: everything goes to the table, nothing to
// the world behind it
function pokerKey(e) {
  if (!PV) return false;
  const k = e.key.toLowerCase();
  e.preventDefault();
  if (PV.scene) { if (k === ' ' || k === 'enter' || k === 'e') pvSceneAdvance(); return true; }
  if (PV.rulesOpen) { if (k === 'r' || k === 'escape' || k === 'enter' || k === ' ') pvRules(false); return true; }
  if (PV.buyin) { if (k === 'enter') $('#pk-buy-go').click(); if (k === 'escape') $('#pk-buy-back').click(); return true; }
  if (k === 'r') { pvRules(true); return true; }
  if (k === 's' && PV.showInfo) { pvYouShow(); return true; }
  if (!PV.human) return true;
  const L = PV.legal;
  if (k === 'f' && !L.canCheck) pvHuman('fold');
  else if (k === 'c' || k === 'k') pvHuman(L.canCheck ? 'check' : 'call');
  else if (k === 'enter' && L.canRaise) pvHuman('raise', pvRaiseVal());
  else if (k === 'a') pvHuman('allin');
  else if (k === 'arrowleft' || k === 'arrowdown') pvSetRaise(pvRaiseVal() - PV.T.blinds.bb * (e.shiftKey ? 5 : 1));
  else if (k === 'arrowright' || k === 'arrowup') pvSetRaise(pvRaiseVal() + PV.T.blinds.bb * (e.shiftKey ? 5 : 1));
  return true;
}
const pokerHolds = () => !!PV;

// out in the mines: desperate measures' landmark is the way into the lava
// cavern, a ragged mouth in the cave wall with lava light pouring out of it.
// it's boarded up like the other lairs until bruinpop's been found.
const desperatePoi = POIS.find(p => p.id === 'desperate');
const pkLairThing = desperatePoi.thing;
function makeLavaCave() {
  const w = 64, h = 58, cx = 31.5, ground = h - 2, G = pixelGrid(w, h);
  wallFace(G, w, h, 2601);
  const ar = 14, acy = ground - 14;
  const edge = (x, y) => (y <= acy
    ? Math.hypot(x - cx, (y - acy) * 1.15) - ar - (vnoise(Math.atan2(y - acy, x - cx) * 3, 0.5, 2602) - 0.5) * 4
    : Math.abs(x - cx) - ar - (vnoise(0.5, y / 3, 2603) - 0.5) * 2 + (y - acy) * 0.12);
  // the mouth: a ragged lip of black basalt, and inside, the glow of lava
  // somewhere further in, brightest at the floor
  for (let y = 0; y <= ground; y++) for (let x = 0; x < w; x++) {
    const d = edge(x, y);
    if (d > 1.6) continue;
    if (d > 0) { if (G.get(x, y)) G.set(x, y, hash2(x, y, 2604) < 0.5 ? '#1a1412' : '#2a201c'); continue; }
    const glow = Math.max(0, 1 - Math.hypot((x - cx) / 13, (y - ground) / 11));
    G.set(x, y, d > -1.4 ? '#2a0e08' : glow > 0.7 ? '#ffb84a' : glow > 0.5 ? '#f07a2a' : glow > 0.3 ? '#a8401a' : glow > 0.12 ? '#5a1c0e' : '#240a06');
  }
  // a little river of lava running out of it along the floor, and drips off
  // the lip
  for (let y = ground - 2; y <= ground; y++) for (let x = Math.round(cx - 5); x <= Math.round(cx + 5); x++) G.set(x, y, hash2(x, y, 2605) < 0.3 ? '#ffe08a' : '#ff8a1c');
  [-8, -2, 5, 10].forEach(dx => {
    const x = Math.round(cx + dx);
    let y = acy - ar; while (edge(x, y) > -0.5 && y < acy) y++;
    for (let k = 0; k < 3 + (dx & 1); k++) G.set(x, y + k, k === 0 ? '#ffb84a' : '#e0561a');
  });
  // glowing veins in the rock round it
  for (let k = 0; k < 40; k++) {
    const a = hash2(k, 0, 2606) * Math.PI * 2, r = ar + 3 + hash2(k, 1, 2606) * 10;
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(acy + Math.sin(a) * r * 0.9);
    if (G.get(x, y) && edge(x, y) > 2 && y < ground - 1) G.set(x, y, hash2(k, 2, 2606) < 0.4 ? '#ffb84a' : '#c4401a');
  }
  rubbleStones(G, [[cx - 18, ground - 1, 2.2], [cx + 17, ground, 1.8], [cx - 14, ground, 1.3]]);
  const FACE = ['#2a2622', '#3b352f', '#1e1b18', '#332e29'];
  return G.outline(c => (FACE.includes(c) ? null : '#120c0a')).canvas();
}
const PK_LAVA_CAVE = makeLavaCave();
const pkMouth = idx(desperatePoi.at[0], desperatePoi.at[1]);
const pkLairOpen = () => found.has('bruinpop');
const pkLairGlow = { x: pkLairThing.x, y: pkLairThing.y - 6, rgb: '255,130,40', rad: 2.6, flicker: true, strength: 0.32, off: true };
glows.push(pkLairGlow);
let pkLairWas = null;
function syncPokerLair() {
  const open = pkLairOpen();
  if (open === pkLairWas) return;
  pkLairWas = open;
  pkLairThing.frames = open ? [PK_LAVA_CAVE] : SPRITE.lair;
  pkLairGlow.off = !open;
  if (open) extraSolid.delete(pkMouth); else extraSolid.add(pkMouth);
}
syncPokerLair();

// the cavern itself: a dark basalt floor, a river of lava along the back wall
// and pools of it in the corners, the stone table in the middle with the five
// of them round it, and an empty stool at the near side for you
const PKR_COLS = 22, PKR_ROWS = 15, PKR_DOOR = 11;
const pkrW = PKR_COLS * TILE, pkrH = PKR_ROWS * TILE;
const PKR_TABLE = { x: pkrW / 2, y: 128 };
const PKR_SMALL = makePokerTable(44, 17, 5);
const pkrLava = (x, y) => y < 50 + Math.sin(x / 23) * 4 || Math.hypot((x - 28) / 30, (y - 205) / 22) < 1 || Math.hypot((x - (pkrW - 28)) / 30, (y - 205) / 22) < 1;
function paintPokerRoom() {
  const c = mk(pkrW, pkrH), g = c.getContext('2d'), img = g.createImageData(pkrW, pkrH), d = img.data;
  for (let y = 0; y < pkrH; y++) for (let x = 0; x < pkrW; x++) {
    const i = (y * pkrW + x) * 4, n = hash2(x, y, 2701), v = vnoise(x / 8, y / 8, 2702);
    const wall = x < 12 || x >= pkrW - 12 || y < 26 || (y >= pkrH - 10 && Math.abs(x - (PKR_DOOR * TILE + 8)) > 9);
    let col;
    if (wall) {
      const k = y >= 18 && y < 26 && x >= 12 && x < pkrW - 12 ? 60 - (25 - y) * 3 : 28 + vnoise(x / 6, y / 6, 2703) * 18;
      col = [k + 6, k - 2, k - 4];
      if (vnoise(x / 4, y / 4, 2704) > 0.8 && n < 0.4) col = n < 0.15 ? [255, 160, 50] : [180, 60, 24];
    } else if (pkrLava(x, y)) {
      const t = vnoise(x / 9, y / 5, 2705);
      col = t > 0.7 ? [255, 214, 90] : t > 0.45 ? [255, 140, 36] : t > 0.25 ? [228, 88, 26] : [168, 44, 18];
    } else if (pkrLava(x, y - 3) || pkrLava(x - 3, y) || pkrLava(x + 3, y)) col = n < 0.4 ? [26, 18, 16] : [44, 30, 26];
    else {
      const base = v > 0.6 ? 46 : v > 0.38 ? 38 : 33;
      col = [base + 8, base - 2, base - 4];
      if (n < 0.04) col = [base - 10, base - 14, base - 14];
    }
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // the light from the mines coming in at the door
  const gr = g.createLinearGradient(0, pkrH, 0, pkrH - 26);
  gr.addColorStop(0, 'rgba(255,236,200,0.2)');
  gr.addColorStop(1, 'rgba(255,236,200,0)');
  g.fillStyle = gr;
  g.fillRect(PKR_DOOR * TILE, pkrH - 26, TILE, 26);
  return c;
}
const pokerRoom = {
  id: 'poker', w: pkrW, h: pkrH, dust: '#6a4a3a', shade: 0.45, underground: true, fight: false,
  canvas: paintPokerRoom(),
  outside: { x: pkLairThing.x, y: pkLairThing.y }, exit: { x: pkLairThing.x, y: pkLairThing.y + 10 }, door: PKR_DOOR,
  blocked: (x, y) => x < 16 || x > pkrW - 16 || y < 30 || (y > pkrH - 12 && Math.abs(x - (PKR_DOOR * TILE + 8)) > 5)
    || pkrLava(x, y) || pkrLava(x, y - 4)
    || ((x - PKR_TABLE.x) / 66) ** 2 + ((y - PKR_TABLE.y + 6) / 30) ** 2 < 1,
  things: [], glows: [
    { x: pkrW / 2, y: 40, rgb: '255,120,40', rad: 7, flicker: true, strength: 0.3 },
    { x: 28, y: 205, rgb: '255,120,40', rad: 3.4, flicker: true, strength: 0.3 },
    { x: pkrW - 28, y: 205, rgb: '255,120,40', rad: 3.4, flicker: true, strength: 0.3 },
    { x: PKR_TABLE.x, y: PKR_TABLE.y - 10, rgb: '255,200,140', rad: 3.2, flicker: true, strength: 0.18 }
  ]
};
EXTRA_ROOMS.push(pokerRoom);
BUILDINGS.push({
  thing: pkLairThing, tile: desperatePoi.at, room: pokerRoom, get name() { return PQ.won ? 'The Lava Cavern' : 'Lava Cavern'; }, open: pkLairOpen,
  shut: ['Sealed', '? ? ?', 'Beat the bosses before it first.'], hint: () => pkLairOpen() && !PQ.met
});
MINE_BOSSES.desperate = { beaten: () => !!PQ.won, guard: 'You hear ores clinking down there...' };
MINES_STEPS.splice(MINES_STEPS.length - 1, 0,
  { done: () => !!PQ.met, title: 'Find the next landmark' },
  { done: () => !!PQ.won, title: 'Be the last one standing at the poker table' });
// the table and the five of them round it, at the world's scale: the same
// sprites as at the table, idling (a bob, a blink), and every few seconds one
// of them says something short over the game they're playing without you
const PKR_SEATS = { brutus: [-58, 8, 1, false], neville: [-26, -14, 0], ace: [0, -16, 0], brock: [26, -14, 0], sparks: [58, 8, 1, true] };
pokerRoom.things.push({ x: PKR_TABLE.x, y: PKR_TABLE.y + 22, frames: [mk(1, 1)], draw: (o, toX, toY, t) => {
  const tb = PKR_SMALL, x = PKR_TABLE.x - tb.cx, y = PKR_TABLE.y - tb.cy;
  ctx.drawImage(tb.canvas, toX(x), toY(y), tb.w * S, tb.h * S);
  // cards and a few chips on it, so it looks like a game's on
  [[-10, -2], [6, -2], [-26, -4], [22, -4]].forEach(([dx, dy]) => ctx.drawImage(PK_BACK, toX(PKR_TABLE.x + dx), toY(PKR_TABLE.y + dy), 7 * S, 10 * S));
  [[-34, 6, 'gold', 4], [30, 6, 'iron', 6], [-6, 10, 'diamond', 2], [2, 10, 'ruby', 3]].forEach(([dx, dy, ore, n]) => ctx.drawImage(PK_STACK[ore][n], toX(PKR_TABLE.x + dx), toY(PKR_TABLE.y + dy - n), 8 * S, (n + 4) * S));
  // and the flicker of lava in its cracks
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < tb.cracks.length; k += 2) {
    const [cx2, cy2] = tb.cracks[k], f = 0.5 + 0.5 * Math.sin(t / 260 + cx2 * 0.7);
    ctx.fillStyle = `rgba(255,${180 + Math.round(f * 60)},80,${0.2 + f * 0.4})`;
    ctx.fillRect(toX(x + cx2), toY(y + cy2), S, S);
  }
  ctx.globalCompositeOperation = 'source-over';
} });
pokerRoom.things.push({ x: PKR_TABLE.x, y: PKR_TABLE.y + 36, frames: [PK_STOOL] });
const pkrMiners = Object.entries(PKR_SEATS).map(([id, [dx, dy, turn, flip]]) => {
  const m = { id, x: PKR_TABLE.x + dx, y: PKR_TABLE.y + dy, turn, flip, frames: [mk(1, 1)], blink: Math.random() * 3, mood: null, moodT: 0,
    draw: (o, toX, toY, t) => {
      const blink = Math.floor((t / 1000 + o.blink) % 4) === 0 && (t / 1000 + o.blink) % 1 < 0.12;
      const im = minerFrame(o.id, o.turn, o.mood || pkBaseMood(o.id), 0, blink, o.talk > 0 && Math.floor(t / 110) % 2 === 0);
      const bob = reduceMotion ? 0 : Math.round(Math.max(0, Math.sin(t / 700 + o.x)) * 0.9);
      if (o.turn) {
        const st = PK_STOOL;
        ctx.drawImage(st, toX(o.x - 11), toY(o.y - 6), st.width * S, st.height * S);
      } else ctx.drawImage(PK_CHAIR_BACK, toX(o.x - 11), toY(o.y - 18), PK_CHAIR_BACK.width * S, PK_CHAIR_BACK.height * S);
      const dx = toX(o.x - MINER_W / 2), dy = toY(o.y - MINER_H + bob);
      if (o.flip) { ctx.save(); ctx.translate(dx + MINER_W * S, dy); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, MINER_W * S, MINER_H * S); ctx.restore(); }
      else ctx.drawImage(im, dx, dy, MINER_W * S, MINER_H * S);
    } };
  pokerRoom.things.push(m);
  return m;
});
// what they say to each other while you watch
const PKR_CHATTER = {
  brutus: ['RAISE.', 'Rigged!', 'Call. Whatever.', 'ARGH!'], neville: ['F-fold.', 'Um... check?', 'Is that a raise?'],
  ace: ['Call.', 'Raise.', 'Your blind.', 'Nice hand.'], brock: ['Too easy.', 'Ship it!', 'I had you.'], sparks: ['Strawberry Jam!', 'All in!', 'I guess I call!', 'Hahaha!']
};
let pkrChatT = 3;
function pokerRoomTick(dt) {
  syncPokerLair();
  if (room !== pokerRoom) return;
  pkrChatT -= dt;
  pkrMiners.forEach(m => { m.talk = Math.max(0, (m.talk || 0) - dt); });
  if (pkrChatT <= 0 && !PV) {
    pkrChatT = 4 + Math.random() * 5;
    const m = pkAny(pkrMiners);
    floatText(pkAny(PKR_CHATTER[m.id]), m.x, m.y - MINER_H - 2, PK_COLOR[m.id]);
    m.talk = 0.6;
  }
}
// clicking the table (or any of them) sits you down, once you're close enough
const pkNearTable = () => Math.hypot(player.x - PKR_TABLE.x, (player.y - PKR_TABLE.y) * 1.4) < 110;
const pkOverTable = m => ((m.x - PKR_TABLE.x) / 76) ** 2 + ((m.y - PKR_TABLE.y + 4) / 40) ** 2 < 1;
canvas.addEventListener('pointerdown', e => {
  if (!started || room !== pokerRoom || PV || ui || player.dead || e.button !== 0) return;
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (!pkOverTable(mouseWorld())) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  if (!pkNearTable()) { toast('The Poker Table', 'Too far...', 'Walk up to the table.'); return; }
  sfx.ui();
  pokerSit();
}, true);
function pokerEnter(r) {
  if (r !== pokerRoom) return;
  if (!PQ.met) setTimeout(() => toast('Inside', 'The Lava Cavern', 'Somebody\'s playing cards down here...'), 50);
  else setTimeout(() => toast('Inside', 'The Lava Cavern', PQ.won ? 'They\'re still arguing...' : 'Click the table to play.'), 50);
}
function pokerLeave(r) { if (r === pokerRoom && PV) pvClose(); }
// "click to play" over the table when you're near it
function pokerOverlay(toX, toY, t) {
  if (room !== pokerRoom || PV || !pkNearTable()) return;
  const fs = Math.max(16, 8 * Math.round((S * 2.5) / 8));
  ctx.font = `${fs}px Silkscreen, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = toY(PKR_TABLE.y - 52) - (Math.floor(t / 400) % 2) * S;
  ctx.fillStyle = '#000';
  ctx.fillText('CLICK TO PLAY', toX(PKR_TABLE.x) + 2, y + 2);
  ctx.fillStyle = '#ffd23f';
  ctx.fillText('CLICK TO PLAY', toX(PKR_TABLE.x), y);
}
function pokerTick(dt) { pokerRoomTick(dt); teachDoorTick(); }

// the teachla site's landmark is the last room in the mines, behind a door of
// black glass with lava in its cracks and a keyhole the shape of a flame. the
// lava key from the poker game fits it, but what's on the other side isn't
// built yet.
const teachPoi = POIS.find(p => p.id === 'teachla-site');
function makeLavaDoor(lit) {
  const w = LAIR_W, h = LAIR_H, cx = (w - 1) / 2, ground = h - 2, G = pixelGrid(w, h);
  wallFace(G, w, h, 2801);
  doorway(G, cx, 18, ground, 11, (x, y, e) => {
    const crack = vnoise(x / 2.5, y / 4, 2802) > 0.74;
    return crack ? (lit ? '#ffb84a' : '#c4401a') : e < 1.5 ? '#1a1418' : hash2(x, y, 2803) < 0.2 ? '#2a2430' : '#16121a';
  });
  stoneArch(G, cx, 12, ground, 11, 17, ['#4a4452', '#36303e', '#26222c', '#0e0c12']);
  // the keyhole, a flame
  [[0, -3], [0, -2], [-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [0, 1], [-1, 2], [0, 2], [1, 2]].forEach(([dx, dy]) => G.set(cx + dx, 36 + dy, lit ? '#fff1a8' : '#ff8a1c'));
  return G.outline(c => (c === '#2a2622' || c === '#3b352f' || c === '#1e1b18' || c === '#332e29' ? null : '#0c0a10')).canvas();
}
const PK_LAVA_DOOR = [makeLavaDoor(false), makeLavaDoor(true)];
let teachWas = null;
function teachDoorTick() {
  const st = PQ.won ? (countItem('lava-key') ? 2 : 1) : 0;
  if (st === teachWas) return;
  teachWas = st;
  teachPoi.thing.frames = st ? [PK_LAVA_DOOR[st - 1]] : SPRITE.lair;
}
BUILDINGS.push({
  thing: teachPoi.thing, tile: teachPoi.at, room: null, name: 'The Old Door', open: () => false,
  shut: () => (countItem('lava-key') ? ['The Lava Key glows...', 'The Old Door', 'It fits. But the door won\'t budge yet. Coming soon.']
    : PQ.won ? ['Locked', 'The Old Door', 'Bring the Lava Key.'] : ['Sealed', '? ? ?', 'Beat the bosses before it first.']),
  hint: () => false
});

// the music at the table: an original, laid back lounge tune in b flat at 96
// bpm with a swing to it. a walking bass, soft chords on the offbeats, brushes
// and a ride, and a vibraphone picking out the chords. nothing to do with
// any real song.
const PK_CH = {
  Cm7: [48, 51, 55, 58], F7: [41, 45, 48, 51], Bbmaj7: [46, 50, 53, 57], Gm7: [43, 46, 50, 53], Dm7: [50, 53, 57, 60], G7: [43, 47, 50, 53],
  Fm7: [41, 44, 48, 51], Bb7: [46, 50, 53, 56], Ebmaj7: [51, 55, 58, 62], Ab7: [44, 48, 51, 54], Dm7b5: [50, 53, 56, 60]
};
const PK_BARS = ['Cm7', 'F7', 'Bbmaj7', 'Gm7', 'Cm7', 'F7', 'Dm7', 'G7', 'Cm7', 'F7', 'Fm7', 'Bb7', 'Ebmaj7', 'Ab7', 'Dm7b5', 'G7'];
const PK_VIBES = [{ 0: 3, 6: 2 }, { 4: 1, 10: 2, 14: 3 }, { 0: 2 }, { 8: 1, 12: 0 }, { 0: 3, 3: 2, 6: 1 }, { 10: 3 }, { 0: 2, 8: 3 }, { 6: 1, 14: 0 }];
function pokerStep(bar, step, t) {
  const name = PK_BARS[bar], ch = PK_CH[name], st = 60 / POKER_TUNE.bpm / 4;
  const swing = step % 4 === 2 ? st * 0.33 : 0, tt = t + swing;
  const next = PK_CH[PK_BARS[(bar + 1) % PK_BARS.length]];
  // the walking bass, a note a beat: root, third, fifth, then a step into the
  // next chord
  if (step % 4 === 0) {
    const n = [ch[0], ch[1], ch[2], next[0] + (Math.random() < 0.5 ? 1 : -1)][step / 4] - 12;
    mNote('triangle', midiHz(n), t, st * 3.4, 0.16, { lp: 900, rel: 0.06 });
    mNote('sine', midiHz(n - 12), t, st * 3, 0.06);
  }
  // soft chords on the and of two and the and of four, and a held one
  // under the start of every other bar
  if (step === 6 || step === 14) ch.slice(1).forEach(n => mNote('triangle', midiHz(n + 12), tt, st * 1.4, 0.035, { lp: 1600, at: 0.01 }));
  if (step === 0 && bar % 2 === 0) ch.forEach(n => mNote('sine', midiHz(n + 12), t, st * 12, 0.022, { at: 0.3, rel: 0.4 }));
  // the ride (ding, ding-a, ding, ding-a) and brushes on two and four
  if ([0, 4, 6, 8, 12, 14].includes(step)) mNoise(tt, 0.08, step % 4 === 0 ? 0.035 : 0.022, 'highpass', 7000);
  if (step === 4 || step === 12) mNoise(t, 0.18, 0.05, 'bandpass', 1800, 0.7);
  // the vibes, now and then
  const m = PK_VIBES[bar % PK_VIBES.length];
  if (bar >= 4 && m[step] !== undefined) mallet(midiHz(ch[m[step]] + 24), tt, 0.16, 0.7, true);
}
const POKER_TUNE = { bpm: 96, bars: PK_BARS.length, loopFrom: 0, bright: true, step: pokerStep };

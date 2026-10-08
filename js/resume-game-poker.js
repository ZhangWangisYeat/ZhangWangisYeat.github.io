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
const PK = { SB: 1, BB: 2, STRADDLE: 4, START: 200, MIN_BUYIN: 2, MAX_BUYIN: 200, DOLLARS: 100 };
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
    button: -1, hand: 0, board: [], deck: [], pot: 0, bet: 0, lastRaise: PK.BB, raises: 0, fullId: 0, street: null,
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
  T.seats.forEach(s => Object.assign(s, { cards: null, folded: s.out, allIn: false, bet: 0, total: 0, acted: -1, need: false, won: 0, vol: 0, shown: false }));
  Object.assign(T, { board: [], pot: 0, bet: PK.BB, lastRaise: PK.BB, raises: 0, fullId: 0, street: 'preflop', aggressor: -1, prevAggressor: -1, straddle: -1 });
  const live = pkLive(T);
  if (T.button < 0 || T.seats[T.button].out) T.button = T.button < 0 ? live[(Math.random() * live.length) | 0].i : pkNext(T, T.button);
  else T.button = pkNext(T, T.button);
  const heads = live.length === 2;
  T.sb = heads ? T.button : pkNext(T, T.button);
  T.bb = pkNext(T, T.sb);
  T.ev.push({ t: 'hand', hand: T.hand, button: T.button, sb: T.sb, bb: T.bb });
  T.ev.push({ t: 'post', seat: T.sb, amount: pkPut(T, T.seats[T.sb], PK.SB), kind: 'sb' });
  T.ev.push({ t: 'post', seat: T.bb, amount: pkPut(T, T.seats[T.bb], PK.BB), kind: 'bb' });
  let first = pkNext(T, T.bb);
  if (live.length >= 4 && T.seats[first].stack > PK.STRADDLE * 2 && wantsStraddle && wantsStraddle(first, T)) {
    T.straddle = first;
    T.ev.push({ t: 'post', seat: first, amount: pkPut(T, T.seats[first], PK.STRADDLE), kind: 'straddle' });
    T.bet = PK.STRADDLE;
    T.lastRaise = PK.STRADDLE;
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
  const inH = T.seats.filter(pkInHand);
  if (inH.length === 1) { pkEndStreet(T, true); return; }
  for (let k = 1; k <= 6; k++) {
    const s = T.seats[(from + k) % 6];
    if (pkCanAct(s) && (s.need || s.bet < T.bet)) {
      // (alone with chips against players who are all in, and already matched
      // the bet: nothing left to decide)
      if (!s.need && s.bet >= T.bet) continue;
      if (T.seats.filter(pkCanAct).length === 1 && s.bet >= T.bet) continue;
      T.toAct = s.i;
      return;
    }
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
  const before = { pot: pkPotNow(T), toCall: L.toCall, level: T.raises, street: T.street, bet: T.bet };
  if (type === 'fold') {
    s.folded = true;
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
    const wasBet = T.bet === 0;
    pkPut(T, s, to - s.bet);
    if (T.street === 'preflop') s.vol = 2;
    if (full) {
      T.lastRaise = size;
      T.fullId++;
      T.raises++;
      T.aggressor = seat;
      T.seats.forEach(o => { if (o.i !== seat && pkCanAct(o)) o.need = true; });
    } else T.seats.forEach(o => { if (o.i !== seat && pkCanAct(o) && o.bet < to) o.need = true; });
    T.bet = Math.max(T.bet, to);
    T.ev.push({ t: 'act', seat, kind: s.allIn ? 'allin' : wasBet ? 'bet' : 'raise', amount: to - (s.bet - (to - (s.bet - 0)) * 0), to: s.bet, stack: s.stack, full });
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
  Object.assign(T, { bet: 0, lastRaise: PK.BB, raises: 0, fullId: 0 });
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
  pots.forEach((p, k) => {
    const el = p.elig.map(i => T.seats[i]);
    let best = -1;
    el.forEach(s => { if (showdown && s.value > best) best = s.value; });
    const win = showdown ? el.filter(s => s.value === best) : el;
    const each = Math.floor(p.amount / win.length);
    let odd = p.amount - each * win.length;
    for (let k2 = 1; k2 <= 6 && odd > 0; k2++) {
      const s = T.seats[(T.button + k2) % 6];
      if (win.includes(s)) { s.stack += 1; s.won += 1; odd--; }
    }
    win.forEach(s => {
      s.stack += each; s.won += each;
      T.ev.push({ t: 'win', seat: s.i, amount: each + (s.won - each > 0 && win.length > 1 ? 0 : 0), pot: k, side: k > 0, value: showdown ? s.value : null, name: showdown ? pkHandName(s.value) : null, split: win.length > 1 });
    });
  });
  T.pot = 0;
  T.over = true;
  T.toAct = -1;
  T.runout = false;
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
  brock: { skill: 0.06, loose: 1.25, aggro: 1.2, bluff: 1.2, cr: 1.2, callAdj: 0.02, slow: 0.1, wildSize: 0.08, straddle: 0.12 },
  sparks: { skill: 0.035, loose: 1.05, aggro: 1.05, bluff: 1.05, cr: 1.1, callAdj: 0, slow: 0.1, wildSize: 0.05, straddle: 0.05 }
};
// how wide a solid player opens, by how many players are still to act behind
// them (the button has two, the cutoff three and so on)
const PK_OPEN = [0.9, 0.42, 0.44, 0.28, 0.2, 0.155, 0.14];
function pkMood() {
  return {
    brutus: { tilt: false, losses: 0, wins: 0 },
    neville: {},
    ace: { respect: 0 },
    brock: { grudge: 0, target: false },
    sparks: { wild: true, losses: 0 }
  };
}
// the bots' state for a game: moods (kept between hands), what they've seen
// everyone do lately (for the adaptive ranges), and this hand's ranges
function pkAiInit(T, mood) {
  T.ai = {
    mood: mood || pkMood(),
    stats: T.seats.map(() => ({ vpip: 0.24, pfr: 0.17, agg: 0.4, n: 0 })),
    std: [], adp: [], str: null, lastSaw: [], hand: {}, results: null
  };
}
function pkAiHandStart(T) {
  const A = T.ai;
  A.std = T.seats.map(() => new Float32Array(1326).fill(1));
  A.adp = T.seats.map(() => new Float32Array(1326).fill(1));
  A.str = pkStrengths([]);
  A.hand = { postAgg: T.seats.map(() => 0), postAct: T.seats.map(() => 0), checked: T.seats.map(() => false), heroIn: true, brockTarget: false, startStacks: T.seats.map(s => s.stack + s.total) };
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
  if (std) return { l: 1, a: 1, b: 1 };
  const st = T.ai.stats[seat];
  return { l: clampN(st.vpip / 0.24, 0.45, 3.2), a: clampN(st.pfr / 0.17, 0.4, 3.6), b: clampN(st.agg / 0.4, 0.4, 2.2) };
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
function pkPostLikelihood(se, d, kind, frac, street, est) {
  if (kind === 'raise' || kind === 'bet') {
    const vT = 0.6 + 0.09 * Math.min(frac, 2) + (kind === 'raise' ? 0.12 : 0) + (street === 'river' ? 0.05 : 0);
    const bluff = est.b * (d >= 2 ? 0.55 : d === 1 ? 0.25 : 0.12) * (street === 'river' ? 0.6 : 1);
    return Math.max(pkSig((se - vT) / 0.06), bluff * (1 - se));
  }
  if (kind === 'call') {
    const cT = 0.32 + 0.14 * Math.min(frac, 2) - 0.05 * (est.l - 1);
    return Math.max(pkSig((se - cT) / 0.08) * (1 - 0.45 * pkSig((se - 0.94) / 0.02)), d >= 2 ? 0.6 : 0);
  }
  if (kind === 'check') return 1 - 0.62 * pkSig((se - 0.82) / 0.05);
  return 1;
}
// every action narrows that player's ranges in everyone's eyes
function pkAiSaw(T, seat, kind, before) {
  const A = T.ai;
  if (kind === 'fold') return;
  if (kind === 'check' && T.street !== 'preflop') A.hand.checked[seat] = true;
  const frac = before.pot ? Math.max(0, (T.seats[seat].bet - before.bet + (before.bet ? 0 : 0)) / before.pot) : 1;
  [true, false].forEach(std => {
    const R = std ? A.std[seat] : A.adp[seat], est = pkEst(T, seat, std);
    if (before.street === 'preflop') {
      const behind = pkBehind(T, seat);
      for (let i = 0; i < 1326; i++) if (R[i] > 0) R[i] *= Math.max(0.01, pkPreLikelihood(PK_CPCT[i], kind, before.level, behind, est));
    } else {
      const S = A.str, k = kind === 'raise' && before.bet === 0 ? 'bet' : kind;
      for (let i = 0; i < 1326; i++) if (R[i] > 0 && S.ok[i]) R[i] *= Math.max(0.01, pkPostLikelihood(S.se[i], S.draw[i], k, frac, before.street, est));
    }
  });
  if (before.street !== 'preflop') {
    A.hand.postAct[seat]++;
    if (kind === 'raise') A.hand.postAgg[seat]++;
  }
}
// a weighted average of strength over a range (for range advantage)
function pkRangeMean(R, S) {
  let w = 0, t = 0, nut = 0;
  for (let i = 0; i < 1326; i++) if (S.ok[i] && R[i] > 0) { w += R[i]; t += R[i] * S.s[i]; if (S.s[i] > 0.9) nut += R[i]; }
  return w ? { mean: t / w, nut: nut / w } : { mean: 0.5, nut: 0 };
}
// how strong a hand is against a range right now, on this board (no more cards)
function pkHsVs(myVal, R, S, dead) {
  let w = 0, beat = 0;
  for (let i = 0; i < 1326; i++) {
    if (!S.ok[i] || R[i] <= 0 || dead[PK_C1[i]] || dead[PK_C2[i]]) continue;
    w += R[i];
    if (myVal > S.val[i]) beat += R[i]; else if (myVal === S.val[i]) beat += R[i] / 2;
  }
  return w ? beat / w : 0.5;
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
  const s = T.seats[seat], id = s.id, P = PK_PERSONA[id], M = T.ai.mood, L = pkLegal(T, seat);
  return T.street === 'preflop' ? pkDecidePre(T, s, id, P, M, L) : pkDecidePost(T, s, id, P, M, L);
}
// who's still in against seat, and their ranges as seat sees them (ace sees
// the textbook ones)
function pkOpps(T, s, gto) {
  const opp = T.seats.filter(o => o.i !== s.i && pkInHand(o));
  return { opp, ranges: opp.map(o => (gto ? T.ai.std[o.i] : T.ai.adp[o.i])) };
}
const pkHeroIn = T => pkInHand(T.seats[0]);
function pkDecidePre(T, s, id, P, M, L) {
  const p = pkPct(s.cards[0], s.cards[1]), level = T.raises, behind = pkBehind(T, s.i);
  const suited = (s.cards[0] & 3) === (s.cards[1] & 3), pair = (s.cards[0] >> 2) === (s.cards[1] >> 2);
  const hiR = Math.max(s.cards[0] >> 2, s.cards[1] >> 2), loR = Math.min(s.cards[0] >> 2, s.cards[1] >> 2);
  const unit = T.straddle >= 0 ? PK.STRADDLE : PK.BB;
  const limpers = T.seats.filter(o => o.i !== s.i && pkInHand(o) && o.bet === T.bet && o.vol).length;
  const ip = behind === 0 || (behind <= 2 && !T.seats.slice().some(o => o.i === T.sb || o.i === T.bb ? false : false));
  const stackBB = (s.stack + s.bet) / PK.BB;
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
  const eqVs = () => {
    const { ranges } = pkOpps(T, s, P.gto);
    const eq = pkEquity(s.cards, [], ranges, 420);
    return clampN(eq + pkGauss() * P.skill, 0, 1);
  };
  const lastRaiseTo = T.bet;

  // the straddler or big blind with nothing to call: check, or raise the limpers
  if (level === 0 && L.canCheck) {
    const thr = 0.1 * P.aggro * (tilt ? 4 : wild ? 3.5 : 1);
    if (p < thr || (wild && rnd < 0.25) || (tilt && rnd < 0.3)) return raise(T.bet + unit * (3 + limpers) * (tilt ? 1.8 : 1), tilt ? 'tilt' : wild ? 'wild' : 'value');
    return { type: 'check', why: 'check' };
  }

  // nobody's raised yet: open, or limp, or fold
  if (level === 0) {
    let open = PK_OPEN[Math.min(6, behind)] * P.loose;
    if (limpers) open *= 0.72;
    let size = unit * (behind === 1 && T.sb === s.i ? 3 : 2.5) + unit * limpers;
    if (tilt) { open = 0.55; size = unit * (5 + Math.random() * 4) + unit * limpers; }
    if (wild) { open = 0.62; if (rnd < 0.3) size = unit * (4 + Math.random() * 3); }
    if (id === 'ace') {
      // a mixed strategy at the edge of the range, like a solver: hands just
      // outside it open some of the time
      if (p < open || (p < open * 1.18 && rnd < (open * 1.18 - p) / (open * 0.18) * 0.5)) return raise(size, 'open');
      return fold();
    }
    if (p < open) return raise(size, tilt ? 'tilt' : wild ? 'wild' : 'open');
    // neville limps his small pairs and suited hands instead of folding them
    if (id === 'neville' && (pair || (suited && hiR >= 9)) && p < 0.55 && rnd < 0.5) return call('limp');
    if (wild && p < 0.8 && rnd < 0.5) return call('wildcall');
    if (limpers && p < open * 1.6 && (pair || suited)) return call('limp');
    return fold();
  }

  // facing a raise (or more). work out how big the raises have been and who
  // made the last one
  const agg = T.seats[T.aggressor >= 0 ? T.aggressor : T.bb];
  const vsHero = T.aggressor === 0;
  const callers = T.seats.filter(o => o.i !== s.i && o.i !== agg.i && pkInHand(o) && o.bet === T.bet).length;
  const aggEst = pkEst(T, agg.i, P.gto);
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
  const vThr = [0, 0.055, 0.026, 0.013, 0.008][Math.min(level, 4)] * P.aggro * looser * (id === 'neville' ? 0.5 : 1);
  const bluffBand = (level === 1 && ((suited && (hiR === 12 || (hiR - loR <= 2 && loR >= 3))) || (hiR === 12 && loR <= 3)))
    || (level === 2 && hiR === 12 && loR <= 3 && suited);
  const bluffP = (level === 1 ? 0.35 : level === 2 ? 0.3 : 0) * P.bluff * (id === 'neville' ? 0 : 1);
  const sizeUp = level === 1 ? (ip ? 3 : 3.8) : level === 2 ? 2.3 : 10;
  const raiseTo = level >= 3 || stackBB < 40 ? L.maxTo : lastRaiseTo * sizeUp + L.toCall * callers;
  if (p < vThr) {
    // ace mixes in a call now and then with the top so she's never only raising it
    if (P.gto && level <= 2 && p > 0.01 && rnd < 0.18) return call('trap');
    if (id === 'neville' && level === 1 && rnd < 0.4) return call('trap');
    return raise(raiseTo, level >= 3 ? 'jam' : 'value');
  }
  if (level <= 2 && bluffBand && rnd < bluffP) return raise(raiseTo, 'bluff3');
  // calling: the hand has to have the equity for the price, a bit more out of
  // position (it'll be harder to realise), and big commitments get looked at
  // harder
  if (L.toCall === 0) return { type: 'check', why: 'check' };
  const eq = eqVs();
  const real = (ip ? 0.97 : 0.86) - 0.04 * callers + (pair || suited ? 0.04 : 0) * (stackBB > 60 && level <= 1 ? 1 : 0);
  let margin = P.callAdj + (commit > 0.4 ? 0.02 : 0);
  if (id === 'brock') margin += 0.03 + 0.02 * g;
  if (id === 'neville' && commit > 0.15) margin -= 0.05;
  if (eq * real + margin >= needed) return call(level >= 3 ? 'calljam' : 'call');
  return fold();
}

function pkDecidePost(T, s, id, P, M, L) {
  const A = T.ai, S = A.str, board = T.board, street = T.street, rnd = Math.random();
  const { opp, ranges } = pkOpps(T, s, P.gto);
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
  if (id === 'neville') {
    if (hasAce && kick >= 7 && boardPaired && wet && (myVal >> 20) <= 2) perceived += 0.2;
    else if (topPair || ((myVal >> 20) === 1 && ((myVal >> 16) & 15) > topBoard)) perceived += 0.09;
  }
  const pot = L.pot, toCall = L.toCall, needed = toCall / (pot + toCall);
  const ip = pkInPosition(T, s.i);
  const eff = Math.min(s.stack + s.bet, Math.max(...opp.map(o => o.stack + o.bet)));
  const spr = eff / Math.max(1, pot);
  // range advantage: is this board better for my range than for theirs?
  // (brutus bluffs when it is)
  const myR = pkRangeMean(P.gto ? A.std[s.i] : A.adp[s.i], S);
  const theirR = opp.map(o => pkRangeMean(P.gto ? A.std[o.i] : A.adp[o.i], S));
  const adv = myR.mean - Math.max(...theirR.map(r => r.mean)) + (myR.nut - Math.max(...theirR.map(r => r.nut))) * 0.5;
  const wasAggressor = T.prevAggressor === s.i;
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
    if (id === 'brutus' && kind === 'bluff' && adv > 0 && rnd < P.wildSize * (tilt ? 1.6 : 1)) return 2 + Math.random() * 2.5;
    if (target && kind === 'bluff' && rnd < 0.45) return 1.2 + Math.random() * 1.3;
    if (P.gto) {
      if (street === 'river') return eq > 0.85 || kind === 'bluff' ? (rnd < 0.35 ? 1.4 : 0.85) : 0.6;
      return !wet && adv > 0 ? 0.33 : wet ? 0.7 : 0.5;
    }
    if (id === 'brutus') return kind === 'value' ? 0.8 + Math.random() * 0.3 : 0.75;
    if (id === 'brock') return 0.66;
    return wet ? 0.66 : 0.5;
  };
  const valueT = 0.6 + 0.07 * (nOpp - 1) + (street === 'river' ? 0.03 : 0);

  if (L.canCheck) {
    // checked to us: bet for value, bluff some, check the rest
    if (perceived > valueT) {
      if (rnd < P.slow * (eq > 0.88 ? 1 : 0.3) && street !== 'river' && !tilt) return check('slowplay');
      return bet(sizeFor('value'), 'value');
    }
    if (id === 'neville') return check();
    // how often to bluff. ace works it out like a solver: enough bluffs to go
    // with her value bets that her bet can't be read, given the size. the
    // others start from a feel for it and lean on their personality.
    let bp;
    const size = sizeFor('bluff');
    if (P.gto) {
      const R = A.std[s.i];
      let w = 0, v = 0;
      for (let i = 0; i < 1326; i++) if (S.ok[i] && R[i] > 0) { w += R[i]; if (S.se[i] > 0.78) v += R[i]; }
      const V = w ? v / w : 0.2, ratio = street === 'river' ? size / (1 + 2 * size) : (size / (1 + 2 * size)) * 1.6;
      bp = Math.min(0.85, (V * ratio) / Math.max(0.15, 1 - V) / (1 - ratio));
      // she bluffs with her worst hands and her draws, and checks the middle
      bp *= draw >= 2 ? 1.6 : myS < 0.3 ? 1.1 : 0.25;
    } else {
      bp = (street === 'flop' ? 0.24 : street === 'turn' ? 0.17 : 0.12) * P.bluff;
      if (wasAggressor) bp *= 1.5;
      if (draw >= 2) bp *= 1.8;
      if (nOpp > 1) bp *= 0.45;
      if (id === 'brutus') bp *= adv > 0.03 ? 2.1 : adv < -0.03 ? 0.25 : 1;
      if (tilt) bp *= 1.8;
      if (target) bp += 0.08 * g;
      if (myS > 0.45 && myS < 0.75 && street !== 'river') bp *= 0.5;
    }
    if (rnd < bp) return bet(size, id === 'brutus' && size > 1.6 ? 'wildbluff' : target ? 'grudgebluff' : 'bluff');
    return check();
  }

  // facing a bet
  const betFrac = toCall / Math.max(1, pot - toCall);
  let real = (ip ? 1 : 0.9) * (street === 'river' ? 1 : 0.96);
  let implied = draw >= 2 && street !== 'river' && spr > 1.5 ? 0.04 : 0;
  let margin = P.callAdj;
  if (id === 'neville') margin += betFrac > 0.8 ? -0.05 : 0;
  if (wild) margin += 0.04;
  if (tilt) margin += 0.05;
  if (target) margin += 0.05 * g;
  const raiseT = 0.8 + 0.04 * (nOpp - 1) + (street === 'river' ? 0.04 : 0);
  const nevilleRaise = id === 'neville' ? 0.88 : raiseT;
  if (eq > nevilleRaise && L.canRaise) {
    if (rnd < P.slow * 0.6 && street !== 'river' && !tilt && eq < 0.95) return call('slowplay');
    return raiseTo(id === 'neville' ? 2.6 : 3, 'value');
  }
  // getting it in when the stacks are short compared to the pot
  if (spr < 1.2 && eq > 0.45 && L.canRaise && id !== 'neville') return raiseTo(10, 'commit');
  if (P.gto) {
    // minimum defence: she continues with enough of her range that a bet
    // can't print money with any two cards, ranked by strength in her own
    // range. it's balanced, and it's also why an overbet bluff gets her to
    // fold: against a bet of three pots she only has to defend a quarter.
    const R = A.std[s.i];
    let w = 0, above = 0;
    for (let i = 0; i < 1326; i++) if (S.ok[i] && R[i] > 0) { w += R[i]; if (S.se[i] > mySe) above += R[i]; }
    const rank = w ? above / w : 0.5, mdf = 1 / (1 + betFrac);
    if (rank < mdf * 0.14 && L.canRaise && eq > 0.6) return raiseTo(3, 'value');
    if (draw >= 2 && street !== 'river' && rank < mdf * 1.3 && rnd < 0.2 && L.canRaise) return raiseTo(3, 'semibluff');
    if (rank < mdf || eq * real >= needed + 0.06) return call('defend');
    return fold('fold');
  }
  if (perceived * real + implied + margin >= needed) {
    return call(id === 'neville' && perceived > eq + 0.1 ? 'overvalue' : wild && eq * real < needed ? 'wildcall' : target && eq * real < needed ? 'grudgecall' : 'call');
  }
  // the odd raise as a bluff: brutus check raises a lot, especially with a
  // draw or when the board's his
  let crP = (draw >= 2 ? 0.12 : 0.035) * P.cr * (A.hand.checked[s.i] ? 1.5 : 0.6);
  if (id === 'brutus') crP *= adv > 0.02 ? 1.8 : 0.5;
  if (nOpp > 1) crP *= 0.4;
  if (target) crP += 0.06 * g;
  if (L.canRaise && street !== 'river' ? rnd < crP : rnd < crP * 0.4) {
    const huge = id === 'brutus' && rnd < P.wildSize ? 4.5 : 3;
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
      st.n++;
    }
  });
  const net = T.seats.map((s, i) => s.stack - H.startStacks[i]);
  const invested = T.seats.map(s => s.total);
  const res = { net, invested, winners: T.seats.filter(s => s.won > 0).map(s => s.i), showdown, busted, events: [] };
  // brutus
  const b = T.seats[1];
  if (b.cards && !b.out || busted.includes(1)) {
    const bm = M.brutus, lost = net[1] < 0 && (invested[1] >= 4 || showdown && invested[1] > 0) && b.vol, won = net[1] > 0;
    if (won) { bm.wins++; bm.losses = 0; }
    else if (lost) { bm.losses++; bm.wins = 0; }
    if (!bm.tilt && bm.losses >= 2) { bm.tilt = true; res.events.push('brutusTilt'); }
    else if (bm.tilt && bm.wins >= 3) { bm.tilt = false; bm.losses = 0; res.events.push('brutusCalm'); }
    if (lost && (bm.tilt || busted.includes(1))) res.events.push('brutusThrow');
  }
  // sparks
  const sp = T.seats[5];
  if (!sp.out || busted.includes(5)) {
    const sm = M.sparks;
    if (net[5] < 0 && invested[5] >= 4) sm.losses++; else if (net[5] > 0) sm.losses = 0;
    if (sm.wild && (sp.stack < PK.START * 0.7 || sm.losses >= 3)) { sm.wild = false; sm.losses = 0; res.events.push('sparksSettle'); }
    else if (!sm.wild && sp.stack >= PK.START * 1.45) { sm.wild = true; res.events.push('sparksWild'); }
  }
  // brock's grudge against you
  const bk = T.seats[4], you = T.seats[0];
  if ((bk.cards && you.cards) && invested[4] >= 4) {
    if (net[0] > 0 && net[4] < 0) {
      let k = 1;
      if (showdown && you.shown && bk.shown && pkPct(you.cards[0], you.cards[1]) > pkPct(bk.cards[0], bk.cards[1])) k++;
      if (!showdown) k += 0.5;
      M.brock.grudge = Math.min(7, M.brock.grudge + k);
      res.events.push('brockGrudge');
    } else if (net[4] > 0 && net[0] < 0) M.brock.grudge = Math.max(0, M.brock.grudge - 0.5);
  }
  // ace's respect for you grows when you take a pot off her
  if (net[0] > 0 && net[3] < 0 && invested[3] >= 4) { M.ace.respect++; res.events.push('aceBeaten'); }
  A.results = res;
}
// poker core end

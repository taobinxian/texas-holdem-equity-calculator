/* =========================================================
   德州扑克计算器 · 多人底池模块自检
   抽取 HTML 里的 <script> 全文，用 DOM stub 在 node 中真实执行。
   覆盖：多人结算口径、与独立暴力采样器的交叉验证、位置范围、
        精确/采样路径选择、渲染路径、DOM 完整性。
   运行：node verify-multi.js
   ========================================================= */
"use strict";
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'texas-holdem-equity-calculator.html');
const html = fs.readFileSync(FILE, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if (cond){ pass++; console.log('  \u2713 ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '   ' + extra : '')); }
}
function head(t){ console.log('\n' + t); }
function near(a, b, tol){ return Math.abs(a - b) <= tol; }

/* ---------- 1. 提取脚本 ---------- */
head('[1] 提取并编译页面脚本');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m){ console.log('  \u2717 未找到 <script>'); process.exit(1); }
const code = m[1];
ok('已提取脚本', true, code.split('\n').length + ' 行');

/* ---------- 2. DOM stub ---------- */
function mkEl(tag){
  const set = new Set();
  const el = {
    tagName: tag || 'div',
    id: '', hidden: false, textContent: '', value: '',
    checked: false, disabled: false, className: '', dataset: {}, style: {},
    children: [], title: '',
    classList: {
      add: c => set.add(c),
      remove: c => set.delete(c),
      toggle: (c, f) => { if (f === undefined){ set.has(c) ? set.delete(c) : set.add(c); } else { f ? set.add(c) : set.delete(c); } },
      contains: c => set.has(c)
    },
    addEventListener(){}, appendChild(c){ this.children.push(c); return c; },
    removeChild(){}, querySelector(){ return mkEl('div'); }, querySelectorAll(){ return []; },
    setAttribute(){}, scrollIntoView(){}, closest(){ return null; },
    parentNode: { classList: { add(){}, remove(){}, toggle(){} } }
  };
  /* 让 innerHTML='' 真正清空子节点，贴近浏览器行为 */
  let inner = '';
  Object.defineProperty(el, 'innerHTML', {
    get(){ return inner; },
    set(v){ inner = v; if (v === '') el.children.length = 0; }
  });
  return el;
}
const byId = {};
global.document = {
  getElementById(id){ return byId[id] || (byId[id] = mkEl('div')); },
  querySelectorAll(){ return []; },
  createElement(t){ return mkEl(t); },
  addEventListener(){}
};
global.window = { scrollTo(){}, addEventListener(){} };
global.requestAnimationFrame = fn => fn();
global.performance = require('perf_hooks').performance;

let api;
try {
  const wrapper = code +
    '\nreturn { calculate:calculate, evalHand:evalHand, cid:cid, comb:comb,' +
    ' handScore:handScore, rangePool:rangePool, estimateLayout:estimateLayout,' +
    ' willBeExact:willBeExact, seatKnown:seatKnown, describeHand:describeHand,' +
    ' renderResult:renderResult, state:state, POS_RANGE_PCT:POS_RANGE_PCT,' +
    ' equityAt:equityAt, runReview:runReview, applyDemo:applyDemo, DEMOS:DEMOS,' +
    ' setPlayerCount:setPlayerCount, renderAll:renderAll, POS_SETS:POS_SETS,' +
    ' renderPlayers:renderPlayers, RANK_CHARS:RANK_CHARS };';
  api = new Function('document', 'window', 'requestAnimationFrame', 'performance', wrapper)(
    global.document, global.window, global.requestAnimationFrame, global.performance
  );
  ok('脚本在 stub 环境中成功执行', true);
} catch (e){
  ok('脚本在 stub 环境中成功执行', false, e.message);
  console.log('\n汇总：' + pass + ' 通过 / ' + (fail + 1) + ' 失败');
  process.exit(1);
}

const C = api.cid;
function seat(pos, a, b){ return { pos: pos, cards: (a && b) ? [C(a), C(b)] : [null, null] }; }

/* 把 calculate 结果折算成百分比 */
function pct(res, stage){
  const t = stage || res.stageNums[res.stageNums.length - 1];
  const s = res.stats[t];
  const n = s.n || 1;
  return {
    n: n,
    win: s.win / n * 100,
    tie: s.tie / n * 100,
    lose: s.lose / n * 100,
    equity: s.pEq[0] / n * 100,
    pEq: s.pEq.map(x => x / n * 100),
    sum: s.pEq.reduce((a, b) => a + b, 0) / n * 100
  };
}

/* ---------- 3. 两人基线：回归旧结果 ---------- */
head('[2] 两人基线（与改造前结果回归）');
{
  const res = api.calculate([seat('BTN','As','Ah'), seat('BB','Kd','Kc')], [], 200000, false);
  const r = pct(res);
  ok('AA vs KK 胜率 81.06%', near(r.win, 81.06, 0.05), r.win.toFixed(2) + '%');
  ok('AA vs KK 平局 0.38%', near(r.tie, 0.38, 0.05), r.tie.toFixed(2) + '%');
  ok('AA vs KK 落败 18.55%', near(r.lose, 18.55, 0.05), r.lose.toFixed(2) + '%');
  ok('两人份额合计 100%', near(r.sum, 100, 1e-6), r.sum.toFixed(4) + '%');
  ok('两人时份额 = win + tie/2', near(r.equity, r.win + r.tie / 2, 1e-6),
     r.equity.toFixed(4) + ' vs ' + (r.win + r.tie / 2).toFixed(4));
  ok('走的是精确枚举', res.method.indexOf('精确枚举') === 0, res.method);
  ok('枚举数量 1,712,304', res.method.indexOf('1,712,304') > 0);
}

/* ---------- 4. 平局均分口径 ---------- */
head('[3] 平局份额口径（k 人并列各计 1/k）');
{
  /* 公共牌本身就是皇家同花顺，三家无论手牌如何都并列最佳 */
  const board = ['As','Ks','Qs','Js','Ts'];
  const res = api.calculate(
    [seat('BTN','2c','3c'), seat('SB','4d','5d'), seat('BB','6h','7h')],
    board.map(C), 200000, false);
  const r = pct(res);
  ok('三家全部平局', near(r.tie, 100, 1e-9), r.tie.toFixed(2) + '%');
  ok('三家胜场均为 0', near(r.win, 0, 1e-9));
  ok('每家份额 = 33.33%', r.pEq.every(x => near(x, 100 / 3, 1e-9)),
     r.pEq.map(x => x.toFixed(2)).join(' / '));
  ok('份额合计 = 100%', near(r.sum, 100, 1e-6), r.sum.toFixed(4) + '%');

  /* 两家并列：只有两家平分 */
  const res2 = api.calculate(
    [seat('BTN','2c','3c'), seat('BB','4d','5d')],
    board.map(C), 200000, false);
  const r2 = pct(res2);
  ok('两家并列份额各 50%', r2.pEq.every(x => near(x, 50, 1e-9)),
     r2.pEq.map(x => x.toFixed(2)).join(' / '));

  /* 两家并列其中一家被第三家压过：用 4 张公共牌构造 */
  const res3 = api.calculate(
    [seat('BTN','As','Ks'), seat('SB','Ad','Kd'), seat('BB','2c','3c')],
    ['Qh','Jh','Th','9h'].map(C), 200000, false);
  const r3 = pct(res3);
  ok('四家场景份额合计 100%', near(r3.sum, 100, 1e-6), r3.sum.toFixed(4) + '%');
}

/* ---------- 5. 独立暴力采样器交叉验证 ---------- */
head('[4] 与独立暴力采样器交叉验证（多人结算）');
function mcSample(seats, board, iter, seed){
  const used = new Set();
  seats.forEach(s => { if (s.cards[0] !== null){ used.add(s.cards[0]); used.add(s.cards[1]); } });
  board.forEach(c => used.add(c));
  const deck = [];
  for (let i = 0; i < 52; i++) if (!used.has(i)) deck.push(i);

  const n = seats.length;
  const work = seats.map(s => s.cards.slice());
  const unknown = [];
  seats.forEach((s, i) => { if (s.cards[0] === null) unknown.push(i); });

  const need = 5 - board.length;
  const bb = board.slice();
  const eq = new Array(n).fill(0);
  let win0 = 0, tie0 = 0;
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  for (let it = 0; it < iter; it++){
    const pool = deck.slice();
    const slots = 2 * unknown.length + need;
    for (let k = 0; k < slots; k++){
      const j = k + ((rnd() * (pool.length - k)) | 0);
      const t = pool[k]; pool[k] = pool[j]; pool[j] = t;
    }
    let p = 0;
    unknown.forEach(i => { work[i][0] = pool[p++]; work[i][1] = pool[p++]; });
    const full = board.concat(pool.slice(p, p + need));

    const sc = work.map(w => api.evalHand(w[0], w[1], full, 5));
    const best = Math.max.apply(null, sc);
    const winners = [];
    sc.forEach((v, i) => { if (v === best) winners.push(i); });
    winners.forEach(i => { eq[i] += 1 / winners.length; });
    if (sc[0] === best){ if (winners.length === 1) win0++; else tie0++; }
  }
  return {
    equity: eq.map(x => x / iter * 100),
    win: win0 / iter * 100,
    tie: tie0 / iter * 100
  };
}

{
  /* 3 人全已知、翻牌圈：精确 vs 采样 */
  const seats3 = [seat('BTN','As','Ah'), seat('SB','Kd','Kc'), seat('BB','Qh','Qd')];
  const board3 = ['Js','7s','2h'].map(C);
  const exact = pct(api.calculate(seats3, board3, 200000, false));
  const mc = mcSample(seats3, board3, 300000, 12345);
  ok('3 人翻牌圈 精确 vs 采样 · 主视角份额',
     near(exact.equity, mc.equity[0], 0.6),
     exact.equity.toFixed(2) + '% vs ' + mc.equity[0].toFixed(2) + '%');
  ok('3 人翻牌圈 精确 vs 采样 · 对手1 份额',
     near(exact.pEq[1], mc.equity[1], 0.6),
     exact.pEq[1].toFixed(2) + '% vs ' + mc.equity[1].toFixed(2) + '%');
  ok('3 人翻牌圈 精确 vs 采样 · 对手2 份额',
     near(exact.pEq[2], mc.equity[2], 0.6),
     exact.pEq[2].toFixed(2) + '% vs ' + mc.equity[2].toFixed(2) + '%');

  /* 5 人全已知、转牌圈 */
  const seats5 = [seat('UTG','Ah','Ad'), seat('MP','Ks','Kc'), seat('CO','Qh','Jh'),
                  seat('BTN','9s','9d'), seat('BB','7c','6c')];
  const board5 = ['2d','8h','Ts','3s'].map(C);
  const ex5 = pct(api.calculate(seats5, board5, 200000, false));
  const mc5 = mcSample(seats5, board5, 300000, 999);
  let maxDiff = 0;
  for (let i = 0; i < 5; i++) maxDiff = Math.max(maxDiff, Math.abs(ex5.pEq[i] - mc5.equity[i]));
  ok('5 人转牌圈 5 家份额全部吻合（误差 < 0.6）', maxDiff < 0.6,
     '最大偏差 ' + maxDiff.toFixed(3));
  ok('5 人份额合计 100%', near(ex5.sum, 100, 1e-6), ex5.sum.toFixed(4) + '%');
}

/* ---------- 6. 精确 / 采样路径选择 ---------- */
head('[5] 精确枚举与采样路径的选择');
{
  const L = api.estimateLayout;
  ok('2 人已知翻牌前 = C(48,5)', L([seat('BTN','As','Ah'), seat('BB','Kd','Kc')], []) === 1712304,
     String(L([seat('BTN','As','Ah'), seat('BB','Kd','Kc')], [])));
  ok('3 人 1 家未知 + 5 张公共牌 = C(43,2)',
     L([seat('BTN','As','Ah'), seat('SB','Kd','Kc'), seat('BB',null,null)],
       ['2c','7d','9s','Jh','3c'].map(C)) === 903,
     String(L([seat('BTN','As','Ah'), seat('SB','Kd','Kc'), seat('BB',null,null)],
       ['2c','7d','9s','Jh','3c'].map(C))));
  ok('9 人全已知翻牌前 = C(34,5)',
     L([seat('UTG','As','Ah'), seat('UTG+1','Ks','Kc'), seat('UTG+2','Qs','Qc'),
        seat('MP','Js','Jc'), seat('HJ','Ts','Tc'), seat('CO','9s','9c'),
        seat('BTN','8s','8c'), seat('SB','7s','7c'), seat('BB','6s','6c')], []) === 278256);

  api.state.seats = [seat('BTN','As','Ah'), seat('BB','Kd','Kc')];
  api.state.board = [null,null,null,null,null];
  ok('2 人已知 → 精确', api.willBeExact() === true);

  api.state.seats = [seat('UTG','As','Ah'), seat('MP',null,null), seat('CO',null,null),
                     seat('BTN',null,null), seat('SB',null,null), seat('BB',null,null)];
  ok('6 人 5 家未知 → 采样', api.willBeExact() === false);

  api.state.seats = [seat('BTN','As','Ah'), seat('SB','Kd','Kc'), seat('BB',null,null)];
  api.state.board = ['2c','7d','9s','Jh','3c'].map(C);
  ok('3 人 1 家未知但牌局仅 903 种 → 精确', api.willBeExact() === true);

  /* 未知手牌但规模可控：验证真的走了精确枚举而非采样 */
  const res = api.calculate(api.state.seats, ['2c','7d','9s','Jh','3c'].map(C), 200000, false);
  ok('小规模未知也走精确枚举', res.method.indexOf('精确枚举') === 0, res.method);
  ok('枚举数量 903', res.method.indexOf('903') > 0);
  ok('结果确定性（同一场景两次一致）',
     Math.abs(pct(res).equity - pct(api.calculate(api.state.seats,
       ['2c','7d','9s','Jh','3c'].map(C), 200000, false)).equity) < 1e-9);

  /* 回归：「公共牌已发满 5 张 + 有人未知」曾因枚举路径以「补牌」为语义、
     牌满时一步都不走，导致所有份额静默返回 0。 */
  const fb = pct(res);
  ok('牌发满 + 1 家未知 · 份额合计 100%（曾全为 0）',
     near(fb.sum, 100, 1e-6), fb.sum.toFixed(6) + '%');
  ok('牌发满 + 1 家未知 · 主视角份额非 0', fb.equity > 0, fb.equity.toFixed(2) + '%');
  ok('牌发满 + 1 家未知 · 主视角与未知家份额非 0（已定胜负的对手可以是 0）',
     fb.pEq[0] > 0 && fb.pEq[2] > 0, fb.pEq.map(x => x.toFixed(2)).join(' / '));
  ok('牌发满 + 1 家未知 · 胜+平+负 = 100%',
     near(fb.win + fb.tie + fb.lose, 100, 1e-6),
     (fb.win + fb.tie + fb.lose).toFixed(6) + '%');
  ok('牌发满 + 1 家未知 · 结算次数 = 枚举数',
     fb.n === 903, fb.n + ' 次');
}

/* ---------- 7. 未知手牌：采样稳定性与合理性 ---------- */
head('[6] 未知手牌的采样表现');
{
  const seats = [seat('BTN','As','Ah'), seat('BB',null,null)];
  const a = pct(api.calculate(seats, [], 200000, false));
  const b = pct(api.calculate(seats, [], 200000, false));
  ok('两人 AA vs 随机 · 胜率约 85%', a.win > 83 && a.win < 87, a.win.toFixed(2) + '%');
  ok('两次采样差异 < 0.8%', Math.abs(a.win - b.win) < 0.8,
     a.win.toFixed(2) + '% vs ' + b.win.toFixed(2) + '%');
  ok('走的是采样路径', a.n === 200000, String(a.n));

  const six = [seat('UTG','Ah','Ad'), seat('MP',null,null), seat('CO',null,null),
               seat('BTN',null,null), seat('SB',null,null), seat('BB',null,null)];
  const s6 = pct(api.calculate(six, [], 200000, false));
  ok('6 人 AA 对 5 家随机 · 份额落在 40%~56%', s6.equity > 40 && s6.equity < 56,
     s6.equity.toFixed(2) + '%');
  ok('6 人份额合计 100%', near(s6.sum, 100, 0.5), s6.sum.toFixed(3) + '%');
  ok('6 人样本数 200000', s6.n === 200000, String(s6.n));
}

/* ---------- 8. 位置范围模型 ---------- */
head('[7] 位置范围（未知手牌可选收紧）');
{
  const score = api.handScore;
  ok('AA 评分最高档', score(C('As'), C('Ah')) > score(C('Ks'), C('Kh')), score(C('As'), C('Ah')).toFixed(3));
  ok('KK > QQ', score(C('Ks'), C('Kh')) > score(C('Qs'), C('Qh')));
  ok('同花 > 非同花（AKs > AKo）',
     score(C('As'), C('Ks')) > score(C('As'), C('Kh')),
     score(C('As'), C('Ks')).toFixed(3) + ' vs ' + score(C('As'), C('Kh')).toFixed(3));
  ok('对子 > 同花连牌（AA > AKs）',
     score(C('As'), C('Ah')) > score(C('As'), C('Ks')));
  ok('同花连牌 > 垃圾牌（76s > 72o）',
     score(C('7s'), C('6s')) > score(C('7s'), C('2h')));
  ok('小对子高于中等同花牌（55 > J4s）',
     score(C('5s'), C('5h')) > score(C('Js'), C('4s')));

  const utg = api.rangePool('UTG'), btn = api.rangePool('BTN');
  const TOT = 1326;
  ok('UTG 范围约 15%', near(utg.length / TOT, 0.15, 0.005), (utg.length / TOT * 100).toFixed(1) + '%');
  ok('BTN 范围约 40%', near(btn.length / TOT, 0.40, 0.005), (btn.length / TOT * 100).toFixed(1) + '%');
  ok('UTG 范围 ⊂ BTN 范围', utg.every(h =>
     btn.some(g => g[0] === h[0] && g[1] === h[1])));
  const hasAA = pool => pool.some(h =>
    [h[0], h[1]].sort().join() === [C('As'), C('Ah')].sort().join());
  ok('AA 在 UTG 范围内', hasAA(utg));
  const has72o = pool => pool.some(h =>
    (h[0] === C('7s') && h[1] === C('2h')) || (h[0] === C('2h') && h[1] === C('7s')));
  ok('72o 不在 UTG 范围内', !has72o(utg));
  ok('范围池已缓存（同一引用）', api.rangePool('UTG') === utg);

  /* 范围收紧后，紧位置对手更强 → AA 的份额应下降 */
  const loose = pct(api.calculate([seat('BTN','As','Ah'), seat('BB',null,null)], [], 200000, false));
  const tight = pct(api.calculate([seat('BTN','As','Ah'), seat('UTG',null,null)], [], 200000, true));
  ok('UTG 范围下 AA 份额低于随机手牌', tight.equity < loose.equity,
     tight.equity.toFixed(2) + '% < ' + loose.equity.toFixed(2) + '%');
  ok('范围模式走采样', tight.n === 200000, String(tight.n));

  /* 多人 + 范围混合，验证不崩且份额守恒 */
  const mix = [seat('CO','As','Ks'), seat('BTN',null,null), seat('SB',null,null), seat('BB','7h','7d')];
  const mr = pct(api.calculate(mix, ['Js','8s','2c'].map(C), 120000, true));
  ok('范围模式 + 4 人混合 · 份额合计 100%', near(mr.sum, 100, 0.8), mr.sum.toFixed(3) + '%');
  ok('范围模式 + 4 人混合 · 样本数 120000', mr.n === 120000, String(mr.n));
}

/* ---------- 9. 与真实胜率的相关性 ---------- */
head('[8] 手牌评分与真实胜率的相关性（Spearman）');
{
  const hands = [];
  for (let a = 0; a < 52 && hands.length < 160; a += 4){
    for (let b = a + 1; b < 52 && hands.length < 160; b += 3){
      hands.push([a, b]);
    }
  }
  const ITER = 2500;
  const pairs = hands.map(h => {
    const used = [h[0], h[1]];
    const pool = [];
    for (let i = 0; i < 52; i++) if (i !== h[0] && i !== h[1]) pool.push(i);
    let win = 0, tie = 0;
    const bb = [0,0,0,0,0];
    for (let it = 0; it < ITER; it++){
      for (let k = 0; k < 7; k++){
        const j = k + ((Math.random() * (pool.length - k)) | 0);
        const t = pool[k]; pool[k] = pool[j]; pool[j] = t;
      }
      for (let q = 0; q < 5; q++) bb[q] = pool[2 + q];
      const hh = api.evalHand(h[0], h[1], bb, 5);
      const vv = api.evalHand(pool[0], pool[1], bb, 5);
      if (hh > vv) win++; else if (hh === vv) tie++;
    }
    return { s: api.handScore(h[0], h[1]), e: (win + tie * 0.5) / ITER * 100 };
  });

  function rank(arr, key){
    const idx = arr.map((v, i) => i).sort((x, y) => arr[x][key] - arr[y][key]);
    const r = new Array(arr.length);
    idx.forEach((v, i) => { r[v] = i + 1; });
    return r;
  }
  const n = pairs.length;
  const rs = rank(pairs, 's'), re = rank(pairs, 'e');
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (rs[i] - re[i]) * (rs[i] - re[i]);
  const rho = 1 - 6 * d2 / (n * (n * n - 1));
  ok('评分与真实胜率 Spearman 相关 > 0.93', rho > 0.93, rho.toFixed(4) + '（n=' + n + '）');
}

/* ---------- 10. 玩家管理 ---------- */
head('[9] 玩家数量与位置管理');
{
  api.applyDemo(api.DEMOS[0]);
  ok('初始 2 人', api.state.seats.length === 2, api.state.seats.map(s => s.pos).join('/'));
  api.setPlayerCount(6);
  ok('扩到 6 人', api.state.seats.length === 6);
  ok('6 人位置为 6-max 标准分配',
     api.state.seats.map(s => s.pos).join('/') === 'UTG/MP/CO/BTN/SB/BB',
     api.state.seats.map(s => s.pos).join('/'));
  ok('新玩家手牌全部未知', api.state.seats.slice(2).every(s => !api.seatKnown(s)));
  ok('已有玩家手牌被保留', api.seatKnown(api.state.seats[0]) && api.seatKnown(api.state.seats[1]));

  api.setPlayerCount(9);
  const pos9 = api.state.seats.map(s => s.pos);
  ok('9 人位置无重复', new Set(pos9).size === 9, pos9.join('/'));

  api.setPlayerCount(3);
  ok('缩到 3 人', api.state.seats.length === 3);
  api.setPlayerCount(1);
  ok('人数下限锁定在 2', api.state.seats.length === 2, String(api.state.seats.length));
  api.setPlayerCount(99);
  ok('人数上限锁定在 9', api.state.seats.length === 9, String(api.state.seats.length));

  /* 示例数据完整性 */
  api.DEMOS.forEach(d => {
    ok('示例「' + d.name + '」座位合法',
       d.seats.every(s => api.POS_SETS[d.seats.length] || true) && d.seats.length >= 2 &&
       d.seats.length <= 9 && s0posOk(d));
  });
  function s0posOk(d){
    return d.seats.every(s => s[0] && (s[1] === null || (s[1] && s[2])));
  }
}

/* ---------- 11. 渲染路径 ---------- */
head('[10] 渲染路径（含多人结果表）');
{
  const results = [
    { name: '2 人已知', seats: [seat('BTN','As','Ah'), seat('BB','Kd','Kc')], board: [] },
    { name: '3 人已知', seats: [seat('BTN','As','Ah'), seat('SB','Kd','Kc'), seat('BB','Qh','Qd')], board: [] },
    { name: '4 人含未知', seats: [seat('CO','As','Ks'), seat('BTN','Qh','Qd'), seat('SB',null,null), seat('BB','7h','7d')], board: ['Js','8s','2c'] },
    { name: '9 人全已知', seats: [seat('UTG','As','Ah'), seat('UTG+1','Ks','Kc'), seat('UTG+2','Qs','Qc'),
        seat('MP','Js','Jc'), seat('HJ','Ts','Tc'), seat('CO','9s','9c'),
        seat('BTN','8s','8c'), seat('SB','7s','7c'), seat('BB','6s','6c')], board: [] }
  ];
  results.forEach(cs => {
    let res, thrown = null;
    try { res = api.calculate(cs.seats, cs.board.map(C), 60000, false); }
    catch (e){ thrown = e; }
    ok(cs.name + ' · 计算不抛异常', thrown === null, thrown ? thrown.message : res.method);
    if (thrown) return;
    try {
      api.renderResult(res);
      ok(cs.name + ' · 渲染不抛异常', true);
    } catch (e){
      ok(cs.name + ' · 渲染不抛异常', false, e.message);
      return;
    }
    const pb = global.document.getElementById('plBody');
    ok(cs.name + ' · 结果表 ' + cs.seats.length + ' 行', pb.children.length === cs.seats.length,
       String(pb.children.length));
    const hint = global.document.getElementById('plHint');
    const expectHint = cs.seats.length > 2 || cs.seats.some(s => s.cards[0] === null);
    ok(cs.name + ' · 备注符合预期', expectHint ? hint.innerHTML.length > 0 : hint.innerHTML === '',
       expectHint ? hint.innerHTML.replace(/<[^>]+>/g, '').slice(0, 40) : '无备注');
  });
}

/* ---------- 12. DOM 完整性 ---------- */
head('[11] HTML 结构与 DOM 引用完整性');
{
  const ids = [...new Set([...code.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(x => x[1]))];
  const miss = ids.filter(id => !html.includes('id="' + id + '"'));
  ok('getElementById 的 id 全部存在于 HTML', miss.length === 0, miss.join(', ') || ids.length + ' 个');

  const cls = [...new Set([...code.matchAll(/querySelector(?:All)?\(['"]\.([\w-]+)['"]\)/g)].map(x => x[1]))];
  const missC = cls.filter(c => !html.includes('.' + c) && !html.includes('class="' + c));
  ok('querySelector 的 class 全部存在', missC.length === 0, missC.join(', ') || cls.length + ' 个');

  ['playersList','playerCount','chkRange','plBody','plHint','slotsBoard','stageBody'].forEach(id => {
    ok('HTML 含 #' + id, html.includes('id="' + id + '"'));
  });
  ok('未遗留旧版手牌槽元素', !html.includes('id="slotsHero"') && !html.includes('id="slotsVillain"'));

  /* 渲染产物用到的 class 必须有样式定义 */
  const used = ['pl-row','pl-id','pl-pos','pl-slots','pl-meta','pl-state','pl-del','pl-range',
                'pl-head','pl-count','pl-list','pl-table','hero-row','eq-bar','pc-cards','pc-unk','pl-hint'];
  const noStyle = used.filter(c => !new RegExp('\\.' + c + '[\\s,{.:]').test(html));
  ok('新增 class 均有样式定义', noStyle.length === 0, noStyle.join(', ') || used.length + ' 个');
}

/* ---------- 13. 复盘模块未受影响 ---------- */
head('[12] 复盘模块回归');
{
  let rep = null, thrown = null;
  try {
    rep = api.runReview([C('As'), C('Ah')], [C('Qh'), C('Qd')],
                        ['Js','7s','2h','3c','9d'].map(C), true, 'BTN', 100);
  } catch (e){ thrown = e; }
  ok('runReview 仍可正常执行', thrown === null, thrown ? thrown.message : rep.list.length + ' 条街');
  if (rep){
    ok('复盘总分仍在 0~10', rep.total >= 0 && rep.total <= 10, rep.total.toFixed(2));
    ok('四条街全部产出', rep.list.length === 4);
    rep.list.forEach(x => {
      ok('  ' + x.name + ' 含 threshold 字段', typeof x.verdict.threshold === 'number'
         && !isNaN(x.verdict.threshold), String(x.verdict.threshold));
    });
  }
}

console.log('\n汇总：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);

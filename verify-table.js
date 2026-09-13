/* =========================================================
   德州扑克 · 牌桌模拟自检
   覆盖：椭圆等弧长布点 / 座位渲染 / 人数切换与手牌保留 /
         多人份额 / 多人门槛 / 报告渲染 / 样式一致性 /
         未知手牌标记与一键切换（含只填一张牌的拦截）/
         逐手行动线（聚合口径 / 老数据等价 / 多人底池 / UI 增删改 / 报告）
   用法：node verify-table.js
   ========================================================= */
"use strict";
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, 'texas-holdem-equity-calculator.html');
const html = fs.readFileSync(HTML, 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
/* 去掉 <style> 之后才是「使用处」，用来判断某个 class 是不是死样式 */
const outside = html.replace(/<style>[\s\S]*?<\/style>/, '');

let pass = 0, fail = 0;
function head(t){ console.log('\n' + t); }
function ok(name, cond, extra){
  if (cond){ pass++; console.log('  \u2713 ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '   ' + extra : '')); }
}

/* ---------- DOM stub（innerHTML='' 会清空 children，便于数渲染结果） ---------- */
function mkEl(tag){
  const set = new Set();
  const el = {
    tagName: tag || 'div', id: '', hidden: false, textContent: '', value: '',
    checked: false, disabled: false, className: '', dataset: {}, style: {},
    children: [], title: '', type: '', clientWidth: 0, clientHeight: 0,
    classList: {
      add: c => set.add(c), remove: c => set.delete(c),
      toggle: (c, f) => { if (f === undefined){ set.has(c) ? set.delete(c) : set.add(c); } else { f ? set.add(c) : set.delete(c); } },
      contains: c => set.has(c) || String(el.className).split(/\s+/).indexOf(c) >= 0
    },
    addEventListener(){}, appendChild(c){ this.children.push(c); return c; },
    removeChild(){}, querySelector(){ return mkEl('div'); }, querySelectorAll(){ return []; },
    setAttribute(){}, scrollIntoView(){}, closest(){ return null; },
    parentNode: { classList: { add(){}, remove(){}, toggle(){} } }
  };
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

/* ---------- 1. 提取并编译 ---------- */
head('[1] 提取并编译页面脚本');
let api;
try {
  const wrapper = code +
    '\nreturn { review:review, heroIndex:heroIndex, renderTable:renderTable,' +
    ' renderHeroBar:renderHeroBar, setHeroPos:setHeroPos, setRvCount:setRvCount,' +
    ' ellipseArcPoints:ellipseArcPoints, tablePoints:tablePoints,' +
    ' equityVsOpps:equityVsOpps, equityAt:equityAt, runReview:runReview,' +
    ' applyReview:applyReview, clearReview:clearReview, RV_DEMOS:RV_DEMOS,' +
    ' renderReviewReport:renderReviewReport, judgePreflop:judgePreflop,' +
    ' judgePostflop:judgePostflop, seatKnown:seatKnown, cid:cid, POS_SETS:POS_SETS,' +
    ' MIN_PLAYERS:MIN_PLAYERS, MAX_PLAYERS:MAX_PLAYERS, clearSeatEquity:clearSeatEquity,' +
    ' startPot:startPot, anteTotal:anteTotal, updateTablePot:updateTablePot,' +
    ' updateTableAnte:updateTableAnte, syncStreets:syncStreets, rvStreetEls:rvStreetEls,' +
    ' bigBlind:bigBlind, DEFAULT_BB:DEFAULT_BB,' +
    ' seatState:seatState, toggleSeatUnknown:toggleSeatUnknown,' +
    ' reviewBlockReason:reviewBlockReason,' +
    /* 逐手行动线 */
    ' ACT_TYPES:ACT_TYPES, POS_ALL:POS_ALL, POS_BASE:POS_BASE, POS_NAME:POS_NAME,' +
    ' streetAgg:streetAgg, actsOf:actsOf, legacyToActs:legacyToActs,' +
    ' streetPot:streetPot, actCumAfter:actCumAfter, actText:actText,' +
    ' heroActSummary:heroActSummary, streetLineText:streetLineText,' +
    ' actAdd:actAdd, actRemove:actRemove, actSet:actSet, actFillChecks:actFillChecks,' +
    ' renderActRows:renderActRows, renderAllActRows:renderAllActRows,' +
    ' nextActorPos:nextActorPos, firstActorPos:firstActorPos,' +
    ' foldedBefore:foldedBefore, foldedSeatsNow:foldedSeatsNow,' +
    ' syncStreetAgg:syncStreetAgg, paintSeatEquity:paintSeatEquity };';
  api = new Function('document', 'window', 'requestAnimationFrame', 'performance', wrapper)(
    global.document, global.window, global.requestAnimationFrame, global.performance);
  ok('脚本在 stub 环境中成功执行', true);
} catch (e){
  ok('脚本在 stub 环境中成功执行', false, e.message);
  console.log('\n汇总：' + pass + ' 通过 / ' + (fail + 1) + ' 失败');
  process.exit(1);
}
const C = api.cid;
const tableWrap = byId['tblWrap'];
tableWrap.clientWidth = 700;
tableWrap.clientHeight = 434;

/* ---------- 2. 椭圆等弧长布点 ---------- */
head('[2] 椭圆等弧长布点（座位不打堆、不出界）');
{
  const pts = api.ellipseArcPoints(9, 266, 154);
  ok('返回 9 个点', pts.length === 9);

  const onEllipse = pts.every(p => Math.abs((p.x / 266) ** 2 + (p.y / 154) ** 2 - 1) < 1e-6);
  ok('全部精确落在椭圆上', onEllipse);

  ok('第 0 个点在正下方（你的座位）',
     Math.abs(pts[0].x) < 1e-9 && Math.abs(pts[0].y - 154) < 1e-9,
     '(' + pts[0].x.toFixed(1) + ', ' + pts[0].y.toFixed(1) + ')');

  /* 第 2 个点应该顺时针走到左侧（屏幕坐标 x 为负） */
  ok('座位按顺时针方向排开（下 → 左）', pts[1].x < 0 && pts[1].y > 0,
     '(' + pts[1].x.toFixed(1) + ', ' + pts[1].y.toFixed(1) + ')');

  const chord = [];
  for (let i = 0; i < pts.length; i++){
    const a = pts[i], b = pts[(i + 1) % pts.length];
    chord.push(Math.hypot(a.x - b.x, a.y - b.y));
  }
  const mx = Math.max(...chord), mn = Math.min(...chord);
  ok('相邻间距均匀（弦长极差 < 20%，弧长相等但曲率不同导致弦长微差）',
     (mx - mn) / mn < 0.20, 'min=' + mn.toFixed(1) + ' max=' + mx.toFixed(1));

  console.log('  \u2192 各人数下的座位间距与边界（按 700×434 容器）');
  let allOk = true, minAll = Infinity;
  for (let n = api.MIN_PLAYERS; n <= api.MAX_PLAYERS; n++){
    const P = api.tablePoints(n).map(p => ({ x: p.x / 100 * 700, y: p.y / 100 * 434 }));
    let minD = Infinity;
    for (let i = 0; i < n; i++){
      for (let j = i + 1; j < n; j++){
        minD = Math.min(minD, Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y));
      }
    }
    /* 座位芯片约 60×78，中心留 40px 边距即可完整落在容器内 */
    const inside = P.every(p => p.x > 40 && p.x < 660 && p.y > 42 && p.y < 392);
    console.log('      ' + n + ' 人：最近两座 ' + minD.toFixed(0) + 'px，' +
                (inside ? '全在桌面内' : '有座位出界'));
    if (minD <= minAll) minAll = minD;
    if (minD < 90 || !inside) allOk = false;
  }
  ok('2~9 人：最近两座间距均 > 90px（座位不重叠）', allOk, '最小 ' + minAll.toFixed(0) + 'px');
}

/* ---------- 3. 座位渲染 ---------- */
head('[3] 牌桌座位渲染');
{
  api.applyReview(api.RV_DEMOS[3]);   /* 六人桌示例 */

  const seats = byId['tblSeats'].children;
  ok('6 人桌渲染 6 个座位', seats.length === 6, seats.length + '');
  ok('只有「你」的座位带 me 标记',
     seats.filter(s => String(s.className).indexOf('me') >= 0).length === 1);
  ok('你的座位在下标 3（BTN）', String(seats[3].className).indexOf('me') >= 0, String(seats[3].className));

  const tops = seats.map(s => parseFloat(s.style.top));
  ok('你的座位摆在正下方（top 最大）', tops[3] === Math.max(...tops),
     '你的 top=' + tops[3].toFixed(1) + '%');

  const box = seats[3].children[1];
  ok('座位含卡槽容器 tseat-cards', String(box.className) === 'tseat-cards', String(box.className));
  ok('座位有 2 个卡槽', box.children.length === 2, box.children.length + '');
  ok('卡槽 scope=rev / group=seat',
     box.children[0].dataset.scope === 'rev' && box.children[0].dataset.group === 'seat');
  ok('卡槽带座位下标 pidx=3', box.children[0].dataset.pidx === 3, String(box.children[0].dataset.pidx));
  ok('卡槽渲染出牌面（A♠）',
     box.children[0].innerHTML.indexOf('>A<') > 0 && box.children[0].innerHTML.indexOf('\u2660') > 0,
     box.children[0].innerHTML);
  ok('未知座位的卡槽渲染为 + 占位',
     seats[5].children[1].children[0].innerHTML.indexOf('plus') > 0,
     seats[5].children[1].children[0].innerHTML);

  ok('你的座位标了位置代号 BTN', seats[3].children[0].children[0].textContent === 'BTN');
  ok('每个座位都有设为「我」的星标按钮',
     seats.every(s => String(s.children[0].children[1].className) === 'tseat-star'));
  ok('座位初始份额占位为 --',
     seats.every(s => s.children[2].textContent === '--' && String(s.children[2].className).indexOf('dim') >= 0));

  const hero = byId['rvSlotsHero'].children;
  ok('桌下摘要条渲染你手上的 2 张牌', hero.length === 2, hero.length + '');
  ok('摘要条第一张是 A♠（红黑分开渲染）',
     hero[0].innerHTML.indexOf('A') > 0 && String(hero[0].className).indexOf('red') < 0,
     String(hero[0].className));
  ok('摘要条标注你的座位', byId['rvHeroPos'].textContent.indexOf('BTN') === 0,
     byId['rvHeroPos'].textContent);
  ok('摘要条统计对手家数', /对手 5 家/.test(byId['rvHeroMsg'].textContent),
     byId['rvHeroMsg'].textContent);
  ok('摘要条统计已知 / 未知', /已知 4 · 未知 1/.test(byId['rvHeroMsg'].textContent),
     byId['rvHeroMsg'].textContent);
}

/* ---------- 4. 人数切换与手牌保留 ---------- */
head('[4] 人数切换：位置重排 + 手牌按位置保留');
{
  api.applyReview(api.RV_DEMOS[3]);
  api.setRvCount(9);
  ok('扩到 9 人', api.review.seats.length === 9, api.review.seats.length + '');
  ok('位置为 9 人标准分配',
     api.review.seats.map(s => s.pos).join('/') === 'UTG/UTG+1/UTG+2/MP/HJ/CO/BTN/SB/BB',
     api.review.seats.map(s => s.pos).join('/'));
  ok('BTN 的手牌按位置带了过来',
     api.review.seats[6].pos === 'BTN' && api.review.seats[6].cards[0] === C('As'),
     api.review.seats[6].cards.join(','));
  ok('CO 的手牌同样保留', api.review.seats[5].cards[0] === C('Ks'));
  /* 6-max 里没有 UTG+1 / UTG+2 / HJ，这三个位置才是新增的 */
  ok('新增位置（UTG+1 / UTG+2 / HJ）手牌全部留空',
     api.review.seats[1].cards[0] === null && api.review.seats[2].cards[0] === null &&
     api.review.seats[4].cards[0] === null,
     api.review.seats.map(s => s.pos + ':' + (s.cards[0] === null ? '空' : '有')).join(' '));
  ok('渲染同步到 9 个座位', byId['tblSeats'].children.length === 9);
  ok('人数下拉同步为 9', byId['rvCount'].value === '9', byId['rvCount'].value);
  ok('位置下拉同步为 9 项', byId['rvPos'].children.length === 9);

  api.setHeroPos('UTG');
  ok('点星标可换座位 → 你的位置 = UTG', api.review.pos === 'UTG' && api.heroIndex() === 0);
  ok('换了座位后你的座位挪到正下方',
     parseFloat(byId['tblSeats'].children[0].style.top) ===
     Math.max(...byId['tblSeats'].children.map(s => parseFloat(s.style.top))));

  api.setRvCount(2);
  ok('缩到 2 人只剩 BTN / BB', api.review.seats.map(s => s.pos).join('/') === 'BTN/BB',
     api.review.seats.map(s => s.pos).join('/'));
  ok('BTN 手牌仍在', api.review.seats[0].cards[0] === C('As'));
  ok('BB 本来留空 → 仍为空', api.review.seats[1].cards[0] === null);
  ok('UTG 位置消失后你的座位自动落到 BTN', api.review.pos === 'BTN', api.review.pos);

  ok('人数下限锁在 2', (api.setRvCount(1), api.review.seats.length === 2));
  ok('人数上限锁在 9', (api.setRvCount(99), api.review.seats.length === 9));
}

/* ---------- 5. 多人份额（含未知手牌） ---------- */
head('[5] 多人底池份额');
{
  api.applyReview(api.RV_DEMOS[3]);
  const hi = api.heroIndex();
  const opps = api.review.seats
    .map((s, i) => ({ s: s, i: i }))
    .filter(x => x.i !== hi)
    .map(x => ({ pos: x.s.pos, cards: api.seatKnown(x.s) ? [x.s.cards[0], x.s.cards[1]] : null }));

  ok('座位表里 BB 的手牌为 null（未知）', opps[4].pos === 'BB' && opps[4].cards === null);

  const heroArr = [api.review.seats[hi].cards[0], api.review.seats[hi].cards[1]];
  const bArr = ['Js', '7s', '2h', '3c', '9d'].map(C);
  const eq = api.equityVsOpps(heroArr, opps, bArr, 5, 40000);

  ok('返回 6 个座位的明细', eq.bySeat.length === 6 && eq.players === 6, eq.bySeat.length + '');
  const sum = eq.bySeat.reduce((a, s) => a + s.eq, 0);
  ok('六家份额合计 = 100%', Math.abs(sum - 100) < 1e-6, sum.toFixed(6) + '%');
  ok('你的胜+平+负 = 100%（结算次数守恒）',
     Math.abs(eq.win + eq.tie + eq.lose - 100) < 1e-6,
     (eq.win + eq.tie + eq.lose).toFixed(6) + '%');
  ok('份额非零 —— 防止「公共牌已发满 + 有人未知」退回全 0（修掉的老 bug）',
     eq.equity > 0, eq.equity.toFixed(2) + '%');
  ok('5 张公共牌 + 1 家未知走的仍是精确枚举',
     eq.method.indexOf('精确枚举') === 0, eq.method);
  const winSum = eq.bySeat.reduce((a, s) => a + s.win, 0);
  ok('六家的「独占胜率」合计 ≤ 100%', winSum <= 100.000001, winSum.toFixed(4) + '%');
  /* 河牌已发满 → 牌面已定，四个已知对手（TT / QQ / KK / 87s）全被 AA 压死 */
  ok('河牌已定：四个已知对手份额精确为 0',
     eq.bySeat.slice(1, 5).every(s => s.eq === 0),
     eq.bySeat.slice(1, 5).map(s => s.eq.toFixed(2)).join(' / '));
  ok('未翻牌的 BB 独占剩余份额（10%~20%）',
     eq.bySeat[5].eq > 10 && eq.bySeat[5].eq < 20, eq.bySeat[5].eq.toFixed(2) + '%');
  ok('AA 份额 + BB 份额 = 100%',
     Math.abs(eq.bySeat[0].eq + eq.bySeat[5].eq - 100) < 1e-6,
     eq.bySeat[0].eq.toFixed(4) + '% + ' + eq.bySeat[5].eq.toFixed(4) + '%');

  console.log('  \u2192 各座位份额：' + eq.bySeat.map((s, i) =>
    (i === 0 ? '你' : opps[i - 1].pos) + ' ' + s.eq.toFixed(1) + '%').join('  '));
}

/* ---------- 6. 多人门槛 ---------- */
head('[6] 多人底池下的翻牌前门槛');
{
  const one = api.judgePreflop(55, 3, 3, false, 'BTN', 1.5, 0, 1);
  const six = api.judgePreflop(55, 3, 3, false, 'BTN', 1.5, 0, 6);
  const max = api.judgePreflop(55, 3, 3, false, 'BTN', 1.5, 0, 99);

  ok('单挑门槛 = 48% + 3% = 51%', Math.abs(one.threshold - 51) < 1e-9, one.threshold.toFixed(2) + '%');
  ok('6 人门槛 = 51% + 5×1.5% = 58.5%', Math.abs(six.threshold - 58.5) < 1e-9, six.threshold.toFixed(2) + '%');
  ok('门槛抬升封顶 +10 个点', Math.abs(max.threshold - 61) < 1e-9, max.threshold.toFixed(2) + '%');
  ok('不传人数参数时行为不变（默认单挑）',
     Math.abs(api.judgePreflop(55, 3, 3, false, 'BTN', 1.5, 0).threshold - 51) < 1e-9);

  ok('同一手牌(55%)：单挑判合理', one.tag === '最优', one.tag);
  ok('同一手牌(55%)：六人桌判入池过松', six.tag === '入池过松', six.tag);
  ok('单挑无 multiway 标记', one.multiway === false);
  ok('六人桌带 multiway 标记', six.multiway === true);

  const post = api.judgePostflop(30, 100, 100, 100, false, 5);
  ok('翻后门槛不随人数变化（多对手已体现在份额里）',
     Math.abs(post.threshold - api.judgePostflop(30, 100, 100, 100, false, 1).threshold) < 1e-9,
     post.threshold.toFixed(2) + '%');
}

/* ---------- 7. 多人 runReview + 报告渲染 ---------- */
head('[7] 多人 runReview 与报告');
{
  api.applyReview(api.RV_DEMOS[3]);
  const hi = api.heroIndex();
  const opps = api.review.seats
    .map((s, i) => ({ s: s, i: i }))
    .filter(x => x.i !== hi)
    .map(x => ({ pos: x.s.pos, cards: api.seatKnown(x.s) ? [x.s.cards[0], x.s.cards[1]] : null }));

  const t0 = Date.now();
  const rep = api.runReview([C('As'), C('Ah')], [], ['Js', '7s', '2h', '3c', '9d'].map(C), false,
                            'BTN', 100, opps);
  const dt = Date.now() - t0;
  console.log('  \u2192 六人桌 5 张公共牌，分析耗时 ' + dt + ' ms');

  ok('分析不抛异常，产出 4 条街', rep.list.length === 4, rep.list.length + '');
  ok('标记为多人底池', rep.multiway === true && rep.oppCount === 5);
  ok('座位表 6 行', rep.seatTable && rep.seatTable.length === 6);
  ok('第 0 行是「你」', rep.seatTable[0].isHero === true && rep.seatTable[0].pos === 'BTN');
  ok('BB 行手牌标为未知（null）', rep.seatTable[5].pos === 'BB' && rep.seatTable[5].cards === null);
  const sum = rep.seatTable.reduce((a, r) => a + r.eq, 0);
  ok('座位表份额合计 = 100%', Math.abs(sum - 100) < 1e-6, sum.toFixed(6) + '%');
  ok('每条街的胜率都是 6 人份额（比单挑低）',
     rep.list[1].equity < 100 && rep.list[1].equity > 0, rep.list[1].equity.toFixed(2) + '%');
  ok('翻后评语带多人说明', rep.list[1].verdict.text.indexOf('人底池') > 0);

  api.renderReviewReport(rep);
  const out = byId['rvReport'].innerHTML;

  ok('报告含座位份额表', out.indexOf('rv-seat-table') > 0);
  ok('表体 6 行（另有 1 行表头）', (out.match(/<tr/g) || []).length === 7,
     (out.match(/<tr/g) || []).length + '');
  ok('你的行被高亮', out.indexOf('rv-seat-hero') > 0);
  ok('你的行标「你 · BTN」', /<b>你<\/b> · BTN/.test(out));
  ok('未知座位显示「未知」', out.indexOf('rv-seat-unk') > 0);
  ok('含多人口径说明', out.indexOf('人底池') > 0);
  ok('报告无 undefined / NaN 泄漏', !/undefined|NaN/.test(out));
  ok('份额条宽度合法（无 width:NaN）', !/width:NaN/.test(out), '');
  ok('份额条按百分比渲染', /<i style="width:\d+(\.\d+)?%"><\/i>/.test(out));

  /* 未知手牌带来的采样误差控制在 1 个点内：与不指定 BB 的两次结果对比 */
  const rep2 = api.runReview([C('As'), C('Ah')], [], ['Js', '7s', '2h', '3c', '9d'].map(C), false,
                             'BTN', 100, opps);
  ok('两次运行结果稳定（未知手牌为精确枚举，偏差 < 0.01）',
     Math.abs(rep.list[3].equity - rep2.list[3].equity) < 0.01,
     rep.list[3].equity.toFixed(4) + ' vs ' + rep2.list[3].equity.toFixed(4));
}

/* ---------- 8. 单挑路径回归（改造前后必须一致） ---------- */
head('[8] 单挑路径回归');
{
  const a = api.equityAt([C('As'), C('Ah')], [C('Kd'), C('Kc')], [], true, 0, 60000);
  ok('equityAt 走精确枚举', a.method.indexOf('精确枚举') === 0, a.method);
  ok('AA vs KK 胜率 81.06%', Math.abs(a.win - 81.06) < 0.01, a.win.toFixed(2) + '%');
  ok('AA vs KK 平局 0.38%', Math.abs(a.tie - 0.38) < 0.01, a.tie.toFixed(2) + '%');
  ok('AA vs KK 份额 81.26%', Math.abs(a.equity - 81.2555) < 0.01, a.equity.toFixed(4) + '%');
  ok('equityAt 返回 2 个座位的明细', a.bySeat.length === 2 && a.players === 2);

  api.applyReview(api.RV_DEMOS[0]);   /* 两人示例 */
  /* 示例现在是金额口径（大盲 = 2），所以显式传 bb=2 —— 换算回大盲倍数后，
     判定结果必须与「全用 BB 记账」的旧版本一模一张，总分 7.83 不该动。 */
  const rep = api.runReview([C('As'), C('Ah')], [C('Qh'), C('Qd')],
                            ['Js', '7s', '2h', '3c', '9d'].map(C), true, 'BTN', 200, null, 2);
  ok('8 参数调用（单挑 + 指定大盲）可用', rep.list.length === 4, rep.list.length + '');

  /* 省略 bb 时按 1 处理 —— 老调用点（金额即大盲倍数）行为不变 */
  const repOld = api.runReview([C('As'), C('Ah')], [C('Qh'), C('Qd')],
                               ['Js', '7s', '2h', '3c', '9d'].map(C), true, 'BTN', 100);
  ok('省略大盲参数时旧调用仍然可用（默认按 1 换算）',
     repOld.list.length === 4 && repOld.bb === 1, 'bb=' + repOld.bb);
  ok('单挑也能拿到 2 行座位表', rep.seatTable && rep.seatTable.length === 2,
     rep.seatTable ? rep.seatTable.length + ' 行' : 'null');
  ok('座位表第 0 行仍是「你」', rep.seatTable[0].isHero === true);
  ok('单挑调用不带多人标记', rep.multiway === false && rep.oppCount === 1);
  ok('单挑总分与改造前一致（7.83）', Math.abs(rep.total - 7.83) < 0.02, rep.total.toFixed(2));

  api.renderReviewReport(rep);
  ok('单挑报告不渲染座位份额表（只对 3 人以上出表）',
     byId['rvReport'].innerHTML.indexOf('rv-seat-table') < 0);
}

/* ---------- 9. 全部示例都能载入 ---------- */
head('[9] 所有内置示例的牌桌合法性');
{
  api.RV_DEMOS.forEach(function(d){
    api.applyReview(d);
    const n = api.review.seats.length;
    const posSet = new Set(api.review.seats.map(s => s.pos));
    const hi = api.heroIndex();
    const used = {};
    let dup = null;
    api.review.seats.forEach(function(s){
      s.cards.forEach(function(c){
        if (c === null) return;
        if (used[c]) dup = c;
        used[c] = 1;
      });
    });
    const okAll = posSet.size === n && api.review.pos === d.pos && hi >= 0 &&
                  !dup && byId['tblSeats'].children.length === n;
    ok('示例「' + d.name + '」座位合法（' + n + ' 人 · 位置不重复 · 无重复牌 · 座位已渲染）',
       okAll, dup ? '重复牌 ' + dup : '你 = ' + api.review.pos);
  });
}

/* ---------- 10. 人数规模下的耗时 ---------- */
head('[10] 不同人数下的分析耗时');
{
  const POS = api.POS_SETS[9];
  const btn = POS.indexOf('BTN');
  /* 第 btn 项固定是 BTN，把 AA 放在那里，让「你」拿 AA 好判断合理性 */
  const hands = [['Ks','Kd'],['Qh','Qd'],['Jh','Jd'],['Th','Ts'],['9h','9c'],
                 ['8h','7h'],['As','Ah'],['6s','5s'],['4d','4c']];
  const allKnown = POS.map(function(p, i){ return { pos: p, cards: hands[i].map(C) }; });

  const heroAll = allKnown[btn].cards.slice();
  const oppAll = allKnown.filter(function(_, i){ return i !== btn; })
                         .map(function(s){ return { pos: s.pos, cards: s.cards }; });
  ok('测试场景：「你」在 BTN 拿 AA', heroAll[0] === C('As') && allKnown[btn].pos === 'BTN');

  api.review.seats = allKnown.map(function(s){ return { pos: s.pos, cards: s.cards.slice() }; });
  api.review.pos = 'BTN';

  let t0 = Date.now();
  const r1 = api.runReview(heroAll, [], [], false, 'BTN', 100, oppAll);
  const d1 = Date.now() - t0;
  ok('9 人桌翻牌前（全员已知）走精确枚举 < 3000ms',
     d1 < 3000 && r1.list.length === 1 && r1.seatTable && r1.seatTable.length === 9,
     d1 + ' ms · ' + r1.list.length + ' 条街 · 9 个座位');
  ok('9 人桌翻牌前也能给出各座位份额',
     Math.abs(r1.seatTable.reduce((a, x) => a + x.eq, 0) - 100) < 1e-6,
     r1.seatTable.map(x => x.eq.toFixed(1)).join('/') + '%');
  /* AA 面对 6 个口袋对 + 2 个同花连牌，份额必然远低于对随机手牌（约 35%） */
  ok('AA 在 8 家已知强牌面前份额 18%~30%',
     r1.seatTable[0].eq > 18 && r1.seatTable[0].eq < 30, r1.seatTable[0].eq.toFixed(2) + '%');
  ok('AA 仍是桌上份额最高的（22.2% > 其他任何一家）',
     r1.seatTable.slice(1).every(x => x.eq < r1.seatTable[0].eq),
     r1.seatTable.map(x => x.eq.toFixed(1)).join('/') + '%');
  ok('9 家份额合计 100%',
     Math.abs(r1.seatTable.reduce((a, x) => a + x.eq, 0) - 100) < 1e-6);

  /* 换一下座位顺序：同一手牌的份额必须跟着人走，验证「座位 ↔ 份额」的映射 */
  const kkSeat = oppAll[0];                                  /* UTG 拿 KK */
  const permuted = api.equityVsOpps(kkSeat.cards,
    [{ pos: 'BTN', cards: heroAll }].concat(
      oppAll.slice(1).map(function(s){ return { pos: s.pos, cards: s.cards }; })),
    [], 0, 40000);
  ok('换座位顺序后同两手牌的份额一字不差（映射正确）',
     Math.abs(permuted.bySeat[0].eq - r1.seatTable[1].eq) < 1e-9 &&
     Math.abs(permuted.bySeat[1].eq - r1.seatTable[0].eq) < 1e-9,
     'KK ' + permuted.bySeat[0].eq.toFixed(4) + '% / AA ' + permuted.bySeat[1].eq.toFixed(4) + '%');

  const oppUnknown = oppAll.map(function(s){ return { pos: s.pos, cards: null }; });
  t0 = Date.now();
  const r2 = api.runReview(heroAll, [], [], false, 'BTN', 100, oppUnknown);
  const d2 = Date.now() - t0;
  ok('9 人桌翻牌前（8 家未知）走采样 < 4000ms',
     d2 < 4000 && r2.seatTable && r2.seatTable.length === 9, d2 + ' ms');
  ok('AA 对 8 家随机手牌份额约 30%',
     r2.seatTable[0].eq > 25 && r2.seatTable[0].eq < 40, r2.seatTable[0].eq.toFixed(2) + '%');

  const sum2 = r2.seatTable.reduce((a, x) => a + x.eq, 0);
  ok('9 人采样份额仍然守恒', Math.abs(sum2 - 100) < 1e-6, sum2.toFixed(6) + '%');
}

/* ---------- 11. 样式双向一致性 ---------- */
head('[11] 样式一致性（CSS ⟷ 渲染产物）');
{
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const cssClasses = new Set([...css.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map(x => x[1]));

  function collect(el, set){
    String(el.className || '').split(/\s+/).forEach(function(c){ if (c) set.add(c); });
    (el.children || []).forEach(function(ch){ collect(ch, set); });
  }

  const used = new Set();
  collect(byId['tblSeats'], used);
  collect(byId['rvSlotsHero'], used);
  byId['rvReport'].innerHTML.match(/class="([^"]*)"/g) &&
    byId['rvReport'].innerHTML.match(/class="([^"]*)"/g).forEach(function(m){
      m.slice(7, -1).split(/\s+/).forEach(function(c){ if (c) used.add(c); });
    });

  const noCss = [...used].filter(c => !cssClasses.has(c));
  ok('牌桌渲染用到的 ' + used.size + ' 个 class 全部有 CSS 定义',
     noCss.length === 0, noCss.join(', ') || '');

  /* 反向：写了样式的牌桌类必须真的被用到（在 <style> 之外出现） */
  const mine = [...cssClasses].filter(c => /^(tbl-|tseat|rv-hero|rv-seat)/.test(c));
  const unused = mine.filter(c => outside.indexOf(c) < 0);
  ok('新增的 ' + mine.length + ' 个牌桌类都被实际使用', unused.length === 0, unused.join(', ') || '');

  /* 样式块本身 */
  const ob = (css.match(/\{/g) || []).length, cb = (css.match(/\}/g) || []).length;
  ok('CSS 花括号配平', ob === cb, ob + ' 开 / ' + cb + ' 闭');
  ok('CSS 无连续分号', !/;;/.test(css));
  ok('存在窄屏适配（牌桌高度与座位尺寸）',
     /@media\(max-width:640px\)\{[^}]*\.tbl-wrap\{height:378px/.test(css.replace(/\n\s*/g, '')) ||
     css.indexOf('.tbl-wrap{height:378px;}') >= 0);
}

/* ---------- 12. HTML 结构 ---------- */
head('[12] HTML 结构');
{
  ok('牌桌容器存在', html.indexOf('id="tblWrap"') > 0);
  ok('座位层存在', html.indexOf('id="tblSeats"') > 0);
  ok('台面（felt）在座位层之前', html.indexOf('tbl-felt') < html.indexOf('id="tblSeats"'));
  ok('公共牌区在桌子中央', /tbl-center[\s\S]{0,200}id="rvSlotsBoard"/.test(html));
  ok('底池牌块在桌子中央', /tbl-center[\s\S]{0,400}id="tblPot"/.test(html));
  ok('人数下拉存在', html.indexOf('id="rvCount"') > 0);
  ok('「你」摘要条存在', html.indexOf('id="rvSlotsHero"') > 0 && html.indexOf('id="rvHeroPos"') > 0);
  ok('复盘操作按钮仍在', html.indexOf('id="rvAnalyze"') > 0 && html.indexOf('id="rvClear"') > 0);
  ok('仍然只有两个 Tab（未新增第三个）',
     (html.match(/class="tab[ "]/g) || []).length === 2,
     (html.match(/class="tab[ "]/g) || []).length + '');
  ok('旧的「对手手牌」固定行已移除', html.indexOf('rvSlotsVillain') < 0);
}

/* ---------- 13. 金额口径 + 前注（ante） ---------- */
head('[13] 金额口径 / 大盲换算 / 前注');
{
  /* 一张干净的六人桌：全员已知，公共牌发满 → 精确枚举、结果可复现。
     所有数字都是**金额**，大盲 = 2。 */
  const mkT6 = (ante, bb) => ({
    name: 't6', pos: 'BTN', stack: 200, bb: bb, ante: ante,
    streets: [
      { opp:2, me:2, fold:false },
      { opp:3, me:3, fold:false },
      { opp:5, me:5, fold:false },
      { opp:8, me:8, fold:false }
    ],
    seats: [
      { pos:'UTG', cards:['Th','Ts'] },
      { pos:'MP',  cards:['Qh','Qd'] },
      { pos:'CO',  cards:['Ks','Kd'] },
      { pos:'BTN', cards:['As','Ah'] },
      { pos:'SB',  cards:['8h','7h'] },
      { pos:'BB',  cards:['2c','2d'] }
    ]
  });
  const near = (a, b) => Math.abs(a - b) < 1e-9;

  /* --- 13.1 起始底池 = 大盲 × 2 + 前注 × 人数 --- */
  api.applyReview(mkT6(0, 2));
  ok('大盲 2、无前注 → 起始底池 = 4',
     near(api.bigBlind(), 2) && near(api.startPot(), 4) && near(api.anteTotal(), 0),
     api.startPot() + '');
  ok('无前注：牌桌上的前注标签隐藏', byId['tblAnte'].hidden === true);
  /* 台面底池是「起始 + 各街投入」的总额：4 + (4+6+10+16) = 40 */
  ok('无前注：台面底池总额 = 40',
     byId['tblPot'].innerHTML.indexOf('40') > 0, byId['tblPot'].innerHTML);
  ok('台面底池不再带 BB 单位',
     byId['tblPot'].innerHTML.indexOf('BB') < 0, byId['tblPot'].innerHTML);

  api.applyReview(mkT6(0.5, 2));
  ok('6 人 × 0.5 = 3 前注', near(api.anteTotal(), 3), api.anteTotal() + '');
  ok('起始底池 = 4 + 3 = 7', near(api.startPot(), 7), api.startPot() + '');
  ok('台面底池总额 = 40 + 3 = 43（前注已并入底池）',
     byId['tblPot'].innerHTML.indexOf('43') > 0, byId['tblPot'].innerHTML);
  ok('前注标签显示「0.5 × 6 家」的构成且不带单位',
     byId['tblAnte'].hidden === false &&
     byId['tblAnte'].innerHTML.indexOf('0.5') > 0 &&
     byId['tblAnte'].innerHTML.indexOf('6') > 0 &&
     byId['tblAnte'].innerHTML.indexOf('BB') < 0,
     byId['tblAnte'].innerHTML);
  ok('行动线第一街「本街底池」= 起始 7 + 本街投入 4 = 11（结束后口径，实时累加）',
     api.rvStreetEls[0].potEl.textContent === '11',
     api.rvStreetEls[0].potEl.textContent);

  /* 大盲是「盲注」在金额口径下的真实来源 */
  api.applyReview(mkT6(0, 10));
  ok('大盲改成 10 → 起始底池 = 20', near(api.startPot(), 20), api.startPot() + '');
  ok('大盲清空 / 为 0 时回落到默认值',
     (function(){ api.review.bb = 0; var v = api.bigBlind(); api.review.bb = 2; return v === api.DEFAULT_BB; })(),
     'DEFAULT_BB=' + api.DEFAULT_BB);

  /* 人数变化 → 前注总额跟着变 */
  api.applyReview(mkT6(0.5, 2));
  api.setRvCount(3);
  ok('切到 3 人后前注总额 = 1.5', near(api.anteTotal(), 1.5), api.anteTotal() + '');
  ok('切到 3 人后起始底池 = 5.5', near(api.startPot(), 5.5), api.startPot() + '');
  api.setRvCount(6);

  /* 前注归零后标签必须收回去 */
  api.review.ante = 0;
  api.updateTablePot();
  ok('前注改回 0 后标签重新隐藏', byId['tblAnte'].hidden === true);

  /* --- 13.2 金额 ⟷ 大盲倍数的换算 --- */
  /* 同一条行动线：金额口径（大盲 2）与大盲口径（大盲 1）必须给出完全相同的判定 */
  const money = api.judgePreflop(55, 6, 6, false, 'BTN', 3, 0, 1, 3, 2);
  const inBB  = api.judgePreflop(55, 3, 3, false, 'BTN', 1.5, 0, 1, 1.5, 1);
  const amtOf = s => parseFloat(String(s).replace(/[^\d.]/g, ''));
  ok('金额口径与大盲口径的门槛完全相同',
     near(money.threshold, inBB.threshold),
     money.threshold.toFixed(2) + '% / ' + inBB.threshold.toFixed(2) + '%');
  ok('建议金额按大盲比例缩放（3 → 6）',
     near(amtOf(money.ideal), amtOf(inBB.ideal) * 2),
     inBB.ideal + '  →  ' + money.ideal);

  /* 金额不变、大盲变 → 「这是几个大盲」跟着变，门槛必须跟着变 */
  const bb2 = api.judgePreflop(55, 6, 6, false, 'BTN', 3, 0, 1, 0, 2);  /* 6 = 3 个大盲 */
  const bb4 = api.judgePreflop(55, 6, 6, false, 'BTN', 3, 0, 1, 0, 4);  /* 6 = 1.5 个大盲 */
  ok('同样 6 的加注，大盲 2 时门槛高于大盲 4（前者相当于更大的加注）',
     bb2.threshold > bb4.threshold,
     '大盲2 → ' + bb2.threshold.toFixed(1) + '%  >  大盲4 → ' + bb4.threshold.toFixed(1) + '%');

  /* --- 13.3 前注放宽翻牌前门槛（按「多少个大盲」计） --- */
  const P = (antePot) => api.judgePreflop(55, 6, 6, false, 'BTN', 3, 0, 1, antePot, 2);
  const noA = P(0), a1 = P(3), a2 = P(4), aMax = P(200);
  ok('不传前注时门槛与改造前一致（向后兼容）',
     near(noA.threshold, api.judgePreflop(55, 6, 6, false, 'BTN', 3, 0, 1).threshold));
  ok('前注 3（= 1.5 个大盲）→ 门槛放宽 6 个点',
     near(noA.threshold - a1.threshold, 6), (noA.threshold - a1.threshold).toFixed(2));
  ok('前注 4（= 2 个大盲）→ 门槛放宽 8 个点',
     near(noA.threshold - a2.threshold, 8), (noA.threshold - a2.threshold).toFixed(2));
  ok('放宽封顶 8 个点（再多前注也不继续降）',
     near(noA.threshold - aMax.threshold, 8), (noA.threshold - aMax.threshold).toFixed(2));
  ok('anteAdj 会随返回值带出来', near(a1.anteAdj, 0.06) && near(aMax.anteAdj, 0.08),
     a1.anteAdj + ' / ' + aMax.anteAdj);

  /* 门槛不变量：任何位置 × 任何大盲 × 任何前注，门槛都落在 [18, 92] 区间内 */
  let inRange = true, lo = 200, hi = -1;
  for (const pos of ['UTG','MP','CO','BTN','SB','BB']){
    for (const ap of [0, 1.5, 3, 10, 50, 300]){
      for (const bbx of [1, 2, 10]){
        const t = api.judgePreflop(50, 3 * bbx, 3 * bbx, false, pos, 1.5 * bbx, 0, 1, ap, bbx).threshold;
        if (!(t >= 18 && t <= 92)) inRange = false;
        lo = Math.min(lo, t); hi = Math.max(hi, t);
      }
    }
  }
  ok('门槛在任意大盲 / 前注组合下都落在 18%~92% 区间', inRange,
     lo.toFixed(1) + '~' + hi.toFixed(1));

  /* --- 13.4 runReview：金额口径下的逐街底池 --- */
  const hero = [C('As'), C('Ah')];
  const board = ['Js','7s','2h','3c','9d'].map(C);
  const opps = [
    { pos:'UTG', cards:[C('Th'), C('Ts')] },
    { pos:'MP',  cards:[C('Qh'), C('Qd')] },
    { pos:'CO',  cards:[C('Ks'), C('Kd')] },
    { pos:'SB',  cards:[C('8h'), C('7h')] },
    { pos:'BB',  cards:[C('2c'), C('2d')] }
  ];
  /* mkT6 各街投入 2 / 3 / 5 / 8 → 累计 4 / 6 / 10 / 16 */
  const runM = (ante, bb) => {
    api.applyReview(mkT6(ante, bb));
    return api.runReview(hero, [], board, false, 'BTN', 200, opps, bb);
  };

  const rA = runM(0.5, 2);
  ok('runReview 返回 ante / antePot / bb',
     near(rA.ante, 0.5) && near(rA.antePot, 3) && rA.bb === 2,
     rA.ante + ' / ' + rA.antePot + ' / bb=' + rA.bb);
  ok('翻牌前「本街底池」= 2×2 + 3 = 7',
     near(rA.list[0].potBefore, 7), rA.list[0].potBefore + '');
  ok('逐街底池把盲注与前注带进后续每一街',
     near(rA.list[1].potBefore, 11) && near(rA.list[2].potBefore, 17) &&
     near(rA.list[3].potBefore, 27),
     rA.list.map(x => x.potBefore).join(' / '));
  ok('前注说明写进了翻牌前的解读文案',
     rA.list[0].verdict.text.indexOf('前注') >= 0);

  /* 同一手牌 + 同一条行动线，只换记账单位：评分必须一字不差 */
  const rBB = (function(){
    const d = mkT6(0.25, 1);
    d.streets = d.streets.map(s => ({ opp: s.opp / 2, me: s.me / 2, fold: s.fold }));
    api.applyReview(d);
    return api.runReview(hero, [], board, false, 'BTN', 100, opps, 1);
  })();
  ok('换记账单位不改变总分（金额口径 ⟷ 纯大盲口径）',
     near(rA.total, rBB.total),
     '金额 ' + rA.total.toFixed(2) + '  vs  大盲 ' + rBB.total.toFixed(2));
  ok('换单位后逐街底池恰好按比例缩放（×2）',
     rA.list.every((x, k) => near(x.potBefore, rBB.list[k].potBefore * 2)),
     rA.list.map(x => x.potBefore).join('/') + '  vs  ' +
     rBB.list.map(x => x.potBefore).join('/'));

  /* 前注只影响钱，不影响概率：份额必须逐位完全一致 */
  const r0 = runM(0, 2);
  const r1 = runM(1.5, 2);
  let same = r0.seatTable.length === r1.seatTable.length;
  if (same) r0.seatTable.forEach((row, k) => {
    if (row.eq !== r1.seatTable[k].eq || row.win !== r1.seatTable[k].win) same = false;
  });
  ok('前注不改变任何座位的份额（只动钱、不动概率）', same,
     r0.seatTable.map(x => x.eq.toFixed(2)).join('/') + '  vs  ' +
     r1.seatTable.map(x => x.eq.toFixed(2)).join('/'));
  ok('份额守恒仍然成立（Σ = 100%）',
     near(r1.seatTable.reduce((s, x) => s + x.eq, 0), 100),
     r1.seatTable.reduce((s, x) => s + x.eq, 0).toFixed(6));

  /* --- 13.5 报告渲染 --- */
  api.renderReviewReport(runM(0.5, 2));
  const rh = byId['rvReport'].innerHTML;
  ok('报告里给出前注死钱的构成与放宽量',
     rh.indexOf('桌上共') >= 0 && /门槛按前注总量放宽了 <b>6\.0 个百分点/.test(rh));
  ok('报告里说明当前大盲', /当前大盲 = <b>2<\/b>/.test(rh));
  ok('报告无 undefined / NaN 泄漏', !/undefined|NaN/.test(rh));
  ok('报告里不再出现 BB 单位', rh.indexOf(' BB') < 0);
  ok('含前注的报告仍能算出逐街卡片',
     (rh.match(/class="rv-card /g) || []).length === 4,
     (rh.match(/class="rv-card /g) || []).length + '');

  /* 无前注时报告不应该冒出前注相关段落 */
  api.renderReviewReport(runM(0, 2));
  const rh0 = byId['rvReport'].innerHTML;
  ok('无前注时报告不给前注段落（避免噪音）',
     rh0.indexOf('门槛按前注总量放宽了') < 0 && rh0.indexOf('桌上共') < 0);

  /* --- 13.6 示例与结构 --- */
  ok('第 4 个示例是一桌带前注的六人桌',
     api.RV_DEMOS[3] && api.RV_DEMOS[3].ante === 0.5 &&
     api.RV_DEMOS[3].bb === 2 && api.RV_DEMOS[3].seats.length === 6,
     api.RV_DEMOS[3] ? (api.RV_DEMOS[3].ante + ' / 大盲 ' + api.RV_DEMOS[3].bb) : 'missing');
  ok('五个示例都按金额口径声明了大盲与筹码',
     api.RV_DEMOS.every(d => d.bb > 0 && d.stack > 0),
     api.RV_DEMOS.map(d => 'bb' + d.bb + '/' + d.stack).join('  '));
  api.applyReview(api.RV_DEMOS[3]);
  ok('载入该示例后前注框同步为 0.5',
     Number(byId['rvAnte'].value) === 0.5, byId['rvAnte'].value + '');
  ok('载入该示例后大盲框同步为 2',
     Number(byId['rvBB'].value) === 2, byId['rvBB'].value + '');
  ok('载入后起始底池 = 4 + 3 = 7', near(api.startPot(), 7), api.startPot() + '');
  api.clearReview();
  ok('清空后前注/大盲回到默认 6、筹码复位、标签显示',
     Number(byId['rvAnte'].value) === 6 && near(api.anteTotal(), 36) &&
     byId['tblAnte'].hidden === false && near(api.bigBlind(), 6) &&
     Number(byId['rvStack'].value) === 200,
     '前注=' + byId['rvAnte'].value + ' 前注总额=' + api.anteTotal() + ' 大盲=' + api.bigBlind());

  ok('设置面板有前注输入框', html.indexOf('id="rvAnte"') > 0);
  ok('设置面板有大盲输入框', html.indexOf('id="rvBB"') > 0);
  ok('大盲默认 6', /id="rvBB"[^>]*value="6"/.test(html));
  ok('前注默认 6', /id="rvAnte"[^>]*value="6"/.test(html));
  ok('筹码默认 200（金额口径）', /id="rvStack"[^>]*value="200"/.test(html));
  ok('设置面板单位标注已改成金额', html.indexOf('金额（元 / 筹码）') > 0);
  ok('旧的「BB（大盲）」单位标注已移除', html.indexOf('BB（大盲）') < 0);
  ok('牌桌中央有前注标签', html.indexOf('id="tblAnte"') > 0);
  ok('前注标签在桌子中央的区域里', /tbl-center[\s\S]{0,400}id="tblAnte"/.test(html));
  ok('前注标签紧跟在底池之后', html.indexOf('id="tblPot"') < html.indexOf('id="tblAnte"'));
  ok('前注有独立样式 .tbl-ante', /\.tbl-ante\s*\{/.test(html));
  /* 代码层面：不该再有任何「拼 BB 后缀」的字符串字面量 */
  const bbLiterals = code.match(/' BB'|" BB"/g) || [];
  ok('脚本里不再拼「 BB」单位后缀', bbLiterals.length === 0, bbLiterals.join(' '));
  ok('页面上没有残留的「BB 大盲」单位说明',
     html.indexOf('BB（大盲）') < 0 && html.indexOf('本街底池 <b>1.5 BB') < 0);
}

/* ---------- 14. 座位的「未知」标记与一键切换 ---------- */
head('[14] 未知手牌：座位标记 / 一键切换 / 半填拦截 / 报告口径');
{
  /* 座位头的结构是 [位置, 星标, 未知标记]，每次切完都会重渲染，所以要重新取 */
  const chipAt = i => byId['tblSeats'].children[i].children[0].children[2];

  /* --- 14.1 标记渲染 --- */
  api.applyReview(api.RV_DEMOS[3]);        /* 六人桌：5 家已知，BB 未知 */
  const hi = api.heroIndex();              /* BTN = 3 */
  const head0 = byId['tblSeats'].children.map(s => s.children[0]);

  ok('每个座位头都有一枚状态标记',
     head0.every(h => String(h.children[2].className).indexOf('tseat-unk') === 0),
     head0.map(h => h.children[2].className).join(' | '));
  ok('标记排在星标之后（原有座位结构没被挪位）',
     head0.every(h => String(h.children[1].className) === 'tseat-star'));
  ok('已知座位标「已知」', chipAt(0).textContent === '已知', chipAt(0).textContent);
  ok('未知座位标「未知」并高亮',
     chipAt(5).textContent === '未知' &&
     String(chipAt(5).className).indexOf('tseat-unk-on') > 0,
     chipAt(5).textContent + ' / ' + chipAt(5).className);
  ok('状态判定：known / unk',
     api.seatState(api.review.seats[0]) === 'known' &&
     api.seatState(api.review.seats[5]) === 'unk');
  ok('标记带悬停说明', String(chipAt(0).title).indexOf('未知') > 0, chipAt(0).title);

  /* --- 14.2 已知 → 未知 → 已知：往返必须原样还原 --- */
  const co = api.review.seats[2];
  const coBefore = co.cards.slice();
  ok('CO 切换前是已知', api.seatState(co) === 'known');

  api.toggleSeatUnknown(2);
  ok('点一下 → CO 变成未知', api.seatState(co) === 'unk', api.seatState(co));
  ok('未知时把原手牌存进 memo（不丢牌）',
     !!co.memo && co.memo[0] === coBefore[0] && co.memo[1] === coBefore[1],
     String(co.memo));
  ok('切完标记同步成「未知」', chipAt(2).textContent === '未知');
  ok('桌下统计跟着变（已知 3 · 未知 2）',
     /已知 3 · 未知 2/.test(byId['rvHeroMsg'].textContent), byId['rvHeroMsg'].textContent);

  api.toggleSeatUnknown(2);
  ok('再点一下 → 手牌原样还原',
     co.cards[0] === coBefore[0] && co.cards[1] === coBefore[1] && co.memo === null,
     String(co.cards) + ' memo=' + String(co.memo));
  ok('还原后标记回到「已知」', chipAt(2).textContent === '已知');
  ok('还原后统计回到 已知 4 · 未知 1',
     /已知 4 · 未知 1/.test(byId['rvHeroMsg'].textContent), byId['rvHeroMsg'].textContent);

  /* --- 14.3 你自己的座位不能被设为未知 --- */
  const heroSeat = api.review.seats[hi];
  const heroBefore = heroSeat.cards.slice();
  ok('自己的座位标记带锁定样式',
     String(chipAt(hi).className).indexOf('tseat-unk-lock') > 0, String(chipAt(hi).className));
  api.toggleSeatUnknown(hi);
  ok('点自己的标记不会把手牌清掉',
     heroSeat.cards[0] === heroBefore[0] && heroSeat.cards[1] === heroBefore[1]);
  ok('并且提示了原因',
     byId['toast'].textContent.indexOf('不能设为未知') > 0, byId['toast'].textContent);

  /* --- 14.4 只填一张 = 无效状态，分析前必须拦下 --- */
  api.applyReview(api.RV_DEMOS[3]);
  ok('干净牌桌没有拦阻理由', api.reviewBlockReason() === null, api.reviewBlockReason());

  api.review.seats[1].cards[1] = null;      /* MP 只留一张 */
  api.renderTable();
  ok('只填一张 → 状态为 half', api.seatState(api.review.seats[1]) === 'half');
  ok('只填一张 → 标记写「缺一张」',
     chipAt(1).textContent === '缺一张' &&
     String(chipAt(1).className).indexOf('tseat-unk-half') > 0,
     chipAt(1).textContent + ' / ' + chipAt(1).className);
  ok('分析被拦下且指名是哪一家',
     /MP/.test(api.reviewBlockReason() || '') && /只填了一张牌/.test(api.reviewBlockReason() || ''),
     api.reviewBlockReason());

  api.review.seats[hi].cards[1] = null;
  ok('你自己的座位只填一张 → 提示补齐两张',
     /补齐两张/.test(api.reviewBlockReason() || ''), api.reviewBlockReason());

  api.review.seats[hi].cards = [null, null];
  ok('自己的牌一张没选 → 提示先选牌',
     api.reviewBlockReason() === '请先选好你自己座位的两张手牌', api.reviewBlockReason());

  /* --- 14.5 报告里的「已知 / 未知」口径 --- */
  const board = ['Js', '7s', '2h', '3c', '9d'].map(C);
  const hero2 = [C('As'), C('Ah')];
  const allKnown = [
    { pos:'UTG', cards:[C('Th'), C('Ts')] },
    { pos:'MP',  cards:[C('Qh'), C('Qd')] },
    { pos:'CO',  cards:[C('Ks'), C('Kd')] },
    { pos:'SB',  cards:[C('8h'), C('7h')] },
    { pos:'BB',  cards:[C('2c'), C('2d')] }
  ];
  api.applyReview(api.RV_DEMOS[3]);         /* 借它的行动线 */

  const rKnown = api.runReview(hero2, [], board, false, 'BTN', 200, allKnown, 2);
  ok('runReview 如实统计 knownCount / unkCount',
     rKnown.knownCount === 5 && rKnown.unkCount === 0 && rKnown.villainKnown === true,
     rKnown.knownCount + ' / ' + rKnown.unkCount + ' / ' + rKnown.villainKnown);
  api.renderReviewReport(rKnown);
  const rhk = byId['rvReport'].innerHTML;
  ok('全员已知 → 报告说「全部已知」', /家的手牌全部已知/.test(rhk));
  ok('全员已知 → 不再谎报「对手留空」', rhk.indexOf('按随机两手牌估算') < 0,
     rhk.slice(rhk.lastIndexOf('结论只基于')));
  ok('全员已知 → 座位份额表没有「未知」字样', rhk.indexOf('rv-seat-unk') < 0);

  /* 混搭：4 家已知 + BB 未知 */
  const mixed = allKnown.slice(0, 4).concat([{ pos:'BB', cards:null }]);
  const rMix = api.runReview(hero2, [], board, false, 'BTN', 200, mixed, 2);
  ok('混搭时统计正确',
     rMix.knownCount === 4 && rMix.unkCount === 1 && rMix.unkPos.join('/') === 'BB',
     rMix.knownCount + ' / ' + rMix.unkCount + ' / ' + rMix.unkPos.join('/'));
  api.renderReviewReport(rMix);
  const rhm = byId['rvReport'].innerHTML;
  ok('混搭 → 报告写明「4 家已知 / 1 家未知」',
     rhm.indexOf('<b>4 家已知</b>') > 0 && rhm.indexOf('<b>1 家未知</b>') > 0);
  ok('混搭 → 把未知的那一家点名列出来（BB）', rhm.indexOf('（BB）') > 0);
  ok('混搭 → 座位份额表里未知那行标「未知」', rhm.indexOf('rv-seat-unk') > 0);
  ok('混搭报告无 undefined / NaN 泄漏', !/undefined|NaN/.test(rhm));

  /* 全员未知 */
  const noneKnown = mixed.map(o => ({ pos:o.pos, cards:null }));
  const rNone = api.runReview(hero2, [], board, false, 'BTN', 200, noneKnown, 2);
  api.renderReviewReport(rNone);
  ok('全员未知 → 报告说「5 家对手手牌未知」',
     /5 家对手手牌未知/.test(byId['rvReport'].innerHTML));
  ok('全员未知 → knownCount 为 0、villainKnown 为 false',
     rNone.knownCount === 0 && rNone.unkCount === 5 && rNone.villainKnown === false);

  /* --- 14.6 未知座位照样能算出份额（未知 ≠ 不算） --- */
  ok('未知座位的份额仍然参与分配',
     rMix.seatTable && rMix.seatTable.length === 6 &&
     Math.abs(rMix.seatTable.reduce((s, x) => s + x.eq, 0) - 100) < 1e-6,
     rMix.seatTable.map(x => x.eq.toFixed(2)).join('/'));
  ok('未知座位的 cards 在份额表里是 null（渲染为「未知」）',
     rMix.seatTable.filter(r => !r.cards).length === 1);

  /* --- 14.7 换人数 / 清空时 memo 的迁移 --- */
  api.applyReview(api.RV_DEMOS[3]);
  api.toggleSeatUnknown(2);                 /* CO → 未知，memo = K♠K♦ */
  api.setRvCount(9);
  const coIdx = api.review.seats.findIndex(s => s.pos === 'CO');
  ok('换人数后 CO 仍是未知（手牌按位置迁移）',
     api.seatState(api.review.seats[coIdx]) === 'unk');
  ok('memo 也跟着位置迁移',
     !!api.review.seats[coIdx].memo && api.review.seats[coIdx].memo[0] === C('Ks'),
     String(api.review.seats[coIdx].memo));
  api.toggleSeatUnknown(coIdx);
  ok('换人数后仍能一键还原',
     api.review.seats.find(s => s.pos === 'CO').cards[0] === C('Ks'));

  api.applyReview(api.RV_DEMOS[3]);
  api.toggleSeatUnknown(2);
  api.clearReview();
  ok('清空会一并清掉 memo 与手牌',
     api.review.seats.every(s => !s.memo && s.cards[0] === null && s.cards[1] === null));

  /* --- 14.8 结构与样式 --- */
  ok('座位标记有独立样式', /\.tseat-unk\s*\{/.test(html));
  ok('未知态有独立样式', /\.tseat-unk-on\s*\{/.test(html));
  ok('半填态有独立样式', /\.tseat-unk-half\s*\{/.test(html));
  ok('锁定态有独立样式', /\.tseat-unk-lock\s*\{/.test(html));
  ok('提示文案点明了标记可以一键切换', /点一下即可切换/.test(html));
  ok('报告里不再硬编码「当前对手手牌留空」',
     code.indexOf('当前对手手牌留空') < 0);
}

/* ---------- 15. 逐手行动线 ---------- */
head('[15] 逐手行动线：谁在哪个位置怎么打的');
{
  const near9 = (a, b) => Math.abs(a - b) < 1e-9;
  const A = (pos, type, amt) => ({ pos, type, amt });

  /* --- 15.1 聚合口径 --- */
  const g1 = api.streetAgg([
    A('UTG','raise',6), A('MP','call',6), A('BTN','raise',18),
    A('BB','fold',0),  A('UTG','call',12), A('MP','call',12)
  ], 'BTN');
  ok('本街总额 = 全部动作金额之和（6+6+18+12+12）', near9(g1.total, 54), g1.total + '');
  ok('我的投入 = 我在本街放进去的钱（18）', near9(g1.heroAmt, 18), g1.heroAmt + '');
  ok('面对额 = 我出手前对手的最大投入（UTG 的 6，不是我加注后他们补的 12）',
     near9(g1.facing, 6), g1.facing + '');
  ok('我没弃牌', g1.heroFold === false);
  ok('弃牌的位置被记下来', g1.foldPos.join(',') === 'BB', g1.foldPos.join(','));

  const g2 = api.streetAgg([
    A('BB','bet',10), A('BTN','call',10), A('BB','bet',20), A('BTN','call',20)
  ], 'BTN');
  ok('同一人多次投入按追加额累加，不重复计钱', near9(g2.total, 60), g2.total + '');
  ok('  → 本街累计 BB 30 / 我 30',
     near9(g2.cum['BB'], 30) && near9(g2.heroAmt, 30),
     g2.cum['BB'] + ' / ' + g2.heroAmt);

  const g3 = api.streetAgg([
    A('SB','bet',10), A('BTN','call',10), A('SB','bet',30), A('BTN','fold',0)
  ], 'BTN');
  ok('跟注后被再加注：面对额按「我最后一次出手时」的最大对手投入算',
     near9(g3.facing, 40), g3.facing + '');
  ok('  → 弃牌之后不再往里放钱', near9(g3.heroAmt, 10) && g3.heroFold === true,
     g3.heroAmt + ' / fold=' + g3.heroFold);

  /* --- 15.2 老数据（opp / me / fold）等价转换 --- */
  const l1 = api.legacyToActs({ opp:6, me:18, fold:false }, 'BTN', 'BB');
  ok('旧数据 → 两条动作（对手先下注，我再加注）',
     l1.length === 2 && l1[0].pos === 'BB' && l1[0].amt === 6 &&
     l1[1].pos === 'BTN' && l1[1].amt === 18,
     JSON.stringify(l1));
  ok('  → 推断出「加注」而不是跟注', l1[1].type === 'raise', l1[1].type);
  ok('跟注被推断为 call',
     api.legacyToActs({ opp:6, me:6, fold:false }, 'BB', 'BTN')[1].type === 'call');
  ok('无人下注时我下注 → bet',
     api.legacyToActs({ opp:0, me:24, fold:false }, 'CO', 'BTN')[0].type === 'bet');
  ok('我弃牌 → fold，且总额仍是 60',
     (function(){
       const a = api.legacyToActs({ opp:60, me:0, fold:true }, 'BB', 'BTN');
       return a.length === 2 && a[1].type === 'fold' && near9(api.streetAgg(a, 'BB').total, 60);
     })());

  /* 等价性：同一笔钱，动作序列口径 ⟷ 老的两数字口径，底池与总分必须一模一样。
     这是「加功能不偷偷改老行为」最直接的证据。 */
  const hero0 = [C('As'), C('Ah')];
  const board0 = ['Js','7s','2h','3c','9d'].map(C);
  const mkD = streets => ({
    name:'t', pos:'BTN', stack:200, bb:2,
    hero:['As','Ah'], villain:['Qh','Qd'], board:['Js','7s','2h','3c','9d'],
    streets: streets
  });
  api.applyReview(mkD([
    { opp:6,  me:18, fold:false }, { opp:12, me:12, fold:false },
    { opp:30, me:90, fold:false }, { opp:80, me:80, fold:false }
  ]));
  const rLegacy = api.runReview(hero0, [C('Qh'), C('Qd')], board0, true, 'BTN', 200, null, 2);

  api.applyReview(mkD([
    { acts:[A('BB','bet',6),  A('BTN','raise',18)] },
    { acts:[A('BB','bet',12), A('BTN','call',12)] },
    { acts:[A('BB','bet',30), A('BTN','raise',90)] },
    { acts:[A('BB','bet',80), A('BTN','call',80)] }
  ]));
  const rActs = api.runReview(hero0, [C('Qh'), C('Qd')], board0, true, 'BTN', 200, null, 2);

  ok('逐街底池完全一致（动作之和 ⟷ opp + me）',
     rLegacy.list.every((x, k) => near9(x.potBefore, rActs.list[k].potBefore)),
     rLegacy.list.map(x => x.potBefore).join('/') + ' vs ' +
     rActs.list.map(x => x.potBefore).join('/'));
  ok('逐街判定分数完全一致',
     rLegacy.list.every((x, k) => x.verdict.score === rActs.list[k].verdict.score),
     rActs.list.map(x => x.verdict.score).join('/'));
  ok('总分一字不差（仍是改造前的 7.83）',
     near9(rLegacy.total, rActs.total) && Math.abs(rActs.total - 7.83) < 0.02,
     rLegacy.total.toFixed(3) + ' vs ' + rActs.total.toFixed(3));
  ok('「你的动作」文案也一致',
     rLegacy.list.every((x, k) => x.act.me === rActs.list[k].act.me),
     rActs.list.map(x => x.act.me).join(' | '));
  ok('加注写成「加注到 18」（面对 6 再放到 18）',
     rActs.list[0].act.me === '加注到 18', rActs.list[0].act.me);
  ok('行动线文案带位置与顺序',
     rActs.list[0].line.indexOf('BB') === 0 && rActs.list[0].line.indexOf('（你）') > 0,
     rActs.list[0].line);

  /* --- 15.3 多人池的钱必须算全（老口径只加了一家的投入） --- */
  api.applyReview(api.RV_DEMOS[3]);
  ok('六人桌示例第 1 街本街投入 = 72（六家一共放进去的钱）',
     near9(api.streetPot(0), 72), api.streetPot(0) + '');
  ok('  → 第 2/3/4 街分别是 96 / 180 / 240',
     near9(api.streetPot(1), 96) && near9(api.streetPot(2), 180) && near9(api.streetPot(3), 240),
     [0,1,2,3].map(i => api.streetPot(i)).join(' / '));
  ok('牌桌底池 = 起始 7 + 72 + 96 + 180 + 240 = 595',
     byId['tblPot'].innerHTML.indexOf('595') > 0, byId['tblPot'].innerHTML);
  ok('派生字段与动作一致（opp/me/fold 由动作算出来）',
     near9(api.review.streets[0].opp, 6) && near9(api.review.streets[0].me, 18) &&
     api.review.streets[0].fold === false,
     api.review.streets[0].opp + '/' + api.review.streets[0].me);

  const hi6 = api.heroIndex();
  const oppSeats6 = api.review.seats
    .filter((_, i) => i !== hi6)
    .map(s => ({ pos: s.pos, cards: s.cards }));
  const r6 = api.runReview([C('As'), C('Ah')], [], board0, false, 'BTN', 200, oppSeats6, 2);
  ok('逐街底池 = 7 / 79 / 175 / 355',
     r6.list.map(x => x.potBefore).join(',') === '7,79,175,355',
     r6.list.map(x => x.potBefore).join(' / '));
  ok('  → 翻牌前面对 6、投入 18',
     near9(r6.list[0].opp, 6) && near9(r6.list[0].me, 18),
     r6.list[0].opp + '/' + r6.list[0].me);
  ok('  → 河牌我也只有 80（四家跟到底的钱都在里面）',
     near9(r6.list[3].me, 80), r6.list[3].me + '');
  ok('整手牌的行动线总览有 4 条街', r6.flow.length === 4);
  ok('  → 每条都带公共牌与底池', r6.flow[1].cards.length === 3 && r6.flow[1].pot === 79,
     r6.flow[1].cards.length + ' / ' + r6.flow[1].pot);

  /* --- 15.4 UI：动作行 --- */
  api.applyReview(api.RV_DEMOS[3]);
  const e0 = api.rvStreetEls[0];
  ok('第一街按动作条数渲染行', e0.rows.length === 9, e0.rows.length + '');
  ok('每行都有位置 / 动作 / 金额三个输入',
     !!e0.rows[0].posSel && !!e0.rows[0].typeSel && !!e0.rows[0].amtIn);
  ok('位置下拉覆盖全桌 6 个座位', e0.rows[0].posSel.children.length === 6,
     e0.rows[0].posSel.children.length + '');
  ok('动作下拉是 6 种动作（含全下）', e0.rows[0].typeSel.children.length === 6,
     e0.rows[0].typeSel.children.length + '');
  ok('金额框里就是模型里的数', Number(e0.rows[3].amtIn.value) === 18,
     e0.rows[3].amtIn.value + '');
  ok('「你」那一行被标出来，且位置是 BTN',
     String(e0.rows[3].row.className).indexOf('hero') > 0 && e0.rows[3].posSel.value === 'BTN',
     e0.rows[3].row.className + ' / ' + e0.rows[3].posSel.value);
  ok('行尾显示本街累计（加注者累计 18）',
     e0.rows[3].cumEl.textContent.indexOf('18') > 0, e0.rows[3].cumEl.textContent);
  ok('弃牌的行带 folded 标记',
     String(e0.rows[4].row.className).indexOf('folded') > 0, e0.rows[4].row.className);
  ok('第二条街也渲染出 7 行', api.rvStreetEls[1].rows.length === 7,
     api.rvStreetEls[1].rows.length + '');
  ok('街尾写明本街投入与弃牌家数',
     /本街投入 72/.test(api.rvStreetEls[0].noteEl.textContent) &&
     /弃牌/.test(api.rvStreetEls[0].noteEl.textContent),
     api.rvStreetEls[0].noteEl.textContent);

  api.clearReview();
  /* 本组只测「投入实时进底池」，先把前注归零、大盲设回 2，回到起始底池 = 4 的干净基准，
     免得默认值（前注 6 / 大盲 6）掺进来干扰心算。 */
  api.review.ante = 0;
  api.review.bb = 2;
  api.syncStreets();
  ok('清空后动作也清空（不再残留幽灵动作）',
     api.review.streets.every(s => s.acts.length === 0));
  ok('空街给出「还没有动作」的提示',
     api.rvStreetEls[0].logEl.children.length === 1 &&
     api.rvStreetEls[0].logEl.children[0].className === 'rv-actempty');

  api.actAdd(0, 'UTG', 'raise', 6);
  ok('加一手后进入模型并渲染成行',
     api.review.streets[0].acts.length === 1 && api.rvStreetEls[0].rows.length === 1);
  ok('  → 钱立刻反映到台面底池（4 + 6 = 10）',
     byId['tblPot'].innerHTML.indexOf('10') > 0, byId['tblPot'].innerHTML);
  ok('  → 我还没出手时，我的投入是 0', api.review.streets[0].me === 0);

  api.actAdd(0, 'BTN', 'call', 6);
  ok('我再跟注 6：投入 = 6、面对 = 6',
     near9(api.review.streets[0].me, 6) && near9(api.review.streets[0].opp, 6),
     api.review.streets[0].me + '/' + api.review.streets[0].opp);
  ok('  → 台面底池 4 + 12 = 16', byId['tblPot'].innerHTML.indexOf('16') > 0,
     byId['tblPot'].innerHTML);

  api.actSet(0, 0, 'amt', 20);
  ok('改金额：底池跟着变（4 + 20 + 6 = 30）',
     byId['tblPot'].innerHTML.indexOf('30') > 0, byId['tblPot'].innerHTML);

  api.actFillChecks(0);
  ok('整街过牌给还没记录的 4 家各补一条 check',
     api.review.streets[0].acts.length === 6 &&
     api.review.streets[0].acts.filter(a => a.type === 'check').length === 4,
     api.review.streets[0].acts.map(a => a.pos + ':' + a.type).join(' '));
  ok('  → 过牌不加钱，底池不变', byId['tblPot'].innerHTML.indexOf('30') > 0);

  api.actRemove(0, 5);
  ok('删掉一手：行数与模型同步',
     api.review.streets[0].acts.length === 5 && api.rvStreetEls[0].rows.length === 5);

  /* 弃牌 → 后续街道封街 */
  api.actSet(0, 1, 'type', 'fold');
  api.syncStreets();
  ok('我把自己的动作改成弃牌 → 模型识别为弃牌',
     api.review.streets[0].fold === true);
  ok('  → 后续街道被封，底池显示「—」',
     api.rvStreetEls[1].potEl.textContent === '\u2014' &&
     api.rvStreetEls[1].addBtn.disabled === true,
     api.rvStreetEls[1].potEl.textContent);
  api.actSet(0, 1, 'type', 'call');
  api.syncStreets();
  ok('改回跟注后街道重新可用',
     api.review.streets[0].fold === false && api.rvStreetEls[1].addBtn.disabled === false);

  /* 轮次推断 */
  api.clearReview();
  ok('翻牌前第一个说话的是座位表第一位（UTG）', api.firstActorPos(0) === 'UTG',
     api.firstActorPos(0));
  ok('翻牌后第一个说话的是小盲', api.firstActorPos(1) === 'SB', api.firstActorPos(1));
  api.actAdd(0, 'UTG', 'raise', 6);
  ok('加过一手之后默认轮到下一家', api.nextActorPos(0) === 'MP', api.nextActorPos(0));

  api.applyReview(api.RV_DEMOS[3]);
  ok('翻牌前 SB/BB 弃牌后，翻牌第一个说话的是 UTG（跳过已出局的人）',
     api.firstActorPos(1) === 'UTG', api.firstActorPos(1));
  ok('foldedBefore 能列出前面几条街的出局者',
     api.foldedBefore(1).SB === true && api.foldedBefore(1).BB === true &&
     !api.foldedBefore(1).UTG,
     JSON.stringify(api.foldedBefore(1)));

  /* 换人数：掉出座位表的动作要一起丢弃，不能留下幽灵座位往底池里塞钱 */
  api.applyReview(api.RV_DEMOS[4]);         /* 九人桌 */
  const pot9 = api.streetPot(0);
  api.setRvCount(6);
  ok('九人桌缩到六人后，UTG+1/UTG+2/HJ 的动作被丢弃',
     api.review.streets[0].acts.every(a =>
       ['UTG','MP','CO','BTN','SB','BB'].indexOf(a.pos) >= 0),
     api.review.streets[0].acts.map(a => a.pos).join(' '));
  ok('  → 底池随之缩小（幽灵座位不再算钱）',
     api.streetPot(0) < pot9 && api.streetPot(0) > 0,
     pot9 + ' → ' + api.streetPot(0));

  /* --- 15.5 报告：行动线 --- */
  api.applyReview(api.RV_DEMOS[3]);
  api.renderReviewReport(r6);
  const rh = byId['rvReport'].innerHTML;
  ok('报告里有「牌局过程」总览', rh.indexOf('牌局过程') > 0);
  ok('总览一条街一行', (rh.match(/class="rv-flow-r"/g) || []).length === 4,
     (rh.match(/class="rv-flow-r"/g) || []).length + '');
  ok('每条街卡片里都有「本街行动」', (rh.match(/本街行动/g) || []).length === 4,
     (rh.match(/本街行动/g) || []).length + '');
  ok('行动线写出位置 + 动作', /<i>UTG<\/i>加注到 6/.test(rh));
  ok('「你」那一手在行动线里被特别标出', rh.indexOf('BTN（你）') > 0);
  ok('弃牌写出来了', /<i>BB<\/i>弃牌/.test(rh));
  ok('份额表标注了已弃牌的座位',
     rh.indexOf('rv-seat-out') > 0 && rh.indexOf('已弃牌') > 0);
  ok('报告无 undefined / NaN 泄漏', !/undefined|NaN/.test(rh));
  ok('行动线样式有定义', /\.rv-line\s*\{/.test(html) && /\.rv-flow\s*\{/.test(html));
  ok('弃牌标签有独立样式', /\.rv-seat-out\s*\{/.test(html));

  /* --- 15.6 牌桌上的弃牌标记 ---
     （座位元素每次重渲染都会重建，所以从 DOM 现取，别缓存） */
  const eqAt = i => byId['tblSeats'].children[i].children[2];
  api.applyReview(api.RV_DEMOS[3]);
  api.paintSeatEquity(r6, hi6);
  const sbIdx = api.review.seats.findIndex(s => s.pos === 'SB');
  const btnIdx = api.review.seats.findIndex(s => s.pos === 'BTN');
  ok('弃牌的座位在牌桌上写「弃牌」',
     eqAt(sbIdx).textContent.indexOf('弃牌') === 0, eqAt(sbIdx).textContent);
  ok('  → 并带上 out 标记', String(eqAt(sbIdx).className).indexOf('out') > 0,
     eqAt(sbIdx).className);
  ok('没弃牌的座位只显示份额', /^[\d.]/.test(eqAt(btnIdx).textContent),
     eqAt(btnIdx).textContent);
  ok('弃牌态有独立样式', /\.tseat-eq\.out\s*\{/.test(html));

  /* --- 15.7 位置表：九人桌每个位置都要有门槛（NaN 回归） --- */
  let allFinite = true, allInRange = true, span = '';
  api.POS_ALL.forEach(function(p){
    const th = api.judgePreflop(55, 6, 6, false, p, 3, 0, 1, 0, 2).threshold;
    if (!Number.isFinite(th)) allFinite = false;
    if (!(th >= 18 && th <= 92)) allInRange = false;
    span += p + ':' + (Number.isFinite(th) ? th.toFixed(1) : 'NaN') + ' ';
  });
  ok('九人桌 9 个位置的翻牌前门槛都是有限数（不会 NaN）', allFinite, span.trim());
  ok('  → 且都落在 18%~92% 区间', allInRange);
  ok('POS_BASE / POS_NAME 覆盖全部 9 个位置',
     api.POS_ALL.every(p => api.POS_BASE[p] > 0 && !!api.POS_NAME[p]));
  ok('位置越早门槛越高（UTG > HJ > BTN）',
     api.POS_BASE.UTG > api.POS_BASE['HJ'] && api.POS_BASE['HJ'] > api.POS_BASE.BTN);
  ok('表里没有的位置走兜底值，也不会算出 NaN',
     Number.isFinite(api.judgePreflop(55, 6, 6, false, 'XYZ', 3, 0, 1, 0, 2).threshold));

  /* 每个示例的行动线里，位置都必须是这桌真实存在的座位 */
  const badActs = [];
  api.RV_DEMOS.forEach(function(d, k){
    const posSet = {};
    (d.seats || [{ pos:d.pos }, { pos:'BB' }]).forEach(s => { posSet[s.pos] = true; });
    (d.streets || []).forEach(function(st, i){
      (st.acts || []).forEach(function(a){
        if (!posSet[a.pos]) badActs.push(k + '#' + i + ':' + a.pos);
        if (api.ACT_TYPES.every(t => t.v !== a.type)) badActs.push(k + '#' + i + ':badType');
        if (!(a.amt >= 0)) badActs.push(k + '#' + i + ':badAmt');
      });
    });
  });
  ok('所有示例的动作位置与类型都合法', badActs.length === 0, badActs.join(' '));

  /* --- 15.85 全下（allin）动作类型 --- */
  ok('全下动作有文案（不带累计）', api.actText({ type:'allin', amt:80 }) === '全下 80',
     api.actText({ type:'allin', amt:80 }));
  ok('全下动作文案带累计（说到多少）', api.actText({ type:'allin', amt:80 }, 120) === '全下 120',
     api.actText({ type:'allin', amt:80 }, 120));
  ok('全下金额照常进底池（不因类型漏计）',
     (function(){
       var s = api.streetAgg([{ pos:'UTG', type:'allin', amt:100 }], 'BTN');
       /* UTG 全下 100：总额 = 100；「我」BTN 尚未出手，面对额与自身投入都是 0 */
       return s.total === 100 && s.facing === 0 && s.heroAmt === 0;
     })());
  ok('全下被判定引擎当成进攻动作（金额够大 = 加注）',
     (function(){
       var v = api.judgePreflop(65, 100, 100, false, 'BTN', 15, 0, 1, 0, 6);
       return v.tag === '最优' || v.tag === '合理';
     })(), 'tag=' + api.judgePreflop(65, 100, 100, false, 'BTN', 15, 0, 1, 0, 6).tag);
  ok('动作类型枚举里含 allin', api.ACT_TYPES.some(t => t.v === 'allin' && t.t === '全下'));


  ok('第 5 个示例是九人桌，且每条街都逐位记录了动作',
     api.RV_DEMOS[4] && api.RV_DEMOS[4].seats.length === 9 &&
     api.RV_DEMOS[4].streets.every(s => s.acts && s.acts.length),
     api.RV_DEMOS[4] ? api.RV_DEMOS[4].streets.map(s => s.acts.length).join('/') : 'missing');
  api.applyReview(api.RV_DEMOS[4]);
  ok('载入九人示例后，行动线 UI 与模型一致',
     api.rvStreetEls[0].rows.length === api.review.streets[0].acts.length &&
     api.rvStreetEls[0].rows.length === 11,
     api.rvStreetEls[0].rows.length + '');

  /* --- 15.8 结构与样式 --- */
  ok('动作行有独立样式', /\.rv-actrow\s*\{/.test(html));
  ok('累计标记有独立样式', /\.rv-cum\s*\{/.test(html));
  ok('「加一手」按钮有独立样式', /\.rv-addact\s*\{/.test(html));
  ok('旧的「对手本街投入」输入框已移除', html.indexOf('对手本街投入') < 0);
  ok('旧的 .rv-fold 样式已清理', !/\.rv-fold\s*\{/.test(html));
  ok('旧的 actionText 已删除', code.indexOf('function actionText') < 0);
  ok('牌桌提示写明了金额是「这一手新放进去的钱」',
     html.indexOf('这一手新放进去的钱') > 0);

  /* --- 15.9 本街底池实时累加（录一手立刻涨）+ 前注/盲注构成标注 --- */
  api.applyReview(api.RV_DEMOS[3]);           /* 六人桌 · 大盲 2 · 前注 0.5 */
  api.review.streets.forEach(s => { s.acts = []; s.opp = 0; s.me = 0; s.fold = false; });
  api.syncStreets();
  ok('空街时第一街「本街底池」= 起始底池（盲注 4 + 前注 3 = 7）',
     api.rvStreetEls[0].potEl.textContent === '7', api.rvStreetEls[0].potEl.textContent);
  ok('  → 并标注前注与盲注的构成',
     /含前注 3 \/ 盲注 4/.test(api.rvStreetEls[0].noteEl.textContent),
     api.rvStreetEls[0].noteEl.textContent);
  api.actAdd(0, 'UTG', 'raise', 6);
  ok('录一手「UTG 加注 6」后本街底池立刻变成 13（不是等到下一街）',
     api.rvStreetEls[0].potEl.textContent === '13', api.rvStreetEls[0].potEl.textContent);
  api.actAdd(0, 'BTN', 'call', 6);
  ok('再跟注 6 后立刻变成 19，且与台面中央底池一致',
     api.rvStreetEls[0].potEl.textContent === '19' &&
     byId['tblPot'].innerHTML.indexOf('19') > 0,
     api.rvStreetEls[0].potEl.textContent + ' / ' + byId['tblPot'].innerHTML);
}

console.log('\n' + '='.repeat(52));
console.log('  汇总：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('='.repeat(52));
process.exit(fail === 0 ? 0 : 1);



/* =========================================================
   德州扑克计算器 · 行动复盘模块自检
   直接抽取 HTML 里的 <script> 全文，用 DOM stub 在 node 中真实执行，
   再对判定逻辑、示例牌局、DOM 引用做校验。
   运行：node verify-review.js
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

/* ---------- 1. 提取脚本 ---------- */
head('[1] 提取并编译页面脚本');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m){ console.log('  \u2717 未找到 <script>'); process.exit(1); }
const code = m[1];
ok('已提取脚本', true, code.split('\n').length + ' 行');

/* ---------- 2. DOM stub ---------- */
function mkEl(tag){
  const set = new Set();
  return {
    tagName: tag || 'div',
    id: '', hidden: false, innerHTML: '', textContent: '', value: '',
    checked: false, disabled: false, className: '', dataset: {}, style: {},
    children: [],
    classList: {
      add: c => set.add(c),
      remove: c => set.delete(c),
      toggle: (c, f) => { if (f === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else { f ? set.add(c) : set.delete(c); } },
      contains: c => set.has(c)
    },
    addEventListener(){}, appendChild(c){ this.children.push(c); return c; },
    querySelector(){ return mkEl('div'); }, querySelectorAll(){ return []; },
    setAttribute(){}, scrollIntoView(){}, closest(){ return null; },
    parentNode: { classList: { add(){}, remove(){}, toggle(){} } }
  };
}
const byId = {};
global.document = {
  getElementById(id){ return byId[id] || (byId[id] = mkEl('div')); },
  querySelectorAll(){ return []; },
  createElement(t){ return mkEl(t); },
  addEventListener(){}
};
global.window = { scrollTo(){}, addEventListener(){}, resizeHandler: null };
global.requestAnimationFrame = fn => fn();
global.performance = require('perf_hooks').performance;

let api;
try {
  const wrapper = code +
    '\nreturn { runReview:runReview, judgePreflop:judgePreflop, judgePostflop:judgePostflop,' +
    ' equityVsRandom:equityVsRandom, equityAt:equityAt, evalHand:evalHand,' +
    ' calculate:calculate, cid:cid, applyReview:applyReview, RV_DEMOS:RV_DEMOS,' +
    ' gradeInfo:gradeInfo, boardPrefix:boardPrefix, review:review, RV_STREETS:RV_STREETS,' +
    ' playabilityBonus:playabilityBonus, POS_BASE:POS_BASE,' +
    ' renderReviewReport:renderReviewReport,' +
    ' actText:actText, heroActSummary:heroActSummary, streetAgg:streetAgg,' +
    ' legacyToActs:legacyToActs, streetLineText:streetLineText, actCumAfter:actCumAfter,' +
    ' streetPot:streetPot, actsOf:actsOf, rvStreetEls:rvStreetEls };';
  api = new Function('document', 'window', 'requestAnimationFrame', 'performance', wrapper)(
    global.document, global.window, global.requestAnimationFrame, global.performance
  );
  ok('脚本在 stub 环境中成功执行', true);
} catch (e){
  ok('脚本在 stub 环境中成功执行', false, e.message);
  console.log('\n汇总：' + pass + ' 通过 / ' + (fail + 1) + ' 失败');
  process.exit(1);
}

/* ---------- 3. 翻牌前判定 ---------- */
head('[2] 翻牌前判定');
{
  const a = api.judgePreflop(85.2, 3, 9, false, 'BTN', 1.5);
  ok('BTN 手持强牌(85%)主动加注 → 满分', a.score === 10 && a.tag === '最优',
     'score=' + a.score + ' tag=' + a.tag);

  const b = api.judgePreflop(42, 3, 3, false, 'UTG', 1.5);
  ok('UTG 用 42% 的牌跟注 3BB → 入池过松', b.tag === '入池过松',
     'score=' + b.score + ' 门槛=' + b.threshold.toFixed(0) + '%');

  const c = api.judgePreflop(85, 3, 0, true, 'BTN', 1.5);
  ok('BTN 拿着强牌(85%)弃牌 → 弃牌过早', c.tag === '弃牌过早', 'score=' + c.score);

  const d = api.judgePreflop(30, 3, 0, true, 'UTG', 1.5);
  ok('UTG 用弱牌(30%)弃牌 → 最优', d.score === 10 && d.tag === '最优', 'score=' + d.score);

  const e = api.judgePreflop(48, 30, 30, false, 'CO', 1.5);
  ok('CO 用边缘牌(48%)跟注 30BB 超大加注 → 入池过松', e.tag === '入池过松',
     '门槛=' + e.threshold.toFixed(0) + '%');
}

/* ---------- 3b. 可玩性加成 ---------- */
head('[2b] 同花 / 连牌的隐含赔率加成');
{
  const b87s = api.playabilityBonus(api.cid('8h'), api.cid('7h'));
  ok('87s（同花连牌）加成 4%', Math.abs(b87s - 0.04) < 1e-9, b87s * 100 + '%');

  const bAA  = api.playabilityBonus(api.cid('As'), api.cid('Ah'));
  ok('AA（非同花不连）加成 0%', bAA === 0, bAA * 100 + '%');

  const bT9o = api.playabilityBonus(api.cid('Th'), api.cid('9c'));
  ok('T9o（连牌非同花）加成 2%', Math.abs(bT9o - 0.02) < 1e-9, bT9o * 100 + '%');

  const bA2s = api.playabilityBonus(api.cid('As'), api.cid('2s'));
  ok('A2s（同花但间隔大）加成 2%', Math.abs(bA2s - 0.02) < 1e-9, bA2s * 100 + '%');

  /* 87s 在 BB 面对 3BB：加成后应判为合理入池 */
  const g = api.judgePreflop(47.8, 3, 3, false, 'BB', 1.5, b87s);
  ok('BB 用 87s 跟注 3BB → 判为合理（不再误判过松）', g.score >= 8,
     'tag=' + g.tag + ' 门槛=' + g.threshold.toFixed(0) + '%');
}

/* ---------- 4. 翻后判定 ---------- */
head('[3] 翻后判定（底池 100 / 对手下注 100 → 需要胜率 33.33%）');
{
  const q1 = api.judgePostflop(81, 100, 100, 100, false);
  ok('胜率 81% 只跟注 → 价值偏软', q1.tag === '价值偏软' && q1.need.toFixed(2) === '33.33',
     '需要=' + q1.need.toFixed(2) + '%');

  const q2 = api.judgePostflop(20, 100, 100, 100, false);
  ok('胜率 20% 跟注 → 跟注亏损', q2.tag === '跟注亏损', 'score=' + q2.score);

  const q3 = api.judgePostflop(40, 100, 100, 0, true);
  ok('胜率 40% 弃牌 → 弃牌过早', q3.tag === '弃牌过早', 'score=' + q3.score);

  const q4 = api.judgePostflop(20, 100, 100, 0, true);
  ok('胜率 20% 弃牌 → 最优', q4.score === 10 && q4.tag === '最优');

  const q5 = api.judgePostflop(90, 100, 0, 0, false);
  ok('领先 90% 双方过牌 → 错失价值', q5.tag === '错失价值');

  const q6 = api.judgePostflop(70, 100, 0, 50, false);
  ok('领先 70% 主动下注 → 最优', q6.score === 10 && q6.tag === '最优');

  const q7 = api.judgePostflop(75, 100, 100, 300, false);
  ok('胜率 75% 加注 → 最优（价值加注）', q7.score === 10 && q7.tag === '最优');

  const q8 = api.judgePostflop(15, 100, 100, 300, false);
  ok('胜率 15% 加注 → 过度激进', q8.tag === '过度激进', 'score=' + q8.score);

  /* 盈亏平衡点连续性：equity 恰好等于 need 时不应判为亏损 */
  const q9 = api.judgePostflop(33.34, 100, 100, 100, false);
  ok('胜率恰好等于盈亏平衡点 → 判跟注合理', q9.score >= 8, 'tag=' + q9.tag);
}

/* ---------- 5. 示例牌局整体跑通 ---------- */
head('[4] 内置示例的整体评分');
api.RV_DEMOS.forEach(function(d){
  const hero = [api.cid(d.hero[0]), api.cid(d.hero[1])];
  const vil = d.villain ? [api.cid(d.villain[0]), api.cid(d.villain[1])] : [];
  const bArr = (d.board || []).filter(Boolean).map(api.cid);
  api.applyReview(d);
  const rep = api.runReview(hero, vil, bArr, vil.length === 2, d.pos, d.stack, null, d.bb);
  console.log('  \u2192 ' + d.name + '  [' + d.pos + ' / ' + d.stack + 'BB]');
  rep.list.forEach(function(x){
    console.log('      ' + x.name.padEnd(4, '\u3000') +
      ' 胜率 ' + x.equity.toFixed(1).padStart(5) + '%' +
      '  建议 ' + x.verdict.ideal.padEnd(12, ' ') +
      '  实际 ' + x.act.me.padEnd(12, ' ') +
      '  【' + x.verdict.tag + '】 ' + x.verdict.score + '分');
  });
  console.log('      总分 ' + rep.total.toFixed(2) + ' / 10   等级 ' + api.gradeInfo(rep.total).g);
  ok('示例「' + d.name + '」产出有效评分', rep.list.length >= 2 && rep.total > 0 && rep.total <= 10,
     rep.list.length + ' 条街');
});

/* ---------- 5b. 报告渲染路径（防回归） ---------- */
head('[4b] 报告渲染路径');
api.RV_DEMOS.forEach(function(d, k){
  const hero = [api.cid(d.hero[0]), api.cid(d.hero[1])];
  const vil = d.villain ? [api.cid(d.villain[0]), api.cid(d.villain[1])] : [];
  const bArr = (d.board || []).filter(Boolean).map(api.cid);
  api.applyReview(d);
  const rep = api.runReview(hero, vil, bArr, vil.length === 2, d.pos, d.stack, null, d.bb);

  let err = null, out = '';
  try {
    api.renderReviewReport(rep);
    out = byId['rvReport'].innerHTML;
  } catch (e){ err = e.message; }

  ok('示例 ' + (k + 1) + ' 报告渲染无异常', !err, err || (out.length + ' chars'));
  if (err) return;

  ok('  含总评卡与评分环', out.includes('rv-summary') && out.includes('rv-score-num'));
  ok('  街道卡片数 = ' + rep.list.length,
     (out.match(/class="rv-card /g) || []).length === rep.list.length);
  ok('  含「建议动作 / 你的动作」对比',
     out.includes('建议动作') && out.includes('你的动作'));
  ok('  含依据说明', out.includes('rv-tips'));
  ok('  无 undefined / NaN 泄漏', !/undefined|NaN/.test(out));
});

/* 每个判定分支都必须带齐渲染所需的字段 */
head('[4c] 判定对象字段完整性');
{
  const probes = [];
  ['UTG','MP','CO','BTN','SB','BB'].forEach(function(p){
    [0, 2, 5, 10, 40].forEach(function(b){
      [true, false].forEach(function(f){
        [0, b, b * 3].forEach(function(m){
          probes.push(['pre', api.judgePreflop(50, b, m, f, p, 20, 0)]);
        });
      });
    });
  });
  [[100,100,100,false],[100,100,0,true],[100,0,0,false],[100,0,50,false],
   [100,0,0,true],[100,100,300,false],[100,100,300,true],[100,100,0,false]]
    .forEach(function(a){ probes.push(['post', api.judgePostflop(a[0], a[1], a[2], a[3], a[4])]); });

  const need = ['ideal','score','level','tag','short','text','threshold'];
  const bad = [];
  probes.forEach(function(p){
    need.forEach(function(k){
      if (p[1][k] === undefined || p[1][k] === null) bad.push(p[0] + '.' + k);
    });
    if (typeof p[1].text === 'string' && /undefined|NaN/.test(p[1].text)) bad.push(p[0] + '.text');
    if (typeof p[1].ideal === 'string' && /undefined|NaN/.test(p[1].ideal)) bad.push(p[0] + '.ideal');
  });
  ok(probes.length + ' 个判定分支字段齐全且无 undefined/NaN', bad.length === 0, bad.slice(0, 6).join(', '));
}

/* ---------- 6. 弃牌截断 ---------- */
head('[5] 弃牌后后续街道截断');
{
  const d = api.RV_DEMOS[1];
  const hero = [api.cid(d.hero[0]), api.cid(d.hero[1])];
  const vil = [api.cid(d.villain[0]), api.cid(d.villain[1])];
  const bArr = (d.board || []).filter(Boolean).map(api.cid);
  api.applyReview(d);
  const rep = api.runReview(hero, vil, bArr, true, d.pos, d.stack, null, d.bb);
  const last = rep.list[rep.list.length - 1];
  ok('转牌弃牌后不再分析河牌', rep.list.length === 3 && last.name === '转牌',
     '共 ' + rep.list.length + ' 条街，最后一条=' + last.name);
  ok('弃牌那条街被正确判定', last.verdict.tag === '最优', last.verdict.tag);
}

/* ---------- 7. 翻牌前强度基准合理性 ---------- */
head('[6] 翻牌前强度基准（对随机手牌）');
{
  const cases = [
    ['As', 'Ah', 80, 100, 'AA'],
    ['Ks', 'Kd', 70, 85, 'KK'],
    ['2c', '7d', 30, 45, '72o'],
    ['Ts', '9s', 45, 62, 'T9s']
  ];
  cases.forEach(function(c){
    const v = api.equityVsRandom(api.cid(c[0]), api.cid(c[1]), 40000);
    ok(c[4] + ' 的随机手牌胜率落在 ' + c[2] + '~' + c[3] + '%',
       v >= c[2] && v <= c[3], '实测 ' + v.toFixed(1) + '%');
  });
}

/* ---------- 8. DOM 引用完整性 ---------- */
head('[7] DOM 引用完整性');
{
  const ids = [...code.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(x => x[1]);
  const missing = [...new Set(ids)].filter(id => !html.includes('id="' + id + '"'));
  ok('getElementById 引用的 ' + new Set(ids).size + ' 个 id 全部存在',
     missing.length === 0, missing.join(', ') || '');

  const qs = [...code.matchAll(/querySelectorAll\(['"]([^'"]+)['"]\)/g)].map(x => x[1]);
  ok('querySelectorAll 引用：' + [...new Set(qs)].join(', '), true);

  const classes = [...code.matchAll(/querySelector\(['"]\.([\w-]+)['"]\)/g)].map(x => x[1]);
  const missCls = [...new Set(classes)].filter(c => !html.includes('class="' + c) && !code.includes("'" + c + "'") && !code.includes('"' + c + '"'));
  ok('querySelector 的 class 均在 HTML/JS 中出现', missCls.length === 0, missCls.join(', ') || '');
}

/* ---------- 8b. 样式一致性 ---------- */
head('[7b] 样式一致性（CSS ⟷ 渲染产物）');
{
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const cssClasses = new Set([...css.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map(x => x[1]));

  /* 报告里出现的每个 class 都要有样式定义（否则样式静默失效） */
  const d0 = api.RV_DEMOS[0];
  api.applyReview(d0);
  api.renderReviewReport(api.runReview(
    [api.cid(d0.hero[0]), api.cid(d0.hero[1])],
    [api.cid(d0.villain[0]), api.cid(d0.villain[1])],
    d0.board.map(api.cid), true, d0.pos, d0.stack, null, d0.bb));
  const rendered = byId['rvReport'].innerHTML;

  const used = new Set();
  [...rendered.matchAll(/class="([^"]*)"/g)].forEach(function(x){
    x[1].split(/\s+/).forEach(function(c){ if (c) used.add(c); });
  });
  const noCss = [...used].filter(c => !cssClasses.has(c));
  ok('报告渲染用到的 ' + used.size + ' 个 class 全部有 CSS 定义',
     noCss.length === 0, noCss.join(', ') || '');

  /* 反向：写了样式却没用到，属于死代码。
     注意必须在 <style> 之外找用法 —— 否则 CSS 里的定义自己就把名字匹配上了，
     这类检查会永远成立（空转）。 */
  const outside = html.replace(/<style>[\s\S]*?<\/style>/, '');
  const rvCss = [...cssClasses].filter(c => /^rv-/.test(c));
  const unused = rvCss.filter(c => outside.indexOf(c) < 0);
  ok('CSS 中定义的 ' + rvCss.length + ' 个 rv-* 类都在 <style> 之外被实际使用',
     unused.length === 0, unused.join(', ') || '');

  /* 结构配平 */
  const ob = (css.match(/\{/g) || []).length, cb = (css.match(/\}/g) || []).length;
  ok('CSS 花括号配平', ob === cb, ob + ' 开 / ' + cb + ' 闭');
  ok('CSS 无连续分号', !/;;/.test(css));
  ok('HTML 中 tab / 复盘关键容器齐全',
     ['tabs', 'tabCalc', 'tabReview', 'rvStreets', 'rvReport', 'rvPos', 'rvStack']
       .every(id => html.includes('id="' + id + '"') || html.includes('class="' + id + '"')));
}

/* ---------- 9. 结构完整性 ---------- */
head('[8] 页面结构');
{
  ok('存在 tab 切换按钮 × 2', (html.match(/class="tab[ "]/g) || []).length === 2);
  ok('存在 tabCalc / tabReview 两个面板',
     html.includes('id="tabCalc"') && html.includes('id="tabReview"'));
  ok('复盘面板默认隐藏', /id="tabReview"[^>]*hidden/.test(html));
  ok('复盘报告容器存在', html.includes('id="rvReport"'));
  ok('原计算器面板仍在 tabCalc 内',
     html.indexOf('id="tabCalc"') < html.indexOf('id="resultPanel"'));
}

/* ---------- 汇总 ---------- */
console.log('\n' + '='.repeat(52));
console.log('  自检完成：' + pass + ' 项通过，' + fail + ' 项失败');
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

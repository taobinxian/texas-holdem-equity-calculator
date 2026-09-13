/* =========================================================
   德州扑克计算器 · 多人界面自检
   用 DOM stub 渲染玩家列表 / 结果表，检查产物结构与 CSS 双向一致性。
   运行：node verify-ui.js
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

const m = html.match(/<script>([\s\S]*?)<\/script>/);
const code = m[1];

/* ---------- DOM stub ---------- */
function mkEl(tag){
  const set = new Set();
  const el = {
    tagName: tag || 'div', id: '', hidden: false, textContent: '', value: '',
    checked: false, disabled: false, className: '', dataset: {}, style: {},
    children: [], title: '', type: '',
    classList: {
      add: c => set.add(c), remove: c => set.delete(c),
      toggle: (c, f) => { if (f === undefined){ set.has(c) ? set.delete(c) : set.add(c); } else { f ? set.add(c) : set.delete(c); } },
      /* className 字符串赋值也要能被 contains 看到 */
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
  querySelectorAll(sel){ return []; },
  createElement(t){ return mkEl(t); },
  addEventListener(){}
};
global.window = { scrollTo(){}, addEventListener(){} };
global.requestAnimationFrame = fn => fn();
global.performance = require('perf_hooks').performance;

const api = new Function('document','window','requestAnimationFrame','performance',
  code + '\nreturn { cid:cid, state:state, renderAll:renderAll, renderResult:renderResult,' +
  ' calculate:calculate, setPlayerCount:setPlayerCount, applyDemo:applyDemo, DEMOS:DEMOS,' +
  ' POS_ALL:POS_ALL, POS_SETS:POS_SETS, MIN_PLAYERS:MIN_PLAYERS, MAX_PLAYERS:MAX_PLAYERS,' +
  ' willBeExact:willBeExact, handScore:handScore, rangePool:rangePool, estimateLayout:estimateLayout,' +
  ' seatKnown:seatKnown, boardPrefix:boardPrefix, review:review };')(
  global.document, global.window, global.requestAnimationFrame, global.performance);

const C = api.cid;
const SLOT = 'div';

/* ---------- 1. 玩家列表渲染 ---------- */
head('[1] 玩家列表渲染产物');
{
  api.setPlayerCount(2);
  const list = global.document.getElementById('playersList');
  ok('2 人时渲染 2 行', list.children.length === 2, String(list.children.length));

  const row0 = list.children[0];
  ok('第 1 行带 hero 标记', row0.classList.contains('hero'));
  ok('第 1 行有 4 个区块（标识 / 位置 / 卡槽 / 状态）', row0.children.length === 4,
     String(row0.children.length));
  ok('标识块含「你」', row0.children[0].innerHTML.indexOf('你') >= 0);
  ok('位置下拉 class = pl-pos', row0.children[1].className === 'pl-pos', row0.children[1].className);
  ok('位置下拉含 9 个位置选项', row0.children[1].children.length === 9,
     String(row0.children[1].children.length));
  ok('位置下拉已选中 BTN',
     row0.children[1].children.some(o => o.value === 'BTN' && o.selected));

  const slots = row0.children[2];
  ok('卡槽区 class = pl-slots', slots.className === 'pl-slots');
  ok('卡槽区有 2 个槽位', slots.children.length === 2, String(slots.children.length));
  ok('手牌槽带 pidx=0', slots.children[0].dataset.pidx === 0 || slots.children[0].dataset.pidx === '0');
  ok('手牌槽 scope=calc / group=seat',
     slots.children[0].dataset.scope === 'calc' && slots.children[0].dataset.group === 'seat');

  const row1 = list.children[1];
  ok('第 2 行标识为「对手 1」', row1.children[0].innerHTML.indexOf('对手 1') >= 0);
  ok('2 人时对手行不显示删除按钮', row1.children[3].children.length === 0);

  api.setPlayerCount(5);
  const list5 = global.document.getElementById('playersList');
  ok('扩到 5 人后渲染 5 行', list5.children.length === 5, String(list5.children.length));
  ok('5 人时对手行显示删除按钮', list5.children[1].children[3].children.length === 1);
  ok('5 人位置为标准分配 MP/CO/BTN/SB/BB',
     list5.children.map(r =>
       r.children[1].children.filter(o => o.selected).map(o => o.value)[0]
     ).join('/') === 'MP/CO/BTN/SB/BB',
     list5.children.map(r => r.children[1].children.filter(o => o.selected).map(o => o.value)[0]).join('/'));

  /* 未知手牌状态标记 */
  api.state.seats.forEach(s => { s.cards = [null, null]; });
  api.state.seats[0].cards = [C('As'), C('Ah')];
  api.renderAll();
  const list5b = global.document.getElementById('playersList');
  ok('已知手牌显示「已知」', list5b.children[0].children[3].innerHTML.indexOf('已知') >= 0
     && list5b.children[0].children[3].innerHTML.indexOf('未知') < 0);
  ok('未知手牌显示「未知」', list5b.children[1].children[3].innerHTML.indexOf('未知') >= 0);
  ok('已知手牌渲染出牌面（A♠）',
     list5b.children[0].children[2].children[0].innerHTML.indexOf('A') >= 0,
     list5b.children[0].children[2].children[0].innerHTML.replace(/<[^>]+>/g, ''));
  ok('未知手牌渲染为 + 占位',
     list5b.children[1].children[2].children[0].className.indexOf('empty') >= 0);
}

/* ---------- 2. 人数选择器 ---------- */
head('[2] 人数选择器');
{
  const pc = global.document.getElementById('playerCount');
  ok('人数选项 2~9 共 8 个', pc.children.length === 8, String(pc.children.length));
  ok('首项为 2 人', pc.children[0].value === '2');
  ok('末项为 9 人', pc.children[7].value === '9');
  ok('当前值同步为 5', pc.value === '5', pc.value);
  ok('常量 MIN/MAX 为 2 / 9', api.MIN_PLAYERS === 2 && api.MAX_PLAYERS === 9);
}

/* ---------- 3. 结果表渲染 ---------- */
head('[3] 各玩家胜率表渲染');
{
  const seats = [
    { pos:'BTN', cards:[C('As'), C('Ah')] },
    { pos:'SB',  cards:[C('Kd'), C('Kc')] },
    { pos:'BB',  cards:[null, null] }
  ];
  const res = api.calculate(seats, [], 100000, false);
  api.renderResult(res);
  const pb = global.document.getElementById('plBody');
  ok('结果表 3 行', pb.children.length === 3, String(pb.children.length));

  const r0 = pb.children[0].innerHTML;
  ok('第 1 行标记为「你」', r0.indexOf('<b>你</b>') >= 0);
  ok('第 1 行显示位置 BTN', r0.indexOf('BTN') >= 0);
  ok('第 1 行显示手牌 A♠ A♥', r0.indexOf('A\u2660') >= 0 && r0.indexOf('A\u2665') >= 0);
  ok('第 1 行带 hero-row 样式', pb.children[0].className === 'hero-row');
  ok('第 1 行显示份额百分比', /[\d.]+%/.test(r0));
  ok('第 1 行有份额进度条', r0.indexOf('eq-bar') >= 0);

  const r1 = pb.children[1].innerHTML;
  ok('第 2 行标记为「对手 1」', r1.indexOf('对手 1') >= 0);

  const r2 = pb.children[2].innerHTML;
  ok('第 3 行手牌显示为「未知」', r2.indexOf('未知') >= 0);
  ok('第 3 行牌力列显示占位符', r2.indexOf('>—<') >= 0 || r2.indexOf('\u2014') >= 0);

  /* 份额数值合计应为 100% */
  const nums = [...pb.children].map(tr => {
    const mm = tr.innerHTML.match(/([\d.]+)%<\/td>/);
    return mm ? parseFloat(mm[1]) : NaN;
  });
  const sum = nums.reduce((a, b) => a + b, 0);
  ok('结果表份额合计 ≈ 100%', Math.abs(sum - 100) < 0.05, sum.toFixed(3) + '%');

  /* 翻牌后应显示真实牌力描述 */
  const res2 = api.calculate([
    { pos:'BTN', cards:[C('As'), C('Ah')] },
    { pos:'BB',  cards:[C('Kd'), C('Kc')] }
  ], ['Ad','7h','2c'].map(C), 100000, false);
  api.renderResult(res2);
  const pb2 = global.document.getElementById('plBody');
  ok('翻牌后显示牌力描述（三条 A）', pb2.children[0].innerHTML.indexOf('三条 A') >= 0,
     pb2.children[0].innerHTML.replace(/<[^>]+>/g, ' ').slice(0, 60));
  ok('平局折算后的份额仍为 100%',
     Math.abs([...pb2.children].map(tr => {
       const mm = tr.innerHTML.match(/([\d.]+)%<\/td>/);
       return mm ? parseFloat(mm[1]) : NaN;
     }).reduce((a, b) => a + b, 0) - 100) < 0.05);
}

/* ---------- 4. 备注文案 ---------- */
head('[4] 结果备注文案');
{
  const hint = global.document.getElementById('plHint');
  api.state.seats = [
    { pos:'BTN', cards:[C('As'), C('Ah')] },
    { pos:'BB',  cards:[C('Kd'), C('Kc')] }
  ];
  api.state.board = [null,null,null,null,null];
  api.renderResult(api.calculate(api.state.seats, [], 100000, false));
  ok('2 人全已知时无备注', hint.innerHTML === '' && hint.hidden === true);

  api.state.seats = [
    { pos:'BTN', cards:[C('As'), C('Ah')] },
    { pos:'SB',  cards:[C('Kd'), C('Kc')] },
    { pos:'BB',  cards:[null, null] }
  ];
  api.renderResult(api.calculate(api.state.seats, [], 100000, false));
  ok('含未知手牌时提示未知家数', hint.innerHTML.indexOf('1 位') >= 0,
     hint.innerHTML.replace(/<[^>]+>/g, '').slice(0, 36));
  ok('多人时提示份额口径', hint.innerHTML.indexOf('1/k') >= 0);
  ok('备注可见', hint.hidden === false);

  global.document.getElementById('chkRange').checked = true;
  api.renderResult(api.calculate(api.state.seats, [], 100000, true));
  ok('开启范围模式后备注文案切换', hint.innerHTML.indexOf('位置范围') >= 0 || hint.innerHTML.indexOf('入池范围') >= 0,
     hint.innerHTML.replace(/<[^>]+>/g, '').slice(0, 40));
  global.document.getElementById('chkRange').checked = false;
}

/* ---------- 5. CSS 双向一致性 ---------- */
head('[5] CSS 与渲染产物双向一致性');
{
  /* 正向：渲染产物用到的 class 必须有样式 */
  const produced = ['pl-row', 'hero', 'pl-id', 'pl-pos', 'pl-slots', 'pl-meta', 'pl-state',
                    'pl-del', 'pl-range', 'pl-head', 'pl-count', 'pl-list', 'pl-table',
                    'hero-row', 'eq-bar', 'pc-cards', 'pc-unk', 'pl-hint'];
  const noStyle = produced.filter(c => !new RegExp('\\.' + c + '[\\s,{.:>]').test(html));
  ok('渲染产物 class 全部有样式', noStyle.length === 0, noStyle.join(', ') || produced.length + ' 个');

  /* 反向：CSS 里定义的 pl-* / pc-* 类必须被 JS 或 HTML 用到 */
  const defined = [...new Set([...html.matchAll(/^\s*\.((?:pl|pc)-[\w-]+|eq-bar)[\s,{.:>]/gm)]
    .map(x => x[1]))];
  const orphan = defined.filter(c =>
    !(code.indexOf(c) >= 0 || html.indexOf('class="' + c) >= 0));
  ok('CSS 无孤立的 pl-*/pc-* 样式', orphan.length === 0, orphan.join(', ') || defined.length + ' 个');

  /* 关键：媒体查询里的类都存在 */
  const mediaStart = html.indexOf('@media(max-width:560px){\n    .pl-row');
  ok('存在多人列表的窄屏适配', mediaStart > 0);
  ok('窄屏隐藏牌力列以保住核心四列',
     /max-width:560px\)\{[\s\S]*?table\.pl-table th:nth-child\(4\)/.test(html));

  /* 花括号配平 */
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const open = (css.match(/\{/g) || []).length, close = (css.match(/\}/g) || []).length;
  ok('CSS 花括号配平', open === close, open + ' 开 / ' + close + ' 闭');
  ok('CSS 无连续分号', css.indexOf(';;') < 0);
}

/* ---------- 6. HTML 结构 ---------- */
head('[6] HTML 结构');
{
  ok('玩家列表容器在 felt 内',
     /<div class="felt">[\s\S]*?id="playersList"/.test(html));
  ok('人数选择器在玩家区顶部',
     html.indexOf('id="playerCount"') < html.indexOf('id="playersList"'));
  ok('范围开关位于玩家列表之后', html.indexOf('id="chkRange"') > html.indexOf('id="playersList"'));
  ok('公共牌区仍在 felt 内',
     /id="playersList"[\s\S]*?id="slotsBoard"[\s\S]*?<\/div>\s*<\/div>/.test(html));
  ok('结果区含各玩家胜率表', /id="plBody"/.test(html) && /各玩家胜率/.test(html));
  ok('分阶段表头改为「其他人胜」', html.indexOf('其他人胜') > 0);
  ok('分阶段表已移除「对手胜」单挑措辞',
     html.indexOf('<th>对手胜</th>') < 0);
  ok('操作区保留清空 / 示例 / 计算三个按钮',
     html.indexOf('id="btnClear"') > 0 && html.indexOf('id="btnDemo"') > 0 && html.indexOf('id="btnCalc"') > 0);
  ok('复盘 Tab 结构未被改动',
     html.indexOf('id="rvSlotsHero"') > 0 && html.indexOf('id="rvAnalyze"') > 0);
}

console.log('\n汇总：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);

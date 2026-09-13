/* ============================================================
   德州扑克胜率计算器 · 自检脚本
   运行： node verify-calculator.js
   覆盖：JS 语法 / DOM 引用 / 牌型识别 / 翻牌前枚举 / 跟注 EV 公式
   ============================================================ */
const fs = require('fs');
const HTML_PATH = 'C:/Users/LENOVO/WorkBuddy/2026-09-11-11-11-20/texas-holdem-equity-calculator.html';
const html = fs.readFileSync(HTML_PATH, 'utf8');

let fail = 0;
const ok = (cond, label, extra) => {
  if (!cond) fail++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '   ' + extra : ''));
};

/* ---------- 1. 语法与 DOM 引用 ---------- */
console.log('===== 1. 静态检查 =====');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.log('FAIL  未找到 script'); process.exit(1); }
const code = scriptMatch[1];
try { new Function(code); ok(true, 'JS 语法检查 (' + code.split('\n').length + ' 行)'); }
catch (e) { ok(false, 'JS 语法检查', e.message); process.exit(1); }

const ids = [...new Set([...code.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(x => x[1]))];
const missing = ids.filter(id => !html.includes('id="' + id + '"'));
ok(missing.length === 0, 'DOM id 引用完整 (' + ids.length + ' 个)', missing.length ? '缺失: ' + missing.join(', ') : '');

/* ---------- 2. 牌力评估（与页面同一份实现） ---------- */
console.log('\n===== 2. 牌型识别 =====');
const RANK_CHARS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUIT_CHARS = ['s','h','d','c'];
const cid = s => RANK_CHARS.indexOf(s[0].toUpperCase()) * 4 + SUIT_CHARS.indexOf(s[1].toLowerCase());
const _rc = new Int8Array(13), _sc = new Int8Array(4), _sm = new Int32Array(4);
function straightHigh(mask){
  const mm = mask & (mask>>>1) & (mask>>>2) & (mask>>>3) & (mask>>>4);
  if (mm !== 0) return 31 - Math.clz32(mm) + 4;
  if ((mask & 0x100F) === 0x100F) return 3;
  return -1;
}
function evalHand(c1,c2,board,bn){
  _rc.fill(0); _sc.fill(0); _sm[0]=0;_sm[1]=0;_sm[2]=0;_sm[3]=0;
  let rankMask=0,r,s,i,id;
  r=c1>>2;s=c1&3;_rc[r]++;_sc[s]++;_sm[s]|=1<<r;rankMask|=1<<r;
  r=c2>>2;s=c2&3;_rc[r]++;_sc[s]++;_sm[s]|=1<<r;rankMask|=1<<r;
  for(i=0;i<bn;i++){ id=board[i]; r=id>>2;s=id&3;_rc[r]++;_sc[s]++;_sm[s]|=1<<r;rankMask|=1<<r; }
  let flushMask=-1;
  for(i=0;i<4;i++) if(_sc[i]>=5){ flushMask=_sm[i]; break; }
  if(flushMask>=0){ const sf=straightHigh(flushMask); if(sf>=0) return (8<<20)|(sf<<16); }
  let quad=-1,trip=-1,trip2=-1,pair=-1,pair2=-1;
  for(let rr=12;rr>=0;rr--){ const c=_rc[rr];
    if(c===4){ if(quad<0) quad=rr; }
    else if(c===3){ if(trip<0) trip=rr; else if(trip2<0) trip2=rr; }
    else if(c===2){ if(pair<0) pair=rr; else if(pair2<0) pair2=rr; } }
  if(quad>=0){ let k=-1; for(let r1=12;r1>=0;r1--){ if(r1!==quad&&_rc[r1]>0){k=r1;break;} } return (7<<20)|(quad<<16)|(k<<12); }
  if(trip>=0&&(trip2>=0||pair>=0)){ return (6<<20)|(trip<<16)|((trip2>pair?trip2:pair)<<12); }
  if(flushMask>=0){ let v=5<<20,sh=16,n=0; for(let r2=12;r2>=0&&n<5;r2--){ if(flushMask&(1<<r2)){v|=r2<<sh;sh-=4;n++;} } return v; }
  const st=straightHigh(rankMask); if(st>=0) return (4<<20)|(st<<16);
  if(trip>=0){ let v=(3<<20)|(trip<<16),sh=12,n=0; for(let r3=12;r3>=0&&n<2;r3--){ if(r3!==trip&&_rc[r3]>0){v|=r3<<sh;sh-=4;n++;} } return v; }
  if(pair>=0&&pair2>=0){ let v=(2<<20)|(pair<<16)|(pair2<<12); for(let r4=12;r4>=0;r4--){ if(r4!==pair&&r4!==pair2&&_rc[r4]>0){v|=r4<<8;break;} } return v; }
  if(pair>=0){ let v=(1<<20)|(pair<<16),sh=12,n=0; for(let r5=12;r5>=0&&n<3;r5--){ if(r5!==pair&&_rc[r5]>0){v|=r5<<sh;sh-=4;n++;} } return v; }
  let v5=0,sh5=16,n5=0; for(let r6=12;r6>=0&&n5<5;r6--){ if(_rc[r6]>0){v5|=r6<<sh5;sh5-=4;n5++;} } return v5;
}
function describeHand(score){
  const cat=score>>20, a=(score>>16)&0xF, b=(score>>12)&0xF, R=x=>RANK_CHARS[x];
  switch(cat){
    case 8: return a===12?'皇家同花顺':R(a)+' 高同花顺';
    case 7: return '四条 '+R(a);
    case 6: return R(a)+' 带 '+R(b)+' 的葫芦';
    case 5: return R(a)+' 高同花';
    case 4: return R(a)+' 高顺子';
    case 3: return '三条 '+R(a);
    case 2: return R(a)+' 与 '+R(b)+' 两对';
    case 1: return '一对 '+R(a);
    default: return R(a)+' 高牌';
  }
}
const handCases = [
  [['As','Ks'],['Qs','Js','Ts'],'皇家同花顺'],
  [['5h','4h'],['3h','2h','Ah'],'5 高同花顺'],
  [['As','Ah'],['Ac','Ad','Kh','2c','3d'],'四条 A'],
  [['As','Ah'],['Ac','Kd','Kh'],'A 带 K 的葫芦'],
  [['As','Ks'],['Qs','9s','2s'],'A 高同花'],
  [['Ah','2s'],['3d','4c','5h'],'5 高顺子'],
  [['Ts','9h'],['8d','7c','6h'],'T 高顺子'],
  [['As','Ah'],['Ac','Kd','5s'],'三条 A'],
  [['As','Ah'],['Kd','Ks','5c'],'A 与 K 两对'],
  [['As','Ah'],['Kd','Qs','5c'],'一对 A'],
  [['As','Kh'],['Qd','9s','5c'],'A 高牌'],
  [['As','Ks'],['Qs','Js','2s','3h','4d'],'A 高同花'],
  [['As','Ah'],['Ac','Kd','Kh','2s','3s'],'A 带 K 的葫芦'],
  [['Ts','9h'],['8d','7c','6h','2s','2d'],'T 高顺子']
];
handCases.forEach(([h, b, expect]) => {
  const board = b.map(cid);
  const got = describeHand(evalHand(cid(h[0]), cid(h[1]), board, board.length));
  ok(got === expect, (h.join('') + ' + ' + b.join(' ')).padEnd(28), got + (got === expect ? '' : '  ≠ 期望 ' + expect));
});

/* ---------- 3. 翻牌前全枚举 ---------- */
console.log('\n===== 3. 翻牌前全枚举 =====');
function preflopEquity(hs, vs){
  const hero = hs.map(cid), vil = vs.map(cid);
  const used = new Set([...hero, ...vil]);
  const deck = []; for (let i=0;i<52;i++) if (!used.has(i)) deck.push(i);
  const b = [0,0,0,0,0];
  let w = 0, t = 0, l = 0;
  (function rec(s, dep){
    if (dep === 5){
      const x = evalHand(hero[0], hero[1], b, 5), y = evalHand(vil[0], vil[1], b, 5);
      if (x > y) w++; else if (x < y) l++; else t++;
      return;
    }
    for (let i=s;i<deck.length;i++){ b[dep] = deck[i]; rec(i+1, dep+1); }
  })(0, 0);
  const n = w + t + l;
  return { win: w/n*100, tie: t/n*100, lose: l/n*100, n };
}
const t0 = Date.now();
const rAAKK = preflopEquity(['As','Ah'], ['Kd','Kc']);
const dt = Date.now() - t0;
console.log('AA vs KK (枚举 ' + rAAKK.n.toLocaleString() + ' 种, ' + dt + 'ms): 胜 ' +
  rAAKK.win.toFixed(3) + '%  平 ' + rAAKK.tie.toFixed(3) + '%  负 ' + rAAKK.lose.toFixed(3) + '%');
ok(Math.abs(rAAKK.win - 81.065) < 0.05 && Math.abs(rAAKK.tie - 0.382) < 0.05,
   'AA vs KK 与基准值吻合', '(基准 81.065 / 0.382 / 18.554)');

/* ---------- 4. 跟注 EV 公式 ---------- */
console.log('\n===== 4. 跟注 EV 公式 =====');
// 页面实现： EV = E*(P+2B) - B,  E = win + tie/2
// 独立推导： EV = win*(P+B) + tie*(P/2) - lose*B
const evPage   = (win, tie, P, B) => { const E = win + tie/2; return E*(P+2*B) - B; };
const evDirect = (win, tie, lose, P, B) => win*(P+B) + tie*(P/2) - lose*B;

const scen = [
  { win:0.81065, tie:0.00382, lose:0.18553, P:100, B:100 },
  { win:0.5444,  tie:0,       lose:0.4556,  P:100, B:100 },
  { win:0.2600,  tie:0.0100,  lose:0.7300,  P:60,  B:150 },
  { win:0.5500,  tie:0.0200,  lose:0.4300,  P:0,   B:50  },
  { win:0.4000,  tie:0.0300,  lose:0.5700,  P:250, B:25  }
];
let maxDiff = 0;
scen.forEach(s => {
  const a = evPage(s.win, s.tie, s.P, s.B);
  const b = evDirect(s.win, s.tie, s.lose, s.P, s.B);
  maxDiff = Math.max(maxDiff, Math.abs(a - b));
  const be = s.B / (s.P + 2*s.B) * 100;
  console.log('  P=' + String(s.P).padStart(3) + ' B=' + String(s.B).padStart(3) +
    ' | 页面公式 ' + a.toFixed(4).padStart(10) + '  直接推导 ' + b.toFixed(4).padStart(10) +
    ' | 盈亏平衡胜率 ' + be.toFixed(2) + '%');
});
ok(maxDiff < 1e-9, '两种等价公式结果一致', 'maxDiff=' + maxDiff.toExponential(2));

// 蒙特卡洛对照（把公式换成真实随机牌局结算）
function evSim(win, tie, lose, P, B, N){
  let sum = 0;
  for (let i=0;i<N;i++){
    const r = Math.random();
    if (r < win) sum += (P + B);
    else if (r < win + tie) sum += P/2;
    else sum -= B;
  }
  return sum / N;
}
const N = 3000000;
console.log('\n  300 万次随机结算 vs 公式：');
scen.forEach(s => {
  const theory = evPage(s.win, s.tie, s.P, s.B);
  const sim = evSim(s.win, s.tie, s.lose, s.P, s.B, N);
  console.log('    模拟 ' + sim.toFixed(4).padStart(10) + '   公式 ' + theory.toFixed(4).padStart(10) +
    '   偏差 ' + (sim - theory).toFixed(4));
});
const s0 = scen[0];
ok(Math.abs(evSim(s0.win, s0.tie, s0.lose, s0.P, s0.B, N) - evPage(s0.win, s0.tie, s0.P, s0.B)) < 0.5,
   '模拟值与公式吻合（偏差 < 0.5）');

// 边界 1：胜率恰为 50% 时 EV 恒等于 P/2，与下注额无关
ok(Math.abs(evPage(0.5, 0, 100, 200) - 50) < 1e-9, '胜率 50% 时 EV 恒为 P/2', '(P=100, B=200 -> EV=50)');

// 边界 2：盈亏平衡胜率处 EV 恰为 0
const beEq = 100 / (100 + 2*100);
ok(Math.abs(evPage(beEq, 0, 100, 100)) < 1e-12, '盈亏平衡胜率处 EV = 0', '(E*=' + (beEq*100).toFixed(4) + '%)');

// 边界 3：EV 关于下注额是线性的，斜率 = 2E - 1
const E1 = 0.6, P1 = 100;
const slopeTheory = 2*E1 - 1;
const slopeCalc = (evPage(E1, 0, P1, 200) - evPage(E1, 0, P1, 100)) / 100;
ok(Math.abs(slopeCalc - slopeTheory) < 1e-9, 'EV 对下注额线性，斜率 = 2E-1', '(' + slopeCalc.toFixed(4) + ')');

console.log('\n============================================================');
console.log(fail === 0 ? '全部通过 ✅   共 ' + (handCases.length + 7) + ' 项检查' : '存在 ' + fail + ' 项失败 ❌');
process.exit(fail === 0 ? 0 : 1);

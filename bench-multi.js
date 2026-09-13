/* 多人场景性能实测 */
"use strict";
const fs = require('fs');
const code = fs.readFileSync('C:/Users/LENOVO/WorkBuddy/2026-09-11-11-11-20/texas-holdem-equity-calculator.html', 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1];

function mkEl(){
  const set = new Set(); const el = {
    hidden:false, innerHTML:'', textContent:'', value:'', checked:false, disabled:false,
    className:'', dataset:{}, style:{}, children:[], title:'', id:'',
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, appendChild(c){ this.children.push(c); return c; },
    querySelector(){ return mkEl(); }, querySelectorAll(){ return []; },
    setAttribute(){}, scrollIntoView(){}, closest(){ return null; },
    parentNode:{ classList:{ add(){}, remove(){}, toggle(){} } } };
  let inner='';
  Object.defineProperty(el,'innerHTML',{ get(){return inner;}, set(v){ inner=v; if(v==='') el.children.length=0; } });
  return el;
}
const byId = {};
global.document = { getElementById(id){ return byId[id] || (byId[id] = mkEl()); },
  querySelectorAll(){ return []; }, createElement(){ return mkEl(); }, addEventListener(){} };
global.window = { scrollTo(){} };
global.requestAnimationFrame = fn => fn();
global.performance = require('perf_hooks').performance;

const api = new Function('document','window','requestAnimationFrame','performance',
  code + '\nreturn { calculate:calculate, cid:cid, willBeExact:willBeExact, estimateLayout:estimateLayout,' +
  ' state:state, comb:comb };')(global.document, global.window, global.requestAnimationFrame, global.performance);

const C = api.cid;
const S = (pos, a, b) => ({ pos: pos, cards: (a && b) ? [C(a), C(b)] : [null, null] });

const cases = [
  { name: '2 人 · 翻牌前 · 全已知',    seats: [S('BTN','As','Ah'), S('BB','Kd','Kc')], board: [], range: false },
  { name: '3 人 · 翻牌前 · 全已知',    seats: [S('BTN','As','Ah'), S('SB','Kd','Kc'), S('BB','Qh','Qd')], board: [], range: false },
  { name: '5 人 · 翻牌前 · 全已知',    seats: [S('MP','As','Ah'), S('CO','Kd','Kc'), S('BTN','Qh','Qd'), S('SB','Jh','Jd'), S('BB','Th','Td')], board: [], range: false },
  { name: '9 人 · 翻牌前 · 全已知',    seats: [S('UTG','As','Ah'), S('UTG+1','Ks','Kc'), S('UTG+2','Qs','Qc'), S('MP','Js','Jc'),
                                                  S('HJ','Ts','Tc'), S('CO','9s','9c'), S('BTN','8s','8c'), S('SB','7s','7c'), S('BB','6s','6c')], board: [], range: false },
  { name: '6 人 · 翻牌前 · 5 家未知',  seats: [S('UTG','Ah','Ad'), S('MP'), S('CO'), S('BTN'), S('SB'), S('BB')], board: [], range: false },
  { name: '6 人 · 翻牌前 · 5 家未知+范围', seats: [S('UTG','Ah','Ad'), S('MP'), S('CO'), S('BTN'), S('SB'), S('BB')], board: [], range: true },
  { name: '4 人 · 翻牌 · 2 家未知',    seats: [S('CO','As','Ks'), S('BTN'), S('SB'), S('BB','7h','7d')], board: ['Js','8s','2c'], range: false },
  { name: '9 人 · 翻牌 · 全已知',      seats: [S('UTG','As','Ah'), S('UTG+1','Ks','Kc'), S('UTG+2','Qs','Qc'), S('MP','Js','Jc'),
                                                  S('HJ','Ts','Tc'), S('CO','9s','9c'), S('BTN','8s','8c'), S('SB','7s','7c'), S('BB','6s','6c')],
    board: ['2d','5h','9d'], range: false },
  { name: '9 人 · 翻牌 · 8 家未知',    seats: [S('UTG','Ah','Ad'), S('UTG+1'), S('UTG+2'), S('MP'), S('HJ'), S('CO'), S('BTN'), S('SB'), S('BB')],
    board: ['2d','5h','9d'], range: true }
];

console.log('场景'.padEnd(40) + '方式'.padEnd(34) + '耗时');
console.log('-'.repeat(90));
let worst = 0, worstName = '';
cases.forEach(c => {
  const board = c.board.map(C);
  api.state.seats = c.seats;
  api.state.board = board.concat([null,null,null,null,null]).slice(0,5);
  const layout = api.estimateLayout(c.seats, board);

  const t0 = performance.now();
  const res = api.calculate(c.seats, board, 200000, c.range);
  const dt = performance.now() - t0;

  if (dt > worst){ worst = dt; worstName = c.name; }
  console.log(c.name.padEnd(38) + res.method.padEnd(32) + (dt / 1000).toFixed(2) + ' 秒');
});
console.log('-'.repeat(90));
console.log('最慢：' + worstName + '  ' + (worst / 1000).toFixed(2) + ' 秒');

/* =========================================================
   德州扑克计算器 · 一键自检
   依次运行五套验证脚本并汇总结果。
   用法：node verify-all.js
   ========================================================= */
"use strict";
const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = [
  { file: 'verify-calculator.js', desc: '基础：牌型识别 / 翻牌前枚举 / 跟注 EV 公式' },
  { file: 'verify-multi.js',      desc: '多人底池：份额口径 / 交叉验证 / 位置范围 / 路径选择' },
  { file: 'verify-ui.js',         desc: '界面：玩家列表 / 结果表 / CSS 双向一致性' },
  { file: 'verify-review.js',     desc: '复盘：逐街判定 / 报告渲染 / 示例牌局' },
  { file: 'verify-table.js',      desc: '牌桌：布点 / 人数切换 / 前注 / 未知标记 / 逐手行动线 / 多人份额' }
];

let allPass = 0, allFail = 0, failed = [];

SUITES.forEach(s => {
  const p = path.join(__dirname, s.file);
  let out = '';
  try {
    out = execFileSync(process.execPath, [p], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e){
    out = (e.stdout || '') + (e.stderr || '');
  }
  /* 各套脚本的汇总格式不同，逐个匹配后再兜底统计 ✓ / ✗ */
  let m, passed = 0, fails = 0;
  if ((m = out.match(/汇总：\s*(\d+)\s*通过\s*\/\s*(\d+)\s*失败/))){
    passed = +m[1]; fails = +m[2];
  } else if ((m = out.match(/自检完成：\s*(\d+)\s*项通过，\s*(\d+)\s*项失败/))){
    passed = +m[1]; fails = +m[2];
  } else if ((m = out.match(/共\s*(\d+)\s*项检查/))){
    passed = +m[1]; fails = /失败/.test(out) && !/全部通过/.test(out) ? 1 : 0;
  } else {
    passed = (out.match(/\u2713/g) || []).length;
    fails  = (out.match(/\u2717/g) || []).length;
  }
  const okAll = fails === 0;

  allPass += passed;
  allFail += fails;
  if (!okAll) failed.push(s.file);

  console.log((okAll ? '  \u2713 ' : '  \u2717 ') + s.file.padEnd(22) +
              String(passed).padStart(3) + ' 项通过' +
              (fails ? '  ' + fails + ' 项失败' : '') + '   ' + s.desc);
});

console.log('\n' + '-'.repeat(78));
if (allFail === 0){
  console.log('  全部通过：' + allPass + ' 项检查，0 项失败');
} else {
  console.log('  ' + allPass + ' 项通过，' + allFail + ' 项失败  —— 失败脚本：' + failed.join(', '));
}
process.exit(allFail === 0 ? 0 : 1);

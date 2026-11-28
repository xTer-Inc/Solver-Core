/**
 * Solver Core v3.4.1 — Background Service Worker
 * Đăng ký DeclarativeNetRequest rules để chặn các endpoint giám sát thi.
 */
importScripts('ai_bridge.js');

const LOG = '[Solver:bg]';
const BLOCK_PATTERNS = [
  '*://*/api/*proctor*',
  '*://*/api/*anticheat*',
  '*://*/api/*anti-cheat*',
  '*://*/log*tab*',
  '*://*/track*visibility*',
  '*://lms.dut.udn.vn/mod/quiz/*monitor*',
  '*://lms.dut.udn.vn/lib/ajax/*log*',
  '*://daotao.des.udn.vn/mod/quiz/*monitor*',
  '*://daotao.des.udn.vn/lib/ajax/*log*'
];

const rules = BLOCK_PATTERNS.map(function (p, i) {
  return {
    id: i + 1,
    priority: 1,
    action: { type: 'block' },
    condition: { urlFilter: p, resourceTypes: ['xmlhttprequest', 'ping', 'other'] }
  };
});

chrome.runtime.onInstalled.addListener(function () {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: rules.map(r => r.id),
    addRules: rules
  }, function () {
    if (chrome.runtime.lastError) {
      console.warn(LOG, 'DNR rules error:', chrome.runtime.lastError.message);
    } else {
      console.info(LOG, 'DNR rules installed:', rules.length);
    }
  });
});

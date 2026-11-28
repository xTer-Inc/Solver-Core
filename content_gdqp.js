/**
 * Solver Core v3.4.1 — GDQP GitHub Pages
 * Xử lý web tĩnh bun04.github.io/GDQP-DHDN — chọn 1 đáp án hiển thị mỗi lần.
 */
(function () {
  'use strict';
  const LOG = '[Solver:gdqp]';

  function isDisabled(host, cb) {
    chrome.storage.sync.get(['disabledDomains'], function (cfg) {
      cb((cfg.disabledDomains || []).indexOf(host) !== -1);
    });
  }

  async function getDelays() {
    const cfg = await chrome.storage.sync.get(['delays']);
    return {
      answer: cfg.delays ? cfg.delays.answer : 15000,
      next: cfg.delays ? cfg.delays.next : 60000
    };
  }

  function isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    return el.offsetParent !== null || el.getClientRects().length > 0;
  }

  function findRoots() {
    const roots = new Set();
    document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(inp => {
      let p = inp.parentElement;
      let depth = 0;
      while (p && depth < 6) {
        if (p.querySelectorAll('input[type="radio"], input[type="checkbox"]').length >= 2) {
          roots.add(p);
          break;
        }
        p = p.parentElement;
        depth++;
      }
    });
    if (roots.size === 0) {
      document.querySelectorAll('section, .card, .question, .quiz, main, article').forEach(el => {
        if (el.querySelector('input, .answer, .choice, .option')) roots.add(el);
      });
    }
    return Array.from(roots);
  }

  function extractQuestion(root) {
    const textCands = root.querySelectorAll(
      '.question-text, .question-title, .qtext, h2, h3, h4, p, [class*="question"]'
    );
    let qText = '';
    for (const el of textCands) {
      const t = (el.innerText || el.textContent || '').trim();
      if (t.length >= 4 && t.length < 2000) { qText = t; break; }
    }
    if (!qText) {
      const clone = root.cloneNode(true);
      clone.querySelectorAll('input, button, ul, ol').forEach(n => n.remove());
      qText = (clone.innerText || '').trim();
    }
    if (!qText) return null;

    const choices = [];
    root.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(inp => {
      const holder = inp.closest('label') || inp.closest('li, .answer, .choice, .option') || inp.parentElement;
      const text = (holder?.innerText || '').trim();
      if (text) choices.push({ input: inp, el: holder, text });
    });
    if (choices.length < 2) return null;

    const isMulti = root.querySelectorAll('input[type="checkbox"]').length >= 2
      || /chọn\s*(nhiều|tất cả)|multiple|select all/i.test(qText);
    return { root, qText, choices, isMulti };
  }

  function selectChoice(choice) {
    if (choice.input) {
      choice.input.click();
      choice.input.checked = true;
      choice.input.dispatchEvent(new Event('input', { bubbles: true }));
      choice.input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (choice.el) {
      choice.el.click();
    }
  }

  function findNext() {
    const patterns = [/tiếp\s*theo/i, /câu\s*tiếp/i, /next/i, /sau/i, /continue/i, /kết\s*thúc/i, /hoàn\s*thành/i, /submit/i, /nộp/i];
    for (const b of document.querySelectorAll('button, a, [role="button"]')) {
      if (b.disabled || !isVisible(b)) continue;
      const t = (b.innerText || b.textContent || '').trim();
      if (t && patterns.some(re => re.test(t))) return b;
    }
    return null;
  }

  let lastSig = '';
  let busy = false;

  async function solveOnce() {
    if (busy) return;
    busy = true;
    try {
      const { answer, next } = await getDelays();
      const roots = findRoots();
      for (const root of roots) {
        if (!isVisible(root)) continue;
        const q = extractQuestion(root);
        if (!q) continue;

        const sig = q.qText + '|' + q.choices.map(c => c.text).join('|');
        if (sig === lastSig) continue;

        let indices;
        try {
          indices = await AIProviders.ask(q.qText, q.choices.map(c => c.text), q.isMulti);
        } catch (e) {
          console.error(LOG, 'AI error:', e.message);
          continue;
        }
        if (!indices || indices.length === 0) continue;

        indices.forEach(idx => {
          if (q.choices[idx]) selectChoice(q.choices[idx]);
        });

        lastSig = sig;
        await new Promise(r => setTimeout(r, answer));

        const unanswered = Array.from(root.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
          .filter(i => !i.checked);
        if (unanswered.length > 0) continue;

        const btn = findNext();
        if (btn) {
          await new Promise(r => setTimeout(r, next));
          if (findNext() === btn) {
            btn.click();
            btn.dispatchEvent(new Event('click', { bubbles: true }));
          }
        }
      }
    } finally {
      busy = false;
    }
  }

  isDisabled(location.hostname, function (disabled) {
    if (disabled) { console.info(LOG, 'disabled on', location.hostname); return; }
    new MutationObserver(solveOnce).observe(document.documentElement || document.body, {
      childList: true, subtree: true
    });
    setTimeout(solveOnce, 1500);
    setTimeout(solveOnce, 3500);
    setInterval(solveOnce, 4000);
  });
})();

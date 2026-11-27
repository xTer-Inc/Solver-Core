(function () {
  'use strict';

  // ---- Domain whitelist/blacklist check ----
  chrome.storage.sync.get(['disabledDomains'], function (cfg) {
    var list = cfg.disabledDomains || [];
    var host = location.hostname;
    if (list.indexOf(host) !== -1) {
      console.log('[Solver] Disabled on', host);
      return;
    }
    startSolver();
  });

  function startSolver() {
    function visible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return el.offsetParent !== null || el.getClientRects().length > 0;
    }

    function getQuestionText(root) {
      const cands = root.querySelectorAll(
        '.question-text, .question-title, .qtext, h2, h3, h4, p, [class*="question"]'
      );
      for (const el of cands) {
        const t = (el.innerText || el.textContent || '').trim();
        if (t && t.length >= 4 && t.length < 2000) return t;
      }
      const clone = root.cloneNode(true);
      clone.querySelectorAll('input, button, .answers, .choices, ul, ol').forEach(n => n.remove());
      return (clone.innerText || '').trim();
    }

    function getChoiceElements(root) {
      const inputs = Array.from(root.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
      if (inputs.length) {
        return inputs.map(inp => {
          const label = inp.closest('label') || (inp.id ? root.querySelector('label[for="' + CSS.escape(inp.id) + '"]') : null);
          const holder = label || inp.closest('li, .answer, .choice, .option, [class*="answer"], [class*="choice"]') || inp.parentElement;
          const text = (holder && (holder.innerText || holder.textContent) || '').trim();
          return { input: inp, el: holder, text };
        });
      }
      const opts = root.querySelectorAll(
        '.answer, .choice, .option, .answer-item, .choice-item, li, [class*="answer"], [class*="choice"], [class*="option"]'
      );
      const out = [];
      opts.forEach(el => {
        if (!visible(el)) return;
        const t = (el.innerText || el.textContent || '').trim();
        if (!t || t.length > 500) return;
        if (el.querySelector('.answer, .choice, .option, li')) return;
        out.push({ input: null, el, text: t });
      });
      const seen = new Set();
      return out.filter(c => {
        const k = c.text.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    function getQuestionRoots() {
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

    function getCurrentQuestion() {
      const roots = getQuestionRoots();
      for (const root of roots) {
        if (!visible(root)) continue;
        const qText = getQuestionText(root);
        if (!qText) continue;
        const choices = getChoiceElements(root);
        if (choices.length >= 2) {
          const isMulti =
            root.querySelectorAll('input[type="checkbox"]').length >= 2 ||
            /chọn\s*(nhiều|tất cả)|multiple|select all/i.test(qText);
          return { root, qText, choices, isMulti };
        }
      }
      return null;
    }

    function selectChoice(choice) {
      if (choice.input) {
        const inp = choice.input;
        const type = (inp.type || '').toLowerCase();
        if (type === 'radio' && !inp.checked) {
          inp.click();
        } else if (type === 'checkbox') {
          if (!inp.checked) inp.click();
        } else {
          inp.click();
        }
        inp.checked = true;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (choice.el) {
        choice.el.click();
        choice.el.dispatchEvent(new Event('click', { bubbles: true }));
      }
    }

    function clearSelections(root) {
      root.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(inp => {
        if (inp.checked) {
          inp.checked = false;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    function findNextButton() {
      const btns = document.querySelectorAll('button, a, [role="button"]');
      const patterns = [/tiếp\s*theo/i, /câu\s*tiếp/i, /next/i, /sau/i, /continue/i, /kết\s*thúc/i, /hoàn\s*thành/i, /submit/i, /nộp/i];
      for (const b of btns) {
        if (b.disabled) continue;
        const t = (b.innerText || b.textContent || '').trim();
        if (!t) continue;
        if (patterns.some(re => re.test(t))) return b;
      }
      return null;
    }

    let lastSignature = '';
    let busy = false;

    async function solveOnce() {
      if (busy) return;
      busy = true;
      try {
        const cfg = await chrome.storage.sync.get(['delays']);
        const ANSWER_WAIT = cfg.delays ? cfg.delays.answer : 15000;
        const NEXT_WAIT = cfg.delays ? cfg.delays.next : 60000;

        const q = getCurrentQuestion();
        if (!q) return;

        const sig = q.qText + '|' + q.choices.map(c => c.text).join('|');
        if (sig === lastSignature) return;

        let indices;
        try {
          indices = await AIProviders.ask(q.qText, q.choices.map(c => c.text), q.isMulti);
        } catch (e) {
          console.error('[GDQP] AI error:', e);
          return;
        }
        if (!indices || indices.length === 0) {
          console.warn('[GDQP] AI returned no answer');
          return;
        }

        if (!q.isMulti) {
          clearSelections(q.root);
          const idx = indices[0];
          if (q.choices[idx]) selectChoice(q.choices[idx]);
        } else {
          indices.forEach(idx => {
            if (q.choices[idx]) selectChoice(q.choices[idx]);
          });
        }

        lastSignature = sig;

        await new Promise(r => setTimeout(r, ANSWER_WAIT));

        const unanswered = Array.from(q.root.querySelectorAll('input[type="radio"], input[type="checkbox"]')).filter(i => !i.checked);
        const nextBtn = findNextButton();
        if (nextBtn && unanswered.length === 0) {
          await new Promise(r => setTimeout(r, NEXT_WAIT));
          if (findNextButton() === nextBtn) {
            nextBtn.click();
            nextBtn.dispatchEvent(new Event('click', { bubbles: true }));
          }
        }
      } finally {
        busy = false;
      }
    }

    const mo = new MutationObserver(() => { solveOnce(); });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });

    setTimeout(solveOnce, 1500);
    setTimeout(solveOnce, 3500);
    setInterval(solveOnce, 4000);
  }
})();

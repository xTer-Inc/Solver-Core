/**
 * Solver Core v3.4.0 — Universal Auto Solver
 * Chạy trên mọi website (trừ LMS / Azota / GDQP đã có script chuyên dụng)
 * Cơ chế: quét DOM → nhận diện câu hỏi trắc nghiệm → gọi AI → tick đáp án.
 */
(function () {
  'use strict';

  if (window.__SOLVER_UNIVERSAL_ACTIVE__) return;

  // ---- Domain whitelist/blacklist check ----
  chrome.storage.sync.get(['disabledDomains'], function (cfg) {
    var list = cfg.disabledDomains || [];
    var host = location.hostname;
    if (list.indexOf(host) !== -1) {
      console.log('[Solver Universal] Disabled on', host);
      return;
    }
    window.__SOLVER_UNIVERSAL_ACTIVE__ = true;
    startSolver();
  });

  function startSolver() {
    const LOG = '[Solver Universal]';
    const MIN_QUESTION_LEN = 8;
    const MAX_QUESTION_LEN = 4000;
    const MAX_CHOICE_LEN = 600;
    const MIN_CHOICES = 2;

    let lastSignature = '';
    let busy = false;
    let autoAdvance = true;

    function isVisible(el) {
      if (!el || !el.isConnected) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 4 && rect.height > 4;
    }

    function norm(s) {
      return (s || '').replace(/\s+/g, ' ').trim();
    }

    function collectQuestionContainers() {
      const containers = new Set();

      const inputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      inputs.forEach(inp => {
        if (!isVisible(inp)) return;
        let p = inp.parentElement;
        let depth = 0;
        while (p && depth < 8) {
          const innerInputs = p.querySelectorAll('input[type="radio"], input[type="checkbox"]');
          if (innerInputs.length >= 2) {
            if (innerInputs.length <= 20) {
              containers.add(p);
              break;
            }
          }
          p = p.parentElement;
          depth++;
        }
      });

      const semanticSelectors = [
        '.question', '.quiz-question', '.question-block', '.question-item',
        '.q', '.problem', '[data-question]', '[class*="question-item"]',
        '[class*="question-block"]', '[class*="quiz-question"]',
        'fieldset', '.card', 'form fieldset'
      ];
      semanticSelectors.forEach(sel => {
        try {
          document.querySelectorAll(sel).forEach(el => {
            if (!isVisible(el)) return;
            if (el.querySelectorAll('input[type="radio"], input[type="checkbox"]').length >= 2) {
              containers.add(el);
            }
          });
        } catch (e) { /* ignore */ }
      });

      const arr = Array.from(containers);
      const filtered = arr.filter(c => {
        for (const other of arr) {
          if (other === c) continue;
          if (c.contains(other) && other.querySelectorAll('input[type="radio"], input[type="checkbox"]').length >= 2) {
            return false;
          }
        }
        return true;
      });

      return filtered;
    }

    function extractQuestionText(root) {
      const candidates = root.querySelectorAll(
        '.question-text, .question-title, .qtext, .prompt, .stem, h1, h2, h3, h4, h5, h6, p, legend, [class*="question"]'
      );
      for (const el of candidates) {
        const t = norm(el.innerText || el.textContent);
        if (t.length >= MIN_QUESTION_LEN && t.length <= MAX_QUESTION_LEN) return t;
      }
      const clone = root.cloneNode(true);
      clone.querySelectorAll('input, button, select, textarea').forEach(n => n.remove());
      const fallback = norm(clone.innerText || clone.textContent);
      if (fallback.length >= MIN_QUESTION_LEN && fallback.length <= MAX_QUESTION_LEN) {
        return fallback.split('\n').slice(0, 2).join(' ').slice(0, MAX_QUESTION_LEN);
      }
      return '';
    }

    function extractChoices(root) {
      const inputs = Array.from(root.querySelectorAll('input[type="radio"], input[type="checkbox"]')).filter(isVisible);
      if (inputs.length === 0) return [];

      const seenTexts = new Set();
      const out = [];
      inputs.forEach(inp => {
        let holder = null;
        if (inp.id) {
          try {
            holder = document.querySelector('label[for="' + CSS.escape(inp.id) + '"]');
          } catch (e) { holder = null; }
        }
        if (!holder) holder = inp.closest('label');
        if (!holder) holder = inp.closest('li, .option, .choice, .answer, [class*="choice"], [class*="option"], [class*="answer"]');
        if (!holder) holder = inp.parentElement;

        let text = norm(holder ? (holder.innerText || holder.textContent) : '');
        text = text.replace(/^[A-Za-z][\.\)]\s*/, '').slice(0, MAX_CHOICE_LEN);
        if (!text) return;
        const key = text.toLowerCase();
        if (seenTexts.has(key)) return;
        seenTexts.add(key);
        out.push({ input: inp, holder, text });
      });

      return out;
    }

    function collectQuestions() {
      const containers = collectQuestionContainers();
      const questions = [];
      const seenSignatures = new Set();

      for (const root of containers) {
        if (!isVisible(root)) continue;
        const qText = extractQuestionText(root);
        if (!qText) continue;
        const choices = extractChoices(root);
        if (choices.length < MIN_CHOICES) continue;
        const sig = qText + '||' + choices.map(c => c.text).join('|');
        if (seenSignatures.has(sig)) continue;
        seenSignatures.add(sig);

        const isMulti = root.querySelectorAll('input[type="checkbox"]').length >= 2
          || /chọn\s*(nhiều|tất cả)|multiple|select all|chọn các/i.test(qText);

        questions.push({ root, qText, choices, isMulti });
      }
      return questions;
    }

    function clickChoice(choice) {
      const inp = choice.input;
      const type = (inp.type || '').toLowerCase();

      if (type === 'radio') {
        if (!inp.checked) {
          try { inp.click(); } catch (e) { /* ignore */ }
        }
      } else if (type === 'checkbox') {
        if (!inp.checked) {
          try { inp.click(); } catch (e) { /* ignore */ }
        }
      } else {
        try { inp.click(); } catch (e) { /* ignore */ }
      }

      if (!inp.checked) {
        inp.checked = true;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (choice.holder && choice.holder !== inp) {
        try { choice.holder.click(); } catch (e) { /* ignore */ }
      }
    }

    function clearGroup(root) {
      root.querySelectorAll('input[type="radio"]').forEach(inp => {
        if (inp.checked) {
          inp.checked = false;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    function findNextButton() {
      const candidates = document.querySelectorAll(
        'button, a, input[type="button"], input[type="submit"], [role="button"]'
      );
      const patterns = [
        /tiếp\s*theo/i, /câu\s*tiếp/i, /next/i, /\bsau\b/i, /continue/i,
        /kết\s*thúc/i, /hoàn\s*thành/i, /\bsubmit\b/i, /\bnộp\b/i, /done/i, /finish/i
      ];
      for (const b of candidates) {
        if (b.disabled || !isVisible(b)) continue;
        const t = norm(b.innerText || b.textContent || b.value || '');
        if (!t) continue;
        if (patterns.some(re => re.test(t))) return b;
      }
      return null;
    }

    async function solveQuestion(q, answerWait) {
      let indices;
      try {
        indices = await AIProviders.ask(q.qText, q.choices.map(c => c.text), q.isMulti);
      } catch (e) {
        console.error(LOG, 'AI error:', e);
        return false;
      }
      if (!Array.isArray(indices) || indices.length === 0) {
        console.warn(LOG, 'AI returned no answer');
        return false;
      }

      if (!q.isMulti) {
        clearGroup(q.root);
        const idx = indices[0];
        if (idx >= 0 && idx < q.choices.length) clickChoice(q.choices[idx]);
      } else {
        indices.forEach(idx => {
          if (idx >= 0 && idx < q.choices.length) clickChoice(q.choices[idx]);
        });
      }

      await new Promise(r => setTimeout(r, Math.max(300, answerWait)));
      return true;
    }

    async function run() {
      if (busy) return;
      busy = true;
      try {
        const cfg = await chrome.storage.sync.get(['delays']);
        const ANSWER_WAIT = cfg.delays ? Math.min(cfg.delays.answer, 6000) : 3000;
        const NEXT_WAIT = cfg.delays ? cfg.delays.next : 60000;

        const questions = collectQuestions();
        if (questions.length === 0) return;

        const pageSig = questions.map(q => q.qText).join('§');
        if (pageSig === lastSignature) return;

        let allOk = true;
        for (const q of questions) {
          const ok = await solveQuestion(q, ANSWER_WAIT);
          if (!ok) allOk = false;
        }
        lastSignature = pageSig;

        if (!autoAdvance || !allOk) return;

        const allRadioGroups = new Set();
        document.querySelectorAll('input[type="radio"]').forEach(i => { if (i.name) allRadioGroups.add(i.name); });
        let unanswered = 0;
        allRadioGroups.forEach(name => {
          const group = document.querySelectorAll('input[type="radio"][name="' + CSS.escape(name) + '"]');
          const anyChecked = Array.from(group).some(i => i.checked);
          if (!anyChecked) unanswered++;
        });
        if (unanswered > 0) {
          console.warn(LOG, 'Skip Next: ' + unanswered + ' unanswered radio group(s)');
          return;
        }

        await new Promise(r => setTimeout(r, NEXT_WAIT));
        const nextBtn = findNextButton();
        if (nextBtn) {
          nextBtn.click();
          nextBtn.dispatchEvent(new Event('click', { bubbles: true }));
        }
      } catch (e) {
        console.error(LOG, e);
      } finally {
        busy = false;
      }
    }

    const mo = new MutationObserver(() => { run(); });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });

    setTimeout(run, 2500);
    setTimeout(run, 5000);
    setInterval(run, 6000);
  }
})();

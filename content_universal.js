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

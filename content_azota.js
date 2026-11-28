/**
 * Solver Core v3.4.1 — Azota
 * Xử lý quiz Azota: .question-content, .answer-item, .answer-content label.
 */
(function () {
  'use strict';
  const LOG = '[Solver:azota]';

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

  function getQuestion() {
    const qText = document.querySelector(
      '.question-content, .question-title, [class*="question"]'
    )?.innerText;
    if (!qText) return null;

    const labels = document.querySelectorAll(
      '.answer-item, .answer-content label, [class*="answer"] label'
    );
    if (labels.length < 2) return null;

    const options = [];
    labels.forEach(el => {
      const t = el.innerText?.trim();
      if (t && t.length < 500 && options.indexOf(t) === -1) options.push(t);
    });
    if (options.length < 2) return null;
    return { qText, labels, options };
  }

  async function solveOne() {
    const q = getQuestion();
    if (!q) return;
    const { answer, next } = await getDelays();

    let indices;
    try {
      indices = await AIProviders.ask(q.qText, q.options, false);
    } catch (e) {
      console.error(LOG, 'AI error:', e.message);
      return;
    }
    if (!indices || indices.length === 0) return;

    const idx = indices[0];
    const label = q.labels[idx];
    if (!label) return;

    label.click();
    const input = label.querySelector('input');
    if (input) {
      input.click();
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await new Promise(r => setTimeout(r, answer));
    await new Promise(r => setTimeout(r, next));

    const btns = document.querySelectorAll('button, a');
    for (const b of btns) {
      const t = (b.innerText || '').toLowerCase();
      if ((t.includes('cau tiep') || t.includes('tiếp theo') || t.includes('next')) && !b.disabled) {
        b.click();
        break;
      }
    }
  }

  isDisabled(location.hostname, function (disabled) {
    if (disabled) { console.info(LOG, 'disabled on', location.hostname); return; }
    let lastQ = '';
    setInterval(() => {
      const q = getQuestion();
      if (q && q.qText !== lastQ) {
        lastQ = q.qText;
        solveOne();
      }
    }, 2000);
  });
})();

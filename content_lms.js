/**
 * Solver Core v3.4.1 — LMS DUT / LMS DES UDN
 * Xử lý Moodle quiz: .que, .qtext, .answer .r0/.r1, .state.
 */
(function () {
  'use strict';
  const LOG = '[Solver:lms]';

  function isDisabled(host, cb) {
    chrome.storage.sync.get(['disabledDomains'], function (cfg) {
      const list = cfg.disabledDomains || [];
      cb(list.indexOf(host) !== -1);
    });
  }

  async function getDelays() {
    const cfg = await chrome.storage.sync.get(['delays']);
    return {
      answer: cfg.delays ? cfg.delays.answer : 15000,
      next: cfg.delays ? cfg.delays.next : 60000
    };
  }

  function collectQuestions() {
    const out = [];
    document.querySelectorAll('.que').forEach(root => {
      const qText = root.querySelector('.qtext')?.innerText.trim();
      if (!qText) return;

      const state = root.querySelector('.state')?.innerText.trim() || '';
      const isReview = ['Correct', 'Incorrect', 'Đúng', 'Sai'].includes(state);
      if (isReview && (state.includes('Correct') || state.includes('Đúng'))) return;

      const choices = [];
      root.querySelectorAll('.answer .r0, .answer .r1').forEach(block => {
        const input = block.querySelector('input[type="radio"], input[type="checkbox"]');
        const text = block.querySelector('.flex-fill')?.innerText.trim() || block.innerText.trim();
        choices.push({ text, input });
      });

      if (choices.length < 2) return;
      const isMulti = root.querySelectorAll('input[type="checkbox"]').length >= 2;
      out.push({ root, qText, choices, isMulti, isReview });
    });
    return out;
  }

  async function solveQuestion(q, answerWait) {
    let indices;
    try {
      indices = await AIProviders.ask(q.qText, q.choices.map(c => c.text), q.isMulti);
    } catch (e) {
      console.error(LOG, 'AI error:', e.message);
      return false;
    }
    if (!indices || indices.length === 0) return false;

    indices.forEach(idx => {
      const choice = q.choices[idx];
      if (choice && choice.input) {
        choice.input.click();
        choice.input.dispatchEvent(new Event('change', { bubbles: true }));
        choice.input.checked = true;
      }
    });

    await new Promise(r => setTimeout(r, q.isReview ? 1500 : answerWait));
    return true;
  }

  function allRadioGroupsAnswered() {
    const groups = new Set();
    document.querySelectorAll('.que input[type="radio"]').forEach(i => { if (i.name) groups.add(i.name); });
    for (const name of groups) {
      const group = document.querySelectorAll(
        '.que input[type="radio"][name="' + CSS.escape(name) + '"]'
      );
      if (!Array.from(group).some(i => i.checked)) return false;
    }
    return true;
  }

  async function solvePage() {
    const questions = collectQuestions();
    if (questions.length === 0) return;

    const { answer, next } = await getDelays();
    let allOk = true;
    for (const q of questions) {
      const ok = await solveQuestion(q, answer);
      if (!ok) allOk = false;
    }

    const submitted = /Correct|Incorrect|Đúng|Sai/.test(
      document.querySelector('.state')?.innerText || ''
    );
    if (submitted) return;
    if (!allOk) { console.warn(LOG, 'Skip Next: AI error'); return; }
    if (!allRadioGroupsAnswered()) { console.warn(LOG, 'Skip Next: unanswered'); return; }

    await new Promise(r => setTimeout(r, next));
    const nextBtn = document.querySelector('input[name="next"]');
    if (nextBtn) {
      nextBtn.click();
      nextBtn.dispatchEvent(new Event('click', { bubbles: true }));
    }
  }

  isDisabled(location.hostname, function (disabled) {
    if (disabled) { console.info(LOG, 'disabled on', location.hostname); return; }
    setTimeout(solvePage, 2000);
  });
})();

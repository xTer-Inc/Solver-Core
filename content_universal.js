/**
 * Solver Core v3.4.1 — Universal Auto Solver (production-grade)
 * Tự động nhận diện & giải câu hỏi trắc nghiệm trên mọi website.
 *
 * Hai engine:
 *   1) Input-based  — câu hỏi dùng <input type="radio|checkbox">
 *   2) Clickable    — câu hỏi dùng <button> / <div> / <li> làm phương án (React/Vue SPA)
 *
 * Bảo vệ:
 *   - Debounce 800ms chống gọi AI trùng khi DOM thay đổi do highlight feedback
 *   - pageShowsFeedback() tránh re-solve sau khi web đã báo đúng/sai
 *   - Page signature locking
 *   - Blacklist nút điều hướng: Next, Submit, Đúng, Sai, Xem lại, Lịch sử...
 */
(function () {
  'use strict';

  if (window.__SOLVER_UNIVERSAL_ACTIVE__) return;

  const LOG = '[Solver:uni]';
  const CFG = {
    MIN_QUESTION_LEN: 8,
    MAX_QUESTION_LEN: 4000,
    MAX_CHOICE_LEN: 600,
    MIN_CHOICES: 2,
    MAX_CHOICES: 12,
    DEBOUNCE_MS: 800,
    INITIAL_DELAYS: [2500, 6000],
    POLL_INTERVAL: 8000
  };

  // Blacklist các nút KHÔNG phải đáp án
  const NAV_BLACKLIST = /^(đúng|sai|tiếp|next|continue|submit|gửi|nộp|xem|đóng|close|back|quay lại|trước|previous|kết thúc|hoàn thành|bắt đầu|bắt đầu làm|chọn chương|luyện|kiểm tra|xem lại|lịch sử|giải thích|explanation|đáp án|correct|wrong|true|false|yes|no|ok|cancel|hủy|thoát|exit|login|đăng nhập|đăng ký|register)/i;

  chrome.storage.sync.get(['disabledDomains'], function (cfg) {
    const host = location.hostname;
    if ((cfg.disabledDomains || []).indexOf(host) !== -1) {
      console.info(LOG, 'disabled on', host);
      return;
    }
    window.__SOLVER_UNIVERSAL_ACTIVE__ = true;
    startSolver();
  });

  function startSolver() {
    let lastSignature = '';
    let busy = false;
    let debounceTimer = null;

    // ---------- Utils ----------
    const isVisible = (el) => {
      if (!el || !el.isConnected) return false;
      const s = window.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    };
    const inViewport = (el) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0
        && r.left < window.innerWidth && r.right > 0;
    };
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const isLikelyChoice = (text) => {
      if (!text || text.length < 1 || text.length > CFG.MAX_CHOICE_LEN) return false;
      if (NAV_BLACKLIST.test(text)) return false;
      return true;
    };

    // ---------- Feedback detection ----------
    // Khi web đã hiển thị đáp án đúng/sai, ta KHÔNG re-solve để tránh loop.
    function pageShowsFeedback() {
      const body = document.body;
      if (!body) return false;
      const snippet = (body.innerText || '').slice(0, 4000).toLowerCase();
      return /đáp án đúng|đáp án sai|chính xác|không chính xác|correct answer|wrong answer|is correct|is wrong|giải thích|explanation/.test(snippet);
    }

    // ---------- Engine 1: Input-based ----------
    function detectInputBasedQuestions() {
      const containers = new Set();
      document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(inp => {
        if (!isVisible(inp)) return;
        let p = inp.parentElement;
        let depth = 0;
        while (p && depth < 8) {
          const inner = p.querySelectorAll('input[type="radio"], input[type="checkbox"]');
          if (inner.length >= CFG.MIN_CHOICES && inner.length <= 20) {
            containers.add(p);
            break;
          }
          p = p.parentElement;
          depth++;
        }
      });

      const out = [];
      const seen = new Set();
      for (const root of containers) {
        if (!isVisible(root)) continue;
        const qText = extractQuestionText(root);
        if (!qText) continue;

        const choices = [];
        const seenText = new Set();
        root.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(inp => {
          if (!isVisible(inp)) return;
          let holder = null;
          if (inp.id) {
            try { holder = document.querySelector('label[for="' + CSS.escape(inp.id) + '"]'); } catch (e) {}
          }
          if (!holder) holder = inp.closest('label');
          if (!holder) holder = inp.closest('li, .option, .choice, .answer, [class*="choice"], [class*="option"], [class*="answer"]');
          if (!holder) holder = inp.parentElement;

          let text = norm(holder ? (holder.innerText || '') : '');
          text = text.replace(/^[A-Za-z][\.\)]\s*/, '').slice(0, CFG.MAX_CHOICE_LEN);
          if (!text) return;
          const k = text.toLowerCase();
          if (seenText.has(k)) return;
          seenText.add(k);
          choices.push({ input: inp, holder, text, clickable: holder || inp, mode: 'input' });
        });

        if (choices.length < CFG.MIN_CHOICES) continue;
        const sig = qText + '||' + choices.map(c => c.text).join('|');
        if (seen.has(sig)) continue;
        seen.add(sig);

        const isMulti = root.querySelectorAll('input[type="checkbox"]').length >= 2
          || /chọn\s*(nhiều|tất cả)|multiple|select all|chọn các/i.test(qText);

        out.push({ root, qText, choices, isMulti, mode: 'input' });
      }
      return out;
    }

    // ---------- Engine 2: Clickable-based ----------
    // Dành cho web SPA dùng button/div/li làm phương án.
    function detectClickableQuestions() {
      // Bước 1: tìm container ứng viên
      const roots = new Set();
      const selectors = [
        '.question', '.quiz-question', '.question-block', '.question-item',
        '[data-question]', '[class*="question-item"]', '[class*="question-block"]',
        '[class*="quiz-question"]', '[class*="question-card"]',
        'section', 'article', 'fieldset', 'form'
      ];
      selectors.forEach(sel => {
        try {
          document.querySelectorAll(sel).forEach(el => {
            if (!isVisible(el)) return;
            const clickables = el.querySelectorAll('button, [role="button"], [class*="option"], [class*="answer"], [class*="choice"]');
            if (clickables.length >= CFG.MIN_CHOICES && clickables.length <= 20) roots.add(el);
          });
        } catch (e) {}
      });

      // Bước 2: trích câu hỏi + đáp án
      const out = [];
      const seen = new Set();
      for (const root of roots) {
        const qText = extractQuestionText(root);
        if (!qText) continue;

        // Tìm các phần tử clickable là phương án
        const clickables = [];
        const seenText = new Set();
        const candidates = root.querySelectorAll(
          '[class*="option"], [class*="answer"], [class*="choice"], [class*="dapan"], [class*="phuongan"], button, [role="button"]'
        );

        candidates.forEach(el => {
          if (!isVisible(el)) return;
          const text = norm(el.innerText || '');
          if (!isLikelyChoice(text)) return;

          // Loại nếu là container chứa option con
          if (el.querySelector('[class*="option"], [class*="answer"], [class*="choice"]')) return;

          // Loại nếu chứa input (đã xử lý ở engine 1)
          if (el.querySelector('input[type="radio"], input[type="checkbox"]')) return;

          // Loại nếu là nav button
          const tag = el.tagName.toLowerCase();
          if (tag === 'a' && !el.href) return;

          const k = text.toLowerCase();
          if (seenText.has(k)) return;
          seenText.add(k);
          clickables.push({ input: null, holder: el, text, clickable: el, mode: 'click' });
        });

        if (clickables.length < CFG.MIN_CHOICES || clickables.length > CFG.MAX_CHOICES) continue;

        const sig = qText + '||' + clickables.map(c => c.text).join('|');
        if (seen.has(sig)) continue;
        seen.add(sig);

        out.push({ root, qText, choices: clickables, isMulti: false, mode: 'click' });
      }
      return out;
    }

    // ---------- Extract question text ----------
    function extractQuestionText(root) {
      const sels = '.question-text, .question-title, .qtext, .prompt, .stem, h1, h2, h3, h4, h5, h6, p, legend, [class*="question"]';
      for (const el of root.querySelectorAll(sels)) {
        const t = norm(el.innerText || '');
        if (t.length < CFG.MIN_QUESTION_LEN || t.length > CFG.MAX_QUESTION_LEN) continue;
        if (/^[A-Za-z][\.\)]\s/.test(t)) continue;
        if (isLikelyChoice(t) && t.length < 40) continue; // tránh nhặt nhầm label đáp án
        return t;
      }
      const clone = root.cloneNode(true);
      clone.querySelectorAll('input, button, select, textarea, ul, ol, li').forEach(n => n.remove());
      const fb = norm(clone.innerText || '');
      if (fb.length >= CFG.MIN_QUESTION_LEN && fb.length <= CFG.MAX_QUESTION_LEN) {
        return fb.split('\n').slice(0, 2).join(' ').slice(0, CFG.MAX_QUESTION_LEN);
      }
      return '';
    }

    // ---------- Click choice ----------
    function clickChoice(choice) {
      if (choice.input) {
        try { choice.input.click(); } catch (e) {}
        if (!choice.input.checked) {
          choice.input.checked = true;
          choice.input.dispatchEvent(new Event('input', { bubbles: true }));
          choice.input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (choice.holder && choice.holder !== choice.input) {
          try { choice.holder.click(); } catch (e) {}
        }
        return;
      }
      const el = choice.clickable || choice.holder;
      if (!el) return;
      try { el.click(); } catch (e) {}
      try {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } catch (e) {}
    }

    function clearRadioGroup(root) {
      root.querySelectorAll('input[type="radio"]').forEach(inp => {
        if (inp.checked) {
          inp.checked = false;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    // ---------- Solve 1 câu ----------
    async function solveQuestion(q, answerWait) {
      let indices;
      try {
        indices = await AIProviders.ask(q.qText, q.choices.map(c => c.text), q.isMulti);
      } catch (e) {
        console.error(LOG, 'AI error:', e.message);
        return false;
      }
      if (!Array.isArray(indices) || indices.length === 0) return false;

      if (!q.isMulti) {
        clearRadioGroup(q.root);
        const idx = indices[0];
        if (q.choices[idx]) clickChoice(q.choices[idx]);
      } else {
        indices.forEach(idx => {
          if (q.choices[idx]) clickChoice(q.choices[idx]);
        });
      }
      await new Promise(r => setTimeout(r, Math.max(300, answerWait)));
      return true;
    }

    // ---------- Find Next ----------
    function findNextButton() {
      const patterns = [/tiếp\s*theo/i, /câu\s*tiếp/i, /next/i, /\bsau\b/i, /continue/i, /kết\s*thúc/i, /hoàn\s*thành/i, /\bsubmit\b/i, /\bnộp\b/i, /done/i, /finish/i];
      for (const b of document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')) {
        if (b.disabled || !isVisible(b)) continue;
        const t = norm(b.innerText || b.textContent || b.value || '');
        if (t && patterns.some(re => re.test(t))) return b;
      }
      return null;
    }

    // ---------- Run 1 vòng ----------
    async function run() {
      if (busy) return;
      busy = true;
      try {
        const cfg = await chrome.storage.sync.get(['delays']);
        const ANSWER_WAIT = cfg.delays ? Math.min(cfg.delays.answer, 5000) : 2500;
        const NEXT_WAIT = cfg.delays ? Math.min(cfg.delays.next, 30000) : 5000;

        // Nếu web đã hiện feedback → không solve lại, chỉ next nếu có
        if (pageShowsFeedback()) {
          const nextBtn = findNextButton();
          if (nextBtn) {
            await new Promise(r => setTimeout(r, NEXT_WAIT));
            nextBtn.click();
            nextBtn.dispatchEvent(new Event('click', { bubbles: true }));
          }
          return;
        }

        // Thu thập câu hỏi từ cả 2 engine
        let questions = detectInputBasedQuestions();
        if (questions.length === 0) questions = detectClickableQuestions();
        if (questions.length === 0) return;

        // Ưu tiên câu trong viewport
        if (questions.length > 1) {
          const vp = questions.filter(q => inViewport(q.root));
          if (vp.length > 0) questions = vp;
        }

        const pageSig = questions.map(q => q.qText).join('§');
        if (pageSig === lastSignature) return;

        let allOk = true;
        for (const q of questions) {
          const ok = await solveQuestion(q, ANSWER_WAIT);
          if (!ok) allOk = false;
        }
        lastSignature = pageSig;
        if (!allOk) return;

        // Double-check
        const groups = new Set();
        document.querySelectorAll('input[type="radio"]').forEach(i => { if (i.name) groups.add(i.name); });
        let unanswered = 0;
        groups.forEach(name => {
          const g = document.querySelectorAll('input[type="radio"][name="' + CSS.escape(name) + '"]');
          if (!Array.from(g).some(i => i.checked)) unanswered++;
        });
        if (unanswered > 0) {
          console.warn(LOG, 'Skip Next:', unanswered, 'unanswered');
          return;
        }

        // Tự next nếu có nút
        await new Promise(r => setTimeout(r, NEXT_WAIT));
        const nextBtn = findNextButton();
        if (nextBtn) {
          nextBtn.click();
          nextBtn.dispatchEvent(new Event('click', { bubbles: true }));
        }
      } catch (e) {
        console.error(LOG, 'run error:', e.message);
      } finally {
        busy = false;
      }
    }

    // ---------- Observers ----------
    const mo = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(run, CFG.DEBOUNCE_MS);
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });

    CFG.INITIAL_DELAYS.forEach(ms => setTimeout(run, ms));
    setInterval(run, CFG.POLL_INTERVAL);
  }
})();

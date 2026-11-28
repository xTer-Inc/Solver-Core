/**
 * Solver Core v3.4.1 — Popup logic
 * - Cấu hình provider / key / model / delays
 * - Test kết nối
 * - Quản lý domain bị tắt (blacklist)
 */
document.addEventListener('DOMContentLoaded', async function () {
  const cfg = await chrome.storage.sync.get(['provider', 'apiKey', 'model', 'delays', 'disabledDomains']);

  document.getElementById('provider').value = cfg.provider || 'gemini';
  document.getElementById('apiKey').value = cfg.apiKey || '';
  document.getElementById('model').value = cfg.model || 'gemini-2.5-flash-lite';

  if (cfg.delays) {
    document.getElementById('answerDelay').value = cfg.delays.answer / 1000;
    document.getElementById('answerVal').textContent = (cfg.delays.answer / 1000) + 's';
    document.getElementById('nextDelay').value = cfg.delays.next / 1000;
    document.getElementById('nextVal').textContent = (cfg.delays.next / 1000) + 's';
  } else {
    document.getElementById('answerVal').textContent = '3s';
    document.getElementById('nextVal').textContent = '15s';
  }

  // --- Current host ---
  let currentHost = '';
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url) {
      try { currentHost = new URL(tabs[0].url).hostname; } catch (e) {}
    }
  } catch (e) {}

  document.getElementById('currentHost').textContent = currentHost || '(không xác định)';

  const toggle = document.getElementById('currentDomainToggle');
  const disabled = cfg.disabledDomains || [];
  toggle.checked = currentHost ? disabled.indexOf(currentHost) === -1 : false;
  if (!currentHost) {
    toggle.disabled = true;
    document.getElementById('currentHost').textContent = '(không hỗ trợ trang này)';
  }

  renderDisabledList(disabled);

  toggle.addEventListener('change', async function () {
    if (!currentHost) return;
    const list = (await chrome.storage.sync.get(['disabledDomains'])).disabledDomains || [];
    const idx = list.indexOf(currentHost);
    if (this.checked) {
      if (idx !== -1) list.splice(idx, 1);
    } else {
      if (idx === -1) list.push(currentHost);
    }
    await chrome.storage.sync.set({ disabledDomains: list });
    renderDisabledList(list);

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'domainStateChanged',
          host: currentHost,
          enabled: this.checked
        }).catch(() => {});
      }
    } catch (e) {}
  });

  function renderDisabledList(list) {
    const container = document.getElementById('disabledList');
    container.innerHTML = '';
    if (!list || list.length === 0) {
      container.innerHTML = '<div class="empty">Chưa có trang nào bị tắt</div>';
      return;
    }
    list.slice().sort().forEach(host => {
      const row = document.createElement('div');
      row.className = 'domain-row';
      const span = document.createElement('span');
      span.className = 'host';
      span.textContent = host;
      span.title = host;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = 'Xóa';
      removeBtn.addEventListener('click', async function () {
        const cfg2 = await chrome.storage.sync.get(['disabledDomains']);
        const list2 = (cfg2.disabledDomains || []).filter(h => h !== host);
        await chrome.storage.sync.set({ disabledDomains: list2 });
        renderDisabledList(list2);
        if (host === currentHost) {
          document.getElementById('currentDomainToggle').checked = true;
        }
      });
      row.appendChild(span);
      row.appendChild(removeBtn);
      container.appendChild(row);
    });
  }

  document.getElementById('answerDelay').addEventListener('input', function() {
    document.getElementById('answerVal').textContent = this.value + 's';
  });
  document.getElementById('nextDelay').addEventListener('input', function() {
    document.getElementById('nextVal').textContent = this.value + 's';
  });

  function showStatus(text, ok) {
    const s = document.getElementById('status');
    s.style.display = 'block';
    s.className = 'status ' + (ok ? 'ok' : 'err');
    s.textContent = text;
  }

  document.getElementById('testBtn').addEventListener('click', async function () {
    const provider = document.getElementById('provider').value;
    const key = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('model').value.trim();

    if (!key) return showStatus('Vui lòng nhập API Key', false);
    if (!model) return showStatus('Vui lòng nhập Model', false);

    showStatus('Đang test...', true);

    try {
      let url, opts, answer;
      if (provider === 'gemini') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        opts = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: '2+2=?' }] }] })
        };
      } else if (provider === 'openai') {
        url = 'https://api.openai.com/v1/chat/completions';
        opts = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model: model, messages: [{ role: 'user', content: '2+2=?' }] })
        };
      } else {
        url = 'https://api.anthropic.com/v1/messages';
        opts = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({ model: model, max_tokens: 50, messages: [{ role: 'user', content: '2+2=?' }] })
        };
      }

      const r = await fetch(url, opts);
      const j = await r.json();
      if (j.error) return showStatus('LỖI: ' + j.error.message, false);

      if (provider === 'gemini') answer = j.candidates[0].content.parts[0].text;
      else if (provider === 'anthropic') answer = j.content[0].text;
      else answer = j.choices[0].message.content;

      showStatus('OK: ' + answer.trim(), true);
    } catch (e) {
      showStatus('LỖI: ' + e.message, false);
    }
  });

  document.getElementById('save').addEventListener('click', function () {
    const provider = document.getElementById('provider').value;
    const apiKey = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('model').value.trim();
    const answerDelay = parseInt(document.getElementById('answerDelay').value) * 1000;
    const nextDelay = parseInt(document.getElementById('nextDelay').value) * 1000;

    if (!apiKey) return showStatus('API Key bắt buộc', false);
    if (!model) return showStatus('Model bắt buộc', false);

    const data = {
      provider: provider,
      apiKey: apiKey,
      model: model,
      delays: { answer: answerDelay, next: nextDelay }
    };

    chrome.storage.sync.set(data, function () {
      chrome.tabs.query({}, function (tabs) {
        tabs.forEach(t => chrome.tabs.sendMessage(t.id, { type: 'config', data: data }).catch(() => {}));
      });
      showStatus('Đã lưu cấu hình', true);
    });
  });
});

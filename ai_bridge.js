/**
 * Solver Core v3.4.1 — AI Bridge
 * Adapter cho Gemini / OpenAI / Anthropic. Trả về mảng index đáp án.
 * Có retry 1 lần khi AI trả về sai format.
 */
const AIProviders = {
  async openai(key, model, prompt) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0
      })
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.choices[0].message.content;
  },

  async gemini(key, model, prompt) {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.candidates[0].content.parts[0].text;
  },

  async anthropic(key, model, prompt) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.content[0].text;
  },

  _buildPrompt(question, choices, isMulti, strict) {
    const list = choices.map((c, i) => i + '. ' + c).join('\n');
    const jsonShape = isMulti
      ? '{"answers":[<cac index dung>]}'
      : '{"answers":[<index dung>]}';
    const task = isMulti
      ? 'Chon TAT CA dap an dung.'
      : 'Chon 1 dap an dung nhat.';
    const strictNote = strict
      ? '\nQUAN TRONG: Chi tra ve JSON hop le, khong giai thich, khong markdown, khong codeblock.'
      : '';
    return task + ' CHI tra ve JSON: ' + jsonShape + '.' + strictNote +
      '\nCau hoi: ' + question + '\nDap an:\n' + list;
  },

  async _callProvider(provider, key, model, prompt) {
    if (provider === 'openai') return AIProviders.openai(key, model, prompt);
    if (provider === 'gemini') return AIProviders.gemini(key, model, prompt);
    if (provider === 'anthropic') return AIProviders.anthropic(key, model, prompt);
    throw new Error('Chua chon provider');
  },

  _parse(raw, choiceCount) {
    const m = raw.match(/\{[\s\S]*\}/);
    const text = m ? m[0] : raw;
    const parsed = JSON.parse(text);

    let answers = null;
    if (Array.isArray(parsed.answers)) answers = parsed.answers;
    else if (typeof parsed.index === 'number') answers = [parsed.index];
    else if (typeof parsed.answer === 'number') answers = [parsed.answer];
    else if (typeof parsed.answer === 'string') {
      // AI có thể trả về "A", "B" thay vì số
      const map = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 };
      const k = parsed.answer.trim().toLowerCase();
      if (k in map) answers = [map[k]];
    }

    if (!answers) throw new Error('AI tra ve sai format');

    // Lọc index hợp lệ
    answers = answers
      .map(n => parseInt(n, 10))
      .filter(n => Number.isInteger(n) && n >= 0 && n < choiceCount);

    if (answers.length === 0) throw new Error('AI tra ve index khong hop le');
    return answers;
  },

  async ask(question, choices, isMulti = false) {
    const cfg = await chrome.storage.sync.get(['provider', 'apiKey', 'model']);
    if (!cfg.apiKey) throw new Error('Chua cau hinh API key');
    if (!cfg.model) throw new Error('Chua cau hinh model');

    // Attempt 1
    try {
      const prompt = AIProviders._buildPrompt(question, choices, isMulti, false);
      const raw = await AIProviders._callProvider(cfg.provider, cfg.apiKey, cfg.model, prompt);
      return AIProviders._parse(raw, choices.length);
    } catch (e1) {
      console.warn('[Solver:ai] Attempt 1 failed:', e1.message, '— retrying strict');
    }

    // Attempt 2 (strict prompt)
    const prompt2 = AIProviders._buildPrompt(question, choices, isMulti, true);
    const raw2 = await AIProviders._callProvider(cfg.provider, cfg.apiKey, cfg.model, prompt2);
    return AIProviders._parse(raw2, choices.length);
  }
};

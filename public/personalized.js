(() => {
  const $ = id => document.getElementById(id);
  const host = $('interview'), status = $('personal-status'), error = $('personal-error');
  const params = new URLSearchParams(location.search);
  const query = params.get('query')?.trim(), run = params.get('run')?.trim() || 'direct';
  const key = `personalized:v40:${run}:${query}`;
  const searchForm = $('personal-search-form'), searchInput = $('personal-search-input');
  const discovery = $('personal-discovery'), landing = !query;
  document.body?.classList?.add(landing ? 'personalized-landing' : 'personalized-flow');
  if (discovery) discovery.hidden = !landing;
  let state = { originalQuery: query, query, questions: [], answers: [], index: 0, narrowing: [], history: [] }, busy = false;
  let generationInFlight = false, editingNeeds = false, editingQuestionIndex = null, editingCascade = null, editBaseline = null, backgroundResult = null;
  let recommendationController = null, recommendationVersion = 0;
  const button = (label, action, primary = false) => {
    const b = element('button', `rounded-xl px-5 py-3 text-sm ${primary ? 'bg-teal-800 text-white' : 'border border-slate-200 text-slate-700'}`, label);
    b.type = 'button'; b.addEventListener('click', action); return b;
  };
  const allowsMultiple = question => ['q3', 'q4'].includes(question?.id);
  const otherOptionLabel = option => option === '其他' ? '其他（需自行填写）' : option;
  const questionTitle = question => {
    let title = question.title;
    if (allowsMultiple(question) && !title.includes('可多选')) title += '（可多选）';
    return title;
  };
  const q4Hint = '建议选择不超过 3 项，以获取更精准推荐';
  function updateSelection(answer, option, checked, multiple) {
    if (!multiple) answer.selected = checked ? [option] : [];
    else if (option === '不限') answer.selected = checked ? ['不限'] : [];
    else {
      const selected = answer.selected.filter(value => value !== '不限' && value !== option);
      answer.selected = checked ? [...selected, option] : selected;
    }
    if (!answer.selected.includes('其他')) answer.other = '';
  }
  function resetNeedsEditLayout() {
    editingQuestionIndex = null;
    editingCascade = null;
    $('needs-editor').hidden = true;
    $('needs-editor').replaceChildren();
    $('needs-layout').className = '';
    $('edit-needs').hidden = false;
  }
  function setNeedsSummary(text) {
    const summary = $('needs-summary');
    const lines = String(text || '').split('\n').filter(Boolean);
    const rows = [];
    for (let index = 0; index < lines.length; index += 2) {
      const row = element('div', 'needs-summary-item');
      row.append(
        element('p', 'needs-summary-question', lines[index]),
        element('p', 'needs-summary-answer', lines[index + 1] || '')
      );
      rows.push(row);
    }
    summary.replaceChildren(...rows);
  }
  const save = () => { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {} };
  const previousQuestionCount = () => (Array.isArray(state.history) ? state.history : []).reduce((total, stage) => total + (Array.isArray(stage?.questions) ? stage.questions.length : 0), 0);
  const snapshot = () => {
    const { history, result, ...current } = state;
    return JSON.parse(JSON.stringify(current));
  };
  const updateTitle = () => { $('personal-title').textContent = `帮你选更适合的「${state.query || query}」`; };
  function showError(message) { error.textContent = message; error.hidden = false; }
  searchForm?.addEventListener('submit', event => {
    event.preventDefault();
    const nextQuery = searchInput.value.trim();
    if (!nextQuery || nextQuery.length > 100) { showError('请输入1–100字的商品关键词。'); return; }
    location.href = `/personalized.html?query=${encodeURIComponent(nextQuery)}&run=${Date.now().toString(36)}`;
  });
  async function request(stage, onEvent, signal) {
    const response = await fetch('/api/personalized', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage, query: state.query || query, sessionId: state.sessionId, answers: state.answers, ...(onEvent ? { stream: true } : {}) }), signal });
    if (onEvent && response.ok && response.headers?.get('content-type')?.includes('application/x-ndjson')) {
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let pending = '', result, completed = false;
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = pending.split('\n'); pending = done ? '' : lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line); onEvent(event);
          if (event.type === 'error') throw new Error(event.error || '请求失败，请重试。');
          if (event.type === 'result') {
            const { type, ...data } = event;
            result = data;
          } else if (event.type === 'complete') {
            completed = true;
          } else if (event.type === 'done') {
            const { type, ...data } = event;
            result = data; completed = true;
          }
        }
        if (done) break;
      }
      if (!result || !completed) throw new Error('推荐生成中断，请重试。');
      return result;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '请求失败，请重试。');
    return data;
  }
  async function loadQuestions() {
    if (busy) return;
    busy = true; host.replaceChildren(); error.hidden = true; status.textContent = '正在为你准备需求问题…';
    try {
      const data = await request('questions');
      state = { ...data, index: 0, answers: data.questions.map(q => ({ id: q.id, selected: [], other: '' })), history: [] };
      updateTitle(); save(); draw();
    } catch (e) { showError(e.message); host.append(button('重新生成问题', loadQuestions, true)); }
    finally { busy = false; status.textContent = ''; }
  }
  async function refineSearchTerm() {
    if (busy) return;
    const previous = snapshot(), previousHistory = Array.isArray(state.history) ? state.history : [];
    busy = true; error.hidden = true; status.textContent = '正在根据新的搜索词判断下一步…';
    host.replaceChildren();
    try {
      const data = await request('refine');
      state = { ...data, index: 0, answers: data.questions.map(q => ({ id: q.id, selected: [], other: '' })), history: [...previousHistory, previous] };
      updateTitle(); save(); draw();
    } catch (e) { draw(); showError(e.message); }
    finally { busy = false; status.textContent = ''; }
  }
  function restorePreviousStage() {
    if (!Array.isArray(state.history) || !state.history.length) return false;
    const previous = state.history.at(-1), history = state.history.slice(0, -1);
    state = { ...previous, history }; delete state.result;
    updateTitle(); save(); draw(); return true;
  }
  function transitionQuestionCard(field, actions, control, direction, advance) {
    control.disabled = true;
    return advance();
  }
  function draw() {
    error.hidden = true; host.hidden = false; $('personal-result').hidden = !editingNeeds; host.replaceChildren();
    if (state.index >= state.questions.length) {
      if (!generationInFlight) recommend();
      return;
    }
    const q = state.questions[state.index], answer = state.answers[state.index];
    const narrowing = q.id === 'q0' || q.id === 'q1';
    const previousCount = previousQuestionCount();
    const totalLabel = narrowing ? '约 3–5 题' : `共 ${previousCount + state.questions.length} 题`;
    host.append(element('p', 'question-progress mb-3 text-xs text-teal-700', `第 ${previousCount + state.index + 1} 题，${totalLabel}`));
    const field = element('fieldset', 'space-y-3');
    field.append(element('legend', q.id === 'q4' ? 'text-xl font-semibold' : 'mb-5 text-xl font-semibold', questionTitle(q)));
    if (q.id === 'q4') field.append(element('p', 'text-sm leading-6 text-slate-500', q4Hint));
    const other = element('input', 'mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm');
    const customOption = '其他';
    other.maxLength = 300; other.placeholder = narrowing ? '请输入新的搜索词' : '请补充你的需求'; other.value = answer.other; other.hidden = !answer.selected.includes(customOption); other.setAttribute('aria-label', narrowing ? '新的搜索词' : '其他需求');
    const inputs = [];
    const addedOptions = ['不限', '其他'];
    for (const option of [...q.options, ...addedOptions]) {
      const label = element('label', 'flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm');
      const input = element('input', 'accent-teal-800'); input.type = allowsMultiple(q) ? 'checkbox' : 'radio'; input.name = q.id; input.checked = answer.selected.includes(option); inputs.push([input, option]);
      input.addEventListener('change', () => {
        error.hidden = true;
        updateSelection(answer, option, input.checked, allowsMultiple(q));
        inputs.forEach(([el, value]) => { el.checked = answer.selected.includes(value); });
        other.hidden = !answer.selected.includes(customOption); if (other.hidden) { answer.other = ''; other.value = ''; } save();
      });
      label.append(input, element('span', '', otherOptionLabel(option))); field.append(label);
    }
    other.addEventListener('input', () => { answer.other = other.value; save(); });
    field.append(other); host.append(field);
    const actions = element('div', 'mt-7 flex justify-between gap-3');
    const back = button('上一题', () => {
      return transitionQuestionCard(field, actions, back, 'backward', () => {
        if (state.index > 0) { state.index--; save(); draw(); return; }
        return restorePreviousStage();
      });
    }); back.disabled = state.index === 0 && !state.history?.length; back.className += ' disabled:opacity-30';
    const lastQuestion = !narrowing && state.index === state.questions.length - 1;
    const nextLabel = narrowing ? '下一步' : lastQuestion ? '生成推荐' : '下一题';
    const next = button(nextLabel, () => {
      if (!answer.selected.length || (answer.selected.includes(customOption) && !answer.other.trim())) { showError(narrowing ? '请选择一个选项；选择其他时请输入新的搜索词。' : allowsMultiple(q) ? '请至少选择一项需求；选择其他时请补充说明。' : '请选择一项需求；选择其他时请补充说明。'); return; }
      if (narrowing) return transitionQuestionCard(field, actions, next, 'forward', refineSearchTerm);
      if (lastQuestion) return transitionQuestionCard(field, actions, next, 'forward', () => { state.index++; save(); return recommend(); });
      return transitionQuestionCard(field, actions, next, 'forward', () => { state.index++; save(); draw(); });
    }, true);
    actions.append(back);
    if (editingNeeds) actions.append(button('取消调整', cancelNeedsEdit));
    actions.append(next); host.append(actions);
  }
  function showResult(result = state.result, resultQuery = state.query, resultRequirements = state.resultRequirements || requirementSummary()) {
    if (!result) return;
    host.hidden = true; $('personal-result').hidden = false;
    if (!editingNeeds) { resetNeedsEditLayout(); setNeedsSummary(resultRequirements); }
    $('insufficient').hidden = result.status !== 'insufficient'; $('insufficient').textContent = result.message || '';
    $('products-feedback').hidden = true; $('products').classList?.remove('skeleton-wave'); render(result);
    $('products').classList?.add('results-reveal');
    if (result.products.length) renderFeedback('products', resultQuery, result);
  }
  function beginNeedsEdit() {
    if (editingNeeds) return;
    editBaseline = JSON.parse(JSON.stringify(state));
    backgroundResult = null;
    editingNeeds = true;
    editingQuestionIndex = null;
    editingCascade = null;
    renderNeedsEdit();
  }
  function answerText(answer) {
    return answer.selected.map(value => value === '其他' ? answer.other : value).join('、');
  }
  function originalAnswerFor(questionId) {
    const original = editBaseline || state;
    for (const stage of [...(original.history || []), original]) {
      const index = stage.questions.findIndex(question => question.id === questionId);
      if (index !== -1) return JSON.parse(JSON.stringify(stage.answers[index]));
    }
    return { id: questionId, selected: [], other: '' };
  }
  function draftAnswerFor(questionId, fallback) {
    for (const stage of [...(state.history || []), state]) {
      const index = stage.questions.findIndex(question => question.id === questionId);
      if (index !== -1) return stage.answers[index];
    }
    return fallback;
  }
  function validDraftAnswer(answer) {
    return answer?.selected?.length && (!answer.selected.includes('其他') || answer.other.trim());
  }
  function beginHistoricalQuestionEdit(stageIndex, questionIndex) {
    const original = editBaseline || state, stage = original.history?.[stageIndex];
    if (!stage) return;
    state = JSON.parse(JSON.stringify({ ...stage, history: original.history.slice(0, stageIndex) }));
    editingCascade = 'narrowing';
    save(); renderNeedsEdit(questionIndex);
  }
  async function continueQuestionCascade(question) {
    if (question.id === 'q0' || question.id === 'q1') {
      const editor = $('needs-editor');
      editor.replaceChildren(element('p', 'text-sm text-teal-800', '正在根据新的选择更新后续问题…'));
      try {
        const previous = snapshot(), previousHistory = Array.isArray(state.history) ? state.history : [];
        const data = await request('refine');
        state = { ...data, index: 0, answers: data.questions.map(item => ({ id: item.id, selected: [], other: '' })), history: [...previousHistory, previous] };
        editingCascade = data.questions.some(item => item.id === 'q0' || item.id === 'q1') ? 'narrowing' : 'base';
        updateTitle(); save(); renderNeedsEdit(data.questions.length ? 0 : null);
      } catch (requestError) {
        showError(requestError.message); renderNeedsEdit(editingQuestionIndex);
      }
      return;
    }
    if (editingCascade === 'base' && editingQuestionIndex < state.questions.length - 1) {
      renderNeedsEdit(editingQuestionIndex + 1);
      return;
    }
    editingCascade = null; renderNeedsEdit(null);
  }
  function renderNeedsEdit(questionIndex = editingQuestionIndex) {
    if (!editingNeeds) return;
    editingQuestionIndex = Number.isInteger(questionIndex) ? questionIndex : null;
    error.hidden = true; host.hidden = true; $('personal-result').hidden = false; $('edit-needs').hidden = true;
    const original = editBaseline || state, summary = $('needs-summary'), rows = [];
    summary.textContent = '';
    if (original.explicitFacts?.length) {
      const row = element('div', 'border-b border-teal-900/10 py-3');
      row.append(element('p', 'needs-summary-question text-base font-semibold leading-6', '搜索词中已明确'), element('p', 'mt-1 text-base leading-7 text-slate-800', original.explicitFacts.map(fact => fact.value).join('、')));
      rows.push(row);
    }
    const stages = [...(original.history || []).map((stage, stageIndex) => ({ stage, stageIndex })), { stage: original, stageIndex: null }];
    stages.forEach(({ stage, stageIndex }) => stage.questions.forEach((question, index) => {
      const row = element('div', 'flex items-start gap-3 border-b border-teal-900/10 py-3');
      const copy = element('div', 'min-w-0');
      copy.append(element('p', 'needs-summary-question text-base font-semibold leading-6', questionTitle(question)), element('p', 'mt-1 break-words text-base leading-7 text-slate-800', answerText(draftAnswerFor(question.id, stage.answers[index]))));
      const modify = element('button', 'shrink-0 text-base text-amber-700 underline decoration-amber-400 underline-offset-4', '修改');
      modify.type = 'button'; modify.addEventListener('click', () => {
        if (stageIndex !== null) { beginHistoricalQuestionEdit(stageIndex, index); return; }
        const currentIndex = state.questions.findIndex(item => item.id === question.id);
        if (currentIndex === -1) {
          state = JSON.parse(JSON.stringify(editBaseline));
          editingCascade = null;
          renderNeedsEdit(index);
        } else renderNeedsEdit(currentIndex);
      });
      row.append(copy, modify); rows.push(row);
    }));
    const actions = element('div', 'mt-5 flex flex-wrap items-center gap-4');
    const cancel = element('button', 'text-sm text-slate-500 underline underline-offset-4', '取消调整');
    cancel.type = 'button'; cancel.addEventListener('click', cancelNeedsEdit);
    const regenerate = button('重新生成', () => {
      if (!state.answers.every(validDraftAnswer)) { showError('请先完成正在修改的需求。'); return; }
      recommend();
    }, true);
    actions.append(cancel, regenerate); rows.push(actions); summary.replaceChildren(...rows);

    const editor = $('needs-editor'), layout = $('needs-layout');
    if (editingQuestionIndex === null) { editor.hidden = true; editor.replaceChildren(); layout.className = ''; return; }
    layout.className = 'needs-edit-layout'; editor.hidden = false;
    editor.className = 'border-l border-teal-800/20 pl-5 sm:pl-6';
    const question = state.questions[editingQuestionIndex], answer = state.answers[editingQuestionIndex];
    editor.replaceChildren(element('h3', 'text-lg font-semibold leading-7 text-slate-800', questionTitle(question)));
    if (question.id === 'q4') editor.append(element('p', 'mt-2 text-base leading-7 text-slate-500', q4Hint));
    const options = element('div', 'mt-4 space-y-1');
    for (const option of [...new Set([...question.options, '不限', '其他'])]) {
      const selected = answer.selected.includes(option);
      const label = element('label', `flex cursor-pointer items-center gap-3 rounded-lg px-1 py-2 text-base transition ${selected ? 'font-medium text-teal-900' : 'text-slate-700 hover:text-teal-900'}`);
      const input = element('input', 'h-4 w-4 shrink-0 accent-teal-800'); input.type = allowsMultiple(question) ? 'checkbox' : 'radio'; input.name = `edit-${question.id}`; input.checked = selected;
      input.addEventListener('change', () => {
        updateSelection(answer, option, input.checked, allowsMultiple(question));
        save(); renderNeedsEdit(editingQuestionIndex);
      });
      label.append(input, element('span', '', otherOptionLabel(option))); options.append(label);
    }
    editor.append(options);
    if (answer.selected.includes('其他')) {
      const other = element('input', 'mt-3 w-full rounded-xl border border-teal-800/20 bg-white/60 px-3 py-2 text-base outline-none focus:border-teal-700');
      other.maxLength = 300; other.placeholder = '请补充你的需求'; other.value = answer.other; other.setAttribute('aria-label', '其他需求');
      other.addEventListener('input', () => { answer.other = other.value; save(); }); editor.append(other);
    }
    const questionActions = element('div', 'mt-5 flex items-center gap-4');
    const undo = element('button', 'text-sm text-slate-500 underline underline-offset-4', '取消本题修改');
    undo.type = 'button'; undo.addEventListener('click', () => { state.answers[editingQuestionIndex] = originalAnswerFor(question.id); save(); renderNeedsEdit(null); });
    const done = element('button', 'text-sm font-medium text-teal-800 underline decoration-teal-500 underline-offset-4', '完成');
    done.type = 'button'; done.addEventListener('click', async () => {
      if (!validDraftAnswer(answer)) { showError(allowsMultiple(question) ? '请至少选择一项需求；选择其他时请补充说明。' : '请选择一项需求；选择其他时请补充说明。'); return; }
      await continueQuestionCascade(question);
    });
    questionActions.append(undo, done); editor.append(questionActions);
  }
  function cancelNeedsEdit() {
    if (!editingNeeds) return;
    const completed = backgroundResult;
    state = JSON.parse(JSON.stringify(editBaseline || state));
    if (completed) {
      state.result = completed.data;
      state.resultRequirements = completed.requirements;
    }
    editingNeeds = false; editBaseline = null; backgroundResult = null;
    resetNeedsEditLayout();
    updateTitle(); save();
    if (state.result) showResult(state.result, completed?.query || state.query, completed?.requirements || state.resultRequirements);
    else if (generationInFlight) { host.hidden = true; $('personal-result').hidden = false; }
    else draw();
  }
  function requirementSummary() {
    const known = state.explicitFacts?.length ? `搜索词中已明确\n${state.explicitFacts.map(fact => fact.value).join('、')}` : '';
    return [known, ...state.questions.flatMap((q, i) => state.answers[i].selected.includes('不限') ? [] : [`${questionTitle(q)}\n${state.answers[i].selected.map(v => v === '其他' ? state.answers[i].other : v).join('、')}`])].filter(Boolean).join('\n');
  }
  const progressPhases = ['requirements', 'searching', 'verifying', 'organizing'];
  const progressPhaseMap = { requirements: 0, searching: 1, retrying: 1, verifying: 2, organizing: 3, checking: 3 };
  let furthestProgressIndex = 0;
  let progressFill = [0, 0, 0, 0], progressTimer;
  function renderProgress() {
    const overall = Math.min(99, Math.round(progressFill.reduce((sum, value) => sum + value, 0) / 4));
    $('recommend-progress-count').textContent = `第 ${furthestProgressIndex + 1}/4 步 · ${overall}%`;
    $('recommend-progress-track').setAttribute('aria-valuenow', String(overall));
    $('recommend-progress-fill').style.width = `${overall}%`;
    progressPhases.forEach((name, index) => {
      const step = $(`recommend-step-${name}`), active = index === furthestProgressIndex, complete = index < furthestProgressIndex;
      step.className = `text-xs ${active ? 'font-medium text-teal-800' : complete ? 'text-teal-700' : 'text-slate-400'}`;
      if (active) step.setAttribute('aria-current', 'step'); else step.removeAttribute?.('aria-current');
    });
  }
  function startProgressGrowth() {
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      const current = progressFill[furthestProgressIndex], limit = furthestProgressIndex === 3 ? 94 : 88;
      if (current < limit) {
        progressFill[furthestProgressIndex] = Math.min(limit, current + Math.max(1, Math.ceil((limit - current) / 10)));
        renderProgress();
      }
    }, 700);
  }
  function updateProgress(phase, message) {
    const requestedIndex = progressPhaseMap[phase];
    if (Number.isInteger(requestedIndex) && requestedIndex > furthestProgressIndex) {
      for (let index = 0; index < requestedIndex; index++) progressFill[index] = 100;
      furthestProgressIndex = requestedIndex;
      progressFill[furthestProgressIndex] = Math.max(progressFill[furthestProgressIndex], 8);
    }
    $('recommend-progress-text').textContent = message;
    renderProgress();
    startProgressGrowth();
  }
  function showWaiting() {
    host.hidden = true; $('personal-result').hidden = false; $('insufficient').hidden = true; $('products-feedback').hidden = true;
    setNeedsSummary(requirementSummary());
    $('edit-needs').disabled = false; $('edit-needs').classList?.remove('opacity-50');
    $('recommend-progress').hidden = false;
    furthestProgressIndex = 0; progressFill = [8, 0, 0, 0];
    updateProgress('requirements', '正在整理你刚才确认的需求');
    showProductSkeletons($('products'));
  }
  async function recommend() {
    const version = ++recommendationVersion;
    recommendationController?.abort();
    const controller = new AbortController(); recommendationController = controller;
    const resultQuery = state.query;
    const resultRequirements = requirementSummary();
    editingNeeds = false; editBaseline = null; backgroundResult = null; delete state.result;
    resetNeedsEditLayout();
    delete state.resultRequirements;
    generationInFlight = true; error.hidden = true; status.textContent = ''; save(); showWaiting();
    const acceptResult = data => {
      if (version !== recommendationVersion) return;
      if (editingNeeds) { backgroundResult = { data, query: resultQuery, requirements: resultRequirements }; showResult(data, resultQuery, resultRequirements); }
      else { state.result = data; state.resultRequirements = resultRequirements; save(); showResult(data, resultQuery, resultRequirements); }
    };
    try { const result = await request('recommendations', event => {
      if (version !== recommendationVersion) return;
      if (event.type === 'progress') updateProgress(event.phase, event.message);
      else if (event.type === 'result') {
        const { type, ...data } = event;
        acceptResult(data);
      }
    }, controller.signal); acceptResult(result); }
    catch (e) {
      if (version !== recommendationVersion || e.name === 'AbortError') return;
      showError(e.message);
      if (!editingNeeds) { host.hidden = false; host.replaceChildren(button('重试推荐', recommend, true), button('调整需求', beginNeedsEdit), button('重新开始问答', loadQuestions)); }
    }
    finally {
      if (version !== recommendationVersion) return;
      clearInterval(progressTimer); generationInFlight = false; recommendationController = null; status.textContent = ''; $('recommend-progress').hidden = true; $('products').classList?.remove('skeleton-wave'); $('edit-needs').disabled = false; $('edit-needs').classList?.remove('opacity-50');
    }
  }

  $('edit-needs').addEventListener('click', beginNeedsEdit);
  if (landing) { host.hidden = true; error.hidden = true; $('personal-result').hidden = true; return; }
  if (query.length > 100) { showError('请输入1–100字的商品关键词。'); host.hidden = true; return; }
  updateTitle();
  try {
    const saved = JSON.parse(sessionStorage.getItem(key));
    const ids = Array.isArray(saved?.questions) ? saved.questions.map(q => q?.id).join(',') : '';
    const validStructure = ['q0', 'q1', '', 'q2', 'q3', 'q4', 'q2,q3', 'q2,q4', 'q3,q4', 'q2,q3,q4'].includes(ids);
    if (saved?.sessionId && validStructure && saved.questions.every(q => allowsMultiple(q) ? ['single', 'multiple'].includes(q.type) : q.type === 'single') && Array.isArray(saved.answers) && saved.answers.length === saved.questions.length && Array.isArray(saved.history) && Number.isInteger(saved.index) && saved.index >= 0 && saved.index <= saved.questions.length && typeof saved.query === 'string' && saved.query.trim()) state = saved;
  } catch {}
  updateTitle();
  if (state.sessionId) { if (state.result) showResult(); else draw(); } else loadQuestions();
})();

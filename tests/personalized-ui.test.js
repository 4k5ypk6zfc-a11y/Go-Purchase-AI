const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function createPage(fetchImpl, search = '?query=充电器') {
  const nodes = new Map(), storage = new Map();
  function node() {
    return {
      children: [], events: {}, value: '', textContent: '', hidden: false, disabled: false, attributes: {}, style: {}, className: '',
      classList: { add() {}, remove() {} },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      setAttribute(k, v) { this.attributes[k] = v; },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this[k] || this.attributes[k]; },
      addEventListener(k, fn) { this.events[k] = fn; }
    };
  }
  for (const id of ['interview-home', 'interview', 'personal-status', 'personal-error', 'personal-result', 'personal-discovery', 'needs-layout', 'needs-original', 'needs-summary', 'needs-editor', 'insufficient', 'products-feedback', 'products', 'personal-title', 'edit-needs', 'personal-search-toggle', 'personal-search-form', 'personal-search-input', 'recommend-progress', 'recommend-progress-text', 'recommend-progress-count', 'recommend-progress-track', 'recommend-progress-fill', 'recommend-step-requirements', 'recommend-step-searching', 'recommend-step-verifying', 'recommend-step-organizing']) nodes.set(id, node());
  nodes.get('personal-search-form').hidden = false;
  const document = { getElementById: id => nodes.get(id) || null, createElement: node, addEventListener() {} };
  const context = vm.createContext({
    document, URL, URLSearchParams, TextDecoder, Buffer, AbortController,
    setInterval: () => 1, clearInterval() {},
    location: { search, href: '' },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    fetch: fetchImpl
  });
  vm.runInContext(fs.readFileSync('public/script.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('public/personalized.js', 'utf8'), context);
  return { context, nodes };
}

const baseQuestions = [2, 3, 4].map(i => ({ id: `q${i}`, title: `需求${i}`, type: i >= 3 ? 'multiple' : 'single', options: ['选项甲', '选项乙', '选项丙'] }));
const q0 = { id: 'q0', title: '你要给什么产品充电？', type: 'single', options: ['手机充电器', '笔记本电脑充电器', '平板电脑充电器'] };
const q1 = { id: 'q1', title: '你想选哪种手机充电器？', type: 'single', options: ['无线手机充电器', '有线手机充电器', '车载手机充电器'] };
const optionLabels = (field, question) => field.children.slice(question?.id === 'q4' ? 2 : 1, -1);
const editorOptions = editor => editor.children.find(child => /space-y-1/.test(child.className));
const renderedText = node => node.children.length ? node.children.map(renderedText).join('') : node.textContent;

test('为你推荐搜索框保持展开并可提交新商品', async () => {
  const { context, nodes } = createPage(async () => ({ ok: true, json: async () => ({ sessionId: '11111111-1111-1111-1111-111111111111', originalQuery: '充电器', query: '充电器', narrowing: [], questions: [q0] }) }));
  await new Promise(resolve => setImmediate(resolve));
  const form = nodes.get('personal-search-form'), input = nodes.get('personal-search-input');
  assert.equal(form.hidden, false);
  input.value = '耳机';
  form.events.submit({ preventDefault() {} });
  assert.match(context.location.href, /^\/personalized\.html\?query=%E8%80%B3%E6%9C%BA&run=[a-z0-9]+$/);
});

test('右上角进入为你推荐时显示发现页，搜索后才启动问答', async () => {
  let calls = 0;
  const { nodes } = createPage(async () => { calls++; return { ok: true, json: async () => ({}) }; }, '');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
  assert.equal(nodes.get('personal-discovery').hidden, false);
  assert.equal(nodes.get('interview').hidden, true);
  assert.equal(nodes.get('personal-error').hidden, true);
});

test('页面按q0、q1、q2–q4分阶段收敛搜索词', async () => {
  const calls = []; let refineCount = 0;
  const fetch = async (_, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (body.stage === 'questions') return { ok: true, json: async () => ({ sessionId: '11111111-1111-1111-1111-111111111111', originalQuery: '充电器', query: '充电器', narrowing: [], questions: [q0] }) };
    refineCount++;
    return { ok: true, json: async () => refineCount === 1
      ? { sessionId: '22222222-2222-2222-2222-222222222222', originalQuery: '充电器', query: '手机充电器', narrowing: [{ id: 'q0', answer: '手机充电器' }], questions: [q1] }
      : { sessionId: '33333333-3333-3333-3333-333333333333', originalQuery: '充电器', query: '无线手机充电器', narrowing: [{ id: 'q0', answer: '手机充电器' }, { id: 'q1', answer: '无线手机充电器' }], questions: baseQuestions } };
  };
  const { nodes } = createPage(fetch);
  await new Promise(resolve => setImmediate(resolve));
  const host = nodes.get('interview');

  assert.equal(host.children[0].textContent, '第 1 题，约 3–5 题');
  assert.equal(host.children.length, 3);
  let field = host.children[1], labels = optionLabels(field, q0);
  assert.equal(labels.at(-2).children[1].textContent, '不限');
  assert.equal(labels.at(-1).children[1].textContent, '其他（需自行填写）');
  assert.equal(host.children[2].children[1].textContent, '下一步');
  labels[0].children[0].checked = true; labels[0].children[0].events.change();
  await host.children[2].children[1].events.click();
  assert.equal(nodes.get('personal-title').textContent, '帮你选更适合的「手机充电器」');
  assert.equal(host.children[0].textContent, '第 2 题，约 3–5 题');

  field = host.children[1]; labels = optionLabels(field, q1);
  assert.equal(labels.at(-2).children[1].textContent, '不限');
  assert.equal(labels.at(-1).children[1].textContent, '其他（需自行填写）');
  labels[0].children[0].checked = true; labels[0].children[0].events.change();
  await host.children[2].children[1].events.click();
  assert.equal(nodes.get('personal-title').textContent, '帮你选更适合的「无线手机充电器」');
  assert.equal(host.children[0].textContent, '第 3 题，共 5 题');
  assert.equal(host.children[1].children[0].textContent, '需求2');
  assert.deepEqual(calls.map(call => call.stage), ['questions', 'refine', 'refine']);
  assert.equal(calls[1].answers[0].selected[0], '手机充电器');
  assert.equal(calls[2].answers[0].selected[0], '无线手机充电器');

  let back = host.children[2].children[0];
  assert.equal(back.disabled, false);
  back.events.click();
  assert.equal(nodes.get('personal-title').textContent, '帮你选更适合的「手机充电器」');
  assert.equal(host.children[0].textContent, '第 2 题，约 3–5 题');
  assert.equal(host.children[1].children[0].textContent, q1.title);
  assert.equal(host.children[1].children[1].children[0].checked, true);
  back = host.children[2].children[0];
  assert.equal(back.disabled, false);
  back.events.click();
  assert.equal(nodes.get('personal-title').textContent, '帮你选更适合的「充电器」');
  assert.equal(host.children[0].textContent, '第 1 题，约 3–5 题');
  assert.equal(host.children[1].children[0].textContent, q0.title);
  assert.equal(host.children[1].children[1].children[0].checked, true);
});

test('调整需求可修改q0和q1，并重新逐题回答q2–q4', async () => {
  let refineCount = 0;
  const recommendationCalls = [];
  const updatedQ1 = { id: 'q1', title: '你想选哪种笔记本电脑充电器？', type: 'single', options: ['氮化镓充电器', '原装充电器', '多口充电器'] };
  const updatedBase = baseQuestions.map((question, index) => ({ ...question, title: `更新需求${index + 2}` }));
  const result = { summary: '需求摘要', source: 'personalized', sessionId: 'result-session', resultId: 'result-id', status: 'ok', products: [] };
  const fetch = async (_, options) => {
    const body = JSON.parse(options.body);
    if (body.stage === 'questions') return { ok: true, json: async () => ({ sessionId: '11111111-1111-1111-1111-111111111111', originalQuery: '充电器', query: '充电器', narrowing: [], questions: [q0] }) };
    if (body.stage === 'refine') {
      refineCount++;
      const responses = [
        { sessionId: '22222222-2222-2222-2222-222222222222', originalQuery: '充电器', query: '手机充电器', narrowing: [{ id: 'q0', answer: '手机充电器' }], questions: [q1] },
        { sessionId: '33333333-3333-3333-3333-333333333333', originalQuery: '充电器', query: '无线手机充电器', narrowing: [{ id: 'q0', answer: '手机充电器' }, { id: 'q1', answer: '无线手机充电器' }], questions: baseQuestions },
        { sessionId: '44444444-4444-4444-4444-444444444444', originalQuery: '充电器', query: '笔记本电脑充电器', narrowing: [{ id: 'q0', answer: '笔记本电脑充电器' }], questions: [updatedQ1] },
        { sessionId: '55555555-5555-5555-5555-555555555555', originalQuery: '充电器', query: '氮化镓充电器', narrowing: [{ id: 'q0', answer: '笔记本电脑充电器' }, { id: 'q1', answer: '氮化镓充电器' }], questions: updatedBase }
      ];
      return { ok: true, json: async () => responses[refineCount - 1] };
    }
    recommendationCalls.push(body);
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => result };
  };
  const { nodes } = createPage(fetch);
  await new Promise(resolve => setImmediate(resolve));
  const host = nodes.get('interview');
  let field = host.children[1];
  field.children[1].children[0].checked = true; field.children[1].children[0].events.change();
  await host.children[2].children[1].events.click();
  field = host.children[1];
  field.children[1].children[0].checked = true; field.children[1].children[0].events.change();
  await host.children[2].children[1].events.click();
  for (const question of baseQuestions) {
    field = host.children[1];
    const firstOption = optionLabels(field, question)[0].children[0]; firstOption.checked = true; firstOption.events.change();
    await host.children[2].children[1].events.click();
  }
  nodes.get('edit-needs').events.click();
  const summary = nodes.get('needs-summary');
  assert.equal(summary.children[0].children[0].children[0].textContent, q0.title);
  assert.equal(summary.children[1].children[0].children[0].textContent, q1.title);

  summary.children[0].children[1].events.click();
  let editor = nodes.get('needs-editor'), choices = editor.children[1].children;
  choices[1].children[0].checked = true; choices[1].children[0].events.change();
  await editor.children.at(-1).children[1].events.click();
  assert.equal(editor.children[0].textContent, updatedQ1.title);
  choices = editor.children[1].children;
  choices[0].children[0].checked = true; choices[0].children[0].events.change();
  await editor.children.at(-1).children[1].events.click();
  assert.equal(editor.children[0].textContent, updatedBase[0].title);

  for (let index = 0; index < updatedBase.length; index++) {
    choices = editorOptions(editor).children;
    choices[0].children[0].checked = true; choices[0].children[0].events.change();
    await editor.children.at(-1).children[1].events.click();
    if (index < updatedBase.length - 1) {
      const nextQuestion = updatedBase[index + 1];
      const expectedTitle = ['q3', 'q4'].includes(nextQuestion.id) ? `${nextQuestion.title}（可多选）` : nextQuestion.title;
      assert.equal(editor.children[0].textContent, expectedTitle);
      if (nextQuestion.id === 'q4') assert.equal(editor.children[1].textContent, '建议选择不超过 3 项，以获取更精准推荐');
    }
  }
  assert.equal(editor.hidden, true);
  await summary.children.at(-1).children[1].events.click();
  assert.equal(refineCount, 4);
  assert.equal(recommendationCalls.length, 2);
  assert.deepEqual(recommendationCalls[1].answers.map(answer => answer.id), ['q2', 'q3', 'q4']);
});

test('q0页面追加其他，填写后作为新搜索词继续判断', async () => {
  const calls = [];
  const fetch = async (_, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (body.stage === 'questions') return { ok: true, json: async () => ({ sessionId: '11111111-1111-1111-1111-111111111111', originalQuery: '包', query: '包', explicitFacts: [], narrowing: [], questions: [q0] }) };
    return { ok: true, json: async () => ({ sessionId: '22222222-2222-2222-2222-222222222222', originalQuery: '包', query: '相机包', explicitFacts: [], narrowing: [{ id: 'q0', answer: '相机包' }], questions: baseQuestions }) };
  };
  const { context, nodes } = createPage(fetch, '?query=包');
  await new Promise(resolve => setImmediate(resolve));
  const host = nodes.get('interview'), field = host.children[1], labels = optionLabels(field, q0), otherInput = field.children.at(-1);
  assert.equal(labels.at(-2).children[1].textContent, '不限');
  assert.equal(labels.at(-1).children[1].textContent, '其他（需自行填写）');
  labels.at(-1).children[0].checked = true; labels.at(-1).children[0].events.change();
  otherInput.value = '相机包'; otherInput.events.input();
  await host.children[2].children[1].events.click();
  assert.equal(calls[1].answers[0].selected[0], '其他');
  assert.equal(calls[1].answers[0].other, '相机包');
  assert.equal(nodes.get('personal-title').textContent, '帮你选更适合的「相机包」');
  assert.equal(context.location.href, '');
});

test('页面无q0/q1时完成q2–q4并只提交基础需求', async () => {
  const calls = [];
  const result = { summary: '需求摘要', source: 'personalized', sessionId: 'session', resultId: 'result', status: 'ok', products: [] };
  const fetch = async (_, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (body.stage === 'questions') return { ok: true, json: async () => ({ sessionId: '11111111-1111-1111-1111-111111111111', originalQuery: '月饼', query: '月饼', narrowing: [], questions: baseQuestions }) };
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => result };
  };
  const { nodes } = createPage(fetch, '?query=月饼');
  await new Promise(resolve => setImmediate(resolve));
  const host = nodes.get('interview');
  for (const [index, question] of baseQuestions.entries()) {
    const field = host.children[1], labels = optionLabels(field, question);
    assert.equal(labels.length, question.options.length + 2);
    assert.equal(labels.at(-1).children[1].textContent, '其他（需自行填写）');
    const expectedTitle = ['q3', 'q4'].includes(question.id) ? `${question.title}（可多选）` : question.title;
    assert.equal(field.children[0].textContent, expectedTitle);
    if (question.id === 'q4') assert.equal(field.children[1].textContent, '建议选择不超过 3 项，以获取更精准推荐');
    assert.equal(labels[0].children[0].type, question.id === 'q2' ? 'radio' : 'checkbox');
    labels[0].children[0].checked = true; labels[0].children[0].events.change();
    if (question.id !== 'q2') { labels[1].children[0].checked = true; labels[1].children[0].events.change(); }
    if (index === baseQuestions.length - 1) assert.equal(host.children[2].children[1].textContent, '生成推荐');
    await host.children[2].children[1].events.click();
  }
  const recommendation = calls.find(call => call.stage === 'recommendations');
  assert.deepEqual(recommendation.answers.map(answer => answer.id), ['q2', 'q3', 'q4']);
  assert.deepEqual(recommendation.answers[1].selected, ['选项甲', '选项乙']);
  assert.deepEqual(recommendation.answers[2].selected, ['选项甲', '选项乙']);
  assert.equal(recommendation.query, '月饼');
  assert.equal(recommendation.stream, true);
});

test('搜索词已有预算时页面只展示q3–q4并在摘要保留预算', async () => {
  const calls = [], remaining = baseQuestions.filter(q => q.id !== 'q2');
  const result = { summary: '约200元的耳机', source: 'personalized', sessionId: 'session', resultId: 'result', status: 'ok', products: [] };
  const fetch = async (_, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (body.stage === 'questions') return { ok: true, json: async () => ({ sessionId: '11111111-1111-1111-1111-111111111111', originalQuery: '200元耳机', query: '耳机', explicitFacts: [{ type: 'budget', value: '约200元', source: '200元' }], narrowing: [], questions: remaining }) };
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => result };
  };
  const { nodes } = createPage(fetch, '?query=200元耳机');
  await new Promise(resolve => setImmediate(resolve));
  const host = nodes.get('interview');
  assert.equal(host.children[1].children[0].textContent, '需求3（可多选）');
  for (const question of remaining) {
    const field = host.children[1], labels = optionLabels(field, question);
    labels[0].children[0].checked = true; labels[0].children[0].events.change();
    await host.children[2].children[1].events.click();
  }
  assert.match(renderedText(nodes.get('needs-summary')), /约200元/);
  assert.match(nodes.get('needs-summary').children[0].children[0].className, /needs-summary-question/);
  assert.deepEqual(calls.find(call => call.stage === 'recommendations').answers.map(answer => answer.id), ['q3', 'q4']);
});

test('生成中调整需求不中断原请求，点击重新生成后才取消并使用新答案', async () => {
  const recommendationCalls = [];
  const result = { summary: '新需求', source: 'personalized', sessionId: 'session-new', resultId: 'result-new', status: 'ok', products: [] };
  const fetch = async (_, options) => {
    const body = JSON.parse(options.body);
    if (body.stage === 'questions') return { ok: true, json: async () => ({ sessionId: '11111111-1111-1111-1111-111111111111', originalQuery: '月饼', query: '月饼', narrowing: [], questions: baseQuestions }) };
    recommendationCalls.push({ body, signal: options.signal });
    if (recommendationCalls.length === 1) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => {
      const error = new Error('aborted'); error.name = 'AbortError'; reject(error);
    }));
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => result };
  };
  const { nodes } = createPage(fetch, '?query=月饼');
  await new Promise(resolve => setImmediate(resolve));
  const host = nodes.get('interview');
  let firstGeneration;
  for (const [index, question] of baseQuestions.entries()) {
    const field = host.children[1], labels = optionLabels(field, question);
    labels[0].children[0].checked = true; labels[0].children[0].events.change();
    const next = host.children[2].children[1].events.click();
    if (index === baseQuestions.length - 1) firstGeneration = next;
    else await next;
  }
  assert.equal(nodes.get('edit-needs').disabled, false);
  nodes.get('edit-needs').events.click();
  assert.equal(recommendationCalls[0].signal.aborted, false);
  assert.equal(nodes.get('personal-result').hidden, false);
  assert.equal(nodes.get('needs-editor').hidden, true);
  assert.equal(nodes.get('needs-summary').children[0].children[1].textContent, '修改');
  assert.equal(nodes.get('edit-needs').hidden, true);

  nodes.get('needs-summary').children[0].children[1].events.click();
  assert.equal(nodes.get('needs-editor').hidden, false);
  assert.equal(nodes.get('needs-layout').className, 'needs-edit-layout');
  assert.equal(nodes.get('needs-editor').children[0].textContent, '需求2');
  assert.match(nodes.get('needs-editor').children[0].className, /text-lg/);
  const choices = nodes.get('needs-editor').children[1].children;
  assert.match(choices[0].className, /text-base/);
  choices[1].children[0].checked = true; choices[1].children[0].events.change();
  assert.equal(nodes.get('needs-summary').children[0].children[0].children[1].textContent, '选项乙');
  assert.doesNotMatch(nodes.get('needs-summary').children[0].className, /justify-between/);
  nodes.get('needs-editor').children.at(-1).children[1].events.click();
  assert.equal(nodes.get('needs-editor').hidden, true);
  nodes.get('needs-summary').children[1].children[1].events.click();
  assert.equal(nodes.get('needs-editor').children[0].textContent, '需求3（可多选）');
  const multiChoices = nodes.get('needs-editor').children[1].children;
  assert.equal(multiChoices[0].children[0].type, 'checkbox');
  assert.equal(multiChoices.at(-1).children[1].textContent, '其他（需自行填写）');
  multiChoices[1].children[0].checked = true; multiChoices[1].children[0].events.change();
  assert.equal(nodes.get('needs-summary').children[1].children[0].children[1].textContent, '选项甲、选项乙');
  nodes.get('needs-editor').children.at(-1).children[1].events.click();
  await nodes.get('needs-summary').children.at(-1).children[1].events.click();
  await firstGeneration;

  assert.equal(recommendationCalls[0].signal.aborted, true);
  assert.equal(recommendationCalls.length, 2);
  assert.equal(recommendationCalls[1].body.answers[0].selected[0], '选项乙');
  assert.deepEqual(recommendationCalls[1].body.answers[1].selected, ['选项甲', '选项乙']);
  assert.equal(renderedText(nodes.get('needs-summary')), '需求2选项乙需求3（可多选）选项甲、选项乙需求4（可多选）选项甲');
  assert.equal(nodes.get('needs-editor').hidden, true);
  assert.equal(nodes.get('edit-needs').hidden, false);
});

test('调整需求期间原推荐可正常完成，取消调整后保留原结果', async () => {
  let finishRecommendation;
  const oldResult = { summary: '原需求结果', source: 'personalized', sessionId: 'session-old', resultId: 'result-old', status: 'ok', products: [] };
  const fetch = async (_, options) => {
    const body = JSON.parse(options.body);
    if (body.stage === 'questions') return { ok: true, json: async () => ({ sessionId: '11111111-1111-1111-1111-111111111111', originalQuery: '月饼', query: '月饼', narrowing: [], questions: baseQuestions }) };
    return new Promise(resolve => { finishRecommendation = () => resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => oldResult }); });
  };
  const { nodes } = createPage(fetch, '?query=月饼');
  await new Promise(resolve => setImmediate(resolve));
  const host = nodes.get('interview');
  let generation;
  for (const [index, question] of baseQuestions.entries()) {
    const field = host.children[1], labels = optionLabels(field, question);
    labels[0].children[0].checked = true; labels[0].children[0].events.change();
    const next = host.children[2].children[1].events.click();
    if (index === baseQuestions.length - 1) generation = next;
    else await next;
  }
  const generatingRequirements = renderedText(nodes.get('needs-summary'));
  nodes.get('edit-needs').events.click();
  finishRecommendation(); await generation;
  assert.equal(host.hidden, true);
  assert.equal(nodes.get('personal-result').hidden, false);
  assert.equal(nodes.get('needs-summary').children[0].children[0].children[1].textContent, '选项甲');
  nodes.get('needs-summary').children.at(-1).children[0].events.click();
  assert.equal(host.hidden, true);
  assert.equal(renderedText(nodes.get('needs-summary')), generatingRequirements);
  assert.equal(nodes.get('needs-editor').hidden, true);
  assert.equal(nodes.get('edit-needs').hidden, false);
});

test('为你推荐展示八个专属反馈原因，选择其他后显示选填框', async () => {
  const feedback = [];
  const reasons = [
    '问题质量差',
    '推荐商品不是我想要的',
    '推荐等待时间过长',
    '商品/问题生成总是失败',
    '商品链接跳转失败',
    '商品链接与推荐内容不符',
    '商品疑似广告',
    '其他'
  ];
  const result = { summary: '需求摘要', source: 'personalized', sessionId: 'session-3', resultId: 'result-3', status: 'ok', products: [{ name: '商品', reason: '符合需求', pros: ['优点'], cons: ['缺点'], link: '#' }] };
  const fetch = async (_, options) => {
    const body = JSON.parse(options.body);
    if (body.stage === 'questions') return { ok: true, json: async () => ({ sessionId: '11111111-1111-1111-1111-111111111111', originalQuery: '耳机', query: '耳机', narrowing: [], questions: [] }) };
    if (body.stage === 'recommendations') return { ok: true, headers: { get: () => 'application/json' }, json: async () => result };
    feedback.push(body); return { ok: true };
  };
  const { nodes } = createPage(fetch, '?query=耳机');
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const [row, panel] = nodes.get('products-feedback').children;
  await row.children[2].events.click();
  const choices = panel.children[0].children.slice(1);
  assert.deepEqual(choices.map(label => label.children[1].textContent), reasons);
  assert.equal(choices.at(-1).children[2].hidden, true);
  choices.at(-1).children[0].events.change();
  assert.equal(choices.at(-1).children[2].hidden, false);
  await panel.children[1].children[1].events.click();
  assert.equal(feedback.at(-1).reason, '其他');
  assert.equal(feedback.at(-1).other, '');
});

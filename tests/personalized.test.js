const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const install = require('../personalized');
const { parseResult, callLLM } = require('../server');

const baseQuestions = [2, 3, 4].map(i => ({ id: `q${i}`, title: `需求${i}`, type: i >= 3 ? 'multiple' : 'single', options: ['选项甲', '选项乙', '选项丙', '选项丁'] }));
const q0 = { id: 'q0', title: '你要给什么产品充电？', type: 'single', options: ['手机充电器', '笔记本电脑充电器', '平板电脑充电器', '电动车充电器'] };
const q1 = { id: 'q1', title: '你想选哪种充电方式的手机充电器？', type: 'single', options: ['手机有线充电器', '手机无线充电器', '手机车载充电器'] };

function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
}

test('基础问题直接进入推荐，推荐使用最终搜索词和q2–q4', async () => {
  const original = { writeFile: fs.writeFile, readFile: fs.readFile, appendFile: fs.appendFile };
  const calls = [], records = []; let stored, handler;
  fs.writeFile = async (_, data) => { stored = data; };
  fs.readFile = async () => stored;
  fs.appendFile = async (_, line) => records.push(JSON.parse(line));
  const product = i => ({ name: `产品${i}`, referencePrice: `约¥${i}00–${i}99`, reason: '符合需求', pros: ['优点'], cons: ['缺点'], link: 'https://example.com' });
  install({ app: { post(_, h) { handler = h; } }, parseResult, productsPrompt: '', recordTiming: async () => {}, callLLM: async (...args) => {
    calls.push(args);
    return args[1] === 'guide' ? JSON.stringify(baseQuestions) : JSON.stringify({ summary: '符合需求', products: [1, 2, 3].map(product) });
  } });
  const request = async body => { const res = response(); await handler({ body }, res); return res; };
  try {
    const first = await request({ stage: 'questions', query: '月饼' });
    assert.equal(first.code, 200);
    assert.equal(first.data.query, '月饼');
    assert.deepEqual(first.data.questions.map(q => q.id), ['q2', 'q3', 'q4']);
    assert.equal(JSON.parse(calls[0][0]).phase, 'initial');
    assert.match(calls[0][5].prompt, /q0\/q1共同跳过条件/);
    assert.match(calls[0][5].prompt, /默认消费者只具备日常生活知识/);
    assert.match(calls[0][5].prompt, /大众消费者日常购买时普遍会做的分类/);
    assert.match(calls[0][5].prompt, /小白用户一眼就懂/);
    assert.match(calls[0][5].prompt, /已给出足够信息/);
    assert.match(calls[0][5].prompt, /缺少该细分会显著改变候选商品集合、关键筛选条件或最终推荐结论/);
    assert.match(calls[0][5].prompt, /尽量不出现q0和q1/);
    assert.match(calls[0][5].prompt, /细分该词对推荐结果作用不大/);
    assert.match(calls[0][5].prompt, /q3和q4的type必须为multiple/);
    assert.match(calls[0][5].prompt, /q4必须生成4–6个/);
    assert.match(calls[0][5].prompt, /q4.*不执行.*能3个就不要4个/);
    const answers = baseQuestions.map(q => ({ id: q.id, selected: ['q3', 'q4'].includes(q.id) ? ['选项甲', '选项乙'] : ['选项甲'], other: '' }));
    const body = { stage: 'recommendations', sessionId: first.data.sessionId, answers };
    assert.equal((await request({ ...body, answers: [] })).code, 400);
    assert.equal((await request({ ...body, answers: answers.map(answer => answer.id === 'q2' ? { ...answer, selected: ['选项甲', '选项乙'] } : answer) })).code, 400);
    const result = await request(body);
    assert.equal(result.code, 200);
    assert.equal(result.data.products.length, 3);
    assert.equal(JSON.parse(calls[1][0]).query, '月饼');
    assert.deepEqual(JSON.parse(calls[1][0]).requirements.find(item => item.answer.id === 'q3').answer.selected, ['选项甲', '选项乙']);
    assert.equal(records[0].query, '月饼');
    assert.deepEqual(records[0].questions.map(q => q.id), ['q2', 'q3', 'q4']);
  } finally { Object.assign(fs, original); }
});

test('为你推荐先锁定商品名单，再并行生成文案和筛选图片', async () => {
  const original = { writeFile: fs.writeFile, readFile: fs.readFile, appendFile: fs.appendFile };
  let stored, handler, detailsStarted = false, imageStarted = false;
  const calls = [], rankingLogs = [];
  fs.writeFile = async (_, data) => { stored = data; };
  fs.readFile = async () => stored;
  fs.appendFile = async () => {};
  const names = ['产品甲', '产品乙', '产品丙'];
  install({
    app: { post(_, h) { handler = h; } },
    parseResult,
    productsPrompt: '',
    recordTiming: async () => {},
    recordImageVisionEvaluations: async (requestId, evaluations) => rankingLogs.push({ requestId, evaluations }),
    enrichProductImages: async result => {
      imageStarted = true;
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(detailsStarted, true);
      return { products: result.products.map((product, index) => ({ ...product, imageUrl: `https://img.example.com/${index}.jpg`, imageCandidates: [`https://img.example.com/${index}.jpg`] })) };
    },
    callLLM: async (...args) => {
      calls.push(args);
      if (args[1] === 'guide') return JSON.stringify(baseQuestions);
      if (args[1] === 'products') return `以下是结果：\n${JSON.stringify({ status: 'ok', summary: '锁定需求', products: names.map((name, index) => ({ name, referencePrice: `￥${index + 1}00-${index + 1}99元` })) })}`;
      assert.equal(args[1], 'product-details');
      assert.equal(args[5].webSearch, false);
      detailsStarted = true;
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(imageStarted, true);
      return `\`\`\`json\n${JSON.stringify({ products: names.map((name, index) => ({ name, referencePrice: `${index + 1}00～${index + 1}99元`, reason: '符合需求', pros: ['优点一', '优点二'], cons: ['缺点一', '缺点二'], link: '' })) })}\n\`\`\``;
    }
  });
  const request = async body => { const res = response(); await handler({ body }, res); return res; };
  try {
    const first = await request({ stage: 'questions', query: '耳机' });
    const answers = baseQuestions.map(question => ({ id: question.id, selected: ['选项甲'], other: '' }));
    const result = await request({ stage: 'recommendations', sessionId: first.data.sessionId, answers });
    assert.equal(result.code, 200);
    assert.deepEqual(calls.map(call => call[1]), ['guide', 'products', 'product-details']);
    assert.match(calls[1][5].prompt, /先只确定.*商品名单/);
    assert.deepEqual(result.data.products.map(product => product.name), names);
    assert.deepEqual(result.data.products.map(product => product.referencePrice), names.map((_, index) => `约¥${index + 1}00–${index + 1}99`));
    assert.deepEqual(result.data.products.map(product => product.imageUrl), names.map((_, index) => `https://img.example.com/${index}.jpg`));
    assert.equal(result.data.source, 'personalized');
    assert.equal(rankingLogs.length, 1);
  } finally { Object.assign(fs, original); }
});

test('q0和q1依次产生新搜索词，然后才生成q2–q4', async () => {
  const original = { writeFile: fs.writeFile, readFile: fs.readFile, appendFile: fs.appendFile };
  const sessions = new Map(), calls = [], records = []; let handler;
  fs.writeFile = async (p, data) => { sessions.set(String(p), data); };
  fs.readFile = async p => sessions.get(String(p));
  fs.appendFile = async (_, line) => records.push(JSON.parse(line));
  let guideCall = 0;
  install({ app: { post(_, h) { handler = h; } }, parseResult, productsPrompt: '', recordTiming: async () => {}, callLLM: async (...args) => {
    calls.push(args);
    if (args[1] === 'products') return JSON.stringify({ status: 'insufficient', summary: '无线手机充电器', message: '商品不足', products: [] });
    guideCall++;
    return JSON.stringify(guideCall === 1 ? [q0] : guideCall === 2 ? [q1] : baseQuestions);
  } });
  const request = async body => { const res = response(); await handler({ body }, res); return res; };
  try {
    const first = await request({ stage: 'questions', query: '充电器' });
    assert.deepEqual(first.data.questions.map(q => q.id), ['q0']);
    const afterQ0 = await request({ stage: 'refine', sessionId: first.data.sessionId, answers: [{ id: 'q0', selected: ['手机充电器'], other: '' }] });
    assert.equal(afterQ0.code, 200);
    assert.equal(afterQ0.data.query, '手机充电器');
    assert.deepEqual(afterQ0.data.questions.map(q => q.id), ['q1']);
    assert.deepEqual(JSON.parse(calls[1][0]), { originalQuery: '充电器', query: '手机充电器', explicitFacts: [], phase: 'after_q0' });
    assert.match(calls[1][5].prompt, /全新、独立/);
    assert.match(calls[1][5].prompt, /所有当前搜索词都必须|必须.*q1可分类性判断/);
    assert.match(calls[1][5].prompt, /q0只确认了一级商品或人群，不能单独作为跳过q1的理由/);
    assert.match(calls[1][5].prompt, /新query已给出足够信息/);
    assert.match(calls[1][5].prompt, /继续细分对推荐结果作用不大/);
    assert.match(calls[1][5].prompt, /则必须跳过q1/);
    assert.match(calls[1][5].prompt, /缺少这种信息会大幅降低推荐质量并导致推荐偏差/);
    assert.match(calls[1][5].prompt, /不能为了分类而分类/);
    assert.match(calls[1][5].prompt, /不需要再询问消费者需要几寸行李箱/);
    assert.match(calls[1][5].prompt, /主体\/部件\/附件.*单品\/套装\/组合装/);
    assert.match(calls[1][5].prompt, /消费者最熟悉、最常使用的搜索词/);
    assert.match(calls[1][5].prompt, /题目提问方式应当是消费场景下会使用的提问方式/);
    assert.doesNotMatch(calls[1][5].prompt, /兼容性优先/);
    assert.doesNotMatch(calls[1][5].prompt, /品牌、型号、操作系统、接口、尺寸、容量或重量不再/);
    assert.match(calls[1][5].prompt, /大多数购买者真的会问吗/);
    assert.match(calls[1][5].prompt, /高频使用场景/);
    assert.match(calls[1][5].prompt, /最常被比较/);
    assert.match(calls[1][5].prompt, /能3个就不要4个，能4个就不要5个/);
    assert.match(calls[1][5].prompt, /只保留常规购物中最核心、最高频/);
    assert.match(calls[1][5].prompt, /如果当前有4或5个选项/);
    const afterQ1 = await request({ stage: 'refine', sessionId: afterQ0.data.sessionId, answers: [{ id: 'q1', selected: ['手机无线充电器'], other: '' }] });
    assert.equal(afterQ1.code, 200);
    assert.equal(afterQ1.data.query, '手机无线充电器');
    assert.deepEqual(afterQ1.data.questions.map(q => q.id), ['q2', 'q3', 'q4']);
    assert.deepEqual(JSON.parse(calls[2][0]), { originalQuery: '充电器', query: '手机无线充电器', explicitFacts: [], phase: 'after_q1' });
    assert.deepEqual(afterQ1.data.narrowing.map(item => item.answer), ['手机充电器', '手机无线充电器']);
    const answers = baseQuestions.map(q => ({ id: q.id, selected: ['选项甲'], other: '' }));
    const result = await request({ stage: 'recommendations', sessionId: afterQ1.data.sessionId, answers });
    assert.equal(result.code, 200);
    assert.equal(JSON.parse(calls[3][0]).query, '手机无线充电器');
    assert.equal(records[0].originalQuery, '充电器');
    assert.equal(records[0].query, '手机无线充电器');
  } finally { Object.assign(fs, original); }
});

test('q1的其他输入作为新搜索词', async () => {
  const original = { writeFile: fs.writeFile, readFile: fs.readFile, appendFile: fs.appendFile };
  let stored, handler, guideCall = 0;
  fs.writeFile = async (_, data) => { stored = data; };
  fs.readFile = async () => stored;
  fs.appendFile = async () => {};
  install({ app: { post(_, h) { handler = h; } }, productsPrompt: '', recordTiming: async () => {}, callLLM: async () => JSON.stringify(++guideCall === 1 ? [q1] : baseQuestions) });
  const request = async body => { const res = response(); await handler({ body }, res); return res; };
  try {
    const first = await request({ stage: 'questions', query: '耳机' });
    const refined = await request({ stage: 'refine', sessionId: first.data.sessionId, answers: [{ id: 'q1', selected: ['其他'], other: '开放式耳机' }] });
    assert.equal(refined.code, 200);
    assert.equal(refined.data.query, '开放式耳机');
    assert.deepEqual(refined.data.questions.map(q => q.id), ['q2', 'q3', 'q4']);
  } finally { Object.assign(fs, original); }
});

test('不限不改写搜索词，也不作为推荐筛选条件', async () => {
  const original = { writeFile: fs.writeFile, readFile: fs.readFile, appendFile: fs.appendFile };
  let stored, handler, guideCall = 0; const calls = [];
  fs.writeFile = async (_, data) => { stored = data; };
  fs.readFile = async () => stored;
  fs.appendFile = async () => {};
  const product = i => ({ name: `产品${i}`, referencePrice: `约¥${i}00–${i}99`, reason: '符合需求', pros: ['优点'], cons: ['缺点'], link: 'https://example.com' });
  install({ app: { post(_, h) { handler = h; } }, parseResult, productsPrompt: '', recordTiming: async () => {}, callLLM: async (...args) => {
    calls.push(args);
    if (args[1] === 'products') return JSON.stringify({ summary: '手机充电器', products: [1, 2, 3].map(product) });
    return JSON.stringify(++guideCall === 1 ? [q1] : baseQuestions);
  } });
  const request = async body => { const res = response(); await handler({ body }, res); return res; };
  try {
    const first = await request({ stage: 'questions', query: '手机充电器' });
    const refined = await request({ stage: 'refine', sessionId: first.data.sessionId, answers: [{ id: 'q1', selected: ['不限'], other: '' }] });
    assert.equal(refined.code, 200);
    assert.equal(refined.data.query, '手机充电器');
    assert.deepEqual(refined.data.narrowing, []);
    const answers = [
      { id: 'q2', selected: ['不限'], other: '' },
      { id: 'q3', selected: ['选项甲'], other: '' },
      { id: 'q4', selected: ['不限'], other: '' }
    ];
    const result = await request({ stage: 'recommendations', sessionId: refined.data.sessionId, answers });
    assert.equal(result.code, 200);
    const productInput = JSON.parse(calls.at(-1)[0]);
    assert.deepEqual(productInput.requirements.map(item => item.question), ['需求3']);
    assert.doesNotMatch(JSON.stringify(productInput.requirements), /不限/);
  } finally { Object.assign(fs, original); }
});

test('q1不再使用固定词语黑名单拦截选项', async () => {
  const original = { writeFile: fs.writeFile, readFile: fs.readFile, appendFile: fs.appendFile, mkdir: fs.mkdir };
  let stored, handler, guideCall = 0; const corrections = [];
  fs.mkdir = async () => {};
  fs.writeFile = async (_, data) => { stored = data; };
  fs.readFile = async () => stored;
  fs.appendFile = async () => {};
  const overlapping = { ...q1, title: '你需要哪种充电方式的手机充电器？', options: ['手机有线充电器', '手机无线充电器', '手机磁吸无线充电器'] };
  install({ app: { post(_, h) { handler = h; } }, productsPrompt: '', recordTiming: async () => {}, callLLM: async (...args) => { corrections.push(args[2]); return JSON.stringify(++guideCall === 1 ? [overlapping] : [q1]); } });
  try {
    const res = response();
    await handler({ body: { stage: 'questions', query: '手机充电器' } }, res);
    assert.equal(res.code, 200);
    assert.equal(guideCall, 1);
    assert.deepEqual(res.data.questions.map(question => question.id), ['q1']);
    assert.equal(corrections[0], '');
  } finally { Object.assign(fs, original); }
});

test('搜索词已有预算时分类不重复价格，省略q2且推荐保留预算', async () => {
  const original = { writeFile: fs.writeFile, readFile: fs.readFile, appendFile: fs.appendFile };
  let stored, handler, guideCall = 0; const calls = [], records = [];
  fs.writeFile = async (_, data) => { stored = data; };
  fs.readFile = async () => stored;
  fs.appendFile = async (_, line) => records.push(JSON.parse(line));
  const remaining = baseQuestions.filter(q => q.id !== 'q2');
  install({ app: { post(_, h) { handler = h; } }, parseResult, productsPrompt: '', recordTiming: async () => {}, callLLM: async (...args) => {
    calls.push(args);
    if (args[1] === 'products') return JSON.stringify({ status: 'insufficient', summary: '约200元的有线耳机', message: '商品不足', products: [] });
    return JSON.stringify(++guideCall === 1 ? [{ ...q1, title: '你需要哪种连接方式的耳机？', options: ['有线耳机', '蓝牙耳机', '2.4G无线耳机'] }] : remaining);
  } });
  const request = async body => { const res = response(); await handler({ body }, res); return res; };
  try {
    const first = await request({ stage: 'questions', query: '200元耳机' });
    assert.equal(first.code, 200);
    assert.equal(first.data.query, '耳机');
    assert.deepEqual(first.data.explicitFacts, [{ type: 'budget', value: '约200元', source: '200元' }]);
    assert.deepEqual(first.data.questions.map(q => q.id), ['q1']);
    assert.doesNotMatch(first.data.questions[0].options.join('|'), /200|元/);
    const refined = await request({ stage: 'refine', sessionId: first.data.sessionId, answers: [{ id: 'q1', selected: ['有线耳机'], other: '' }] });
    assert.equal(refined.data.query, '有线耳机');
    assert.deepEqual(refined.data.questions.map(q => q.id), ['q3', 'q4']);
    assert.deepEqual(refined.data.explicitFacts, first.data.explicitFacts);
    const answers = remaining.map(q => ({ id: q.id, selected: ['选项甲'], other: '' }));
    const result = await request({ stage: 'recommendations', sessionId: refined.data.sessionId, answers });
    assert.equal(result.code, 200);
    const recommendationInput = JSON.parse(calls.at(-1)[0]);
    assert.equal(recommendationInput.originalQuery, '200元耳机');
    assert.equal(recommendationInput.query, '有线耳机');
    assert.deepEqual(recommendationInput.explicitFacts, first.data.explicitFacts);
    assert.deepEqual(records[0].explicitFacts, first.data.explicitFacts);
  } finally { Object.assign(fs, original); }
});

test('题目解析兼容顶层数组和旧questions包装，严格限制各阶段', () => {
  assert.equal(install.parseQuestions(JSON.stringify(baseQuestions), '月饼').length, 3);
  assert.equal(install.parseQuestions(JSON.stringify({ questions: baseQuestions }), '月饼').length, 3);
  assert.equal(install.parseQuestions(JSON.stringify([q0]), '充电器').length, 1);
  assert.equal(install.parseQuestions(JSON.stringify([q1]), '充电器').length, 1);
  assert.equal(install.parseQuestions(JSON.stringify([q1]), '手机充电器', 'after_q0').length, 1);
  assert.equal(install.parseQuestions(JSON.stringify(baseQuestions), '手机充电器', 'after_q0').length, 3);
  assert.equal(install.parseQuestions(JSON.stringify([q0]), '手机充电器').length, 1);
  assert.equal(install.parseQuestions(JSON.stringify([{ ...q0, options: ['女士上装', '女士裙装', '女士裤装'] }]), '女装').length, 1);
  assert.throws(() => install.parseQuestions(JSON.stringify([{ ...q1, options: q1.options.slice(0, 2) }]), '手机充电器', 'after_q0'), /3–5个/);
  assert.equal(install.parseQuestions(JSON.stringify([{ ...q1, title: '需要确认的充电器类型' }]), '手机充电器', 'after_q0').length, 1);
  assert.equal(install.parseQuestions(JSON.stringify([{ ...q1, title: '你需要哪种箱体类型的行李箱？', options: ['登机箱', '托运箱', '短途旅行箱'] }]), '行李箱', 'after_q0').length, 1);
  const merchantSkuSplit = { ...q1, title: '你想买哪种商品组合？', options: ['充电头', '数据线', '充电器套装'] };
  assert.throws(() => install.parseQuestions(JSON.stringify([merchantSkuSplit]), '手机充电器', 'after_q0'), /完整商品拆成/);
  const parentAndChild = { ...q1, title: '你需要哪种充电方式的手机充电器？', options: ['手机有线充电器', '手机无线充电器', '手机磁吸无线充电器'] };
  assert.equal(install.parseQuestions(JSON.stringify([parentAndChild]), '手机充电器', 'after_q0').length, 1);
  const mixedDimension = { ...q1, title: '你需要哪种充电方式的手机充电器？', options: ['手机有线充电器', '手机无线充电器', '手机车载充电器'] };
  assert.equal(install.parseQuestions(JSON.stringify([mixedDimension]), '手机充电器', 'after_q0').length, 1);
  const performanceGrades = { ...q1, title: '你需要按充电功率区分的哪种手机充电器？', options: ['手机普通充电器', '手机快充充电器', '手机超级快充充电器'] };
  assert.throws(() => install.parseQuestions(JSON.stringify([performanceGrades]), '手机充电器', 'after_q0'), /专业|功率|规格/);
  const obscureLuggageMaterials = { id: 'q1', title: '你需要哪种箱体材质的行李箱？', type: 'single', options: ['PC行李箱', '铝框行李箱', '帆布行李箱', '牛津布行李箱'] };
  assert.throws(() => install.parseQuestions(JSON.stringify([obscureLuggageMaterials]), '行李箱', 'after_q0'), /专业|材质|规格/);
  const luggageSizes = { id: 'q1', title: '你需要多大尺寸的行李箱？', type: 'single', options: ['20寸行李箱', '24寸行李箱', '28寸行李箱'] };
  assert.throws(() => install.parseQuestions(JSON.stringify([luggageSizes]), '行李箱', 'after_q0'), /专业|尺寸|规格/);
  const phoneBrands = { id: 'q1', title: '你想选哪个品牌的手机？', type: 'single', options: ['苹果手机', '华为手机', '小米手机'] };
  assert.throws(() => install.parseQuestions(JSON.stringify([phoneBrands]), '手机'), /专业|品牌|规格/);
  const chargerPower = { id: 'q1', title: '你需要多大功率的笔记本电脑充电器？', type: 'single', options: ['45W笔记本电脑充电器', '65W笔记本电脑充电器', '100W笔记本电脑充电器'] };
  assert.throws(() => install.parseQuestions(JSON.stringify([chargerPower]), '笔记本电脑充电器', 'after_q0'), /专业|功率|参数/);
  const scenarioCategory = { id: 'q1', title: '你主要用在哪种场景？', type: 'single', options: ['日常家用', '出差携带', '户外使用'] };
  assert.throws(() => install.parseQuestions(JSON.stringify([scenarioCategory]), '行李箱', 'after_q0'), /使用场景/);
  const bundledSizeAndNeeds = [{ id: 'q1', title: '你需要按什么尺寸选择被套？', type: 'single', options: ['单人被套', '双人被套', '加大双人被套'] }, ...baseQuestions];
  assert.throws(() => install.parseQuestions(JSON.stringify(bundledSizeAndNeeds), '被套'), /只允许单独q0/);
  const obscureMaterial = { id: 'q1', title: '你需要哪种材质的床单？', type: 'single', options: ['纯棉床单', '磨毛床单', '天丝床单', '亚麻床单', '涤棉床单'] };
  assert.throws(() => install.parseQuestions(JSON.stringify([obscureMaterial]), '床单'), /专业|材质|规格/);
  const onlyTwoCommonMaterials = { ...obscureMaterial, options: ['纯棉床单', '亚麻床单', '磨毛床单', '天丝床单'] };
  assert.throws(() => install.parseQuestions(JSON.stringify([onlyTwoCommonMaterials]), '床单'), /专业|材质|规格/);
  const rareScenes = baseQuestions.map(q => q.id === 'q3' ? { ...q, options: ['日常家用', '夏季凉睡', '婚房布置', '租房备用'] } : q);
  assert.equal(install.parseQuestions(JSON.stringify(rareScenes), '天丝床单', 'after_q1').length, 3);
  const commercialScenes = baseQuestions.map(q => q.id === 'q3' ? { ...q, options: ['日常家用', '租房使用', '学生宿舍', '酒店民宿'] } : q);
  assert.equal(install.parseQuestions(JSON.stringify(commercialScenes), '纯棉床单', 'after_q1').length, 3);
  assert.throws(() => install.parseQuestions(JSON.stringify([q0]), '手机充电器', 'after_q0'), /q0确认后/);
  assert.throws(() => install.parseQuestions(JSON.stringify([q1]), '耳机', 'after_q1'), /q1确认后/);
  assert.equal(install.parseQuestions(JSON.stringify(baseQuestions), '无线手机充电器', 'after_q1').length, 3);
  assert.throws(() => install.parseQuestions('[]', '床单'), /不得省略q2/);
  assert.deepEqual(install.parseQuestions(JSON.stringify(baseQuestions.filter(q => q.id !== 'q2')), '有线耳机', 'after_q1', [{ type: 'budget', value: '约200元' }]).map(q => q.id), ['q3', 'q4']);
  assert.throws(() => install.parseQuestions(JSON.stringify(baseQuestions), '有线耳机', 'after_q1', [{ type: 'budget', value: '约200元' }]), /省略q2/);
  assert.throws(() => install.parseQuestions(JSON.stringify([q0, q1]), '充电器'), /只允许单独q0/);
});

test('从原始搜索词提取并标准化明确预算', () => {
  assert.deepEqual(install.extractExplicitFacts('200元耳机'), [{ type: 'budget', value: '约200元', source: '200元' }]);
  assert.deepEqual(install.extractExplicitFacts('预算300元以内的键盘'), [{ type: 'budget', value: '不超过300元', source: '300元以内' }]);
  assert.deepEqual(install.extractExplicitFacts('500-800元手机'), [{ type: 'budget', value: '500–800元', source: '500-800元' }]);
  assert.deepEqual(install.extractExplicitFacts('蓝牙耳机'), []);
  assert.equal(install.productQueryFrom('200元耳机', install.extractExplicitFacts('200元耳机')), '耳机');
  assert.equal(install.productQueryFrom('预算300元以内的键盘', install.extractExplicitFacts('预算300元以内的键盘')), '键盘');
});

test('基础题数量和重复选项规则继续生效', () => {
  const parse = items => install.parseQuestions(JSON.stringify(items), '月饼');
  const withCounts = (regularCount, q4Count) => baseQuestions.map(q => ({ ...q, options: Array.from({ length: q.id === 'q4' ? q4Count : regularCount }, (_, i) => String(i)) }));
  for (const regularCount of [3, 5]) assert.equal(parse(withCounts(regularCount, 4)).length, 3);
  assert.equal(parse(withCounts(3, 6)).length, 3);
  assert.throws(() => parse(withCounts(6, 4)));
  assert.throws(() => parse(withCounts(3, 3)), /q4必须提供4–6个/);
  assert.throws(() => parse(withCounts(3, 7)), /q4必须提供4–6个/);
  assert.throws(() => parse(baseQuestions.map(q => ({ ...q, options: q.id === 'q4' ? ['甲', '乙', '丙', '丁'] : ['甲', '乙'] }))));
  assert.throws(() => parse(baseQuestions.map(q => ({ ...q, options: ['口味口感', ' 口味口感 ', '包装'] }))));
  const commonFormFactors = { id: 'q1', title: '你想选哪种佩戴形式的耳机？', type: 'single', options: ['真无线耳机', '颈挂式耳机', '头戴式耳机'] };
  assert.equal(install.parseQuestions(JSON.stringify([commonFormFactors]), '耳机').length, 1);
  const tea = baseQuestions.map(q => q.id === 'q2' ? { ...q, options: ['100元以下', '100–299元', '300元及以上'] } : q);
  assert.throws(() => install.parseQuestions(JSON.stringify(tea), '茶叶'), /继续细分/);
});

test('AI调用出题不联网，推荐必须完成联网查询', async () => {
  const original = global.fetch, key = process.env.ARK_API_KEY; process.env.ARK_API_KEY = 'test';
  const bodies = []; let completed = false;
  global.fetch = async (_, options) => { bodies.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => ({ status: 'completed', output: [...(completed ? [{ type: 'web_search_call', status: 'completed' }] : []), { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{}' }] }] }) }; };
  try {
    await callLLM('耳机', 'guide', '', {}, undefined, { model: 'ep-20261002233434-8r6sp', prompt: '出题' });
    assert.equal(bodies[0].tools, undefined);
    await assert.rejects(callLLM('耳机', 'products', '', {}, undefined, { model: 'ep-20260915155530-5plkq', prompt: '推荐' }), /联网/);
    completed = true;
    await callLLM('耳机', 'products', '', {}, undefined, { model: 'ep-20260915155530-5plkq', prompt: '推荐' });
    assert.deepEqual(bodies[2].tools, [{ type: 'web_search' }]);
  } finally { global.fetch = original; if (key === undefined) delete process.env.ARK_API_KEY; else process.env.ARK_API_KEY = key; }
});

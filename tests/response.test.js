const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { app, parseResult, repairProductDetails, imageResultScore, selectProductImageCandidates, rankProductImagesWithVision, enrichPopularProductImages } = require('../server');
const products = Array.from({ length: 3 }, () => ({ name: '商品', reason: '理由', pros: ['优点'], cons: ['缺点'], link: '#' }));

test('兼容真实单引号响应且保留转义和正文引号', async () => {
  const original = JSON.stringify({ products: [...products, products[0], products[1], products[2]] }).replaceAll('"', "'");
  assert.equal(parseResult(original, 'products').products.length, 6);
  assert.equal(parseResult(String.raw`{'guideContent': 'It\'s "good" {ok}\n路径\\目录\u4e2d'}`, 'guide').guideContent, 'It\'s "good" {ok}\n路径\\目录中');
  assert.equal(parseResult('```json\n{"guideContent":"正常的双引号 JSON"}\n```', 'guide').guideContent, '正常的双引号 JSON');
});

test('拒绝可执行表达式、截断数据和不合格商品', () => {
  for (const text of ["{'guideContent': process.exit()}", "{'guideContent': '截断", "{'guideContent': '\\x41'}"])
    assert.throws(() => parseResult(text, 'guide'));
  assert.throws(() => parseResult(JSON.stringify({ products: products.slice(0, 2) }), 'products'));
  assert.throws(() => parseResult(JSON.stringify({ products: [...products, ...products, products[0]] }), 'products'));
  assert.throws(() => parseResult(JSON.stringify({ products: products.map(p => ({ ...p, cons: [] })) }), 'products'));
});

test('所有推荐只清理商品标题中的尺寸，保留理由里的尺寸说明和型号数字', () => {
  const sized = [
    { ...products[0], name: '惠普战66 七代 14英寸', reason: '14英寸机身便于携带' },
    { ...products[0], name: '旅行箱 24寸' },
    { ...products[0], name: '双人床 1.8米' },
    { ...products[0], name: '冲锋衣 XL码' },
    { ...products[0], name: 'iPhone 16' }
  ];
  const result = parseResult(JSON.stringify({ products: sized }), 'products');
  assert.deepEqual(result.products.map(item => item.name), ['惠普战66 七代', '旅行箱', '双人床', '冲锋衣', 'iPhone 16']);
  assert.equal(result.products[0].reason, '14英寸机身便于携带');
});

test('后端只修复可验证的商品文案结构，不编造缺失内容', () => {
  const names = ['商品A', '商品B', '商品C', '商品D'];
  const repaired = repairProductDetails(`\`\`\`json\n${JSON.stringify({ products: [
    { name: '商品A', recommendationReason: '理由A', advantages: '优点1；优点2', cautions: ['缺点1'] },
    { name: '商品B', reason: '理由B', pros: ['优点'], cons: '缺点1|缺点2' },
    { name: '商品C', '推荐理由': '理由C', '优点': ['优点'], '注意事项': ['缺点'] },
    { name: '商品D', reason: '', pros: [], cons: [] }
  ] })}\n\`\`\`` , names);
  assert.deepEqual(repaired.products.map(item => item.name), names.slice(0, 3));
  assert.deepEqual(repaired.products[0].pros, ['优点1', '优点2']);
  assert.equal(repaired.products[0].link, 'https://search.jd.com/Search?keyword=%E5%95%86%E5%93%81A');
  assert.throws(() => repairProductDetails(JSON.stringify({ products: [{ name: '商品A' }] }), names), /无法安全修复/);
});

test('Serper候选不按像素大小排序，优先匹配和简洁商品图，搜图失败不阻断推荐', async () => {
  const images = [
    { position: 1, imageUrl: 'https://brand.example.com/official-small.jpg', imageWidth: 260, imageHeight: 220, title: '测试品牌 测试型号 官方白底产品图', source: '测试品牌官网' },
    { position: 4, imageUrl: 'https://studio.example.com/huge.jpg', thumbnailUrl: 'https://images.example.com/cache/huge.jpg', imageWidth: 5000, imageHeight: 4000, title: '测试品牌 测试型号 评测海报水印', source: '摄影素材站' }
  ];
  assert.equal(selectProductImageCandidates(images, '测试品牌 测试型号')[0], 'https://brand.example.com/official-small.jpg');
  const fetched = [];
  const result = await enrichPopularProductImages({ products: [{ name: '测试品牌 测试型号' }, { name: '搜图失败商品' }] }, {
    apiKey: 'test-serp-key',
    visionApiKey: '',
    fetchImpl: async (url, options) => {
      fetched.push(String(url));
      const request = JSON.parse(options.body);
      assert.equal(url, 'https://google.serper.dev/images');
      assert.equal(options.headers['X-API-KEY'], 'test-serp-key');
      if (request.q === '搜图失败商品') throw new TypeError('network failure');
      assert.equal(request.q, '测试品牌 测试型号');
      return { ok: true, json: async () => ({ images }) };
    }
  });
  assert.equal(fetched.length, 2);
  assert.equal(result.products[0].imageUrl, 'https://brand.example.com/official-small.jpg');
  assert.ok(result.products[0].imageCandidates.length >= 2);
  assert.equal(result.products[1].imageUrl, null);
  assert.deepEqual(result.products[1].imageCandidates, []);
});

test('Serper候选粗排使用调整后的来源与文字权重', () => {
  const productName = '测试品牌 测试型号';
  assert.equal(imageResultScore({ in_stock: true }, productName), 0);
  assert.equal(imageResultScore({ is_product: true }, productName), 6);
  assert.equal(imageResultScore({ source: '测试品牌官网' }, productName), 10);
  assert.equal(imageResultScore({ title: '测试品牌 测试型号 官方发布', source: '普通媒体' }, productName), 24);
  assert.equal(imageResultScore({ title: '测试品牌 测试型号 白底商品图', source: '测试品牌旗舰店', is_product: true }, productName), 46);
  assert.equal(imageResultScore({ title: '测试品牌 测试型号 广告海报' }, productName), 9);
  assert.equal(imageResultScore({ title: 'abcdef accessory' }, 'abcdef full'), 10);
});

test('热门商品复用同一EP进行视觉筛图并淘汰海报和局部特写', async () => {
  const candidates = ['https://img.example.com/poster.jpg', 'https://img.example.com/product.jpg', 'https://img.example.com/detail.jpg'];
  let request;
  const usage = {};
  const evaluations = [];
  const ranked = await rankProductImagesWithVision('测试商品 完整型号', candidates, {
    apiKey: 'test-ark-key',
    model: 'test-products-ep',
    usage,
    evaluations,
    validateFetchImpl: async () => ({ ok: true, headers: { get: () => 'image/jpeg' } }),
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://ark.cn-beijing.volces.com/api/v3/responses');
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({
        status: 'completed',
        usage: { input_tokens: 321, output_tokens: 45, total_tokens: 366 },
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ results: [
          { index: 0, accepted: false, score: 5, reason: '宣传海报' },
          { index: 1, accepted: true, score: 96, reason: '完整商品白底图' },
          { index: 2, accepted: false, score: 20, reason: '局部特写' }
        ] }) }] }]
      }) };
    }
  });
  assert.equal(request.model, 'test-products-ep');
  assert.equal(request.tools, undefined);
  assert.equal(request.input[0].content.filter(item => item.type === 'input_image').length, 3);
  assert.deepEqual(ranked, ['https://img.example.com/product.jpg']);
  assert.deepEqual(usage, { calls: 1, inputTokens: 321, outputTokens: 45, totalTokens: 366 });
  assert.equal(evaluations[0].candidates.length, 3);
  assert.equal(evaluations[0].candidates[1].reason, '完整商品白底图');
  assert.equal(evaluations[0].candidates[1].selected, true);
});

test('一次筛选六张，全部不合格时按兜底标准选择最高分图片', async () => {
  const candidates = Array.from({ length: 8 }, (_, index) => `https://fallback.example.com/${index}.jpg`);
  let calls = 0;
  let request;
  const ranked = await rankProductImagesWithVision('八张候选兜底测试商品', candidates, {
    apiKey: 'test-ark-key',
    model: 'test-products-ep',
    validateFetchImpl: async () => ({ ok: true, headers: { get: () => 'image/jpeg' } }),
    fetchImpl: async (url, options) => {
      calls += 1;
      request = JSON.parse(options.body);
      const scores = [15, 42, 28, 9, 37, 61];
      return { ok: true, json: async () => ({
        status: 'completed',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({
          results: scores.map((score, index) => ({ index, accepted: false, score, reason: '不完全符合首图要求' }))
        }) }] }]
      }) };
    }
  });
  assert.equal(calls, 1);
  assert.equal(request.input[0].content.filter(item => item.type === 'input_image').length, 6);
  assert.deepEqual(ranked, ['https://fallback.example.com/5.jpg']);
});

test('模型首选图返回403时自动改用下一张可访问候选', async () => {
  const candidates = ['https://blocked.example.com/first.jpg', 'https://good.example.com/second.jpg'];
  const ranked = await rankProductImagesWithVision('图片防盗链测试商品', candidates, {
    apiKey: 'test-ark-key',
    model: 'test-products-ep',
    validateFetchImpl: async url => ({
      ok: String(url).includes('good.example.com'),
      status: String(url).includes('good.example.com') ? 200 : 403,
      headers: { get: () => String(url).includes('good.example.com') ? 'image/jpeg' : 'text/html' }
    }),
    fetchImpl: async () => ({ ok: true, json: async () => ({
      status: 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ results: [
        { index: 0, accepted: true, score: 98, reason: '首选' },
        { index: 1, accepted: true, score: 90, reason: '次选' }
      ] }) }] }]
    }) })
  });
  assert.deepEqual(ranked, ['https://good.example.com/second.jpg']);
});

test('校验失败反馈给模型，最多重试一次；兼容成功不重试', async () => {
  process.env.ARK_API_KEY = 'test-key'; process.env.ARK_EP_ID = 'test-model';
  const originalSerpKey = process.env.SERPER_API_KEY;
  delete process.env.SERPER_API_KEY;
  const oldFetch = global.fetch;
  const oldAppend = fs.appendFile;
  const timings = [];
  fs.appendFile = async (file, line) => { if (file.endsWith('request-timings.jsonl')) timings.push(JSON.parse(line)); };
  const handler = app._router.stack.find(layer => layer.route?.path === '/api/products').route.stack[0].handle;
  try {
    for (const [responses, expectedStatus, count] of [
      ['invalid', 502, 2],
      [['invalid', JSON.stringify({ products })], 200, 2],
      [JSON.stringify({ products }).replaceAll('"', "'"), 200, 1]
    ]) {
      const calls = [];
      global.fetch = async (url, options) => {
        calls.push(JSON.parse(options.body));
        const text = Array.isArray(responses) ? responses[calls.length - 1] : responses;
        return { ok: true, json: async () => ({ output: [{ type: 'web_search_call', status: 'completed' }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] }) };
      };
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; } };
      await handler({ body: { query: '测试' } }, res);
      assert.equal(res.statusCode, expectedStatus);
      assert.equal(calls.length, count);
      const timing = timings.at(-1);
      assert.equal(timing.attempts.length, count);
      assert.equal(timing.retryCount, count - 1);
      assert.equal(timing.outcome, expectedStatus === 200 ? 'success' : 'failed');
      assert.ok(timing.totalMs >= 0);
      assert.ok(timing.attempts.every(item => item.aiMs >= 0 && item.validationMs >= 0));
      assert.ok(!JSON.stringify(timing).includes('test-key'));
      if (count === 2) assert.match(calls[1].input.at(-1).content, /上次响应未通过格式校验/);
      if (expectedStatus === 502) assert.equal(res.data.error, '商品推荐暂时生成失败，请点击重试');
    }
    global.fetch = async () => { throw new TypeError('network failure'); };
    const res = { status() { return this; }, json() {} };
    await handler({ body: { query: '测试' } }, res);
    assert.equal(timings.at(-1).outcome, 'failed');
    assert.equal(timings.at(-1).attempts[0].stage, 'waiting_for_headers');
    assert.ok(timings.at(-1).attempts[0].aiMs >= 0);
  } finally {
    global.fetch = oldFetch; fs.appendFile = oldAppend;
    if (originalSerpKey === undefined) delete process.env.SERPER_API_KEY;
    else process.env.SERPER_API_KEY = originalSerpKey;
  }
});

test('商品文案两次不规范后由后端修复，不重跑联网商品名单', async () => {
  process.env.ARK_API_KEY = 'test-key'; process.env.ARK_EP_ID = 'test-model';
  const originalSerpKey = process.env.SERPER_API_KEY;
  delete process.env.SERPER_API_KEY;
  const oldFetch = global.fetch;
  const oldAppend = fs.appendFile;
  const timings = [];
  const names = ['商品A', '商品B', '商品C'];
  const outputs = [
    JSON.stringify({ products: names.map(name => ({ name })) }),
    JSON.stringify({ products: [] }),
    JSON.stringify({ products: names.map(name => ({ name, recommendationReason: `${name}推荐理由`, advantages: '优点1；优点2', cautions: ['缺点1'] })) })
  ];
  const calls = [];
  fs.appendFile = async (file, line) => { if (file.endsWith('request-timings.jsonl')) timings.push(JSON.parse(line)); };
  global.fetch = async (url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    const text = outputs[calls.length - 1];
    return { ok: true, json: async () => ({ output: [
      ...(request.tools ? [{ type: 'web_search_call', status: 'completed' }] : []),
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }
    ] }) };
  };
  const handler = app._router.stack.find(layer => layer.route?.path === '/api/products').route.stack[0].handle;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; } };
  try {
    await handler({ body: { query: '测试' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 3);
    assert.equal(calls.filter(call => call.tools).length, 1);
    assert.deepEqual(res.data.products.map(item => item.name), names);
    assert.match(calls[2].input.at(-1).content, /name、reason、pros、cons、link/);
    assert.equal(timings.at(-1).attempts.length, 1);
    assert.equal(timings.at(-1).attempts[0].detailsRetryCount, 1);
    assert.equal(timings.at(-1).attempts[0].detailsRepaired, true);
  } finally {
    global.fetch = oldFetch; fs.appendFile = oldAppend;
    if (originalSerpKey === undefined) delete process.env.SERPER_API_KEY;
    else process.env.SERPER_API_KEY = originalSerpKey;
  }
});

test('限流和配额错误保留诊断码，并返回可操作的提示', async () => {
  const { callLLM } = require('../server');
  const oldFetch = global.fetch;
  try {
    for (const [code, message] of [
      ['RateLimitExceeded', /繁忙或触发限流/],
      ['QuotaExceeded', /配额已用尽/]
    ]) {
      global.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { code, message: 'private provider details' } }) });
      const timing = {};
      await assert.rejects(callLLM('耳机', 'products', '', timing), message);
      assert.equal(timing.providerErrorCode, code);
      assert.equal(timing.httpStatus, 429);
      assert.ok(!JSON.stringify(timing).includes('private provider details'));
    }
  } finally { global.fetch = oldFetch; }
});

test('外部取消信号会中断上游模型请求', async () => {
  const { callLLM } = require('../server');
  const oldFetch = global.fetch;
  const controller = new AbortController();
  let upstreamSignal;
  process.env.ARK_API_KEY = 'test-key'; process.env.ARK_EP_ID = 'test-model';
  global.fetch = async (url, options) => new Promise((resolve, reject) => {
    upstreamSignal = options.signal;
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted'); error.name = 'AbortError'; reject(error);
    });
  });
  try {
    const pending = callLLM('耳机', 'products', '', {}, undefined, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
    assert.equal(upstreamSignal.aborted, true);
  } finally { global.fetch = oldFetch; }
});

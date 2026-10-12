const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup(fetch, windowOverrides = {}) {
  const nodes = new Map();
  const appWindow = { location: { href: '' }, ...windowOverrides };
  function node() {
    const classes = new Set();
    return { children: [], events: {}, value: '笔记本', textContent: '',
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      contains(target) { return target === this || this.children.includes(target); },
      attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, getAttribute(name) { return this[name] || this.attributes[name]; }, focus() {},
      classList: { add(value) { classes.add(value); }, remove(value) { classes.delete(value); }, contains(value) { return classes.has(value); } },
      addEventListener(type, callback) { this.events[type] = callback; }
    };
  }
  const documentEvents = {};
  const document = {
    createElement: node,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    addEventListener(type, callback) { documentEvents[type] = callback; }
  };
  vm.runInNewContext(fs.readFileSync('public/script.js', 'utf8'), { document, fetch, URL, window: appWindow, AbortController });
  const get = id => document.getElementById(id); get.window = appWindow; get.documentEvents = documentEvents;
  return get;
}

test('首页测试模式只生成热门推荐，不请求或修改攻略接口', async () => {
  const calls = [];
  const get = setup(async url => {
    calls.push(url);
    return { ok: true, json: async () => ({ products: [] }) };
  }, { DISABLE_GUIDE_GENERATION: true });
  await get('search-form').events.submit({ preventDefault() {} });
  assert.equal(get('browser-shell').classList.contains('search-mode'), true);
  assert.deepEqual(calls, ['/api/products']);
  assert.equal(get('buying-guide').children[0].textContent, '攻略生成已暂时关闭。');
});

test('首页热门商品生成时复用为你推荐的六卡骨架动画', async () => {
  let finishProducts;
  const get = setup(() => new Promise(resolve => { finishProducts = () => resolve({ ok: true, json: async () => ({ products: [] }) }); }), { DISABLE_GUIDE_GENERATION: true });
  const pending = get('search-form').events.submit({ preventDefault() {} });
  const products = get('products');
  assert.equal(products.classList.contains('skeleton-wave'), true);
  assert.equal(products.children.length, 6);
  assert.ok(products.children.every(card => card.className === 'min-h-48 rounded-2xl bg-white p-5'));
  assert.ok(products.children.every(card => card.children.length === 5));
  finishProducts();
  await pending;
  assert.equal(products.classList.contains('skeleton-wave'), false);
});

test('首页顶部入口包含个性化推荐，手机版和登录均可打开待开发提示', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const css = fs.readFileSync('public/styles.css', 'utf8');
  assert.match(html, /class="brand-action brand-action-active"[^>]*aria-current="page"[^>]*>选购攻略<\/a>/);
  assert.match(html, /href="\/personalized\.html"[^>]*>为你推荐<\/a>/);
  assert.match(html, /id="mobile-entry"[^>]*>手机版<\/button>/);
  assert.match(html, /id="login-entry"[^>]*>登录<\/button>/);
  assert.doesNotMatch(html, /id="collapse-button"|>收起 ↑<\/button>/);
  assert.match(css, /\.brand-nav\s*\{[^}]*align-items:\s*center/s);
  assert.match(css, /\.brand-lockup\s*\{[^}]*align-items:\s*center/s);
  assert.doesNotMatch(css, /\.brand-lockup\s*\{[^}]*transform:\s*translateY/s);
  const get = setup(async () => ({ ok: true, json: async () => ({}) }));
  const notice = get('login-notice');
  assert.equal(notice.hidden, true);
  get('mobile-entry').events.click();
  assert.equal(notice.hidden, false);
  get.documentEvents.click({ target: get('outside-area') });
  assert.equal(notice.hidden, true);
  get('login-entry').events.click();
  assert.equal(notice.hidden, false);
  get.documentEvents.click({ target: get('outside-area') });
  assert.equal(notice.hidden, true);
  assert.doesNotMatch(html, />知道了<\/button>/);
});

test('为你推荐页面同步首页品牌和右上角入口', () => {
  const html = fs.readFileSync('public/personalized.html', 'utf8');
  const css = fs.readFileSync('public/styles.css', 'utf8');
  assert.match(html, /class="brand-lockup"[^>]*aria-label="你的专属选购助手首页"/);
  assert.match(html, /class="brand-action brand-action-link"[^>]*href="\/"[^>]*>选购攻略<\/a>/);
  assert.match(html, /class="brand-action brand-action-active"[^>]*href="\/personalized\.html"[^>]*aria-current="page"[^>]*>为你推荐<\/a>/);
  assert.match(html, /id="mobile-entry"[^>]*>手机版<\/button>/);
  assert.match(html, /id="login-entry"[^>]*>登录<\/button>/);
  assert.match(html, /id="personal-search-toggle"[^>]*aria-label="为你推荐商品搜索"/);
  assert.match(html, /id="personal-search-form"[^>]*role="search"/);
  assert.doesNotMatch(html, /id="personal-search-form"[^>]*hidden/);
  assert.match(html, /id="personal-search-input"[^>]*type="search"[^>]*maxlength="100"/);
  assert.match(html, /id="personal-discovery"[^>]*hidden/);
  assert.match(css, /\.personalized-flow \.personalized-kicker-row\s*\{[^}]*zoom:\s*1\.2/s);
  assert.match(css, /\.personalized-flow \.personal-search-form\s*\{[^}]*width:\s*min\(11\.5rem, 100%\)/s);
  assert.match(css, /\.personalized-flow #personal-title\s*\{[^}]*font-size:\s*2\.25rem/s);
  assert.match(css, /#needs-original > h2\s*\{[^}]*font-size:\s*1\.1875rem/s);
  assert.match(css, /#needs-editor\s*\{[^}]*padding-top:\s*0\.875rem/s);
  assert.match(css, /@media \(min-width: 1400px\)\s*\{\s*\.personal-discovery\s*\{[^}]*left:\s*50%[^}]*width:\s*min\(calc\(100% \+ 6\.75rem\), calc\(100vw - 4rem\)\)[^}]*transform:\s*translateX\(-50%\)/s);
  assert.match(css, /\.personal-category-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.personal-category-card\s*\{[^}]*container-type:\s*inline-size[^}]*grid-template-columns:\s*minmax\(0, 58%\) minmax\(0, 42%\)[^}]*aspect-ratio:\s*5 \/ 3/s);
  assert.match(css, /\.personal-category-image\s*\{[^}]*width:\s*100%[^}]*aspect-ratio:\s*1/s);
  assert.match(css, /@media \(max-width: 720px\)\s*\{[^}]*\.personal-category-grid\s*\{[^}]*grid-template-columns:\s*1fr[^}]*\}\s*\.personal-category-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 40%\) minmax\(0, 60%\)[^}]*aspect-ratio:\s*2\.4 \/ 1/s);
  assert.match(html, /小Go/);
  assert.match(html, /从热门品类开始/);
  assert.match(html, /回答2-5个简短问题，让推荐更贴近你的需求/);
  for (const category of ['耳机', '笔记本电脑', '手机', '跑鞋', '护肤品', '冰箱']) assert.match(html, new RegExp(`>${category}<`));
  assert.equal((html.match(/class="personal-category-card"/g) || []).length, 6);
  assert.equal((html.match(/personalized\.html\?query=/g) || []).length >= 10, true);
});

test('首页可直接选择个性化推荐，并使用当前搜索词创建全新问答', async () => {
  const get = setup(async () => ({ ok: true, json: async () => ({}) }));
  assert.notEqual(get('personalized-results-entry').hidden, true);
  get('query').value = '女鞋';
  await get('search-form').events.submit({ preventDefault() {}, submitter: get('personalized-results-entry') });
  assert.equal(get('query').value, '');
  assert.match(get.window.location.href, /^\/personalized\.html\?query=%E5%A5%B3%E9%9E%8B&run=[a-z0-9]+$/);
});

test('热门商品上方的个性化推荐入口使用当前结果的搜索词', async () => {
  const get = setup(async () => ({ ok: true, json: async () => ({}) }));
  get('results').dataset = { query: '瑜伽垫' };
  await get('personalized-products-entry').events.click();
  assert.match(get.window.location.href, /^\/personalized\.html\?query=%E7%91%9C%E4%BC%BD%E5%9E%AB&run=[a-z0-9]+$/);
});

test('热门商品上方的个性化推荐入口在攻略生成完成后显示', async () => {
  let finishGuide;
  const get = setup(async url => {
    if (url === '/api/guide') return new Promise(resolve => { finishGuide = () => resolve({ ok: true, json: async () => ({ guideContent: '已完成攻略' }) }); });
    return { ok: true, json: async () => ({ products: [] }) };
  });
  const pending = get('search-form').events.submit({ preventDefault() {} });
  assert.equal(get('personalized-products-entry').hidden, true);
  finishGuide();
  await pending;
  assert.equal(get('personalized-products-entry').hidden, false);
});

test('普通攻略生成失败不影响个性化推荐入口', async () => {
  const get = setup(async url => url === '/api/guide'
    ? { ok: false, json: async () => ({ error: '攻略失败' }) }
    : { ok: true, json: async () => ({ products: [] }) });
  await get('search-form').events.submit({ preventDefault() {} });
  assert.notEqual(get('personalized-results-entry').hidden, true);
});

test('生成中同词重复提交不暂停，改搜新词会取消旧请求并立即生成', async () => {
  let aborted = 0;
  const calls = [];
  const get = setup((url, options) => {
    const query = JSON.parse(options.body).query;
    calls.push({ url, query });
    if (query === '手机') return Promise.resolve({ ok: true, json: async () => url === '/api/guide' ? { guideContent: '手机攻略' } : { products: [] } });
    return new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      aborted++;
      const error = new Error('aborted'); error.name = 'AbortError'; reject(error);
    });
    });
  });
  const mainButton = get('search-button');
  const oldSearch = get('search-form').events.submit({ preventDefault() {}, submitter: mainButton });
  assert.equal(mainButton.disabled, false);
  assert.equal(mainButton.attributes['data-state'], 'generating');
  await get('search-form').events.submit({ preventDefault() {}, submitter: mainButton });
  assert.equal(aborted, 0);
  assert.equal(calls.length, 2);
  get('query').value = '手机';
  await get('search-form').events.submit({ preventDefault() {}, submitter: mainButton });
  await oldSearch;
  assert.equal(aborted, 2);
  assert.equal(mainButton.disabled, false);
  assert.equal(mainButton.attributes['data-state'], 'ready');
  assert.equal(mainButton.attributes['aria-label'], '帮我选选：生成攻略和热门推荐');
  assert.equal(get('buying-guide').children[0].textContent, '手机攻略');
});

test('被替换的旧搜索即使晚返回也不能覆盖新结果', async () => {
  const oldSignals = [];
  const finishOld = [];
  const get = setup((url, options) => {
    const query = JSON.parse(options.body).query;
    if (query === '手机') return Promise.resolve({ ok: true, json: async () => url === '/api/guide' ? { guideContent: '手机攻略' } : { products: [] } });
    oldSignals.push(options.signal);
    return new Promise(resolve => finishOld.push(() => resolve({ ok: true, json: async () => url === '/api/guide' ? { guideContent: '旧攻略' } : { products: [] } })));
  });
  const mainButton = get('search-button');
  const oldSearch = get('search-form').events.submit({ preventDefault() {}, submitter: mainButton });
  get('query').value = '手机';
  await get('search-form').events.submit({ preventDefault() {}, submitter: mainButton });
  assert.ok(oldSignals.every(signal => signal.aborted));
  finishOld.forEach(finish => finish());
  await oldSearch;
  assert.equal(get('buying-guide').children[0].textContent, '手机攻略');
  assert.notEqual(get('personalized-results-entry').hidden, true);
});

test('商品单独重试保留攻略；新搜索会取消重试并直接生成新词', async () => {
  const calls = [];
  const get = setup(async (url, options) => {
    const query = JSON.parse(options.body).query;
    calls.push({ url, query });
    if (url === '/api/guide') return { ok: true, json: async () => ({ guideContent: query + '攻略' }) };
    if (calls.filter(c => c.url === url).length === 2) return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted'); error.name = 'AbortError'; reject(error);
      });
    });
    return { ok: false, json: async () => ({ error: '内部格式错误' }) };
  });
  await get('search-form').events.submit({ preventDefault() {} });
  const guide = get('buying-guide').children[0];
  const failure = get('products').children[0];
  assert.equal(failure.children[0].textContent, '内部格式错误');
  get('query').value = '手机';
  const pending = failure.children[1].events.click();
  assert.equal(get('buying-guide').children[0], guide);
  assert.equal(calls.at(-1).query, '笔记本');
  assert.equal(calls.filter(c => c.url === '/api/guide').length, 1);
  const mainButton = get('search-button');
  await get('search-form').events.submit({ preventDefault() {}, submitter: mainButton });
  await pending;
  assert.equal(mainButton.disabled, false);
  assert.equal(get('buying-guide').children[0].textContent, '手机攻略');
  get('query').value = '平板';
  await get('search-form').events.submit({ preventDefault() {}, submitter: mainButton });
  assert.equal(get('buying-guide').children[0].textContent, '平板攻略');
});

test('反馈原因单选，没用先保存；跳过保留反馈，其他可选填', async () => {
  const saved = [];
  const get = setup(async (url, options) => {
    if (url === '/api/feedback') { saved.push(JSON.parse(options.body)); return { ok: true }; }
    return { ok: true, json: async () => url === '/api/guide' ? { guideContent: '攻略', resultId: 'guide-1' } : { products: [], resultId: 'products-1' } };
  });
  await get('search-form').events.submit({ preventDefault() {} });
  const [notice, row, panel, status] = get('guide-feedback').children;
  assert.equal(notice.textContent, '选购攻略由AI生成，仅供参考');
  assert.equal(panel.hidden, true);
  assert.equal(status.hidden, true);
  await row.children[2].events.click();
  assert.equal(saved[0].vote, 'useless');
  assert.equal(saved[0].reason, null);
  assert.equal(panel.hidden, false);
  assert.equal(status.hidden, true);
  assert.equal(panel.className, 'feedback-reason-panel');
  const choices = panel.children[0].children.slice(1);
  assert.equal(choices.length, 7);
  assert.ok(choices.every(label => label.children[0].type === 'radio'));
  assert.equal(new Set(choices.map(label => label.children[0].name)).size, 1);
  choices[0].children[0].events.change();
  choices[6].children[0].events.change();
  choices[6].children[2].value = '';
  await panel.children[1].children[1].events.click();
  assert.equal(saved[1].reason, '其他');
  assert.equal(saved[1].other, '');
  assert.equal(saved[1].feedbackId, saved[0].feedbackId);
  assert.equal(status.hidden, false);
  assert.equal(status.textContent, '感谢您的反馈，我们将持续改进，提升您的使用体验！😊');
  const [productRow, productPanel, productStatus] = get('products-feedback').children;
  await productRow.children[2].events.click();
  productPanel.children[1].children[0].events.click();
  assert.equal(productPanel.hidden, true);
  assert.equal(productStatus.hidden, false);
  assert.equal(productStatus.textContent, '感谢您的反馈，我们将持续改进，提升您的使用体验！😊');
  assert.equal(saved.length, 3);
  assert.equal(saved[2].part, 'products');
});

test('反馈保存失败允许重试，有用成功后高亮且允许切换', async () => {
  let fail = true;
  const get = setup(async url => url === '/api/feedback' ? { ok: !fail } : { ok: true, json: async () => url === '/api/guide' ? { guideContent: '攻略' } : { products: [] } });
  await get('search-form').events.submit({ preventDefault() {} });
  const [, row, panel, status] = get('guide-feedback').children;
  await row.children[1].events.click();
  assert.equal(row.children[1].disabled, false);
  assert.equal(status.hidden, false);
  assert.equal(status.textContent, '反馈未能保存，请重试。');
  fail = false;
  await row.children[1].events.click();
  assert.equal(panel.hidden, true);
  assert.equal(status.hidden, false);
  assert.equal(status.textContent, '感谢您的反馈，您的支持是我们不断提升的动力！😊');
  assert.equal(row.children[1].attributes['aria-pressed'], 'true');
  assert.equal(row.children[2].attributes['aria-pressed'], 'false');
  assert.equal(row.children[1].disabled, false);
  assert.equal(row.children[2].disabled, false);
  await row.children[2].events.click();
  assert.equal(row.children[1].attributes['aria-pressed'], 'false');
  assert.equal(row.children[2].attributes['aria-pressed'], 'true');
  assert.equal(panel.hidden, false);
  await row.children[1].events.click();
  assert.equal(row.children[1].attributes['aria-pressed'], 'true');
  assert.equal(row.children[2].attributes['aria-pressed'], 'false');
  assert.equal(panel.hidden, true);
  assert.equal(status.textContent, '感谢您的反馈，您的支持是我们不断提升的动力！😊');
});

test('热门推荐显示商品图并在候选失败后保留占位，商品标题不显示尺寸', async () => {
  const get = setup(async url => ({ ok: true, json: async () => url === '/api/guide'
    ? { guideContent: '攻略' }
    : { products: [{ name: '惠普战66 七代 14英寸', reason: '14英寸便携', pros: ['轻便'], cons: ['接口少'], link: '#', imageUrl: 'https://img.example.com/one.jpg', imageCandidates: ['https://img.example.com/one.jpg', 'https://img.example.com/two.jpg'] }] } }));
  await get('search-form').events.submit({ preventDefault() {} });
  const card = get('products').children[0];
  const media = card.children[1], placeholder = media.children[0], image = media.children[1];
  assert.equal(image.src, 'https://img.example.com/one.jpg');
  assert.equal(card.children[2].textContent, '惠普战66 七代');
  assert.equal(card.children[3].textContent, '14英寸便携');
  image.events.error();
  assert.equal(image.src, 'https://img.example.com/two.jpg');
  image.events.error();
  assert.equal(image.hidden, true);
  assert.match(placeholder.textContent, /这里原本应该显示商品图片/);
});

test('热门商品首轮缺图时会在文案展示后自动补图', async () => {
  const calls = [];
  const get = setup(async url => {
    calls.push(url);
    if (url === '/api/guide') return { ok: true, json: async () => ({ guideContent: '攻略' }) };
    if (url === '/api/product-image') return calls.filter(call => call === url).length === 1
      ? { ok: false, json: async () => ({ error: '临时失败' }) }
      : { ok: true, json: async () => ({ imageCandidates: ['https://img.example.com/recovered.jpg'] }) };
    return { ok: true, json: async () => ({ products: [{ name: '补图商品', reason: '理由', pros: ['优点'], cons: ['缺点'], link: '#' }] }) };
  });
  await get('search-form').events.submit({ preventDefault() {} });
  for (let i = 0; i < 6; i++) await Promise.resolve();
  const media = get('products').children[0].children[1];
  assert.equal(calls.filter(call => call === '/api/product-image').length, 2);
  assert.equal(media.children[1].src, 'https://img.example.com/recovered.jpg');
});

test('为你推荐商品卡片同样显示后端筛选出的商品图', async () => {
  const get = setup(async url => ({ ok: true, json: async () => url === '/api/guide'
    ? { guideContent: '攻略' }
    : { source: 'personalized', products: [{ name: '个性化商品', reason: '符合需求', pros: ['优点'], cons: ['缺点'], link: '#', imageUrl: 'https://img.example.com/personalized.jpg', imageCandidates: ['https://img.example.com/personalized.jpg'] }] } }));
  await get('search-form').events.submit({ preventDefault() {} });
  const media = get('products').children[0].children[1];
  assert.equal(media.children[1].src, 'https://img.example.com/personalized.jpg');
});

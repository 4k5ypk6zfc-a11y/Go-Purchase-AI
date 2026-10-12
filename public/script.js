const form = document.getElementById('search-form');
const input = document.getElementById('query');
const button = document.getElementById('search-button');
const results = document.getElementById('results');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('error');
const content = document.getElementById('result-content');
const personalizedEntry = document.getElementById('personalized-results-entry');
const personalizedProductsEntry = document.getElementById('personalized-products-entry');
const browserShell = document.getElementById('browser-shell');
const mobileEntry = document.getElementById('mobile-entry');
const loginEntry = document.getElementById('login-entry');
const loginNotice = document.getElementById('login-notice');
const guideGenerationEnabled = typeof window === 'undefined' || window.DISABLE_GUIDE_GENERATION !== true;
let searchVersion = 0;
let activeSearch = null;

if (personalizedProductsEntry) personalizedProductsEntry.hidden = true;
if (loginNotice) loginNotice.hidden = true;

function showFeatureNotice() {
  loginNotice.hidden = false;
}

mobileEntry?.addEventListener('click', showFeatureNotice);
loginEntry?.addEventListener('click', showFeatureNotice);

document.addEventListener('click', event => {
  if (!loginNotice || loginNotice.hidden) return;
  if (mobileEntry?.contains(event.target) || loginEntry?.contains(event.target) || loginNotice.contains(event.target)) return;
  loginNotice.hidden = true;
});

function updateSearchControls() {
  const active = Boolean(activeSearch?.controllers.size);
  results.setAttribute('aria-busy', String(active));
  button.disabled = false;
  button.setAttribute('data-state', active ? 'generating' : 'ready');
  button.setAttribute('aria-label', '帮我选选：生成攻略和热门推荐');
}

function abortSearch(search, reason) {
  if (!search) return;
  search.stopReason = reason;
  for (const controller of search.controllers) controller.abort();
}

personalizedProductsEntry?.addEventListener('click', () => {
  const query = results.dataset?.query || input.value.trim();
  if (!query) return;
  const run = Date.now().toString(36);
  window.location.href = '/personalized.html?query=' + encodeURIComponent(query) + '&run=' + encodeURIComponent(run);
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function productLinkForDevice(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol)) return null;

  const browserNavigator = typeof navigator === 'object' ? navigator : (typeof window === 'object' ? window.navigator : null);
  const userAgent = browserNavigator?.userAgent || '';
  const mobile = /Android|iPhone|iPod|Windows Phone|Mobile|HarmonyOS/i.test(userAgent || '');
  if (!mobile) return url.href;

  if (url.hostname === 'search.jd.com' && url.pathname.toLowerCase() === '/search') {
    const keyword = url.searchParams.get('keyword');
    if (keyword) {
      const mobileSearch = new URL('https://so.m.jd.com/ware/search.action');
      mobileSearch.searchParams.set('keyword', keyword);
      return mobileSearch.href;
    }
  }

  const jdProduct = url.hostname === 'item.jd.com' && url.pathname.match(/^\/(\d+)\.html$/);
  if (jdProduct) return `https://item.m.jd.com/product/${jdProduct[1]}.html`;

  return url.href;
}

function showProductSkeletons(host) {
  host.classList?.remove('results-reveal');
  host.classList?.add('skeleton-wave');
  host.replaceChildren(...Array.from({ length: 6 }, () => {
    const card = element('div', 'min-h-48 rounded-2xl bg-white p-5');
    card.append(
      element('div', 'h-5 w-2/3 rounded bg-[#e9eef2]'),
      element('div', 'mt-6 h-3 w-full rounded bg-[#e9eef2]'),
      element('div', 'mt-3 h-3 w-4/5 rounded bg-[#e9eef2]'),
      element('div', 'mt-3 h-3 w-3/5 rounded bg-[#e9eef2]'),
      element('div', 'mt-8 h-9 w-28 rounded-xl bg-[#e9eef2]')
    );
    return card;
  }));
}

function appendGuideBoldMarkers(parent, line) {
  line.split('**').forEach((part, index) => {
    const text = part.replace(/\*/g, '');
    parent.append(element(index % 2 ? 'strong' : 'span', index % 2 ? 'guide-item-title' : '', text));
  });
}

function renderGuideContent(guide, content) {
  const source = String(content || '');
  if (typeof document.createTextNode !== 'function') {
    guide.replaceChildren(element('p', 'whitespace-pre-line break-words', source));
    return;
  }

  const paragraph = element('p', 'break-words');
  let section = '';
  let sectionContentLines = 0;
  let hasSectionTitle = false;
  const lines = source.split('\n').filter(line => line.trim());

  lines.forEach((line, index) => {
    const sectionMatch = line.match(/【([^】]+)】/);
    if (sectionMatch) {
      section = sectionMatch[1];
      sectionContentLines = 0;
    } else if ((/开篇速选卡/.test(section) && sectionContentLines === 1) || (/关键挑选维度/.test(section) && sectionContentLines > 0)) {
      paragraph.append(element('span', 'guide-half-gap'));
    }

    if (sectionMatch) {
      if (hasSectionTitle) paragraph.append(element('span', 'guide-full-gap'));
      hasSectionTitle = true;
      const start = sectionMatch.index;
      paragraph.append(element('span', '', line.slice(0, start)));
      paragraph.append(element('strong', 'guide-section-title', sectionMatch[0]));
      const remainder = line.slice(start + sectionMatch[0].length);
      if (/开篇速选卡|关键挑选维度|小贴士|避雷提醒/.test(section)) {
        appendGuideBoldMarkers(paragraph, remainder);
      } else {
        paragraph.append(element('span', '', remainder));
      }
    } else if (/开篇速选卡|关键挑选维度|小贴士|避雷提醒/.test(section)) {
      appendGuideBoldMarkers(paragraph, line);
    } else {
      paragraph.append(element('span', '', line));
    }

    if (!sectionMatch) sectionContentLines++;

    if (index < lines.length - 1) {
      paragraph.append(document.createElement('br'));
      if (sectionMatch && /开篇速选卡|关键挑选维度|小贴士|避雷提醒/.test(section)) {
        paragraph.append(element('span', 'guide-half-gap'));
      }
    }
  });

  guide.replaceChildren(paragraph);
}

function productTitleWithoutSize(name) {
  const measurement = String.raw`(?:约\s*)?\d+(?:\.\d+)?\s*(?:英寸|吋|寸|厘米|毫米|米|cm|mm)`;
  return name
    .replace(new RegExp(`${measurement}(?:\s*[×xX*]\s*${measurement})*`, 'gi'), ' ')
    .replace(/\b(?:XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL)(?:\s*码)?(?=\s|$|[）)])/gi, ' ')
    .replace(/\d{2,3}\s*码/g, ' ')
    .replace(/\s*[·|/,，-]+\s*(?=$|[）)])/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

let popularProductImagesEnabled = true;

function productImage(product, index) {
  const media = element('div', 'relative mb-4 aspect-[4/3] overflow-hidden rounded-xl bg-slate-50');
  const placeholder = element('div', 'absolute inset-0 flex items-center justify-center whitespace-pre-line px-4 text-center text-xs leading-5 text-slate-400', '未找到合适的商品图片\n这里原本应该显示商品图片');
  let candidates = [...new Set([product.imageUrl, ...(Array.isArray(product.imageCandidates) ? product.imageCandidates : [])].filter(value => {
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
  }))];
  media.append(placeholder);
  const showCandidates = values => {
    candidates = [...new Set(values.filter(value => {
      try { return new URL(value).protocol === 'https:'; } catch { return false; }
    }))];
    if (!candidates.length) {
      placeholder.textContent = '未找到合适的商品图片\n这里原本应该显示商品图片';
      return;
    }
    placeholder.textContent = '商品图片加载中…';
    const image = element('img', 'relative z-10 h-full w-full bg-white object-contain');
    image.alt = `${productTitleWithoutSize(product.name)} 商品图`;
    image.loading = index < 3 ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    if (index < 3) image.fetchPriority = 'high';
    let candidateIndex = 0;
    image.addEventListener('load', () => { placeholder.hidden = true; });
    image.addEventListener('error', () => {
      candidateIndex++;
      if (candidateIndex < candidates.length) { image.src = candidates[candidateIndex]; return; }
      image.hidden = true;
      placeholder.hidden = false;
      placeholder.textContent = '商品图片加载失败\n这里原本应该显示商品图片';
    });
    image.src = candidates[0];
    media.append(image);
  };
  if (!popularProductImagesEnabled) {
    placeholder.textContent = '测试期间已暂停商品图片';
  } else if (candidates.length) showCandidates(candidates);
  else {
    placeholder.textContent = '正在补充商品图片…';
    const supplementImage = attempt => fetch('/api/product-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: product.name })
    }).then(response => response.ok ? response.json() : Promise.reject())
      .then(data => {
        const values = [data.imageUrl, ...(Array.isArray(data.imageCandidates) ? data.imageCandidates : [])].filter(Boolean);
        if (!values.length) return Promise.reject();
        showCandidates(values);
      }).catch(() => {
        if (attempt < 1) return supplementImage(attempt + 1);
        placeholder.textContent = '未找到合适的商品图片\n这里原本应该显示商品图片';
      });
    supplementImage(0);
  }
  return media;
}

function render(data) {
  const guide = document.getElementById('buying-guide');
  const products = document.getElementById('products');
  if (data.guideContent !== undefined) renderGuideContent(guide, data.guideContent);
  if (!data.products) return;
  if (typeof data.productImagesEnabled === 'boolean') popularProductImagesEnabled = data.productImagesEnabled;
  products.replaceChildren(...data.products.map((product, index) => {
    const card = element('article', 'flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6');
    card.append(element('p', 'mb-4 text-xs font-medium text-teal-600', `推荐 ${String(index + 1).padStart(2, '0')}`));
    card.append(productImage(product, index));
    card.append(element('h4', 'break-words text-xl font-semibold', productTitleWithoutSize(product.name)));
    if (product.referencePrice) card.append(element('p', 'mt-2 text-base font-semibold text-teal-800', `参考价格：${product.referencePrice}`));
    card.append(element('p', 'mb-5 mt-3 break-words text-base leading-7 text-slate-500', product.reason));
    for (const [label, items, color] of [['喜欢它的理由', product.pros, 'text-teal-700'], ['需要留意', product.cons, 'text-amber-700']]) {
      card.append(element('p', `mb-2 text-sm font-semibold ${color}`, label));
      const list = element('ul', 'mb-5 space-y-2 text-base leading-7 text-slate-600');
      list.append(...items.map(item => element('li', 'break-words', `· ${item}`)));
      card.append(list);
    }
    const link = element('a', 'mt-auto block rounded-xl bg-slate-50 px-4 py-3 text-center text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-600', '了解商品 ↗');
    // 只允许网页链接；模拟链接不会导致页面跳到顶部。
    link.href = productLinkForDevice(product.link) || '#';
    if (link.getAttribute('href') === '#') {
      link.textContent = '了解商品 ↗（模拟链接）';
      link.addEventListener('click', event => event.preventDefault());
    } else {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    card.append(link);
    return card;
  }));
}

const feedbackReasons = {
  guide: ['内容简单，不够专业', '内容太啰嗦，没有重点', '内容复杂，看不懂', '攻略过时，数据老旧', '攻略不是我所搜索的产品', '无法解决我的选购问题，没有参考价值', '其他'],
  products: ['对推荐的商品不感兴趣', '推荐商品老旧', '商品跳转链接打不开', '推荐的不是我所搜索的商品', '疑似广告', '其他']
};
const personalizedFeedbackReasons = [
  '问题质量差',
  '推荐商品不是我想要的',
  '推荐等待时间过长',
  '商品/问题生成总是失败',
  '商品链接跳转失败',
  '商品链接与推荐内容不符',
  '商品疑似广告',
  '其他'
];
let feedbackSequence = 0;
const usefulFeedbackThanksMessage = '感谢您的反馈，您的支持是我们不断提升的动力！😊';
const uselessFeedbackThanksMessage = '感谢您的反馈，我们将持续改进，提升您的使用体验！😊';

function renderFeedback(part, query, data) {
  const host = document.getElementById(`${part}-feedback`);
  host.hidden = false;
  host.className = `text-sm ${part === 'guide' ? 'guide-feedback-panel' : 'products-feedback-panel'}`;
  const feedbackId = `${Date.now()}-${++feedbackSequence}-${Math.random().toString(36).slice(2)}`;
  const context = { feedbackId, resultId: data.resultId || feedbackId, part, query, source: data.source || 'popular', sessionId: data.sessionId || null };
  const reasons = data.source === 'personalized' ? personalizedFeedbackReasons : feedbackReasons[part];
  const row = element('div', 'flex flex-wrap items-center gap-3');
  row.append(element('p', 'feedback-question', part === 'guide' ? '这份攻略对你有帮助吗？' : '这些推荐对你有帮助吗？'));
  const makeButton = (text, primary = false) => {
    const node = element('button', `rounded-xl px-4 py-2 focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50 ${primary ? 'bg-teal-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`, text);
    node.type = 'button';
    return node;
  };
  const useful = makeButton('👍 有用');
  const useless = makeButton('👎 没用');
  for (const option of [useful, useless]) {
    option.className += ' feedback-vote-button aria-pressed:bg-teal-800 aria-pressed:text-white aria-pressed:border-teal-800 aria-pressed:hover:bg-teal-800';
    option.setAttribute('aria-pressed', 'false');
  }
  row.append(useful, useless);
  const panel = element('div', 'feedback-reason-panel');
  panel.hidden = true;
  const choices = element('fieldset', 'space-y-3');
  choices.append(element('legend', 'mb-3 font-semibold', '哪些地方没帮到你？'));
  const other = element('input', 'ml-2 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2');
  other.type = 'text'; other.maxLength = 500; other.placeholder = '请补充（选填）';
  other.setAttribute('aria-label', '其他原因（选填）'); other.hidden = true;
  let selected = null;
  const submit = makeButton('提交反馈', true);
  submit.disabled = true;
  reasons.forEach((reason, index) => {
    const label = element('label', 'flex items-center gap-2 text-slate-600');
    const radio = element('input', 'shrink-0 accent-teal-700');
    radio.type = 'radio'; radio.name = `reason-${feedbackId}`; radio.value = String(index);
    radio.addEventListener('change', () => {
      selected = index;
      other.hidden = index !== reasons.length - 1;
      submit.disabled = false;
    });
    label.append(radio, element('span', '', reason));
    if (index === reasons.length - 1) label.append(other);
    choices.append(label);
  });
  const actions = element('div', 'mt-4 flex justify-end gap-3');
  const skip = makeButton('跳过'); actions.append(skip, submit);
  panel.append(choices, actions);
  const status = element('p', 'feedback-status mt-3 text-sm');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const hideStatus = () => { status.hidden = true; status.textContent = ''; };
  const showStatus = message => { status.textContent = message; status.hidden = false; };
  const feedbackContent = [];
  if (part === 'guide') feedbackContent.push(element('p', 'mb-3 text-xs text-slate-400', '选购攻略由AI生成，仅供参考'));
  feedbackContent.push(row, panel, status);
  host.replaceChildren(...feedbackContent);
  async function save(vote, detail = false) {
    useful.disabled = useless.disabled = skip.disabled = submit.disabled = true;
    hideStatus();
    try {
      const reason = detail && selected !== null ? reasons[selected] : null;
      const response = await fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...context, vote, reason, other: reason === '其他' ? other.value.trim() : '' })
      });
      if (!response.ok) throw new Error('反馈保存失败');
      useful.setAttribute('aria-pressed', String(vote === 'useful'));
      useless.setAttribute('aria-pressed', String(vote === 'useless'));
      if (vote === 'useless' && !detail) {
        panel.hidden = false;
        skip.disabled = false; submit.disabled = selected === null;
      } else {
        panel.hidden = true;
        showStatus(vote === 'useful' ? usefulFeedbackThanksMessage : uselessFeedbackThanksMessage);
      }
    } catch {
      showStatus('反馈未能保存，请重试。');
      if (detail) { skip.disabled = false; submit.disabled = selected === null; }
      else { useful.disabled = useless.disabled = false; }
    } finally {
      useful.disabled = useless.disabled = false;
      skip.disabled = false;
      submit.disabled = selected === null;
    }
  }
  useful.addEventListener('click', () => save('useful'));
  useless.addEventListener('click', () => save('useless'));
  skip.addEventListener('click', () => { panel.hidden = true; showStatus(uselessFeedbackThanksMessage); });
  submit.addEventListener('click', () => { if (selected !== null) return save('useless', true); });
}

async function readGuideStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '', completed = false;
  function consume(line) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.error);
    if (event.type === 'done') completed = true;
    onEvent(event);
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        consume(pending.slice(0, end)); pending = pending.slice(end + 1);
      }
      if (done) break;
    }
    if (pending.trim()) consume(pending);
    if (!completed) throw new Error('攻略传输中断');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) {
    errorBox.textContent = '请输入想了解的商品，例如“笔记本电脑”。';
    errorBox.hidden = false;
    input.focus();
    return;
  }
  if (event.submitter !== personalizedEntry && activeSearch?.controllers.size && query === activeSearch.query) {
    return;
  }
  if (event.submitter === personalizedEntry) {
    abortSearch(activeSearch, 'replaced');
    const run = Date.now().toString(36);
    input.value = '';
    window.location.href = '/personalized.html?query=' + encodeURIComponent(query) + '&run=' + encodeURIComponent(run);
    return;
  }
  abortSearch(activeSearch, 'replaced');
  browserShell?.classList.add('search-mode');
  const version = ++searchVersion;
  const search = { version, query, controllers: new Set(), stopReason: null };
  activeSearch = search;
  if (results.dataset) results.dataset.query = query;
  if (personalizedProductsEntry) personalizedProductsEntry.hidden = true;
  for (const part of ['guide', 'products']) document.getElementById(`${part}-feedback`).hidden = true;
  errorBox.hidden = true;
  results.hidden = false;
  results.setAttribute('aria-busy', 'true');
  loading.hidden = false;
  content.hidden = true;
  document.getElementById('results-title').textContent = `${query} · 选购参考`;
  const guideBox = document.getElementById('buying-guide');
  const productsBox = document.getElementById('products');
  guideBox.replaceChildren(element('p', '', guideGenerationEnabled ? '正在整理选购攻略…' : '攻略生成已暂时关闭。'));
  showProductSkeletons(productsBox);
  content.hidden = false;
  loading.hidden = true;
  async function loadPart(part, box) {
    if (version !== searchVersion) return;
    const controller = new AbortController();
    search.controllers.add(controller);
    search.stopReason = null;
    updateSearchControls();
    let hasPartialContent = false;
    document.getElementById(`${part}-feedback`).hidden = true;
    if (part === 'products') showProductSkeletons(box);
    else box.replaceChildren(element('p', 'text-sm text-slate-500', '正在整理选购攻略…'));
    try {
      const response = await fetch(`/api/${part}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, ...(part === 'guide' ? { stream: true } : {}) }),
        signal: controller.signal
      });
      if (part === 'guide' && response.ok && response.headers?.get('content-type')?.includes('application/x-ndjson')) {
        await readGuideStream(response, event => {
          if (version !== searchVersion) return;
          if (event.type === 'reset') box.replaceChildren(element('p', 'text-sm text-slate-500', '正在重新整理选购攻略…'));
          else if (event.type === 'done' || (event.type === 'preview' && event.guideContent)) {
            render({ guideContent: event.guideContent });
            if (event.guideContent) hasPartialContent = true;
            if (event.type === 'done') {
              renderFeedback(part, query, event);
              if (personalizedProductsEntry) personalizedProductsEntry.hidden = false;
            }
          }
        });
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || '生成失败，请稍后重试。');
        error.userMessage = data.error;
        throw error;
      }
      if (version === searchVersion) {
        if (part === 'products') box.classList?.remove('skeleton-wave');
        render(data); renderFeedback(part, query, data); hasPartialContent = true;
        if (part === 'guide' && personalizedProductsEntry) personalizedProductsEntry.hidden = false;
      }
    } catch (error) {
      if (version !== searchVersion) return;
      if (error.name === 'AbortError') {
        if (search.stopReason === 'replaced') return;
        if (part === 'products') box.classList?.remove('skeleton-wave');
        const stopped = element('div', 'space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4');
        stopped.append(element('p', 'text-sm text-slate-600', part === 'guide' ? '已停止生成选购攻略。' : '已停止生成热门商品。'));
        if (hasPartialContent) box.append(stopped); else box.replaceChildren(stopped);
        return;
      }
      const message = element('p', 'text-sm text-amber-700', error.userMessage || (part === 'products' ? '商品推荐暂时生成失败，请点击重试' : '选购攻略暂时生成失败，请点击重试'));
      if (part === 'products') box.classList?.remove('skeleton-wave');
      message.setAttribute('role', 'alert');
      const retry = element('button', 'rounded-xl bg-teal-800 px-4 py-3 text-sm text-white focus-visible:ring-2 focus-visible:ring-teal-600', '点击重试');
      retry.type = 'button';
      retry.addEventListener('click', () => {
        retry.disabled = true;
        return loadPart(part, box);
      });
      const failure = element('div', 'space-y-3');
      failure.append(message, retry);
      box.replaceChildren(failure);
    } finally {
      search.controllers.delete(controller);
      if (activeSearch === search) updateSearchControls();
    }
  }
  try {
    const tasks = [loadPart('products', productsBox)];
    if (guideGenerationEnabled) tasks.unshift(loadPart('guide', guideBox));
    await Promise.all(tasks);
  } finally {
    if (version === searchVersion) {
      loading.hidden = true;
      results.setAttribute('aria-busy', 'false');
      updateSearchControls();
    }
  }
});

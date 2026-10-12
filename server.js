const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');
const elapsed = start => Math.round((performance.now() - start) * 100) / 100;
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env.serper') });

const app = express();
const port = Number(process.env.PORT) || 3000;
const POPULAR_PRODUCT_IMAGES_ENABLED = process.env.POPULAR_PRODUCT_IMAGES_ENABLED === 'true';
const systemPrompt = `你是电商平台产品选购AI助手，使用【电商AI选购攻略通用模板】输出选购攻略。
【电商AI选购攻略通用模板】

 【开篇速选卡（必放最顶部，所有品类都要有）】 目标：碎片化刷手机用户，不看全文也能做基础判断，控制在150字以内 • 

【我到底适合哪一类（按需选用，非必选）】
 不要科普产品原理，直接做用户匹配，拒绝教科书分类；按普通人真实场景划分，不要太笼统 
格式： 
✅如果你是【A情况】→选【XX类型产品】 
✅如果你是【B情况】→选【XX类型产品】 
❌如果你是【C情况】，就不要选【XX类型】 
⚠️品类自适应：数码/家电保留本模块；小件食品、简单厨具等产品可删减，合并到速选卡，视产品功能属性而定

【关键挑选维度（品类自适应，自动删减无关维度）】 
写：怎么看 + 好坏后果 +标记🔴🟡✅ 
模板格式： 
维度1：{维度名称} 
✅优先选：，好处是【人话，通俗讲体验】 
🟡可妥协：，接受会有什么小缺点 
🔴红线不要：____，出现这个会踩什么坑

【分预算选购指南（预算类问题保留；无预算提问可删）】 
每个价位写三件事：①这个价位能拿到什么；②🔴死守不能让步条件；🟡可以放弃的点；③电商常见套路 
▷价位段：XXX‑XXX元 
👉可以买到：简述产品 
🔴必须死守：1.xxx 2.xxx（不能降的底线） 
🟡可以放弃：xxx（预算有限优先牺牲这些）
 ⚠️电商套路：该价位常见营销陷阱

【电商平台避坑清单（全部品类必带！重点！）】 
重点：不是讲道理，教用户看商品标题、详情页、参数栏，看到哪些关键词直接警惕/划走 
格式： 
⚠️看到标题/详情出现【A】：谨慎购买，原因：xxx 
❌看到【B】直接划走，不要买 
💡小技巧：下单前看商品参数页/追评，重点关注xx

（最后快速总结，简短收尾）

【强制约束】 1、优先输出【模块0开篇速选卡】放在最顶部，给用户快速结论，不要一上来讲参数科普； 2、自动做品类自适应：根据用户询问产品类型，删除无关模块、无关维度。比如食品删除重量、处理器这类硬件维度；服装删除硬盘、芯片。 3、所有挑选维度，适当科普专业知识，最好转化为：选了有什么体验，差了会遇到什么麻烦；每个维度标记🔴硬性红线、🟡可妥协、✅优先追求。 4、避坑模块重点写电商实操：看标题、看详情页、看配料/参数栏，哪些关键词需要避开，拒绝空洞道理。 5、识别用户提问颗粒度： 如果用户提问很具体（提供预算+明确需求，例如3500大学生笔记本，租房炒锅），压缩模块1、模块2篇幅，强化速选卡，输出精简版本； 如果用户宽泛提问（怎么选XX）输出完整全部模块。 6、禁止堆砌大段无分割长文本，多用符号、小标题，适配手机阅读。 7、不要输出教科书式知识，目标是帮普通人快速下单做决策，不是培养产品专家。
【商品推荐规则（仅适用于products，不改变选购攻略内容及规则）】
1、推荐6款符合用户需求的近期热门产品，以最热门、最火爆为核心，不分配性价比名额，不按价格档位凑数；用户有预算时满足预算。
2、联网查询近半年的热门依据，避免冷门产品和同一产品细微变体。换代快的电子产品必须是近半年热门、当前最新迭代且正常在售的型号，排除被新一代替代的旧款。
3、每款推荐理由用一句易读短句，尽量30字以内；优点和缺点各1–2条，每条尽量15字以内，直接描述普通用户关心的体验，避免重复和长篇评测。
4、不编造销量、排名、版本和年份，无法核实的信息不表述为事实。
5、下方products是结构示例，实际优先输出6款；可靠候选不足6款时可少展示，但至少3款，不得用配件或重复变体凑数。
6、products数组中每个商品的link必须输出完整京东搜索链接，模板为https://search.jd.com/Search?keyword=商品名称，将该商品name的完整产品名进行URL编码后填入keyword，不再使用#。link必须是合法的https链接，禁止编造item商品ID，禁止编造虚假详情页链接。
7、推荐商品必须是用户搜索品类本身，不能用相关配件或替换部件凑数。用户搜索“蓝牙耳机”时，只推荐包含耳机本体、可正常使用的完整产品，排除单独售卖的充电盒、保护套、耳塞配件及单只补配耳机。联网核验时确认商品实际售卖内容，不能仅凭标题包含搜索关键词就推荐；用户明确搜索配件时，按该配件品类推荐。
8、name仅保留“品牌 + 系列/型号 + 必要的产品类型”，尽量控制在20字以内；完整型号优先，不要为了缩短名称截断型号。商品标题禁止包含尺寸、尺码、长宽高或屏幕大小，例如“14英寸”“24寸”“1.8米”“XL码”；相关信息如有推荐价值，放入reason或pros。删除营销词、促销信息、适用人群和场景、堆砌的功能参数，例如“旗舰款”“高音质”“超长续航”“学生专用”“运动游戏通用”等。颜色、套餐、容量等信息仅在区分具体推荐版本确有必要时保留。功能亮点放入reason或pros，不要堆在name中。京东搜索链接的keyword使用精简后的完整name并进行URL编码。

【联网商品核验要求】
必须先使用web_search联网查询2026年国内电商近期热销商品，结合当前日期核验产品版本、在售状态及热门依据。优先查询京东、淘宝、天猫与品牌官方页面，排除已被新一代替代的旧款。不编造销量或排名；最终严格按下方结构只返回纯净JSON，不输出搜索过程、Markdown或额外解释。攻略模板保持不变。

输出JSON格式：
{
"guideContent":"完整带标记符号的选购攻略文本",
"products":[
{"name":"","reason":"","pros":["",""],"cons":["",""],"link":"https://search.jd.com/Search?keyword=商品名称"}
]
}
只返回纯净JSON，不要任何前言解释，首字符必须为{。`;

app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 仅兼容字符串的单引号写法，最终仍交给 JSON.parse；不执行模型返回的代码。
function parseCompatibleJSON(source) {
  try { return JSON.parse(source); } catch { /* 尝试受限的单引号兼容。 */ }
  let normalized = '';
  for (let i = 0; i < source.length; i++) {
    const quote = source[i];
    if (quote !== "'" && quote !== '"') { normalized += quote; continue; }
    let value = '';
    let closed = false;
    for (i++; i < source.length; i++) {
      const char = source[i];
      if (char === quote) { closed = true; break; }
      if (char.charCodeAt(0) < 32) throw new Error('字符串包含未转义控制字符');
      if (char !== '\\') { value += char; continue; }
      const escape = source[++i];
      if (escape === "'" && quote === "'") { value += "'"; continue; }
      if (escape === 'u') {
        const hex = source.slice(i + 1, i + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('无效 Unicode 转义');
        value += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else {
        const escapes = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (!Object.hasOwn(escapes, escape)) throw new Error('无效字符串转义');
        value += escapes[escape];
      }
    }
    if (!closed) throw new Error('字符串未闭合');
    normalized += JSON.stringify(value);
  }
  return JSON.parse(normalized);
}

function stripProductTitleSize(name) {
  const measurement = String.raw`(?:约\s*)?\d+(?:\.\d+)?\s*(?:英寸|吋|寸|厘米|毫米|米|cm|mm)`;
  return name
    .replace(new RegExp(`${measurement}(?:\s*[×xX*]\s*${measurement})*`, 'gi'), ' ')
    .replace(/\b(?:XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL)(?:\s*码)?(?=\s|$|[）)])/gi, ' ')
    .replace(/\d{2,3}\s*码/g, ' ')
    .replace(/\s*[·|/,，-]+\s*(?=$|[）)])/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const productImageCache = new Map();
const productImageCacheTtl = 24 * 60 * 60 * 1000;
const visionImageCache = new Map();
const visionThumbnailByOriginal = new Map();

function safeImageUrl(value) {
  if (typeof value !== 'string' || value.length > 4000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

function imageResultScore(item, productName) {
  const compactName = productName.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const prefix = compactName.slice(0, Math.min(6, compactName.length));
  const context = [item.title, item.source, item.link].filter(Boolean).join(' ').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const source = String(item.source || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  let score = 0;
  if (item.is_product === true) score += 6;
  if (/(?:官方|官网|旗舰店)/i.test(source)) score += 10;
  if (compactName.length >= 4 && context && (context.includes(compactName) || compactName.includes(context))) score += 24;
  else if (prefix.length >= 2 && context.includes(prefix)) score += 10;
  if (/(?:白底|纯色|单品|产品图|商品图|packshot|productimage)/i.test(context)) score += 6;
  if (/(?:海报|拼图|合集|评测|场景图|壁纸|水印|广告|促销)/i.test(context)) score -= 15;
  return score;
}

function selectProductImageCandidates(images, productName) {
  if (!Array.isArray(images)) return [];
  const ranked = images
    .filter(item => item && (safeImageUrl(item.imageUrl) || safeImageUrl(item.thumbnailUrl)))
    .map(item => ({ item, score: imageResultScore(item, productName) }))
    .sort((a, b) => b.score - a.score || (a.item.position || 999) - (b.item.position || 999));
  const candidates = [];
  const best = ranked.slice(0, 10).map(entry => entry.item);
  // 先尝试多张高质量原图，再用搜索引擎缩略图兜底，避免候选都来自同一张图。
  for (const field of ['imageUrl', 'thumbnailUrl']) {
    for (const item of best) {
      const value = item[field];
      const url = safeImageUrl(value);
      if (url && !candidates.includes(url)) candidates.push(url);
      if (candidates.length === 8) return candidates;
    }
  }
  return candidates;
}

function responseOutputText(payload) {
  return Array.isArray(payload?.output) ? payload.output
    .filter(item => item.type === 'message' && item.role === 'assistant')
    .flatMap(item => Array.isArray(item.content) ? item.content : [])
    .filter(item => item.type === 'output_text' && typeof item.text === 'string')
    .map(item => item.text).join('') : '';
}

async function imageUrlToDataUrl(url, { fetchImpl = fetch, signal } = {}) {
  const timeout = AbortSignal.timeout(10000);
  const requestSignal = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetchImpl(url, {
    headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
    signal: requestSignal
  });
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  const mime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!mime.startsWith('image/')) throw new Error('Image download returned non-image content');
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > 3 * 1024 * 1024) throw new Error('Image is too large for visual screening');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 3 * 1024 * 1024) throw new Error('Image is empty or too large for visual screening');
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function isLoadableImageUrl(url, { fetchImpl = fetch, signal } = {}) {
  const timeout = AbortSignal.timeout(6500);
  const requestSignal = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; ProductImageValidator/1.0)'
      },
      signal: requestSignal
    });
    const mime = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
    await response.body?.cancel?.().catch(() => {});
    return response.ok && mime.startsWith('image/');
  } catch {
    return false;
  }
}

async function rankProductImagesWithVision(productName, candidates, {
  fetchImpl = fetch,
  imageFetchImpl = fetch,
  validateFetchImpl = fetch,
  apiKey = process.env.ARK_API_KEY?.trim(),
  model = process.env.ARK_EP_ID?.trim(),
  usage,
  evaluations,
  signal
} = {}) {
  const allImages = [...new Set((Array.isArray(candidates) ? candidates : []).map(safeImageUrl).filter(Boolean))];
  const images = allImages.slice(0, 6);
  if (!images.length) return [];
  if (!apiKey || !model) return allImages;
  const cacheKey = `${productName.normalize('NFKC').trim().toLowerCase()}\n${images.join('\n')}`;
  const cached = visionImageCache.get(cacheKey);
  if (cached && Array.isArray(cached.evaluation) && Date.now() - cached.time < productImageCacheTtl) {
    const checked = await Promise.all(cached.candidates.map(async url => ({
      url,
      ok: await isLoadableImageUrl(url, { fetchImpl: validateFetchImpl, signal })
    })));
    const available = checked.filter(item => item.ok).map(item => item.url);
    if (available.length) {
      if (Array.isArray(evaluations)) evaluations.push({ ...cached.evaluation, cached: true, selectedUrl: available[0] });
      return available;
    }
    visionImageCache.delete(cacheKey);
  }
  const timeout = AbortSignal.timeout(30000);
  const requestSignal = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
  const prepared = await Promise.all(images.map(async originalUrl => {
    const thumbnailUrl = visionThumbnailByOriginal.get(originalUrl);
    if (!thumbnailUrl) return { originalUrl, inputUrl: originalUrl };
    try {
      return { originalUrl, inputUrl: await imageUrlToDataUrl(thumbnailUrl, { fetchImpl: imageFetchImpl, signal }) };
    } catch {
      return { originalUrl, inputUrl: null, preparationError: true };
    }
  }));
  const visibleImages = prepared.filter(item => item.inputUrl);
  if (!visibleImages.length) throw new Error('Vision image preparation failed');
  const evaluateBatch = async batch => {
    const content = [{
      type: 'input_text',
      text: `你在为电商热门商品卡片选择首图。目标商品：${productName}。先按原有严格标准逐张判断 accepted：淘汰错误商品或型号、仅局部特写、广告或促销海报、评测/开箱/博客封面、截图、拼图、大段文字、水印明显、主体不完整；合格图应是完整商品主体、背景简洁、白底或纯色、无促销文案。不要因为兜底要求而放宽 accepted 标准。然后为每张图给出 fallbackScore（0到100）：仅用于所有图片都不合格时的兜底排序，重点判断①确实是目标商品；②产品主体突出且完整；③看起来像品牌官方或电商平台会使用的商品图。必须为每张候选图返回结果。只输出严格 JSON：{"results":[{"index":0,"accepted":true,"score":0,"reason":""}]}，其中 score 就是 fallbackScore，reason 同时说明是否符合严格标准及兜底优劣。index 从0开始。无法确认是目标商品时 accepted=false 且低分。`
    }];
    batch.forEach(({ inputUrl }, index) => {
      content.push({ type: 'input_text', text: `候选图 ${index}` });
      content.push({ type: 'input_image', image_url: inputUrl, detail: 'low' });
    });
    const response = await fetchImpl('https://ark.cn-beijing.volces.com/api/v3/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: requestSignal,
      body: JSON.stringify({
        model,
        temperature: 0,
        thinking: { type: 'disabled' },
        input: [{ role: 'user', content }],
        max_output_tokens: 1200
      })
    });
    if (!response.ok) throw new Error(`Vision image ranking failed: ${response.status}`);
    const payload = await response.json();
    if (payload.status === 'failed' || payload.status === 'incomplete' || payload.error) throw new Error('Vision image ranking incomplete');
    if (usage && typeof usage === 'object') {
      const inputTokens = Number(payload.usage?.input_tokens) || 0;
      const outputTokens = Number(payload.usage?.output_tokens) || 0;
      usage.calls = (Number(usage.calls) || 0) + 1;
      usage.inputTokens = (Number(usage.inputTokens) || 0) + inputTokens;
      usage.outputTokens = (Number(usage.outputTokens) || 0) + outputTokens;
      usage.totalTokens = (Number(usage.totalTokens) || 0) + (Number(payload.usage?.total_tokens) || inputTokens + outputTokens);
    }
    const data = parseCompatibleJSON(responseOutputText(payload));
    if (!Array.isArray(data?.results)) throw new Error('Vision image ranking invalid');
    return data.results
      .filter(item => Number.isInteger(item?.index) && item.index >= 0 && item.index < batch.length)
      .map(item => ({
        originalUrl: batch[item.index].originalUrl,
        accepted: item.accepted === true,
        score: Math.max(0, Math.min(100, Number(item.score) || 0)),
        reason: typeof item.reason === 'string' ? item.reason.slice(0, 300) : ''
      }));
  };
  const modelResults = await evaluateBatch(visibleImages);
  const checkedResults = await Promise.all(modelResults.map(async item => {
    const thumbnailUrl = visionThumbnailByOriginal.get(item.originalUrl);
    const originalLoadable = await isLoadableImageUrl(item.originalUrl, { fetchImpl: validateFetchImpl, signal });
    const thumbnailLoadable = !originalLoadable && thumbnailUrl
      ? await isLoadableImageUrl(thumbnailUrl, { fetchImpl: validateFetchImpl, signal })
      : false;
    return {
      ...item,
      loadable: originalLoadable || thumbnailLoadable,
      displayUrl: originalLoadable ? item.originalUrl : thumbnailLoadable ? thumbnailUrl : item.originalUrl
    };
  }));
  const preparationFailures = prepared.filter(item => item.preparationError).map(item => ({
    originalUrl: item.originalUrl,
    accepted: false,
    score: 0,
    reason: '候选图下载失败，未进入视觉筛选',
    loadable: false,
    displayUrl: item.originalUrl
  }));
  const evaluated = [...checkedResults, ...preparationFailures];
  const accepted = checkedResults.filter(item => item.accepted && item.loadable).sort((a, b) => b.score - a.score);
  const fallback = checkedResults.filter(item => item.loadable).sort((a, b) => b.score - a.score);
  const selected = accepted[0] || fallback[0] || [...checkedResults].sort((a, b) => b.score - a.score)[0];
  const ranked = selected ? [selected.displayUrl] : [images[0]];
  const evaluation = {
    time: new Date().toISOString(),
    productName,
    selectionMode: accepted.length ? 'strict' : 'fallback',
    selectedUrl: ranked[0],
    candidates: evaluated.map((item, index) => ({
      index,
      url: item.originalUrl,
      accepted: item.accepted,
      score: item.score,
      reason: item.reason,
      loadable: item.loadable,
      selected: item === selected
    }))
  };
  if (Array.isArray(evaluations)) evaluations.push(evaluation);
  visionImageCache.set(cacheKey, { time: Date.now(), candidates: ranked, evaluation });
  if (visionImageCache.size > 200) visionImageCache.delete(visionImageCache.keys().next().value);
  return ranked;
}

async function searchProductImages(productName, { fetchImpl = fetch, apiKey = process.env.SERPER_API_KEY?.trim(), signal } = {}) {
  if (!apiKey) return [];
  const cacheKey = productName.normalize('NFKC').trim().toLowerCase();
  const cached = productImageCache.get(cacheKey);
  if (cached && Date.now() - cached.time < productImageCacheTtl) return cached.candidates;
  const timeout = AbortSignal.timeout(6500);
  const requestSignal = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetchImpl('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: productName, gl: 'cn', hl: 'zh-cn', num: 20 }),
    signal: requestSignal
  });
  if (!response.ok) throw new Error(`Serper image search failed: ${response.status}`);
  const data = await response.json();
  if (data.error || data.message) throw new Error('Serper image search returned an error');
  for (const item of Array.isArray(data.images) ? data.images : []) {
    const original = safeImageUrl(item?.imageUrl);
    const thumbnail = safeImageUrl(item?.thumbnailUrl);
    if (original && thumbnail) visionThumbnailByOriginal.set(original, thumbnail);
    if (thumbnail) visionThumbnailByOriginal.set(thumbnail, thumbnail);
  }
  while (visionThumbnailByOriginal.size > 1000) visionThumbnailByOriginal.delete(visionThumbnailByOriginal.keys().next().value);
  const candidates = selectProductImageCandidates(data.images, productName);
  productImageCache.set(cacheKey, { time: Date.now(), candidates });
  if (productImageCache.size > 200) productImageCache.delete(productImageCache.keys().next().value);
  return candidates;
}

async function enrichPopularProductImages(result, options = {}) {
  if (!Array.isArray(result?.products)) return result;
  const searched = await Promise.all(result.products.map(async product => {
    let candidates = [];
    try { candidates = await searchProductImages(product.name, options); }
    catch { /* 搜图失败不影响商品推荐主流程。 */ }
    return { product, candidates };
  }));
  const products = await Promise.all(searched.map(async ({ product, candidates }) => {
      let selected = candidates;
      if (candidates.length) {
        try {
          selected = await rankProductImagesWithVision(product.name, candidates, {
            fetchImpl: options.visionFetchImpl,
            imageFetchImpl: options.imageFetchImpl,
            validateFetchImpl: options.validateFetchImpl,
            apiKey: options.visionApiKey,
            model: options.visionModel,
            usage: options.visionUsage,
            evaluations: options.visionEvaluations,
            signal: options.signal
          });
        } catch { selected = []; /* 未经视觉确认的图片不进入商品卡片。 */ }
      }
      return { ...product, imageUrl: selected[0] || null, imageCandidates: selected };
  }));
  return { ...result, products };
}

function parseResult(content, part = 'all') {
  if (typeof content !== 'string') throw new Error('AI 未返回有效内容，请重试。');
  // 跳过解释文字和 Markdown 围栏；按括号配对提取，忽略字符串中的括号。
  for (let start = content.indexOf('{'); start !== -1; start = content.indexOf('{', start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < content.length; end++) {
      const char = content[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quoted) quoted = false;
        continue;
      }
      if (char === '"' || char === "'") quoted = char;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try {
          const data = parseCompatibleJSON(content.slice(start, end + 1));
          const strings = value => Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim());
          if (part !== 'products' && (typeof data.guideContent !== 'string' || !data.guideContent.trim())) break;
          if (part === 'guide') return { guideContent: data.guideContent };
          if (!Array.isArray(data.products) || data.products.length < 3 || data.products.length > 6) break;
          if (!data.products.every(item => item && typeof item.name === 'string' && item.name.trim() && typeof item.reason === 'string' && item.reason.trim() && strings(item.pros) && strings(item.cons) && typeof item.link === 'string')) break;
          data.products.forEach(item => { item.name = stripProductTitleSize(item.name); });
          if (!data.products.every(item => item.name)) break;
          return data;
        } catch { /* 尝试后续完整 JSON 对象。 */ }
        break;
      }
    }
  }
  throw new Error('AI 返回的数据格式不完整，请重新搜索。');
}

function parseProductShortlist(content) {
  try {
    const completeResult = parseResult(content, 'products');
    return { names: completeResult.products.map(item => item.name), completeResult };
  } catch { /* 正常的名单阶段只包含 name。 */ }
  if (typeof content !== 'string') throw new Error('AI 未返回商品名单。');
  for (let start = content.indexOf('{'); start !== -1; start = content.indexOf('{', start + 1)) {
    let depth = 0, quoted = false, escaped = false;
    for (let end = start; end < content.length; end++) {
      const char = content[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quoted) quoted = false;
        continue;
      }
      if (char === '"' || char === "'") quoted = char;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try {
          const data = parseCompatibleJSON(content.slice(start, end + 1));
          if (!Array.isArray(data.products) || data.products.length < 3 || data.products.length > 6) break;
          const names = data.products.map(item => stripProductTitleSize(typeof item?.name === 'string' ? item.name : '')).filter(Boolean);
          if (names.length !== data.products.length || new Set(names).size !== names.length) break;
          return { names };
        } catch { /* 尝试后续 JSON 对象。 */ }
        break;
      }
    }
  }
  throw new Error('AI 返回的商品名单格式不完整。');
}

function extractCompatibleData(content) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI 未返回可修复的商品文案。');
  const source = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return parseCompatibleJSON(source); } catch { /* 继续提取完整 JSON。 */ }
  for (let start = source.indexOf('{'); start !== -1; start = source.indexOf('{', start + 1)) {
    let depth = 0, quoted = false, escaped = false;
    for (let end = start; end < source.length; end++) {
      const char = source[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quoted) quoted = false;
        continue;
      }
      if (char === '"' || char === "'") quoted = char;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try { return parseCompatibleJSON(source.slice(start, end + 1)); }
        catch { break; }
      }
    }
  }
  throw new Error('AI 返回的商品文案不是可修复的 JSON。');
}

function repairProductDetails(content, names) {
  const data = extractCompatibleData(content);
  const items = Array.isArray(data) ? data : data?.products;
  if (!Array.isArray(items)) throw new Error('后端无法修复：products 缺失或不是数组。');
  const key = value => String(value || '').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
  const list = value => {
    if (Array.isArray(value)) return value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean);
    if (typeof value !== 'string') return [];
    return value.split(/(?:\r?\n|[;；|])/).map(item => item.replace(/^[\s\-*•·]+/, '').trim()).filter(Boolean);
  };
  const field = (item, keys) => keys.map(name => item?.[name]).find(value => value !== undefined);
  const used = new Set();
  const products = [];
  names.forEach((name, index) => {
    let itemIndex = items.findIndex((item, candidateIndex) => !used.has(candidateIndex) && key(item?.name) === key(name));
    if (itemIndex < 0 && items[index] && !items[index].name && !used.has(index)) itemIndex = index;
    if (itemIndex < 0) return;
    used.add(itemIndex);
    const item = items[itemIndex];
    const reasonValue = field(item, ['reason', 'recommendationReason', 'recommendation_reason', 'why', '推荐理由']);
    const reason = typeof reasonValue === 'string' ? reasonValue.trim() : '';
    const pros = list(field(item, ['pros', 'advantages', 'highlights', '优点']));
    const cons = list(field(item, ['cons', 'disadvantages', 'cautions', '缺点', '注意事项']));
    if (!reason || !pros.length || !cons.length) return;
    products.push({ name, reason, pros, cons, link: jdSearchLink(name) });
  });
  if (products.length < 3) throw new Error('后端无法安全修复：至少需要 3 款商品具备完整的推荐理由、优点和缺点。');
  return { products };
}

function jdSearchLink(name) {
  return `https://search.jd.com/Search?keyword=${encodeURIComponent(name)}`;
}

function parseLockedProductDetails(content, names) {
  const result = parseResult(content, 'products');
  if (result.products.length !== names.length) throw new Error('商品文案数量与锁定名单不一致。');
  result.products.forEach((item, index) => {
    if (item.name !== names[index]) throw new Error('商品文案修改了锁定名单或顺序。');
    item.link = jdSearchLink(names[index]);
  });
  return result;
}

function diagnoseResponse(content, part) {
  if (typeof content !== 'string' || !content.trim()) return ['响应文本为空或不是字符串'];
  let data;
  try { data = parseCompatibleJSON(content); }
  catch (error) { return [`响应不是可直接解析的 JSON：${error.message}`]; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['JSON 顶层不是对象'];
  const issues = [];
  const nonempty = value => typeof value === 'string' && value.trim();
  if (part !== 'products' && !nonempty(data.guideContent)) issues.push('guideContent 缺失、为空或不是字符串');
  if (part !== 'guide') {
    if (!Array.isArray(data.products)) issues.push('products 缺失或不是数组');
    else {
      if (data.products.length < 3 || data.products.length > 6) issues.push(`商品数量为 ${data.products.length}，要求 3–6 款`);
      data.products.forEach((item, index) => {
        for (const field of ['name', 'reason']) {
          if (!nonempty(item?.[field])) issues.push(`products[${index}].${field} 缺失、为空或不是字符串`);
        }
        for (const field of ['pros', 'cons']) {
          if (!Array.isArray(item?.[field]) || !item[field].length || !item[field].every(nonempty)) issues.push(`products[${index}].${field} 必须是非空字符串数组`);
        }
        if (typeof item?.link !== 'string') issues.push(`products[${index}].link 缺失或不是字符串`);
      });
    }
  }
  return issues.length ? issues : ['未能提取符合校验要求的 JSON 对象，请检查原始响应'];
}

async function recordFailedResponse(query, part, content, error) {
  try {
    const directory = path.join(__dirname, 'logs');
    const entry = {
      time: new Date().toISOString(),
      part,
      endpoint: part === 'guide' ? 'ep-20260916175320-lqbt4' : process.env.ARK_EP_ID?.trim(),
      query,
      error: error.message,
      reasons: diagnoseResponse(content, part),
      rawResponse: content
    };
    let line = JSON.stringify(entry);
    const apiKey = process.env.ARK_API_KEY?.trim();
    if (apiKey) line = line.split(apiKey).join('[REDACTED]');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.appendFile(path.join(directory, 'failed-responses.jsonl'), line + '\n', { mode: 0o600 });
    console.error(`[AI 响应校验失败] ${part}，详情已记录至 logs/failed-responses.jsonl`);
  } catch {
    console.error('[AI 响应校验失败] 日志写入失败，请检查 logs 目录权限。');
  }
}

const guidePrompt = `角色：电商选购助手，面向普通买家，目标快速下单决策，拒绝教科书科普，内容要加emoji丰富攻略观感，必须有emoji加在每个大标题的分类项开头来替换序号123...，重点输出关键挑选维度部分，攻略风格要带点活人感。

输出结构：
【开篇速选卡】
先写开篇引言，引言为：想挑选XXX，先不要着急跟着热门榜单做决定，想知道购买什么xxx，重点是要弄清楚自己的需求，挑到合适的xxx，购买后更省心。
（然后给产品分成2-4个类别，并告诉用户每种类别适合什么需求。）
格式为：具体类别（例如办公本/游戏本）：类别描述+适合什么需求
固定引言结束后只输出一个换行符，紧接着开始写分类；每个类别单独占一行，每行开头必须使用一个符合该分类的 emoji 作为序号，相邻类别之间不得插入空白行。
自行理解开篇内容，引言正文和每个分类正文都必须至少识别一处真正有助于选购决策的重点信息，分类标题也要识别。用双星号包裹需要加粗的短语，每段可标记多处，但不要将整段标记为加粗。

【关键挑选维度】
包含3-5个挑选产品的最重要维度，若不满3个维度，则挑重点1个维度说就行。
每个维度要涉及维度解释+怎么选+避雷等内容，合在一起写成一段，且要写的有人味，且要给出适当参数参考，字数控制在120字左右。要注意，内容要易于理解、全面且不能太复杂，帮助用户理解为什么要看这个维度及如何根据需求结合维度进行挑选
每个维度开头必须使用一个符合该维度内容的 emoji 作为序号。如果维度标题单独成行，标题与正文之间只使用一个换行符，不得插入空白行，由页面统一显示半行间距。
每个维度必须单独成段，维度之间只使用一个换行符，不得插入空白行，禁止将多个维度连续写在同一行。
自行理解每个维度，在标题和正文中识别真正影响选购决策的重点信息。用双星号包裹需要加粗的短语，每段可标记多处，但不要将整段标记为加粗。

【小贴士】
总结选购2-4点选购思路或者1-2个关于用户所搜索的产品的相关知识（例如猫粮要科学换粮，具体怎么换粮等等），具体是选购思路还是产品知识要视产品情况而定
自行理解每点内容，在分类标题和正文中识别真正有助于选购决策的重点信息。用双星号包裹需要加粗的短语，每点可标记多处，但不要将整段标记为加粗。

【避雷提醒】
写1-2个相关产品需要避雷的方面，每条不超过30字。
只在每条正文中自行识别最关键的风险信息，用双星号包裹需要加粗的关键短语。不识别、不标记正文标题，不要将整条标记为加粗。

只生成选购攻略，沿用上述模板和约束，不生成商品推荐，不需要联网。输出前必须核对全文排版，正文中不得出现空白行，段落之间只使用单个换行符。引言中的XXX和xxx替换为用户搜索的产品名称。仅返回纯净JSON：{"guideContent":"完整选购攻略文本"}。`;

const productsPrompt = `你是电商平台产品选购AI助手。【商品推荐规则（仅适用于products，不改变选购攻略内容及规则）】
1、推荐6款符合用户需求的近期热门产品，以最热门、最火爆为核心，不分配性价比名额，不按价格档位凑数；用户有预算时满足预算。
2、联网查询近3个月的热门依据，避免冷门产品。换代快的电子产品必须是当前热门、当前最新迭代且正常在售的型号，排除被新一代替代的旧款。
3、每款推荐理由用一句易读短句，尽量30字以内；优点和缺点各2条，每条尽量20字以内，直接描述普通用户关心的体验，避免重复和长篇评测。
4、不编造销量、排名、版本和年份，无法核实的信息不表述为事实。
5、下方products是结构示例，优先输出6款；可靠候选不足6款时可少输出，但是至少3款，不得用配件或重复变体凑数。
6、products数组中每个商品的link必须输出完整京东搜索链接，模板为https://search.jd.com/Search?keyword=商品名称，将该商品name的完整产品名进行URL编码后填入keyword，不再使用#。link必须是合法的https链接，禁止编造item商品ID，禁止编造虚假详情页链接。
7、推荐商品必须是用户搜索品类本身，不能用相关配件或替换部件凑数。联网核验时确认商品实际售卖内容，不能仅凭标题包含搜索关键词就推荐；若用户明确搜索配件时，按该配件品类推荐。
8、name仅保留“品牌 + 系列/型号 + 必要的产品类型”，尽量控制在20字以内；完整型号优先，不要为了缩短名称截断型号。商品标题禁止包含尺寸、尺码、长宽高或屏幕大小，例如“14英寸”“24寸”“1.8米”“XL码”；相关信息如有推荐价值，放入reason或pros。删除营销词、促销信息、适用人群和场景、堆砌的功能参数，例如“旗舰款”“高音质”“超长续航”“学生专用”“运动游戏通用”等。颜色、套餐、容量等信息仅在区分具体推荐版本确有必要时保留。功能亮点放入reason或pros，不要堆在name中。京东搜索链接的keyword使用精简后的完整name并进行URL编码。

【联网商品核验要求】
必须先使用web_search联网查询近3个月国内电商近期热销商品，结合当前日期核验产品版本、在售状态及热门依据。优先查询京东、淘宝、天猫与品牌官方页面，排除已被新一代替代的旧款。不编造销量或排名；最终严格按下方结构只返回纯净JSON。

本次仅生成商品推荐，不生成攻略，不返回guideContent。只返回纯净JSON：{"products":[{"name":"","reason":"","pros":[""],"cons":[""],"link":"https://search.jd.com/Search?keyword=商品名称"}]}。优先推荐6款；可靠候选不足6款时可少展示，但是至少3款，不得用配件或重复变体凑数。`;

const productShortlistPrompt = `你是电商平台产品选购AI助手。先只确定商品名单，不写推荐理由、优缺点或图片。
必须使用 web_search 查询近3个月国内电商与品牌官方信息，选择符合用户搜索品类和预算的近期热门在售产品。换代快的电子产品排除已被替代的旧款；不得用配件、重复变体或冷门产品凑数；不编造销量、排名、版本和年份。
name仅保留“品牌 + 系列/完整型号 + 必要产品类型”，删除尺寸、营销词、适用人群和堆砌参数。优先6款，可靠候选不足时可返回3–5款。
只返回纯净JSON：{"products":[{"name":""}]}。`;

function productDetailsPrompt(names) {
  return `你是电商平台产品选购AI助手。商品名单已经完成联网核验并锁定。请只为名单中的商品补充推荐文案，不联网、不新增、删除、替换、改名或调整顺序。
锁定名单：${JSON.stringify(names)}
每款推荐理由用一句易读短句，尽量30字以内；优点和缺点各2条，每条尽量20字以内，描述普通用户关心的真实体验。不要编造销量、排名、版本、年份或无法从常识可靠判断的具体参数。
  每一项必须同时包含 name、reason、pros、cons、link 五个字段，不得只返回 name，不得省略任何字段。输出前逐项检查字段是否齐全。
  只返回纯净JSON：{"products":[{"name":"必须与锁定名单完全一致","reason":"必填的一句推荐理由","pros":["必填优点1","必填优点2"],"cons":["必填缺点1","必填缺点2"],"link":""}]}。products数量、名称和顺序必须与锁定名单完全一致。`;
}

async function recordTiming(entry) {
  try {
    const directory = path.join(__dirname, 'logs');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    // 不记录密钥、请求头、用户输入或 AI 正文。
    await fs.appendFile(path.join(directory, 'request-timings.jsonl'), JSON.stringify(entry) + '\n', { mode: 0o600 });
    console.info(`[AI 耗时] ${entry.part} ${entry.outcome} 总计 ${entry.totalMs}ms，调用 ${entry.attempts?.length ?? entry.imageVisionCalls ?? 0} 次，记录 ${entry.requestId}`);
  } catch {
    console.error('[AI 耗时] 日志写入失败');
  }
}

async function recordImageVisionEvaluations(requestId, evaluations) {
  if (!Array.isArray(evaluations) || !evaluations.length) return;
  try {
    const directory = path.join(__dirname, 'logs');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const lines = evaluations.map(evaluation => JSON.stringify({ requestId, ...evaluation })).join('\n') + '\n';
    await fs.appendFile(path.join(directory, 'image-vision-rankings.jsonl'), lines, { mode: 0o600 });
  } catch {
    console.error('[图片视觉筛选] 日志写入失败');
  }
}

// 流式预览只提取攻略字符串；最终结果仍走完整格式校验。
function partialGuide(source) {
  const match = /["']guideContent["']\s*:\s*(["'])/.exec(source);
  if (!match) return '';
  const start = match.index + match[0].length;
  let value = '';
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === match[1]) break;
    if (char !== '\\') { value += char; continue; }
    const escape = source[++i];
    if (!escape) break;
    if (escape === 'u') {
      const hex = source.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      value += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else {
      const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '"': '"', "'": "'", '\\': '\\', '/': '/' };
      if (!Object.hasOwn(escapes, escape)) break;
      value += escapes[escape];
    }
  }
  // 不提前展示尚未收到低代理项的 emoji。
  return value.replace(/[\uD800-\uDBFF]$/, '');
}

async function readAIStream(response, onPreview = () => {}, onEvent = () => {}) {
  const decoder = new TextDecoder();
  let pending = '', data = [], raw = '', payload;
  function dispatch() {
    if (!data.length) return;
    const text = data.join('\n'); data = [];
    if (text === '[DONE]') return;
    const event = JSON.parse(text);
    onEvent(event);
    if (event.type === 'response.output_text.delta') {
      raw += event.delta || '';
      onPreview(partialGuide(raw));
    }
    if (['response.completed', 'response.failed', 'response.incomplete'].includes(event.type)) payload = event.response;
    if (event.type === 'error') throw new Error('AI 生成未完成，请稍后重试。');
  }
  function line(text) {
    text = text.replace(/\r$/, '');
    if (!text) dispatch();
    else if (text.startsWith('data:')) data.push(text.slice(5).replace(/^ /, ''));
  }
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    let end;
    while ((end = pending.indexOf('\n')) !== -1) {
      line(pending.slice(0, end)); pending = pending.slice(end + 1);
    }
  }
  pending += decoder.decode();
  if (pending) line(pending);
  dispatch();
  if (!payload) throw new Error('AI 生成未完成，请稍后重试。');
  return payload;
}

async function callLLM(query, part = 'all', feedback = '', timing = {}, onPreview, config = {}) {
  const started = performance.now();
  timing.stage = 'configuration';
  try {
  const apiKey = process.env.ARK_API_KEY?.trim();
  const model = config.model || (part === 'guide' ? 'ep-20260916175320-lqbt4' : process.env.ARK_EP_ID?.trim());
  if (!apiKey || !model) {
    const error = new Error('请先在根目录 .env 中配置 ARK_API_KEY 和 ARK_EP_ID，然后重启服务。');
    error.status = 503;
    throw error;
  }
  timing.stage = 'waiting_for_headers';
  const upstreamStarted = performance.now();
  const timeoutSignal = AbortSignal.timeout(120000);
  const upstreamSignal = config.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([timeoutSignal, config.signal]) : timeoutSignal;
  const webSearchEnabled = part !== 'guide' && config.webSearch !== false;
  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: upstreamSignal,
    body: JSON.stringify({
      model,
      ...(onPreview || config.onEvent ? { stream: true } : {}),
      temperature: 0.3,
      thinking: { type: 'disabled' },
      ...(webSearchEnabled ? { tools: [{ type: 'web_search' }] } : {}),
      input: [
        { role: 'system', content: config.prompt || (part === 'guide' ? guidePrompt : part === 'products' ? productsPrompt : systemPrompt) },
        { role: 'user', content: `当前日期：${new Date().toISOString().slice(0, 10)}。用户搜索：${query.trim()}` },
        ...(feedback ? [{ role: 'user', content: `上次响应未通过格式校验：${feedback}。请重新生成完整结果，严格使用标准 JSON 双引号，确保所有必需字段及商品数量正确，不输出解释。` }] : [])
      ],
      max_output_tokens: config.maxOutputTokens || 7000
    })
  });
  timing.headersMs = elapsed(upstreamStarted);
  timing.httpStatus = response.status;
  if (!response.ok) {
    // 保留服务商错误码用于排查，不记录响应正文或鉴权信息。
    const failure = await response.json().catch(() => ({}));
    const code = failure.error?.code;
    if (typeof code === 'string' && /^[\w.-]{1,100}$/.test(code)) timing.providerErrorCode = code;
    const error = new Error(response.status === 401 ? '火山方舟密钥无效，请检查配置后重启服务。' : response.status === 402 ? '火山方舟账户余额不足，请充值后重试。' : response.status === 429 ? '请求过于频繁，请稍后再试。' : '火山方舟服务暂时不可用，请确认接入点支持 Responses API 和联网搜索后重试。');
    if (response.status === 429) {
      error.message = /quota/i.test(code || '')
        ? 'AI 服务配额已用尽，请检查火山方舟配额后重试。'
        : 'AI 服务繁忙或触发限流，请稍后重试。';
    }
    error.status = 502;
    throw error;
  }
  timing.stage = 'reading_response';
  const bodyStarted = performance.now();
  let payload;
  try { payload = onPreview || config.onEvent ? await readAIStream(response, onPreview, config.onEvent) : await response.json(); }
  finally { timing.bodyMs = elapsed(bodyStarted); }
  timing.stage = 'checking_response';
  timing.providerStatus = payload.status;
  timing.webSearchCalls = Array.isArray(payload.output) ? payload.output.filter(item => item.type === 'web_search_call').length : 0;
  timing.inputTokens = payload.usage?.input_tokens;
  timing.outputTokens = payload.usage?.output_tokens;
  if (payload.status === 'incomplete' || payload.status === 'failed' || payload.error) throw new Error('AI 生成未完成，请稍后重试。');
  if (!Array.isArray(payload.output) || (webSearchEnabled && !payload.output.some(item => item.type === 'web_search_call' && item.status === 'completed'))) throw new Error('AI 未完成联网查询，请稍后重试。');
  timing.stage = 'completed';
  return payload.output.filter(item => item.type === 'message' && item.role === 'assistant')
    .flatMap(item => Array.isArray(item.content) ? item.content : [])
    .filter(part => part.type === 'output_text' && typeof part.text === 'string')
    .map(part => part.text).join('');
  } catch (error) {
    timing.errorType = error.name;
    throw error;
  } finally {
    timing.aiMs = elapsed(started);
  }
}

async function handleSearch(req, res, part = 'all') {
  const query = req.body?.query;
  if (typeof query !== 'string' || !query.trim() || query.trim().length > 100) {
    return res.status(400).json({ error: '请输入 1–100 字的商品关键词。' });
  }
  const streaming = part === 'guide' && req.body?.stream === true;
  const send = (type, data) => { if (!res.destroyed) res.write(JSON.stringify({ type, ...data }) + '\n'); };
  const reply = (status, data) => {
    if (!streaming) return res.status(status).json(data);
    send(status >= 400 ? 'error' : 'done', data);
    res.end();
  };
  if (streaming) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
  }
  const started = performance.now();
  const timing = { time: new Date().toISOString(), requestId: randomUUID(), part, outcome: 'failed', attempts: [] };
  try {
    let feedback = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const attemptTiming = { attempt: attempt + 1 };
      timing.attempts.push(attemptTiming);
      let validationStarted = performance.now();
      let content = '';
      let result;
      let imagesAlreadyEnriched = false;
      try {
        if (part === 'products') {
          const shortlistTiming = {};
          try {
            content = await callLLM(query, 'products', feedback, shortlistTiming, undefined, {
              prompt: productShortlistPrompt,
              signal: req.signal,
              maxOutputTokens: 1200
            });
          } catch (error) {
            attemptTiming.shortlist = shortlistTiming;
            Object.assign(attemptTiming, {
              stage: shortlistTiming.stage,
              aiMs: shortlistTiming.aiMs || 0,
              httpStatus: shortlistTiming.httpStatus,
              providerErrorCode: shortlistTiming.providerErrorCode,
              errorType: shortlistTiming.errorType
            });
            throw error;
          }
          attemptTiming.aiMs = shortlistTiming.aiMs || 0;
          attemptTiming.inputTokens = shortlistTiming.inputTokens || 0;
          attemptTiming.outputTokens = shortlistTiming.outputTokens || 0;
          attemptTiming.webSearchCalls = shortlistTiming.webSearchCalls || 0;
          attemptTiming.stage = shortlistTiming.stage;
          validationStarted = performance.now();
          const shortlist = parseProductShortlist(content);
          attemptTiming.shortlist = shortlistTiming;
          if (shortlist.completeResult) {
            // 兼容旧格式响应与测试桩；正常线上名单阶段不会进入这里。
            result = shortlist.completeResult;
          } else {
            const detailsTimings = [];
            const visionUsage = {};
            const visionEvaluations = [];
            const parallelStarted = performance.now();
            const imageStarted = performance.now();
            const imagePromise = POPULAR_PRODUCT_IMAGES_ENABLED
              ? enrichPopularProductImages({ products: shortlist.names.map(name => ({ name })) }, {
                  signal: req.signal,
                  visionUsage,
                  visionEvaluations
                })
              : Promise.resolve({ products: shortlist.names.map(name => ({ name, imageUrl: null, imageCandidates: [] })) });
            const detailsPromise = (async () => {
              let detailsFeedback = '';
              for (let detailAttempt = 0; detailAttempt < 2; detailAttempt++) {
                const detailTiming = { attempt: detailAttempt + 1 };
                detailsTimings.push(detailTiming);
                const detailsContent = await callLLM(query, 'product-details', detailsFeedback, detailTiming, undefined, {
                  prompt: productDetailsPrompt(shortlist.names),
                  signal: req.signal,
                  webSearch: false,
                  maxOutputTokens: 2200
                });
                content = detailsContent;
                try {
                  return { detailsContent, detailsResult: parseLockedProductDetails(detailsContent, shortlist.names) };
                } catch (error) {
                  detailsFeedback = `商品文案格式不完整：${error.message}。必须为锁定名单中的每款商品完整返回 name、reason、pros、cons、link 五个字段。`;
                  if (detailAttempt === 1) {
                    return { detailsContent, detailsResult: repairProductDetails(detailsContent, shortlist.names), repaired: true };
                  }
                }
              }
            })();
            const [details, imageResult] = await Promise.all([detailsPromise, imagePromise]);
            content = details.detailsContent;
            validationStarted = performance.now();
            result = details.detailsResult;
            const imagesByName = new Map(imageResult.products.map(product => [product.name, product]));
            result.products = result.products.map((product, index) => ({
              ...product,
              imageUrl: imagesByName.get(product.name)?.imageUrl || imageResult.products[index]?.imageUrl || null,
              imageCandidates: imagesByName.get(product.name)?.imageCandidates || imageResult.products[index]?.imageCandidates || []
            }));
            await recordImageVisionEvaluations(timing.requestId, visionEvaluations);
            attemptTiming.details = detailsTimings;
            attemptTiming.detailsRetryCount = Math.max(0, detailsTimings.length - 1);
            attemptTiming.detailsRepaired = details.repaired === true;
            attemptTiming.parallelMs = elapsed(parallelStarted);
            attemptTiming.imageMs = elapsed(imageStarted);
            attemptTiming.imageCount = result.products.filter(product => product.imageUrl).length;
            attemptTiming.imageVisionCalls = visionUsage.calls || 0;
            attemptTiming.imageVisionInputTokens = visionUsage.inputTokens || 0;
            attemptTiming.imageVisionOutputTokens = visionUsage.outputTokens || 0;
            attemptTiming.imageVisionTotalTokens = visionUsage.totalTokens || 0;
            attemptTiming.inputTokens = (shortlistTiming.inputTokens || 0) + detailsTimings.reduce((sum, item) => sum + (item.inputTokens || 0), 0);
            attemptTiming.outputTokens = (shortlistTiming.outputTokens || 0) + detailsTimings.reduce((sum, item) => sum + (item.outputTokens || 0), 0);
            attemptTiming.webSearchCalls = shortlistTiming.webSearchCalls || 0;
            attemptTiming.aiMs = (shortlistTiming.aiMs || 0) + detailsTimings.reduce((sum, item) => sum + (item.aiMs || 0), 0);
            attemptTiming.stage = 'completed';
            imagesAlreadyEnriched = true;
          }
        } else {
          content = await callLLM(query, part, feedback, attemptTiming, streaming ? guideContent => send('preview', { guideContent }) : undefined, { signal: req.signal });
          validationStarted = performance.now();
          result = parseResult(content, part);
        }
        attemptTiming.validation = 'passed';
      }
      catch (error) {
        attemptTiming.validationMs = elapsed(validationStarted);
        attemptTiming.validation = 'failed';
        await recordFailedResponse(query, part, content, error);
        feedback = diagnoseResponse(content, part).join('；');
        if (attempt === 0) { if (streaming) send('reset', {}); continue; }
        return reply(502, { error: part === 'products' ? '商品推荐暂时生成失败，请点击重试' : '选购攻略暂时生成失败，请点击重试' });
      }
      attemptTiming.validationMs = elapsed(validationStarted);
      if (part !== 'guide' && result.products && !imagesAlreadyEnriched && POPULAR_PRODUCT_IMAGES_ENABLED) {
        const imageStarted = performance.now();
        const visionUsage = {};
        const visionEvaluations = [];
        result = await enrichPopularProductImages(result, { signal: req.signal, visionUsage, visionEvaluations });
        await recordImageVisionEvaluations(timing.requestId, visionEvaluations);
        attemptTiming.imageMs = elapsed(imageStarted);
        attemptTiming.imageCount = result.products.filter(product => product.imageUrl).length;
        attemptTiming.imageVisionCalls = visionUsage.calls || 0;
        attemptTiming.imageVisionInputTokens = visionUsage.inputTokens || 0;
        attemptTiming.imageVisionOutputTokens = visionUsage.outputTokens || 0;
        attemptTiming.imageVisionTotalTokens = visionUsage.totalTokens || 0;
      }
      timing.outcome = 'success';
      const resultId = timing.requestId;
      const directory = path.join(__dirname, 'logs');
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await fs.appendFile(path.join(directory, 'feedback-results.jsonl'), JSON.stringify({ resultId, time: new Date().toISOString(), query: query.trim(), part, result }) + '\n', { mode: 0o600 });
      return reply(200, {
        ...result,
        ...(part === 'products' ? { productImagesEnabled: POPULAR_PRODUCT_IMAGES_ENABLED } : {}),
        resultId
      });
    }
  } catch (error) {
    timing.errorType = error.name;
    reply(error.status || 502, { error: error.status || error.message?.startsWith('AI ') ? error.message : error.name === 'AbortError' ? '生成超时，请稍后重新搜索。' : '无法连接 AI 服务，请检查网络后重试。' });
  }
  finally {
    timing.totalMs = elapsed(started);
    timing.retryCount = Math.max(0, timing.attempts.length - 1);
    await recordTiming(timing);
  }
}

app.post('/api/search', (req, res) => handleSearch(req, res));
app.post('/api/guide', (req, res) => handleSearch(req, res, 'guide'));
app.post('/api/products', (req, res) => handleSearch(req, res, 'products'));
app.post('/api/product-image', async (req, res) => {
  if (!POPULAR_PRODUCT_IMAGES_ENABLED) {
    return res.status(503).json({ error: '测试期间已暂停热门商品图片' });
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 200) return res.status(400).json({ error: '商品名称无效' });
  const started = performance.now();
  const visionUsage = {};
  const visionEvaluations = [];
  try {
    const searched = await searchProductImages(name, { signal: req.signal });
    let imageCandidates = searched;
    try { imageCandidates = await rankProductImagesWithVision(name, searched, { signal: req.signal, usage: visionUsage, evaluations: visionEvaluations }); }
    catch { imageCandidates = []; /* 补图未经视觉确认时保留缺图占位。 */ }
    res.json({ imageUrl: imageCandidates[0] || null, imageCandidates });
  } catch {
    res.status(502).json({ error: '商品图片暂时获取失败' });
  } finally {
    const requestId = randomUUID();
    await recordImageVisionEvaluations(requestId, visionEvaluations);
    await recordTiming({
      time: new Date().toISOString(),
      requestId,
      part: 'product-image',
      outcome: res.statusCode < 400 ? 'success' : 'failed',
      productName: name,
      imageVisionCalls: visionUsage.calls || 0,
      imageVisionInputTokens: visionUsage.inputTokens || 0,
      imageVisionOutputTokens: visionUsage.outputTokens || 0,
      imageVisionTotalTokens: visionUsage.totalTokens || 0,
      totalMs: elapsed(started)
    });
  }
});

require('./personalized')({
  app,
  callLLM,
  parseResult,
  productsPrompt,
  recordTiming,
  enrichProductImages: enrichPopularProductImages,
  recordImageVisionEvaluations
});

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
app.post('/api/feedback', async (req, res) => {
  const { feedbackId, resultId, part, query, vote, reason = null, other = '', source = 'popular', sessionId = null } = req.body || {};
  if (!['popular', 'personalized'].includes(source) || (source === 'personalized' && (part !== 'products' || typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(sessionId))) || !['guide', 'products'].includes(part) || !['useful', 'useless'].includes(vote)
    || ![feedbackId, resultId].every(value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value))
    || typeof query !== 'string' || !query.trim() || query.length > 100
    || (reason !== null && !(source === 'personalized' ? personalizedFeedbackReasons : feedbackReasons[part]).includes(reason))
    || (vote === 'useful' && reason !== null)
    || typeof other !== 'string' || other.length > 500 || (reason !== '其他' && other !== '')) {
    return res.status(400).json({ error: '反馈格式不正确，请重新选择。' });
  }
  try {
    const directory = path.join(__dirname, 'logs');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    // 同一 feedbackId 的后续记录补充原因，统计时取最后一条。
    await fs.appendFile(path.join(directory, 'user-feedback.jsonl'), JSON.stringify({ time: new Date().toISOString(), feedbackId, resultId, part, query: query.trim(), vote, reason, source, sessionId, other: other.trim() }) + '\n', { mode: 0o600 });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: '反馈未能保存，请重试。' });
  }
});

app.use((error, req, res, next) => {
  res.status(error.status === 413 ? 413 : 400).json({ error: '请求格式不正确或内容过长，请重新输入。' });
});

if (require.main === module) {
  app.listen(port, () => console.log(`选购助手已启动：http://localhost:${port}`));
}

module.exports = { app, parseResult, repairProductDetails, callLLM, partialGuide, readAIStream, imageResultScore, selectProductImageCandidates, searchProductImages, rankProductImagesWithVision, enrichPopularProductImages };

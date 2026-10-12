const { test } = require('node:test');
const assert = require('node:assert/strict');
const { partialGuide, readAIStream } = require('../server');

test('攻略增量解码保留换行、引号与 emoji，不展示 JSON 外壳', () => {
  assert.equal(partialGuide('{"guideContent":"你好\\n世'), '你好\n世');
  assert.equal(partialGuide('{"guideContent":"\\uD83D'), '');
  assert.equal(partialGuide('{"guideContent":"\\uD83D\\uDE00\\"好\\""}'), '😀"好"');
});
test('SSE 按字节拆分仍可逐步展示，收到完成事件前已有预览', async () => {
  const previews = [];
  const payload = { status: 'completed', output: [] };
  async function* body() {
    const first = 'data: ' + JSON.stringify({ type: 'response.output_text.delta', delta: '{"guideContent":"你好😀' }) + '\r\n\r\n';
    for (const byte of Buffer.from(first)) yield Uint8Array.of(byte);
    assert.deepEqual(previews, ['你好😀']);
    yield Buffer.from('data: ' + JSON.stringify({ type: 'response.completed', response: payload }) + '\n\n');
  }
  assert.deepEqual(await readAIStream({ body: body() }, text => previews.push(text)), payload);
});
test('中断的 SSE 不被当作成功', async () => {
  async function* body() { yield Buffer.from('data: {"type":"response.output_text.delta","delta":"半截"}\n\n'); }
  await assert.rejects(readAIStream({ body: body() }, () => {}), /未完成/);
});
test('SSE 将联网搜索事件交给进度监听器，同时保留最终响应', async () => {
  const events = [];
  const payload = { status: 'completed', output: [{ type: 'web_search_call', status: 'completed' }] };
  async function* body() {
    yield Buffer.from('data: ' + JSON.stringify({ type: 'response.web_search_call.in_progress' }) + '\n\n');
    yield Buffer.from('data: ' + JSON.stringify({ type: 'response.completed', response: payload }) + '\n\n');
  }
  assert.deepEqual(await readAIStream({ body: body() }, undefined, event => events.push(event.type)), payload);
  assert.deepEqual(events, ['response.web_search_call.in_progress', 'response.completed']);
});

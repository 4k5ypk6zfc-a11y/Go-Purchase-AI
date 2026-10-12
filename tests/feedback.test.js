const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { app } = require('../server');
const handler = app._router.stack.find(layer => layer.route?.path === '/api/feedback').route.stack[0].handle;

test('反馈保存关联结果，拒绝多选与跨模块原因；存储失败不返回成功', async () => {
  const original = fs.appendFile;
  const records = [];
  fs.appendFile = async (path, line) => records.push(JSON.parse(line));
  const base = { feedbackId: 'feedback-1', resultId: 'result-1', query: '手机', part: 'guide', vote: 'useless', reason: null, other: '' };
  async function request(body) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ body }, res);
    return res;
  }
  try {
    assert.equal((await request(base)).code, 200);
    assert.equal((await request({ ...base, reason: '其他', other: '想了解维修成本' })).code, 200);
    assert.equal(records[1].resultId, 'result-1');
    assert.equal(records[1].other, '想了解维修成本');
    assert.equal((await request({ ...base, reason: ['内容复杂，看不懂'] })).code, 400);
    assert.equal((await request({ ...base, reason: '疑似广告' })).code, 400);
    assert.equal((await request({ ...base, vote: 'useful', reason: '其他' })).code, 400);
    assert.equal(records.length, 2);
    fs.appendFile = async () => { throw new Error('disk unavailable'); };
    assert.equal((await request(base)).code, 500);
  } finally { fs.appendFile = original; }
});

test('为你推荐只接受专属反馈原因，其他说明可留空', async () => {
  const original = fs.appendFile;
  const records = [];
  fs.appendFile = async (path, line) => records.push(JSON.parse(line));
  const base = { feedbackId: 'feedback-2', resultId: 'result-2', sessionId: 'session-2', source: 'personalized', query: '耳机', part: 'products', vote: 'useless', other: '' };
  async function request(body) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ body }, res);
    return res;
  }
  try {
    assert.equal((await request({ ...base, reason: '问题质量差' })).code, 200);
    assert.equal((await request({ ...base, reason: '其他' })).code, 200);
    assert.equal(records[1].other, '');
    assert.equal((await request({ ...base, reason: '超出预算' })).code, 400);
    assert.equal((await request({ ...base, reason: '对推荐的商品不感兴趣' })).code, 400);
    assert.equal((await request({ ...base, reason: '推荐生成的问题质量差' })).code, 400);
  } finally { fs.appendFile = original; }
});

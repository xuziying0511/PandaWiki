import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import ExcelJS from 'exceljs';

// Compile the two pure export modules without requiring the browser or API.
function loadModule(name) {
  return loadUrl(new URL(`../src/pages/${name}.ts`, import.meta.url));
}
function loadUrl(url) {
  const code = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    specifier =>
      specifier.startsWith('.')
        ? loadUrl(new URL(`${specifier}.ts`, url))
        : createRequire(url)(specifier),
    module,
    module.exports,
  );
  return module.exports;
}
const { conversationRows } = loadModule('conversation/exportRows');
const { createConversationWorkbook } = loadModule('conversation/exportXlsx');
const record = {
  id: 'session-a',
  subject: '框架协议',
  created_at: '2026-10-08T08:00:00Z',
};

test('多轮问答、未回答问题与图片均保留，思考内容不进入正式答案', () => {
  const rows = conversationRows(
    record,
    {
      messages: [
        {
          role: 'user',
          content: '怎么维护？',
          image_paths: ['https://example.com/image.png'],
        },
        { role: 'assistant', content: '<think>内部推理</think>第一步\n第二步' },
        { role: 'user', content: '供应商呢？' },
        { role: 'assistant', content: '请联系采购方' },
        { role: 'user', content: '未完成的问题' },
      ],
    },
    'Wiki 网站',
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map(row => row[6]),
    ['1', '2', '3'],
  );
  assert.equal(rows[0][8], 'https://example.com/image.png');
  assert.equal(rows[0][9], '第一步\n第二步');
  assert.equal(rows[2][7], '未完成的问题');
  assert.equal(rows[2][9], '');
});

test('XLSX 序列化后保留内容、会话映射和可读样式，公式样式的输入仍为文本', async () => {
  const rows = conversationRows(
    record,
    {
      messages: [
        { role: 'user', content: '=HYPERLINK("https://example.com","测试")' },
        { role: 'assistant', content: '第一行\n第二行，保留"引号"' },
        { role: 'user', content: '追问' },
        { role: 'assistant', content: '答复' },
      ],
    },
    'Wiki 网站',
  );
  rows.push(
    ...conversationRows(
      { ...record, id: 'session-b' },
      { messages: [] },
      'Wiki 网站',
    ),
  );
  const original = createConversationWorkbook(rows, '2026-10-08 16:00:00');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await original.xlsx.writeBuffer());
  const detail = workbook.getWorksheet('问答明细');
  const directory = workbook.getWorksheet('会话目录');
  assert.equal(detail.rowCount, 7);
  assert.equal(directory.rowCount, 6);
  assert.equal(detail.getCell('B5').value, '会话001');
  assert.equal(detail.getCell('B6').value, '会话001');
  assert.equal(detail.getCell('B7').value, '会话002');
  assert.equal(directory.getCell('G5').value, 'session-a');
  assert.equal(directory.getCell('G6').value, 'session-b');
  assert.equal(directory.getCell('F5').value, 2);
  assert.equal(detail.getCell('E5').value, rows[0][7]);
  assert.equal(detail.getCell('E5').type, ExcelJS.ValueType.String);
  assert.equal(detail.getCell('F5').value, rows[0][9]);
  assert.equal(detail.views[0].ySplit, 4);
  assert.equal(detail.getCell('F5').alignment.wrapText, true);
  assert.equal(detail.getCell('A4').fill.fgColor.argb, 'FF2155A3');
  assert.equal(detail.autoFilter, 'A4:G7');
});

test('拒绝 Excel 无法保存的超长单元格，避免静默截断数据', () => {
  const rows = conversationRows(
    record,
    {
      messages: [
        { role: 'user', content: '问题' },
        { role: 'assistant', content: '答'.repeat(32768) },
      ],
    },
    'Wiki 网站',
  );
  assert.throws(() => createConversationWorkbook(rows, ''), /32767/);
});

const { feedbackExportRow } = loadModule('feedback/feedbackExportData');
const { createFeedbackWorkbook } = loadModule('feedback/exportXlsx');

test('反馈导出保留三档结果、真实原因及历史赞踩，不将缺失原因推断为解决理由', async () => {
  const scores = [3, 2, 4, 1, -1];
  const rows = scores.map((score, i) =>
    feedbackExportRow(
      {
        id: `answer-${i}`,
        conversation_id: 'same-session',
        question: `问题${i}`,
        info: { score: 1 },
      },
      {
        id: `answer-${i}`,
        conversation_id: 'same-session',
        content: '<think>推理</think>正式答案',
        info: {
          score,
          feedback_type: i === 0 ? '' : i === 4 ? '1' : '操作步骤不清楚',
          feedback_content: i === 0 ? '' : '=用户原始补充',
        },
      },
      'Wiki 网站',
    ),
  );
  assert.deepEqual(
    rows.map(row => row.result),
    ['已解决', '部分解决', '未解决', '点赞（历史评价）', '点踩（历史评价）'],
  );
  assert.equal(rows[0].reason, '未填写');
  assert.equal(rows[0].comment, '未填写');
  assert.equal(rows[4].reason, '内容不准确');
  assert.equal(rows[1].answer, '正式答案');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    await createFeedbackWorkbook(rows, '2026-10-08').xlsx.writeBuffer(),
  );
  const sheet = workbook.getWorksheet('反馈明细');
  const index = workbook.getWorksheet('反馈索引');
  assert.equal(sheet.rowCount, 9);
  assert.equal(sheet.getCell('C5').value, '已解决');
  assert.equal(sheet.getCell('D5').value, '未填写');
  assert.equal(sheet.getCell('D6').value, '操作步骤不清楚');
  assert.equal(sheet.getCell('E6').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('E6').value, '=用户原始补充');
  assert.equal(sheet.getCell('B5').value, sheet.getCell('B9').value);
  assert.equal(index.getCell('G9').value, 'answer-4');
  assert.equal(index.getCell('F9').value, 'same-session');
  assert.equal(sheet.autoFilter, 'A4:H9');
  assert.equal(sheet.getCell('A4').fill.fgColor.argb, 'FF2155A3');
});

test('反馈详情不匹配时中止导出，防止原因和回答错配', () => {
  assert.throws(
    () => feedbackExportRow({ id: 'a' }, { id: 'b' }, ''),
    /不匹配/,
  );
});

import ExcelJS from 'exceljs';
import { setupSheet, addDataRow } from '../../utils/exportWorkbook';

/** 输入列沿用会话数据提取顺序；原始 ID 留在目录中，不改变服务端会话标识。 */
export function createConversationWorkbook(
  rows: string[][],
  exportedAt: string,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '智采商城';
  workbook.subject = '问答互动记录';
  const groups = new Map<
    string,
    { number: string; first: string[]; count: number }
  >();
  for (const row of rows) {
    if (!row[0]) throw new Error('问答记录缺少会话 ID，请重新导出');
    const group = groups.get(row[0]);
    if (group) group.count += 1;
    else
      groups.set(row[0], {
        number: `会话${String(groups.size + 1).padStart(3, '0')}`,
        first: row,
        count: 1,
      });
  }
  const detail = setupSheet(
    workbook,
    '问答明细',
    `导出时间：${exportedAt} ｜ ${groups.size} 条会话 / ${rows.length} 轮记录 ｜ 会话编号仅用于本文件；长文本可在编辑栏查看完整内容。`,
    [
      '序号',
      '会话编号',
      '轮次',
      '问答时间',
      '用户问题',
      'AI 回答',
      '问题图片地址',
    ],
    [8, 14, 8, 23, 42, 76, 34],
  );
  rows.forEach((row, index) => {
    const group = groups.get(row[0])!;
    const alternate = Number(group.number.slice(2)) % 2 === 0;
    addDataRow(
      detail,
      [index + 1, group.number, Number(row[6]), row[5], row[7], row[9], row[8]],
      alternate,
    );
  });
  const directory = setupSheet(
    workbook,
    '会话目录',
    `导出时间：${exportedAt} ｜ 原始会话 ID 用于追溯同一对话；同一会话的所有轮次共用一个 ID。`,
    [
      '会话编号',
      '会话主题',
      '来源渠道',
      '来源用户',
      '来源 IP',
      '轮次数',
      '原始会话 ID',
    ],
    [14, 58, 18, 22, 24, 10, 40],
  );
  [...groups.values()].forEach((group, index) => {
    const row = group.first;
    addDataRow(
      directory,
      [group.number, row[1], row[2], row[3], row[4], group.count, row[0]],
      index % 2 === 1,
    );
  });
  for (const sheet of [detail, directory]) {
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: sheet.rowCount, column: 7 },
    };
  }
  return workbook;
}

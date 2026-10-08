import ExcelJS from 'exceljs';

const blue = 'FF2155A3';
const ink = 'FF24344D';
const pale = 'FFF1F6FD';

function setupSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  subtitle: string,
  headers: string[],
  widths: number[],
) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 4, showGridLines: false }],
    properties: { defaultRowHeight: 26, tabColor: { argb: blue } },
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  sheet.columns = widths.map(width => ({ width }));
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getCell(1, 1).value = `智采商城 · ${name}`;
  sheet.getCell(1, 1).font = {
    name: '微软雅黑',
    size: 18,
    bold: true,
    color: { argb: blue },
  };
  sheet.getRow(1).height = 38;
  sheet.mergeCells(2, 1, 2, headers.length);
  sheet.getCell(2, 1).value = subtitle;
  sheet.getCell(2, 1).font = {
    name: '微软雅黑',
    size: 10,
    color: { argb: 'FF62748C' },
  };
  sheet.getCell(2, 1).alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(2).height = 34;
  sheet.getRow(3).height = 10;
  const header = sheet.getRow(4);
  header.values = headers;
  header.height = 30;
  header.eachCell(cell => {
    cell.font = {
      name: '微软雅黑',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.pageSetup.printTitlesRow = '1:4';
  sheet.headerFooter.oddFooter = '&L智采商城 AI 知识助手&R第 &P 页 / 共 &N 页';
  return sheet;
}

function addDataRow(
  sheet: ExcelJS.Worksheet,
  values: (string | number)[],
  alternate: boolean,
) {
  // Excel 的单元格有长度限制，避免静默丢失问答内容。
  if (values.some(value => typeof value === 'string' && value.length > 32767)) {
    throw new Error(
      '单条问答内容超过 Excel 单元格的 32767 字符上限，请缩小选择范围并单独查看该会话',
    );
  }
  const row = sheet.addRow(values);
  let lines = 1;
  row.eachCell({ includeEmpty: true }, (cell, index) => {
    // 明确使用字符串值，用户输入的 =、+ 等不会被当作公式执行。
    cell.font = { name: '微软雅黑', size: 11, color: { argb: ink } };
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: alternate ? pale : 'FFFFFFFF' },
    };
    cell.border = { bottom: { style: 'hair', color: { argb: 'FFDDE6F2' } } };
    const width = Math.max(8, (sheet.getColumn(index).width || 20) - 2);
    const count = String(cell.value ?? '')
      .split('\n')
      .reduce((total, line) => {
        const length = Array.from(line).reduce(
          (n, char) => n + (char.charCodeAt(0) > 255 ? 2 : 1),
          0,
        );
        return total + Math.max(1, Math.ceil(length / width));
      }, 0);
    lines = Math.max(lines, count);
  });
  row.height = Math.min(360, Math.max(32, lines * 17 + 12));
  return row;
}

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

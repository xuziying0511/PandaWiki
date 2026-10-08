import type ExcelJS from 'exceljs';

const blue = 'FF2155A3';
const ink = 'FF24344D';
const pale = 'FFF1F6FD';

export function setupSheet(
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

export function addDataRow(
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

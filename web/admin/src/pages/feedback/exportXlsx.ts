import ExcelJS from 'exceljs';
import { setupSheet, addDataRow } from '../../utils/exportWorkbook';
import type { FeedbackExportRow } from './feedbackExportData';

export function createFeedbackWorkbook(
  rows: FeedbackExportRow[],
  exportedAt: string,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '智采商城';
  const groups = new Map<string, string>();
  for (const row of rows) {
    if (row.conversationId && !groups.has(row.conversationId))
      groups.set(
        row.conversationId,
        `会话${String(groups.size + 1).padStart(3, '0')}`,
      );
  }
  const detail = setupSheet(
    workbook,
    '反馈明细',
    `导出时间：${exportedAt} ｜ 共 ${rows.length} 条评价 ｜ 原因及说明来自用户填写；未填写不代表没有原因，历史“已解决”可能未采集原因。长文本可在编辑栏查看。`,
    [
      '序号',
      '会话编号',
      '评价结果',
      '反馈原因',
      '补充说明',
      '用户问题',
      'AI 回答',
      '问答时间',
    ],
    [8, 14, 18, 28, 38, 42, 76, 23],
  );
  const indexSheet = setupSheet(
    workbook,
    '反馈索引',
    '序号与反馈明细逐行对应；会话编号仅用于本文件，原始会话 ID 和回答 ID 用于追溯。',
    [
      '序号',
      '会话编号',
      '来源渠道',
      '来源用户',
      '来源 IP',
      '原始会话 ID',
      '回答 ID',
    ],
    [8, 14, 18, 22, 24, 40, 40],
  );
  rows.forEach((row, i) => {
    const number = groups.get(row.conversationId) || '未提供';
    addDataRow(
      detail,
      [
        i + 1,
        number,
        row.result,
        row.reason,
        row.comment,
        row.question,
        row.answer,
        row.time,
      ],
      i % 2 === 1,
    );
    addDataRow(
      indexSheet,
      [
        i + 1,
        number,
        row.source,
        row.user,
        row.ip,
        row.conversationId,
        row.messageId,
      ],
      i % 2 === 1,
    );
  });
  for (const sheet of [detail, indexSheet])
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: sheet.rowCount, column: sheet.columnCount },
    };
  return workbook;
}

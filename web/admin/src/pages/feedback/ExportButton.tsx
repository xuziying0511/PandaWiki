import { AppType } from '@/constant/enums';
import {
  getApiV1ConversationMessageList,
  getApiV1ConversationMessageDetail,
} from '@/request/Message';
import type { DomainConversationMessageListItem } from '@/request/types';
import { message } from '@ctzhian/ui';
import { Button, Stack, Tooltip } from '@mui/material';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import {
  feedbackExportRow,
  type FeedbackExportRow,
} from './feedbackExportData';

interface ExportButtonProps {
  kbId: string;
  selectedRecords: DomainConversationMessageListItem[];
}

const ExportButton = ({ kbId, selectedRecords }: ExportButtonProps) => {
  const controllerRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, [kbId]);

  const handleExport = async (selectedOnly: boolean) => {
    if (
      controllerRef.current ||
      !kbId ||
      (selectedOnly && selectedRecords.length === 0)
    )
      return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;
    setProgress('读取记录…');

    try {
      const records: DomainConversationMessageListItem[] = selectedOnly
        ? [...selectedRecords]
        : [];
      if (!selectedOnly) {
        const seen = new Set<string>();
        let expectedTotal = 0;
        for (let page = 1; ; page += 1) {
          const result = await getApiV1ConversationMessageList(
            { kb_id: kbId, page, per_page: 100 },
            { signal },
          );
          signal.throwIfAborted();
          const items = result.data || [];
          if (page === 1) expectedTotal = result.total || 0;
          else if (items.length > 0 && result.total !== expectedTotal) {
            throw new Error('反馈记录发生变化，请重新导出');
          }
          const previousCount = records.length;
          for (const item of items) {
            if (!item.id) throw new Error('反馈记录缺少 ID');
            if (!seen.has(item.id)) {
              seen.add(item.id);
              records.push(item);
            }
          }
          if (items.length === 0 || records.length >= expectedTotal) break;
          if (records.length === previousCount)
            throw new Error('反馈分页没有返回新记录，请重新导出');
        }
        if (records.length < expectedTotal) {
          throw new Error('反馈记录发生变化，请重新导出');
        }
      }
      if (records.length === 0) {
        message.info('暂无反馈记录');
        return;
      }

      const rows: FeedbackExportRow[] = [];
      // 顺序获取详情，避免批量导出给服务端带来大量并发请求。
      for (const [index, record] of records.entries()) {
        setProgress(`导出中 ${index + 1}/${records.length}`);
        const detail = await getApiV1ConversationMessageDetail(
          { kb_id: kbId, id: record.id! },
          { signal },
        );
        signal.throwIfAborted();
        const source =
          AppType[record.app_type as keyof typeof AppType]?.label || '';
        rows.push(feedbackExportRow(record, detail, source));
      }

      setProgress('生成 Excel…');
      const { createFeedbackWorkbook } = await import('./exportXlsx');
      signal.throwIfAborted();
      const workbook = createFeedbackWorkbook(
        rows,
        dayjs().format('YYYY-MM-DD HH:mm:ss'),
      );
      const buffer = await workbook.xlsx.writeBuffer();
      signal.throwIfAborted();
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(buffer)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `反馈记录_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      message.success(`已导出 ${records.length} 条评价`);
    } catch (error) {
      if (!signal.aborted) {
        message.error(
          error instanceof Error
            ? `导出失败：${error.message}`
            : '导出失败，请稍后重试',
        );
      }
    } finally {
      controllerRef.current = null;
      setProgress(null);
    }
  };

  return (
    <Stack direction='row' alignItems='center' gap={1} sx={{ flexShrink: 0 }}>
      {selectedRecords.length > 0 && (
        <Button
          variant='contained'
          disabled={!kbId || progress !== null}
          onClick={() => handleExport(true)}
        >
          导出选中（{selectedRecords.length}）
        </Button>
      )}
      <Tooltip title='导出全部 AI 问答评价，包含原问答、评价结果、原因和补充说明'>
        <span>
          <Button
            variant='outlined'
            disabled={!kbId || progress !== null}
            onClick={() => handleExport(false)}
          >
            {progress || '导出全部'}
          </Button>
        </span>
      </Tooltip>
      {progress !== null && (
        <Button onClick={() => controllerRef.current?.abort()}>取消</Button>
      )}
    </Stack>
  );
};

export default ExportButton;

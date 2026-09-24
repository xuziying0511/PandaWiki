import { AppType } from '@/constant/enums';
import {
  getApiV1Conversation,
  getApiV1ConversationDetail,
} from '@/request/Conversation';
import type { DomainConversationListItem } from '@/request/types';
import { message } from '@ctzhian/ui';
import { Button, Stack, Tooltip } from '@mui/material';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { conversationRows, toCsv } from './exportCsv';

interface ExportButtonProps {
  kbId: string;
  subject: string;
  remoteIp: string;
}

const ExportButton = ({ kbId, subject, remoteIp }: ExportButtonProps) => {
  const controllerRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, [kbId]);

  const handleExport = async () => {
    if (controllerRef.current || !kbId) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;
    setProgress('读取记录…');

    try {
      const records: DomainConversationListItem[] = [];
      const seen = new Set<string>();
      let expectedTotal = 0;
      for (let page = 1; ; page += 1) {
        const result = await getApiV1Conversation(
          { kb_id: kbId, subject, remote_ip: remoteIp, page, per_page: 100 },
          { signal },
        );
        signal.throwIfAborted();
        const items = result.data || [];
        if (page === 1) expectedTotal = result.total || 0;
        for (const item of items) {
          if (!item.id) throw new Error('问答记录缺少 ID');
          if (!seen.has(item.id)) {
            seen.add(item.id);
            records.push(item);
          }
        }
        if (items.length === 0 || records.length >= expectedTotal) break;
      }
      if (records.length < expectedTotal) {
        throw new Error('问答记录发生变化，请重新导出');
      }
      if (records.length === 0) {
        message.info('当前筛选条件下暂无问答记录');
        return;
      }

      const rows: string[][] = [];
      // 顺序获取详情，避免批量导出给服务端带来大量并发请求。
      for (const [index, record] of records.entries()) {
        setProgress(`导出中 ${index + 1}/${records.length}`);
        const detail = await getApiV1ConversationDetail(
          { kb_id: kbId, id: record.id! },
          { signal },
        );
        signal.throwIfAborted();
        const source =
          AppType[record.app_type as keyof typeof AppType]?.label || '';
        rows.push(...conversationRows(record, detail, source));
      }

      const url = URL.createObjectURL(
        new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `问答记录_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      message.success(`已导出 ${records.length} 条会话，共 ${rows.length} 行`);
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
      <Tooltip title='导出当前筛选条件下的全部问答及回答，CSV 可用 Excel/WPS 打开'>
        <span>
          <Button
            variant='outlined'
            disabled={!kbId || progress !== null}
            onClick={handleExport}
          >
            {progress || '导出数据'}
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

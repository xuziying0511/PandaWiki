import type {
  DomainConversationDetailResp,
  DomainConversationListItem,
} from '@/request/types';
import dayjs from 'dayjs';

const headers = [
  '会话ID',
  '会话主题',
  '来源渠道',
  '来源用户',
  '来源IP',
  '问答时间',
  '轮次',
  '问题',
  '问题图片',
  'AI回答',
];

export const conversationRows = (
  record: DomainConversationListItem,
  detail: DomainConversationDetailResp,
  source: string,
): string[][] => {
  const user = record.info?.user_info;
  const rows: string[][] = [];
  let question = '';
  let images = '';
  let answer = '';
  let createdAt = '';
  let pending = false;
  const flush = () => {
    if (!pending) return;
    const date = createdAt || record.created_at;
    rows.push([
      record.id || '',
      record.subject || '',
      source,
      user?.real_name || user?.name || '匿名用户',
      record.remote_ip || '',
      date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '',
      String(rows.length + 1),
      question,
      images,
      answer,
    ]);
  };

  for (const item of detail.messages || []) {
    if (item.role === 'user') {
      flush();
      question = item.content || '';
      images = (item.image_paths || []).join('\n');
      answer = '';
      createdAt = item.created_at || '';
      pending = true;
    } else if (item.role === 'assistant') {
      pending = true;
      // 与详情页面一致，不将模型思考过程当作正式回答。
      const content = (item.content || '')
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/<think>[\s\S]*$/, '');
      answer += (answer && content ? '\n\n' : '') + content;
    }
  }
  flush();
  if (rows.length === 0) {
    pending = true;
    question = record.subject || '';
    flush();
  }
  return rows;
};

export const toCsv = (rows: string[][]): string => {
  const escapeCell = (value: string) => {
    // 防止用户问题或模型回答被电子表格当作公式执行。
    const safe =
      /^\s*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)
        ? `'${value}`
        : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  // BOM 让 Excel 正确识别中文；引用单元格以保留换行和逗号。
  return (
    '\uFEFF' +
    [headers, ...rows].map(row => row.map(escapeCell).join(',')).join('\r\n')
  );
};

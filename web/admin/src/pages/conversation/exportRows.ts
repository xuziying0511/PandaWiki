import type {
  DomainConversationDetailResp,
  DomainConversationListItem,
} from '@/request/types';
import dayjs from 'dayjs';

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

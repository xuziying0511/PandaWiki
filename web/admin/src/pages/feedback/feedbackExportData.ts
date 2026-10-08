import type {
  DomainConversationMessage,
  DomainConversationMessageListItem,
  DomainFeedBackInfo,
} from '@/request/types';
import dayjs from 'dayjs';

export const feedbackLabel = (info?: DomainFeedBackInfo) => {
  const labels: Record<number, string> = {
    1: '点赞（历史评价）',
    '-1': '点踩（历史评价）',
    2: '部分解决',
    3: '已解决',
    4: '未解决',
  };
  return labels[Number(info?.score)] || '未评价';
};

export const feedbackReason = (info?: DomainFeedBackInfo) => {
  const reason = info?.feedback_type?.trim();
  const legacy: Record<string, string> = {
    '1': '内容不准确',
    '2': '没有帮助',
    '3': '其他',
  };
  return reason ? legacy[reason] || reason : '未填写';
};

export interface FeedbackExportRow {
  messageId: string;
  conversationId: string;
  question: string;
  answer: string;
  result: string;
  reason: string;
  comment: string;
  time: string;
  source: string;
  user: string;
  ip: string;
}

export function feedbackExportRow(
  record: DomainConversationMessageListItem,
  detail: DomainConversationMessage,
  source: string,
): FeedbackExportRow {
  if (!record.id || detail.id !== record.id)
    throw new Error('反馈详情与所选记录不匹配，请重新导出');
  const info = detail.info || record.info;
  const user = record.conversation_info?.user_info;
  const time = detail.created_at || record.created_at;
  return {
    messageId: record.id,
    conversationId: detail.conversation_id || record.conversation_id || '',
    question: record.question || '',
    answer: (detail.content || '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<think>[\s\S]*$/, ''),
    result: feedbackLabel(info),
    reason: feedbackReason(info),
    comment: info?.feedback_content || '未填写',
    time: time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '',
    source,
    user: user?.real_name || user?.name || '匿名用户',
    ip: record.remote_ip || '',
  };
}

'use client';

import { useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { message } from '@ctzhian/ui';

const ratings = [
  { score: 3, label: '已解决' },
  { score: 2, label: '部分解决' },
  { score: 4, label: '未解决' },
] as const;

const reasons = [
  '答案不正确',
  '操作步骤不清楚',
  '与我的问题不相关',
  '需要人工查询或处理',
  '其他',
];

interface AnswerEvaluationProps {
  messageId: string;
  score: number;
  onSubmit: (
    messageId: string,
    score: number,
    reason?: string,
    content?: string,
  ) => Promise<void>;
}

export default function AnswerEvaluation({
  messageId,
  score,
  onSubmit,
}: AnswerEvaluationProps) {
  const [pendingScore, setPendingScore] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const selected = ratings.find(rating => rating.score === score);
  const rated = score !== 0;
  const titleId = `answer-evaluation-${messageId}`;

  const close = () => {
    if (inFlight.current) return;
    setPendingScore(null);
    setReason('');
    setContent('');
  };

  const submit = async (value: number, skipReason = false) => {
    if (!messageId || rated || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await onSubmit(
        messageId,
        value,
        skipReason ? '' : reason,
        skipReason ? '' : content.trim(),
      );
      setPendingScore(null);
      setReason('');
      setContent('');
    } catch {
      message.error('评价提交失败，请重试');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack spacing={0.5}>
        <Typography variant='caption' color='text.secondary' aria-live='polite'>
          {selected
            ? `已评价：${selected.label}，感谢反馈`
            : rated
              ? '此前已提交评价，感谢反馈'
              : '这条回答是否解决了你的问题？'}
        </Typography>
        <Stack direction='row' gap={1} flexWrap='wrap'>
          {ratings.map(rating => (
            <Button
              key={rating.score}
              size='small'
              variant={score === rating.score ? 'contained' : 'outlined'}
              aria-pressed={score === rating.score}
              disabled={rated || submitting || !messageId}
              onClick={() => {
                if (rating.score === 3) void submit(3, true);
                else setPendingScore(rating.score);
              }}
            >
              {rating.label}
            </Button>
          ))}
        </Stack>
      </Stack>
      <Dialog
        open={pendingScore !== null}
        onClose={close}
        fullWidth
        maxWidth='xs'
        aria-labelledby={titleId}
      >
        <DialogTitle id={titleId}>
          {pendingScore === 2 ? '部分解决' : '未解决'}：补充原因（选填）
        </DialogTitle>
        <DialogContent>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            可以选择一项原因，或直接提交评价。
          </Typography>
          <Stack direction='row' gap={1} flexWrap='wrap' sx={{ mb: 2 }}>
            {reasons.map(item => (
              <Button
                key={item}
                size='small'
                variant={reason === item ? 'contained' : 'outlined'}
                aria-pressed={reason === item}
                disabled={submitting}
                onClick={() => setReason(reason === item ? '' : item)}
              >
                {item}
              </Button>
            ))}
          </Stack>
          <TextField
            label='补充说明（选填）'
            placeholder='请勿填写密码等敏感信息'
            fullWidth
            multiline
            minRows={3}
            value={content}
            disabled={submitting}
            inputProps={{ maxLength: 200 }}
            helperText={`${content.length}/200`}
            onChange={event => setContent(event.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          <Button onClick={close} disabled={submitting}>
            取消
          </Button>
          <Button
            onClick={() =>
              pendingScore !== null && void submit(pendingScore, true)
            }
            disabled={submitting}
          >
            跳过原因并提交
          </Button>
          <Button
            variant='contained'
            onClick={() => pendingScore !== null && void submit(pendingScore)}
            disabled={submitting}
          >
            {submitting ? '提交中…' : '提交评价'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

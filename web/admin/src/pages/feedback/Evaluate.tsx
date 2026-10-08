import { getApiV1ConversationMessageList } from '@/request';
import { DomainConversationMessageListItem } from '@/request/types';
import Logo from '@/assets/images/logo.png';
import NoData from '@/assets/images/nodata.png';
import { AppType, FeedbackType } from '@/constant/enums';
import { tableSx } from '@/constant/styles';
import { useURLSearchParams } from '@/hooks';
import { useAppSelector } from '@/store';
import { Box, Button, Stack, Tooltip } from '@mui/material';
import { Ellipsis, Table } from '@ctzhian/ui';
import { ColumnsType } from '@ctzhian/ui/dist/Table';
import {
  IconDianzanXuanzhong1,
  IconADiancaiWeixuanzhong2,
  IconDianzanWeixuanzhong,
} from '@panda-wiki/icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import Detail from './Detail';
import ExportButton from './ExportButton';
import { feedbackReason } from './feedbackExportData';

const Evaluate = () => {
  const { kb_id = '' } = useAppSelector(state => state.config);
  const [searchParams] = useURLSearchParams();
  const subject = searchParams.get('subject') || '';
  const remoteIp = searchParams.get('remote_ip') || '';
  const [data, setData] = useState<DomainConversationMessageListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [feedbackInfo, setFeedbackInfo] =
    useState<DomainConversationMessageListItem>({});

  const [selectedRecords, setSelectedRecords] = useState<
    DomainConversationMessageListItem[]
  >([]);
  useEffect(() => {
    setSelectedRecords([]);
  }, [kb_id, subject, remoteIp]);

  const columns: ColumnsType<DomainConversationMessageListItem> = [
    {
      dataIndex: 'question',
      title: '问题',
      render: (text: string, record) => {
        const AppIcon =
          AppType[record.app_type as keyof typeof AppType]?.icon || '';
        return (
          <>
            <Stack direction={'row'} alignItems={'center'} gap={1}>
              <AppIcon sx={{ fontSize: 12 }}></AppIcon>
              <Ellipsis
                className='primary-color'
                sx={{ cursor: 'pointer', flex: 1, width: 0 }}
                onClick={() => {
                  setId(record.id!);
                  setFeedbackInfo(record);
                  setOpen(true);
                }}
              >
                {text}
              </Ellipsis>
            </Stack>
            <Box sx={{ color: 'text.tertiary', fontSize: 12 }}>
              {AppType[record.app_type as keyof typeof AppType]?.label || '-'}
            </Box>
          </>
        );
      },
    },
    {
      dataIndex: 'info',
      title: '用户反馈',
      width: 160,
      render: (value: DomainConversationMessageListItem['info']) => {
        // The generated client still describes the legacy like/dislike scores.
        const score = Number(value?.score ?? 0);
        return (
          <Tooltip
            title={
              (value?.feedback_content || value?.feedback_type) && (
                <Box>
                  {value?.feedback_type && (
                    <Box>
                      {FeedbackType[
                        value.feedback_type as unknown as keyof typeof FeedbackType
                      ] || value.feedback_type}
                    </Box>
                  )}
                  {value?.feedback_content && (
                    <Box>{value?.feedback_content}</Box>
                  )}
                </Box>
              )
            }
          >
            <Stack
              direction={'row'}
              alignItems={'center'}
              gap={0.5}
              sx={{ cursor: 'pointer', fontSize: 14 }}
            >
              {score === 3 ? (
                <Box sx={{ color: 'success.main' }}>已解决</Box>
              ) : score === 4 ? (
                <Box sx={{ color: 'error.main' }}>未解决</Box>
              ) : score === 1 ? (
                <IconDianzanXuanzhong1
                  sx={{
                    fontSize: 14,
                    cursor: 'pointer',
                    color: 'success.main',
                  }}
                />
              ) : score === 2 ? (
                <Box sx={{ color: 'warning.main' }}>部分解决</Box>
              ) : score === -1 ? (
                <IconADiancaiWeixuanzhong2
                  sx={{
                    fontSize: 14,
                    cursor: 'pointer',
                    color: 'error.main',
                  }}
                />
              ) : (
                <IconDianzanWeixuanzhong
                  sx={{ fontSize: 14, color: 'text.disabled' }}
                />
              )}
            </Stack>
          </Tooltip>
        );
      },
    },
    {
      dataIndex: 'info',
      title: '反馈原因 / 补充说明',
      width: 250,
      render: (value: DomainConversationMessageListItem['info']) => (
        <Stack gap={0.5}>
          <Box>{feedbackReason(value)}</Box>
          <Tooltip title={value?.feedback_content || '未填写补充说明'}>
            <Box>
              <Ellipsis sx={{ color: 'text.secondary', fontSize: 12 }}>
                {value?.feedback_content || '未填写补充说明'}
              </Ellipsis>
            </Box>
          </Tooltip>
        </Stack>
      ),
    },
    {
      dataIndex: 'info',
      title: '来源用户',
      width: 200,
      render: (text, record) => {
        const user = record?.conversation_info?.user_info || {};
        return (
          <Box sx={{ fontSize: 12 }}>
            <Stack
              direction={'row'}
              alignItems={'center'}
              gap={0.5}
              sx={{ cursor: 'pointer' }}
            >
              <img src={user?.avatar || Logo} width={16} />
              <Box sx={{ fontSize: 14 }}>
                {user?.real_name || user?.name || '匿名用户'}
              </Box>
            </Stack>
            {user?.email && (
              <Box sx={{ color: 'text.tertiary' }}>{user?.email}</Box>
            )}
          </Box>
        );
      },
    },
    {
      dataIndex: 'remote_ip',
      title: '来源 IP',
      width: 200,
      render: (text: string, record) => {
        const {
          city = '',
          country = '',
          province = '',
        } = record.ip_address || {};
        return (
          <>
            <Box>{text}</Box>
            <Box sx={{ color: 'text.tertiary', fontSize: 12 }}>
              {country === '中国' ? `${province}-${city}` : `${country}`}
            </Box>
          </>
        );
      },
    },
    {
      dataIndex: 'created_at',
      title: '问答时间',
      width: 120,
      render: (text: string, record) => {
        return dayjs(record?.created_at).fromNow();
      },
    },
  ];

  const getData = () => {
    setLoading(true);
    getApiV1ConversationMessageList({
      page,
      per_page: pageSize,
      kb_id,
    })
      .then(res => {
        setData(res.data || []);
        setTotal(res.total || 0);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    setPage(1);
  }, [subject, remoteIp, kb_id]);

  useEffect(() => {
    if (kb_id) getData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, subject, remoteIp, kb_id]);

  return (
    <>
      <Stack
        direction='row'
        alignItems='center'
        justifyContent='space-between'
        gap={2}
        sx={{ px: 2, pb: 2, flexWrap: 'wrap' }}
      >
        <Box sx={{ color: 'text.secondary', fontSize: 13 }}>
          每条评价对应一轮回答；未填写的原因不会自动推断。
        </Box>
        <Stack direction='row' gap={1} alignItems='center'>
          {selectedRecords.length > 0 && (
            <Button onClick={() => setSelectedRecords([])}>清空选择</Button>
          )}
          <ExportButton
            key={kb_id}
            kbId={kb_id}
            selectedRecords={selectedRecords}
          />
        </Stack>
      </Stack>
      <Table
        columns={columns}
        dataSource={data}
        rowKey='id'
        rowSelection={{
          selectedRowKeys: data
            .filter(item =>
              selectedRecords.some(selected => selected.id === item.id),
            )
            .map(item => item.id!),
          getCheckboxProps: record => ({ disabled: loading || !record.id }),
          onChange: keys => {
            if (loading) return;
            setSelectedRecords(previous => [
              ...previous.filter(
                item => !data.some(record => record.id === item.id),
              ),
              ...data.filter(item => item.id && keys.includes(item.id)),
            ]);
          },
        }}
        height='calc(100vh - 208px)'
        size='small'
        sx={{
          overflow: 'hidden',
          ...tableSx,
          '.MuiTableContainer-root': {
            height: 'calc(100vh - 208px - 70px)',
          },
        }}
        pagination={{
          total,
          page,
          pageSize,
          onChange: (page, pageSize) => {
            setPage(page);
            setPageSize(pageSize);
          },
        }}
        PaginationProps={{
          sx: {
            borderTop: '1px solid',
            borderColor: 'divider',
            p: 2,
            '.MuiSelect-root': {
              width: 100,
            },
          },
        }}
        renderEmpty={
          loading ? (
            <Box></Box>
          ) : (
            <Stack alignItems={'center'} sx={{ mt: 20 }}>
              <img src={NoData} width={174} />
              <Box>暂无数据</Box>
            </Stack>
          )
        }
      />
      <Detail
        id={id}
        open={open}
        data={feedbackInfo}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
};

export default Evaluate;

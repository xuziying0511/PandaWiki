'use client';

import AiQaContent from '@/components/QaModal/AiQaContent';
import SearchDocContent from '@/components/QaModal/SearchDocContent';
import { useStore } from '@/provider';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { alpha, Box, Button, Stack, styled, Tab, Tabs } from '@mui/material';
import { IconJinsousuo } from '@panda-wiki/icons';
import { useEffect, useMemo, useRef, useState } from 'react';

const StyledTabs = styled(Tabs)(({ theme }) => ({
  minHeight: 'auto',
  borderRadius: '10px',
  padding: theme.spacing(0.5),
  border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
  backgroundColor: theme.palette.background.default,
  '& .MuiTabs-indicator': {
    height: '100%',
    borderRadius: '8px',
    backgroundColor: theme.palette.primary.main,
    zIndex: 0,
  },
  '& .MuiTabs-flexContainer': {
    gap: theme.spacing(0.5),
    position: 'relative',
    zIndex: 1,
  },
}));

const StyledTab = styled(Tab)(({ theme }) => ({
  minHeight: 'auto',
  padding: theme.spacing(0.75, 2),
  borderRadius: '6px',
  fontSize: 12,
  textTransform: 'none',
  position: 'relative',
  zIndex: 1,
  lineHeight: 1,
  '&.Mui-selected': {
    color: theme.palette.primary.contrastText,
    fontWeight: 500,
  },
}));

interface HomeChatProps {
  onBack: () => void;
}

/** 首页对话视图：提问后原地替换首页模块，消息区滚动，输入框固定在底部 */
const HomeChat = ({ onBack }: HomeChatProps) => {
  const { kbDetail, mobile } = useStore();
  const [searchMode, setSearchMode] = useState<'chat' | 'search'>('chat');
  const aiQaInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const placeholder =
    kbDetail?.settings?.web_app_custom_style?.header_search_placeholder ||
    '搜索...';

  const hotSearch = useMemo(() => {
    const bannerConfig = kbDetail?.settings?.web_app_landing_configs?.find(
      item => item.type === 'banner',
    );
    return bannerConfig?.banner_config?.hot_search || [];
  }, [kbDetail]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchMode === 'chat') {
        aiQaInputRef.current?.querySelector('textarea')?.focus();
      } else {
        searchInputRef.current?.querySelector('input')?.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [searchMode]);

  return (
    <Stack
      sx={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        maxWidth: 860,
        mx: 'auto',
        px: mobile ? 2 : 3,
        pb: 2,
      }}
    >
      <Stack
        direction='row'
        alignItems='center'
        justifyContent='space-between'
        sx={{ py: 2, flexShrink: 0 }}
      >
        <Button
          size='small'
          startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
          onClick={onBack}
          sx={{ textTransform: 'none', color: 'text.secondary' }}
        >
          返回首页
        </Button>
        <StyledTabs
          value={searchMode}
          onChange={(_, value) => setSearchMode(value as 'chat' | 'search')}
          variant='scrollable'
          scrollButtons={false}
        >
          <StyledTab
            value='chat'
            label={
              <Stack direction='row' gap={0.5} alignItems='center'>
                <img
                  src='/images/qa-custom-icon.png'
                  alt=''
                  width={16}
                  height={16}
                />
                {!mobile && <span>智能问答</span>}
              </Stack>
            }
          />
          <StyledTab
            value='search'
            label={
              <Stack direction='row' gap={0.5} alignItems='center'>
                <IconJinsousuo sx={{ fontSize: 16 }} />
                {!mobile && <span>仅搜索文档</span>}
              </Stack>
            }
          />
        </StyledTabs>
      </Stack>

      <Box
        sx={theme => ({
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '12px',
          backgroundColor: alpha(theme.palette.background.default, 0.85),
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
          p: mobile ? 2 : 3,
        })}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: searchMode === 'chat' ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          <AiQaContent
            fullPage
            hotSearch={hotSearch}
            placeholder={placeholder}
            inputRef={aiQaInputRef}
          />
        </Box>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            display: searchMode === 'search' ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          <SearchDocContent
            inputRef={searchInputRef}
            placeholder={placeholder}
          />
        </Box>
      </Box>
    </Stack>
  );
};

export default HomeChat;

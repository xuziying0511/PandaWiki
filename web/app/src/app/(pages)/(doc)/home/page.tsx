'use client';
import { useMemo, useState, useEffect } from 'react';
import Home from '@/views/home';
import HomeChat from '@/views/home/HomeChat';
import { useBasePath } from '@/hooks';
import { getImagePath } from '@/utils/getImagePath';
import { useSearchParams } from 'next/navigation';
import { ThemeProvider } from '@ctzhian/ui';
import { WelcomeHeader } from '@/components/header';
import { Stack, createTheme } from '@mui/material';
import { createComponentStyleOverrides } from '@/theme';
import { useStore } from '@/provider';
import { THEME_TO_PALETTE } from '@panda-wiki/themes/constants';

const HomePage = () => {
  const { kbDetail } = useStore();
  const basePath = useBasePath();
  const searchParams = useSearchParams();
  const [showSearch, setShowSearch] = useState(false);
  // 对话中：隐藏首页模块，原地展示对话视图；带 cid/ask 参数进入时直接打开
  const [chatting, setChatting] = useState(
    () => !!(searchParams.get('cid') || searchParams.get('ask')),
  );

  const startChat = () => {
    window.scrollTo({ top: 0 });
    setChatting(true);
  };

  // 对话视图沿用横幅壁纸，保证背景不变
  const bannerBgUrl = useMemo(() => {
    const bannerConfig = kbDetail?.settings?.web_app_landing_configs?.find(
      item => item.type === 'banner',
    );
    const url = bannerConfig?.banner_config?.bg_url;
    return url ? getImagePath(url, basePath) : '';
  }, [kbDetail, basePath]);

  useEffect(() => {
    if (chatting) {
      setShowSearch(false);
      return;
    }
    let ticking = false;

    const checkVisibility = () => {
      const elements = document.querySelectorAll('.banner-search-box');
      if (elements.length > 0) {
        // 判断是否还有任意一个搜索框处于可视区域内
        // 顶部预留 80px 为头部占用区域
        const hasVisibleBox = Array.from(elements).some(el => {
          const rect = el.getBoundingClientRect();
          return rect.bottom > 80 && rect.top < window.innerHeight;
        });
        setShowSearch(!hasVisibleBox);
      } else {
        setShowSearch(window.scrollY >= window.innerHeight);
      }
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          checkVisibility();
          ticking = false;
        });
        ticking = true;
      }
    };

    checkVisibility();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [chatting]);

  const theme = useMemo(() => {
    // @ts-ignore
    const themeMode = kbDetail?.settings?.web_app_landing_theme?.name || 'blue';
    return createTheme({
      cssVariables: {
        cssVarPrefix: 'welcome',
      },
      palette:
        THEME_TO_PALETTE[themeMode]?.palette ||
        THEME_TO_PALETTE['blue'].palette,
      typography: {
        fontFamily: 'var(--font-gilory), PingFang SC, sans-serif',
      },
      components: createComponentStyleOverrides(true),
    });
    // @ts-ignore
  }, [kbDetail?.settings?.web_app_landing_theme?.name]);

  return (
    <ThemeProvider theme={theme}>
      <Stack
        justifyContent='space-between'
        sx={{
          minHeight: '100dvh',
          bgcolor: 'background.default',
          ...(chatting && {
            height: '100dvh',
            overflow: 'hidden',
            ...(bannerBgUrl && {
              backgroundImage: `url(${bannerBgUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }),
          }),
        }}
      >
        <WelcomeHeader showSearch={showSearch} onChat={startChat} />
        <Stack sx={{ flex: 1, minHeight: 0 }}>
          {chatting ? (
            <HomeChat onBack={() => setChatting(false)} />
          ) : (
            <Home onChat={startChat} />
          )}
        </Stack>
      </Stack>
    </ThemeProvider>
  );
};

export default HomePage;

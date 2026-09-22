import router from '@/router';
import { useAppDispatch } from '@/store';
import { theme } from '@/themes';
import { ThemeProvider } from '@ctzhian/ui';
import { useEffect } from 'react';
import { useLocation, useRoutes } from 'react-router-dom';

import axios from 'axios';
import { message } from '@ctzhian/ui';
import type { DomainLicenseResp } from './request/pro/types';

import { setLicense } from './store/slices/config';

import '@ctzhian/tiptap/dist/index.css';

function App() {
  const location = useLocation();
  const { pathname } = location;
  const dispatch = useAppDispatch();
  const routerView = useRoutes(router);
  const loginPage = pathname.includes('/login');
  const onlyAllowShareApi = loginPage;

  const token = localStorage.getItem('panda_wiki_token') || '';

  useEffect(() => {
    if (!token) return;

    const loadLicense = async () => {
      try {
        // 使用独立请求，避免通用拦截器先对 404 弹出“网络异常”。
        const response = await axios.get<{
          success: boolean;
          message?: string;
          data?: DomainLicenseResp;
        }>('/api/v1/license', {
          baseURL: window.__BASENAME__ || '/',
          withCredentials: true,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.data.success || !response.data.data) {
          throw new Error(response.data.message || '授权信息加载失败');
        }

        dispatch(setLicense(response.data.data));
      } catch (error) {
        if (axios.isAxiosError(error)) {
          // 社区版后端可能不提供授权接口。
          if (error.response?.status === 404) {
            dispatch(
              setLicense({
                edition: 0,
                expired_at: 0,
                started_at: 0,
              }),
            );
            return;
          }

          if (error.response?.status === 401) {
            localStorage.removeItem('panda_wiki_token');
            window.location.href = `${window.__BASENAME__ || ''}/login`;
            return;
          }
        }

        message.error(
          error instanceof Error
            ? `授权信息加载失败：${error.message}`
            : '授权信息加载失败，请稍后重试',
        );
      }
    };

    void loadLicense();
  }, [token, dispatch]);

  if (!token && !onlyAllowShareApi) {
    window.location.href = window.__BASENAME__ + '/login';
    return null;
  }

  return (
    <ThemeProvider theme={theme} defaultMode='light' storageManager={null}>
      {routerView}
    </ThemeProvider>
  );
}

export default App;

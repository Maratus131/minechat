import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './api/client';
import { SessionProvider } from './features/auth/Session';
import { App } from './app/App';
import './app/global.css';

const queryClient = new QueryClient({ defaultOptions: {
  queries: {
    networkMode: 'always',
    retry: (failureCount, error) => failureCount < 1 && !(error instanceof ApiError && [400, 401, 403, 404].includes(error.status)),
    refetchOnWindowFocus: false,
  },
  mutations: { retry: false, networkMode: 'always' },
} });

const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing');
createRoot(root).render(<QueryClientProvider client={queryClient}><BrowserRouter><SessionProvider><App /></SessionProvider></BrowserRouter></QueryClientProvider>);

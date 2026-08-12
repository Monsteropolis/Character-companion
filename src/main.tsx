import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './ui/theme/ThemeProvider';
import { RulesProvider } from './rules/RulesProvider';
import { router } from './app/routes';
import './styles.css';

/**
 * Rules content is immutable reference data served from a local bundle, so the usual cache
 * invalidation defaults are wrong here: nothing it returns can go stale within a session, and
 * refetching would only cost work.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing from index.html');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RulesProvider>
          <RouterProvider router={router} />
        </RulesProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);

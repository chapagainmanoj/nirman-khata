import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { isTimeout } from './lib/errors'
import { AuthProvider } from './auth/AuthProvider'
import './index.css'
import { platform } from './platform'

const queryClient = new QueryClient({
  // One quick retry for a blip; none after a time-out (lib/supabase), which already waited 30 s.
  defaultOptions: { queries: { staleTime: 30_000, retry: (failures, error) => failures < 1 && !isTimeout(error), refetchOnWindowFocus: false } },
})

// Ask the browser to keep device drafts even when storage is low (design §6).
void platform.requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)

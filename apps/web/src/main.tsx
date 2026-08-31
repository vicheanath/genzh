import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ConfirmProvider } from '@/components/AlertDialog'
import { ToastProvider } from '@/components/Toast'
import { TooltipProvider } from '@/components/Tooltip'
// i18n must be initialized before any component renders so `useTranslation`
// has a ready instance. The module calls `i18n.init()` as a side-effect.
import '@/lib/i18n'

import { App } from './App'

import './styles/global.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('#root is missing from index.html')
}

createRoot(container).render(
  <StrictMode>
    <TooltipProvider>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </TooltipProvider>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ConfirmProvider } from '@/components/AlertDialog'
import { ToastProvider } from '@/components/Toast'
import { TooltipProvider } from '@/components/Tooltip'

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

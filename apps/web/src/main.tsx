import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

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
        <App />
      </ToastProvider>
    </TooltipProvider>
  </StrictMode>,
)

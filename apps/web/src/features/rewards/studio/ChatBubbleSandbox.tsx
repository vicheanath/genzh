import { CosmeticChatBubble } from '@/components/Cosmetics'
import { MessageSquareIcon } from '@/components/Icons'
import { Input } from '@/components/Input'

import type { StoreItem } from '../api'

export interface ChatBubbleSandboxProps {
  bubbleItem: StoreItem | null
  message: string
  onMessageChange: (next: string) => void
}

/**
 * Interactive playground where users can type any message to test their active chat bubble in real-time.
 */
export function ChatBubbleSandbox({
  bubbleItem,
  message,
  onMessageChange,
}: ChatBubbleSandboxProps) {
  return (
    <section
      style={{
        padding: 'var(--space-4) var(--space-5)',
        borderRadius: 'var(--radius-lg, 0.75rem)',
        border: '1px solid var(--color-border)',
        background: 'var(--color-sunken)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <MessageSquareIcon size={14} /> Live Chat Bubble Sandbox
        </span>
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
          Type below to preview your message styling in real-time
        </span>
      </div>

      <CosmeticChatBubble item={bubbleItem}>
        <div style={{ fontSize: 'var(--text-sm)' }}>
          {message || 'Type something to preview your chat bubble…'}
        </div>
      </CosmeticChatBubble>

      <Input
        label="Test message text"
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder="Type any message to see your bubble borders and glowing accents..."
        maxLength={200}
      />
    </section>
  )
}

import { CosmeticChatBubble } from '@/components/Cosmetics'
import { MessageSquareIcon } from '@/components/Icons'
import { Input } from '@/components/Input'

import type { StoreItem } from '../api'
import styles from '../rewards.module.css'

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
    <section className={styles.sandboxCard}>
      <div className={styles.sandboxHeader}>
        <span className={styles.sandboxLabel}>
          <MessageSquareIcon size={14} /> Live Chat Bubble Sandbox
        </span>
        <span className={styles.sandboxHint}>
          Type below to preview your message styling in real-time
        </span>
      </div>

      <CosmeticChatBubble item={bubbleItem}>
        <div className={styles.sandboxMessage}>
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

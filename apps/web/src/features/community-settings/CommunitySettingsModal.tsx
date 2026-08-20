import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useState } from 'react'

import { XIcon } from '@/components/Icons'
import type { CommunityWithPermissions } from '@/lib/api'

import { CommunitySettings } from './CommunitySettings'
import type { CommunityTab } from './tabs'
import styles from './communitySettings.module.css'

export interface CommunitySettingsModalProps {
  open: boolean
  community: CommunityWithPermissions
  initialTab?: CommunityTab
  onClose: () => void
  onCommunityUpdated?: () => void
  onCommunityDeleted?: () => void
}

/**
 * Server settings as a desktop dialog.
 *
 * A wrapper and nothing else: the backdrop, the close affordance, and which tab
 * is up. Escape and focus trapping come from Base UI — the previous version
 * added its own `keydown` listener on `window` for Escape, which duplicated
 * what the dialog already did.
 */
export function CommunitySettingsModal({
  open,
  community,
  initialTab = 'overview',
  onClose,
  onCommunityUpdated,
  onCommunityDeleted,
}: CommunitySettingsModalProps) {
  const [activeTab, setActiveTab] = useState<CommunityTab>(initialTab)

  return (
    <BaseDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.modal}>
          <BaseDialog.Title className={styles.srOnly}>
            {community.name} settings
          </BaseDialog.Title>

          <div className={styles.closeCorner}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close server settings"
            >
              <XIcon size={18} />
            </button>
            <span className={styles.escKey}>ESC</span>
          </div>

          <CommunitySettings
            community={community}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            variant="dialog"
            onUpdated={onCommunityUpdated}
            onDeleted={() => {
              onClose()
              onCommunityDeleted?.()
            }}
          />
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

import { Button } from '@/components/Button'
import { CopyIcon } from '@/components/Icons'
import { useToast } from '@/components/Toast'
import type { CurrentUser } from '@/lib/api'

import styles from './settings.module.css'

export function AccountTab({ user }: { user: CurrentUser }) {
  const toast = useToast()

  function copyUserId() {
    void navigator.clipboard
      ?.writeText(user.id)
      .then(() => toast.success('User ID copied'))
      .catch(() => toast.error('Could not copy your user ID'))
  }

  return (
    <div>
      <h2 className={styles.panelTitle}>My account</h2>
      <p className={styles.panelDescription}>
        Your credentials and the identifier other people use to find you.
      </p>

      <div className={styles.section}>
        <div className={styles.accountRow}>
          <div>
            <div className={styles.accountKey}>User ID</div>
            <div className={styles.codeVal}>{user.id}</div>
          </div>
          <Button size="sm" variant="secondary" onClick={copyUserId}>
            <CopyIcon size={14} />
            Copy
          </Button>
        </div>

        <div className={styles.accountRow}>
          <div>
            <div className={styles.accountKey}>Handle</div>
            <div className={styles.accountVal}>@{user.handle}</div>
          </div>
        </div>

        <div className={styles.accountRow}>
          <div>
            <div className={styles.accountKey}>Email</div>
            <div className={styles.accountVal}>{user.email}</div>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Security</h3>
        <p className={styles.accountKey}>
          Signed in with a bearer session that refreshes automatically. Signing out ends it
          on this device.
        </p>
      </div>
    </div>
  )
}

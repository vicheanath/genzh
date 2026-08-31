import { useTranslation } from 'react-i18next'

import { Button } from '@/components/Button'
import { CopyIcon } from '@/components/Icons'
import { useToast } from '@/components/Toast'
import type { CurrentUser } from '@/lib/api'

import styles from './settings.module.css'

export function AccountTab({ user }: { user: CurrentUser }) {
  const { t } = useTranslation()
  const toast = useToast()

  function copyUserId() {
    void navigator.clipboard
      ?.writeText(user.id)
      .then(() => toast.success(t('settings.account.userIdCopied')))
      .catch(() => toast.error(t('settings.account.copyFailed')))
  }

  return (
    <div>
      <h2 className={styles.panelTitle}>{t('settings.account.title')}</h2>
      <p className={styles.panelDescription}>{t('settings.account.description')}</p>

      <div className={styles.section}>
        <div className={styles.accountRow}>
          <div>
            <div className={styles.accountKey}>{t('settings.account.userId')}</div>
            <div className={styles.codeVal}>{user.id}</div>
          </div>
          <Button size="sm" variant="secondary" onClick={copyUserId}>
            <CopyIcon size={14} />
            {t('settings.account.copyUserId')}
          </Button>
        </div>

        <div className={styles.accountRow}>
          <div>
            <div className={styles.accountKey}>{t('settings.account.handle')}</div>
            <div className={styles.accountVal}>@{user.handle}</div>
          </div>
        </div>

        <div className={styles.accountRow}>
          <div>
            <div className={styles.accountKey}>{t('settings.account.email')}</div>
            <div className={styles.accountVal}>{user.email}</div>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('settings.account.security')}</h3>
        <p className={styles.accountKey}>{t('settings.account.securityDescription')}</p>
      </div>
    </div>
  )
}

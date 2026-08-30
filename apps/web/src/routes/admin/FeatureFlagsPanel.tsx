import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useAdminSettings,
  useIsPlatformAdmin,
  useUpdateSettingMutation,
} from '@/features/api'
import { errorText } from '@/lib/errors'

import styles from './panels.module.css'

interface FeatureFlagDef {
  key: string
  title: string
  description: string
  defaultValue: boolean
  danger?: boolean
}

const FEATURE_FLAGS: FeatureFlagDef[] = [
  {
    key: 'maintenance_mode',
    title: 'Platform Maintenance Mode',
    description:
      'When enabled, non-staff users are blocked with a maintenance notice and real-time sockets are paused.',
    defaultValue: false,
    danger: true,
  },
  {
    key: 'registrations_enabled',
    title: 'New User Registrations',
    description: 'Allow new visitors to register accounts on the platform.',
    defaultValue: true,
  },
  {
    key: 'voice_calls_enabled',
    title: 'Voice & Video Calls',
    description: 'Enable live voice and video media sessions, via LiveKit, across all rooms.',
    defaultValue: true,
  },
  {
    key: 'screen_sharing_enabled',
    title: 'Screen Sharing',
    description: 'Permit users to stream their screens during active media calls.',
    defaultValue: true,
  },
  {
    key: 'community_creation_enabled',
    title: 'Community Creation',
    description: 'Allow ordinary users to create new communities.',
    defaultValue: true,
  },
  {
    key: 'file_uploads_enabled',
    title: 'Media & File Attachments',
    description: 'Permit file and image uploads in chat messages.',
    defaultValue: true,
  },
]

/**
 * Feature Flags & Global Platform Controls.
 */
export function FeatureFlagsPanel() {
  const isAdmin = useIsPlatformAdmin()
  const settings = useAdminSettings()
  const updateSetting = useUpdateSettingMutation()
  const toast = useToast()

  const data = settings.data ?? {}

  async function handleToggle(flag: FeatureFlagDef, currentValue: boolean) {
    const next = !currentValue
    try {
      await updateSetting.mutateAsync({ key: flag.key, value: next })
      toast.success(`${flag.title} is now ${next ? 'enabled' : 'disabled'}`)
    } catch (cause) {
      toast.error(`Could not update ${flag.title}`, errorText(cause))
    }
  }

  return (
    <div className={styles.stack}>
      <div className={styles.filterBar}>
        <div>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
            Dynamic Feature Flags
          </h2>
          <p className={styles.rowMeta} style={{ margin: 0 }}>
            Runtime platform controls applied immediately without server restarts.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void settings.refetch()}
          disabled={settings.isFetching}
        >
          {settings.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {settings.isLoading && <Skeleton height="8rem" />}
      {settings.error && (
        <Callout tone="danger">{errorText(settings.error, 'Could not load platform settings')}</Callout>
      )}

      {FEATURE_FLAGS.map((flag) => {
        const val = data[flag.key] !== undefined ? Boolean(data[flag.key]) : flag.defaultValue

        return (
          <article key={flag.key} className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <strong>{flag.title}</strong>
                <span className={styles.rowMeta}> · <code>{flag.key}</code></span>
              </div>
              <div className={styles.badges}>
                <Badge tone={val ? (flag.danger ? 'danger' : 'success') : 'neutral'}>
                  {val ? 'enabled' : 'disabled'}
                </Badge>
              </div>
            </div>

            <p className={styles.entrySummary}>{flag.description}</p>

            {isAdmin && (
              <div className={styles.cardActions}>
                <Button
                  variant={val ? (flag.danger ? 'danger' : 'secondary') : 'primary'}
                  size="sm"
                  onClick={() => void handleToggle(flag, val)}
                  disabled={updateSetting.isPending}
                >
                  {val ? `Disable ${flag.title}` : `Enable ${flag.title}`}
                </Button>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import type { CurrentUser } from '@/lib/api'
import { useUpdateProfileMutation } from '@/features/api'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'

import { DEFAULT_ACCENT, PRESET_COLORS } from './tabs'
import { useSubmission } from './useSubmission'
import styles from './settings.module.css'

interface ProfileFormValues {
  displayName: string
  bio: string
  avatarUrl: string
  accentColor: string
}

export function ProfileTab({ user }: { user: CurrentUser }) {
  const { applyProfile } = useAuth()
  const updateProfile = useUpdateProfileMutation()
  const toast = useToast()
  const save = useSubmission()

  const defaults: ProfileFormValues = {
    displayName: user.profile.display_name ?? '',
    bio: user.profile.bio ?? '',
    avatarUrl: user.profile.avatar_url ?? '',
    accentColor: user.profile.accent_color ?? DEFAULT_ACCENT,
  }

  const form = useForm<ProfileFormValues>({ defaultValues: defaults })

  // Re-seed when the profile changes underneath the form — an edit saved
  // elsewhere, or the initial `me` response arriving after first render.
  const { reset } = form
  const profile = user.profile
  useEffect(() => {
    reset({
      displayName: profile.display_name ?? '',
      bio: profile.bio ?? '',
      avatarUrl: profile.avatar_url ?? '',
      accentColor: profile.accent_color ?? DEFAULT_ACCENT,
    })
  }, [reset, profile])

  const displayName = form.watch('displayName')
  const bio = form.watch('bio')
  const avatarUrl = form.watch('avatarUrl')
  const accentColor = form.watch('accentColor')

  async function onSubmit(data: ProfileFormValues) {
    const updated = await save.run(async () =>
      updateProfile.mutateAsync({
        display_name: data.displayName.trim() || undefined,
        bio: data.bio.trim() || undefined,
        avatar_url: data.avatarUrl.trim() || undefined,
        accent_color: data.accentColor.trim() || undefined,
      }),
    )
    if (updated) {
      applyProfile(updated)
      toast.success('Profile saved', 'Your changes are now visible to everyone.')
    }
  }

  return (
    <div>
      <h2 className={styles.panelTitle}>Profile</h2>
      <p className={styles.panelDescription}>
        How you appear across communities and direct messages.
      </p>

      {save.error && <Callout tone="danger">{save.error}</Callout>}

      <div className={styles.profilePreviewCard}>
        <div
          className={styles.previewBanner}
          style={{ '--banner-color': accentColor } as React.CSSProperties}
        />
        <div className={styles.previewBody}>
          <div className={styles.previewAvatarWrap}>
            <Avatar
              name={displayName || user.profile.display_name}
              src={avatarUrl || user.profile.avatar_url}
              color={accentColor}
              size="xl"
              // Your own preview: online by construction, since you are here looking at it.
              presence="online"
            />
          </div>
          <div className={styles.previewName}>
            {displayName || user.profile.display_name}
          </div>
          <div className={styles.previewHandle}>@{user.handle}</div>
          {bio && <div className={styles.previewBio}>{bio}</div>}
        </div>
      </div>

      <form className={styles.formGrid} onSubmit={form.handleSubmit(onSubmit)}>
        <Input
          label="Display name"
          {...form.register('displayName', { required: true })}
          placeholder="Enter display name"
          maxLength={32}
          required
        />

        <div className={styles.textareaField}>
          <label className={styles.fieldLabel} htmlFor="settings-bio">
            About me
          </label>
          <textarea
            id="settings-bio"
            className={styles.textarea}
            {...form.register('bio')}
            placeholder="Tell everyone a bit about yourself…"
            rows={3}
            maxLength={190}
          />
        </div>

        <Input
          label="Avatar image URL"
          {...form.register('avatarUrl')}
          placeholder="https://example.com/avatar.png"
        />

        <div>
          <span className={styles.fieldLabel}>Accent colour</span>
          <div className={styles.colorSwatches}>
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={cx(
                  styles.colorSwatch,
                  accentColor === color && styles.colorSwatchActive,
                )}
                style={{ backgroundColor: color }}
                onClick={() => form.setValue('accentColor', color, { shouldDirty: true })}
                aria-label={`Accent colour ${color}`}
                aria-pressed={accentColor === color}
              />
            ))}
            <Input
              label="Custom hex"
              {...form.register('accentColor')}
              placeholder={DEFAULT_ACCENT}
            />
          </div>
        </div>

        <div className={styles.formActions}>
          <Button type="submit" disabled={save.busy}>
            {save.busy && <Spinner />}
            Save changes
          </Button>
        </div>
      </form>
    </div>
  )
}

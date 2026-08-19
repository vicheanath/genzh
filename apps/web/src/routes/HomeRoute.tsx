import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { CompassIcon, HashIcon, PlusIcon, UserPlusIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Skeleton } from '@/components/Skeleton'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { ApiError, communities as communitiesApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/useAsync'

import type { ShellContext } from './AppShell'
import styles from './HomeRoute.module.css'

/** Landing screen: your communities, and the two ways to get another one. */
export function HomeRoute() {
  const { getToken, user } = useAuth()
  const { reloadCommunities } = useOutletContext<ShellContext>()
  const navigate = useNavigate()
  const toast = useToast()

  const communities = useAsync(
    async () => communitiesApi.list(await getToken()),
    [getToken],
  )

  const [name, setName] = useState('')
  const [joinId, setJoinId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)

  async function create(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy('create')
    try {
      const community = await communitiesApi.create(await getToken(), { name })
      setName('')
      reloadCommunities()
      communities.reload()
      toast.success(`${community.name} is ready`, 'Create a room to get started.')
      void navigate(`/c/${community.id}`)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create it')
    } finally {
      setBusy(null)
    }
  }

  async function join(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy('join')
    const id = joinId.trim()
    try {
      await communitiesApi.join(await getToken(), id)
      setJoinId('')
      reloadCommunities()
      communities.reload()
      toast.success('Joined')
      void navigate(`/c/${id}`)
    } catch (cause) {
      // Already a member is a success from the user's point of view.
      if (cause instanceof ApiError && cause.code === 'CONFLICT') {
        setJoinId('')
        reloadCommunities()
        void navigate(`/c/${id}`)
        return
      }
      setError(cause instanceof ApiError ? cause.message : 'Could not join')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.scroll}>
      <div className={styles.page}>
        <header className={styles.hero}>
          <p className={styles.greeting}>{greeting()}</p>
          <h1 className={styles.title}>{user?.profile.display_name ?? 'there'}</h1>
          <p className={styles.lede}>
            {communities.data?.length
              ? 'Pick up where you left off, or start somewhere new.'
              : 'You are not in any communities yet. Create one, or join with an invite.'}
          </p>
        </header>

        {error && <Callout tone="danger">{error}</Callout>}

        <section style={{ background: 'linear-gradient(135deg, var(--color-accent-subtle), var(--color-mint-subtle))', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-text)' }}>
              <CompassIcon size={18} />
              Explore Public Communities
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
              Discover active servers, gaming groups, and learning spaces.
            </p>
          </div>
          <Link to="/explore">
            <Button size="sm">
              <CompassIcon size={15} />
              Browse Communities
            </Button>
          </Link>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Your communities</h2>

          {communities.loading && (
            <div className={styles.grid}>
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className={styles.card}>
                  <Skeleton circle width="2.375rem" height="2.375rem" />
                  <Skeleton width="60%" height="0.9rem" />
                </div>
              ))}
            </div>
          )}

          {!communities.loading && communities.data?.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyMark} aria-hidden>
                <HashIcon size={22} />
              </span>
              <p>Nothing here yet — the forms below are where it starts.</p>
            </div>
          )}

          {communities.data && communities.data.length > 0 && (
            <div className={styles.grid}>
              {communities.data.map((community) => (
                <Link key={community.id} to={`/c/${community.id}`} className={styles.card}>
                  <Avatar name={community.name} src={community.icon_url} size="md" />
                  <div className={styles.cardBody}>
                    <div className={styles.cardName}>{community.name}</div>
                    {community.description && (
                      <p className={styles.cardDescription}>{community.description}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className={styles.forms}>
          <form className={styles.form} onSubmit={create}>
            <div className={styles.formHead}>
              <span className={styles.formMark} aria-hidden>
                <PlusIcon size={16} />
              </span>
              <div>
                <div className={styles.formTitle}>Create a community</div>
                <p className={styles.formHint}>You will own it, and can invite anyone.</p>
              </div>
            </div>
            <div className={styles.row}>
              <Input
                className={styles.grow}
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Night Owls"
                maxLength={64}
                required
              />
              <Button type="submit" disabled={busy !== null || !name.trim()}>
                {busy === 'create' && <Spinner />}
                Create
              </Button>
            </div>
          </form>

          <form className={styles.form} onSubmit={join}>
            <div className={styles.formHead}>
              <span className={styles.formMark} aria-hidden>
                <UserPlusIcon size={16} />
              </span>
              <div>
                <div className={styles.formTitle}>Join with an invite</div>
                <p className={styles.formHint}>Paste the community id someone shared.</p>
              </div>
            </div>
            <div className={styles.row}>
              <Input
                className={styles.grow}
                label="Community id"
                value={joinId}
                onChange={(event) => setJoinId(event.target.value)}
                placeholder="6f1c…"
                spellCheck={false}
                required
              />
              <Button type="submit" variant="secondary" disabled={busy !== null || !joinId.trim()}>
                {busy === 'join' && <Spinner />}
                Join
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

/** Time-of-day greeting, from the reader's own clock. */
function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Still up,'
  if (hour < 12) return 'Good morning,'
  if (hour < 18) return 'Good afternoon,'
  return 'Good evening,'
}

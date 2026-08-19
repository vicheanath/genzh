import { useState, type FormEvent } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { ApiError, communities as communitiesApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'

import type { ShellContext } from './AppShell'
import styles from './HomeRoute.module.css'

/** Landing screen: create a community, or join one by id. */
export function HomeRoute() {
  const { getToken, user } = useAuth()
  const { reloadCommunities } = useOutletContext<ShellContext>()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [joinId, setJoinId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)

  async function create(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy('create')
    try {
      const token = await getToken()
      const community = await communitiesApi.create(token, { name })
      setName('')
      reloadCommunities()
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
    try {
      const token = await getToken()
      const id = joinId.trim()
      await communitiesApi.join(token, id)
      setJoinId('')
      reloadCommunities()
      void navigate(`/c/${id}`)
    } catch (cause) {
      // Already a member is a success from the user's point of view.
      if (cause instanceof ApiError && cause.code === 'CONFLICT') {
        reloadCommunities()
        void navigate(`/c/${joinId.trim()}`)
        return
      }
      setError(cause instanceof ApiError ? cause.message : 'Could not join')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.title}>
          Hey {user?.profile.display_name ?? 'there'}
        </h1>
        <p className={styles.lede}>
          Pick a community on the left, or start a new one.
        </p>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <form className={styles.form} onSubmit={create}>
        <div className={styles.formTitle}>Create a community</div>
        <div className={styles.row}>
          <Input
            className={styles.grow}
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Night Owls"
            required
          />
          <Button type="submit" disabled={busy !== null || !name.trim()}>
            {busy === 'create' && <Spinner />}
            Create
          </Button>
        </div>
      </form>

      <form className={styles.form} onSubmit={join}>
        <div className={styles.formTitle}>Join with an invite</div>
        <div className={styles.row}>
          <Input
            className={styles.grow}
            label="Community id"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="6f1c…"
            spellCheck={false}
            required
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={busy !== null || !joinId.trim()}
          >
            {busy === 'join' && <Spinner />}
            Join
          </Button>
        </div>
      </form>
    </div>
  )
}

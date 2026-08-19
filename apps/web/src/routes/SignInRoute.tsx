import { useState, type FormEvent } from 'react'

import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { HashIcon, MicIcon, UsersIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'

import styles from './SignInRoute.module.css'

type Mode = 'signin' | 'register'

const PITCH = [
  { icon: HashIcon, text: 'Rooms for every conversation, with permissions that actually mean something.' },
  { icon: MicIcon, text: 'Voice and video that connect straight between you — no server in the middle of the audio.' },
  { icon: UsersIcon, text: 'Communities you own, invites you control, friends who follow you across all of them.' },
]

export function SignInRoute() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        await login(identifier, password)
      } else {
        await register({
          handle: identifier,
          email,
          password,
          displayName: displayName || undefined,
        })
      }
      // On success the router swaps this screen out; no navigation needed here.
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.page}>
      <aside className={styles.pitch}>
        <span className={styles.pitchBrand}>genzh</span>
        <h1 className={styles.pitchTitle}>Somewhere to hang out with your people.</h1>
        <ul className={styles.pitchList}>
          {PITCH.map(({ icon: Icon, text }) => (
            <li key={text} className={styles.pitchItem}>
              <span className={styles.pitchMark} aria-hidden>
                <Icon size={15} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </aside>

      <div className={styles.formPane}>
        <div className={styles.card}>
          <h1 className={styles.brand}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className={styles.tagline}>
            {mode === 'signin'
              ? 'Sign in to pick up where you left off.'
              : 'It takes about twenty seconds.'}
          </p>

          {error && <Callout tone="danger">{error}</Callout>}

          <form className={styles.form} onSubmit={submit} noValidate>
            <Input
              label={mode === 'signin' ? 'Handle or e-mail' : 'Handle'}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete={mode === 'signin' ? 'username' : 'off'}
              autoCapitalize="none"
              spellCheck={false}
              required
              description={
                mode === 'register' ? '3–32 characters: letters, digits, _ and .' : undefined
              }
            />

            {mode === 'register' && (
              <>
                <Input
                  label="E-mail"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
                <Input
                  label="Display name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Optional — defaults to your handle"
                />
              </>
            )}

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              description={mode === 'register' ? 'At least 10 characters' : undefined}
            />

            <Button type="submit" size="lg" disabled={busy}>
              {busy && <Spinner />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className={styles.switcher}>
            {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                setMode(mode === 'signin' ? 'register' : 'signin')
                setError(null)
              }}
            >
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </main>
  )
}

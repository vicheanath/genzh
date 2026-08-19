import { useState, type FormEvent } from 'react'

import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'

import styles from './SignInRoute.module.css'

type Mode = 'signin' | 'register'

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
      <div className={styles.card}>
        <h1 className={styles.brand}>genzh</h1>
        <p className={styles.tagline}>Somewhere to hang out with your people.</p>

        {error && <Callout tone="danger">{error}</Callout>}

        <form className={styles.form} onSubmit={submit} noValidate>
          <Input
            label={mode === 'signin' ? 'Handle or e-mail' : 'Handle'}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
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
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <Input
                label="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Optional — defaults to your handle"
              />
            </>
          )}

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
    </main>
  )
}

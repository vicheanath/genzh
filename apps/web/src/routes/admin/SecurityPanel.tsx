import { useState } from 'react'

import { useConfirm } from '@/components/AlertDialog'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useBanIpMutation,
  useBlockEmailDomainMutation,
  useBlockedEmailDomains,
  useIpBans,
  useIsPlatformAdmin,
  useUnbanIpMutation,
  useUnblockEmailDomainMutation,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import styles from './panels.module.css'

/**
 * Access bans: IP/CIDR restrictions and disposable email domain blocks.
 */
export function SecurityPanel() {
  const isAdmin = useIsPlatformAdmin()
  const ipBans = useIpBans()
  const emailDomains = useBlockedEmailDomains()
  const banIp = useBanIpMutation()
  const unbanIp = useUnbanIpMutation()
  const blockDomain = useBlockEmailDomainMutation()
  const unblockDomain = useUnblockEmailDomainMutation()
  const confirm = useConfirm()
  const toast = useToast()

  const [newIp, setNewIp] = useState('')
  const [ipReason, setIpReason] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [domainReason, setDomainReason] = useState('')

  const ipList = ipBans.data ?? []
  const domainList = emailDomains.data ?? []

  async function handleBanIp(e: React.FormEvent) {
    e.preventDefault()
    if (!newIp.trim() || !ipReason.trim()) {
      toast.error('IP address and reason required')
      return
    }
    try {
      await banIp.mutateAsync({ ipOrCidr: newIp.trim(), reason: ipReason.trim() })
      setNewIp('')
      setIpReason('')
      toast.success(`IP ${newIp.trim()} banned`)
    } catch (cause) {
      toast.error('Could not ban IP', errorText(cause))
    }
  }

  async function handleUnbanIp(id: string, ip: string) {
    const ok = await confirm({
      title: `Unban IP ${ip}?`,
      description: 'This will allow traffic from this IP address / range again.',
      confirmLabel: 'Lift Ban',
    })
    if (!ok) return
    try {
      await unbanIp.mutateAsync(id)
      toast.success(`Ban lifted for ${ip}`)
    } catch (cause) {
      toast.error('Could not unban IP', errorText(cause))
    }
  }

  async function handleBlockDomain(e: React.FormEvent) {
    e.preventDefault()
    if (!newDomain.trim()) {
      toast.error('Domain name required')
      return
    }
    try {
      await blockDomain.mutateAsync({
        domain: newDomain.trim(),
        reason: domainReason.trim() || undefined,
      })
      setNewDomain('')
      setDomainReason('')
      toast.success(`Domain ${newDomain.trim()} blocked`)
    } catch (cause) {
      toast.error('Could not block domain', errorText(cause))
    }
  }

  async function handleUnblockDomain(domain: string) {
    const ok = await confirm({
      title: `Unblock Domain ${domain}?`,
      description: 'Users will be allowed to register with email addresses from this domain again.',
      confirmLabel: 'Unblock',
    })
    if (!ok) return
    try {
      await unblockDomain.mutateAsync(domain)
      toast.success(`Domain ${domain} unblocked`)
    } catch (cause) {
      toast.error('Could not unblock domain', errorText(cause))
    }
  }

  return (
    <div className={styles.stack}>
      {/* IP & CIDR Network Bans */}
      <section className={styles.stack}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
          IP & CIDR Network Bans ({ipList.length})
        </h2>

        {isAdmin && (
          <form onSubmit={handleBanIp} className={styles.card} style={{ gap: 'var(--space-2)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '12rem 1fr auto', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
              <Input
                label="IP or CIDR"
                placeholder="e.g. 192.168.1.1 or 10.0.0.0/16"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                required
              />
              <Input
                label="Ban Reason"
                placeholder="Malicious traffic, bot farm, brute force, etc."
                value={ipReason}
                onChange={(e) => setIpReason(e.target.value)}
                required
              />
              <Button type="submit" variant="danger" disabled={banIp.isPending || !newIp.trim()}>
                Ban IP
              </Button>
            </div>
          </form>
        )}

        {ipBans.isLoading && <Skeleton height="4rem" />}
        {ipBans.error && <Callout tone="danger">{errorText(ipBans.error, 'Could not load IP bans')}</Callout>}
        {!ipBans.isLoading && ipList.length === 0 && (
          <p className={styles.empty}>No active IP or CIDR network bans.</p>
        )}

        {ipList.map((ban) => (
          <article key={ban.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <strong><code>{ban.ip_or_cidr}</code></strong>
                <span className={styles.rowMeta}> · Reason: {ban.reason}</span>
              </div>
              <Badge tone="danger">banned</Badge>
            </div>
            <p className={styles.rowMeta}>Banned {formatFull(ban.created_at)}</p>
            {isAdmin && (
              <div className={styles.cardActions}>
                <Button variant="ghost" size="sm" onClick={() => void handleUnbanIp(ban.id, ban.ip_or_cidr)}>
                  Lift Ban
                </Button>
              </div>
            )}
          </article>
        ))}
      </section>

      {/* Blocked Disposable Email Domains */}
      <section className={styles.stack} style={{ marginTop: 'var(--space-4)' }}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
          Blocked Email Domains ({domainList.length})
        </h2>

        {isAdmin && (
          <form onSubmit={handleBlockDomain} className={styles.card} style={{ gap: 'var(--space-2)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '14rem 1fr auto', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
              <Input
                label="Email Domain"
                placeholder="e.g. tempmail.com, 10minutemail.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                required
              />
              <Input
                label="Reason (Optional)"
                placeholder="Disposable inbox service, spam farm, etc."
                value={domainReason}
                onChange={(e) => setDomainReason(e.target.value)}
              />
              <Button type="submit" disabled={blockDomain.isPending || !newDomain.trim()}>
                Block Domain
              </Button>
            </div>
          </form>
        )}

        {emailDomains.isLoading && <Skeleton height="4rem" />}
        {emailDomains.error && (
          <Callout tone="danger">{errorText(emailDomains.error, 'Could not load blocked domains')}</Callout>
        )}
        {!emailDomains.isLoading && domainList.length === 0 && (
          <p className={styles.empty}>No blocked email domains.</p>
        )}

        {domainList.map((d) => (
          <article key={d.domain} className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <strong>@{d.domain}</strong>
                {d.reason && <span className={styles.rowMeta}> · {d.reason}</span>}
              </div>
              <Badge tone="neutral">blocked</Badge>
            </div>
            <p className={styles.rowMeta}>Blocked {formatFull(d.created_at)}</p>
            {isAdmin && (
              <div className={styles.cardActions}>
                <Button variant="ghost" size="sm" onClick={() => void handleUnblockDomain(d.domain)}>
                  Unblock
                </Button>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  )
}

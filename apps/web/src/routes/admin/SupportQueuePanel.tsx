import { useState } from 'react'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useIsStaff,
  useStaffReplyMutation,
  useSupportQueue,
  useSupportTicket,
  useUpdateTicketMutation,
  type SupportTicket,
  type TicketStatus,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import styles from './panels.module.css'

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Waiting on reporter' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
] as const satisfies ReadonlyArray<{ value: TicketStatus; label: string }>

const STATUS_TONE: Record<TicketStatus, 'danger' | 'accent' | 'success' | 'neutral'> = {
  open: 'danger',
  pending: 'accent',
  resolved: 'success',
  closed: 'neutral',
}

const KINDS = [
  { id: 'all', label: 'All Kinds' },
  { id: 'report', label: 'Reports' },
  { id: 'help', label: 'Help Requests' },
] as const

/** Reports and help requests, and the thread on whichever one is selected. */
export function SupportQueuePanel() {
  const [status, setStatus] = useState<TicketStatus | 'all'>('open')
  const [kind, setKind] = useState<string>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [ticketSearch, setTicketSearch] = useState<string>('')

  const queue = useSupportQueue({
    status: status === 'all' ? undefined : status,
    kind: kind === 'all' ? undefined : kind,
    q: ticketSearch.trim() || undefined,
  })
  const tickets = queue.data?.tickets ?? []

  return (
    <div className={styles.split}>
      <div className={styles.list}>
        <div className={styles.listHeader}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div className={styles.chips}>
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className={`${styles.chip} ${kind === k.id ? styles.chipActive : ''}`}
                  onClick={() => {
                    setKind(k.id)
                    setSelected(null)
                  }}
                >
                  {k.label}
                </button>
              ))}
            </div>

            <Select
              aria-label="Filter by status"
              value={status}
              onValueChange={(next) => {
                setStatus(next)
                setSelected(null)
              }}
              options={[{ value: 'all' as const, label: 'All Statuses' }, ...STATUSES]}
            />
            <Input
              label="Search queue"
              aria-label="Search tickets"
              placeholder="Filter queue by keyword…"
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
            />
          </div>
        </div>

        {queue.isLoading && <Skeleton height="4rem" />}
        {queue.error && (
          <Callout tone="danger">{errorText(queue.error, 'Could not load the queue')}</Callout>
        )}
        {!queue.isLoading && tickets.length === 0 && (
          <p className={styles.empty}>No tickets match your filters.</p>
        )}

        {tickets.map((ticket) => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            active={ticket.id === selected}
            onSelect={() => setSelected(ticket.id)}
          />
        ))}
      </div>

      <div className={styles.detail}>
        {selected ? (
          <TicketThread ticketId={selected} />
        ) : (
          <p className={styles.empty}>Pick a ticket to view the thread and respond.</p>
        )}
      </div>
    </div>
  )
}

function TicketRow({
  ticket,
  active,
  onSelect,
}: {
  ticket: SupportTicket
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={active ? `${styles.row} ${styles.rowActive}` : styles.row}
    >
      <div className={styles.rowTop}>
        <Badge tone={ticket.kind === 'report' ? 'danger' : 'neutral'}>
          {ticket.kind === 'report' ? 'Report' : 'Help'}
        </Badge>
        <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status}</Badge>
      </div>
      <span className={styles.rowSubject}>{ticket.subject}</span>
      <span className={styles.rowMeta}>
        {ticket.category} · {formatFull(ticket.created_at)}
      </span>
    </button>
  )
}

const CANNED_REPLIES = [
  {
    label: 'Investigating',
    text: 'Thank you for bringing this to our attention. Our moderation team is currently reviewing this report.',
  },
  {
    label: 'Action Taken',
    text: 'We have reviewed this report and taken the appropriate moderation action in accordance with our platform guidelines.',
  },
  {
    label: 'Need More Info',
    text: 'Could you please provide more context or details regarding what occurred so we can assist further?',
  },
]

/** One ticket: what was said, and the two things staff can do about it. */
function TicketThread({ ticketId }: { ticketId: string }) {
  const isStaff = useIsStaff()
  const toast = useToast()
  const detail = useSupportTicket(ticketId)
  const reply = useStaffReplyMutation()
  const updateTicket = useUpdateTicketMutation()

  const [body, setBody] = useState('')
  const [staffOnly, setStaffOnly] = useState(false)

  if (!isStaff) return null
  if (detail.isLoading) return <Skeleton height="12rem" />
  if (detail.error) {
    return <Callout tone="danger">{errorText(detail.error, 'Could not load this ticket')}</Callout>
  }
  if (!detail.data) return null

  const { ticket, messages } = detail.data

  async function send() {
    if (!body.trim()) return
    try {
      await reply.mutateAsync({ ticketId, body, staffOnly })
      setBody('')
      setStaffOnly(false)
      toast.success(staffOnly ? 'Note added' : 'Reply sent')
    } catch (cause) {
      toast.error('Could not send', errorText(cause))
    }
  }

  async function move(status: TicketStatus) {
    try {
      await updateTicket.mutateAsync({ ticketId, patch: { status } })
      toast.success(`Moved to ${status}`)
    } catch (cause) {
      toast.error('Could not update the ticket', errorText(cause))
    }
  }

  return (
    <article className={styles.thread}>
      <header className={styles.threadHeader}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
          <h2 className={styles.threadSubject}>{ticket.subject}</h2>
          <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status}</Badge>
        </div>
        <p className={styles.rowMeta}>
          {ticket.kind === 'report' ? 'Report' : 'Help request'} · {ticket.category} ·{' '}
          {formatFull(ticket.created_at)}
        </p>
        {ticket.subject_type && (
          <p className={styles.rowMeta}>
            About a <strong>{ticket.subject_type}</strong>
            {ticket.subject_id ? ` (ID: ${ticket.subject_id})` : ''}
          </p>
        )}
      </header>

      <p className={styles.threadBody}>{ticket.details}</p>

      <div className={styles.messages}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.staff_only ? `${styles.message} ${styles.note}` : styles.message}
          >
            {message.staff_only && <Badge tone="accent">Internal note</Badge>}
            <p>{message.body}</p>
            <span className={styles.rowMeta}>{formatFull(message.created_at)}</span>
          </div>
        ))}
      </div>

      <div className={styles.composer}>
        <div className={styles.cannedResponses}>
          <span className={styles.cannedLabel}>Quick Templates:</span>
          {CANNED_REPLIES.map((canned) => (
            <button
              key={canned.label}
              type="button"
              className={styles.chip}
              onClick={() => setBody(canned.text)}
            >
              {canned.label}
            </button>
          ))}
        </div>

        <Input
          label={staffOnly ? 'Internal note (the reporter never sees this)' : 'Reply'}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={staffOnly ? 'Context for whoever picks this up next…' : 'Write a reply…'}
          maxLength={4000}
        />

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={staffOnly}
            onChange={(event) => setStaffOnly(event.target.checked)}
          />
          Internal note
        </label>

        <div className={styles.actions}>
          <Button onClick={() => void send()} disabled={reply.isPending || !body.trim()}>
            {staffOnly ? 'Add note' : 'Send reply'}
          </Button>
          {ticket.status !== 'resolved' && (
            <Button variant="secondary" onClick={() => void move('resolved')}>
              Mark Resolved
            </Button>
          )}
          {ticket.status !== 'closed' && (
            <Button variant="ghost" onClick={() => void move('closed')}>
              Close Ticket
            </Button>
          )}
          {ticket.status === 'closed' && (
            <Button variant="ghost" onClick={() => void move('open')}>
              Re-open Ticket
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

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

/** Reports and help requests, and the thread on whichever one is selected. */
export function SupportQueuePanel() {
  const [status, setStatus] = useState<TicketStatus | 'all'>('open')
  const [selected, setSelected] = useState<string | null>(null)

  const queue = useSupportQueue(status === 'all' ? {} : { status })
  const tickets = queue.data?.tickets ?? []

  return (
    <div className={styles.split}>
      <div className={styles.list}>
        <div className={styles.listHeader}>
          <Select
            aria-label="Filter by status"
            value={status}
            onValueChange={(next) => {
              setStatus(next)
              // The selected ticket may not be in the new filter; keeping it
              // would leave a thread open beside a list that no longer has it.
              setSelected(null)
            }}
            options={[{ value: 'all' as const, label: 'All' }, ...STATUSES]}
          />
        </div>

        {queue.isLoading && <Skeleton height="4rem" />}
        {queue.error && (
          <Callout tone="danger">{errorText(queue.error, 'Could not load the queue')}</Callout>
        )}
        {!queue.isLoading && tickets.length === 0 && (
          <p className={styles.empty}>Nothing waiting. </p>
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
          <p className={styles.empty}>Pick a ticket to read it.</p>
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
        <h2 className={styles.threadSubject}>{ticket.subject}</h2>
        <p className={styles.rowMeta}>
          {ticket.kind === 'report' ? 'Report' : 'Help request'} · {ticket.category} ·{' '}
          {formatFull(ticket.created_at)}
        </p>
        {ticket.subject_type && (
          <p className={styles.rowMeta}>
            About a {ticket.subject_type}
            {ticket.subject_id ? ` (${ticket.subject_id})` : ''}
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
              Resolve
            </Button>
          )}
          {ticket.status !== 'closed' && (
            <Button variant="ghost" onClick={() => void move('closed')}>
              Close
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

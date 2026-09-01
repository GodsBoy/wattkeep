import {
  Archive,
  ClipboardCheck,
  GitCommitHorizontal,
  History,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Undo2,
} from 'lucide-react'

import type { JournalEntry, StoreSnapshot } from '../state/store'

export interface OperationJournalProps {
  readonly snapshot: StoreSnapshot
}

const readableEvent = (entry: JournalEntry): string => {
  switch (entry.event) {
    case 'session-reset': return 'Session reset'
    case 'proposal-staged': return 'Proposal staged'
    case 'review-requested': return 'Review requested'
    case 'forecast-refreshed': return 'Forecast refreshed'
    case 'stale-rejection': return 'Stale proposal rejected'
    case 'proposal-discarded': return 'Proposal discarded'
    case 'commit': return 'Policy committed'
    case 'undo': return 'Commit undone'
    default: return 'Operation recorded'
  }
}

const eventIcon = (entry: JournalEntry) => {
  switch (entry.event) {
    case 'session-reset': return <RotateCcw size={15} aria-hidden="true" />
    case 'proposal-staged': return <ClipboardCheck size={15} aria-hidden="true" />
    case 'review-requested': return <History size={15} aria-hidden="true" />
    case 'forecast-refreshed': return <Archive size={15} aria-hidden="true" />
    case 'stale-rejection': return <ShieldAlert size={15} aria-hidden="true" />
    case 'proposal-discarded': return <Trash2 size={15} aria-hidden="true" />
    case 'commit': return <GitCommitHorizontal size={15} aria-hidden="true" />
    case 'undo': return <Undo2 size={15} aria-hidden="true" />
    default: return <History size={15} aria-hidden="true" />
  }
}

export default function OperationJournal({ snapshot }: OperationJournalProps) {
  return (
    <section className="journal-section" aria-labelledby="journal-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Append-only record</p>
          <h2 id="journal-heading">Operation journal</h2>
        </div>
        <span className="journal-session">Session {snapshot.sessionEpoch}</span>
      </div>

      {snapshot.journal.length === 0 ? (
        <div className="empty-state empty-state--journal">
          <History size={20} aria-hidden="true" />
          <p>No operations recorded in this session.</p>
        </div>
      ) : (
        <ol className="journal-list" aria-label="Current session operation journal">
          {[...snapshot.journal].reverse().map((entry) => (
            <li className="journal-entry" key={entry.id}>
              <span className="journal-icon" aria-hidden="true">{eventIcon(entry)}</span>
              <div className="journal-entry-main">
                <strong>{readableEvent(entry)}</strong>
                <span>{entry.planId ? `Plan: ${entry.planId}` : 'Session operation'}</span>
              </div>
              <div className="journal-entry-meta">
                <span>r{entry.workspaceRevision}</span>
                <span>#{entry.sequence}</span>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="journal-footnote">
        {snapshot.archivedSessions.length === 0
          ? 'No archived sessions.'
          : `${snapshot.archivedSessions.length} archived ${snapshot.archivedSessions.length === 1 ? 'session' : 'sessions'}.`}
      </p>
    </section>
  )
}

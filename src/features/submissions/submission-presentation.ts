import { SUBMISSION_ENTRY_TYPE, SUBMISSION_KIND } from '../../shared/crypto/agent-submission'
import type { SubmissionListItem } from './api/submissions-api'

export interface SubmissionSummaryKeys {
  kindKey: string
  typeKey: string
  icon: string
}

/** Unknown future kinds or entry types stay visible with neutral copy. */
export function submissionSummaryKeys(item: Pick<SubmissionListItem, 'submissionKind' | 'entryType'>): SubmissionSummaryKeys {
  return {
    kindKey: item.submissionKind === SUBMISSION_KIND.new ? 'submissions.kindNew'
      : item.submissionKind === SUBMISSION_KIND.update ? 'submissions.kindUpdate' : 'submissions.kindUnknown',
    typeKey: item.entryType === SUBMISSION_ENTRY_TYPE.credential ? 'submissions.typeCredential'
      : item.entryType === SUBMISSION_ENTRY_TYPE.key ? 'submissions.typeKey' : 'submissions.typeUnknown',
    icon: item.entryType === SUBMISSION_ENTRY_TYPE.key ? 'key' : 'password',
  }
}

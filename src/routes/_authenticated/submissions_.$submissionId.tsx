import { createFileRoute } from '@tanstack/react-router'
import { SubmissionsPage, requireSubmissionReviewer, validateSubmissionsSearch } from '../../features/submissions'

export const Route = createFileRoute('/_authenticated/submissions_/$submissionId')({
  validateSearch: validateSubmissionsSearch,
  beforeLoad: requireSubmissionReviewer,
  component: SubmissionRoute,
})

function SubmissionRoute() {
  const { submissionId } = Route.useParams()
  const { view } = Route.useSearch()
  return <SubmissionsPage view={view ?? 'pending'} submissionId={submissionId} />
}

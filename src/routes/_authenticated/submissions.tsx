import { createFileRoute } from '@tanstack/react-router'
import { SubmissionsPage, requireSubmissionReviewer, validateSubmissionsSearch } from '../../features/submissions'

export const Route = createFileRoute('/_authenticated/submissions')({
  validateSearch: validateSubmissionsSearch,
  beforeLoad: requireSubmissionReviewer,
  component: SubmissionsRoute,
})

function SubmissionsRoute() {
  const { view } = Route.useSearch()
  return <SubmissionsPage view={view ?? 'pending'} />
}

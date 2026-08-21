import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ORG_QUERY_KEY } from '../settings/use-org'
import { inviteOrganizationMember } from './api/organization-invitations-api'
import { ORGANIZATION_INVITATIONS_QUERY_KEY } from './use-organization-invitations'

export interface InviteMembersInput {
  emails: string[]
  roleId: string
}

export interface InviteMembersResult {
  succeeded: string[]
  failed: Array<{ email: string; error: unknown }>
}

export function useInviteMembers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ emails, roleId }: InviteMembersInput): Promise<InviteMembersResult> => {
      const succeeded: string[] = []
      const failed: InviteMembersResult['failed'] = []

      for (const email of emails) {
        try {
          await inviteOrganizationMember({ email, roleId })
          succeeded.push(email)
        } catch (error) {
          failed.push({ email, error })
        }
      }

      return { succeeded, failed }
    },
    onSuccess: async ({ succeeded }) => {
      if (succeeded.length === 0) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ORGANIZATION_INVITATIONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEY }),
      ])
    },
  })
}

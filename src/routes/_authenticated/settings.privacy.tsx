import { createFileRoute } from '@tanstack/react-router'
import { PrivacySettingsPage } from '../../features/privacy'

export const Route = createFileRoute('/_authenticated/settings/privacy')({ component: PrivacySettingsPage })

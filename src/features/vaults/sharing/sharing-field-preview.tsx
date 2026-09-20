import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SecretInput } from '../../../shared/components/secret-input'
import { ToggleSwitch } from '../../../shared/components/toggle-switch'
import type { EntryShareFieldChoice } from '../../../shared/crypto/entry-share-selection'
import { sharingFieldLabel } from './sharing-field-label'

interface SharingFieldPreviewProps {
  field: EntryShareFieldChoice
  selected: boolean
  disabled: boolean
  onChange: (selected: boolean) => void
}

export function SharingFieldPreview({ field, selected, disabled, onChange }: SharingFieldPreviewProps) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  const label = sharingFieldLabel(field, t)
  return <div className="flex items-center gap-3">
    <ToggleSwitch checked={selected} label={t('sharing.includeField', { field: label })} onChange={onChange} disabled={disabled} />
    <div className="min-w-0 flex-1">
      <SecretInput id={`sharing-field-${field.id}`} label={label} value={field.value} readOnly
        shown={shown} onToggleShown={() => setShown(!shown)} onChange={() => undefined} />
    </div>
  </div>
}

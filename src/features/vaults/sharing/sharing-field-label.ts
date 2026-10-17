import type { TFunction } from 'i18next'
import type { EntryShareField } from '../../../shared/crypto/entry-share'

export function sharingFieldLabel(field: Pick<EntryShareField, 'id' | 'label'>, t: TFunction): string {
  return field.id.startsWith('custom:') ? field.label : t(`sharing.fields.${field.id.replaceAll('.', '_')}`)
}

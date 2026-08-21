import { useTranslation } from 'react-i18next'
import type { AssignablePermission } from '../../../shared/api/organization-roles-api'
import { presentPermission, type PermissionGroup } from '../permission-catalog'

const GROUPS: PermissionGroup[] = ['organization', 'vaults', 'agents', 'oversight', 'other']

export function PermissionFields({
  permissions,
  value,
  disabled,
  onChange,
}: {
  permissions: AssignablePermission[]
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  const { t } = useTranslation()
  const presented = permissions.map(presentPermission)

  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((group) => {
        const items = presented.filter((permission) => permission.group === group)
        if (items.length === 0) return null
        return (
          <fieldset key={group} disabled={disabled}>
            <legend className="mb-2 text-meta font-semibold text-[var(--cv-t2)]">
              {t(`permissions.groups.${group}`)}
            </legend>
            <div className="flex flex-col gap-2">
              {items.map((permission) => (
                <label
                  key={permission.key}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--cv-border)] p-3 transition-colors hover:bg-[var(--cv-list-item-hover)] has-[:disabled]:cursor-not-allowed"
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-[var(--cv-primary)] disabled:opacity-60"
                    checked={(value & permission.value) !== 0}
                    disabled={!permission.canAssign}
                    onChange={(event) => onChange(
                      event.target.checked ? value | permission.value : value & ~permission.value,
                    )}
                  />
                  <span>
                    <span className="block text-ui font-semibold">
                      {t(permission.labelKey, { key: permission.key })}
                    </span>
                    <span className="block text-meta text-[var(--cv-t3)]">
                      {t(permission.descriptionKey, { key: permission.key })}
                    </span>
                    {!permission.canAssign ? (
                      <span className="mt-1 block text-meta text-[var(--cv-premium)]">
                        {t('permissions.cannotDelegatePermission')}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}

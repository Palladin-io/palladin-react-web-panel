import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { FormInput, FeedbackSlot } from '../../../shared/components/form-field'
import { SecretInput } from '../../../shared/components/secret-input'

type ProofKind = 'otp' | 'pin' | 'password'
const schemas = {
  otp: z.string().trim().regex(/^[0-9]{6}$/),
  pin: z.string().regex(/^[0-9]{6,128}$/),
  password: z.string().min(8).max(128),
}

export function RecipientProofForm({ kind, disabled, onVerify }: {
  kind: ProofKind
  disabled: boolean
  onVerify: (value: string) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [shown, setShown] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const label = t(kind === 'otp' ? 'sharing.receiver.otpCode' : `sharing.${kind}`)
  const valid = schemas[kind].safeParse(value)
  function change(next: string) { setValue(next); setInvalid(false) }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid.success || disabled) return
    const proof = valid.data
    setValue(''); setShown(false)
    await onVerify(proof)
  }
  return <form noValidate onSubmit={(event) => { void submit(event) }} className="flex flex-col gap-3">
    <div>
      {kind === 'otp' ? <FormInput id="recipient-otp" label={label} value={value} inputMode="numeric" autoComplete="one-time-code"
        disabled={disabled} error={invalid} onChange={(event) => change(event.target.value)} onBlur={() => setInvalid(!valid.success)} /> :
        <SecretInput id="recipient-secret" label={label} value={value} onChange={change} shown={shown} onToggleShown={() => setShown(!shown)}
          disabled={disabled} error={invalid} onBlur={() => setInvalid(!valid.success)} />}
      <FeedbackSlot visible={invalid} color="red">{t(kind === 'otp' ? 'sharing.receiver.invalidOtp' : kind === 'pin' ? 'sharing.invalidPin' : 'sharing.invalidPassword')}</FeedbackSlot>
    </div>
    <Button size="sm" variant="subtle" type="submit" disabled={disabled || !valid.success}>
      {t(kind === 'otp' ? 'sharing.receiver.verifyEmail' : 'sharing.receiver.verifySecret')}
    </Button>
  </form>
}

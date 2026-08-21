const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface EmailRecipientValue {
  recipients: string[]
  draft: string
}

export interface ParsedEmailRecipients {
  valid: string[]
  invalid: string[]
}

export function parseEmailRecipients(value: string): ParsedEmailRecipients {
  const unique = [...new Set(
    value
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )]

  return {
    valid: unique.filter((email) => EMAIL_PATTERN.test(email)),
    invalid: unique.filter((email) => !EMAIL_PATTERN.test(email)),
  }
}

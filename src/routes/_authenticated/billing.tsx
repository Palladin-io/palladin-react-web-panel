import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../shared/components/icon'

export const Route = createFileRoute('/_authenticated/billing')({
  component: BillingPage,
})

function BillingPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span className="text-[#FF4F4F]">
        <Icon name="credit_card" size={40} />
      </span>
      <h1 className="text-[20px] font-bold text-[#FDF9E4]">
        {t('nav.billing')}
      </h1>
      <p className="max-w-sm text-sm text-[#5A6478]">
        {t('nav.comingSoon')}
      </p>
    </div>
  )
}

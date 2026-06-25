export interface ProgressDotsProps {
  current: number
  total: number
}

export function ProgressDots({ current, total }: ProgressDotsProps) {
  return (
    <div
      className="mb-5 flex justify-center gap-2"
      role="progressbar"
      aria-label="Onboarding progress"
      aria-valuenow={current + 1}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={
            'h-2 w-2 rounded-full transition-colors ' +
            (index < current
              ? 'bg-[#FFAB87]'
              : index === current
                ? 'bg-[var(--cv-primary)]'
                : 'bg-[rgba(253,249,228,0.08)]')
          }
        />
      ))}
    </div>
  )
}

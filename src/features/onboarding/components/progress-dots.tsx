export interface ProgressDotsProps {
  current: number
  total: number
}

export function ProgressDots({ current, total }: ProgressDotsProps) {
  return (
    <div
      className="mb-6 flex justify-center gap-2"
      role="progressbar"
      aria-valuenow={current + 1}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={
            'h-1.5 w-6 rounded-full transition-colors ' +
            (index < current
              ? 'bg-[#2EC4B6]'
              : index === current
                ? 'bg-[#FDF9E4]'
                : 'bg-[rgba(253,249,228,0.1)]')
          }
        />
      ))}
    </div>
  )
}

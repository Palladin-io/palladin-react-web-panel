import type { CSSProperties } from 'react'

export interface SkeletonBlockProps {
  height?: CSSProperties['height']
  rounded?: 'xl' | '2xl'
  className?: string
}

const ROUNDED_CLASSES = {
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
} as const

export function SkeletonBlock({
  height,
  rounded = '2xl',
  className = '',
}: SkeletonBlockProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-[var(--cv-card-bg)] ${ROUNDED_CLASSES[rounded]} ${className}`}
      style={height === undefined ? undefined : { height }}
    />
  )
}

import { Button, type ButtonProps } from './button'

interface AddButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'variant' | 'size' | 'aria-label' | 'title'> {
  label: string
}

export function AddButton({ label, className = '', ...props }: AddButtonProps) {
  return <Button {...props} variant="accent" size="sm" icon="add" aria-label={label} title={label} className={`w-action shrink-0 !px-0 ${className}`} />
}

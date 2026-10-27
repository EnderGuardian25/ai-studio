import { cn } from '@/lib/utils'

/**
 * The "Studio" wordmark (DESIGN_SYSTEM.md §8.1): the product name typeset in
 * the display face, as the Folio study draws it. Fraunces italic, tracking
 * −0.02em, optical size 72, in the ink token. It is text in --fg, so it
 * switches with the theme and needs no dark:invert.
 *
 * `size`: `xl` (24 px) is the shell size; `2xl` (42 px) is the login page.
 */
export function Logo({
  size = 'xl',
  className,
}: {
  size?: 'xl' | '2xl'
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label="Studio"
      className={cn(
        'inline-block shrink-0 whitespace-nowrap leading-none',
        'font-display italic font-normal tracking-[-0.02em] text-fg',
        "[font-variation-settings:'opsz'_72]",
        size === '2xl' ? 'text-ui-2xl' : 'text-ui-xl',
        className,
      )}
    >
      Studio
    </span>
  )
}

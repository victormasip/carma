import { cn } from '@/lib/cn'

/**
 * The Carma mark — the Buddhist Endless Knot (Shrivatsa), our symbol of infinite,
 * interwoven wisdom. This is the authentic woven knot (from a filled, interlaced
 * path), filled with the brand gold gradient.
 *
 * The source art sat in a 50×62.5 box with ~12 units of empty space below it, so
 * we re-centre it with a tight square viewBox (`KNOT_VIEWBOX`). {@link KnotLoader}
 * strokes the SAME path's outline to make the knot "draw itself".
 *
 * Server-safe (no hooks): the gold gradient uses a fixed id and object-bounding-box
 * coordinates, so every instance on the page resolves to the same identical gradient.
 */
export const KNOT_PATH =
  'M44.021,19.745l-8.557-8.509l-5.225,5.225l-1.925-1.914l5.242-5.22L25,0.771l-8.555,8.555l5.216,5.216l-1.892,1.882l-5.233-5.233L5.98,19.746l5.244,5.244l-5.199,5.221l8.556,8.556l5.188-5.232l1.907,1.908l-5.232,5.232L25,49.229l8.556-8.556l-5.232-5.231l1.909-1.909l5.232,5.232l8.555-8.555l-5.232-5.232L44.021,19.745z M35.466,12.648l7.139,7.099l-4.524,4.525l0,0l-2.336,2.337l-2.895,2.895l-1.909-1.909l1.91-1.91l0,0l3.323-3.323l0,0l2.618-2.618l-3.328-3.273l-2.599,2.599l-1.915-1.904L35.466,12.648z M27.616,24.271l-3.323,3.323L24.3,27.6l-1.914,1.904l-1.909-1.909l7.139-7.099l1.909,1.909l-1.892,1.882L27.616,24.271z M17.865,24.984l1.904-1.915l1.914,1.914l-1.915,1.904L17.865,24.984z M30.247,23.096l1.893,1.882l-1.908,1.908l-1.893-1.893L30.247,23.096z M35.465,28.301l1.908,1.909l-1.908,1.909l-1.909-1.909L35.465,28.301z M35.463,21.655l-1.892-1.881l1.896-1.896l1.902,1.871L35.463,21.655z M32.849,20.497l0.016-0.016l1.892,1.881l-1.909,1.909l-7.139-7.099l1.909-1.909l1.915,1.904l-0.006,0.006L32.849,20.497z M22.369,15.249l0.016,0.016l5.94-5.938L25,6.003l-3.323,3.323l2.607,2.608l-1.914,1.903l-4.512-4.511L25,2.185l7.141,7.14l-9.755,9.714l-1.909-1.909L22.369,15.249z M24.994,11.229l-1.902-1.903L25,7.417l1.908,1.908L24.994,11.229z M24.984,17.863l1.931,1.92l-1.899,1.888l-1.924-1.924L24.984,17.863z M14.536,12.604l6.861,6.861l0.986,0.987l0,0l1.91,1.91l-1.909,1.909l-7.848-7.849l-3.323,3.323l2.616,2.616l-1.909,1.909l-4.525-4.525L14.536,12.604z M12.627,19.746l1.909-1.909l1.909,1.91l-1.905,1.913L12.627,19.746z M14.579,37.349l-7.14-7.14l9.714-9.755l1.909,1.909l-1.904,1.915l-0.006-0.006l-3.323,3.323l0.016,0.016l-2.587,2.601l3.325,3.325l2.572-2.616l0.953,0.953l0.954,0.954L14.579,37.349z M14.552,28.317l1.896,1.896l-1.871,1.903l-1.907-1.907L14.552,28.317z M20.473,32.824L20.473,32.824l-1.661-1.661l-3.555-3.555l1.903-1.914l7.133,7.133l-1.909,1.909L20.473,32.824z M21.677,40.674L25,43.997l3.323-3.323l-2.616-2.616l1.909-1.908l4.525,4.524L25,47.815l-7.141-7.142l4.525-4.525l0,0l3.323-3.323l0,0l1.909-1.909l1.909,1.909L21.677,40.674z M25,38.765l1.909,1.909L25,42.583l-1.909-1.909L25,38.765z M25,32.119l-1.908-1.908l1.915-1.904l1.903,1.902L25,32.119z M42.605,30.21l-7.141,7.141l-9.749-9.748l1.914-1.904l7.835,7.834l3.322-3.323l-2.615-2.616l0.685-0.685l1.224-1.224L42.605,30.21z'

/** Tight, re-centred square viewBox (the source art was top-aligned in a 50×62.5 box). */
export const KNOT_VIEWBOX = '-2.604 0 50 50'

export const KNOT_GRADIENT_ID = 'carma-knot-gold'

type Props = {
  /** Size of the square mark — a number (px) or any CSS length (e.g. '1.05em'). */
  size?: number | string
  className?: string
  /** Soft, continuous gold glow pulse (the calm brand mark). */
  glow?: boolean
  /** Adds a serene slow rotation on top of the glow — the "endless" spinner. */
  spin?: boolean
  /** Accessible label. Omit to render the mark as purely decorative. */
  title?: string
}

export default function EndlessKnot({
  size = 28,
  className,
  glow = false,
  spin = false,
  title,
}: Props) {
  return (
    <svg
      viewBox={KNOT_VIEWBOX}
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      className={cn(spin ? 'knot-spin' : glow && 'knot-glow', className)}
      style={{ overflow: 'visible' }}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        {/* Living gold: a bright sheen band sweeps diagonally across the weave
           (objectBoundingBox + reflect = seamless, self-relative for every
           instance). SMIL keeps it alive even when the OS has "reduce motion" on. */}
        <linearGradient id={KNOT_GRADIENT_ID} x1="0" y1="0" x2="0.72" y2="0.72" spreadMethod="reflect">
          <stop offset="0%" stopColor="#9a7409" />
          <stop offset="42%" stopColor="#f5bc00" />
          <stop offset="50%" stopColor="#fff7d6" />
          <stop offset="58%" stopColor="#f5bc00" />
          <stop offset="100%" stopColor="#9a7409" />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            values="0 0; 0.72 0.72; 0 0"
            dur="3.6s"
            repeatCount="indefinite"
          />
        </linearGradient>
      </defs>
      <path d={KNOT_PATH} fill={`url(#${KNOT_GRADIENT_ID})`} />
    </svg>
  )
}

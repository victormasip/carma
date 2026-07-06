// Carma Studio — shared UI types. Kept in its own module so components can import
// `Device` without pulling in a heavy component (and without import cycles).

export type Device = 'desktop' | 'tablet' | 'mobile'

// Intrinsic artboard width per device (CSS px, before the canvas zoom transform).
export const DEVICE_WIDTH: Record<Device, number> = {
  desktop: 1280,
  tablet: 834,
  mobile: 390,
}

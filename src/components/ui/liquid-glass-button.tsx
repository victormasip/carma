import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// "Apple Tahoe"-style liquid glass button, Carma edition.
//
// The original ships a ~30KB SVG feImage displacement map for true refraction; we
// keep the realistic frosted-glass look (layered inset box-shadows + backdrop
// blur/saturate) which is the Safari fallback path of the original — visually
// ~identical, a fraction of the weight. Defaults to a subtle gold-tinted glass.
const glassButtonVariants = cva(
  "relative isolate inline-flex items-center justify-center gap-2 rounded-full cursor-pointer transition-transform duration-300 ease-out tracking-tight disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
  {
    variants: {
      size: {
        default: "px-6 py-3.5 text-base font-medium",
        sm: "px-4 py-2 text-sm font-medium",
        lg: "px-8 py-4 text-lg font-medium",
        icon: "h-10 w-10 p-0 gap-0",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  contentClassName?: string;
  /** Tint of the glass. Defaults to a subtle gold. e.g. "oklch(from var(--color-accent) l c h / 14%)" */
  glassColor?: string;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, size, contentClassName, glassColor, ...props }, ref) => {
    return (
      <>
        <style>{`
          .cz-glass {
            appearance: none;
            border: none;
            background: transparent;
            color: oklch(from var(--color-foreground) l c h / 95%);
            --glass-reflex-light: 1;
            --glass-reflex-dark: 1;
          }
          .cz-glass-lens {
            background-color: ${glassColor || "color-mix(in srgb, var(--color-accent) 14%, transparent)"};
            backdrop-filter: blur(8px) saturate(160%);
            -webkit-backdrop-filter: blur(8px) saturate(160%);
            box-shadow:
              inset 0 0 0 1px color-mix(in srgb, white calc(var(--glass-reflex-light) * 10%), transparent),
              inset 1.8px 3px 0px -2px color-mix(in srgb, white calc(var(--glass-reflex-light) * 90%), transparent),
              inset -2px -2px 0px -2px color-mix(in srgb, white calc(var(--glass-reflex-light) * 80%), transparent),
              inset -3px -8px 1px -6px color-mix(in srgb, white calc(var(--glass-reflex-light) * 60%), transparent),
              inset -0.3px -1px 4px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 12%), transparent),
              inset -1.5px 2.5px 0px -2px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 20%), transparent),
              inset 0px 3px 4px -2px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 20%), transparent),
              inset 2px -6.5px 1px -4px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 10%), transparent),
              0px 1px 5px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 10%), transparent),
              0px 6px 16px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 8%), transparent);
            transition: background-color 400ms cubic-bezier(1, 0, 0.4, 1), box-shadow 400ms cubic-bezier(1, 0, 0.4, 1);
          }
          .cz-glass-text {
            text-shadow: 0 1px 2px oklch(from var(--color-background) l c h / 30%);
            transition: color 400ms cubic-bezier(1, 0, 0.4, 1);
          }
          @media (hover: hover) {
            .cz-glass:not(:disabled):hover { transform: scale(1.03); }
          }
          .cz-glass:not(:disabled):active { transform: scale(0.96); }
        `}</style>

        <button
          className={cn(glassButtonVariants({ size }), "cz-glass", className)}
          ref={ref}
          {...props}
        >
          <span className="cz-glass-lens absolute inset-0 -z-10 rounded-[inherit] pointer-events-none" />
          <span
            className={cn(
              "cz-glass-text relative z-10 w-full flex items-center justify-center gap-[inherit] select-none",
              contentClassName,
            )}
          >
            {children}
          </span>
        </button>
      </>
    );
  },
);
GlassButton.displayName = "GlassButton";

export { GlassButton, glassButtonVariants };

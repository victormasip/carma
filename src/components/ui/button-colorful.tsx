import { Button } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

interface ButtonColorfulProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label?: string;
}

// Carma gold edition: an ink button with a blurred GOLD gradient glow behind it
// (instead of the original indigo→purple→pink). Brightens on hover.
export function ButtonColorful({
    className,
    label = "Explora",
    ...props
}: ButtonColorfulProps) {
    return (
        <Button
            className={cn(
                "relative h-10 px-4 overflow-hidden",
                "bg-neutral-900 dark:bg-neutral-100",
                "transition-all duration-200",
                "group",
                className,
            )}
            {...props}
        >
            {/* Gold gradient glow */}
            <div
                className={cn(
                    "absolute inset-0",
                    "bg-gradient-to-r from-carma-600 via-carma-400 to-carma-500",
                    "opacity-40 group-hover:opacity-80",
                    "blur transition-opacity duration-500",
                )}
            />

            {/* Content */}
            <div className="relative flex items-center justify-center gap-2">
                <span className="text-white dark:text-neutral-900">{label}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-white/90 dark:text-neutral-900/90" />
            </div>
        </Button>
    );
}

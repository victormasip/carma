import type { Metadata } from "next";
import { Ubuntu } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/Modal";
import { ThemeProvider, themeInitScript } from "@/lib/theme/ThemeProvider";

// Global brand typeface — Ubuntu (founder directive). Humanist, friendly, highly
// legible at UI sizes. We load the four weights the app actually uses (light →
// bold) and expose it as both the default body font and the `--font-ubuntu` var
// for the few components that reference the family directly.
const ubuntu = Ubuntu({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-ubuntu",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Carma",
  description: "La gestora de continguts que estima el teu lloc web",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ca" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Reveal-on-scroll needs JS; without it, below-the-fold sections must
            never stay invisible. */}
        <noscript><style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style></noscript>
      </head>
      <body className={`${ubuntu.className} ${ubuntu.variable} bg-bg text-text antialiased`}>
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              {children}
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
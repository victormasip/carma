'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import EndlessKnot from '@/components/ui/EndlessKnot'

// Shared dark/gold glass shell for the auth cards (login + register).
//
// Perf: the ambient gold glows are now STATIC gradients (previously two infinite
// framer-motion opacity loops on huge blurred layers — continuous repaint that
// made the page feel sluggish). The only motion is a single fast card entrance.
// Result: premium look, zero idle GPU cost. NO mouse-tilt (it was laggy).

export function AuthInput({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      // Accessible name: fall back to the placeholder when the caller gives no
      // explicit aria-label (placeholder alone is not a reliable label). A
      // caller-provided aria-label in `props` still wins (spread is last).
      aria-label={props['aria-label'] ?? (typeof props.placeholder === 'string' ? props.placeholder : undefined)}
      className={cn(
        'w-full h-10 rounded-lg bg-white/5 border border-transparent text-white placeholder:text-white/30',
        'px-3 transition-colors duration-200 outline-none focus:bg-white/10 focus:border-carma-400/40',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  )
}

export function AuthCardShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen w-full bg-[#0e0d0c] relative overflow-hidden flex items-center justify-center px-4">
      {/* Warm dark base + STATIC gold radial glows (no per-frame animation). */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-carma-700/25 via-carma-800/20 to-[#0e0d0c]" />
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[120vh] h-[60vh] rounded-b-[50%] bg-carma-400/15 blur-[80px]" />
      <div className="pointer-events-none absolute bottom-[-10%] left-1/2 -translate-x-1/2 w-[90vh] h-[70vh] rounded-t-full bg-carma-500/10 blur-[70px]" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="relative bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-carma-400/15 shadow-[0_20px_60px_-20px_rgba(245,188,0,0.25),0_8px_24px_-12px_rgba(0,0,0,0.6)] overflow-hidden">
          <div className="text-center space-y-1 mb-5">
            <div
              className="mx-auto w-12 h-12 rounded-full border border-carma-400/30 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(245,188,0,0.25), transparent)' }}
            >
              <EndlessKnot size={26} glow spin title="Carma" />
            </div>
            <h1 className="text-xl font-bold text-white">{title}</h1>
            <p className="text-white/60 text-xs">{subtitle}</p>
          </div>

          {children}
        </div>
      </motion.div>
    </div>
  )
}

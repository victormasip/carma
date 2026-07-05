// The landing hero's WhatsApp scene — pure CSS/HTML (zero images, zero JS, zero
// CLS, prerender-safe). Auto-plays the whole product story on a 16s loop (the
// .wa-* keyframes in globals.css): voice note in → Carma acks warmly → the gold
// draft card lands → a tap on «Publicar» → the live link with a spark burst.
// Every bubble owns its layout slot from SSR and only animates transform/opacity
// (composited), so the page stays fast and nothing ever shifts. Colours are
// WhatsApp-dark so the scene reads instantly, with Carma gold reserved for the
// agent's brand moments. Reduced-motion shows the full static conversation.

import { Mic, Check, Play } from 'lucide-react'
import EndlessKnot from '@/components/ui/EndlessKnot'
import type { LandingCopy } from './copy'
import { LANDING } from './copy'

// Static waveform silhouette for the voice-note bubble.
const WAVE = [5, 9, 6, 12, 8, 14, 7, 11, 5, 9, 13, 6, 10, 4]

// Typing indicator overlaying the slot its bubble will occupy (absolute → it
// never pushes layout when it swaps with the real message).
function Typing({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div
      className={`wa-typing wa-typing-${step} absolute bottom-0 left-0 flex items-center gap-1 rounded-2xl rounded-bl-md bg-[#1f2c34] px-3.5 py-3`}
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <span key={i} className="wa-typing-dot h-1.5 w-1.5 rounded-full bg-[#8696a0]" style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </div>
  )
}

export default function AgentPhoneMock({ phone: p = LANDING.ca.phone }: { phone?: LandingCopy['phone'] }) {
  return (
    <div className="wa-scene relative mx-auto w-full max-w-[300px] shrink-0 sm:max-w-[330px]">
      {/* Gold aura behind the device */}
      <div className="halo -inset-10 opacity-[0.16]" style={{ background: 'radial-gradient(circle, #f5bc00, transparent 65%)' }} aria-hidden />

      <div className="relative overflow-hidden rounded-[2.6rem] border-[10px] border-[#0c0a09] bg-[#0b141a] shadow-2xl">
        {/* Notch */}
        <div className="absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-[#0c0a09]" aria-hidden />

        {/* Chat header */}
        <div className="flex items-center gap-2.5 bg-[#1f2c34] px-4 pb-3 pt-8">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ffd23d] to-[#b58f27]">
            <EndlessKnot size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-white">Carma</p>
            <p className="text-[0.7rem] leading-tight text-[#8696a0]">{p.status}</p>
          </div>
        </div>

        {/* Conversation — anchored to the bottom like a real chat */}
        <div className="flex min-h-[400px] flex-col justify-end space-y-2.5 px-3 py-4">
          {/* 1 · Voice note from the owner */}
          <div className="wa-step wa-step-1 flex justify-end">
            <div className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-br-md bg-[#005c4b] px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10">
                <Play className="h-3 w-3 translate-x-[1px] fill-white text-white" />
              </span>
              <span className="flex h-6 items-end gap-[2.5px]" aria-hidden>
                {WAVE.map((h, i) => (
                  <span key={i} className="wa-wave-bar w-[3px] rounded-full bg-[#9adbd0]" style={{ height: h, animationDelay: `${i * 90}ms` }} />
                ))}
              </span>
              <span className="text-[0.7rem] font-medium text-[#9adbd0]">0:12</span>
              <Mic className="h-3.5 w-3.5 shrink-0 text-[#9adbd0]" />
            </div>
          </div>

          {/* 2 · Carma acknowledges (typing first) */}
          <div className="relative flex">
            <Typing step={1} />
            <div className="wa-step wa-step-2 max-w-[80%] rounded-2xl rounded-bl-md bg-[#1f2c34] px-3.5 py-2 text-[0.8rem] leading-relaxed text-[#e9edef]">
              {p.ack}
            </div>
          </div>

          {/* 3 · The gold draft card */}
          <div className="relative flex">
            <Typing step={2} />
            <div className="wa-step wa-step-3 w-[88%] overflow-hidden rounded-2xl rounded-bl-md bg-[#1f2c34] p-1.5">
              <div className="rounded-xl border border-white/10 bg-[#111b21] p-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f5bc00]/15 px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wider text-[#ffd23d]">
                  {p.badge}
                </span>
                <p className="mt-2 text-[0.85rem] font-bold leading-snug text-white">
                  {p.title}
                </p>
                <p className="mt-1 text-[0.7rem] text-[#8696a0]">{p.meta}</p>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                  <span className="relative">
                    <span className="wa-tap" aria-hidden />
                    <span className="wa-press block rounded-lg bg-gradient-to-b from-[#ffd769] to-[#e6ad00] py-1.5 text-center text-[0.72rem] font-extrabold text-[#1a1400]">
                      {p.publish}
                    </span>
                  </span>
                  <span className="rounded-lg border border-white/20 py-1.5 text-center text-[0.72rem] font-bold text-[#e9edef]">
                    {p.edit}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 · The owner's tap echoes back */}
          <div className="wa-step wa-step-4 flex justify-end">
            <div className="rounded-2xl rounded-br-md bg-[#005c4b] px-3.5 py-2 text-[0.8rem] font-semibold text-white">
              {p.publish}
            </div>
          </div>

          {/* 5 · Published — live link + spark burst */}
          <div className="relative flex">
            <Typing step={3} />
            <div className="wa-step wa-step-5 relative max-w-[85%] rounded-2xl rounded-bl-md bg-[#1f2c34] px-3.5 py-2.5 text-[0.8rem] leading-relaxed text-[#e9edef]">
              <span className="wa-spark -right-1 -top-2 h-[5px] w-[5px]" style={{ '--spark': 'translate(14px,-16px)' } as React.CSSProperties} aria-hidden />
              <span className="wa-spark -top-3 right-6" style={{ '--spark': 'translate(2px,-20px)' } as React.CSSProperties} aria-hidden />
              <span className="wa-spark -right-2 top-4 h-1 w-1" style={{ '--spark': 'translate(18px,-4px)' } as React.CSSProperties} aria-hidden />
              <span className="inline-flex items-center gap-1.5 font-bold text-[#7ae0b8]">
                <Check className="h-3.5 w-3.5" /> {p.published}
              </span>
              <span className="mt-0.5 block truncate font-medium text-[#ffd23d] underline decoration-[#ffd23d]/40 underline-offset-2">
                {p.url}
              </span>
            </div>
          </div>
        </div>

        {/* Input strip */}
        <div className="flex items-center gap-2 bg-[#1f2c34] px-3 py-2.5">
          <div className="flex-1 rounded-full bg-[#2a3942] px-3.5 py-2 text-xs text-[#8696a0]">{p.input}</div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#ffd769] to-[#e6ad00]">
            <Mic className="h-4 w-4 text-[#1a1400]" />
          </span>
        </div>
      </div>
    </div>
  )
}

// The WhatsApp phone — pure HTML + CSS, zero images, zero JS, zero CLS.
//
// TWO SCENES, ONE DEVICE.
//
//   <PhoneScene>      the happy path: a voice note goes out, an article comes
//                     back, you tap Publicar. This is the hero.
//   <PhoneEditScene>  the REVISION — a draft already exists and you type, in
//                     words, what to change. Founder, 2026-09-17: the second
//                     mockup has to "demonstrate the actual WhatsApp editing
//                     process", and it was showing the first conversation again
//                     with different nouns.
//
// Both render in two modes, and the difference is entirely in CSS:
//
//   'live'   the demo plays itself on a 12s loop, so the product is already
//            moving before the visitor does anything. Brand-exempt from reduced
//            motion — it is the product demo, and the founder's own machine (OS
//            animations off) has to see it. See the reduced-motion contract at
//            the foot of landing.css.
//   'scrub'  the same markup, pinned, every beat mapped onto a slice of the
//            section's view timeline. The visitor plays it by scrolling.
//
// THE SIX-BEAT CONTRACT. `.wa-beat[data-beat="1..6"]` is what both the loop and
// the scroll timeline drive, and beat 4 is the one that ignites a gold edge as
// it lands. Any new scene must spend its six beats so that FOUR is the payoff —
// here, the revised draft coming back. Adding a seventh would silently render it
// invisible in the pinned scene.
//
// Both start from a fully visible, complete conversation and only become
// hide-then-reveal where the CSS can drive them back. On a browser without
// scroll timelines, on a phone, or in print, this is simply the whole exchange,
// sitting there, readable.

import { Check, CheckCheck, Play, Plus, Send, Smile } from 'lucide-react'
import EndlessKnot from '@/components/ui/EndlessKnot'
import type { LandingCopy } from './copy'

/** Waveform silhouette for the voice-note bubble. In 'live' every bar breathes. */
const WAVE = [5, 9, 6, 12, 8, 14, 7, 11, 5, 9, 13, 6, 10, 4, 8, 12]

type Mode = 'live' | 'scrub'

/* ════════════════════════════════════════════════════════════════════════════
 * The device
 * ══════════════════════════════════════════════════════════════════════════ */
function PhoneFrame({ contact, status, composer, mode, className = '', children }: {
  contact: string
  status: string
  composer: string
  mode: Mode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`relative w-full ${mode === 'live' ? 'wa-live' : ''} ${className}`}>
      {/* Gold aura. A radial gradient, never a blur() — see .halo in globals.css. */}
      <div
        className="halo -inset-10 opacity-[0.2]"
        style={{ background: 'radial-gradient(circle, #f5bc00, transparent 66%)' }}
        aria-hidden
      />

      {/* A REAL DEVICE'S PROPORTIONS, NOT ITS CONTENT'S.
          The frame used to be as tall as whatever was inside it (`min-h-[23rem]`
          on the conversation), so the two scenes — which hold different numbers
          of bubbles — came out as two different phones, and neither matched
          anything you can buy. Founder QA, 2026-09-18: the second mockup "has a
          weird aspect ratio".
          `aspect-[1125/2436]` is the iPhone X's panel, exactly, and it is on the
          BORDER box, so the 10px bezel is part of the device the way it is on a
          real one. The conversation then flexes into whatever is left between
          the header and the composer instead of dictating the height. */}
      <div className="relative flex aspect-[1125/2436] flex-col overflow-hidden rounded-[2.6rem] border-[10px] border-[#0c0a09] bg-[#0b141a] shadow-2xl">
        {/* Notch */}
        <div className="absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-[#0c0a09]" aria-hidden />

        {/* Chat header */}
        <div className="flex shrink-0 items-center gap-2.5 bg-[#1f2c34] px-4 pb-3 pt-8">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ffd23d] to-[#b58f27]">
            <span className="knot-rotate-fast inline-flex"><EndlessKnot size={20} /></span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[0.95rem] font-bold leading-tight text-white">{contact}</span>
            <span className="block text-[0.72rem] font-medium leading-tight text-[#8fd3c4]">{status}</span>
          </span>
        </div>

        {/* Conversation. It FILLS the screen the device has, rather than setting
            it: `justify-end` keeps the thread pinned to the composer the way a
            real chat does, and `min-h-0` is what lets a flex child actually
            shrink inside a fixed-ratio parent. */}
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 overflow-hidden px-3.5 py-4">{children}</div>

        {/* Composer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-white/5 bg-[#1f2c34] px-3 py-2.5" aria-hidden>
          <Smile className="h-5 w-5 shrink-0 text-[#8696a0]" />
          <span className="min-w-0 flex-1 truncate text-[0.82rem] text-[#8696a0]">{composer}</span>
          <Plus className="h-5 w-5 shrink-0 text-[#8696a0]" />
          <Send className="h-5 w-5 shrink-0 text-[#8696a0]" />
        </div>
      </div>
    </div>
  )
}

/** The three bouncing dots — she is writing. */
function Typing({ beat }: { beat: number }) {
  return (
    <div
      className="wa-beat flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-md bg-[#1f2c34] px-3.5 py-3"
      data-beat={String(beat)}
      aria-hidden
    >
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="wa-dot h-1.5 w-1.5 rounded-full bg-[#8696a0]"
          style={{ animationDelay: `${i * 160}ms`, opacity: 0.85 - i * 0.25 }}
        />
      ))}
    </div>
  )
}

/** The draft card she sends back: badge, headline, one line of stats. */
function DraftCard({ beat, badge, title, meta, lit = false }: {
  beat: number; badge: string; title: string; meta: string
  /** beat 4 only — the ::before gold ignite the CSS drives. */
  lit?: boolean
}) {
  return (
    <div
      className={`wa-beat relative w-fit max-w-[92%] rounded-2xl rounded-bl-md border bg-[#14201d] p-3.5 ${
        lit ? 'border-[#f5bc00]/40' : 'border-white/10'
      }`}
      data-beat={String(beat)}
    >
      <span className="inline-flex items-center gap-1.5 text-[0.66rem] font-extrabold uppercase tracking-wider text-[#ffd23d]">
        <span className="knot-rotate-fast inline-flex"><EndlessKnot size={12} /></span> {badge}
      </span>
      <p className="mt-2 text-[0.95rem] font-bold leading-snug text-white">{title}</p>
      <p className="mt-1.5 text-[0.72rem] font-medium text-[#8696a0]">{meta}</p>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * SCENE A — the voice note becomes an article (the hero)
 * ══════════════════════════════════════════════════════════════════════════ */
export default function PhoneScene({ p, mode = 'scrub', className = '' }: {
  p: LandingCopy['conversa']['phone']
  mode?: Mode
  className?: string
}) {
  return (
    <PhoneFrame contact={p.contact} status={p.status} composer={p.composer} mode={mode} className={className}>
      {/* 1 — the voice note goes out */}
      <div
        className="wa-beat ml-auto flex w-fit max-w-[86%] items-center gap-2.5 rounded-2xl rounded-br-md bg-[#005c4b] px-3 py-2.5"
        data-beat="1"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
          <Play className="h-3 w-3 fill-current" />
        </span>
        <span className="flex h-6 items-end gap-[2px]" aria-hidden>
          {WAVE.map((h, i) => (
            <span
              key={i}
              className="wa-wave-bar w-[2px] rounded-full bg-[#8fd3c4]"
              style={{ height: `${h + 4}px`, animationDelay: `${i * 55}ms` }}
            />
          ))}
        </span>
        <span className="shrink-0 text-[0.68rem] font-semibold tabular-nums text-[#a7c6bd]">{p.voiceLen}</span>
        <CheckCheck className="h-3.5 w-3.5 shrink-0 text-[#53bdeb]" aria-hidden />
      </div>

      {/* 2 — she answers */}
      <div
        className="wa-beat w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-[#1f2c34] px-3.5 py-2.5 text-[0.9rem] leading-snug text-[#e9edef]"
        data-beat="2"
      >
        {p.ack}
      </div>

      {/* 3 — writing */}
      <Typing beat={3} />

      {/* 4 — the draft lands. The emotional peak. */}
      <DraftCard beat={4} badge={p.draftBadge} title={p.draftTitle} meta={p.draftMeta} lit />

      {/* 5 — two buttons, and the thumb picks one */}
      <div className="wa-beat ml-auto flex w-fit gap-2" data-beat="5">
        <span className="rounded-xl bg-gradient-to-b from-[#ffd769] to-[#e6ad00] px-3.5 py-2 text-[0.8rem] font-extrabold text-[#1a1400]">
          {p.approve}
        </span>
        <span className="rounded-xl border border-white/15 px-3.5 py-2 text-[0.8rem] font-semibold text-[#c8d2d6]">
          {p.revise}
        </span>
      </div>

      {/* 6 — live */}
      <Published beat={6} published={p.published} url={p.url} />
    </PhoneFrame>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * SCENE B — THE REVISION. A draft exists; you change it by saying so.
 *
 * This is the scene that sells the product to anyone who has ever fought an AI
 * writing tool: there is no regenerate button, no prompt box, no settings. You
 * write the note you would write to a colleague, and the article comes back
 * carrying exactly those changes — and the reply names them, so you can tell at
 * a glance whether you were understood before opening anything.
 * ══════════════════════════════════════════════════════════════════════════ */
export function PhoneEditScene({ e, mode = 'scrub', className = '' }: {
  e: LandingCopy['conversa']['phoneEdit']
  mode?: Mode
  className?: string
}) {
  return (
    <PhoneFrame contact={e.contact} status={e.status} composer={e.composer} mode={mode} className={className}>
      {/* 1 — where we already are: a draft is waiting */}
      <DraftCard beat={1} badge={e.draftBadge} title={e.draftTitle} meta={e.draftMeta} />

      {/* 2 — THE ASK, typed, in the owner's own words. The whole point of the
              scene, so it gets the outgoing-green bubble and the read receipt. */}
      <div
        className="wa-beat ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-[#005c4b] px-3.5 py-2.5 text-[0.9rem] leading-snug text-[#e9edef]"
        data-beat="2"
      >
        {e.ask}
        <span className="mt-1 flex items-center justify-end gap-1 text-[0.62rem] font-semibold text-[#a7c6bd]">
          <CheckCheck className="h-3 w-3 text-[#53bdeb]" aria-hidden />
        </span>
      </div>

      {/* 3 — applying it */}
      <Typing beat={3} />

      {/* 4 — she names the changes, then re-sends. The payoff beat. */}
      <div
        // `relative`: beat 4's gold ignite is an absolutely-positioned ::before
        // at inset -3px, so it needs a containing block or it lights up the page
        // instead of the card.
        className="wa-beat relative w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-[#1f2c34] px-3.5 py-2.5 text-[0.9rem] leading-snug text-[#e9edef]"
        data-beat="4"
      >
        {e.ack}
        <span className="mt-2.5 block rounded-xl border border-[#f5bc00]/40 bg-[#14201d] p-3">
          <span className="inline-flex items-center gap-1.5 text-[0.64rem] font-extrabold uppercase tracking-wider text-[#ffd23d]">
            <span className="knot-rotate-fast inline-flex"><EndlessKnot size={11} /></span> {e.newBadge}
          </span>
          <span className="mt-1.5 block text-[0.92rem] font-bold leading-snug text-white">{e.newTitle}</span>
          <span className="mt-1 block text-[0.7rem] font-medium text-[#8696a0]">{e.newMeta}</span>
        </span>
      </div>

      {/* 5 — the thumb, on the gold one this time */}
      <div className="wa-beat ml-auto flex w-fit gap-2" data-beat="5">
        <span className="rounded-xl bg-gradient-to-b from-[#ffd769] to-[#e6ad00] px-3.5 py-2 text-[0.8rem] font-extrabold text-[#1a1400]">
          {e.approve}
        </span>
        <span className="rounded-xl border border-white/15 px-3.5 py-2 text-[0.8rem] font-semibold text-[#c8d2d6]">
          {e.revise}
        </span>
      </div>

      {/* 6 — live */}
      <Published beat={6} published={e.published} url={e.url} />
    </PhoneFrame>
  )
}

function Published({ beat, published, url }: { beat: number; published: string; url: string }) {
  return (
    <div
      className="wa-beat w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-[#1f2c34] px-3.5 py-2.5 text-[0.9rem] leading-snug text-[#e9edef]"
      data-beat={String(beat)}
    >
      <span className="inline-flex items-center gap-1.5 font-bold text-[#4ade80]">
        <Check className="h-3.5 w-3.5" strokeWidth={3} /> {published}
      </span>{' '}
      <span className="font-semibold text-[#8fd3c4] underline decoration-[#8fd3c4]/40 underline-offset-2">
        {url}
      </span>
    </div>
  )
}

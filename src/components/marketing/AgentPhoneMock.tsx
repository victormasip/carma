// The landing hero's WhatsApp scene — pure CSS/HTML (zero images, zero CLS,
// prerender-safe). Tells the whole product story in four bubbles: voice note in,
// draft card back, one tap to approve, published with a link. Bubbles cascade in
// with the house [data-reveal] mechanic; colours are WhatsApp-dark so the scene
// reads instantly, with Carma gold reserved for the agent's brand moments.

import { Mic, Check, Play } from 'lucide-react'
import EndlessKnot from '@/components/ui/EndlessKnot'

// Static waveform silhouette for the voice-note bubble.
const WAVE = [5, 9, 6, 12, 8, 14, 7, 11, 5, 9, 13, 6, 10, 4]

function delay(i: number): React.CSSProperties {
  return { '--reveal-delay': `${240 + i * 260}ms` } as React.CSSProperties
}

export default function AgentPhoneMock() {
  return (
    <div className="relative mx-auto w-[300px] shrink-0 sm:w-[330px]">
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
            <p className="text-[0.7rem] leading-tight text-[#8696a0]">en línia</p>
          </div>
        </div>

        {/* Conversation */}
        <div className="min-h-[380px] space-y-2.5 px-3 py-4">
          {/* 1 · Voice note from the owner */}
          <div className="flex justify-end" data-reveal style={delay(0)}>
            <div className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-br-md bg-[#005c4b] px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10">
                <Play className="h-3 w-3 translate-x-[1px] fill-white text-white" />
              </span>
              <span className="flex h-6 items-end gap-[2.5px]" aria-hidden>
                {WAVE.map((h, i) => (
                  <span key={i} className="w-[3px] rounded-full bg-[#9adbd0]" style={{ height: h }} />
                ))}
              </span>
              <span className="text-[0.7rem] font-medium text-[#9adbd0]">0:12</span>
              <Mic className="h-3.5 w-3.5 shrink-0 text-[#9adbd0]" />
            </div>
          </div>

          {/* 2 · Agent acknowledges */}
          <div className="flex" data-reveal style={delay(1)}>
            <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-[#1f2c34] px-3.5 py-2 text-[0.8rem] leading-relaxed text-[#e9edef]">
              Bona idea! M&apos;hi poso 🖊️
            </div>
          </div>

          {/* 3 · Draft card */}
          <div className="flex" data-reveal style={delay(2)}>
            <div className="w-[88%] overflow-hidden rounded-2xl rounded-bl-md bg-[#1f2c34] p-1.5">
              <div className="rounded-xl border border-white/10 bg-[#111b21] p-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f5bc00]/15 px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wider text-[#ffd23d]">
                  ✦ Esborrany a punt
                </span>
                <p className="mt-2 text-[0.85rem] font-bold leading-snug text-white">
                  5 rutes de tardor per descobrir el Berguedà
                </p>
                <p className="mt-1 text-[0.7rem] text-[#8696a0]">SEO llest · 950 paraules · 3 seccions</p>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                  <span className="rounded-lg bg-gradient-to-b from-[#ffd769] to-[#e6ad00] py-1.5 text-center text-[0.72rem] font-extrabold text-[#1a1400]">
                    Aprovar
                  </span>
                  <span className="rounded-lg border border-white/20 py-1.5 text-center text-[0.72rem] font-bold text-[#e9edef]">
                    Editar
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 · Owner taps approve */}
          <div className="flex justify-end" data-reveal style={delay(3)}>
            <div className="rounded-2xl rounded-br-md bg-[#005c4b] px-3.5 py-2 text-[0.8rem] font-semibold text-white">
              Aprovar ✓
            </div>
          </div>

          {/* 5 · Published */}
          <div className="flex" data-reveal style={delay(4)}>
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#1f2c34] px-3.5 py-2.5 text-[0.8rem] leading-relaxed text-[#e9edef]">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#7ae0b8]">
                <Check className="h-3.5 w-3.5" /> Publicat!
              </span>
              <span className="mt-0.5 block truncate font-medium text-[#ffd23d] underline decoration-[#ffd23d]/40 underline-offset-2">
                la-teva-web.cat/rutes-tardor
              </span>
            </div>
          </div>
        </div>

        {/* Input strip */}
        <div className="flex items-center gap-2 bg-[#1f2c34] px-3 py-2.5">
          <div className="flex-1 rounded-full bg-[#2a3942] px-3.5 py-2 text-xs text-[#8696a0]">Missatge…</div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#ffd769] to-[#e6ad00]">
            <Mic className="h-4 w-4 text-[#1a1400]" />
          </span>
        </div>
      </div>
    </div>
  )
}

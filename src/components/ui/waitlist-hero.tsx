"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Wand2 } from "lucide-react"
import { normalizeUrl } from "@/lib/onboarding/url"

// Carma "Magic URL" grabber hero (adapted from the waitlist-hero). Paste a URL →
// gold confetti → navigate to the full-page clone preview (/preview). The original
// spinning Framer images are replaced with drifting gold halos (Carma's house
// decorative device); copy is Catalan and the accent is gold.
// `variant="section"` renders a contained dark band (for embedding in a page);
// the default `"screen"` is the original full-viewport hero.
type WaitlistCopy = { title: string; sub: string; cloning: string; placeholder: string; cta: string }

const DEFAULT_COPY: WaitlistCopy = {
  title: "Enganxa una URL.",
  sub: "Un blog idèntic a la teva web en 30 segons — amb l'agent de WhatsApp a dins.",
  cloning: "Clonant la teva web…",
  placeholder: "la-teva-web.cat",
  cta: "Genera el meu blog",
}

export const WaitlistHero = ({ variant = "screen", copy = DEFAULT_COPY }: { variant?: "screen" | "section"; copy?: WaitlistCopy } = {}) => {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isSection = variant === "section"

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const target = normalizeUrl(url)
    if (!target) return

    setStatus("loading")
    fireConfetti()
    setStatus("success")
    setTimeout(() => {
      router.push(`/preview?url=${encodeURIComponent(target)}`)
    }, 1100)
  }

  // --- Confetti (gold palette) ---
  const fireConfetti = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const particles: {
      x: number; y: number; vx: number; vy: number; life: number; color: string; size: number
    }[] = []
    const colors = ["#f5bc00", "#ffe066", "#b58f27", "#fff3bf", "#fff"]

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 2) * 10,
        life: 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 4 + 2,
      })
    }

    const animate = () => {
      if (particles.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.5
        p.life -= 2
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.max(0, p.life / 100)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        if (p.life <= 0) {
          particles.splice(i, 1)
          i--
        }
      }
      requestAnimationFrame(animate)
    }
    animate()
  }

  return (
    <div className={`w-full ${isSection ? "" : "min-h-screen"} bg-[#0e0d0c] flex items-center justify-center`}>
      <style>{`
        @keyframes cz-spin-slow { from { transform: translate(-50%, -50%) rotate(0); } to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes cz-spin-rev { from { transform: translate(-50%, -50%) rotate(0); } to { transform: translate(-50%, -50%) rotate(-360deg); } }
        @keyframes cz-bounce-in { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.05); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        .cz-bounce-in { animation: cz-bounce-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @keyframes cz-glow { 0%,100% { box-shadow: 0 0 30px rgba(245,188,0,0.4); } 50% { box-shadow: 0 0 70px rgba(245,188,0,0.8), 0 0 110px rgba(245,188,0,0.4); } }
        .cz-glow { animation: cz-glow 2s ease-in-out infinite; }
      `}</style>

      <div className={`relative w-full ${isSection ? "h-[660px]" : "h-screen"} overflow-hidden`} style={{ backgroundColor: "#0e0d0c", fontFamily: 'var(--font-ubuntu), system-ui, sans-serif' }}>
        {/* Drifting gold halos (replacing the original spinning images) */}
        <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ perspective: "1200px", transform: "perspective(1200px) rotateX(15deg)", transformOrigin: "center bottom" }}>
          <div className="absolute top-1/2 left-1/2 rounded-full" style={{ width: 1600, height: 1600, animation: "cz-spin-slow 80s linear infinite", background: "radial-gradient(circle, rgba(245,188,0,0.10), transparent 60%)" }} />
          <div className="absolute top-1/2 left-1/2 rounded-full" style={{ width: 1000, height: 1000, animation: "cz-spin-rev 60s linear infinite", background: "radial-gradient(circle, rgba(255,224,102,0.12), transparent 62%)" }} />
          <div className="absolute top-1/2 left-1/2 rounded-full" style={{ width: 620, height: 620, animation: "cz-spin-slow 48s linear infinite", background: "radial-gradient(circle, rgba(245,188,0,0.18), transparent 64%)" }} />
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: "linear-gradient(to top, #0e0d0c 10%, rgba(14,13,12,0.8) 40%, transparent 100%)" }} />

        {/* Content */}
        <div className={`relative z-20 w-full h-full flex flex-col items-center gap-6 px-4 ${isSection ? "justify-center" : "justify-end pb-24"}`}>
          <div className="w-16 h-16 rounded-2xl shadow-lg overflow-hidden mb-2 ring-1 ring-white/10 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #ffd23d, #b58f27)" }}>
            <Wand2 className="h-7 w-7 text-[#1a1400]" />
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold text-center tracking-tight text-white">
            {copy.title}
          </h1>
          <p className="text-lg font-medium text-white/60 text-center max-w-md">
            {copy.sub}
          </p>

          {/* Form / success */}
          <div className="w-full max-w-md mt-4 h-[60px] relative">
            <canvas ref={canvasRef} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none z-50" />

            {/* SUCCESS */}
            <div
              className={`absolute inset-0 flex items-center justify-center rounded-full transition-all duration-500 ${status === "success" ? "opacity-100 scale-100 cz-glow" : "opacity-0 scale-95 pointer-events-none"}`}
              style={{ backgroundColor: "#f5bc00" }}
            >
              <div className={`flex items-center gap-2 text-[#1a1400] font-bold text-lg ${status === "success" ? "cz-bounce-in" : ""}`}>
                <Wand2 className="w-5 h-5" />
                <span>{copy.cloning}</span>
              </div>
            </div>

            {/* FORM */}
            <form
              onSubmit={handleSubmit}
              className={`relative w-full h-full transition-all duration-500 ${status === "success" ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"}`}
            >
              <input
                type="text"
                inputMode="url"
                required
                placeholder={copy.placeholder}
                value={url}
                disabled={status === "loading"}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full h-[60px] pl-6 pr-[170px] rounded-full outline-none transition-all duration-200 placeholder-white/40 text-white disabled:opacity-70"
                style={{ backgroundColor: "#27241f", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }}
              />
              <div className="absolute top-[6px] right-[6px] bottom-[6px]">
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="btn-gold h-full px-6 rounded-full font-extrabold transition-all active:scale-95 disabled:cursor-wait flex items-center justify-center gap-2 min-w-[150px]"
                >
                  <Wand2 className="h-4 w-4" /> {copy.cta}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

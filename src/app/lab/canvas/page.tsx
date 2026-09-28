import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { labCanvasSpec, labDesign, LAB_FIXTURE_HTML } from '@/lib/render/canvasLab'
import LabCanvas from './LabCanvas'

/**
 * W7 — THE CANVAS LAB. The real editor on the canvas, for one design and the
 * fixture article: what the W7.0 spike drives and `test:editor-fidelity` measures.
 * A test harness, not a product page: 404 unless the server runs with CARMA_LAB=1.
 */
type SP = Promise<Record<string, string | string[] | undefined>>

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={null}>
      <Lab searchParams={searchParams} />
    </Suspense>
  )
}

async function Lab({ searchParams }: { searchParams: SP }) {
  // Request time, never build time: a prerender would bake in the build's env.
  await connection()
  if (process.env.CARMA_LAB !== '1') notFound()
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null)
  const { genome, locale } = labDesign({ g: one(sp.g), preset: one(sp.preset), l: one(sp.l) })
  // `?mode=classic` — the same editor WITHOUT the canvas: the spike's baseline, so a
  // behaviour is only called a canvas regression if the classic editor has it right.
  return <LabCanvas spec={labCanvasSpec(genome, locale)} html={LAB_FIXTURE_HTML} classic={one(sp.mode) === 'classic'} />
}

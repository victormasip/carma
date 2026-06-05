// Client helper: upload an image file to Supabase Storage via /api/upload and
// get back a clean public URL. Used by the editor (paste/drop/pick) and the
// featured-image picker so we NEVER persist base64 data-URIs in post content.

export async function uploadImage(file: File, siteId: string): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api/upload?siteId=${encodeURIComponent(siteId)}`, {
    method: 'POST',
    body: form,
  })
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || `No s'ha pogut pujar la imatge (${res.status})`)
  }
  return data.url
}

/** Upload several files in parallel, returning the URLs that succeeded (in order). */
export async function uploadImages(files: File[], siteId: string): Promise<string[]> {
  const results = await Promise.allSettled(files.map(f => uploadImage(f, siteId)))
  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map(r => r.value)
}

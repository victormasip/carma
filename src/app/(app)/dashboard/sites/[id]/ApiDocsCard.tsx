'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Copy, Check, KeyRound, ChevronDown, ChevronUp, Code2, Palette, ArrowRight } from 'lucide-react'
import IntegrationGuide from './IntegrationGuide'

type Framework = 'curl' | 'nextjs' | 'react' | 'vue' | 'php' | 'javascript'

const FRAMEWORKS: { key: Framework; label: string }[] = [
  { key: 'curl',       label: 'cURL' },
  { key: 'javascript', label: 'JavaScript' },
  { key: 'nextjs',     label: 'Next.js' },
  { key: 'react',      label: 'React' },
  { key: 'vue',        label: 'Vue 3' },
  { key: 'php',        label: 'PHP / WP' },
]

function getCode(fw: Framework, apiKey: string, origin: string): string {
  const ep = `${origin}/api/v1/posts`
  switch (fw) {
    case 'curl':
      return `# Llista d'articles publicats
curl -H "x-api-key: ${apiKey}" \\
     "${ep}?limit=20"

# Article per slug
curl -H "x-api-key: ${apiKey}" \\
     "${ep}?slug=el-meu-article"`

    case 'javascript':
      return `// Llista d'articles
const res = await fetch("${ep}?limit=20", {
  headers: { "x-api-key": "${apiKey}" }
})
const { posts } = await res.json()

// Article per slug
const { post } = await fetch(
  "${ep}?slug=el-meu-article",
  { headers: { "x-api-key": "${apiKey}" } }
).then(r => r.json())`

    case 'nextjs':
      return `// app/blog/page.tsx — Server Component (recomanat)
export default async function BlogPage() {
  const res = await fetch("${ep}?limit=20", {
    headers: { "x-api-key": "${apiKey}" },
    next: { revalidate: 60 }, // ISR: torna a generar cada 60 s
  })
  const { posts } = await res.json()

  return (
    <main>
      {posts.map((post: any) => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          {post.excerpt && <p>{post.excerpt}</p>}
          <div dangerouslySetInnerHTML={{ __html: post.content?.html ?? "" }} />
        </article>
      ))}
    </main>
  )
}

// app/blog/[slug]/page.tsx — Pàgina individual
export default async function PostPage({ params }: { params: { slug: string } }) {
  const res = await fetch(\`${ep}?slug=\${params.slug}\`, {
    headers: { "x-api-key": "${apiKey}" },
    next: { revalidate: 60 },
  })
  const { post } = await res.json()
  if (!post) notFound()

  return (
    <article>
      <h1>{post.title}</h1>
      {post.featured_image && <img src={post.featured_image} alt="" />}
      <div dangerouslySetInnerHTML={{ __html: post.content?.html ?? "" }} />
    </article>
  )
}`

    case 'react':
      return `import { useEffect, useState } from 'react'

export default function Blog() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("${ep}?limit=20", {
      headers: { "x-api-key": "${apiKey}" },
    })
      .then(r => r.json())
      .then(({ posts }) => { setPosts(posts); setLoading(false) })
  }, [])

  if (loading) return <p>Carregant...</p>

  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <div dangerouslySetInnerHTML={{ __html: post.content?.html ?? "" }} />
        </article>
      ))}
    </div>
  )
}`

    case 'vue':
      return `<script setup lang="ts">
import { ref, onMounted } from 'vue'

const posts = ref([])

onMounted(async () => {
  const res = await fetch("${ep}?limit=20", {
    headers: { "x-api-key": "${apiKey}" },
  })
  const { posts: data } = await res.json()
  posts.value = data
})
</script>

<template>
  <div>
    <article v-for="post in posts" :key="post.id">
      <h2>{{ post.title }}</h2>
      <div v-html="post.content?.html" />
    </article>
  </div>
</template>`

    case 'php':
      return `<?php
// WordPress — afegeix a functions.php o plugin personalitzat

function carma_get_posts(int $limit = 20): array {
    $response = wp_remote_get(
        '${ep}?limit=' . $limit,
        ['headers' => ['x-api-key' => '${apiKey}']]
    );
    if (is_wp_error($response)) return [];
    $body = json_decode(wp_remote_retrieve_body($response), true);
    return $body['posts'] ?? [];
}

// Shortcode [carma_blog]
add_shortcode('carma_blog', function() {
    $posts = carma_get_posts();
    ob_start(); ?>
    <div class="carma-blog">
        <?php foreach ($posts as $post): ?>
        <article>
            <h2><?= esc_html($post['title']) ?></h2>
            <?= wp_kses_post($post['content']['html'] ?? '') ?>
        </article>
        <?php endforeach; ?>
    </div>
    <?php return ob_get_clean();
});`
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* */ }
  }
  return (
    <button onClick={copy} title="Copiar" className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-colors shrink-0">
      {copied ? <><Check className="w-3.5 h-3.5 text-accent" />Copiat</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
    </button>
  )
}

export default function ApiDocsCard({
  apiKey,
  siteId,
  detectedFramework = null,
  detectedHosting = null,
  themeConfigured = false,
}: {
  apiKey: string
  siteId: string
  detectedFramework?: string | null
  detectedHosting?: string | null
  themeConfigured?: boolean
}) {
  const [fw, setFw] = useState<Framework>('nextjs')
  const [showParams, setShowParams] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => 'https://your-domain.com',
  )

  const copyKey = async () => {
    try { await navigator.clipboard.writeText(apiKey); setCopiedKey(true); setTimeout(() => setCopiedKey(false), 2000) } catch { /* */ }
  }

  const code = getCode(fw, apiKey, origin)
  const endpoint = `${origin}/api/v1/posts`

  // Gate: if no theme analyzed yet, push the user to configure it first
  if (!themeConfigured) {
    return (
      <div className="bg-surface border-2 border-dashed border-border rounded-[2rem] p-10 text-center">
        <div className="w-16 h-16 bg-accent-soft text-accent rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Palette className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-text">Configura primer el tema</h3>
        <p className="text-sm text-muted mt-2 max-w-md mx-auto leading-relaxed">
          Per donar-te instruccions de connexió <strong>personalitzades</strong>, Carma necessita analitzar la web del client.
          Ves a la pestanya <strong>Tema</strong>, analitza les 3 pàgines de referència, i tornaràs aquí amb passos exactes per al seu stack.
        </p>
        <Link
          href={`/dashboard/sites/${siteId}?tab=tema`}
          className="cursor-pointer inline-flex items-center gap-2 mt-6 px-6 py-3 bg-gradient-to-r bg-accent text-white rounded-xl text-sm font-bold shadow-[0_10px_30px_-6px_rgba(212,175,55,0.3)] transition-all"
        >
          <Palette className="w-4 h-4" />
          Configurar tema
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Clau API */}
      <div className="bg-text rounded-2xl p-6 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 blur-[60px] pointer-events-none rounded-full" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-accent mb-2">
            <KeyRound className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-widest">Clau API d&apos;Accés</h3>
          </div>
          <p className="text-subtle text-sm max-w-md leading-relaxed">
            Clau de <span className="text-white font-semibold">només lectura</span> per al frontend. Inclou-la com a capçalera{' '}
            <code className="text-accent bg-text px-1.5 py-0.5 rounded text-xs">x-api-key</code>{' '}
            a totes les peticions.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-3 bg-black/50 p-2 pl-4 rounded-xl border border-white/10">
          <code className="text-subtle font-mono text-sm truncate w-48 md:w-64 select-all">{apiKey}</code>
          <button
            onClick={copyKey}
            title="Copiar Clau API"
            className="cursor-pointer bg-text hover:bg-white/15 text-white p-2.5 rounded-lg transition-colors flex items-center justify-center shrink-0"
          >
            {copiedKey ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4 text-subtle" />}
          </button>
        </div>
      </div>

      {/* Aclariment: API JSON vs embed amb estils */}
      <div className="flex items-start gap-3 bg-warning-soft border border-warning/30 rounded-2xl p-4">
        <div className="w-8 h-8 bg-warning-soft text-warning rounded-lg flex items-center justify-center shrink-0">
          <Code2 className="w-4 h-4" />
        </div>
        <p className="text-xs text-warning leading-relaxed">
          Aquesta API JSON retorna el contingut <strong>sense estils</strong> perquè el maquetis tu mateix dins el teu propi frontend.
          Si vols el blog <strong>ja dissenyat</strong> i autoaïllat (es veu perfecte sobre qualsevol web), fes servir l&apos;<strong>Embed en directe</strong> de més amunt — injecta el CSS de Carma en un Shadow DOM, sense que el CSS del client l&apos;afecti.
        </p>
      </div>

      {/* Guia d'integració personalitzada */}
      <IntegrationGuide
        siteId={siteId}
        apiKey={apiKey}
        detectedFramework={detectedFramework}
        detectedHosting={detectedHosting}
      />

      {/* Endpoint i paràmetres */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-border">
          <p className="text-xs font-bold text-subtle uppercase tracking-widest mb-2">Endpoint</p>
          <div className="flex items-center gap-3 bg-surface-subtle rounded-xl px-4 py-3 border border-border">
            <span className="text-xs font-bold text-success bg-success-soft border border-success/30 px-2 py-0.5 rounded shrink-0">GET</span>
            <code className="text-sm font-mono text-text truncate">{endpoint}</code>
            <CopyButton text={endpoint} />
          </div>
        </div>

        {/* Paràmetres */}
        <button
          onClick={() => setShowParams(v => !v)}
          className="cursor-pointer w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-subtle transition-colors"
        >
          <p className="text-xs font-bold text-subtle uppercase tracking-widest">Paràmetres de consulta</p>
          {showParams ? <ChevronUp className="w-4 h-4 text-subtle" /> : <ChevronDown className="w-4 h-4 text-subtle" />}
        </button>

        {showParams && (
          <div className="border-t border-border divide-y divide-border">
            {[
              { param: 'limit', type: 'number', default: '50', desc: 'Articles per pàgina. Màxim 100.' },
              { param: 'slug', type: 'string', default: '—', desc: 'Retorna un sol article amb aquest slug.' },
            ].map(row => (
              <div key={row.param} className="grid grid-cols-[120px_80px_80px_1fr] gap-4 px-5 py-3 text-xs">
                <code className="font-mono font-bold text-accent bg-accent-soft px-2 py-0.5 rounded self-start">{row.param}</code>
                <span className="text-subtle font-medium self-center">{row.type}</span>
                <span className="text-subtle self-center">{row.default}</span>
                <span className="text-muted">{row.desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Esquema de resposta */}
        <div className="border-t border-border p-5">
          <p className="text-xs font-bold text-subtle uppercase tracking-widest mb-3">Resposta (llista)</p>
          <pre className="bg-text text-subtle rounded-xl p-4 text-xs font-mono leading-relaxed overflow-x-auto">{`{
  "site":  "Nom del lloc",
  "count": 3,
  "posts": [
    {
      "id":             "uuid",
      "title":          "Títol de l'article",
      "slug":           "titol-de-larticle",
      "content":        { "html": "<p>...</p>" },
      "excerpt":        "Breu descripció...",
      "featured_image": "https://example.com/img.jpg",
      "categories":     ["Categoria"],
      "tags":           ["Etiqueta"],
      "author_name":    "Nom Autor",
      "is_published":   true,
      "created_at":     "2025-01-15T10:30:00Z"
    }
  ]
}`}</pre>
        </div>
      </div>

      {/* Exemples de codi */}
      <div className="bg-text rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <Code2 className="w-4 h-4 text-accent" />
          <span className="text-xs font-bold text-subtle uppercase tracking-widest">Exemples d&apos;integració</span>
        </div>

        {/* Framework tabs */}
        <div className="flex gap-1 p-2 border-b border-white/10 overflow-x-auto">
          {FRAMEWORKS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFw(key)}
              className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                fw === key ? 'bg-white/15 text-white' : 'text-muted hover:text-subtle'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Code block */}
        <div className="relative">
          <div className="absolute top-3 right-3 z-10">
            <CopyButton text={code} />
          </div>
          <pre className="p-5 pr-24 text-xs font-mono leading-relaxed text-subtle overflow-x-auto max-h-96">{code}</pre>
        </div>
      </div>

    </div>
  )
}

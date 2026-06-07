/* ============================================================================
 * ProductTour — tabbed walkthrough of Carma's dashboard, faithful to the real
 * tabs in src/app/dashboard/sites/[id]/page.tsx:
 *   articles · tema · connexio · usuaris
 *
 * Plus a fifth virtual tab "Publicat" showing how the article looks on the
 * customer's public blog.
 * ========================================================================== */

function ProductTour() {
  const [tab, setTab] = React.useState('panell');

  const tabs = [
    { id: 'panell',    label: 'Panell',     hint: 'Tots els teus llocs' },
    { id: 'articles',  label: 'Articles',   hint: 'Gestor de posts' },
    { id: 'tema',      label: 'Tema',       hint: 'Editor visual' },
    { id: 'connexio',  label: 'Connexió',   hint: 'API & embed' },
    { id: 'publicat',  label: 'Publicat',   hint: 'Al teu blog' },
  ];

  return (
    <section id="recorregut" className="relative py-24 sm:py-32 px-5 sm:px-8 bg-gradient-to-b from-transparent via-[#fbfaf7]/60 to-transparent">
      <div className="halo bg-carma-300/15 absolute" style={{ width: 700, height: 500, top: 80, right: -200 }}></div>

      <div className="relative mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="eyebrow" data-reveal><span className="dot"></span> Un recorregut</span>
          <h2 className="mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight text-ink" data-reveal style={{'--reveal-delay':'80ms'}}>
            Pots veure-ho. <span className="text-neutral-400">Sense registrar-te.</span>
          </h2>
          <p className="mt-5 text-base font-medium text-neutral-500 leading-relaxed" data-reveal style={{'--reveal-delay':'160ms'}}>
            Cinc captures reals dels racons que feu servir cada dia. Cap maqueta inventada.
          </p>
        </div>

        {/* Tab strip */}
        <div className="flex justify-center mb-6" data-reveal style={{'--reveal-delay':'240ms'}}>
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white border border-neutral-200/70 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.10)] overflow-x-auto no-scrollbar max-w-full">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative px-3.5 sm:px-4.5 py-2 rounded-full text-[12px] sm:text-[13px] font-extrabold tracking-tight whitespace-nowrap transition-all ${
                  tab === t.id
                    ? 'bg-ink text-white shadow-[0_6px_14px_-6px_rgba(0,0,0,0.3)]'
                    : 'text-neutral-500 hover:text-ink hover:bg-neutral-50'
                }`}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-neutral-400 normal-case tracking-normal whitespace-nowrap">{t.hint}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Showcase frame */}
        <div className="mt-12 relative rounded-[2rem] bg-white border border-neutral-200/60 shadow-premium overflow-hidden" data-reveal style={{'--reveal-delay':'320ms'}}>
          <BrowserChrome url={`carma.cat${tab === 'publicat' ? '/la-teva-marca' : '/dashboard' + (tab === 'panell' ? '' : '/sites/la-teva-marca?tab=' + tab)}`}/>
          <div key={tab} style={{ animation: 'fade-up 0.55s cubic-bezier(0.16,1,0.3,1) both' }}>
            {tab === 'panell'   && <TabPanell/>}
            {tab === 'articles' && <TabArticles/>}
            {tab === 'tema'     && <TabTema/>}
            {tab === 'connexio' && <TabConnexio/>}
            {tab === 'publicat' && <TabPublicat/>}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * TAB 1 — Panell (sites grid, dashboard home)
 * ────────────────────────────────────────────────────────────────────────── */
function TabPanell() {
  const sites = [
    { name: 'la teva marca',     posts: 24, drafts: 2, color: 'linear-gradient(135deg,#1a2138,#d4af37)', last: 'fa 2 h' },
    { name: 'Vinya Petita',      posts: 18, drafts: 0, color: 'linear-gradient(135deg,#5b8a72,#3f6450)', last: 'ahir' },
    { name: 'Atelier de joieria',posts: 42, drafts: 5, color: 'linear-gradient(135deg,#d4af37,#906d1c)', last: 'fa 3 d' },
    { name: 'Òptica Vidal',      posts: 11, drafts: 1, color: 'linear-gradient(135deg,#737373,#262626)', last: 'fa 1 set' },
    { name: 'Ferreteria Roca',   posts: 7,  drafts: 0, color: 'linear-gradient(135deg,#b91c1c,#7f1d1d)', last: 'fa 2 set' },
  ];
  return (
    <div className="grid lg:grid-cols-[240px_1fr]">
      <CarmaSidebar activeSite="la teva marca"/>
      <div className="bg-[#F9F8F6] p-6 sm:p-10 min-h-[560px]">
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-ink">Els meus Llocs</h1>
            <p className="text-[13px] font-medium text-neutral-500 mt-1">5 llocs · 102 articles en total</p>
          </div>
          <button className="bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white px-4 py-2.5 rounded-xl text-[12.5px] font-extrabold tracking-tight shadow-[0_8px_24px_-8px_rgba(212,175,55,0.45)] inline-flex items-center gap-1.5">
            <span className="text-base leading-none">+</span> Nou Lloc
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sites.map((s, i) => (
            <div key={i} className="group bg-white rounded-3xl border border-neutral-200/60 shadow-[0_6px_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden hover:shadow-premium hover:-translate-y-1 transition-all">
              <div className="aspect-[16/9] relative" style={{background: s.color}}>
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(ellipse at 70% 30%, rgba(255,255,255,0.25), transparent 50%)'
                }}></div>
                <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/85 backdrop-blur-sm text-[9.5px] font-extrabold uppercase tracking-wider text-neutral-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> En línia
                </div>
                <div className="absolute bottom-3 left-3 text-white">
                  <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] opacity-70">Wordmark</p>
                  <p className="text-base font-extrabold tracking-tight mt-0.5 capitalize">{s.name}</p>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between text-[11.5px] font-bold text-neutral-500 mb-2">
                  <span>{s.name}</span>
                  <span className="text-neutral-300">·</span>
                  <span>{s.last}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-extrabold">
                  <span className="inline-flex items-center gap-1 text-neutral-700"><FileText className="w-3 h-3 text-carma-500"/> {s.posts} articles</span>
                  {s.drafts > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> {s.drafts} esborrany{s.drafts>1?'s':''}</span>}
                </div>
              </div>
            </div>
          ))}
          {/* Empty add card */}
          <div className="rounded-3xl border-2 border-dashed border-neutral-200 bg-white/40 flex flex-col items-center justify-center p-8 text-neutral-400 hover:border-carma-300 hover:text-carma-700 hover:bg-carma-50/30 transition-colors cursor-pointer min-h-[220px]">
            <div className="w-12 h-12 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center mb-3">
              <span className="text-2xl font-light leading-none">+</span>
            </div>
            <p className="text-[12.5px] font-extrabold tracking-tight">Afegir un nou Lloc</p>
            <p className="text-[11px] font-medium mt-0.5 opacity-70">Enganxa la teva URL i comencem</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * TAB 2 — Articles (PostsManager)
 * ────────────────────────────────────────────────────────────────────────── */
function TabArticles() {
  const rows = [
    { title: "L'art de plegar l'or",            cat: 'Procés',     status: 'esborrany', lang: ['CA','ES'],       date: '21 maig',  views: '—' },
    { title: 'Les mans abans dels ulls',         cat: 'Editorial',   status: 'publicat',  lang: ['CA','ES','EN'], date: '14 maig',  views: '1.2k' },
    { title: 'Cinc errors quan plegues a casa',  cat: 'Guies',        status: 'publicat',  lang: ['CA','ES'],       date: '7 maig',   views: '842' },
    { title: 'Una conversa amb la Mestra Argilaga', cat: 'Convidats', status: 'programat',  lang: ['CA'],            date: '2 juny',   views: '—' },
    { title: 'Què és la pell vella?',             cat: 'Materials',   status: 'publicat',   lang: ['CA','EN'],       date: '23 abr.',  views: '584' },
    { title: 'El batafull de 800g',               cat: 'Eines',       status: 'esborrany',  lang: ['CA'],            date: '20 abr.',  views: '—' },
  ];
  const statusStyle = {
    publicat:  { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'PUBLICAT', dot: 'bg-green-500' },
    esborrany: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', label: 'ESBORRANY', dot: 'bg-amber-400' },
    programat: { bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-200',  label: 'PROGRAMAT', dot: 'bg-blue-500' },
  };
  return (
    <div className="grid lg:grid-cols-[240px_1fr]">
      <CarmaSidebar activeSite="la teva marca"/>
      <div className="bg-white min-h-[560px]">
        {/* Site tabs strip */}
        <SiteTabs active="articles"/>
        <div className="p-6 sm:p-8">
          {/* Header + actions */}
          <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
            <div>
              <h1 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Articles</h1>
              <p className="text-[12px] font-medium text-neutral-500 mt-0.5">24 articles · 22 publicats · 2 esborranys</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 w-72">
                <Search className="w-3.5 h-3.5 text-neutral-400"/>
                <input className="bg-transparent outline-none text-[12px] font-medium flex-1 placeholder:text-neutral-400" placeholder="Cerca per títol o categoria…"/>
                <span className="text-[9.5px] font-mono text-neutral-300 px-1 py-0.5 rounded bg-white border border-neutral-200">⌘K</span>
              </div>
              <button className="bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white px-3.5 py-2 rounded-xl text-[12px] font-extrabold inline-flex items-center gap-1.5 shadow-[0_6px_18px_-6px_rgba(212,175,55,0.4)]">
                <span className="text-base leading-none">+</span> Nou article
              </button>
            </div>
          </div>

          {/* Filters strip */}
          <div className="flex items-center gap-2 mb-5 overflow-x-auto no-scrollbar">
            <FilterPill active>Tots <span className="text-neutral-400">· 24</span></FilterPill>
            <FilterPill>Publicat <span className="text-neutral-400">· 22</span></FilterPill>
            <FilterPill>Esborrany <span className="text-neutral-400">· 2</span></FilterPill>
            <FilterPill>Programat <span className="text-neutral-400">· 1</span></FilterPill>
            <span className="w-px h-5 bg-neutral-200 mx-1"></span>
            <FilterPill>Tots els idiomes <ChevronRight className="w-3 h-3 rotate-90 inline ml-0.5"/></FilterPill>
            <FilterPill>Per data <ChevronRight className="w-3 h-3 rotate-90 inline ml-0.5"/></FilterPill>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-neutral-200/70 overflow-hidden bg-white">
            <div className="grid grid-cols-[1fr_120px_120px_110px_80px_40px] gap-3 px-4 py-2.5 bg-[#fbfaf7] border-b border-neutral-100 text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-neutral-400">
              <span>Títol</span>
              <span>Categoria</span>
              <span>Idiomes</span>
              <span>Estat</span>
              <span>Vistes</span>
              <span></span>
            </div>
            {rows.map((r, i) => {
              const st = statusStyle[r.status];
              return (
                <div key={i} className={`grid grid-cols-[1fr_120px_120px_110px_80px_40px] gap-3 px-4 py-3 items-center text-[12.5px] ${i < rows.length-1 ? 'border-b border-neutral-100' : ''} hover:bg-neutral-50/60 transition-colors`}>
                  <div className="min-w-0">
                    <div className="font-extrabold text-ink truncate">{r.title}</div>
                    <div className="text-[10.5px] font-bold text-neutral-400 mt-0.5">{r.date}</div>
                  </div>
                  <span className="text-[11.5px] font-bold text-neutral-500">{r.cat}</span>
                  <div className="flex items-center gap-0.5">
                    {r.lang.map(l => (
                      <span key={l} className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-neutral-100 text-neutral-600 border border-neutral-200">{l}</span>
                    ))}
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9.5px] font-extrabold uppercase tracking-wider w-fit ${st.bg} ${st.text} border ${st.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>{st.label}
                  </span>
                  <span className="text-[11.5px] font-bold text-neutral-500">{r.views}</span>
                  <button className="w-7 h-7 rounded-md hover:bg-neutral-100 flex items-center justify-center text-neutral-400">
                    <MoreVertical className="w-3.5 h-3.5"/>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 text-[11px] font-bold text-neutral-400">
            <span>Pàgina 1 de 4 · 24 articles</span>
            <div className="flex items-center gap-1">
              <button className="w-7 h-7 rounded-md border border-neutral-200 text-neutral-300 cursor-not-allowed">‹</button>
              <button className="w-7 h-7 rounded-md bg-ink text-white text-[11px] font-extrabold">1</button>
              <button className="w-7 h-7 rounded-md text-neutral-500 hover:bg-neutral-50">2</button>
              <button className="w-7 h-7 rounded-md text-neutral-500 hover:bg-neutral-50">3</button>
              <button className="w-7 h-7 rounded-md text-neutral-500 hover:bg-neutral-50">4</button>
              <button className="w-7 h-7 rounded-md border border-neutral-200 text-neutral-700 hover:bg-neutral-50">›</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * TAB 3 — Tema (visual editor)
 * ────────────────────────────────────────────────────────────────────────── */
function TabTema() {
  return (
    <div className="grid lg:grid-cols-[240px_1fr]">
      <CarmaSidebar activeSite="la teva marca"/>
      <div className="bg-white min-h-[560px]">
        <SiteTabs active="tema"/>
        <div className="grid lg:grid-cols-[300px_1fr] min-h-[520px]">
          {/* Controls rail */}
          <div className="border-r border-neutral-100 p-5 bg-[#fbfaf7]/40 overflow-y-auto">
            <div className="mb-5">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-400 mb-2">Tema</p>
              <div className="rounded-xl bg-white border border-neutral-200 p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-carma-200 to-carma-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-extrabold text-ink">la teva marca</div>
                  <div className="text-[10px] font-bold text-neutral-400">Clonat el 12 maig</div>
                </div>
                <button className="text-[10px] font-extrabold uppercase tracking-wider text-carma-700 px-2 py-1 rounded bg-carma-50 border border-carma-200/60 hover:bg-carma-100/80">Recapturar</button>
              </div>
            </div>

            <SectionLabel>Colors</SectionLabel>
            <div className="mb-3.5 space-y-2.5">
              <ColorRow label="Fons" value="#fafaf6"/>
              <ColorRow label="Text"  value="#1a2138"/>
              <ColorRow label="Accent" value="#d4af37" star/>
              <ColorRow label="Apagat" value="#5b8a72"/>
            </div>

            <SectionLabel>Tipografia</SectionLabel>
            <div className="space-y-2 mb-3.5">
              <TypeRow family="Playfair Display" role="Display"/>
              <TypeRow family="Inter"             role="Cos"/>
            </div>

            <SectionLabel>Layout</SectionLabel>
            <div className="space-y-3">
              <SliderRow label="Radius"   value="60%"/>
              <SliderRow label="Densitat" value="48%"/>
              <SliderRow label="Ombra"    value="32%"/>
            </div>

            <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center gap-2">
              <button className="flex-1 px-3 py-2 rounded-xl bg-white border border-neutral-200 text-[11px] font-extrabold text-neutral-600 hover:bg-neutral-50">Restaurar</button>
              <button className="flex-1 px-3 py-2 rounded-xl bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white text-[11px] font-extrabold shadow-[0_6px_14px_-6px_rgba(212,175,55,0.4)]">Desar tema</button>
            </div>
          </div>

          {/* Preview canvas */}
          <div className="relative bg-[#F4F2EE] p-6 sm:p-8 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-400">Previsualització</span>
              <div className="flex items-center gap-0.5 p-0.5 bg-white rounded-lg border border-neutral-200">
                <button className="w-6 h-6 rounded-md bg-ink text-white flex items-center justify-center"><MonitorIcon/></button>
                <button className="w-6 h-6 rounded-md text-neutral-400 hover:bg-neutral-50 flex items-center justify-center"><TabletIcon/></button>
                <button className="w-6 h-6 rounded-md text-neutral-400 hover:bg-neutral-50 flex items-center justify-center"><PhoneIcon/></button>
              </div>
            </div>

            {/* Faux site preview */}
            <div className="rounded-2xl bg-white border border-neutral-200 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.20)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100" style={{background:'#fafaf6'}}>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-gradient-to-br from-ink to-neutral-700 text-white text-[8px] font-extrabold flex items-center justify-center">LM</div>
                  <span style={{fontFamily:'Georgia, serif'}} className="text-[12px] font-bold text-ink">la teva marca</span>
                </div>
                <nav className="flex items-center gap-3 text-[10px] font-bold text-neutral-600" style={{fontFamily:'Georgia, serif'}}>
                  <span>Botiga</span><span>Història</span><span style={{color:'#d4af37'}}>Diari</span><span>Contacte</span>
                </nav>
              </div>
              <div className="p-6 sm:p-8" style={{background:'#fafaf6'}}>
                <p style={{color:'#d4af37'}} className="text-[9px] font-extrabold uppercase tracking-[0.18em] mb-3">Diari · Procés</p>
                <h3 style={{fontFamily:'Georgia, serif', color:'#1a2138'}} className="text-[22px] font-bold leading-[1.15] mb-2">L'art de plegar l'or</h3>
                <p className="text-[11.5px] text-neutral-500 leading-[1.7] mb-3">La feina comença a les sis del matí, quan el taller encara fa olor a fred. El batafull ressona contra el banc i l'or, com sempre, escolta abans de cedir.</p>
                <div className="grid grid-cols-3 gap-1.5 my-3">
                  <div className="aspect-[4/3] rounded-lg bg-gradient-to-br from-carma-100 to-carma-300"></div>
                  <div className="aspect-[4/3] rounded-lg bg-gradient-to-br from-neutral-200 to-neutral-300"></div>
                  <div className="aspect-[4/3] rounded-lg bg-gradient-to-br from-carma-50 to-carma-200"></div>
                </div>
                <button style={{background:'#d4af37', color:'#1a2138'}} className="px-3 py-1.5 rounded-md text-[10px] font-extrabold">Llegir més →</button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-bold text-neutral-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              Canvis aplicats en temps real
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * TAB 4 — Connexió (API key + embed)
 * ────────────────────────────────────────────────────────────────────────── */
function TabConnexio() {
  return (
    <div className="grid lg:grid-cols-[240px_1fr]">
      <CarmaSidebar activeSite="la teva marca"/>
      <div className="bg-white min-h-[560px]">
        <SiteTabs active="connexio"/>
        <div className="p-6 sm:p-8 grid lg:grid-cols-2 gap-6">
          {/* API key card */}
          <div className="rounded-2xl border border-neutral-200/70 p-5 bg-white">
            <div className="flex items-center gap-2 mb-4">
              <KeyIcon className="w-4 h-4 text-carma-600"/>
              <h3 className="text-[14px] font-extrabold text-ink">Clau API</h3>
              <span className="ml-auto text-[9.5px] font-extrabold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">ACTIVA</span>
            </div>
            <p className="text-[12px] text-neutral-500 font-medium mb-3 leading-relaxed">Aquesta clau permet llegir els articles publicats. Tracta-la com una contrasenya.</p>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
              <span className="font-mono text-[11.5px] text-neutral-700 flex-1 truncate">crm_••••_••••_a3f9c2e1b8</span>
              <button className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 hover:text-ink px-2 py-1 rounded hover:bg-white">Veure</button>
              <button className="text-[10px] font-extrabold uppercase tracking-wider text-carma-700 hover:text-carma-800 px-2 py-1 rounded hover:bg-carma-50">Copiar</button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button className="px-3 py-2 rounded-lg text-[11px] font-extrabold bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50">Regenerar</button>
              <span className="text-[10.5px] font-bold text-neutral-400">Creada el 12 maig 2026</span>
            </div>
          </div>

          {/* Webhook card */}
          <div className="rounded-2xl border border-neutral-200/70 p-5 bg-white">
            <div className="flex items-center gap-2 mb-4">
              <Plug className="w-4 h-4 text-carma-600"/>
              <h3 className="text-[14px] font-extrabold text-ink">Webhooks</h3>
            </div>
            <div className="space-y-2">
              <WebhookRow url="https://la-teva-marca.cat/api/revalidate" event="post.published"/>
              <WebhookRow url="https://la-teva-marca.cat/api/revalidate" event="post.updated"/>
            </div>
            <button className="mt-3 text-[10.5px] font-extrabold text-carma-700 hover:underline">+ Afegir webhook</button>
          </div>

          {/* Snippet — embed */}
          <div className="rounded-2xl border border-neutral-200/70 bg-white overflow-hidden lg:col-span-2">
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 bg-[#fbfaf7]">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-500">Integració</span>
                <div className="ml-2 flex items-center gap-0.5 p-0.5 rounded-lg bg-white border border-neutral-200">
                  <button className="px-2.5 py-1 rounded-md bg-ink text-white text-[10.5px] font-extrabold">Next.js</button>
                  <button className="px-2.5 py-1 rounded-md text-[10.5px] font-extrabold text-neutral-500">React</button>
                  <button className="px-2.5 py-1 rounded-md text-[10.5px] font-extrabold text-neutral-500">cURL</button>
                  <button className="px-2.5 py-1 rounded-md text-[10.5px] font-extrabold text-neutral-500">Embed</button>
                </div>
              </div>
              <button className="text-[10.5px] font-extrabold uppercase tracking-wider text-carma-700 hover:text-carma-800 px-2 py-1 rounded hover:bg-carma-50">Copiar</button>
            </div>
            <pre className="p-5 bg-[#0f0f0f] text-[12px] font-mono text-neutral-300 overflow-x-auto leading-relaxed">
<span className="text-neutral-500">{`// app/blog/[slug]/page.tsx — Next.js 16, RSC`}</span>{`
`}<span className="text-pink-300">import</span>{` { fetchPost } `}<span className="text-pink-300">from</span>{` `}<span className="text-amber-200">'@carma/sdk'</span>{`

`}<span className="text-pink-300">export default async function</span>{` `}<span className="text-sky-300">Page</span>{`({ params }) {`}{`
  `}<span className="text-pink-300">const</span>{` post `}<span className="text-pink-300">=</span>{` `}<span className="text-pink-300">await</span>{` `}<span className="text-sky-300">fetchPost</span>{`({`}{`
    site: `}<span className="text-amber-200">'la-teva-marca'</span>{`,`}{`
    slug: params.slug,`}{`
    locale: `}<span className="text-amber-200">'ca'</span>{`,`}{`
  });`}{`

  `}<span className="text-pink-300">return</span>{` <`}<span className="text-sky-300">Article</span>{` html={post.html} />;`}{`
}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * TAB 5 — Publicat (how it looks on the customer's blog)
 * ────────────────────────────────────────────────────────────────────────── */
function TabPublicat() {
  return (
    <div>
      {/* Customer site header (cloned) */}
      <div className="px-6 sm:px-10 py-4 border-b border-neutral-100 flex items-center justify-between" style={{background:'#fafaf6'}}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-ink to-neutral-700 flex items-center justify-center text-white text-[12px] font-extrabold">LM</div>
          <span style={{fontFamily:'Georgia, serif'}} className="text-[15px] font-bold tracking-tight text-ink">la teva marca</span>
        </div>
        <nav className="hidden md:flex items-center gap-7 text-[12.5px]" style={{fontFamily:'Georgia, serif'}}>
          <span className="text-neutral-600">Botiga</span>
          <span className="text-neutral-600">Història</span>
          <span style={{color:'#d4af37'}} className="font-bold">Diari</span>
          <span className="text-neutral-600">Contacte</span>
        </nav>
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-bold text-neutral-500" style={{fontFamily:'Georgia, serif'}}>CA · ES · EN</span>
          <div className="w-8 h-8 rounded-full bg-neutral-200"></div>
        </div>
      </div>

      {/* Article rendered with the customer's theme */}
      <article style={{background:'#fafaf6'}} className="px-6 sm:px-12 py-10 sm:py-14 min-h-[560px]">
        <div className="max-w-[640px] mx-auto" style={{fontFamily:'Georgia, serif'}}>
          <div className="flex items-center gap-2 text-[10.5px] font-extrabold uppercase tracking-[0.18em] mb-4" style={{color:'#d4af37'}}>
            <span>Diari</span><span className="text-neutral-300">·</span>
            <span className="text-neutral-500">21 maig 2026 · 5 min</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-4" style={{color:'#1a2138'}}>
            L'art de plegar l'or
          </h1>
          <p className="text-[18px] leading-[1.6] mb-7" style={{color:'#475569', fontStyle:'italic'}}>
            Apunts d'un ofici antic que es resisteix a desaparèixer.
          </p>

          <div className="aspect-[16/9] rounded-xl overflow-hidden my-6" style={{
            background:'linear-gradient(135deg,#f7e4ac 0%,#d4af37 35%,#906d1c 65%,#b58f27 100%)',
            boxShadow:'0 12px 32px -12px rgba(0,0,0,0.18)'
          }}>
            <div className="w-full h-full" style={{background:'radial-gradient(ellipse at 20% 30%,rgba(255,255,255,0.4),transparent 50%)'}}></div>
          </div>

          <p className="text-[17px] leading-[1.85] mb-4" style={{color:'#374151'}}>
            La feina comença a les sis del matí, quan el taller encara fa olor a fred. El batafull ressona contra el banc i l'or, com sempre, escolta abans de cedir. La pell percep el primer signe; els ulls, sempre, arriben tard.
          </p>

          <h2 className="text-2xl font-bold tracking-tight mt-8 mb-3" style={{color:'#1a2138'}}>El batafull i la respiració</h2>
          <p className="text-[17px] leading-[1.85] mb-4" style={{color:'#374151'}}>
            Un detall poc explicat de l'ofici: la respiració mana sobre el batafull. Si inspires al cop, la làmina s'esquinça.
          </p>

          <blockquote className="my-7 pl-5 py-1" style={{borderLeft:'3px solid #d4af37'}}>
            <p className="text-[19px] leading-[1.55] mb-1.5" style={{color:'#475569', fontStyle:'italic'}}>«Cada peça és un acte privat de paciència.»</p>
            <cite className="text-[12px] font-bold not-italic" style={{color:'#94a3b8'}}>— Mestra Argilaga</cite>
          </blockquote>
        </div>

        {/* Tiny "powered by Carma" mark */}
        <div className="max-w-[640px] mx-auto mt-10 pt-6 border-t flex items-center justify-between text-[10.5px] font-bold" style={{borderColor:'#e7e4dc', color:'#94a3b8'}}>
          <span>Compartir aquest apunt</span>
          <span className="inline-flex items-center gap-1.5">Servit per <span className="font-extrabold text-ink">Carma<span style={{color:'#d4af37'}}>.</span></span></span>
        </div>
      </article>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Shared bits
 * ────────────────────────────────────────────────────────────────────────── */
function SiteTabs({ active }) {
  const tabs = [
    { id: 'articles', label: 'Articles' },
    { id: 'tema',     label: 'Tema' },
    { id: 'connexio', label: 'Connexió' },
    { id: 'usuaris',  label: 'Usuaris', locked: true },
  ];
  return (
    <div className="flex items-center justify-between gap-4 px-6 sm:px-8 pt-5 pb-0 border-b border-neutral-100 bg-white">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-400 mb-1">la teva marca · Lloc</p>
        <h1 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Configuració del Lloc</h1>
      </div>
      <nav className="flex items-center gap-0 -mb-px overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t.id} className={`px-4 py-3 text-[12.5px] font-extrabold tracking-tight border-b-2 whitespace-nowrap transition-colors ${
            t.id === active ? 'border-carma-500 text-ink' : 'border-transparent text-neutral-500 hover:text-ink'
          } ${t.locked ? 'opacity-50' : ''}`}>
            {t.label}
            {t.locked && <Lock className="w-3 h-3 inline ml-1.5 -mt-0.5"/>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function FilterPill({ children, active }) {
  return (
    <button className={`px-3 py-1.5 rounded-full text-[11.5px] font-extrabold whitespace-nowrap transition-colors ${
      active
        ? 'bg-ink text-white shadow-[0_4px_10px_-4px_rgba(0,0,0,0.3)]'
        : 'bg-white border border-neutral-200 text-neutral-500 hover:text-ink hover:border-neutral-300'
    }`}>{children}</button>
  );
}

function SectionLabel({ children }) {
  return <p className="text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-neutral-400 mb-2">{children}</p>;
}

function ColorRow({ label, value, star }) {
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white">
      <div className="w-7 h-7 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] border border-black/5" style={{background: value}}></div>
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-extrabold text-ink flex items-center gap-1.5">{label} {star && <span className="text-[9px] text-carma-700">★</span>}</div>
        <div className="font-mono text-[10px] text-neutral-400">{value}</div>
      </div>
    </div>
  );
}

function TypeRow({ family, role }) {
  return (
    <div className="px-2.5 py-2 rounded-lg bg-white border border-neutral-200 flex items-center justify-between">
      <div>
        <div className="text-[11.5px] font-extrabold text-ink">{family}</div>
        <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-neutral-400">{role}</div>
      </div>
      <button className="text-[9.5px] font-extrabold text-carma-700 hover:underline">Canviar</button>
    </div>
  );
}

function SliderRow({ label, value }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-neutral-500">{label}</span>
        <span className="text-[10px] font-mono text-neutral-400">{value}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-neutral-200">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-carma-400 to-carma-600" style={{ width: value }}></div>
        <div className="absolute -top-1 h-3.5 w-3.5 rounded-full bg-white border border-carma-300 shadow-[0_2px_6px_rgba(0,0,0,0.15)]" style={{ left: `calc(${value} - 7px)` }}></div>
      </div>
    </div>
  );
}

function WebhookRow({ url, event }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-100">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></span>
      <span className="font-mono text-[10.5px] text-neutral-600 truncate flex-1 min-w-0">{url}</span>
      <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-carma-700 bg-carma-50 border border-carma-200/60 px-1.5 py-0.5 rounded shrink-0">{event}</span>
    </div>
  );
}

/* ── local icons ── */
function Search({ className = "w-4 h-4" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
}
function MoreVertical({ className = "w-4 h-4" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>;
}
function MonitorIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>;
}
function TabletIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="18" r="0.5" fill="currentColor"/></svg>;
}
function PhoneIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="18" r="0.5" fill="currentColor"/></svg>;
}
function KeyIcon({ className = "w-4 h-4" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="7.5" cy="15.5" r="3.5"/><path d="m10 13 8.5-8.5M15 8l3 3M11 12l3 3"/></svg>;
}

Object.assign(window, { ProductTour, TabPanell, TabArticles, TabTema, TabConnexio, TabPublicat });

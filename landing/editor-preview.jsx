/* ============================================================================
 * EditorPreview — high-fidelity recreation of Carma's TipTap post editor,
 * wrapped in the real Carma dashboard chrome (sidebar + toolbar).
 *
 * Uses real Catalan strings, real block names, real slash menu order from
 * src/components/editor/extensions/SlashCommand.tsx.
 * ========================================================================== */

function EditorPreview() {
  return (
    <section id="editor" className="relative py-24 sm:py-32 px-5 sm:px-8">
      <div className="halo bg-carma-200/35 absolute" style={{ width: 600, height: 600, top: 100, left: -200 }}></div>

      <div className="relative mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <span className="eyebrow" data-reveal><span className="dot"></span> L'editor</span>
          <h2 className="mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight text-ink" data-reveal style={{'--reveal-delay':'80ms'}}>
            Una pàgina en blanc. <span className="text-neutral-400">Tot a una tecla.</span>
          </h2>
          <p className="mt-5 text-base font-medium text-neutral-500 leading-relaxed" data-reveal style={{'--reveal-delay':'160ms'}}>
            Escriu amb la calma d'un processador de text i la potència d'un constructor de pàgines. Teclegeja <kbd className="px-1.5 py-0.5 text-[11px] font-mono rounded-md bg-white border border-neutral-200 align-middle">/</kbd> i veuràs tots els blocs.
          </p>
        </div>

        {/* Dashboard chrome wrapping the editor */}
        <div className="relative mt-14 max-w-6xl mx-auto rounded-[2rem] bg-white border border-neutral-200/60 shadow-premium overflow-hidden" data-reveal style={{'--reveal-delay':'240ms'}}>
          <BrowserChrome url="carma.cat/dashboard/sites/la-teva-marca/posts/edit"/>

          <div className="grid lg:grid-cols-[240px_1fr]">
            <CarmaSidebar activeSite="la teva marca"/>
            <EditorWorkspace/>
          </div>
        </div>

        {/* Helper hints below */}
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto" data-reveal style={{'--reveal-delay':'320ms'}}>
          <HelperPill kbd="/" label="Inserir bloc"/>
          <HelperPill kbd="⌘ K" label="Cercar"/>
          <HelperPill kbd="⌘ ⇧ L" label="Traduir bloc"/>
          <HelperPill kbd="⌘ S" label="Desar (auto)"/>
        </div>
      </div>
    </section>
  );
}

/* ───── Browser chrome with traffic lights + URL bar ───── */
function BrowserChrome({ url }) {
  const [host, ...rest] = url.split('/');
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-neutral-100 bg-[#fbfbfa]">
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full bg-[#FF5F57]"></span>
        <span className="w-3 h-3 rounded-full bg-[#FEBC2E]"></span>
        <span className="w-3 h-3 rounded-full bg-[#28C840]"></span>
      </div>
      <div className="flex-1 flex justify-center">
        <div className="flex items-center gap-2 px-3 py-1 bg-white border border-neutral-200 rounded-lg text-[11px] font-mono text-neutral-500 max-w-full truncate">
          <Lock className="w-3 h-3 text-neutral-400 shrink-0"/>
          <span className="text-neutral-700">{host}</span>
          <span className="truncate">/{rest.join('/')}</span>
        </div>
      </div>
      <div className="w-12 hidden sm:flex justify-end gap-1.5">
        <span className="w-6 h-6 rounded-md bg-white border border-neutral-200"></span>
      </div>
    </div>
  );
}

/* ───── Carma dashboard sidebar — faithful to DashboardSidebar.tsx + SidebarNav.tsx ───── */
function CarmaSidebar({ activeSite, view = 'editor' }) {
  return (
    <aside className="hidden lg:flex flex-col bg-white border-r border-neutral-200/60 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      <div className="h-16 flex items-center px-6 border-b border-neutral-100/70">
        <span className="text-xl font-extrabold tracking-[-0.04em] leading-none text-ink">
          Carma<span className="text-carma-500">.</span>
        </span>
      </div>
      <nav className="flex-1 py-5 px-3 overflow-y-auto">
        <a className="relative flex items-center gap-3 px-3 py-2.5 text-[12.5px] font-extrabold rounded-xl text-neutral-500 hover:bg-neutral-50 mb-4">
          <FileText className="w-4 h-4"/>
          Els meus Llocs
        </a>

        <div className="px-3 pb-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-neutral-300">Els teus llocs</div>
        <div className="space-y-0.5 max-h-[42vh] overflow-y-auto pr-1">
          {[
            { name: activeSite, active: true },
            { name: 'Vinya Petita' },
            { name: 'Atelier de joieria' },
            { name: 'Òptica Vidal' },
            { name: 'Ferreteria Roca' },
          ].map((s, i) => (
            <a key={i} className={`relative flex items-center gap-2 px-3 py-2 text-[12px] rounded-xl ${
              s.active ? 'font-extrabold text-carma-700 bg-carma-50/60' : 'font-semibold text-neutral-500 hover:bg-neutral-50'
            }`}>
              {s.active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-gradient-to-b from-carma-400 to-carma-600 rounded-r-full"></div>
              )}
              <Globe className={`w-3.5 h-3.5 ${s.active ? 'text-carma-500' : 'text-neutral-300'}`}/>
              <span className="truncate">{s.name}</span>
            </a>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-neutral-100/70">
          <a className="flex items-center gap-3 px-3 py-2.5 text-[12.5px] font-extrabold rounded-xl text-neutral-500 hover:bg-neutral-50">
            <Settings className="w-4 h-4"/> Configuració
          </a>
        </div>
      </nav>
      <div className="p-3 border-t border-neutral-100/70">
        <div className="px-3 py-2 mb-1">
          <p className="text-[11px] font-bold text-neutral-500 truncate">jordi@latevamarca.cat</p>
          <p className="text-[9.5px] font-extrabold text-neutral-300 uppercase tracking-wider mt-0.5">Client</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-50 border border-neutral-100 w-fit">
          <span className="text-[12px]" aria-hidden>🇦🇩</span>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">CA</span>
        </div>
        <a className="mt-1 flex items-center gap-3 px-3 py-2 text-[11px] font-bold rounded-xl text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors">
          <LogOut className="w-3.5 h-3.5"/> Tancar sessió
        </a>
      </div>
    </aside>
  );
}

/* ───── Editor workspace: breadcrumb, toolbar, canvas with many block types ───── */
function EditorWorkspace() {
  return (
    <div className="flex flex-col min-w-0 bg-white">
      {/* Top page bar: breadcrumb + locale switcher + save indicator + publish */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-neutral-100">
        <div className="flex items-center gap-2 text-[12px] font-bold text-neutral-400 min-w-0">
          <Globe className="w-3.5 h-3.5 text-carma-500 shrink-0"/>
          <span className="truncate">la teva marca</span>
          <span className="text-neutral-200">/</span>
          <span className="truncate">Articles</span>
          <span className="text-neutral-200">/</span>
          <span className="text-ink truncate">L'art de plegar l'or</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-neutral-50 border border-neutral-100">
            {[
              { code: 'CA', flag: '🇦🇩', active: true },
              { code: 'ES', flag: '🇪🇸' },
              { code: 'EN', flag: '🇬🇧' },
            ].map(l => (
              <button key={l.code} className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 ${
                l.active ? 'bg-white shadow-sm text-ink' : 'text-neutral-400 hover:text-neutral-600'
              }`}>
                <span>{l.flag}</span> {l.code}
              </button>
            ))}
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-50 border border-green-100 text-[10px] font-extrabold text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Desat ara
          </span>
          <button className="text-neutral-400 hover:text-neutral-700 px-2 py-1 rounded-md text-[12px] font-bold hidden md:inline-flex">Previsualitzar</button>
          <button className="bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white px-3.5 py-1.5 rounded-lg text-[11.5px] font-extrabold tracking-tight shadow-[0_6px_18px_-6px_rgba(212,175,55,0.45)]">
            Publicar
          </button>
        </div>
      </div>

      {/* TipTap formatting toolbar */}
      <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-neutral-100 bg-[#fbfaf7] overflow-x-auto no-scrollbar">
        <ToolbarDropdown label="Paràgraf"/>
        <ToolbarDiv/>
        <ToolbarBtn bold>B</ToolbarBtn>
        <ToolbarBtn italic>I</ToolbarBtn>
        <ToolbarBtn underline>U</ToolbarBtn>
        <ToolbarBtn strike>S</ToolbarBtn>
        <ToolbarDiv/>
        <ToolbarBtn icon={<span className="text-[10.5px] font-mono">&lt;/&gt;</span>}/>
        <ToolbarBtn icon={<LinkIcon className="w-3.5 h-3.5"/>}/>
        <ToolbarDiv/>
        <ToolbarBtn icon={<Boxes className="w-3.5 h-3.5"/>}/>
        <ToolbarBtn icon={<ImageIcon className="w-3.5 h-3.5"/>}/>
        <ToolbarBtn icon={<Quote className="w-3.5 h-3.5"/>}/>
        <ToolbarBtn icon={<ListIcon className="w-3.5 h-3.5"/>}/>
        <ToolbarBtn icon={<MoreIcon className="w-3.5 h-3.5"/>}/>
        <span className="flex-1"></span>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-300 px-2 hidden sm:inline">3 min · 412 paraules</span>
      </div>

      {/* The canvas with multiple realistic blocks */}
      <div className="relative px-6 sm:px-14 py-10 sm:py-14 min-h-[640px] bg-white">
        <div className="relative max-w-[640px] mx-auto">

          {/* Eyebrow + cover image (Figure block) */}
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-carma-700 mb-3">
            <span>Esborrany</span>
            <span className="text-neutral-300">·</span>
            <span className="text-neutral-400">Procés · 21 maig 2026</span>
          </div>

          {/* H1 with drag handle on hover (always visible here for demo) */}
          <DraggableBlock>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.02em] text-ink leading-[1.08] mb-3">
              L'art de plegar l'or
            </h1>
          </DraggableBlock>

          {/* H2 subhead */}
          <DraggableBlock>
            <p className="text-[17px] sm:text-[18px] text-neutral-500 leading-[1.6] font-medium mb-7">
              Apunts d'un ofici antic que es resisteix a desaparèixer.
            </p>
          </DraggableBlock>

          {/* Figure block — image with caption */}
          <DraggableBlock>
            <figure className="my-7 -mx-3 sm:-mx-6">
              <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-gradient-to-br from-carma-200 via-carma-300 to-carma-700 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)]">
                {/* Abstract gold "metal" texture */}
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(ellipse at 20% 30%, rgba(255,255,255,0.4), transparent 50%), radial-gradient(ellipse at 70% 70%, rgba(0,0,0,0.2), transparent 60%), linear-gradient(135deg, #f7e4ac 0%, #d4af37 35%, #906d1c 65%, #b58f27 100%)'
                }}></div>
                <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/40 text-[9px] font-extrabold uppercase tracking-wider text-white backdrop-blur-sm">
                  Imatge
                </div>
              </div>
              <figcaption className="mt-2.5 text-center text-[12px] italic font-medium text-neutral-400">
                Un full d'or de 0,1 micres. Tan fi que el respir el moltiplica.
              </figcaption>
            </figure>
          </DraggableBlock>

          {/* Paragraph with mid-text inline selection + bubble menu */}
          <DraggableBlock>
            <p className="text-[15px] sm:text-[16.5px] text-neutral-700 leading-[1.75] font-medium mb-4 relative">
              La feina comença a les sis del matí, quan el taller encara fa olor a fred. El batafull ressona contra el banc i {' '}
              <span className="relative">
                <span className="bg-carma-100 px-0.5 -mx-0.5 rounded-sm relative">l'or, com sempre, escolta</span>
                {/* Floating bubble menu */}
                <span className="absolute left-1/2 -translate-x-1/2 -top-12 flex items-center gap-0.5 p-1 bg-ink rounded-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)] whitespace-nowrap z-20">
                  <BubbleBtn>B</BubbleBtn>
                  <BubbleBtn italic>I</BubbleBtn>
                  <BubbleBtn underline>U</BubbleBtn>
                  <BubbleBtn strike>S</BubbleBtn>
                  <span className="w-px h-4 bg-white/15 mx-0.5"></span>
                  <BubbleBtn icon={<LinkIcon className="w-3 h-3"/>}/>
                  <BubbleBtn icon={<Languages className="w-3 h-3"/>}/>
                  {/* Arrow */}
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-ink rotate-45"></span>
                </span>
              </span>
              {' '}abans de cedir. La pell percep el primer signe; els ulls, sempre, arriben tard.
            </p>
          </DraggableBlock>

          {/* H2 with auto-anchor */}
          <DraggableBlock>
            <h2 id="el-batafull" className="group/heading relative text-2xl font-extrabold tracking-[-0.015em] text-ink leading-tight mt-10 mb-3">
              <span className="absolute -left-7 top-1/2 -translate-y-1/2 text-neutral-200 opacity-0 group-hover/heading:opacity-100 text-[14px] font-mono select-none">#</span>
              El batafull i la respiració
            </h2>
          </DraggableBlock>

          {/* Callout block — info (the real Callout extension) */}
          <DraggableBlock>
            <div className="carma-callout relative my-5 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3.5 text-[14px] font-medium text-blue-900 leading-relaxed pl-12" data-variant="info">
              <span className="absolute left-4 top-3.5 text-base" aria-hidden>💡</span>
              <strong className="font-extrabold">Apunt:</strong> el batafull no és un simple martell. La seva forma està feta perquè la força del cop es distribueixi sense esquinçar la làmina.
            </div>
          </DraggableBlock>

          {/* Blockquote with gold left border */}
          <DraggableBlock>
            <blockquote className="my-6 border-l-[3px] border-carma-500 pl-5 py-1">
              <p className="text-[18px] italic font-medium text-neutral-600 leading-relaxed mb-2">«Cada peça és un acte privat de paciència. Si parles mentre treballes, l'or t'ho fa pagar.»</p>
              <cite className="not-italic text-[12px] font-bold text-neutral-400">— Mestra Argilaga, 47 anys d'ofici</cite>
            </blockquote>
          </DraggableBlock>

          {/* 2-column block */}
          <DraggableBlock>
            <div className="grid grid-cols-2 gap-4 my-6 rounded-xl bg-[#fbf9f3]/40 border border-dashed border-carma-200/60 p-3">
              <div className="bg-white rounded-lg p-3.5 border border-neutral-100">
                <h3 className="text-[13px] font-extrabold text-ink mb-1">Materials</h3>
                <p className="text-[12.5px] text-neutral-500 font-medium leading-relaxed">Or pur 24K, làmines de 0,1 micres, cuir de cabra reciclat.</p>
              </div>
              <div className="bg-white rounded-lg p-3.5 border border-neutral-100">
                <h3 className="text-[13px] font-extrabold text-ink mb-1">Eines</h3>
                <p className="text-[12.5px] text-neutral-500 font-medium leading-relaxed">Batafull de 800g, mota de pell, agulles de banya de cérvol.</p>
              </div>
            </div>
          </DraggableBlock>

          {/* Gallery preview */}
          <DraggableBlock>
            <div className="relative -mx-3 sm:-mx-6 my-7 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  'linear-gradient(135deg,#f7e4ac,#d4af37)',
                  'linear-gradient(135deg,#737373,#262626)',
                  'linear-gradient(135deg,#fbf3d6,#eeb849)',
                ].map((bg, i) => (
                  <div key={i} className="aspect-[4/5] relative" style={{background:bg}}>
                    {i === 1 && <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.15),transparent_50%)]"></span>}
                  </div>
                ))}
              </div>
              <button className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 shadow-[0_4px_12px_rgba(0,0,0,0.15)] flex items-center justify-center text-neutral-700">
                <ChevronRight className="w-4 h-4 rotate-180"/>
              </button>
              <button className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 shadow-[0_4px_12px_rgba(0,0,0,0.15)] flex items-center justify-center text-neutral-700">
                <ChevronRight className="w-4 h-4"/>
              </button>
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm text-[10px] font-extrabold text-white">
                <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-white/40"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-white/40"></span>
                <span className="ml-1.5 opacity-70">1/3</span>
              </div>
            </div>
          </DraggableBlock>

          {/* Slash command shown LIVE on a new empty line */}
          <SlashCommandLive/>
        </div>
      </div>
    </div>
  );
}

/* ───── A block with a drag-handle (•••) that fades in on hover ───── */
function DraggableBlock({ children }) {
  return (
    <div className="group relative">
      <div className="absolute right-full top-1 mr-1 flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button aria-label="Afegir bloc" className="w-5 h-5 rounded-md hover:bg-neutral-100 text-neutral-400 flex items-center justify-center">
          <Plus className="w-3.5 h-3.5"/>
        </button>
        <button aria-label="Moure bloc" className="w-5 h-5 rounded-md hover:bg-neutral-100 text-neutral-400 flex items-center justify-center cursor-grab">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><circle cx="5" cy="3" r="1.2"/><circle cx="5" cy="8" r="1.2"/><circle cx="5" cy="13" r="1.2"/><circle cx="11" cy="3" r="1.2"/><circle cx="11" cy="8" r="1.2"/><circle cx="11" cy="13" r="1.2"/></svg>
        </button>
      </div>
      {children}
    </div>
  );
}

/* ───── Live slash command palette — same items as the real product ───── */
function SlashCommandLive() {
  const items = [
    { i: 'P', l: 'Text',              s: 'Paràgraf normal' },
    { i: 'H1', l: 'Títol 1',          s: 'Encapçalament gran' },
    { i: 'H2', l: 'Títol 2',          s: 'Encapçalament de secció', active: true },
    { i: 'H3', l: 'Títol 3',          s: 'Subsecció' },
    { i: '•',  l: 'Llista',           s: 'Llista de punts' },
    { i: '1.', l: 'Llista numerada',  s: 'Llista ordenada' },
    { i: '"',  l: 'Cita',             s: 'Bloc de citació' },
    { i: '⬜', l: '2 columnes',        s: 'Graella de dues columnes' },
    { i: '☰',  l: 'Índex',            s: 'Taula de continguts automàtica' },
    { i: '▸',  l: 'Desplegable',      s: 'Bloc plegable (accordion)' },
    { i: '⌨',  l: 'Botó',             s: "Botó de crida a l'acció (CTA)" },
    { i: 'ℹ',  l: 'Targeta destacada', s: 'Callout informatiu (blau)' },
    { i: '🖼', l: "Galeria d'imatges", s: "Carrusel d'imatges amb fletxes", pro: true },
  ];

  return (
    <div className="group relative my-4">
      {/* The current line user is typing on */}
      <div className="flex items-baseline gap-1 text-[15px] sm:text-[16.5px] text-neutral-700 leading-[1.75] font-medium">
        <span className="text-neutral-300">|</span>
        <span className="text-neutral-400">/</span>
        <span className="caret"></span>
      </div>

      {/* The slash command palette — designed like the real SlashCommandList */}
      <div className="mt-2 sm:absolute sm:left-0 sm:top-[110%] w-full sm:w-[288px] rounded-xl bg-white border border-neutral-200 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.28)] overflow-hidden z-30 max-h-[300px] flex flex-col">
        <div className="px-2.5 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-300 shrink-0">
          Blocs bàsics
        </div>
        <div className="px-1.5 pb-1.5 overflow-y-auto">
          {items.map((it, i) => (
            <div key={i} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg ${it.active ? 'bg-carma-50' : ''}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-extrabold ${
                it.active ? 'border-carma-200 bg-white text-carma-600' : 'border-neutral-200 bg-white text-neutral-500'
              }`}>{it.i}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-bold text-neutral-800 truncate">{it.l}</span>
                  {it.pro && <span className="text-[8.5px] font-extrabold tracking-widest uppercase text-carma-700 bg-carma-50 border border-carma-200/70 px-1 py-0.5 rounded">Pro</span>}
                </span>
                <span className="block text-[10.5px] font-medium text-neutral-400 truncate">{it.s}</span>
              </span>
              {it.active && <span className="text-[9px] font-mono text-carma-700 bg-white border border-carma-200 px-1 py-0.5 rounded shrink-0">↵</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───── Toolbar bits ───── */
function ToolbarBtn({ children, icon, bold, italic, underline, strike }) {
  return (
    <button className={`w-8 h-8 rounded-md hover:bg-white flex items-center justify-center text-[11.5px] text-neutral-600 shrink-0 ${italic ? 'italic' : ''} ${strike ? 'line-through' : ''} ${bold ? 'font-extrabold' : 'font-bold'} ${underline ? 'underline underline-offset-2' : ''}`}>
      {icon || children}
    </button>
  );
}
function ToolbarDiv() { return <span className="w-px h-5 bg-neutral-200 mx-1 shrink-0"/>; }
function ToolbarDropdown({ label }) {
  return (
    <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-white text-[11.5px] font-bold text-neutral-600 shrink-0">
      {label}
      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-neutral-400"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  );
}
function BubbleBtn({ children, icon, italic, underline, strike }) {
  return (
    <button className={`min-w-[28px] h-7 px-1.5 rounded-lg hover:bg-white/10 text-white text-[12px] font-extrabold flex items-center justify-center transition-colors ${italic ? 'italic' : ''} ${strike ? 'line-through' : ''} ${underline ? 'underline underline-offset-2' : ''}`}>
      {icon || children}
    </button>
  );
}

/* ───── Quick local icons we need only here ───── */
function LinkIcon({ className = "w-4 h-4" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21l1-1"/></svg>;
}
function ImageIcon({ className = "w-4 h-4" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>;
}
function Quote({ className = "w-4 h-4" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 21c0-3 1.5-5 4-5V11a6 6 0 0 0-6 6v4ZM14 21c0-3 1.5-5 4-5V11a6 6 0 0 0-6 6v4Z"/></svg>;
}
function ListIcon({ className = "w-4 h-4" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>;
}
function MoreIcon({ className = "w-4 h-4" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>;
}
function Plus({ className = "w-4 h-4" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 5v14M5 12h14"/></svg>;
}

function HelperPill({ kbd, label }) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white border border-neutral-200/70 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.04)]">
      <kbd className="px-1.5 py-0.5 text-[10.5px] font-mono rounded bg-neutral-100 border border-neutral-200 text-neutral-700">{kbd}</kbd>
      <span className="text-[11.5px] font-bold text-neutral-500">{label}</span>
    </div>
  );
}

Object.assign(window, { EditorPreview, CarmaSidebar, BrowserChrome });

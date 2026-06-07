/* @ds-bundle: {"format":3,"namespace":"CarmaDesignSystem_b6ffe1","components":[],"sourceHashes":{"editor-preview.jsx":"99992122fec8","product-tour.jsx":"32205f55309d"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.CarmaDesignSystem_b6ffe1 = window.CarmaDesignSystem_b6ffe1 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// editor-preview.jsx
try { (() => {
/* ============================================================================
 * EditorPreview — high-fidelity recreation of Carma's TipTap post editor,
 * wrapped in the real Carma dashboard chrome (sidebar + toolbar).
 *
 * Uses real Catalan strings, real block names, real slash menu order from
 * src/components/editor/extensions/SlashCommand.tsx.
 * ========================================================================== */

function EditorPreview() {
  return /*#__PURE__*/React.createElement("section", {
    id: "editor",
    className: "relative py-24 sm:py-32 px-5 sm:px-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "halo bg-carma-200/35 absolute",
    style: {
      width: 600,
      height: 600,
      top: 100,
      left: -200
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative mx-auto max-w-6xl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center max-w-2xl mx-auto"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    "data-reveal": true
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), " L'editor"), /*#__PURE__*/React.createElement("h2", {
    className: "mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight text-ink",
    "data-reveal": true,
    style: {
      '--reveal-delay': '80ms'
    }
  }, "Una p\xE0gina en blanc. ", /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-400"
  }, "Tot a una tecla.")), /*#__PURE__*/React.createElement("p", {
    className: "mt-5 text-base font-medium text-neutral-500 leading-relaxed",
    "data-reveal": true,
    style: {
      '--reveal-delay': '160ms'
    }
  }, "Escriu amb la calma d'un processador de text i la pot\xE8ncia d'un constructor de p\xE0gines. Teclegeja ", /*#__PURE__*/React.createElement("kbd", {
    className: "px-1.5 py-0.5 text-[11px] font-mono rounded-md bg-white border border-neutral-200 align-middle"
  }, "/"), " i veur\xE0s tots els blocs.")), /*#__PURE__*/React.createElement("div", {
    className: "relative mt-14 max-w-6xl mx-auto rounded-[2rem] bg-white border border-neutral-200/60 shadow-premium overflow-hidden",
    "data-reveal": true,
    style: {
      '--reveal-delay': '240ms'
    }
  }, /*#__PURE__*/React.createElement(BrowserChrome, {
    url: "carma.cat/dashboard/sites/la-teva-marca/posts/edit"
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid lg:grid-cols-[240px_1fr]"
  }, /*#__PURE__*/React.createElement(CarmaSidebar, {
    activeSite: "la teva marca"
  }), /*#__PURE__*/React.createElement(EditorWorkspace, null))), /*#__PURE__*/React.createElement("div", {
    className: "mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto",
    "data-reveal": true,
    style: {
      '--reveal-delay': '320ms'
    }
  }, /*#__PURE__*/React.createElement(HelperPill, {
    kbd: "/",
    label: "Inserir bloc"
  }), /*#__PURE__*/React.createElement(HelperPill, {
    kbd: "\u2318 K",
    label: "Cercar"
  }), /*#__PURE__*/React.createElement(HelperPill, {
    kbd: "\u2318 \u21E7 L",
    label: "Traduir bloc"
  }), /*#__PURE__*/React.createElement(HelperPill, {
    kbd: "\u2318 S",
    label: "Desar (auto)"
  }))));
}

/* ───── Browser chrome with traffic lights + URL bar ───── */
function BrowserChrome({
  url
}) {
  const [host, ...rest] = url.split('/');
  return /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 px-4 py-2.5 border-b border-neutral-100 bg-[#fbfbfa]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-3 h-3 rounded-full bg-[#FF5F57]"
  }), /*#__PURE__*/React.createElement("span", {
    className: "w-3 h-3 rounded-full bg-[#FEBC2E]"
  }), /*#__PURE__*/React.createElement("span", {
    className: "w-3 h-3 rounded-full bg-[#28C840]"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 flex justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 px-3 py-1 bg-white border border-neutral-200 rounded-lg text-[11px] font-mono text-neutral-500 max-w-full truncate"
  }, /*#__PURE__*/React.createElement(Lock, {
    className: "w-3 h-3 text-neutral-400 shrink-0"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-700"
  }, host), /*#__PURE__*/React.createElement("span", {
    className: "truncate"
  }, "/", rest.join('/')))), /*#__PURE__*/React.createElement("div", {
    className: "w-12 hidden sm:flex justify-end gap-1.5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-6 h-6 rounded-md bg-white border border-neutral-200"
  })));
}

/* ───── Carma dashboard sidebar — faithful to DashboardSidebar.tsx + SidebarNav.tsx ───── */
function CarmaSidebar({
  activeSite,
  view = 'editor'
}) {
  return /*#__PURE__*/React.createElement("aside", {
    className: "hidden lg:flex flex-col bg-white border-r border-neutral-200/60 shadow-[4px_0_24px_rgba(0,0,0,0.02)]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-16 flex items-center px-6 border-b border-neutral-100/70"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xl font-extrabold tracking-[-0.04em] leading-none text-ink"
  }, "Carma", /*#__PURE__*/React.createElement("span", {
    className: "text-carma-500"
  }, "."))), /*#__PURE__*/React.createElement("nav", {
    className: "flex-1 py-5 px-3 overflow-y-auto"
  }, /*#__PURE__*/React.createElement("a", {
    className: "relative flex items-center gap-3 px-3 py-2.5 text-[12.5px] font-extrabold rounded-xl text-neutral-500 hover:bg-neutral-50 mb-4"
  }, /*#__PURE__*/React.createElement(FileText, {
    className: "w-4 h-4"
  }), "Els meus Llocs"), /*#__PURE__*/React.createElement("div", {
    className: "px-3 pb-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-neutral-300"
  }, "Els teus llocs"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-0.5 max-h-[42vh] overflow-y-auto pr-1"
  }, [{
    name: activeSite,
    active: true
  }, {
    name: 'Vinya Petita'
  }, {
    name: 'Atelier de joieria'
  }, {
    name: 'Òptica Vidal'
  }, {
    name: 'Ferreteria Roca'
  }].map((s, i) => /*#__PURE__*/React.createElement("a", {
    key: i,
    className: `relative flex items-center gap-2 px-3 py-2 text-[12px] rounded-xl ${s.active ? 'font-extrabold text-carma-700 bg-carma-50/60' : 'font-semibold text-neutral-500 hover:bg-neutral-50'}`
  }, s.active && /*#__PURE__*/React.createElement("div", {
    className: "absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-gradient-to-b from-carma-400 to-carma-600 rounded-r-full"
  }), /*#__PURE__*/React.createElement(Globe, {
    className: `w-3.5 h-3.5 ${s.active ? 'text-carma-500' : 'text-neutral-300'}`
  }), /*#__PURE__*/React.createElement("span", {
    className: "truncate"
  }, s.name)))), /*#__PURE__*/React.createElement("div", {
    className: "mt-5 pt-4 border-t border-neutral-100/70"
  }, /*#__PURE__*/React.createElement("a", {
    className: "flex items-center gap-3 px-3 py-2.5 text-[12.5px] font-extrabold rounded-xl text-neutral-500 hover:bg-neutral-50"
  }, /*#__PURE__*/React.createElement(Settings, {
    className: "w-4 h-4"
  }), " Configuraci\xF3"))), /*#__PURE__*/React.createElement("div", {
    className: "p-3 border-t border-neutral-100/70"
  }, /*#__PURE__*/React.createElement("div", {
    className: "px-3 py-2 mb-1"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] font-bold text-neutral-500 truncate"
  }, "jordi@latevamarca.cat"), /*#__PURE__*/React.createElement("p", {
    className: "text-[9.5px] font-extrabold text-neutral-300 uppercase tracking-wider mt-0.5"
  }, "Client")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-50 border border-neutral-100 w-fit"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[12px]",
    "aria-hidden": true
  }, "\uD83C\uDDE6\uD83C\uDDE9"), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-extrabold uppercase tracking-wider text-neutral-500"
  }, "CA")), /*#__PURE__*/React.createElement("a", {
    className: "mt-1 flex items-center gap-3 px-3 py-2 text-[11px] font-bold rounded-xl text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
  }, /*#__PURE__*/React.createElement(LogOut, {
    className: "w-3.5 h-3.5"
  }), " Tancar sessi\xF3")));
}

/* ───── Editor workspace: breadcrumb, toolbar, canvas with many block types ───── */
function EditorWorkspace() {
  return /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col min-w-0 bg-white"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-3 px-5 py-3 border-b border-neutral-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-[12px] font-bold text-neutral-400 min-w-0"
  }, /*#__PURE__*/React.createElement(Globe, {
    className: "w-3.5 h-3.5 text-carma-500 shrink-0"
  }), /*#__PURE__*/React.createElement("span", {
    className: "truncate"
  }, "la teva marca"), /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-200"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "truncate"
  }, "Articles"), /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-200"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "text-ink truncate"
  }, "L'art de plegar l'or")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 shrink-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-0.5 p-0.5 rounded-lg bg-neutral-50 border border-neutral-100"
  }, [{
    code: 'CA',
    flag: '🇦🇩',
    active: true
  }, {
    code: 'ES',
    flag: '🇪🇸'
  }, {
    code: 'EN',
    flag: '🇬🇧'
  }].map(l => /*#__PURE__*/React.createElement("button", {
    key: l.code,
    className: `px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 ${l.active ? 'bg-white shadow-sm text-ink' : 'text-neutral-400 hover:text-neutral-600'}`
  }, /*#__PURE__*/React.createElement("span", null, l.flag), " ", l.code))), /*#__PURE__*/React.createElement("span", {
    className: "hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-50 border border-green-100 text-[10px] font-extrabold text-green-700"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
  }), " Desat ara"), /*#__PURE__*/React.createElement("button", {
    className: "text-neutral-400 hover:text-neutral-700 px-2 py-1 rounded-md text-[12px] font-bold hidden md:inline-flex"
  }, "Previsualitzar"), /*#__PURE__*/React.createElement("button", {
    className: "bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white px-3.5 py-1.5 rounded-lg text-[11.5px] font-extrabold tracking-tight shadow-[0_6px_18px_-6px_rgba(212,175,55,0.45)]"
  }, "Publicar"))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-0.5 px-4 py-1.5 border-b border-neutral-100 bg-[#fbfaf7] overflow-x-auto no-scrollbar"
  }, /*#__PURE__*/React.createElement(ToolbarDropdown, {
    label: "Par\xE0graf"
  }), /*#__PURE__*/React.createElement(ToolbarDiv, null), /*#__PURE__*/React.createElement(ToolbarBtn, {
    bold: true
  }, "B"), /*#__PURE__*/React.createElement(ToolbarBtn, {
    italic: true
  }, "I"), /*#__PURE__*/React.createElement(ToolbarBtn, {
    underline: true
  }, "U"), /*#__PURE__*/React.createElement(ToolbarBtn, {
    strike: true
  }, "S"), /*#__PURE__*/React.createElement(ToolbarDiv, null), /*#__PURE__*/React.createElement(ToolbarBtn, {
    icon: /*#__PURE__*/React.createElement("span", {
      className: "text-[10.5px] font-mono"
    }, "</>")
  }), /*#__PURE__*/React.createElement(ToolbarBtn, {
    icon: /*#__PURE__*/React.createElement(LinkIcon, {
      className: "w-3.5 h-3.5"
    })
  }), /*#__PURE__*/React.createElement(ToolbarDiv, null), /*#__PURE__*/React.createElement(ToolbarBtn, {
    icon: /*#__PURE__*/React.createElement(Boxes, {
      className: "w-3.5 h-3.5"
    })
  }), /*#__PURE__*/React.createElement(ToolbarBtn, {
    icon: /*#__PURE__*/React.createElement(ImageIcon, {
      className: "w-3.5 h-3.5"
    })
  }), /*#__PURE__*/React.createElement(ToolbarBtn, {
    icon: /*#__PURE__*/React.createElement(Quote, {
      className: "w-3.5 h-3.5"
    })
  }), /*#__PURE__*/React.createElement(ToolbarBtn, {
    icon: /*#__PURE__*/React.createElement(ListIcon, {
      className: "w-3.5 h-3.5"
    })
  }), /*#__PURE__*/React.createElement(ToolbarBtn, {
    icon: /*#__PURE__*/React.createElement(MoreIcon, {
      className: "w-3.5 h-3.5"
    })
  }), /*#__PURE__*/React.createElement("span", {
    className: "flex-1"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-300 px-2 hidden sm:inline"
  }, "3 min \xB7 412 paraules")), /*#__PURE__*/React.createElement("div", {
    className: "relative px-6 sm:px-14 py-10 sm:py-14 min-h-[640px] bg-white"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative max-w-[640px] mx-auto"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-carma-700 mb-3"
  }, /*#__PURE__*/React.createElement("span", null, "Esborrany"), /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-300"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-400"
  }, "Proc\xE9s \xB7 21 maig 2026")), /*#__PURE__*/React.createElement(DraggableBlock, null, /*#__PURE__*/React.createElement("h1", {
    className: "text-3xl sm:text-4xl font-extrabold tracking-[-0.02em] text-ink leading-[1.08] mb-3"
  }, "L'art de plegar l'or")), /*#__PURE__*/React.createElement(DraggableBlock, null, /*#__PURE__*/React.createElement("p", {
    className: "text-[17px] sm:text-[18px] text-neutral-500 leading-[1.6] font-medium mb-7"
  }, "Apunts d'un ofici antic que es resisteix a desapar\xE8ixer.")), /*#__PURE__*/React.createElement(DraggableBlock, null, /*#__PURE__*/React.createElement("figure", {
    className: "my-7 -mx-3 sm:-mx-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative aspect-[16/9] rounded-2xl overflow-hidden bg-gradient-to-br from-carma-200 via-carma-300 to-carma-700 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0",
    style: {
      background: 'radial-gradient(ellipse at 20% 30%, rgba(255,255,255,0.4), transparent 50%), radial-gradient(ellipse at 70% 70%, rgba(0,0,0,0.2), transparent 60%), linear-gradient(135deg, #f7e4ac 0%, #d4af37 35%, #906d1c 65%, #b58f27 100%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/40 text-[9px] font-extrabold uppercase tracking-wider text-white backdrop-blur-sm"
  }, "Imatge")), /*#__PURE__*/React.createElement("figcaption", {
    className: "mt-2.5 text-center text-[12px] italic font-medium text-neutral-400"
  }, "Un full d'or de 0,1 micres. Tan fi que el respir el moltiplica."))), /*#__PURE__*/React.createElement(DraggableBlock, null, /*#__PURE__*/React.createElement("p", {
    className: "text-[15px] sm:text-[16.5px] text-neutral-700 leading-[1.75] font-medium mb-4 relative"
  }, "La feina comen\xE7a a les sis del mat\xED, quan el taller encara fa olor a fred. El batafull ressona contra el banc i ", ' ', /*#__PURE__*/React.createElement("span", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bg-carma-100 px-0.5 -mx-0.5 rounded-sm relative"
  }, "l'or, com sempre, escolta"), /*#__PURE__*/React.createElement("span", {
    className: "absolute left-1/2 -translate-x-1/2 -top-12 flex items-center gap-0.5 p-1 bg-ink rounded-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)] whitespace-nowrap z-20"
  }, /*#__PURE__*/React.createElement(BubbleBtn, null, "B"), /*#__PURE__*/React.createElement(BubbleBtn, {
    italic: true
  }, "I"), /*#__PURE__*/React.createElement(BubbleBtn, {
    underline: true
  }, "U"), /*#__PURE__*/React.createElement(BubbleBtn, {
    strike: true
  }, "S"), /*#__PURE__*/React.createElement("span", {
    className: "w-px h-4 bg-white/15 mx-0.5"
  }), /*#__PURE__*/React.createElement(BubbleBtn, {
    icon: /*#__PURE__*/React.createElement(LinkIcon, {
      className: "w-3 h-3"
    })
  }), /*#__PURE__*/React.createElement(BubbleBtn, {
    icon: /*#__PURE__*/React.createElement(Languages, {
      className: "w-3 h-3"
    })
  }), /*#__PURE__*/React.createElement("span", {
    className: "absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-ink rotate-45"
  }))), ' ', "abans de cedir. La pell percep el primer signe; els ulls, sempre, arriben tard.")), /*#__PURE__*/React.createElement(DraggableBlock, null, /*#__PURE__*/React.createElement("h2", {
    id: "el-batafull",
    className: "group/heading relative text-2xl font-extrabold tracking-[-0.015em] text-ink leading-tight mt-10 mb-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "absolute -left-7 top-1/2 -translate-y-1/2 text-neutral-200 opacity-0 group-hover/heading:opacity-100 text-[14px] font-mono select-none"
  }, "#"), "El batafull i la respiraci\xF3")), /*#__PURE__*/React.createElement(DraggableBlock, null, /*#__PURE__*/React.createElement("div", {
    className: "carma-callout relative my-5 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3.5 text-[14px] font-medium text-blue-900 leading-relaxed pl-12",
    "data-variant": "info"
  }, /*#__PURE__*/React.createElement("span", {
    className: "absolute left-4 top-3.5 text-base",
    "aria-hidden": true
  }, "\uD83D\uDCA1"), /*#__PURE__*/React.createElement("strong", {
    className: "font-extrabold"
  }, "Apunt:"), " el batafull no \xE9s un simple martell. La seva forma est\xE0 feta perqu\xE8 la for\xE7a del cop es distribueixi sense esquin\xE7ar la l\xE0mina.")), /*#__PURE__*/React.createElement(DraggableBlock, null, /*#__PURE__*/React.createElement("blockquote", {
    className: "my-6 border-l-[3px] border-carma-500 pl-5 py-1"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[18px] italic font-medium text-neutral-600 leading-relaxed mb-2"
  }, "\xABCada pe\xE7a \xE9s un acte privat de paci\xE8ncia. Si parles mentre treballes, l'or t'ho fa pagar.\xBB"), /*#__PURE__*/React.createElement("cite", {
    className: "not-italic text-[12px] font-bold text-neutral-400"
  }, "\u2014 Mestra Argilaga, 47 anys d'ofici"))), /*#__PURE__*/React.createElement(DraggableBlock, null, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-4 my-6 rounded-xl bg-[#fbf9f3]/40 border border-dashed border-carma-200/60 p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-lg p-3.5 border border-neutral-100"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-[13px] font-extrabold text-ink mb-1"
  }, "Materials"), /*#__PURE__*/React.createElement("p", {
    className: "text-[12.5px] text-neutral-500 font-medium leading-relaxed"
  }, "Or pur 24K, l\xE0mines de 0,1 micres, cuir de cabra reciclat.")), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-lg p-3.5 border border-neutral-100"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-[13px] font-extrabold text-ink mb-1"
  }, "Eines"), /*#__PURE__*/React.createElement("p", {
    className: "text-[12.5px] text-neutral-500 font-medium leading-relaxed"
  }, "Batafull de 800g, mota de pell, agulles de banya de c\xE9rvol.")))), /*#__PURE__*/React.createElement(DraggableBlock, null, /*#__PURE__*/React.createElement("div", {
    className: "relative -mx-3 sm:-mx-6 my-7 rounded-2xl overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-3 gap-1.5"
  }, ['linear-gradient(135deg,#f7e4ac,#d4af37)', 'linear-gradient(135deg,#737373,#262626)', 'linear-gradient(135deg,#fbf3d6,#eeb849)'].map((bg, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "aspect-[4/5] relative",
    style: {
      background: bg
    }
  }, i === 1 && /*#__PURE__*/React.createElement("span", {
    className: "absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.15),transparent_50%)]"
  })))), /*#__PURE__*/React.createElement("button", {
    className: "absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 shadow-[0_4px_12px_rgba(0,0,0,0.15)] flex items-center justify-center text-neutral-700"
  }, /*#__PURE__*/React.createElement(ChevronRight, {
    className: "w-4 h-4 rotate-180"
  })), /*#__PURE__*/React.createElement("button", {
    className: "absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 shadow-[0_4px_12px_rgba(0,0,0,0.15)] flex items-center justify-center text-neutral-700"
  }, /*#__PURE__*/React.createElement(ChevronRight, {
    className: "w-4 h-4"
  })), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm text-[10px] font-extrabold text-white"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-white"
  }), /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-white/40"
  }), /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-white/40"
  }), /*#__PURE__*/React.createElement("span", {
    className: "ml-1.5 opacity-70"
  }, "1/3")))), /*#__PURE__*/React.createElement(SlashCommandLive, null))));
}

/* ───── A block with a drag-handle (•••) that fades in on hover ───── */
function DraggableBlock({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "group relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute right-full top-1 mr-1 flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity"
  }, /*#__PURE__*/React.createElement("button", {
    "aria-label": "Afegir bloc",
    className: "w-5 h-5 rounded-md hover:bg-neutral-100 text-neutral-400 flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(Plus, {
    className: "w-3.5 h-3.5"
  })), /*#__PURE__*/React.createElement("button", {
    "aria-label": "Moure bloc",
    className: "w-5 h-5 rounded-md hover:bg-neutral-100 text-neutral-400 flex items-center justify-center cursor-grab"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 16 16",
    className: "w-3.5 h-3.5",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "5",
    cy: "3",
    r: "1.2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "5",
    cy: "8",
    r: "1.2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "5",
    cy: "13",
    r: "1.2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "1.2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "8",
    r: "1.2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "13",
    r: "1.2"
  })))), children);
}

/* ───── Live slash command palette — same items as the real product ───── */
function SlashCommandLive() {
  const items = [{
    i: 'P',
    l: 'Text',
    s: 'Paràgraf normal'
  }, {
    i: 'H1',
    l: 'Títol 1',
    s: 'Encapçalament gran'
  }, {
    i: 'H2',
    l: 'Títol 2',
    s: 'Encapçalament de secció',
    active: true
  }, {
    i: 'H3',
    l: 'Títol 3',
    s: 'Subsecció'
  }, {
    i: '•',
    l: 'Llista',
    s: 'Llista de punts'
  }, {
    i: '1.',
    l: 'Llista numerada',
    s: 'Llista ordenada'
  }, {
    i: '"',
    l: 'Cita',
    s: 'Bloc de citació'
  }, {
    i: '⬜',
    l: '2 columnes',
    s: 'Graella de dues columnes'
  }, {
    i: '☰',
    l: 'Índex',
    s: 'Taula de continguts automàtica'
  }, {
    i: '▸',
    l: 'Desplegable',
    s: 'Bloc plegable (accordion)'
  }, {
    i: '⌨',
    l: 'Botó',
    s: "Botó de crida a l'acció (CTA)"
  }, {
    i: 'ℹ',
    l: 'Targeta destacada',
    s: 'Callout informatiu (blau)'
  }, {
    i: '🖼',
    l: "Galeria d'imatges",
    s: "Carrusel d'imatges amb fletxes",
    pro: true
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "group relative my-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline gap-1 text-[15px] sm:text-[16.5px] text-neutral-700 leading-[1.75] font-medium"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-300"
  }, "|"), /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-400"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "caret"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 sm:absolute sm:left-0 sm:top-[110%] w-full sm:w-[288px] rounded-xl bg-white border border-neutral-200 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.28)] overflow-hidden z-30 max-h-[300px] flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "px-2.5 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-300 shrink-0"
  }, "Blocs b\xE0sics"), /*#__PURE__*/React.createElement("div", {
    className: "px-1.5 pb-1.5 overflow-y-auto"
  }, items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg ${it.active ? 'bg-carma-50' : ''}`
  }, /*#__PURE__*/React.createElement("span", {
    className: `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-extrabold ${it.active ? 'border-carma-200 bg-white text-carma-600' : 'border-neutral-200 bg-white text-neutral-500'}`
  }, it.i), /*#__PURE__*/React.createElement("span", {
    className: "min-w-0 flex-1"
  }, /*#__PURE__*/React.createElement("span", {
    className: "flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[12.5px] font-bold text-neutral-800 truncate"
  }, it.l), it.pro && /*#__PURE__*/React.createElement("span", {
    className: "text-[8.5px] font-extrabold tracking-widest uppercase text-carma-700 bg-carma-50 border border-carma-200/70 px-1 py-0.5 rounded"
  }, "Pro")), /*#__PURE__*/React.createElement("span", {
    className: "block text-[10.5px] font-medium text-neutral-400 truncate"
  }, it.s)), it.active && /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-mono text-carma-700 bg-white border border-carma-200 px-1 py-0.5 rounded shrink-0"
  }, "\u21B5"))))));
}

/* ───── Toolbar bits ───── */
function ToolbarBtn({
  children,
  icon,
  bold,
  italic,
  underline,
  strike
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: `w-8 h-8 rounded-md hover:bg-white flex items-center justify-center text-[11.5px] text-neutral-600 shrink-0 ${italic ? 'italic' : ''} ${strike ? 'line-through' : ''} ${bold ? 'font-extrabold' : 'font-bold'} ${underline ? 'underline underline-offset-2' : ''}`
  }, icon || children);
}
function ToolbarDiv() {
  return /*#__PURE__*/React.createElement("span", {
    className: "w-px h-5 bg-neutral-200 mx-1 shrink-0"
  });
}
function ToolbarDropdown({
  label
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-white text-[11.5px] font-bold text-neutral-600 shrink-0"
  }, label, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 12 12",
    className: "w-2.5 h-2.5 text-neutral-400"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 4.5 6 7.5 9 4.5",
    stroke: "currentColor",
    strokeWidth: "1.5",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
}
function BubbleBtn({
  children,
  icon,
  italic,
  underline,
  strike
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: `min-w-[28px] h-7 px-1.5 rounded-lg hover:bg-white/10 text-white text-[12px] font-extrabold flex items-center justify-center transition-colors ${italic ? 'italic' : ''} ${strike ? 'line-through' : ''} ${underline ? 'underline underline-offset-2' : ''}`
  }, icon || children);
}

/* ───── Quick local icons we need only here ───── */
function LinkIcon({
  className = "w-4 h-4"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21l1-1"
  }));
}
function ImageIcon({
  className = "w-4 h-4"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "3",
    width: "18",
    height: "18",
    rx: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "8.5",
    r: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 15-5-5L5 21"
  }));
}
function Quote({
  className = "w-4 h-4"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 21c0-3 1.5-5 4-5V11a6 6 0 0 0-6 6v4ZM14 21c0-3 1.5-5 4-5V11a6 6 0 0 0-6 6v4Z"
  }));
}
function ListIcon({
  className = "w-4 h-4"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
  }));
}
function MoreIcon({
  className = "w-4 h-4"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "12",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "5",
    cy: "12",
    r: "1"
  }));
}
function Plus({
  className = "w-4 h-4"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12h14"
  }));
}
function HelperPill({
  kbd,
  label
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white border border-neutral-200/70 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.04)]"
  }, /*#__PURE__*/React.createElement("kbd", {
    className: "px-1.5 py-0.5 text-[10.5px] font-mono rounded bg-neutral-100 border border-neutral-200 text-neutral-700"
  }, kbd), /*#__PURE__*/React.createElement("span", {
    className: "text-[11.5px] font-bold text-neutral-500"
  }, label));
}
Object.assign(window, {
  EditorPreview,
  CarmaSidebar,
  BrowserChrome
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "editor-preview.jsx", error: String((e && e.message) || e) }); }

// product-tour.jsx
try { (() => {
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
  const tabs = [{
    id: 'panell',
    label: 'Panell',
    hint: 'Tots els teus llocs'
  }, {
    id: 'articles',
    label: 'Articles',
    hint: 'Gestor de posts'
  }, {
    id: 'tema',
    label: 'Tema',
    hint: 'Editor visual'
  }, {
    id: 'connexio',
    label: 'Connexió',
    hint: 'API & embed'
  }, {
    id: 'publicat',
    label: 'Publicat',
    hint: 'Al teu blog'
  }];
  return /*#__PURE__*/React.createElement("section", {
    id: "recorregut",
    className: "relative py-24 sm:py-32 px-5 sm:px-8 bg-gradient-to-b from-transparent via-[#fbfaf7]/60 to-transparent"
  }, /*#__PURE__*/React.createElement("div", {
    className: "halo bg-carma-300/15 absolute",
    style: {
      width: 700,
      height: 500,
      top: 80,
      right: -200
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative mx-auto max-w-6xl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center max-w-2xl mx-auto mb-10"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    "data-reveal": true
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), " Un recorregut"), /*#__PURE__*/React.createElement("h2", {
    className: "mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight text-ink",
    "data-reveal": true,
    style: {
      '--reveal-delay': '80ms'
    }
  }, "Pots veure-ho. ", /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-400"
  }, "Sense registrar-te.")), /*#__PURE__*/React.createElement("p", {
    className: "mt-5 text-base font-medium text-neutral-500 leading-relaxed",
    "data-reveal": true,
    style: {
      '--reveal-delay': '160ms'
    }
  }, "Cinc captures reals dels racons que feu servir cada dia. Cap maqueta inventada.")), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-center mb-6",
    "data-reveal": true,
    style: {
      '--reveal-delay': '240ms'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "inline-flex items-center gap-1 p-1 rounded-full bg-white border border-neutral-200/70 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.10)] overflow-x-auto no-scrollbar max-w-full"
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    onClick: () => setTab(t.id),
    className: `relative px-3.5 sm:px-4.5 py-2 rounded-full text-[12px] sm:text-[13px] font-extrabold tracking-tight whitespace-nowrap transition-all ${tab === t.id ? 'bg-ink text-white shadow-[0_6px_14px_-6px_rgba(0,0,0,0.3)]' : 'text-neutral-500 hover:text-ink hover:bg-neutral-50'}`
  }, t.label, tab === t.id && /*#__PURE__*/React.createElement("span", {
    className: "absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-neutral-400 normal-case tracking-normal whitespace-nowrap"
  }, t.hint))))), /*#__PURE__*/React.createElement("div", {
    className: "mt-12 relative rounded-[2rem] bg-white border border-neutral-200/60 shadow-premium overflow-hidden",
    "data-reveal": true,
    style: {
      '--reveal-delay': '320ms'
    }
  }, /*#__PURE__*/React.createElement(BrowserChrome, {
    url: `carma.cat${tab === 'publicat' ? '/la-teva-marca' : '/dashboard' + (tab === 'panell' ? '' : '/sites/la-teva-marca?tab=' + tab)}`
  }), /*#__PURE__*/React.createElement("div", {
    key: tab,
    style: {
      animation: 'fade-up 0.55s cubic-bezier(0.16,1,0.3,1) both'
    }
  }, tab === 'panell' && /*#__PURE__*/React.createElement(TabPanell, null), tab === 'articles' && /*#__PURE__*/React.createElement(TabArticles, null), tab === 'tema' && /*#__PURE__*/React.createElement(TabTema, null), tab === 'connexio' && /*#__PURE__*/React.createElement(TabConnexio, null), tab === 'publicat' && /*#__PURE__*/React.createElement(TabPublicat, null)))));
}

/* ────────────────────────────────────────────────────────────────────────── *
 * TAB 1 — Panell (sites grid, dashboard home)
 * ────────────────────────────────────────────────────────────────────────── */
function TabPanell() {
  const sites = [{
    name: 'la teva marca',
    posts: 24,
    drafts: 2,
    color: 'linear-gradient(135deg,#1a2138,#d4af37)',
    last: 'fa 2 h'
  }, {
    name: 'Vinya Petita',
    posts: 18,
    drafts: 0,
    color: 'linear-gradient(135deg,#5b8a72,#3f6450)',
    last: 'ahir'
  }, {
    name: 'Atelier de joieria',
    posts: 42,
    drafts: 5,
    color: 'linear-gradient(135deg,#d4af37,#906d1c)',
    last: 'fa 3 d'
  }, {
    name: 'Òptica Vidal',
    posts: 11,
    drafts: 1,
    color: 'linear-gradient(135deg,#737373,#262626)',
    last: 'fa 1 set'
  }, {
    name: 'Ferreteria Roca',
    posts: 7,
    drafts: 0,
    color: 'linear-gradient(135deg,#b91c1c,#7f1d1d)',
    last: 'fa 2 set'
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "grid lg:grid-cols-[240px_1fr]"
  }, /*#__PURE__*/React.createElement(CarmaSidebar, {
    activeSite: "la teva marca"
  }), /*#__PURE__*/React.createElement("div", {
    className: "bg-[#F9F8F6] p-6 sm:p-10 min-h-[560px]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-7"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-ink"
  }, "Els meus Llocs"), /*#__PURE__*/React.createElement("p", {
    className: "text-[13px] font-medium text-neutral-500 mt-1"
  }, "5 llocs \xB7 102 articles en total")), /*#__PURE__*/React.createElement("button", {
    className: "bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white px-4 py-2.5 rounded-xl text-[12.5px] font-extrabold tracking-tight shadow-[0_8px_24px_-8px_rgba(212,175,55,0.45)] inline-flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-base leading-none"
  }, "+"), " Nou Lloc")), /*#__PURE__*/React.createElement("div", {
    className: "grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
  }, sites.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "group bg-white rounded-3xl border border-neutral-200/60 shadow-[0_6px_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden hover:shadow-premium hover:-translate-y-1 transition-all"
  }, /*#__PURE__*/React.createElement("div", {
    className: "aspect-[16/9] relative",
    style: {
      background: s.color
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0",
    style: {
      background: 'radial-gradient(ellipse at 70% 30%, rgba(255,255,255,0.25), transparent 50%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/85 backdrop-blur-sm text-[9.5px] font-extrabold uppercase tracking-wider text-neutral-700"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-green-500"
  }), " En l\xEDnia"), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-3 left-3 text-white"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10.5px] font-extrabold uppercase tracking-[0.14em] opacity-70"
  }, "Wordmark"), /*#__PURE__*/React.createElement("p", {
    className: "text-base font-extrabold tracking-tight mt-0.5 capitalize"
  }, s.name))), /*#__PURE__*/React.createElement("div", {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-[11.5px] font-bold text-neutral-500 mb-2"
  }, /*#__PURE__*/React.createElement("span", null, s.name), /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-300"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, s.last)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 text-[11px] font-extrabold"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-1 text-neutral-700"
  }, /*#__PURE__*/React.createElement(FileText, {
    className: "w-3 h-3 text-carma-500"
  }), " ", s.posts, " articles"), s.drafts > 0 && /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-1 text-amber-700"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-amber-400"
  }), " ", s.drafts, " esborrany", s.drafts > 1 ? 's' : ''))))), /*#__PURE__*/React.createElement("div", {
    className: "rounded-3xl border-2 border-dashed border-neutral-200 bg-white/40 flex flex-col items-center justify-center p-8 text-neutral-400 hover:border-carma-300 hover:text-carma-700 hover:bg-carma-50/30 transition-colors cursor-pointer min-h-[220px]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center mb-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-2xl font-light leading-none"
  }, "+")), /*#__PURE__*/React.createElement("p", {
    className: "text-[12.5px] font-extrabold tracking-tight"
  }, "Afegir un nou Lloc"), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] font-medium mt-0.5 opacity-70"
  }, "Enganxa la teva URL i comencem")))));
}

/* ────────────────────────────────────────────────────────────────────────── *
 * TAB 2 — Articles (PostsManager)
 * ────────────────────────────────────────────────────────────────────────── */
function TabArticles() {
  const rows = [{
    title: "L'art de plegar l'or",
    cat: 'Procés',
    status: 'esborrany',
    lang: ['CA', 'ES'],
    date: '21 maig',
    views: '—'
  }, {
    title: 'Les mans abans dels ulls',
    cat: 'Editorial',
    status: 'publicat',
    lang: ['CA', 'ES', 'EN'],
    date: '14 maig',
    views: '1.2k'
  }, {
    title: 'Cinc errors quan plegues a casa',
    cat: 'Guies',
    status: 'publicat',
    lang: ['CA', 'ES'],
    date: '7 maig',
    views: '842'
  }, {
    title: 'Una conversa amb la Mestra Argilaga',
    cat: 'Convidats',
    status: 'programat',
    lang: ['CA'],
    date: '2 juny',
    views: '—'
  }, {
    title: 'Què és la pell vella?',
    cat: 'Materials',
    status: 'publicat',
    lang: ['CA', 'EN'],
    date: '23 abr.',
    views: '584'
  }, {
    title: 'El batafull de 800g',
    cat: 'Eines',
    status: 'esborrany',
    lang: ['CA'],
    date: '20 abr.',
    views: '—'
  }];
  const statusStyle = {
    publicat: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
      label: 'PUBLICAT',
      dot: 'bg-green-500'
    },
    esborrany: {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      label: 'ESBORRANY',
      dot: 'bg-amber-400'
    },
    programat: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      label: 'PROGRAMAT',
      dot: 'bg-blue-500'
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "grid lg:grid-cols-[240px_1fr]"
  }, /*#__PURE__*/React.createElement(CarmaSidebar, {
    activeSite: "la teva marca"
  }), /*#__PURE__*/React.createElement("div", {
    className: "bg-white min-h-[560px]"
  }, /*#__PURE__*/React.createElement(SiteTabs, {
    active: "articles"
  }), /*#__PURE__*/React.createElement("div", {
    className: "p-6 sm:p-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-4 mb-5 flex-wrap"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-extrabold tracking-[-0.02em] text-ink"
  }, "Articles"), /*#__PURE__*/React.createElement("p", {
    className: "text-[12px] font-medium text-neutral-500 mt-0.5"
  }, "24 articles \xB7 22 publicats \xB7 2 esborranys")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 w-72"
  }, /*#__PURE__*/React.createElement(Search, {
    className: "w-3.5 h-3.5 text-neutral-400"
  }), /*#__PURE__*/React.createElement("input", {
    className: "bg-transparent outline-none text-[12px] font-medium flex-1 placeholder:text-neutral-400",
    placeholder: "Cerca per t\xEDtol o categoria\u2026"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[9.5px] font-mono text-neutral-300 px-1 py-0.5 rounded bg-white border border-neutral-200"
  }, "\u2318K")), /*#__PURE__*/React.createElement("button", {
    className: "bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white px-3.5 py-2 rounded-xl text-[12px] font-extrabold inline-flex items-center gap-1.5 shadow-[0_6px_18px_-6px_rgba(212,175,55,0.4)]"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-base leading-none"
  }, "+"), " Nou article"))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mb-5 overflow-x-auto no-scrollbar"
  }, /*#__PURE__*/React.createElement(FilterPill, {
    active: true
  }, "Tots ", /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-400"
  }, "\xB7 24")), /*#__PURE__*/React.createElement(FilterPill, null, "Publicat ", /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-400"
  }, "\xB7 22")), /*#__PURE__*/React.createElement(FilterPill, null, "Esborrany ", /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-400"
  }, "\xB7 2")), /*#__PURE__*/React.createElement(FilterPill, null, "Programat ", /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-400"
  }, "\xB7 1")), /*#__PURE__*/React.createElement("span", {
    className: "w-px h-5 bg-neutral-200 mx-1"
  }), /*#__PURE__*/React.createElement(FilterPill, null, "Tots els idiomes ", /*#__PURE__*/React.createElement(ChevronRight, {
    className: "w-3 h-3 rotate-90 inline ml-0.5"
  })), /*#__PURE__*/React.createElement(FilterPill, null, "Per data ", /*#__PURE__*/React.createElement(ChevronRight, {
    className: "w-3 h-3 rotate-90 inline ml-0.5"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl border border-neutral-200/70 overflow-hidden bg-white"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[1fr_120px_120px_110px_80px_40px] gap-3 px-4 py-2.5 bg-[#fbfaf7] border-b border-neutral-100 text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-neutral-400"
  }, /*#__PURE__*/React.createElement("span", null, "T\xEDtol"), /*#__PURE__*/React.createElement("span", null, "Categoria"), /*#__PURE__*/React.createElement("span", null, "Idiomes"), /*#__PURE__*/React.createElement("span", null, "Estat"), /*#__PURE__*/React.createElement("span", null, "Vistes"), /*#__PURE__*/React.createElement("span", null)), rows.map((r, i) => {
    const st = statusStyle[r.status];
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: `grid grid-cols-[1fr_120px_120px_110px_80px_40px] gap-3 px-4 py-3 items-center text-[12.5px] ${i < rows.length - 1 ? 'border-b border-neutral-100' : ''} hover:bg-neutral-50/60 transition-colors`
    }, /*#__PURE__*/React.createElement("div", {
      className: "min-w-0"
    }, /*#__PURE__*/React.createElement("div", {
      className: "font-extrabold text-ink truncate"
    }, r.title), /*#__PURE__*/React.createElement("div", {
      className: "text-[10.5px] font-bold text-neutral-400 mt-0.5"
    }, r.date)), /*#__PURE__*/React.createElement("span", {
      className: "text-[11.5px] font-bold text-neutral-500"
    }, r.cat), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-0.5"
    }, r.lang.map(l => /*#__PURE__*/React.createElement("span", {
      key: l,
      className: "px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-neutral-100 text-neutral-600 border border-neutral-200"
    }, l))), /*#__PURE__*/React.createElement("span", {
      className: `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9.5px] font-extrabold uppercase tracking-wider w-fit ${st.bg} ${st.text} border ${st.border}`
    }, /*#__PURE__*/React.createElement("span", {
      className: `w-1.5 h-1.5 rounded-full ${st.dot}`
    }), st.label), /*#__PURE__*/React.createElement("span", {
      className: "text-[11.5px] font-bold text-neutral-500"
    }, r.views), /*#__PURE__*/React.createElement("button", {
      className: "w-7 h-7 rounded-md hover:bg-neutral-100 flex items-center justify-center text-neutral-400"
    }, /*#__PURE__*/React.createElement(MoreVertical, {
      className: "w-3.5 h-3.5"
    })));
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mt-4 text-[11px] font-bold text-neutral-400"
  }, /*#__PURE__*/React.createElement("span", null, "P\xE0gina 1 de 4 \xB7 24 articles"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1"
  }, /*#__PURE__*/React.createElement("button", {
    className: "w-7 h-7 rounded-md border border-neutral-200 text-neutral-300 cursor-not-allowed"
  }, "\u2039"), /*#__PURE__*/React.createElement("button", {
    className: "w-7 h-7 rounded-md bg-ink text-white text-[11px] font-extrabold"
  }, "1"), /*#__PURE__*/React.createElement("button", {
    className: "w-7 h-7 rounded-md text-neutral-500 hover:bg-neutral-50"
  }, "2"), /*#__PURE__*/React.createElement("button", {
    className: "w-7 h-7 rounded-md text-neutral-500 hover:bg-neutral-50"
  }, "3"), /*#__PURE__*/React.createElement("button", {
    className: "w-7 h-7 rounded-md text-neutral-500 hover:bg-neutral-50"
  }, "4"), /*#__PURE__*/React.createElement("button", {
    className: "w-7 h-7 rounded-md border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
  }, "\u203A"))))));
}

/* ────────────────────────────────────────────────────────────────────────── *
 * TAB 3 — Tema (visual editor)
 * ────────────────────────────────────────────────────────────────────────── */
function TabTema() {
  return /*#__PURE__*/React.createElement("div", {
    className: "grid lg:grid-cols-[240px_1fr]"
  }, /*#__PURE__*/React.createElement(CarmaSidebar, {
    activeSite: "la teva marca"
  }), /*#__PURE__*/React.createElement("div", {
    className: "bg-white min-h-[560px]"
  }, /*#__PURE__*/React.createElement(SiteTabs, {
    active: "tema"
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid lg:grid-cols-[300px_1fr] min-h-[520px]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "border-r border-neutral-100 p-5 bg-[#fbfaf7]/40 overflow-y-auto"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-5"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-400 mb-2"
  }, "Tema"), /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl bg-white border border-neutral-200 p-3 flex items-center gap-2.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-8 h-8 rounded-lg bg-gradient-to-br from-carma-200 to-carma-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[12.5px] font-extrabold text-ink"
  }, "la teva marca"), /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-bold text-neutral-400"
  }, "Clonat el 12 maig")), /*#__PURE__*/React.createElement("button", {
    className: "text-[10px] font-extrabold uppercase tracking-wider text-carma-700 px-2 py-1 rounded bg-carma-50 border border-carma-200/60 hover:bg-carma-100/80"
  }, "Recapturar"))), /*#__PURE__*/React.createElement(SectionLabel, null, "Colors"), /*#__PURE__*/React.createElement("div", {
    className: "mb-3.5 space-y-2.5"
  }, /*#__PURE__*/React.createElement(ColorRow, {
    label: "Fons",
    value: "#fafaf6"
  }), /*#__PURE__*/React.createElement(ColorRow, {
    label: "Text",
    value: "#1a2138"
  }), /*#__PURE__*/React.createElement(ColorRow, {
    label: "Accent",
    value: "#d4af37",
    star: true
  }), /*#__PURE__*/React.createElement(ColorRow, {
    label: "Apagat",
    value: "#5b8a72"
  })), /*#__PURE__*/React.createElement(SectionLabel, null, "Tipografia"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2 mb-3.5"
  }, /*#__PURE__*/React.createElement(TypeRow, {
    family: "Playfair Display",
    role: "Display"
  }), /*#__PURE__*/React.createElement(TypeRow, {
    family: "Inter",
    role: "Cos"
  })), /*#__PURE__*/React.createElement(SectionLabel, null, "Layout"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement(SliderRow, {
    label: "Radius",
    value: "60%"
  }), /*#__PURE__*/React.createElement(SliderRow, {
    label: "Densitat",
    value: "48%"
  }), /*#__PURE__*/React.createElement(SliderRow, {
    label: "Ombra",
    value: "32%"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mt-5 pt-4 border-t border-neutral-100 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "flex-1 px-3 py-2 rounded-xl bg-white border border-neutral-200 text-[11px] font-extrabold text-neutral-600 hover:bg-neutral-50"
  }, "Restaurar"), /*#__PURE__*/React.createElement("button", {
    className: "flex-1 px-3 py-2 rounded-xl bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white text-[11px] font-extrabold shadow-[0_6px_14px_-6px_rgba(212,175,55,0.4)]"
  }, "Desar tema"))), /*#__PURE__*/React.createElement("div", {
    className: "relative bg-[#F4F2EE] p-6 sm:p-8 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-4"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-400"
  }, "Previsualitzaci\xF3"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-0.5 p-0.5 bg-white rounded-lg border border-neutral-200"
  }, /*#__PURE__*/React.createElement("button", {
    className: "w-6 h-6 rounded-md bg-ink text-white flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(MonitorIcon, null)), /*#__PURE__*/React.createElement("button", {
    className: "w-6 h-6 rounded-md text-neutral-400 hover:bg-neutral-50 flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(TabletIcon, null)), /*#__PURE__*/React.createElement("button", {
    className: "w-6 h-6 rounded-md text-neutral-400 hover:bg-neutral-50 flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(PhoneIcon, null)))), /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl bg-white border border-neutral-200 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.20)] overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between px-5 py-3 border-b border-neutral-100",
    style: {
      background: '#fafaf6'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-5 h-5 rounded bg-gradient-to-br from-ink to-neutral-700 text-white text-[8px] font-extrabold flex items-center justify-center"
  }, "LM"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Georgia, serif'
    },
    className: "text-[12px] font-bold text-ink"
  }, "la teva marca")), /*#__PURE__*/React.createElement("nav", {
    className: "flex items-center gap-3 text-[10px] font-bold text-neutral-600",
    style: {
      fontFamily: 'Georgia, serif'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Botiga"), /*#__PURE__*/React.createElement("span", null, "Hist\xF2ria"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#d4af37'
    }
  }, "Diari"), /*#__PURE__*/React.createElement("span", null, "Contacte"))), /*#__PURE__*/React.createElement("div", {
    className: "p-6 sm:p-8",
    style: {
      background: '#fafaf6'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      color: '#d4af37'
    },
    className: "text-[9px] font-extrabold uppercase tracking-[0.18em] mb-3"
  }, "Diari \xB7 Proc\xE9s"), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'Georgia, serif',
      color: '#1a2138'
    },
    className: "text-[22px] font-bold leading-[1.15] mb-2"
  }, "L'art de plegar l'or"), /*#__PURE__*/React.createElement("p", {
    className: "text-[11.5px] text-neutral-500 leading-[1.7] mb-3"
  }, "La feina comen\xE7a a les sis del mat\xED, quan el taller encara fa olor a fred. El batafull ressona contra el banc i l'or, com sempre, escolta abans de cedir."), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-3 gap-1.5 my-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "aspect-[4/3] rounded-lg bg-gradient-to-br from-carma-100 to-carma-300"
  }), /*#__PURE__*/React.createElement("div", {
    className: "aspect-[4/3] rounded-lg bg-gradient-to-br from-neutral-200 to-neutral-300"
  }), /*#__PURE__*/React.createElement("div", {
    className: "aspect-[4/3] rounded-lg bg-gradient-to-br from-carma-50 to-carma-200"
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      background: '#d4af37',
      color: '#1a2138'
    },
    className: "px-3 py-1.5 rounded-md text-[10px] font-extrabold"
  }, "Llegir m\xE9s \u2192"))), /*#__PURE__*/React.createElement("div", {
    className: "mt-4 flex items-center justify-center gap-2 text-[10px] font-bold text-neutral-400"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
  }), "Canvis aplicats en temps real")))));
}

/* ────────────────────────────────────────────────────────────────────────── *
 * TAB 4 — Connexió (API key + embed)
 * ────────────────────────────────────────────────────────────────────────── */
function TabConnexio() {
  return /*#__PURE__*/React.createElement("div", {
    className: "grid lg:grid-cols-[240px_1fr]"
  }, /*#__PURE__*/React.createElement(CarmaSidebar, {
    activeSite: "la teva marca"
  }), /*#__PURE__*/React.createElement("div", {
    className: "bg-white min-h-[560px]"
  }, /*#__PURE__*/React.createElement(SiteTabs, {
    active: "connexio"
  }), /*#__PURE__*/React.createElement("div", {
    className: "p-6 sm:p-8 grid lg:grid-cols-2 gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl border border-neutral-200/70 p-5 bg-white"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mb-4"
  }, /*#__PURE__*/React.createElement(KeyIcon, {
    className: "w-4 h-4 text-carma-600"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "text-[14px] font-extrabold text-ink"
  }, "Clau API"), /*#__PURE__*/React.createElement("span", {
    className: "ml-auto text-[9.5px] font-extrabold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded"
  }, "ACTIVA")), /*#__PURE__*/React.createElement("p", {
    className: "text-[12px] text-neutral-500 font-medium mb-3 leading-relaxed"
  }, "Aquesta clau permet llegir els articles publicats. Tracta-la com una contrasenya."), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-200"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[11.5px] text-neutral-700 flex-1 truncate"
  }, "crm_\u2022\u2022\u2022\u2022_\u2022\u2022\u2022\u2022_a3f9c2e1b8"), /*#__PURE__*/React.createElement("button", {
    className: "text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 hover:text-ink px-2 py-1 rounded hover:bg-white"
  }, "Veure"), /*#__PURE__*/React.createElement("button", {
    className: "text-[10px] font-extrabold uppercase tracking-wider text-carma-700 hover:text-carma-800 px-2 py-1 rounded hover:bg-carma-50"
  }, "Copiar")), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "px-3 py-2 rounded-lg text-[11px] font-extrabold bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
  }, "Regenerar"), /*#__PURE__*/React.createElement("span", {
    className: "text-[10.5px] font-bold text-neutral-400"
  }, "Creada el 12 maig 2026"))), /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl border border-neutral-200/70 p-5 bg-white"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mb-4"
  }, /*#__PURE__*/React.createElement(Plug, {
    className: "w-4 h-4 text-carma-600"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "text-[14px] font-extrabold text-ink"
  }, "Webhooks")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(WebhookRow, {
    url: "https://la-teva-marca.cat/api/revalidate",
    event: "post.published"
  }), /*#__PURE__*/React.createElement(WebhookRow, {
    url: "https://la-teva-marca.cat/api/revalidate",
    event: "post.updated"
  })), /*#__PURE__*/React.createElement("button", {
    className: "mt-3 text-[10.5px] font-extrabold text-carma-700 hover:underline"
  }, "+ Afegir webhook")), /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl border border-neutral-200/70 bg-white overflow-hidden lg:col-span-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between px-5 py-3 border-b border-neutral-100 bg-[#fbfaf7]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-500"
  }, "Integraci\xF3"), /*#__PURE__*/React.createElement("div", {
    className: "ml-2 flex items-center gap-0.5 p-0.5 rounded-lg bg-white border border-neutral-200"
  }, /*#__PURE__*/React.createElement("button", {
    className: "px-2.5 py-1 rounded-md bg-ink text-white text-[10.5px] font-extrabold"
  }, "Next.js"), /*#__PURE__*/React.createElement("button", {
    className: "px-2.5 py-1 rounded-md text-[10.5px] font-extrabold text-neutral-500"
  }, "React"), /*#__PURE__*/React.createElement("button", {
    className: "px-2.5 py-1 rounded-md text-[10.5px] font-extrabold text-neutral-500"
  }, "cURL"), /*#__PURE__*/React.createElement("button", {
    className: "px-2.5 py-1 rounded-md text-[10.5px] font-extrabold text-neutral-500"
  }, "Embed"))), /*#__PURE__*/React.createElement("button", {
    className: "text-[10.5px] font-extrabold uppercase tracking-wider text-carma-700 hover:text-carma-800 px-2 py-1 rounded hover:bg-carma-50"
  }, "Copiar")), /*#__PURE__*/React.createElement("pre", {
    className: "p-5 bg-[#0f0f0f] text-[12px] font-mono text-neutral-300 overflow-x-auto leading-relaxed"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-500"
  }, `// app/blog/[slug]/page.tsx — Next.js 16, RSC`), `
`, /*#__PURE__*/React.createElement("span", {
    className: "text-pink-300"
  }, "import"), ` { fetchPost } `, /*#__PURE__*/React.createElement("span", {
    className: "text-pink-300"
  }, "from"), ` `, /*#__PURE__*/React.createElement("span", {
    className: "text-amber-200"
  }, "'@carma/sdk'"), `

`, /*#__PURE__*/React.createElement("span", {
    className: "text-pink-300"
  }, "export default async function"), ` `, /*#__PURE__*/React.createElement("span", {
    className: "text-sky-300"
  }, "Page"), `({ params }) {`, `
  `, /*#__PURE__*/React.createElement("span", {
    className: "text-pink-300"
  }, "const"), ` post `, /*#__PURE__*/React.createElement("span", {
    className: "text-pink-300"
  }, "="), ` `, /*#__PURE__*/React.createElement("span", {
    className: "text-pink-300"
  }, "await"), ` `, /*#__PURE__*/React.createElement("span", {
    className: "text-sky-300"
  }, "fetchPost"), `({`, `
    site: `, /*#__PURE__*/React.createElement("span", {
    className: "text-amber-200"
  }, "'la-teva-marca'"), `,`, `
    slug: params.slug,`, `
    locale: `, /*#__PURE__*/React.createElement("span", {
    className: "text-amber-200"
  }, "'ca'"), `,`, `
  });`, `

  `, /*#__PURE__*/React.createElement("span", {
    className: "text-pink-300"
  }, "return"), ` <`, /*#__PURE__*/React.createElement("span", {
    className: "text-sky-300"
  }, "Article"), ` html={post.html} />;`, `
}`)))));
}

/* ────────────────────────────────────────────────────────────────────────── *
 * TAB 5 — Publicat (how it looks on the customer's blog)
 * ────────────────────────────────────────────────────────────────────────── */
function TabPublicat() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "px-6 sm:px-10 py-4 border-b border-neutral-100 flex items-center justify-between",
    style: {
      background: '#fafaf6'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-8 h-8 rounded-lg bg-gradient-to-br from-ink to-neutral-700 flex items-center justify-center text-white text-[12px] font-extrabold"
  }, "LM"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Georgia, serif'
    },
    className: "text-[15px] font-bold tracking-tight text-ink"
  }, "la teva marca")), /*#__PURE__*/React.createElement("nav", {
    className: "hidden md:flex items-center gap-7 text-[12.5px]",
    style: {
      fontFamily: 'Georgia, serif'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-600"
  }, "Botiga"), /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-600"
  }, "Hist\xF2ria"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#d4af37'
    },
    className: "font-bold"
  }, "Diari"), /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-600"
  }, "Contacte")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10.5px] font-bold text-neutral-500",
    style: {
      fontFamily: 'Georgia, serif'
    }
  }, "CA \xB7 ES \xB7 EN"), /*#__PURE__*/React.createElement("div", {
    className: "w-8 h-8 rounded-full bg-neutral-200"
  }))), /*#__PURE__*/React.createElement("article", {
    style: {
      background: '#fafaf6'
    },
    className: "px-6 sm:px-12 py-10 sm:py-14 min-h-[560px]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-[640px] mx-auto",
    style: {
      fontFamily: 'Georgia, serif'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-[10.5px] font-extrabold uppercase tracking-[0.18em] mb-4",
    style: {
      color: '#d4af37'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Diari"), /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-300"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    className: "text-neutral-500"
  }, "21 maig 2026 \xB7 5 min")), /*#__PURE__*/React.createElement("h1", {
    className: "text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-4",
    style: {
      color: '#1a2138'
    }
  }, "L'art de plegar l'or"), /*#__PURE__*/React.createElement("p", {
    className: "text-[18px] leading-[1.6] mb-7",
    style: {
      color: '#475569',
      fontStyle: 'italic'
    }
  }, "Apunts d'un ofici antic que es resisteix a desapar\xE8ixer."), /*#__PURE__*/React.createElement("div", {
    className: "aspect-[16/9] rounded-xl overflow-hidden my-6",
    style: {
      background: 'linear-gradient(135deg,#f7e4ac 0%,#d4af37 35%,#906d1c 65%,#b58f27 100%)',
      boxShadow: '0 12px 32px -12px rgba(0,0,0,0.18)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-full h-full",
    style: {
      background: 'radial-gradient(ellipse at 20% 30%,rgba(255,255,255,0.4),transparent 50%)'
    }
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-[17px] leading-[1.85] mb-4",
    style: {
      color: '#374151'
    }
  }, "La feina comen\xE7a a les sis del mat\xED, quan el taller encara fa olor a fred. El batafull ressona contra el banc i l'or, com sempre, escolta abans de cedir. La pell percep el primer signe; els ulls, sempre, arriben tard."), /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-bold tracking-tight mt-8 mb-3",
    style: {
      color: '#1a2138'
    }
  }, "El batafull i la respiraci\xF3"), /*#__PURE__*/React.createElement("p", {
    className: "text-[17px] leading-[1.85] mb-4",
    style: {
      color: '#374151'
    }
  }, "Un detall poc explicat de l'ofici: la respiraci\xF3 mana sobre el batafull. Si inspires al cop, la l\xE0mina s'esquin\xE7a."), /*#__PURE__*/React.createElement("blockquote", {
    className: "my-7 pl-5 py-1",
    style: {
      borderLeft: '3px solid #d4af37'
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[19px] leading-[1.55] mb-1.5",
    style: {
      color: '#475569',
      fontStyle: 'italic'
    }
  }, "\xABCada pe\xE7a \xE9s un acte privat de paci\xE8ncia.\xBB"), /*#__PURE__*/React.createElement("cite", {
    className: "text-[12px] font-bold not-italic",
    style: {
      color: '#94a3b8'
    }
  }, "\u2014 Mestra Argilaga"))), /*#__PURE__*/React.createElement("div", {
    className: "max-w-[640px] mx-auto mt-10 pt-6 border-t flex items-center justify-between text-[10.5px] font-bold",
    style: {
      borderColor: '#e7e4dc',
      color: '#94a3b8'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Compartir aquest apunt"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-1.5"
  }, "Servit per ", /*#__PURE__*/React.createElement("span", {
    className: "font-extrabold text-ink"
  }, "Carma", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#d4af37'
    }
  }, "."))))));
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Shared bits
 * ────────────────────────────────────────────────────────────────────────── */
function SiteTabs({
  active
}) {
  const tabs = [{
    id: 'articles',
    label: 'Articles'
  }, {
    id: 'tema',
    label: 'Tema'
  }, {
    id: 'connexio',
    label: 'Connexió'
  }, {
    id: 'usuaris',
    label: 'Usuaris',
    locked: true
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-4 px-6 sm:px-8 pt-5 pb-0 border-b border-neutral-100 bg-white"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-400 mb-1"
  }, "la teva marca \xB7 Lloc"), /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-extrabold tracking-[-0.02em] text-ink"
  }, "Configuraci\xF3 del Lloc")), /*#__PURE__*/React.createElement("nav", {
    className: "flex items-center gap-0 -mb-px overflow-x-auto no-scrollbar"
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    className: `px-4 py-3 text-[12.5px] font-extrabold tracking-tight border-b-2 whitespace-nowrap transition-colors ${t.id === active ? 'border-carma-500 text-ink' : 'border-transparent text-neutral-500 hover:text-ink'} ${t.locked ? 'opacity-50' : ''}`
  }, t.label, t.locked && /*#__PURE__*/React.createElement(Lock, {
    className: "w-3 h-3 inline ml-1.5 -mt-0.5"
  })))));
}
function FilterPill({
  children,
  active
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: `px-3 py-1.5 rounded-full text-[11.5px] font-extrabold whitespace-nowrap transition-colors ${active ? 'bg-ink text-white shadow-[0_4px_10px_-4px_rgba(0,0,0,0.3)]' : 'bg-white border border-neutral-200 text-neutral-500 hover:text-ink hover:border-neutral-300'}`
  }, children);
}
function SectionLabel({
  children
}) {
  return /*#__PURE__*/React.createElement("p", {
    className: "text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-neutral-400 mb-2"
  }, children);
}
function ColorRow({
  label,
  value,
  star
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-7 h-7 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] border border-black/5",
    style: {
      background: value
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[11.5px] font-extrabold text-ink flex items-center gap-1.5"
  }, label, " ", star && /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] text-carma-700"
  }, "\u2605")), /*#__PURE__*/React.createElement("div", {
    className: "font-mono text-[10px] text-neutral-400"
  }, value)));
}
function TypeRow({
  family,
  role
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "px-2.5 py-2 rounded-lg bg-white border border-neutral-200 flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "text-[11.5px] font-extrabold text-ink"
  }, family), /*#__PURE__*/React.createElement("div", {
    className: "text-[9.5px] font-extrabold uppercase tracking-wider text-neutral-400"
  }, role)), /*#__PURE__*/React.createElement("button", {
    className: "text-[9.5px] font-extrabold text-carma-700 hover:underline"
  }, "Canviar"));
}
function SliderRow({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-1.5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-neutral-500"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-mono text-neutral-400"
  }, value)), /*#__PURE__*/React.createElement("div", {
    className: "relative h-1.5 rounded-full bg-neutral-200"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-carma-400 to-carma-600",
    style: {
      width: value
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute -top-1 h-3.5 w-3.5 rounded-full bg-white border border-carma-300 shadow-[0_2px_6px_rgba(0,0,0,0.15)]",
    style: {
      left: `calc(${value} - 7px)`
    }
  })));
}
function WebhookRow({
  url,
  event
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2.5 px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-100"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"
  }), /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[10.5px] text-neutral-600 truncate flex-1 min-w-0"
  }, url), /*#__PURE__*/React.createElement("span", {
    className: "text-[9.5px] font-extrabold uppercase tracking-wider text-carma-700 bg-carma-50 border border-carma-200/60 px-1.5 py-0.5 rounded shrink-0"
  }, event));
}

/* ── local icons ── */
function Search({
  className = "w-4 h-4"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.3-4.3"
  }));
}
function MoreVertical({
  className = "w-4 h-4"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "5",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "19",
    r: "1"
  }));
}
function MonitorIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "w-3.5 h-3.5"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "3",
    width: "20",
    height: "14",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 21h8M12 17v4"
  }));
}
function TabletIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "w-3.5 h-3.5"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "5",
    y: "2",
    width: "14",
    height: "20",
    rx: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "18",
    r: "0.5",
    fill: "currentColor"
  }));
}
function PhoneIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "w-3.5 h-3.5"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "7",
    y: "2",
    width: "10",
    height: "20",
    rx: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "18",
    r: "0.5",
    fill: "currentColor"
  }));
}
function KeyIcon({
  className = "w-4 h-4"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "7.5",
    cy: "15.5",
    r: "3.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m10 13 8.5-8.5M15 8l3 3M11 12l3 3"
  }));
}
Object.assign(window, {
  ProductTour,
  TabPanell,
  TabArticles,
  TabTema,
  TabConnexio,
  TabPublicat
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "product-tour.jsx", error: String((e && e.message) || e) }); }

})();

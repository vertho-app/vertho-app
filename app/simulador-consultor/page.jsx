'use client';

import React, { useState, useMemo, useEffect } from "react";
import {
  LayoutGrid, Building2, Users, FileText, Palette, CreditCard,
  Plus, Search, ChevronLeft, TrendingUp, AlertTriangle, Upload,
  X, Check, ArrowUpRight, Bell, Globe, Sparkles, BarChart3, Shield,
  Target, ClipboardList, Layers, Film, Mic, CalendarDays, Activity,
  Route, GraduationCap, PlayCircle, Wand2, Clock, Headphones, Video,
  Briefcase, BookOpen, ListChecks, Vote, Send, Star, Gauge, Award,
  MessageSquare, CheckCircle2, Flag, Brain, Inbox, SearchX, UserPlus,
  Lock, ArrowRight, ChevronRight, Circle,
} from "lucide-react";
import {
  UIStyles, Button, IconButton, Card, Badge, Meter, KpiCard,
  Skeleton, SkeletonText, EmptyState, VisuallyHidden,
  Dialog, TextField, SelectField,
} from "./ui";

/* ------------------------------------------------------------------ *
 * Simulador — App do Consultor (parceiro white-label)                 *
 * Fundação visual: design system do produto (navy/cyan), com o ACENTO *
 * dirigido pela MARCA DO PARCEIRO. Vertho não aparece em lugar nenhum. *
 * Troque a marca no topo pra ver o white-label re-skinando ao vivo.    *
 * ------------------------------------------------------------------ */

const PARTNERS = {
  aurora: {
    nome: "Consultoria Aurora",
    sigla: "A",
    accent: "#F2A65A",
    accent2: "#EC6A5C",
    dominio: "app.consultoria-aurora.com.br",
    subtitle: "Inteligência de pessoas para escolas e empresas",
  },
  nexo: {
    nome: "Nexo Pessoas",
    sigla: "N",
    accent: "#34D399",
    accent2: "#22A3C4",
    dominio: "portal.nexopessoas.com",
    subtitle: "Decisões sobre gente, com evidência",
  },
};

const SEED = [
  {
    id: "c1", nome: "Colégio Horizonte", setor: "Educação · K-12", inicial: "H",
    evolucao: 72, status: "saudavel", passo: 16,
    comp: [["Comunicação", 3.1], ["Gestão de sala", 2.8], ["Feedback", 2.4], ["Planejamento", 3.0]],
    pessoas: [
      ["Marina Alves", "Coordenadora Pedagógica", "I", 3.2, "confirmada"],
      ["Rafael Lima", "Professor", "C", 2.6, "parcial"],
      ["Bianca Souza", "Professora", "S", 2.9, "confirmada"],
      ["Diego Martins", "Diretor", "D", 3.4, "confirmada"],
    ],
  },
  {
    id: "c2", nome: "Rede Aprende+", setor: "Educação · Rede municipal", inicial: "R",
    evolucao: 58, status: "atencao", passo: 6,
    comp: [["Liderança", 2.5], ["Mediação", 2.2], ["Dados", 2.0], ["Acolhimento", 3.1]],
    pessoas: [
      ["Patrícia Gomes", "Gestora Escolar", "D", 2.7, "parcial"],
      ["Lucas Pereira", "Coordenador", "I", 2.3, "estagnacao"],
      ["Aline Costa", "Professora", "S", 2.9, "confirmada"],
    ],
  },
  {
    id: "c3", nome: "TechNova Software", setor: "Corporativo · Tecnologia", inicial: "T",
    evolucao: 81, status: "saudavel", passo: 18,
    comp: [["Colaboração", 3.3], ["Autonomia", 3.0], ["Comunicação", 2.9], ["Liderança", 2.6]],
    pessoas: [
      ["Camila Rocha", "Tech Lead", "C", 3.1, "confirmada"],
      ["Bruno Dias", "PM", "I", 2.8, "parcial"],
      ["Felipe Nunes", "Engenheiro", "D", 3.5, "confirmada"],
    ],
  },
  {
    id: "c4", nome: "Indústria Forte", setor: "Corporativo · Manufatura", inicial: "F",
    evolucao: 44, status: "critico", passo: 0,
    comp: [["Segurança", 2.1], ["Liderança", 1.9], ["Comunicação", 2.0], ["Processos", 2.4]],
    pessoas: [
      ["João Batista", "Supervisor", "D", 2.0, "estagnacao"],
      ["Sandra Reis", "Líder de turno", "S", 2.3, "parcial"],
    ],
  },
];

const STATUS = {
  saudavel: { label: "Saudável", color: "#2ECC71" },
  atencao: { label: "Atenção", color: "#F4B740" },
  critico: { label: "Crítico", color: "#E74C3C" },
};
const EVOL = {
  confirmada: { label: "Evolução confirmada", color: "#2ECC71" },
  parcial: { label: "Parcial", color: "#F4B740" },
  estagnacao: { label: "Estagnação", color: "#E74C3C" },
};
const DISC = { D: "#EC6A5C", I: "#F4B740", S: "#34D399", C: "#5BA8F2" };
const STATUS_TONE = { saudavel: "success", atencao: "warning", critico: "danger" };
const EVOL_TONE = { confirmada: "success", parcial: "warning", estagnacao: "danger" };

// A jornada em 5 ETAPAS (macro) compostas por PASSOS reais (a checklist guiada).
const STAGES = [
  { n: 1, key: "configurar", titulo: "Montar a equipe", icon: Users },
  { n: 2, key: "diagnosticar", titulo: "Descobrir o foco", icon: Target },
  { n: 3, key: "planejar", titulo: "Montar a trilha", icon: Route },
  { n: 4, key: "desenvolver", titulo: "Acompanhar", icon: GraduationCap },
  { n: 5, key: "resultados", titulo: "Mostrar resultados", icon: BarChart3 },
];

// Quem executa cada passo — deixa óbvio se o consultor age ou só aguarda.
const QUEM = {
  voce:   { label: "você faz", tone: "accent" },
  equipe: { label: "a equipe", tone: "info" },
  ia:     { label: "a IA faz", tone: "#9E4EDD" },
};

// TODOS os passos da jornada, em ordem. `detalhe` explica em 1 frase; `opcional` não bloqueia.
const TASKS = [
  { stage: 1, key: "equipe",      label: "Cadastrar a equipe",            quem: "voce",   tempo: "~5 min", detalhe: "Adicione as pessoas e seus cargos." },
  { stage: 1, key: "cargos",      label: "Definir cargos e competências", quem: "voce",   tempo: "~5 min", detalhe: "Importe ou ajuste as competências de cada cargo." },
  { stage: 1, key: "materiais",   label: "Subir materiais da empresa",    quem: "voce",   opcional: true,  detalhe: "PPP, valores e manuais deixam a IA mais precisa." },
  { stage: 1, key: "preferencias", label: "Preferências de aprendizagem",  quem: "equipe", opcional: true,  detalhe: "Cada pessoa ranqueia os formatos que prefere (vídeo, texto, áudio, case)." },
  { stage: 2, key: "prioridades", label: "Gerar prioridades por cargo",   quem: "ia",     tempo: "~1 min", detalhe: "A IA sugere as 10 competências mais relevantes." },
  { stage: 2, key: "votacao",     label: "Abrir votação da equipe",       quem: "equipe", detalhe: "Cada pessoa vota nas competências do próprio cargo." },
  { stage: 2, key: "top5",        label: "Validar o Top 5",               quem: "voce",   tempo: "~3 min", detalhe: "Você confirma as 5 competências finais por cargo." },
  { stage: 2, key: "diagnostico", label: "Gerar o diagnóstico",           quem: "ia",     tempo: "~2 min", detalhe: "A IA cria os cenários e valida a qualidade." },
  { stage: 2, key: "envios",      label: "Enviar para a equipe",          quem: "voce",   tempo: "~1 min", detalhe: "Dispara o diagnóstico por WhatsApp ou e-mail." },
  { stage: 2, key: "respostas",   label: "Coletar as respostas",          quem: "equipe", detalhe: "A equipe responde os cenários do diagnóstico." },
  { stage: 2, key: "mapeamento",  label: "Mapeamento comportamental (DISC)", quem: "equipe", detalhe: "Cada pessoa faz o mapeamento de perfil (vídeo + questionário) — gera o DISC do time." },
  { stage: 3, key: "avaliar",     label: "Avaliar as respostas",          quem: "ia",     tempo: "~2 min", detalhe: "A IA pontua cada competência e valida." },
  { stage: 3, key: "foco",        label: "Definir o foco de cada um",     quem: "ia",     detalhe: "O sistema escolhe a competência âncora e a 2ª." },
  { stage: 3, key: "assessment",  label: "Avaliar o nível dos descritores", quem: "voce", tempo: "~5 min", detalhe: "Registre o nível inicial 1–4 de cada descritor da competência foco." },
  { stage: 3, key: "conteudos",   label: "Preparar os conteúdos",         quem: "voce",   detalhe: "Importe, gere ou use a biblioteca pronta de micro-conteúdos e módulos." },
  { stage: 3, key: "trilha",      label: "Gerar a trilha",                quem: "ia",     tempo: "~3 min", detalhe: "Conteúdos personalizados por cargo, perfil e contexto." },
  { stage: 3, key: "revisar",     label: "Revisar a trilha",              quem: "voce",   tempo: "~5 min", detalhe: "Confira e ajuste antes de liberar." },
  { stage: 3, key: "pdi",         label: "Gerar PDIs individuais",        quem: "voce",   opcional: true,  detalhe: "PDF de desenvolvimento por pessoa." },
  { stage: 4, key: "liberar",     label: "Liberar a trilha",              quem: "voce",   tempo: "~1 min", detalhe: "A equipe começa as 14 semanas de desenvolvimento." },
  { stage: 4, key: "acompanhar",  label: "Acompanhar o engajamento",      quem: "voce",   detalhe: "Veja quem está avançando ao longo das semanas." },
  { stage: 5, key: "final",       label: "Aplicar a avaliação final",     quem: "equipe", detalhe: "Um cenário final mede a evolução de cada pessoa." },
  { stage: 5, key: "relatorios",  label: "Gerar os relatórios",           quem: "voce",   tempo: "~1 min", detalhe: "RH, gestor, Evolution Report e DNA." },
  { stage: 5, key: "arquivar",    label: "Arquivar e iniciar novo ciclo", quem: "voce",   opcional: true,  detalhe: "Encerre o ciclo concluído e recomece com uma nova competência foco." },
];
const REQ = TASKS.filter((t) => !t.opcional);                       // backbone que avança a jornada
const firstIdxOfStage = (n) => REQ.findIndex((t) => t.stage === n);
const lastIdxOfStage = (n) => REQ.map((t, i) => (t.stage === n ? i : -1)).filter((i) => i >= 0).pop();
const stageNumOf = (passo) => (passo >= REQ.length ? 5 : REQ[passo].stage);
const stageStatus = (n, passo) => (passo > lastIdxOfStage(n) ? "done" : passo >= firstIdxOfStage(n) ? "current" : "locked");
const nextTaskOf = (c) => { const p = c.passo || 0; return p >= REQ.length ? null : REQ[p]; };

export default function App() {
  const [pkey, setPkey] = useState("aurora");
  const partner = PARTNERS[pkey];
  const [view, setView] = useState("portfolio");
  const [companies, setCompanies] = useState(SEED);
  const [selId, setSelId] = useState(null);
  const [addColab, setAddColab] = useState(false);
  const [novaEmp, setNovaEmp] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState({ accent: partner.accent, sigla: partner.sigla, nome: partner.nome, dominio: partner.dominio });

  // Carregamento simulado ao abrir uma empresa (mostra skeletons).
  useEffect(() => {
    if (view !== "empresa") return undefined;
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 550);
    return () => clearTimeout(t);
  }, [view, selId]);

  const sel = companies.find((c) => c.id === selId);
  const totalColab = useMemo(() => companies.reduce((a, c) => a + c.pessoas.length, 0), [companies]);
  const evolMedia = Math.round(companies.reduce((a, c) => a + c.evolucao, 0) / companies.length);
  const alertas = companies.filter((c) => c.status !== "saudavel");

  const accent = view === "marca" ? draft.accent : partner.accent;

  const theme = {
    "--accent": accent,
    "--accent2": partner.accent2,
    "--bg0": "#06172C", "--bg1": "#091D35", "--bg2": "#0F2B54",
    "--card": "#0c2039", "--line": "rgba(255,255,255,0.07)",
    "--ink": "#F3F7FB", "--dim": "rgba(243,247,251,0.62)", "--faint": "rgba(243,247,251,0.38)",
  };

  const NAV = [
    ["portfolio", "Portfólio", LayoutGrid],
    ["relatorios", "Relatórios", BarChart3],
    ["marca", "Marca", Palette],
    ["conta", "Conta & Uso", CreditCard],
  ];

  function openCompany(id) { setSelId(id); setView("empresa"); }
  function advanceCompany(id) {
    setCompanies((cs) => cs.map((c) => c.id === id ? { ...c, passo: Math.min(REQ.length, (c.passo || 0) + 1) } : c));
  }

  return (
    <div className="ds-root ds-shell" style={{ ...theme, background:
      "radial-gradient(1100px 560px at 88% -12%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%)," +
      "radial-gradient(820px 460px at -8% 28%, rgba(59,10,109,0.16), transparent 60%)," +
      "linear-gradient(180deg,var(--bg0) 0%,var(--bg1) 36%,var(--bg2) 100%)",
      color: "var(--ink)", fontFamily: "Inter, system-ui, sans-serif" }}>
      <UIStyles />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; }
        .nav-item { cursor:pointer; display:flex; align-items:center; gap:11px; padding:10px 13px;
          border-radius:11px; color:var(--dim); font-size:14px; font-weight:500; transition:.15s;
          border:none; background:transparent; font-family:inherit; width:100%; text-align:left; white-space:nowrap; }
        .nav-item:hover { color:var(--ink); background:rgba(255,255,255,0.04); }
        .nav-item.on { color:var(--bg0); background:var(--accent); font-weight:600; }
        .card { background:var(--card); border:1px solid var(--line); border-radius:16px; }
        .co-card { cursor:pointer; transition:.18s; }
        .co-card:hover { transform:translateY(-3px); border-color:color-mix(in srgb,var(--accent) 55%,var(--line)); }
        .btn { cursor:pointer; border:none; font-family:inherit; font-weight:600; border-radius:11px;
          display:inline-flex; align-items:center; gap:8px; transition:.15s; }
        .btn-primary { background:var(--accent); color:var(--bg0); padding:11px 18px; font-size:14px; }
        .btn-primary:hover { filter:brightness(1.06); }
        .btn-ghost { background:rgba(255,255,255,0.05); color:var(--ink); padding:10px 15px; font-size:14px;
          border:1px solid var(--line); }
        .btn-ghost:hover { background:rgba(255,255,255,0.09); }
        .chip { font-size:12px; font-weight:600; padding:4px 10px; border-radius:999px; display:inline-flex; align-items:center; gap:6px; }
        .row:hover { background:rgba(255,255,255,0.03); }
        input,select { font-family:inherit; }
        .fld { width:100%; background:rgba(255,255,255,0.05); border:1px solid var(--line);
          color:var(--ink); border-radius:10px; padding:10px 13px; font-size:14px; outline:none; }
        .fld:focus { border-color:var(--accent); }
        :focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
        @media (prefers-reduced-motion: reduce){ *{transition:none!important; transform:none!important;} }
        .bar { height:7px; border-radius:99px; background:rgba(255,255,255,0.08); overflow:hidden; }
        .tab { cursor:pointer; padding:9px 4px; font-size:14px; font-weight:600; color:var(--dim);
          border-bottom:2px solid transparent; }
        .tab.on { color:var(--ink); border-color:var(--accent); }
      `}</style>

      {/* SIDEBAR */}
      <nav className="ds-sidebar" aria-label="Navegação principal">
        <div className="ds-sidebar-brand">
          <BrandMark partner={partner} draft={view === "marca" ? draft : null} />
        </div>
        <div style={{ height: 14 }} aria-hidden="true" />
        {NAV.map(([k, label, Icon]) => (
          <button key={k} type="button" className={"nav-item" + (view === k ? " on" : "")}
            aria-current={view === k ? "page" : undefined} onClick={() => setView(k)}>
            <Icon size={17} aria-hidden="true" /> {label}
          </button>
        ))}
        <div className="ds-sidebar-foot" style={{ marginTop: "auto", fontSize: 12, color: "var(--faint)", display: "flex", gap: 7, alignItems: "center" }}>
          <Shield size={13} aria-hidden="true" /> Dados isolados por carteira
        </div>
      </nav>

      {/* MAIN */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* TOPBAR */}
        <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 28px",
          borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
          <form role="search" style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 360 }}
            onSubmit={(e) => e.preventDefault()}>
            <VisuallyHidden as="label" htmlFor="ds-search">Buscar empresa ou pessoa na carteira</VisuallyHidden>
            <Search size={15} aria-hidden="true" style={{ position: "absolute", left: 12, top: 11, color: "var(--faint)" }} />
            <input id="ds-search" className="fld" style={{ paddingLeft: 34 }} type="search"
              placeholder="Buscar empresa, pessoa…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </form>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            {/* demo control: white-label proof */}
            <div role="group" aria-label="Marca do parceiro (demo)" style={{ display: "flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--line)", borderRadius: 999, padding: "5px 6px 5px 12px" }}>
              <span aria-hidden="true" style={{ fontSize: 11, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".06em" }}>demo · marca</span>
              {Object.entries(PARTNERS).map(([k, p]) => (
                <button key={k} type="button" aria-pressed={pkey === k} aria-label={`Usar marca ${p.nome}`}
                  onClick={() => { setPkey(k); setDraft({ accent: p.accent, sigla: p.sigla, nome: p.nome, dominio: p.dominio }); }}
                  style={{ cursor: "pointer", border: "none", width: 26, height: 26, borderRadius: 999, background: p.accent,
                    color: "#06172C", fontWeight: 800, fontSize: 13, display: "grid", placeItems: "center",
                    outline: pkey === k ? "2px solid var(--ink)" : "none", outlineOffset: 1 }}>
                  {p.sigla}
                </button>
              ))}
            </div>
            <IconButton icon={Bell} label="Notificações" />
            <div aria-label="Conta: Rodrigo (consultor)" style={{ width: 34, height: 34, borderRadius: 999, background: "rgba(255,255,255,0.08)",
              display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>RC</div>
          </div>
        </header>

        <div style={{ padding: "30px 28px", overflow: "auto" }}>
          {view === "portfolio" && (
            <Portfolio companies={companies} totalColab={totalColab} evolMedia={evolMedia}
              alertas={alertas} onOpen={openCompany} onNova={() => setNovaEmp(true)} partner={partner} query={query} />
          )}
          {view === "empresa" && sel && (
            <Empresa c={sel} onBack={() => setView("portfolio")} onAddColab={() => setAddColab(true)}
              onAdvance={advanceCompany} loading={loading} />
          )}
          {view === "relatorios" && <RelatoriosPortfolio companies={companies} evolMedia={evolMedia} />}
          {view === "marca" && <Marca draft={draft} setDraft={setDraft} partner={partner} />}
          {view === "conta" && <Conta companies={companies} totalColab={totalColab} partner={partner} />}
        </div>
      </main>

      {addColab && <AddColabModal onClose={() => setAddColab(false)} onSave={(p) => {
        setCompanies((cs) => cs.map((c) => c.id === selId ? { ...c, pessoas: [...c.pessoas, p] } : c));
        setAddColab(false);
      }} />}
      {novaEmp && <NovaEmpresaModal onClose={() => setNovaEmp(false)} onSave={(e) => {
        setCompanies((cs) => [...cs, e]); setNovaEmp(false); openCompany(e.id);
      }} />}
    </div>
  );
}

function BrandMark({ partner, draft }) {
  const sigla = draft ? draft.sigla : partner.sigla;
  const nome = draft ? draft.nome : partner.nome;
  const accent = draft ? draft.accent : partner.accent;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: accent, color: "#06172C",
        display: "grid", placeItems: "center", fontWeight: 800, fontSize: 19, flexShrink: 0 }}>{sigla || "·"}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nome || "Sua marca"}</div>
        <div style={{ fontSize: 11, color: "var(--faint)" }}>Plataforma de pessoas</div>
      </div>
    </div>
  );
}

// Adapter: mantém a assinatura antiga, delega ao KpiCard acessível da lib.
function Kpi({ label, value, sub, Icon, loading }) {
  return <KpiCard label={label} value={value} sub={sub} icon={Icon} loading={loading} />;
}

function Portfolio({ companies, totalColab, evolMedia, alertas, onOpen, onNova, partner, query = "" }) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? companies.filter((c) =>
        c.nome.toLowerCase().includes(q) || c.setor.toLowerCase().includes(q) ||
        c.pessoas.some((p) => p[0].toLowerCase().includes(q)))
    : companies;
  const empty = companies.length === 0;
  const noResults = !empty && filtered.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>Carteira</div>
          <h1 className="serif" style={{ fontSize: 34, margin: "4px 0 0" }}>Seu portfólio de clientes</h1>
        </div>
        <Button variant="primary" icon={Plus} onClick={onNova}>Nova empresa</Button>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Kpi label="Empresas ativas" value={companies.length} sub="na sua carteira" Icon={Building2} />
        <Kpi label="Colaboradores" value={totalColab} sub="acompanhados" Icon={Users} />
        <Kpi label="Evolução média" value={(empty ? 0 : evolMedia) + "%"} sub="do portfólio" Icon={TrendingUp} />
        <Kpi label="Em atenção" value={alertas.length} sub="empresas com sinal" Icon={AlertTriangle} />
      </div>

      {empty ? (
        <Card>
          <EmptyState icon={Building2} title="Sua carteira está vazia"
            description="Cadastre a primeira empresa-cliente para começar a diagnosticar competências e montar trilhas."
            action={<Button variant="primary" icon={Plus} onClick={onNova}>Adicionar primeira empresa</Button>} />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 18, alignItems: "start" }} className="ds-grid-portfolio">
          <div>
            {noResults ? (
              <Card>
                <EmptyState icon={SearchX} compact title={`Nada encontrado para “${query}”`}
                  description="Tente outro nome de empresa, setor ou colaborador." />
              </Card>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 14 }}>
                {filtered.map((c) => {
                  const st = STATUS[c.status];
                  const sn = stageNumOf(c.passo || 0);
                  const SI = STAGES[sn - 1].icon;
                  const nt = nextTaskOf(c);
                  return (
                    <li key={c.id}>
                      <button type="button" className="card co-card" onClick={() => onOpen(c.id)}
                        aria-label={`Abrir ${c.nome} — etapa ${sn} de 5${nt ? `, próximo passo: ${nt.label}` : ", jornada concluída"}`}
                        style={{ width: "100%", textAlign: "left", padding: 18, cursor: "pointer", border: "1px solid var(--line)",
                          background: "var(--card)", color: "var(--ink)", font: "inherit", display: "block" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 11, background: "color-mix(in srgb,var(--accent) 18%,transparent)",
                            color: "var(--accent)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18 }}>{c.inicial}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{c.nome}</div>
                            <div style={{ fontSize: 12, color: "var(--faint)" }}>{c.setor}</div>
                          </div>
                        </div>
                        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "color-mix(in srgb,var(--accent) 9%,transparent)" }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--accent)" }}>{nt ? "Próximo passo" : "Concluído"}</div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                            {nt ? <SI size={14} aria-hidden="true" style={{ color: "var(--accent)", flexShrink: 0 }} /> : <CheckCircle2 size={14} aria-hidden="true" style={{ color: "#2ECC71", flexShrink: 0 }} />}
                            {nt ? nt.label : "Jornada concluída"}
                          </div>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <Meter label={`Etapa ${sn} de 5`} value={(c.passo || 0) / REQ.length * 100} showValue={false} tone={STATUS_TONE[c.status]} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                          <Badge tone={STATUS_TONE[c.status]} dot>{st.label}</Badge>
                          <span style={{ fontSize: 12, color: "var(--dim)", display: "flex", alignItems: "center", gap: 4 }}>
                            <Users size={13} aria-hidden="true" /> {c.pessoas.length}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Card as="section" aria-label="Empresas que precisam de atenção" pad={false} style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
              <Bell size={15} style={{ color: "var(--accent)" }} aria-hidden="true" /> Onde focar agora
            </div>
            <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 12 }}>As empresas que mais precisam de você — e o que fazer em cada uma.</div>
            {alertas.length === 0 ? (
              <EmptyState icon={CheckCircle2} compact title="Tudo sob controle" description="Nenhuma empresa em atenção agora." />
            ) : alertas.map((c) => {
              const nt = nextTaskOf(c);
              return (
                <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="row"
                  aria-label={`Abrir ${c.nome} — próximo passo: ${nt ? nt.label : "jornada concluída"}`}
                  style={{ width: "100%", textAlign: "left", cursor: "pointer", padding: "11px 10px", borderRadius: 10,
                    display: "flex", gap: 10, alignItems: "center", border: "none", background: "transparent", color: "inherit", font: "inherit" }}>
                  <AlertTriangle size={16} style={{ color: STATUS[c.status].color, flexShrink: 0 }} aria-hidden="true" />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{c.nome}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--faint)" }}>Próximo: {nt ? nt.label : "jornada concluída"}</span>
                  </span>
                  <ArrowRight size={15} style={{ color: "var(--dim)" }} aria-hidden="true" />
                </button>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}

function Empresa({ c, onBack, onAddColab, onAdvance, loading = false }) {
  const passo = Math.min(REQ.length, Math.max(0, c.passo || 0));
  const journeyDone = passo >= REQ.length;
  const curStage = stageNumOf(passo);
  const stepperCurrent = journeyDone ? 6 : curStage;
  const [sel, setSel] = useState(curStage);
  useEffect(() => { setSel(curStage); }, [curStage, c.id]);
  const status = stageStatus(sel, passo);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Button variant="ghost" icon={ChevronLeft} onClick={onBack} style={{ alignSelf: "flex-start" }}>Portfólio</Button>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div aria-hidden="true" style={{ width: 54, height: 54, borderRadius: 14, background: "color-mix(in srgb,var(--accent) 18%,transparent)",
          color: "var(--accent)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 24 }}>{c.inicial}</div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{c.nome}</h1>
          <div style={{ fontSize: 13, color: "var(--faint)" }}>{c.setor} · {c.pessoas.length} colaboradores</div>
        </div>
        <span style={{ marginLeft: "auto" }}><Badge tone={STATUS_TONE[c.status]} dot>{STATUS[c.status].label}</Badge></span>
      </div>

      {loading ? <EmpresaSkeleton /> : (
        <>
          <Meter value={passo / REQ.length * 100}
            label={journeyDone ? "Jornada concluída" : `Etapa ${curStage} de 5 · ${STAGES[curStage - 1].titulo}`}
            format={() => journeyDone ? "100%" : `passo ${passo + 1} de ${REQ.length}`} />
          <JourneyStepper current={stepperCurrent} sel={sel} onSelect={setSel} />

          {status === "locked" ? (
            <Card>
              <EmptyState icon={Lock} title="Ainda não disponível"
                description={`Conclua a etapa ${curStage} para liberar “${STAGES[sel - 1].titulo}”.`}
                action={<Button variant="primary" icon={ArrowRight} onClick={() => setSel(curStage)}>Ir para o passo atual</Button>} />
            </Card>
          ) : (
            <StageScreen c={c} stageN={sel} passo={passo} journeyDone={journeyDone}
              onAddColab={onAddColab} onAdvance={() => onAdvance(c.id)} />
          )}

          <Detalhes label="Pesquisa de clima (opcional)" icon={Activity}>
            <TabPulso c={c} />
          </Detalhes>
        </>
      )}
    </div>
  );
}

// Trilho das 5 etapas — sempre mostra ONDE o consultor está e o que vem depois.
function JourneyStepper({ current, sel, onSelect }) {
  return (
    <nav aria-label="Etapas da jornada do cliente" className="ds-stepper">
      {STAGES.map((s) => {
        const state = s.n < current ? "done" : s.n === current ? "current" : "locked";
        const locked = state === "locked";
        return (
          <button key={s.key} type="button" className={"ds-step" + (s.n === sel ? " on" : "")}
            disabled={locked} aria-current={s.n === current ? "step" : undefined} onClick={() => onSelect(s.n)}
            aria-label={`Etapa ${s.n} de 5: ${s.titulo}` + (state === "done" ? " (concluída)" : state === "current" ? " (você está aqui)" : " (bloqueada)")}>
            <span className={"ds-step__dot ds-step__dot--" + state} aria-hidden="true">
              {state === "done" ? <Check size={16} /> : locked ? <Lock size={13} /> : s.n}
            </span>
            <span className="ds-step__label">{s.titulo}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Tela de UMA etapa: o próximo passo em destaque + só o que importa agora.
function StageScreen({ c, stageN, passo, journeyDone, onAddColab, onAdvance }) {
  const status = stageStatus(stageN, passo);
  const task = REQ[passo];
  const isCurrent = status === "current" && !journeyDone;

  let hero = null;
  if (journeyDone && stageN === 5) {
    hero = <DoneHero />;
  } else if (isCurrent && task) {
    const noPeople = task.key === "equipe" && c.pessoas.length === 0;
    const ctaLabel = task.quem === "ia" ? "Gerar com a IA" : task.quem === "equipe" ? "Confirmar e avançar" : "Concluir e avançar";
    const cta = noPeople
      ? <Button variant="primary" icon={UserPlus} onClick={onAddColab}>Cadastrar colaborador</Button>
      : <Button variant="primary" icon={ArrowRight} onClick={onAdvance}>{ctaLabel}</Button>;
    const extra = task.key === "equipe" && !noPeople
      ? <Button variant="ghost" icon={Plus} onClick={onAddColab}>Adicionar mais</Button> : null;
    hero = <NextStep task={task} cta={cta} extra={extra} />;
  } else if (status === "done") {
    hero = <DoneBanner stage={STAGES[stageN - 1]} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {hero}
      <StageChecklist stageN={stageN} passo={passo} />
      <StageDetail c={c} stageN={stageN} onAddColab={onAddColab} />
    </div>
  );
}

// Celebração quando todos os passos foram concluídos.
function DoneHero() {
  return (
    <Card style={{ borderColor: "color-mix(in srgb,#2ECC71 40%,var(--line))",
      background: "color-mix(in srgb,#2ECC71 9%,var(--card))", padding: 24 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div aria-hidden="true" style={{ width: 50, height: 50, borderRadius: 14, flexShrink: 0,
          background: "#2ECC71", color: "#06231a", display: "grid", placeItems: "center" }}><Award size={26} /></div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Jornada concluída 🎉</h2>
          <p style={{ fontSize: 14, color: "var(--dim)", margin: 0 }}>Todos os passos foram concluídos. Os relatórios estão prontos para apresentar ao cliente.</p>
        </div>
      </div>
    </Card>
  );
}

// Checklist da etapa: mostra TODOS os passos dela, com status e quem faz cada um.
function StageChecklist({ stageN, passo }) {
  const tasks = TASKS.filter((t) => t.stage === stageN);
  const dotStyle = (bg, col, border) => ({ width: 26, height: 26, borderRadius: 999, flexShrink: 0,
    display: "grid", placeItems: "center", background: bg, color: col, border: border || "none" });
  return (
    <Card pad={false} style={{ padding: "6px 20px 12px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--faint)", padding: "12px 0 4px" }}>Passos desta etapa</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {tasks.map((t) => {
          const gi = t.opcional ? -1 : REQ.indexOf(t);
          const state = t.opcional ? "opcional" : gi < passo ? "done" : gi === passo ? "current" : "todo";
          const q = QUEM[t.quem];
          const bullet = state === "done"
            ? <span style={dotStyle("#2ECC71", "#06231a")}><Check size={15} aria-hidden="true" /></span>
            : state === "current"
              ? <span style={dotStyle("var(--accent)", "var(--bg0)")}><ArrowRight size={15} aria-hidden="true" /></span>
              : <span style={dotStyle("rgba(255,255,255,0.04)", "var(--faint)", "1.5px solid var(--line)")}><Circle size={9} aria-hidden="true" /></span>;
          return (
            <li key={t.key} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "11px 0", borderTop: "1px solid var(--line)" }}>
              {bullet}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: state === "current" ? 700 : 600, fontSize: 14, color: state === "todo" || state === "opcional" ? "var(--dim)" : "var(--ink)" }}>{t.label}</span>
                  {state === "current" && <Badge tone="accent">agora</Badge>}
                  {t.opcional && <Badge tone="neutral">opcional</Badge>}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 2 }}>{t.detalhe}</div>
              </div>
              <span style={{ flexShrink: 0 }}><Badge tone={q.tone}>{q.label}</Badge></span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// Detalhe avançado por etapa — progressive disclosure, fora do caminho principal.
function StageDetail({ c, stageN, onAddColab }) {
  if (stageN === 1) return (
    <Detalhes label="Ver equipe e cargos em detalhe">
      <ColaboradoresTable c={c} onAddColab={onAddColab} /><div style={{ height: 16 }} /><TabCargos c={c} />
    </Detalhes>
  );
  if (stageN === 2) return <Detalhes label="Ver o diagnóstico em detalhe"><TabDiagnostico c={c} /></Detalhes>;
  if (stageN === 3) return (
    <Detalhes label="Ver avaliação, conteúdo e trilha">
      <TabAvaliacao c={c} /><div style={{ height: 16 }} /><TabConteudo c={c} /><div style={{ height: 16 }} /><TabTrilha c={c} />
    </Detalhes>
  );
  if (stageN === 4) return <Detalhes label="Ver acompanhamento detalhado"><TabJornada c={c} /></Detalhes>;
  return <Detalhes label="Ver e gerar os relatórios"><RelatoriosGrid /></Detalhes>;
}

// Hero "PRÓXIMO PASSO" — o elemento mais visível e óbvio da tela.
// Hero "PRÓXIMO PASSO" — o passo atual da jornada, em destaque máximo.
function NextStep({ task, cta, extra }) {
  const Icon = STAGES[task.stage - 1].icon;
  const q = QUEM[task.quem];
  return (
    <Card style={{ borderColor: "color-mix(in srgb,var(--accent) 45%,var(--line))",
      background: "linear-gradient(180deg, color-mix(in srgb,var(--accent) 10%,var(--card)), var(--card))", padding: 26 }}>
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div aria-hidden="true" style={{ width: 50, height: 50, borderRadius: 14, flexShrink: 0,
          background: "var(--accent)", color: "var(--bg0)", display: "grid", placeItems: "center" }}>
          <Icon size={26} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent)" }}>Próximo passo</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 6px" }}>{task.label}</h2>
          <p style={{ fontSize: 14, color: "var(--dim)", margin: 0, lineHeight: 1.5 }}>{task.detalhe}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>{cta}{extra}</div>
          <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Badge tone={q.tone}>{q.label}</Badge>
            {task.tempo && <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Clock size={12} aria-hidden="true" /> {task.tempo}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function DoneBanner({ stage }) {
  return (
    <Card style={{ borderColor: "color-mix(in srgb,#2ECC71 40%,var(--line))",
      background: "color-mix(in srgb,#2ECC71 8%,var(--card))", padding: 20 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <CheckCircle2 size={24} style={{ color: "#2ECC71", flexShrink: 0 }} aria-hidden="true" />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{stage.titulo} — concluída</div>
          <div style={{ fontSize: 13, color: "var(--dim)" }}>Você pode revisar abaixo quando quiser.</div>
        </div>
      </div>
    </Card>
  );
}

// Disclosure acessível (native <details>) — esconde o avançado sem precisar treinar.
function Detalhes({ label = "Ver detalhes completos", icon: Icon = ChevronRight, children }) {
  return (
    <details className="ds-details">
      <summary><Icon size={15} aria-hidden="true" /> {label}</summary>
      <div style={{ marginTop: 14 }}>{children}</div>
    </details>
  );
}

// Tabela de colaboradores (reusada no detalhe da etapa "Montar a equipe").
function ColaboradoresTable({ c, onAddColab }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.pessoas.length} colaborador{c.pessoas.length === 1 ? "" : "es"}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="ghost" icon={Upload}>Importar CSV</Button>
          <Button variant="primary" icon={Plus} onClick={onAddColab}>Adicionar</Button>
        </div>
      </div>
      {c.pessoas.length === 0 ? (
        <EmptyState icon={UserPlus} title="Nenhum colaborador ainda"
          description="Adicione manualmente ou importe uma planilha para iniciar o diagnóstico."
          action={<Button variant="primary" icon={Plus} onClick={onAddColab}>Adicionar colaborador</Button>} />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 520 }}>
            <caption className="ds-sr-only">Colaboradores de {c.nome}: cargo, perfil DISC, nível médio e status de evolução</caption>
            <thead>
              <tr style={{ color: "var(--faint)", fontSize: 12, textAlign: "left" }}>
                {["Nome", "Cargo", "Perfil", "Nível médio", "Evolução"].map((h) => (
                  <th key={h} scope="col" style={{ padding: "12px 20px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.pessoas.map((p, i) => (
                <tr key={i} className="row" style={{ borderTop: "1px solid var(--line)" }}>
                  <th scope="row" style={{ padding: "13px 20px", fontWeight: 600, textAlign: "left" }}>{p[0]}</th>
                  <td style={{ padding: "13px 20px", color: "var(--dim)" }}>{p[1]}</td>
                  <td style={{ padding: "13px 20px" }}><Badge tone={DISC[p[2]]}>{p[2]}</Badge></td>
                  <td style={{ padding: "13px 20px", fontWeight: 600 }}>{p[3].toFixed(1)} <span style={{ color: "var(--faint)", fontWeight: 400 }}>/ 4</span></td>
                  <td style={{ padding: "13px 20px" }}><Badge tone={EVOL_TONE[p[4]]} dot>{EVOL[p[4]].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Cartões de relatório (etapa "Mostrar resultados").
function RelatoriosGrid() {
  const reports = [
    ["Relatório de RH", "Leitura organizacional consolidada, orientada a decisão.", true],
    ["Dossiê do Gestor", "Contexto pronto da equipe por gestor.", true],
    ["Plenária da empresa", "Documento do time inteiro, pronto pro board.", true],
    ["Evolution Report", "Comparativo pré→pós por descritor.", true],
    ["DNA · Retrato de Competências", "Mapa coletivo de competências por nível.", true],
    ["DNA · Perfil Organizacional DISC", "Radar/pizza dos perfis do time inteiro.", true],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
      {reports.map(([t, d, ready]) => (
        <Card key={t} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 18 }}>
          <FileText size={18} style={{ color: "var(--accent)" }} aria-hidden="true" />
          <div style={{ fontWeight: 700, fontSize: 14 }}>{t}</div>
          <div style={{ fontSize: 12.5, color: "var(--dim)", flex: 1, lineHeight: 1.5 }}>{d}</div>
          <Button variant={ready ? "ghost" : "primary"} size="sm" block>{ready ? "Ver PDF" : "Gerar"}</Button>
        </Card>
      ))}
    </div>
  );
}

// Skeleton mostrado enquanto a empresa "carrega" (placeholder acessível).
function EmpresaSkeleton() {
  return (
    <div className="ds-grid-2" aria-busy="true">
      <VisuallyHidden as="p" role="status">Carregando dados da empresa…</VisuallyHidden>
      <div className="card" style={{ padding: 22 }}><SkeletonText lines={5} /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card" style={{ padding: 22 }}><Skeleton width={120} height={40} /><div style={{ height: 10 }} /><SkeletonText lines={2} /></div>
        <div className="card" style={{ padding: 22 }}><SkeletonText lines={3} /></div>
      </div>
    </div>
  );
}

// ── helpers de UI das abas do analista ────────────────────────────────────
function TabHead({ title, sub, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", gap: 10 }}>{children}</div>
    </div>
  );
}
// Adapter: assinatura antiga (val/max/color) → Meter acessível da lib.
function SmallBar({ label, val, max = 4, color = "var(--accent)" }) {
  return (
    <Meter label={label} value={typeof val === "number" ? val : 0} max={max} tone={color}
      format={(v) => (max === 4 ? v.toFixed(1) : `${Math.round(v)}%`)} />
  );
}
const FMT = { Texto: FileText, PDF: FileText, Podcast: Headphones, Vídeo: Video, Cases: Layers, Roteiro: ClipboardList };

// Stepper genérico de etapas do pipeline (status: feito / atual / pendente)
function PipelineSteps({ steps }) {
  const SC = { feito: "#2ECC71", atual: "var(--accent)", pendente: "var(--faint)" };
  return (
    <div className="card" style={{ padding: 18, display: "flex", gap: 10, overflowX: "auto" }}>
      {steps.map((s, i) => {
        const I = s.Icon, col = SC[s.status];
        return (
          <React.Fragment key={s.label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, minWidth: 86, textAlign: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                background: s.status === "pendente" ? "rgba(255,255,255,0.04)" : "color-mix(in srgb," + col + " 18%,transparent)",
                color: col, display: "grid", placeItems: "center", border: s.status === "atual" ? "1.5px solid var(--accent)" : "1px solid var(--line)" }}>
                {s.status === "feito" ? <Check size={18} /> : <I size={18} />}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: s.status === "pendente" ? "var(--faint)" : "var(--ink)", lineHeight: 1.2 }}>{s.label}</div>
              {s.hint && <div style={{ fontSize: 10, color: "var(--faint)" }}>{s.hint}</div>}
            </div>
            {i < steps.length - 1 && <div style={{ alignSelf: "flex-start", marginTop: 19, color: "var(--faint)" }}>›</div>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// DIAGNÓSTICO (Fase 1 — Fit v2) — pipeline IA1→votação→Top5→IA2→IA3→Fit→Envios + respostas
function TabDiagnostico({ c }) {
  const respondido = c.pessoas.filter((p) => p[4] !== "estagnacao").length;
  const steps = [
    { label: "IA1 · Top 10", Icon: Sparkles, status: "feito", hint: "por cargo" },
    { label: "Votação", Icon: Vote, status: "feito", hint: "colab" },
    { label: "Validar Top 5", Icon: ListChecks, status: "feito" },
    { label: "IA2 · Gabarito", Icon: Wand2, status: "feito" },
    { label: "IA3 · Cenários", Icon: ClipboardList, status: "feito", hint: "+ check" },
    { label: "Fit v2", Icon: Gauge, status: "atual", hint: "DISC×comp" },
    { label: "Envios", Icon: Send, status: "pendente" },
    { label: "Mapeamento DISC", Icon: Brain, status: "pendente", hint: "equipe" },
  ];
  const cargos = [...new Set(c.pessoas.map((p) => p[1]))].slice(0, 4);
  const cenarios = c.comp.slice(0, 5).map(([comp], i) => [cargos[i % Math.max(1, cargos.length)] || "Gestão", comp]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabHead title="Diagnóstico · Fit v2 (Fase 1)" sub="Top 10 → votação → Top 5 → gabarito → cenários A → fit DISC×competência → envios.">
        <button className="btn btn-ghost"><Wand2 size={15} /> Rodar IA3 (cenários)</button>
        <button className="btn btn-primary"><Send size={16} /> Disparar envios</button>
      </TabHead>
      <PipelineSteps steps={steps} />
      <div className="ds-grid-2">
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 6 }}>Respostas do diagnóstico</div>
          <div className="serif" style={{ fontSize: 40 }}>{respondido}/{c.pessoas.length}</div>
          <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 12 }}>responderam os cenários · prazo D-7</div>
          <div className="bar"><div style={{ width: (c.pessoas.length ? respondido / c.pessoas.length * 100 : 0) + "%", height: "100%", background: "var(--accent)" }} /></div>
          <div style={{ marginTop: 18, fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 10 }}>Cenários A gerados (cargo × competência)</div>
          {cenarios.map(([cargo, comp], i) => (
            <div key={i} className="row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 8px", borderRadius: 9 }}>
              <ClipboardList size={15} style={{ color: "var(--accent)" }} />
              <span style={{ flex: 1, fontSize: 13 }}>{cargo} <span style={{ color: "var(--faint)" }}>×</span> {comp}</span>
              <span className="chip" style={{ background: "#2ECC7122", color: "#2ECC71" }}><Check size={12} /> validado</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 14 }}>Fit por competência (nível médio do time)</div>
          {c.comp.map(([nome, n]) => <SmallBar key={nome} label={nome} val={n} />)}
          <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 6 }}>Níveis 1–4 (Fundamentos → Maestria). DISC entra como hipótese contextual no fit, não rotula a pessoa.</div>
        </div>
      </div>
    </div>
  );
}

// CONTEÚDO — módulos-base (currículo) + formatos. Consultor = analista full: cria/extrai.
function TabConteudo({ c }) {
  const modulos = c.comp.map(([comp], i) => ({
    comp, trans: ["N1→N2", "N2→N3", "N1→N2", "N3→N4"][i % 4],
    fmts: [["Texto", "PDF", "Podcast", "Vídeo"], ["Texto", "PDF"], ["Texto", "Vídeo", "Cases"], ["Texto", "PDF", "Roteiro"]][i % 4],
    status: i === 0 ? "rascunho" : "publicado",
  }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabHead title="Conteúdo & currículo" sub="Módulos-Base (matéria-prima canônica) → formatos personalizados por DISC + PPP.">
        <button className="btn btn-ghost"><Upload size={15} /> Extrair de vídeo/material</button>
        <button className="btn btn-primary"><Plus size={16} /> Novo módulo</button>
      </TabHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 14 }}>
        {modulos.map((m, i) => (
          <div key={i} className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <GraduationCap size={18} style={{ color: "var(--accent)" }} />
              <span className="chip" style={{ background: m.status === "rascunho" ? "#F4B74022" : "#2ECC7122", color: m.status === "rascunho" ? "#F4B740" : "#2ECC71" }}>{m.status}</span>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{m.comp}</div>
              <div style={{ fontSize: 12, color: "var(--faint)" }}>Transição {m.trans}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {m.fmts.map((f) => { const I = FMT[f] || FileText; return (
                <span key={f} className="chip" style={{ background: "rgba(255,255,255,0.05)", color: "var(--dim)" }}><I size={12} /> {f}</span>
              ); })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 13, padding: "8px 0" }}>Editar</button>
              <button className="btn" style={{ flex: 1, justifyContent: "center", fontSize: 13, padding: "8px 0", background: "var(--accent)", color: "var(--bg0)" }}><Video size={14} /> Gerar vídeo</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// TRILHA / TEMPORADA — modo da engine + semanas geradas + disparo
function TabTrilha({ c }) {
  const semanas = Array.from({ length: 8 }, (_, i) => ({
    n: i + 1, comp: c.comp[i % c.comp.length][0],
    fmt: ["Vídeo + caso", "PDF + reflexão", "Podcast", "Cenário prático"][i % 4],
    status: i < 3 ? "entregue" : i < 5 ? "agendada" : "rascunho",
  }));
  const sc = { entregue: "#2ECC71", agendada: "#5BA8F2", rascunho: "#F4B740" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabHead title="Trilha da temporada" sub="Gerada pela engine a partir do diagnóstico + currículo. Personalizada por cargo, DISC e PPP.">
        <button className="btn btn-ghost"><Route size={15} /> Modo: Regular DUO</button>
        <button className="btn btn-primary"><Wand2 size={16} /> Gerar temporada</button>
      </TabHead>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {semanas.map((s) => (
          <div key={s.n} className="row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderTop: s.n > 1 ? "1px solid var(--line)" : "none" }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "color-mix(in srgb,var(--accent) 16%,transparent)", color: "var(--accent)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{s.n}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.comp}</div>
              <div style={{ fontSize: 12, color: "var(--faint)" }}>{s.fmt}</div>
            </div>
            <span className="chip" style={{ background: sc[s.status] + "22", color: sc[s.status] }}>{s.status}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" style={{ alignSelf: "flex-start" }}><PlayCircle size={16} /> Disparar para os colaboradores</button>
    </div>
  );
}

// PULSO — clima T0/T2 + sinais agregados (min-N) + NR-1
function TabPulso({ c }) {
  const sinais = [["Carga de trabalho", 62], ["Reconhecimento", 74], ["Clareza de papéis", 81], ["Segurança psicológica", 69]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabHead title="Pulso de clima" sub="Pesquisa T0/T2 + sinais agregados. Complementar à NR-1.">
        <button className="btn btn-primary"><Activity size={16} /> Disparar pulso</button>
      </TabHead>
      <div className="ds-grid-2">
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 14 }}>Taxa de resposta</div>
          <SmallBar label="T0 (início)" val={88} max={100} color="#5BA8F2" />
          <SmallBar label="T2 (pós-ciclo)" val={71} max={100} color="var(--accent)" />
          <div style={{ marginTop: 8 }}><span className="chip" style={{ background: "#2ECC7122", color: "#2ECC71" }}><Shield size={12} /> Complementa a NR-1</span></div>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 14 }}>Sinais agregados (mín. 7 respostas)</div>
          {sinais.map(([l, v]) => <SmallBar key={l} label={l} val={v} max={100} color={v < 65 ? "#F4B740" : "var(--accent)"} />)}
          <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 6 }}>Nunca expõe resposta individual.</div>
        </div>
      </div>
    </div>
  );
}

// CARGOS & COMPETÊNCIAS (Fase 0) — cargos + Top 5, competências/descritores n1-n4, RAG, preferências
function TabCargos({ c }) {
  const cargos = [...new Set(c.pessoas.map((p) => p[1]))];
  const top5 = c.comp.map(([n]) => n).slice(0, 5);
  const ragDocs = [
    ["Régua de competências n1–n4", "seed"], ["Modos de missão", "seed"],
    ["Política de privacidade & DISC", "seed"], ["Manual de avaliação", "seed"],
    ["PPP / valores da instituição", "upload"], ["Plano de cargos", "upload"],
  ];
  const prefs = [["Vídeo", 46], ["Texto / case", 28], ["Áudio / podcast", 18], ["PDF", 8]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabHead title="Cargos, competências & base (Fase 0)" sub="Cargos com Top 5, competências com descritores (régua n1–n4), base de conhecimento (RAG) e preferências.">
        <button className="btn btn-ghost"><Upload size={15} /> Importar CSV de competências</button>
        <button className="btn btn-primary"><Plus size={16} /> Novo cargo</button>
      </TabHead>
      <div className="ds-grid-2">
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 14 }}>
            <Briefcase size={15} style={{ color: "var(--accent)" }} /> Cargos da empresa
          </div>
          {cargos.map((cg) => {
            const n = c.pessoas.filter((p) => p[1] === cg).length;
            return (
              <div key={cg} style={{ padding: "11px 0", borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{cg}</span>
                  <span style={{ fontSize: 12, color: "var(--faint)" }}>{n} pessoa{n > 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {top5.map((t) => <span key={t} className="chip" style={{ background: "rgba(255,255,255,0.05)", color: "var(--dim)" }}><Star size={11} /> {t}</span>)}
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 12 }}>Top 5 = saída da votação validada (IA1 → votação → Top 5).</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: 22 }}>
            <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 14 }}>Competências & descritores</div>
            {c.comp.map(([nome, n], i) => (
              <div key={nome} className="row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 8px", borderRadius: 9 }}>
                <Target size={15} style={{ color: "var(--accent)" }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{nome}</span>
                <span style={{ fontSize: 12, color: "var(--faint)" }}>{4 + (i % 3)} descritores · n1–n4</span>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 6 }}>
              <BookOpen size={15} style={{ color: "var(--accent)" }} /> Base de conhecimento (RAG)
            </div>
            <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 12 }}>Indexada em FTS + embeddings — enriquece IA da empresa (tira-dúvidas, evidências, relatórios).</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {ragDocs.map(([d, kind]) => (
                <span key={d} className="chip" style={{ background: kind === "seed" ? "rgba(255,255,255,0.05)" : "color-mix(in srgb,var(--accent) 14%,transparent)", color: kind === "seed" ? "var(--dim)" : "var(--accent)" }}>
                  <FileText size={11} /> {d}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 13 }}><Sparkles size={14} /> Popular base inicial</button>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 13 }}><Upload size={14} /> Upload PDF/DOCX</button>
            </div>
          </div>
          <div className="card" style={{ padding: 22 }}>
            <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 14 }}>Preferências de aprendizagem (agregado)</div>
            {prefs.map(([l, v]) => <SmallBar key={l} label={l} val={v} max={100} />)}
            <div style={{ fontSize: 12, color: "var(--faint)" }}>Ranqueadas pelo colaborador — orientam o formato entregue na trilha.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// AVALIAÇÃO & PDI (Fase 2) — IA4 + competências foco + assessment de descritores + PDI
function TabAvaliacao({ c }) {
  const steps = [
    { label: "IA4 · Avaliar", Icon: Brain, status: "feito", hint: "+ check" },
    { label: "Comp. Foco", Icon: Target, status: "feito", hint: "âncora + 2ª" },
    { label: "Assessment", Icon: ListChecks, status: "atual", hint: "descritores" },
    { label: "Gerar PDI", Icon: FileText, status: "pendente" },
  ];
  const foco = ["N1→N2", "N2→N3", "N1→N3", "N2→N4"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabHead title="Avaliação & PDI (Fase 2)" sub="IA4 pontua 1–4 (dual-IA) → competência foco (Regular DUO: âncora + 2ª) → assessment de descritores → PDI.">
        <button className="btn btn-ghost"><Brain size={15} /> Rodar IA4</button>
        <button className="btn btn-primary"><FileText size={16} /> Gerar PDIs</button>
      </TabHead>
      <PipelineSteps steps={steps} />
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Competências foco por colaborador</div>
          <span className="chip" style={{ background: "color-mix(in srgb,var(--accent) 14%,transparent)", color: "var(--accent)" }}><Route size={12} /> Modo Regular DUO</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "var(--faint)", fontSize: 12, textAlign: "left" }}>
              {["Colaborador", "Cargo", "Âncora (menor fit × maior gap)", "2ª competência", "Transição", "Nível IA4"].map((h) => (
                <th key={h} style={{ padding: "12px 20px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.pessoas.map((p, i) => {
              const anc = c.comp[i % c.comp.length][0], seg = c.comp[(i + 1) % c.comp.length][0];
              return (
                <tr key={i} className="row" style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "13px 20px", fontWeight: 600 }}>{p[0]}</td>
                  <td style={{ padding: "13px 20px", color: "var(--dim)" }}>{p[1]}</td>
                  <td style={{ padding: "13px 20px" }}><span className="chip" style={{ background: "color-mix(in srgb,var(--accent) 16%,transparent)", color: "var(--accent)" }}><Target size={12} /> {anc}</span></td>
                  <td style={{ padding: "13px 20px", color: "var(--dim)" }}>{seg}</td>
                  <td style={{ padding: "13px 20px", color: "var(--faint)", fontSize: 13 }}>{foco[i % foco.length]}</td>
                  <td style={{ padding: "13px 20px", fontWeight: 600 }}>{p[3].toFixed(1)} <span style={{ color: "var(--faint)", fontWeight: 400 }}>/ 4</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ds-grid-2">
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 6 }}>Assessment de descritores</div>
          <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 14 }}>Grid colab × descritor da competência foco — nota 1–4 (0.1). Vazio usa default 1.5.</div>
          {c.comp.slice(0, 4).map(([nome, n]) => <SmallBar key={nome} label={nome} val={n} />)}
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 14 }}>PDI individual</div>
          {c.pessoas.slice(0, 4).map((p, i) => (
            <div key={i} className="row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderRadius: 9 }}>
              <FileText size={15} style={{ color: "var(--accent)" }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{p[0]}</span>
              <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: "6px 12px" }}>Gerar PDF</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// JORNADA (Fase 4) — acompanhamento das 14 semanas + engajamento + evolution report
function TabJornada({ c }) {
  const tipo = (n) => n === 14 ? "final" : n === 13 ? "fechamento" : (n % 4 === 0 ? "missao" : "conteudo");
  const TIPO = {
    conteudo: { label: "Conteúdo", color: "#5BA8F2", Icon: GraduationCap },
    missao: { label: "Missão prática", color: "var(--accent)", Icon: Flag },
    fechamento: { label: "Fechamento", color: "#9E4EDD", Icon: MessageSquare },
    final: { label: "Avaliação final", color: "#2ECC71", Icon: Award },
  };
  const semanaTime = Math.max(1, Math.round(14 * c.evolucao / 100));
  const engaj = [
    ["Tira-dúvidas (Haiku)", 73, MessageSquare], ["Evidências socráticas", 61, Brain],
    ["Missões realizadas", 54, Flag], ["Conclusão de semana", c.evolucao, CheckCircle2],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabHead title="Jornada do colaborador (Fase 4)" sub="14 semanas com gate duplo (calendário + anterior concluída). Você acompanha o agregado — nunca a conversa individual.">
        <span className="chip" style={{ background: "color-mix(in srgb,var(--accent) 14%,transparent)", color: "var(--accent)", padding: "8px 12px" }}><CalendarDays size={13} /> Time na semana ~{semanaTime}</span>
      </TabHead>
      <div className="card" style={{ padding: 22 }}>
        <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 14 }}>Mapa das 14 semanas</div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {Array.from({ length: 14 }, (_, i) => {
            const n = i + 1, t = TIPO[tipo(n)], done = n < semanaTime, atual = n === semanaTime;
            return (
              <div key={n} title={`Semana ${n} · ${t.label}`} style={{
                width: 52, height: 52, borderRadius: 11, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                background: done ? "color-mix(in srgb," + t.color + " 22%,transparent)" : "rgba(255,255,255,0.04)",
                border: atual ? "1.5px solid var(--accent)" : "1px solid var(--line)",
                color: done || atual ? t.color : "var(--faint)" }}>
                {done ? <Check size={15} /> : <t.Icon size={15} />}
                <span style={{ fontSize: 10, fontWeight: 700 }}>{n}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
          {Object.values(TIPO).map((t) => (
            <span key={t.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--dim)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: t.color }} /> {t.label}
            </span>
          ))}
        </div>
      </div>
      <div className="ds-grid-2">
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 14 }}>Engajamento agregado</div>
          {engaj.map(([l, v, Icon]) => (
            <div key={l} style={{ marginBottom: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Icon size={14} style={{ color: "var(--accent)" }} /> {l}</span>
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>{v}%</span>
              </div>
              <div className="bar"><div style={{ width: v + "%", height: "100%", background: "var(--accent)" }} /></div>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 6 }}>Evolution Report (pré → pós)</div>
          <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 14 }}>Consolida sem 13 (fechamento) + sem 14 (cenário B) por descritor.</div>
          {c.comp.map(([nome, n]) => {
            const pre = Math.max(1, n - 0.6), pos = n;
            return (
              <div key={nome} style={{ marginBottom: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                  <span>{nome}</span>
                  <span style={{ fontWeight: 600 }}><span style={{ color: "var(--faint)" }}>{pre.toFixed(1)}</span> → <span style={{ color: "#2ECC71" }}>{pos.toFixed(1)}</span></span>
                </div>
                <div className="bar" style={{ position: "relative" }}>
                  <div style={{ width: (pre / 4 * 100) + "%", height: "100%", background: "rgba(255,255,255,0.18)" }} />
                  <div style={{ position: "absolute", top: 0, left: 0, width: (pos / 4 * 100) + "%", height: "100%", background: "linear-gradient(90deg,var(--accent),#2ECC71)", opacity: 0.85 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RelatoriosPortfolio({ companies, evolMedia }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>Carteira</div>
        <h1 className="serif" style={{ fontSize: 32, margin: "4px 0 0" }}>Relatórios de portfólio</h1>
      </div>
      <div className="card" style={{ padding: "13px 18px", display: "flex", gap: 10, alignItems: "center",
        background: "color-mix(in srgb,var(--accent) 8%,var(--card))" }}>
        <Shield size={16} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 13, color: "var(--dim)" }}>Comparação agregada com mínimo de 7 respostas por grupo. Uma empresa nunca enxerga os dados de outra.</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "var(--faint)", fontSize: 12, textAlign: "left" }}>
              {["Empresa", "Setor", "Colaboradores", "Evolução", "Status"].map((h) => (
                <th key={h} style={{ padding: "13px 20px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="row" style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ padding: "14px 20px", fontWeight: 600 }}>{c.nome}</td>
                <td style={{ padding: "14px 20px", color: "var(--dim)" }}>{c.setor}</td>
                <td style={{ padding: "14px 20px" }}>{c.pessoas.length}</td>
                <td style={{ padding: "14px 20px", width: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="bar" style={{ flex: 1 }}><div style={{ width: c.evolucao + "%", height: "100%", background: "var(--accent)" }} /></div>
                    <span style={{ fontWeight: 600, fontSize: 13, width: 34 }}>{c.evolucao}%</span>
                  </div>
                </td>
                <td style={{ padding: "14px 20px" }}>
                  <span className="chip" style={{ background: STATUS[c.status].color + "22", color: STATUS[c.status].color }}>{STATUS[c.status].label}</span>
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--line)", background: "rgba(255,255,255,0.02)" }}>
              <td style={{ padding: "14px 20px", fontWeight: 700 }}>Média da carteira</td>
              <td></td>
              <td style={{ padding: "14px 20px", fontWeight: 700 }}>{companies.reduce((a, c) => a + c.pessoas.length, 0)}</td>
              <td style={{ padding: "14px 20px", fontWeight: 700, color: "var(--accent)" }}>{evolMedia}%</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Marca({ draft, setDraft, partner }) {
  const SWATCHES = ["#F2A65A", "#EC6A5C", "#34D399", "#22A3C4", "#9E4EDD", "#5BA8F2", "#34C5CC", "#F4B740"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>White-label</div>
        <h1 className="serif" style={{ fontSize: 32, margin: "4px 0 2px" }}>Sua marca, ponta a ponta</h1>
        <div style={{ fontSize: 13, color: "var(--dim)" }}>O cliente final vê só a sua consultoria. Ajuste e veja o preview ao vivo.</div>
      </div>
      <div className="ds-grid-2">
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <Field label="Nome da marca">
            <input className="fld" value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} />
          </Field>
          <Field label="Monograma (logo)">
            <input className="fld" maxLength={1} value={draft.sigla} onChange={(e) => setDraft({ ...draft, sigla: e.target.value.toUpperCase() })} style={{ width: 70, textAlign: "center" }} />
          </Field>
          <Field label="Cor da marca">
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              {SWATCHES.map((s) => (
                <button key={s} onClick={() => setDraft({ ...draft, accent: s })} className="btn"
                  style={{ width: 32, height: 32, borderRadius: 9, background: s,
                    outline: draft.accent === s ? "2px solid var(--ink)" : "none", outlineOffset: 2 }} />
              ))}
            </div>
          </Field>
          <Field label="Domínio do cliente">
            <div style={{ position: "relative" }}>
              <Globe size={15} style={{ position: "absolute", left: 12, top: 12, color: "var(--faint)" }} />
              <input className="fld" style={{ paddingLeft: 34 }} value={draft.dominio} onChange={(e) => setDraft({ ...draft, dominio: e.target.value })} />
            </div>
          </Field>
          <button className="btn btn-primary" style={{ justifyContent: "center" }}><Check size={16} /> Salvar marca</button>
        </div>

        {/* live preview — login que o cliente final vê */}
        <div>
          <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>Preview · login do cliente</div>
          <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)",
            background: "linear-gradient(180deg,#06172C,#0F2B54)", padding: 36, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 16, minHeight: 320, justifyContent: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 15, background: draft.accent, color: "#06172C",
              display: "grid", placeItems: "center", fontWeight: 800, fontSize: 26 }}>{draft.sigla || "·"}</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{draft.nome || "Sua marca"}</div>
              <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 3 }}>{partner.subtitle}</div>
            </div>
            <input className="fld" placeholder="seu@email.com" style={{ maxWidth: 240 }} />
            <button className="btn" style={{ background: draft.accent, color: "#06172C", padding: "11px 22px", justifyContent: "center", maxWidth: 240, width: "100%" }}>Entrar</button>
            <div style={{ fontSize: 11, color: "var(--faint)" }}>{draft.dominio}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Conta({ companies, totalColab, partner }) {
  const meters = [
    ["Empresas", companies.length, 25, Building2],
    ["Colaboradores ativos", totalColab, 500, Users],
    ["Créditos de avaliação", 318, 600, Sparkles],
    ["Vídeos renderizados", 42, 200, BarChart3],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>Plano Pro</div>
        <h1 className="serif" style={{ fontSize: 32, margin: "4px 0 0" }}>Conta & uso</h1>
        <div style={{ fontSize: 13, color: "var(--dim)" }}>Você revende sob a marca {partner.nome}. Estes são os limites do seu plano.</div>
      </div>
      <div className="ds-grid-2">
        {meters.map(([label, used, max, Icon]) => {
          const pct = Math.round((used / max) * 100);
          const warn = pct > 80;
          return (
            <div key={label} className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, fontWeight: 600 }}>
                  <Icon size={16} style={{ color: "var(--accent)" }} /> {label}
                </span>
                <span style={{ fontSize: 13, color: "var(--dim)" }}>{used} / {max}</span>
              </div>
              <div className="bar"><div style={{ width: pct + "%", height: "100%", background: warn ? "#F4B740" : "var(--accent)" }} /></div>
              {warn && <div style={{ fontSize: 12, color: "#F4B740", marginTop: 8 }}>Perto do limite — fale com seu gerente pra subir de plano.</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--dim)", marginBottom: 7, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

function AddColabModal({ onClose, onSave }) {
  const [f, setF] = useState({ nome: "", cargo: "", disc: "I" });
  const save = () => f.nome.trim() && onSave([f.nome.trim(), f.cargo.trim() || "—", f.disc, 2.5, "parcial"]);
  return (
    <Dialog open onClose={onClose} title="Adicionar colaborador"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon={Check} disabled={!f.nome.trim()} onClick={save}>Salvar colaborador</Button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <TextField label="Nome" required data-autofocus value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <TextField label="Cargo" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} />
        <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
          <legend className="ds-label" style={{ padding: 0, marginBottom: 7 }}>Perfil (DISC)</legend>
          <div role="radiogroup" aria-label="Perfil DISC" style={{ display: "flex", gap: 8 }}>
            {Object.keys(DISC).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={f.disc === k}
                onClick={() => setF({ ...f, disc: k })}
                style={{ flex: 1, padding: "10px 0", cursor: "pointer", borderRadius: 10, fontWeight: 700, fontFamily: "inherit",
                  background: f.disc === k ? DISC[k] : "rgba(255,255,255,0.05)", color: f.disc === k ? "#06172C" : "var(--ink)",
                  border: "1px solid var(--line)" }}>{k}</button>
            ))}
          </div>
        </fieldset>
        <div style={{ fontSize: 12, color: "var(--faint)", textAlign: "center" }}>Ou importe vários de uma vez via CSV.</div>
      </div>
    </Dialog>
  );
}

function NovaEmpresaModal({ onClose, onSave }) {
  const [f, setF] = useState({ nome: "", setor: "Educação · K-12" });
  const save = () => f.nome.trim() && onSave({
    id: "c" + Date.now(), nome: f.nome.trim(), setor: f.setor,
    inicial: f.nome.trim()[0].toUpperCase(), evolucao: 0, status: "atencao", passo: 0,
    comp: [["Comunicação", 0], ["Liderança", 0], ["Planejamento", 0], ["Feedback", 0]],
    pessoas: [],
  });
  return (
    <Dialog open onClose={onClose} title="Nova empresa-cliente"
      description="Competências e cargos vêm pré-carregados do template do segmento — você ajusta depois."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon={Plus} disabled={!f.nome.trim()} onClick={save}>Criar empresa</Button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <TextField label="Nome da empresa" required data-autofocus value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <SelectField label="Segmento" value={f.setor} onChange={(e) => setF({ ...f, setor: e.target.value })}>
          <option>Educação · K-12</option>
          <option>Educação · Rede municipal</option>
          <option>Corporativo · Tecnologia</option>
          <option>Corporativo · Manufatura</option>
          <option>Corporativo · Serviços</option>
        </SelectField>
      </div>
    </Dialog>
  );
}

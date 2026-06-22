'use client';

import React, { useState, useMemo } from "react";
import {
  LayoutGrid, Building2, Users, FileText, Palette, CreditCard,
  Plus, Search, ChevronLeft, TrendingUp, AlertTriangle, Upload,
  X, Check, ArrowUpRight, Bell, Globe, Sparkles, BarChart3, Shield,
  Target, ClipboardList, Layers, Film, Mic, CalendarDays, Activity,
  Route, GraduationCap, PlayCircle, Wand2, Clock, Headphones, Video
} from "lucide-react";

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
    evolucao: 72, status: "saudavel",
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
    evolucao: 58, status: "atencao",
    comp: [["Liderança", 2.5], ["Mediação", 2.2], ["Dados", 2.0], ["Acolhimento", 3.1]],
    pessoas: [
      ["Patrícia Gomes", "Gestora Escolar", "D", 2.7, "parcial"],
      ["Lucas Pereira", "Coordenador", "I", 2.3, "estagnacao"],
      ["Aline Costa", "Professora", "S", 2.9, "confirmada"],
    ],
  },
  {
    id: "c3", nome: "TechNova Software", setor: "Corporativo · Tecnologia", inicial: "T",
    evolucao: 81, status: "saudavel",
    comp: [["Colaboração", 3.3], ["Autonomia", 3.0], ["Comunicação", 2.9], ["Liderança", 2.6]],
    pessoas: [
      ["Camila Rocha", "Tech Lead", "C", 3.1, "confirmada"],
      ["Bruno Dias", "PM", "I", 2.8, "parcial"],
      ["Felipe Nunes", "Engenheiro", "D", 3.5, "confirmada"],
    ],
  },
  {
    id: "c4", nome: "Indústria Forte", setor: "Corporativo · Manufatura", inicial: "F",
    evolucao: 44, status: "critico",
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

export default function App() {
  const [pkey, setPkey] = useState("aurora");
  const partner = PARTNERS[pkey];
  const [view, setView] = useState("portfolio");
  const [companies, setCompanies] = useState(SEED);
  const [selId, setSelId] = useState(null);
  const [tab, setTab] = useState("visao");
  const [addColab, setAddColab] = useState(false);
  const [novaEmp, setNovaEmp] = useState(false);
  const [draft, setDraft] = useState({ accent: partner.accent, sigla: partner.sigla, nome: partner.nome, dominio: partner.dominio });

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

  function openCompany(id) { setSelId(id); setTab("visao"); setView("empresa"); }

  return (
    <div style={{ ...theme, minHeight: "100vh", display: "flex", background:
      "radial-gradient(1100px 560px at 88% -12%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%)," +
      "radial-gradient(820px 460px at -8% 28%, rgba(59,10,109,0.16), transparent 60%)," +
      "linear-gradient(180deg,var(--bg0) 0%,var(--bg1) 36%,var(--bg2) 100%)",
      color: "var(--ink)", fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; }
        .nav-item { cursor:pointer; display:flex; align-items:center; gap:11px; padding:10px 13px;
          border-radius:11px; color:var(--dim); font-size:14px; font-weight:500; transition:.15s; }
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
      <aside style={{ width: 232, borderRight: "1px solid var(--line)", padding: "22px 16px",
        display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        <BrandMark partner={partner} draft={view === "marca" ? draft : null} />
        <div style={{ height: 14 }} />
        {NAV.map(([k, label, Icon]) => (
          <div key={k} className={"nav-item" + (view === k ? " on" : "")} onClick={() => setView(k)}
            tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setView(k)}>
            <Icon size={17} /> {label}
          </div>
        ))}
        <div style={{ marginTop: "auto", fontSize: 12, color: "var(--faint)", display: "flex", gap: 7, alignItems: "center" }}>
          <Shield size={13} /> Dados isolados por carteira
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* TOPBAR */}
        <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 28px",
          borderBottom: "1px solid var(--line)" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 11, color: "var(--faint)" }} />
            <input className="fld" style={{ paddingLeft: 34 }} placeholder="Buscar empresa, pessoa…" />
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            {/* demo control: white-label proof */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--line)", borderRadius: 999, padding: "5px 6px 5px 12px" }}>
              <span style={{ fontSize: 11, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".06em" }}>demo · marca</span>
              {Object.entries(PARTNERS).map(([k, p]) => (
                <button key={k} onClick={() => { setPkey(k); setDraft({ accent: p.accent, sigla: p.sigla, nome: p.nome, dominio: p.dominio }); }}
                  className="btn" style={{
                    width: 26, height: 26, borderRadius: 999, background: p.accent,
                    color: "#06172C", fontWeight: 800, fontSize: 13, justifyContent: "center",
                    outline: pkey === k ? "2px solid var(--ink)" : "none", outlineOffset: 1 }}>
                  {p.sigla}
                </button>
              ))}
            </div>
            <Bell size={18} style={{ color: "var(--dim)" }} />
            <div style={{ width: 34, height: 34, borderRadius: 999, background: "rgba(255,255,255,0.08)",
              display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>RC</div>
          </div>
        </header>

        <div style={{ padding: "30px 28px", overflow: "auto" }}>
          {view === "portfolio" && (
            <Portfolio companies={companies} totalColab={totalColab} evolMedia={evolMedia}
              alertas={alertas} onOpen={openCompany} onNova={() => setNovaEmp(true)} partner={partner} />
          )}
          {view === "empresa" && sel && (
            <Empresa c={sel} tab={tab} setTab={setTab} onBack={() => setView("portfolio")}
              onAddColab={() => setAddColab(true)} />
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

function Kpi({ label, value, sub, Icon }) {
  return (
    <div className="card" style={{ padding: "18px 20px", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--dim)", fontSize: 13 }}>
        <span>{label}</span><Icon size={16} style={{ color: "var(--accent)" }} />
      </div>
      <div className="serif" style={{ fontSize: 38, lineHeight: 1.1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Portfolio({ companies, totalColab, evolMedia, alertas, onOpen, onNova, partner }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>Carteira</div>
          <h1 className="serif" style={{ fontSize: 34, margin: "4px 0 0" }}>Seu portfólio de clientes</h1>
        </div>
        <button className="btn btn-primary" onClick={onNova}><Plus size={17} /> Nova empresa</button>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Kpi label="Empresas ativas" value={companies.length} sub="na sua carteira" Icon={Building2} />
        <Kpi label="Colaboradores" value={totalColab} sub="acompanhados" Icon={Users} />
        <Kpi label="Evolução média" value={evolMedia + "%"} sub="do portfólio" Icon={TrendingUp} />
        <Kpi label="Em atenção" value={alertas.length} sub="empresas com sinal" Icon={AlertTriangle} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, alignItems: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 14 }}>
          {companies.map((c) => {
            const st = STATUS[c.status];
            return (
              <div key={c.id} className="card co-card" style={{ padding: 18 }} onClick={() => onOpen(c.id)}
                tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(c.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: "color-mix(in srgb,var(--accent) 18%,transparent)",
                    color: "var(--accent)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18 }}>{c.inicial}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.nome}</div>
                    <div style={{ fontSize: 12, color: "var(--faint)" }}>{c.setor}</div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 7px", fontSize: 12, color: "var(--dim)" }}>
                  <span>Evolução</span><span style={{ color: "var(--ink)", fontWeight: 600 }}>{c.evolucao}%</span>
                </div>
                <div className="bar"><div style={{ width: c.evolucao + "%", height: "100%", background: "var(--accent)" }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                  <span className="chip" style={{ background: st.color + "22", color: st.color }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: st.color }} /> {st.label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--dim)", display: "flex", alignItems: "center", gap: 4 }}>
                    <Users size={13} /> {c.pessoas.length}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
            <Bell size={15} style={{ color: "var(--accent)" }} /> Precisam de você
          </div>
          <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 12 }}>Sinais agregados — nunca expõem pessoa individual.</div>
          {alertas.map((c) => (
            <div key={c.id} onClick={() => onOpen(c.id)} className="row" style={{ cursor: "pointer", padding: "11px 10px",
              borderRadius: 10, display: "flex", gap: 10, alignItems: "center" }}>
              <AlertTriangle size={16} style={{ color: STATUS[c.status].color, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: "var(--faint)" }}>Evolução em {c.evolucao}% · {STATUS[c.status].label}</div>
              </div>
              <ArrowUpRight size={15} style={{ color: "var(--dim)" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Empresa({ c, tab, setTab, onBack, onAddColab }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: "flex-start" }}>
        <ChevronLeft size={16} /> Portfólio
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 54, height: 54, borderRadius: 14, background: "color-mix(in srgb,var(--accent) 18%,transparent)",
          color: "var(--accent)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 24 }}>{c.inicial}</div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{c.nome}</h1>
          <div style={{ fontSize: 13, color: "var(--faint)" }}>{c.setor} · {c.pessoas.length} colaboradores</div>
        </div>
        <span className="chip" style={{ marginLeft: "auto", background: STATUS[c.status].color + "22", color: STATUS[c.status].color }}>
          {STATUS[c.status].label}
        </span>
      </div>

      <div style={{ display: "flex", gap: 22, borderBottom: "1px solid var(--line)" }}>
        {[["visao", "Visão geral"], ["colaboradores", "Colaboradores"], ["diagnostico", "Diagnóstico"],
          ["conteudo", "Conteúdo"], ["trilha", "Trilha"], ["relatorios", "Relatórios"], ["pulso", "Pulso"]].map(([k, l]) => (
          <div key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}
            tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setTab(k)}>{l}</div>
        ))}
      </div>

      {tab === "visao" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 22 }}>
            <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 14, fontWeight: 600 }}>Competências do time</div>
            {c.comp.map(([nome, n]) => (
              <div key={nome} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                  <span>{nome}</span><span style={{ color: "var(--accent)", fontWeight: 700 }}>{n.toFixed(1)}<span style={{ color: "var(--faint)", fontWeight: 400 }}> / 4</span></span>
                </div>
                <div className="bar"><div style={{ width: (n / 4 * 100) + "%", height: "100%", background: "var(--accent)" }} /></div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ padding: 22 }}>
              <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600 }}>Evolução do ciclo</div>
              <div className="serif" style={{ fontSize: 46 }}>{c.evolucao}%</div>
              <div style={{ fontSize: 12, color: "var(--faint)" }}>colaboradores com evolução confirmada ou parcial</div>
            </div>
            <div className="card" style={{ padding: 22 }}>
              <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 10 }}>Perfis comportamentais (DISC)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(DISC).map(([k, col]) => {
                  const n = c.pessoas.filter((p) => p[2] === k).length;
                  return <span key={k} className="chip" style={{ background: col + "22", color: col }}>{k} · {n}</span>;
                })}
              </div>
              <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 12 }}>DISC é hipótese contextual — apoia decisão, não rotula a pessoa.</div>
            </div>
          </div>
        </div>
      )}

      {tab === "colaboradores" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{c.pessoas.length} colaboradores</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost"><Upload size={15} /> Importar CSV</button>
              <button className="btn btn-primary" onClick={onAddColab}><Plus size={16} /> Adicionar</button>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--faint)", fontSize: 12, textAlign: "left" }}>
                {["Nome", "Cargo", "Perfil", "Nível médio", "Evolução"].map((h) => (
                  <th key={h} style={{ padding: "12px 20px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.pessoas.map((p, i) => (
                <tr key={i} className="row" style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "13px 20px", fontWeight: 600 }}>{p[0]}</td>
                  <td style={{ padding: "13px 20px", color: "var(--dim)" }}>{p[1]}</td>
                  <td style={{ padding: "13px 20px" }}>
                    <span className="chip" style={{ background: DISC[p[2]] + "22", color: DISC[p[2]] }}>{p[2]}</span>
                  </td>
                  <td style={{ padding: "13px 20px", fontWeight: 600 }}>{p[3].toFixed(1)} <span style={{ color: "var(--faint)", fontWeight: 400 }}>/ 4</span></td>
                  <td style={{ padding: "13px 20px" }}>
                    <span style={{ color: EVOL[p[4]].color, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: EVOL[p[4]].color }} />{EVOL[p[4]].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "relatorios" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
          {[
            ["Relatório de RH", "Leitura organizacional consolidada, orientada a decisão.", true],
            ["Dossiê do Gestor", "Contexto pronto da equipe por gestor.", true],
            ["Plenária da empresa", "Documento do time inteiro, pronto pro board.", true],
            ["Evolution Report", "Comparativo pré→pós por descritor.", true],
            ["DNA · Retrato de Competências", "Mapa coletivo de competências por nível.", true],
            ["DNA · Perfil Organizacional DISC", "Radar/pizza dos perfis do time inteiro.", true],
            ["Pulso de clima", "Pesquisa T0/T2 + sinais + complementar NR-1.", false],
          ].map(([t, d, ready]) => (
            <div key={t} className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              <FileText size={18} style={{ color: "var(--accent)" }} />
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t}</div>
              <div style={{ fontSize: 12.5, color: "var(--dim)", flex: 1, lineHeight: 1.5 }}>{d}</div>
              <button className="btn" style={{ background: ready ? "rgba(255,255,255,0.06)" : "var(--accent)",
                color: ready ? "var(--ink)" : "var(--bg0)", padding: "9px 14px", fontSize: 13,
                border: ready ? "1px solid var(--line)" : "none", justifyContent: "center" }}>
                {ready ? "Ver PDF" : "Gerar"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "diagnostico" && <TabDiagnostico c={c} />}
      {tab === "conteudo" && <TabConteudo c={c} />}
      {tab === "trilha" && <TabTrilha c={c} />}
      {tab === "pulso" && <TabPulso c={c} />}
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
function SmallBar({ label, val, max = 4, color = "var(--accent)" }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
        <span>{label}</span><span style={{ color, fontWeight: 700 }}>{typeof val === "number" ? (max === 4 ? val.toFixed(1) : val + "%") : val}</span>
      </div>
      <div className="bar"><div style={{ width: (max === 4 ? (val / 4 * 100) : val) + "%", height: "100%", background: color }} /></div>
    </div>
  );
}
const FMT = { Texto: FileText, PDF: FileText, Podcast: Headphones, Vídeo: Video, Cases: Layers, Roteiro: ClipboardList };

// DIAGNÓSTICO — cenários por cargo×competência + status + mapa de competências (descritores)
function TabDiagnostico({ c }) {
  const respondido = c.pessoas.filter((p) => p[4] !== "estagnacao").length;
  const cenarios = c.comp.flatMap(([comp]) => [
    [c.pessoas[0]?.[1] || "Gestão", comp, "gerado"],
  ]).slice(0, 5);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabHead title="Diagnóstico de competências" sub="Cenários por cargo × competência, com DISC e nível por descritor.">
        <button className="btn btn-ghost"><Wand2 size={15} /> Gerar cenários (IA)</button>
        <button className="btn btn-primary"><Target size={16} /> Disparar diagnóstico</button>
      </TabHead>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 6 }}>Status do ciclo</div>
          <div className="serif" style={{ fontSize: 40 }}>{respondido}/{c.pessoas.length}</div>
          <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 12 }}>responderam · prazo D-7</div>
          <div className="bar"><div style={{ width: (c.pessoas.length ? respondido / c.pessoas.length * 100 : 0) + "%", height: "100%", background: "var(--accent)" }} /></div>
          <div style={{ marginTop: 18, fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 10 }}>Cenários gerados</div>
          {cenarios.map(([cargo, comp], i) => (
            <div key={i} className="row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 8px", borderRadius: 9 }}>
              <ClipboardList size={15} style={{ color: "var(--accent)" }} />
              <span style={{ flex: 1, fontSize: 13 }}>{cargo} <span style={{ color: "var(--faint)" }}>×</span> {comp}</span>
              <span className="chip" style={{ background: "#2ECC7122", color: "#2ECC71" }}><Check size={12} /> gerado</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600, marginBottom: 14 }}>Mapa de competências (nível médio por descritor)</div>
          {c.comp.map(([nome, n]) => <SmallBar key={nome} label={nome} val={n} />)}
          <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 6 }}>Níveis 1–4 (Fundamentos → Maestria). Base pro Evolution Report pré→pós.</div>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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

function Modal({ title, children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(3,10,20,0.66)",
      backdropFilter: "blur(4px)", display: "grid", placeItems: "center", zIndex: 50, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 440, padding: 26,
        background: "var(--bg1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h3>
          <X size={20} style={{ cursor: "pointer", color: "var(--dim)" }} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

function AddColabModal({ onClose, onSave }) {
  const [f, setF] = useState({ nome: "", cargo: "", disc: "I" });
  return (
    <Modal title="Adicionar colaborador" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nome"><input className="fld" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoFocus /></Field>
        <Field label="Cargo"><input className="fld" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} /></Field>
        <Field label="Perfil (DISC)">
          <div style={{ display: "flex", gap: 8 }}>
            {Object.keys(DISC).map((k) => (
              <button key={k} onClick={() => setF({ ...f, disc: k })} className="btn"
                style={{ flex: 1, padding: "10px 0", justifyContent: "center", background: f.disc === k ? DISC[k] : "rgba(255,255,255,0.05)",
                  color: f.disc === k ? "#06172C" : "var(--ink)", border: "1px solid var(--line)" }}>{k}</button>
            ))}
          </div>
        </Field>
        <button className="btn btn-primary" style={{ justifyContent: "center", marginTop: 4 }}
          disabled={!f.nome}
          onClick={() => onSave([f.nome || "Sem nome", f.cargo || "—", f.disc, 2.5, "parcial"])}>
          Salvar colaborador
        </button>
        <div style={{ fontSize: 12, color: "var(--faint)", textAlign: "center" }}>Ou importe vários de uma vez via CSV.</div>
      </div>
    </Modal>
  );
}

function NovaEmpresaModal({ onClose, onSave }) {
  const [f, setF] = useState({ nome: "", setor: "Educação · K-12" });
  return (
    <Modal title="Nova empresa-cliente" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nome da empresa"><input className="fld" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoFocus /></Field>
        <Field label="Segmento">
          <select className="fld" value={f.setor} onChange={(e) => setF({ ...f, setor: e.target.value })}>
            <option>Educação · K-12</option>
            <option>Educação · Rede municipal</option>
            <option>Corporativo · Tecnologia</option>
            <option>Corporativo · Manufatura</option>
            <option>Corporativo · Serviços</option>
          </select>
        </Field>
        <div style={{ fontSize: 12, color: "var(--faint)" }}>Competências e cargos vêm pré-carregados do template do segmento. Você ajusta depois.</div>
        <button className="btn btn-primary" style={{ justifyContent: "center", marginTop: 4 }}
          disabled={!f.nome}
          onClick={() => onSave({
            id: "c" + Date.now(), nome: f.nome || "Nova empresa", setor: f.setor,
            inicial: (f.nome || "N")[0].toUpperCase(), evolucao: 0, status: "atencao",
            comp: [["Comunicação", 0], ["Liderança", 0], ["Planejamento", 0], ["Feedback", 0]],
            pessoas: [],
          })}>
          Criar empresa
        </button>
      </div>
    </Modal>
  );
}

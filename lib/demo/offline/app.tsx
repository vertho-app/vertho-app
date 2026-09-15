import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  FileText,
  GraduationCap,
  Headphones,
  Monitor,
  Play,
  RotateCcw,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  BASE,
  installedPackage,
  preparePackage,
  verifyPackage,
  type InstalledPackage,
} from "./cache";
import type {
  OfflineData,
  OfflinePerson,
  OfflinePackage,
  ReportValue,
} from "./types";
import "./style.css";

declare const __DEMO_DATA__: OfflineData;
const data = __DEMO_DATA__;
const labels: Record<string, string> = {
  sintese_perfil: "Seu perfil",
  quadrante_D: "Dominância",
  quadrante_I: "Influência",
  quadrante_S: "Estabilidade",
  quadrante_C: "Conformidade",
  top5_forcas: "Forças",
  top5_desenvolver: "Pontos para desenvolver",
  modo_de_trabalho: "Modo de trabalho",
  relacoes_e_comunicacao: "Relações e comunicação",
  resumo_geral: "Seu momento",
  blueprint_objetivos: "Objetivos de desenvolvimento",
  competencias: "Competências",
  resumo_executivo: "Visão geral",
  analise_por_competencia: "Análise por competência",
  ranking_atencao: "Prioridades de acompanhamento",
  acoes: "Ações recomendadas",
  competencias_criticas: "Competências prioritárias",
  visao_por_cargo: "Visão por cargo",
  treinamentos_sugeridos: "Formações sugeridas",
  plano_acao: "Plano de ação",
  decisoes_chave: "Decisões para a rede",
  mensagem_final: "Próximos passos",
  acolhimento: "Seu desenvolvimento",
};
function label(key: string) {
  const text = labels[key] || key.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function Value({ value, depth = 0 }: { value: ReportValue; depth?: number }) {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value !== "object") return <p>{String(value)}</p>;
  if (Array.isArray(value))
    return (
      <ul className="report-list">
        {value.map((item, index) => (
          <li key={index}>
            <Value value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  return (
    <div className="report-fields">
      {Object.entries(value)
        .filter(
          ([key]) =>
            !key.startsWith("_") &&
            !["auditoria", "id", "competencia_id"].includes(key),
        )
        .map(([key, item]) => (
          <div key={key}>
            {depth < 4 && <h4>{label(key)}</h4>}
            <Value value={item} depth={depth + 1} />
          </div>
        ))}
    </div>
  );
}
function Report({ content }: { content: Record<string, ReportValue> }) {
  return (
    <div className="report">
      {Object.entries(content).map(([key, value]) => (
        <section className="panel" key={key}>
          <h2>{label(key)}</h2>
          <Value value={value} />
        </section>
      ))}
    </div>
  );
}
const roleNames = {
  professor: "Professor(a)",
  coordenacao: "Coordenação",
  direcao: "Direção",
};
type Role = keyof typeof roleNames;
const personNames = {
  professor: "Marina Rocha",
  coordenacao: "Renata Coelho",
  direcao: "Cláudia Amorim",
};
const icons = {
  video: Play,
  audio: Headphones,
  texto: FileText,
  case: BookOpen,
};
const formatNames = {
  video: "Vídeo",
  audio: "Áudio",
  texto: "Texto",
  case: "Case",
};

function Assessments({ person }: { person: OfflinePerson }) {
  const groups: Record<string, OfflinePerson["assessments"]> = {};
  for (const item of person.assessments)
    (groups[item.competency] ||= []).push(item);
  return (
    <div className="report">
      {Object.entries(groups).map(([name, items]) => (
        <section className="panel" key={name}>
          <h2>{name}</h2>
          {items!.map((item) => (
            <div className="score-row" key={item.descriptor}>
              <span>{item.descriptor}</span>
              <meter min="1" max="4" value={item.score} />
              <strong>
                {item.score.toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                })}
              </strong>
            </div>
          ))}
        </section>
      ))}
      {!person.assessments.length && (
        <section className="panel">
          <p>
            Esta pessoa ainda não tem avaliação de competências no retrato da
            demo.
          </p>
        </section>
      )}
      <p className="muted">
        Régua de desenvolvimento: N1 · lacuna, N2 · em desenvolvimento, N3 ·
        proficiente, N4 · referência.
      </p>
    </div>
  );
}

function App() {
  const [installed, setInstalled] = useState<InstalledPackage | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Conferindo o pacote neste aparelho…");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [role, setRole] = useState<Role>("professor");
  const [screen, setScreen] = useState("inicio");
  const [weekNumber, setWeekNumber] = useState(1);
  const [format, setFormat] = useState("video");
  const [personKey, setPersonKey] = useState("marina");
  const [mobile, setMobile] = useState(false);
  const [latest, setLatest] = useState<OfflinePackage | null>(null);
  const abort = useRef<AbortController | null>(null);
  const version = document.documentElement.dataset.version;

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    void (async () => {
      try {
        if (!("serviceWorker" in navigator) || !("caches" in window))
          throw new Error(
            "Use um navegador atualizado para preparar a apresentação neste aparelho.",
          );
        const current = await installedPackage();
        setInstalled(current);
        if (current) {
          await verifyPackage(current);
          setReady(true);
          setMessage("Pacote completo neste aparelho.");
        } else setMessage("Baixe o pacote pelo Wi-Fi antes de apresentar.");
      } catch (e) {
        setError((e as Error).message);
        setMessage("O pacote precisa ser preparado.");
      }
    })();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    fetch(`${BASE}package.json`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setLatest)
      .catch(() => {});
    return () => controller.abort();
  }, [online]);

  async function prepare() {
    if (busy) return;
    setBusy(true);
    setError("");
    setProgress(0);
    abort.current = new AbortController();
    try {
      const registration = await navigator.serviceWorker.register(
        `${BASE}sw.js`,
        { scope: "/apresentacao-offline/", updateViaCache: "none" },
      );
      if (!registration.active)
        await new Promise<void>((resolve, reject) => {
          const worker = registration.installing || registration.waiting;
          if (!worker)
            return reject(
              new Error(
                "Não foi possível preparar o modo offline. Recarregue a página.",
              ),
            );
          const timer = setTimeout(
            () =>
              reject(new Error("O preparo demorou demais. Tente novamente.")),
            30000,
          );
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") {
              clearTimeout(timer);
              resolve();
            }
            if (worker.state === "redundant") {
              clearTimeout(timer);
              reject(new Error("Falha ao preparar o modo offline."));
            }
          });
        });
      await navigator.storage?.persist?.().catch(() => false);
      const response = await fetch(`${BASE}package.json`, {
        cache: "no-store",
        signal: abort.current.signal,
      });
      if (!response.ok)
        throw new Error("Conecte ao Wi-Fi para baixar o pacote.");
      const pack: OfflinePackage = await response.json();
      const result = await preparePackage(
        pack,
        abort.current.signal,
        (done, total, name) => {
          setProgress(Math.round((done / total) * 100));
          setMessage(
            `Baixando ${name} · ${(done / 1048576).toFixed(1)} de ${(total / 1048576).toFixed(1)} MB`,
          );
        },
      );
      setInstalled(result);
      setReady(true);
      setMessage("Pacote completo neste aparelho.");
      if (
        pack.version !== version ||
        !navigator.serviceWorker.controller?.scriptURL.endsWith(
          "/apresentacao-offline/sw.js",
        )
      )
        location.reload();
    } catch (e) {
      setError(
        (e as Error).name === "AbortError"
          ? "Download cancelado. Você pode preparar o pacote novamente."
          : (e as Error).name === "QuotaExceededError"
            ? "Faltou espaço no aparelho. Libere espaço e tente novamente."
            : (e as Error).message,
      );
      setMessage(
        installed && ready
          ? "O pacote anterior continua disponível."
          : "O pacote ainda não está completo.",
      );
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  async function verify() {
    if (!installed || busy) return;
    setBusy(true);
    setError("");
    setMessage("Conferindo todos os arquivos salvos…");
    try {
      await verifyPackage(installed);
      setReady(true);
      setMessage(
        "Conferido: telas e conteúdos completos. Desligue a internet e reabra este endereço para testar.",
      );
    } catch (e) {
      setReady(false);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: string) {
    setScreen(next);
    window.scrollTo({ top: 0 });
  }
  function selectRole(next: Role) {
    setRole(next);
    setPersonKey(next === "professor" ? "marina" : "renata");
    navigate("inicio");
  }
  function restart() {
    selectRole("professor");
    setWeekNumber(1);
    setFormat("video");
  }
  const person = data.people.find((p) => p.key === personKey) || data.people[0];
  const week = data.weeks.find((w) => w.number === weekNumber)!;
  const selectedFormat = week.formats.find((f) => f.key === format)!;
  const team =
    role === "coordenacao"
      ? data.people.filter((p) => p.manager === "Renata Coelho")
      : data.people;
  const sectionTitle =
    screen === "semana"
      ? week.title
      : screen === "perfil"
        ? "Perfil comportamental"
        : screen === "competencias"
          ? "Competências"
          : screen === "pdi"
            ? "Plano de desenvolvimento"
            : screen === "relatorio"
              ? role === "direcao"
                ? "Panorama da rede"
                : "Acompanhamento da equipe"
              : screen === "equipe"
                ? "Nossa equipe"
                : role === "professor"
                  ? "Sua jornada de desenvolvimento"
                  : role === "coordenacao"
                    ? "Desenvolvimento da equipe docente"
                    : "Rede de Escolas ACME";
  const totalBytes = latest?.assets.reduce((sum, item) => sum + item.bytes, 0);
  return (
    <>
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            restart();
          }}
        >
          vertho<span>MENTOR IA</span>
        </a>
        <span className="school-name">Rede de Escolas ACME</span>
        <span className="connection">
          {online ? <Wifi size={16} /> : <WifiOff size={16} />}
          {online ? "Com conexão" : "Sem conexão"}
        </span>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <span className="eyebrow">APRESENTAÇÃO</span>
          <label>
            Visão apresentada
            <select
              aria-label="Visão apresentada"
              value={role}
              onChange={(e) => selectRole(e.target.value as Role)}
            >
              {Object.entries(roleNames).map(([key, name]) => (
                <option value={key} key={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p className="persona-name">{personNames[role]}</p>
          <nav aria-label="Navegação da apresentação">
            <button
              className={screen === "inicio" ? "active" : ""}
              onClick={() => navigate("inicio")}
            >
              <GraduationCap size={18} />
              {role === "professor" ? "Minha jornada" : "Visão geral"}
            </button>
            {role === "professor" ? (
              <>
                <button
                  onClick={() => {
                    setPersonKey("marina");
                    navigate("perfil");
                  }}
                >
                  <Users size={18} />
                  Meu perfil
                </button>
                <button
                  onClick={() => {
                    setPersonKey("marina");
                    navigate("competencias");
                  }}
                >
                  <BookOpen size={18} />
                  Competências
                </button>
                <button onClick={() => navigate("pdi")}>
                  <FileText size={18} />
                  Meu desenvolvimento
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate("equipe")}>
                  <Users size={18} />
                  Equipe
                </button>
                <button onClick={() => navigate("relatorio")}>
                  <FileText size={18} />
                  Relatório {role === "direcao" ? "da rede" : "da equipe"}
                </button>
              </>
            )}
          </nav>
          <div className="sidebar-bottom">
            <button onClick={restart}>
              <RotateCcw size={16} />
              Reiniciar demonstração
            </button>
            <button onClick={() => setMobile(!mobile)}>
              <Monitor size={16} />
              {mobile ? "Visão ampla" : "Prévia no celular"}
            </button>
            <small>Dados fictícios de demonstração</small>
          </div>
        </aside>
        <main className={mobile ? "mobile-preview" : ""}>
          <section
            className={`download-panel ${ready ? "complete" : ""}`}
            aria-label="Preparo offline"
          >
            <div className="download-heading">
              <span className="status-icon">
                {ready ? <Check size={22} /> : <Download size={22} />}
              </span>
              <div>
                <strong>
                  {busy
                    ? "Preparando apresentação"
                    : ready
                      ? "Pronto para apresentar offline"
                      : "Leve a demo com você"}
                </strong>
                <p role="status" aria-live="polite">
                  {message}
                </p>
              </div>
            </div>
            <div className="download-actions">
              <button
                className="primary"
                onClick={prepare}
                disabled={busy || !online}
              >
                <Download size={16} />
                {ready
                  ? latest && latest.version !== installed?.version
                    ? "Atualizar pacote"
                    : "Baixar novamente"
                  : `Preparar apresentação${totalBytes ? ` · ${Math.ceil(totalBytes / 1048576)} MB` : ""}`}
              </button>
              {ready && (
                <button onClick={verify} disabled={busy}>
                  <Check size={16} />
                  Conferir pacote
                </button>
              )}
              {busy && abort.current && (
                <button onClick={() => abort.current?.abort()}>Cancelar</button>
              )}
            </div>
            {busy && (
              <progress
                max="100"
                value={progress}
                aria-label="Progresso do download"
              />
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {installed && (
              <small>
                Salvo neste navegador em{" "}
                {new Date(installed.installedAt).toLocaleString("pt-BR")}. Para
                abrir novamente: {location.host}
                {BASE}index.html
              </small>
            )}
          </section>
          <div className="page-heading">
            {screen !== "inicio" && (
              <button className="back" onClick={() => navigate("inicio")}>
                <ArrowLeft size={16} />
                Voltar à visão geral
              </button>
            )}
            <span className="eyebrow">
              {roleNames[role]} · DEMONSTRAÇÃO OFFLINE
            </span>
            <h1>{sectionTitle}</h1>
            {["perfil", "competencias"].includes(screen) && (
              <p>
                {person.name} · {person.role}
              </p>
            )}
          </div>
          {!ready ? (
            <section className="panel empty">
              <Download size={36} />
              <h2>Prepare uma vez, apresente sem conexão.</h2>
              <p>
                O pacote inclui as três visões da escola, relatórios e as
                semanas 1 e 2 em vídeo, áudio, texto e case.
              </p>
              <p>
                Mantenha esta aba aberta durante o download. Depois, salve este
                endereço nos favoritos e teste com a internet desligada.
              </p>
            </section>
          ) : (
            <>
              {screen === "inicio" && role === "professor" && (
                <>
                  <section className="panel journey-intro">
                    <span className="eyebrow">SUA TEMPORADA</span>
                    <h2>Didática e estratégias de ensino</h2>
                    <p>
                      Do planejamento à participação de todos em sala de aula.
                    </p>
                    <div className="journey-track">
                      <span>1 · Ritmo e transições</span>
                      <ArrowRight size={20} />
                      <span>2 · Engajamento ativo</span>
                    </div>
                  </section>
                  <div className="week-grid">
                    {data.weeks.map((w) => (
                      <button
                        className="week-card"
                        key={w.number}
                        onClick={() => {
                          setWeekNumber(w.number);
                          setFormat("video");
                          navigate("semana");
                        }}
                      >
                        <span className="eyebrow">SEMANA {w.number} DE 7</span>
                        <h2>{w.title}</h2>
                        <p>{w.challenge}</p>
                        <span className="formats">
                          Vídeo · Áudio · Texto · Case
                        </span>
                        <strong>
                          Abrir conteúdo <ArrowRight size={18} />
                        </strong>
                      </button>
                    ))}
                  </div>
                  <div className="notice">
                    <Wifi size={18} />
                    <p>
                      A conversa de evidências e novas respostas da IA ficam
                      disponíveis na versão online.
                    </p>
                  </div>
                </>
              )}
              {screen === "semana" && (
                <>
                  <section className="panel">
                    <span className="eyebrow">
                      PÍLULA 1 · {week.competency}
                    </span>
                    <h2>{selectedFormat.title}</h2>
                    <div
                      className="format-tabs"
                      role="tablist"
                      aria-label="Formato do conteúdo"
                    >
                      {week.formats.map((f) => {
                        const Icon = icons[f.key];
                        return (
                          <button
                            role="tab"
                            aria-selected={f.key === format}
                            key={f.key}
                            onClick={() => setFormat(f.key)}
                          >
                            <Icon size={18} />
                            {formatNames[f.key]}
                          </button>
                        );
                      })}
                    </div>
                    <div className="media" key={`${weekNumber}-${format}`}>
                      {format === "video" ? (
                        <video
                          controls
                          playsInline
                          preload="metadata"
                          src={BASE + selectedFormat.path}
                          onError={() =>
                            setError(
                              "Vídeo indisponível. Use Conferir pacote para verificar os arquivos salvos.",
                            )
                          }
                        />
                      ) : format === "audio" ? (
                        <div className="audio-player">
                          <Headphones size={48} />
                          <audio
                            controls
                            preload="metadata"
                            src={BASE + selectedFormat.path}
                          />
                        </div>
                      ) : (
                        <>
                          <iframe
                            title={selectedFormat.title}
                            src={BASE + selectedFormat.path}
                          />
                          <a
                            className="document-link"
                            href={BASE + selectedFormat.path}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir documento em outra aba{" "}
                            <ArrowRight size={16} />
                          </a>
                        </>
                      )}
                    </div>
                  </section>
                  <section className="panel">
                    <h2>Da reflexão à prática</h2>
                    <p>{week.challenge}</p>
                    <h3>O que observar</h3>
                    <p>{week.evidence}</p>
                  </section>
                  <div className="notice">
                    <Wifi size={18} />
                    <p>
                      A conversa de evidências exige conexão. A navegação
                      offline não conclui a semana.
                    </p>
                  </div>
                </>
              )}
              {screen === "inicio" && role !== "professor" && (
                <>
                  <section className="panel">
                    <span className="eyebrow">
                      {role === "coordenacao"
                        ? "ESCOLA ACME VILA NOVA"
                        : "DESENVOLVIMENTO PEDAGÓGICO"}
                    </span>
                    <h2>
                      {role === "coordenacao"
                        ? "Conhecer a equipe para apoiar cada professor."
                        : "Uma visão integrada do desenvolvimento da rede."}
                    </h2>
                    <p>
                      Acompanhe os perfis, as competências avaliadas e as
                      prioridades de formação do retrato demonstrativo.
                    </p>
                    <div className="summary-stats">
                      <div>
                        <strong>{team.length}</strong>
                        <span>Pessoas neste recorte</span>
                      </div>
                      <div>
                        <strong>
                          {team.filter((p) => p.assessments.length).length}
                        </strong>
                        <span>Com competências avaliadas</span>
                      </div>
                      <div>
                        <strong>{new Set(team.map((p) => p.unit)).size}</strong>
                        <span>Unidades com participantes</span>
                      </div>
                    </div>
                  </section>
                  <div className="week-grid">
                    <button
                      className="week-card"
                      onClick={() => navigate("equipe")}
                    >
                      <Users size={28} />
                      <h2>Conheça a equipe</h2>
                      <p>
                        Perfis comportamentais e evidências de desenvolvimento.
                      </p>
                      <strong>
                        Abrir equipe <ArrowRight size={18} />
                      </strong>
                    </button>
                    <button
                      className="week-card"
                      onClick={() => navigate("relatorio")}
                    >
                      <FileText size={28} />
                      <h2>
                        {role === "direcao"
                          ? "Panorama da rede"
                          : "Relatório da equipe"}
                      </h2>
                      <p>
                        Leitura das prioridades e ações recomendadas para a
                        escola.
                      </p>
                      <strong>
                        Abrir relatório <ArrowRight size={18} />
                      </strong>
                    </button>
                  </div>
                </>
              )}
              {screen === "equipe" && (
                <section className="panel team-list">
                  {team.map((p) => (
                    <article key={p.key}>
                      <div>
                        <h3>{p.name}</h3>
                        <p>
                          {p.role} · {p.unit}
                        </p>
                      </div>
                      <div className="team-actions">
                        <button
                          onClick={() => {
                            setPersonKey(p.key);
                            navigate("perfil");
                          }}
                        >
                          Perfil
                        </button>
                        <button
                          onClick={() => {
                            setPersonKey(p.key);
                            navigate("competencias");
                          }}
                        >
                          Competências
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              )}
              {screen === "perfil" && (
                <>
                  <section className="panel">
                    <div className="disc-bars">
                      {person.disc.map((value, index) => (
                        <div key={index}>
                          <strong>{["D", "I", "S", "C"][index]}</strong>
                          <meter
                            aria-label={
                              [
                                "Dominância",
                                "Influência",
                                "Estabilidade",
                                "Conformidade",
                              ][index]
                            }
                            min="0"
                            max="100"
                            value={value}
                          />
                          <span>{value}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                  {Object.keys(person.report).length ? (
                    <Report content={person.report} />
                  ) : (
                    <section className="panel">
                      <p>
                        O perfil está mapeado. O relatório descritivo desta
                        pessoa não faz parte do pacote.
                      </p>
                    </section>
                  )}
                </>
              )}
              {screen === "competencias" && <Assessments person={person} />}
              {screen === "pdi" && <Report content={data.pdi} />}
              {screen === "relatorio" && (
                <Report
                  content={
                    role === "direcao" ? data.direction : data.coordination
                  }
                />
              )}
            </>
          )}
          <footer>
            Retrato demonstrativo de{" "}
            {new Date(data.capturedAt).toLocaleDateString("pt-BR")} · Navegação
            local, sem gravação de avaliações.
          </footer>
        </main>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

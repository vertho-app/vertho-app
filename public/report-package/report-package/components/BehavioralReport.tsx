// components/BehavioralReport.tsx
// Template React + Tailwind para relatório comportamental de 5 páginas
// Pronto para renderização em tela e conversão html-to-pdf

import React from 'react';
import type { BehavioralReportData } from '../types/behavioral-report';

// ============================================================
// SUBCOMPONENTS
// ============================================================

function DISCBar({ label, value, color, maxWidth = 100 }: { 
  label: string; value: number; color: string; maxWidth?: number 
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-xs font-bold text-gray-500">{label}</span>
      <div className="flex-1 h-6 bg-gray-100 rounded-full relative overflow-hidden">
        <div 
          className={`h-full rounded-full ${color} transition-all`} 
          style={{ width: `${(value / maxWidth) * 100}%` }} 
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-700">
          {value}
        </span>
      </div>
    </div>
  );
}

function RadarChart({ competencias }: { competencias: { nome: string; natural: number; adaptado: number }[] }) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const levels = 5;
  const maxVal = 100;
  const n = competencias.length;

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const r = (value / maxVal) * (size / 2 - 30);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const gridLines = Array.from({ length: levels }, (_, i) => {
    const r = ((i + 1) / levels) * (size / 2 - 30);
    const points = Array.from({ length: n }, (_, j) => {
      const angle = (Math.PI * 2 * j) / n - Math.PI / 2;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(' ');
    return <polygon key={i} points={points} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />;
  });

  const naturalPath = competencias.map((c, i) => {
    const p = getPoint(i, c.natural);
    return `${p.x},${p.y}`;
  }).join(' ');

  const adaptadoPath = competencias.map((c, i) => {
    const p = getPoint(i, c.adaptado);
    return `${p.x},${p.y}`;
  }).join(' ');

  const labels = competencias.map((c, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const lr = size / 2 - 8;
    const x = cx + lr * Math.cos(angle);
    const y = cy + lr * Math.sin(angle);
    const abbr = c.nome.slice(0, 3).toUpperCase();
    return (
      <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
        className="fill-gray-500" style={{ fontSize: '7px', fontWeight: 600 }}>
        {abbr}
      </text>
    );
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px] mx-auto">
      {gridLines}
      {/* Axis lines */}
      {competencias.map((_, i) => {
        const p = getPoint(i, maxVal);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e5e7eb" strokeWidth="0.5" />;
      })}
      {/* Natural (blue) */}
      <polygon points={naturalPath} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth="1.5" />
      {/* Adaptado (red) */}
      <polygon points={adaptadoPath} fill="rgba(239,68,68,0.08)" stroke="#ef4444" strokeWidth="1" strokeDasharray="4,3" />
      {labels}
    </svg>
  );
}

function LeadershipPie({ data }: { data: { executivo: number; motivador: number; metodico: number; sistematico: number } }) {
  const segments = [
    { label: 'Executivo', value: data.executivo, color: '#ef4444' },
    { label: 'Motivador', value: data.motivador, color: '#f59e0b' },
    { label: 'Metódico', value: data.metodico, color: '#10b981' },
    { label: 'Sistemático', value: data.sistematico, color: '#0d9488' },
  ];

  let cumulative = 0;
  const r = 50;
  const paths = segments.map((seg) => {
    const start = cumulative;
    cumulative += seg.value;
    const startAngle = (start / 100) * 2 * Math.PI - Math.PI / 2;
    const endAngle = (cumulative / 100) * 2 * Math.PI - Math.PI / 2;
    const x1 = 60 + r * Math.cos(startAngle);
    const y1 = 60 + r * Math.sin(startAngle);
    const x2 = 60 + r * Math.cos(endAngle);
    const y2 = 60 + r * Math.sin(endAngle);
    const large = seg.value > 50 ? 1 : 0;
    return (
      <path key={seg.label}
        d={`M60,60 L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`}
        fill={seg.color} stroke="white" strokeWidth="1" />
    );
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0">{paths}</svg>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[10px] text-gray-600">{s.label} <strong>{s.value}%</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PsychBar({ left, right, value }: { left: string; right: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-[10px] font-semibold text-right text-gray-600">{left} {value.toFixed(0)}%</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full relative overflow-hidden">
        <div className="h-full bg-indigo-300 rounded-full" style={{ width: `${value}%` }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white border-2 border-gray-400 rounded-full" 
          style={{ left: `${value}%` }} />
      </div>
      <span className="w-24 text-[10px] text-gray-500">{right} {(100 - value).toFixed(0)}%</span>
    </div>
  );
}

// ============================================================
// PAGE COMPONENTS
// ============================================================

function PageWrapper({ children, pageNum }: { children: React.ReactNode; pageNum: number }) {
  return (
    <div className="w-[210mm] min-h-[297mm] bg-white relative mx-auto shadow-sm print:shadow-none mb-8 print:mb-0 print:break-after-page overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-8 py-2 border-b border-gray-200">
        <span className="text-[9px] font-semibold text-gray-400 tracking-wider uppercase">Relatório Vertho.AI</span>
        <span className="text-[9px] text-gray-400">Relatório Comportamental</span>
      </div>
      {/* Content */}
      <div className="px-10 py-6">
        {children}
      </div>
      {/* Footer */}
      <div className="absolute bottom-4 right-8 text-[9px] text-gray-300">{pageNum}</div>
    </div>
  );
}

// === PAGE 1: CAPA + DISC INTRO + SNAPSHOT ===
function Page1({ data }: { data: BehavioralReportData }) {
  const { raw, texts } = data;
  const discColors = {
    D: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-600', bar: 'bg-red-400' },
    I: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-600', bar: 'bg-amber-400' },
    S: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-600', bar: 'bg-green-400' },
    C: { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-600', bar: 'bg-teal-400' },
  };

  const discDescriptions = [
    { letter: 'D', title: 'Dominância', subtitle: 'Como lida com desafios', desc: 'Orientação a resultados, ação e ousadia' },
    { letter: 'I', title: 'Influência', subtitle: 'Como lida com pessoas', desc: 'Comunicação, entusiasmo e persuasão' },
    { letter: 'S', title: 'Estabilidade', subtitle: 'Como dita o ritmo', desc: 'Paciência, consistência e equilíbrio' },
    { letter: 'C', title: 'Conformidade', subtitle: 'Como lida com regras', desc: 'Precisão, organização e cautela' },
  ];

  return (
    <PageWrapper pageNum={1}>
      {/* Capa section */}
      <div className="text-center mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Mapeamento de Perfil Comportamental</p>
        <h1 className="text-2xl font-bold text-[#1C2E4A] mb-1">{raw.nome}</h1>
        <p className="text-xs text-gray-400">Realizado em: {new Date(raw.data_realizacao).toLocaleDateString('pt-BR')}</p>
      </div>

      {/* Micro-explicação DISC */}
      <div className="bg-gray-50 rounded-xl p-4 mb-5">
        <p className="text-[11px] text-gray-600 text-center mb-3">
          Este relatório mapeia seu perfil em <strong>4 dimensões comportamentais</strong> que descrevem como você 
          lida com desafios, pessoas, ritmo e regras. Todos nós temos as 4 dimensões em intensidades diferentes — 
          não existe perfil certo ou errado.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {discDescriptions.map(d => {
            const colors = discColors[d.letter as keyof typeof discColors];
            return (
              <div key={d.letter} className={`${colors.bg} ${colors.border} border rounded-lg p-2.5 text-center`}>
                <div className={`text-2xl font-black ${colors.text} mb-0.5`}>{d.letter}</div>
                <div className="text-[10px] font-bold text-gray-700">{d.title}</div>
                <div className="text-[8px] text-gray-500 mt-0.5">{d.subtitle}</div>
                <div className="text-[8px] text-gray-400 mt-0.5">{d.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Perfil dominante badge */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <span className="bg-[#1C2E4A] text-white text-xs font-bold px-3 py-1 rounded-full">
          PERFIL {raw.perfil_dominante}
        </span>
        <div className="flex gap-2">
          {[
            { label: 'Positividade', val: raw.indices.positividade },
            { label: 'Estima', val: raw.indices.estima },
            { label: 'Flexibilidade', val: raw.indices.flexibilidade },
          ].map(idx => (
            <div key={idx.label} className="text-center">
              <div className="text-[9px] text-gray-400">{idx.label}</div>
              <div className="text-sm font-bold text-[#0D9488]">{idx.val.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* DISC Natural + Adaptado bars */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 text-center">
            Natural <span className="text-gray-400 font-normal">— quem você é</span>
          </h3>
          <div className="space-y-1.5">
            {(['D','I','S','C'] as const).map(d => (
              <DISCBar key={d} label={d} value={raw.disc_natural[d]} 
                color={discColors[d].bar} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 text-center">
            Adaptado <span className="text-gray-400 font-normal">— como o ambiente te exige</span>
          </h3>
          <div className="space-y-1.5">
            {(['D','I','S','C'] as const).map(d => (
              <DISCBar key={d} label={d} value={raw.disc_adaptado[d]} 
                color="bg-gray-400" />
            ))}
          </div>
        </div>
      </div>

      {/* Síntese */}
      <div className="bg-[#1C2E4A] rounded-xl p-4">
        <p className="text-[11px] text-white/90 leading-relaxed">{texts.sintese_perfil}</p>
      </div>
    </PageWrapper>
  );
}

// === PAGE 2: 4 QUADRANTES DISC ===
function Page2({ data }: { data: BehavioralReportData }) {
  const { raw, texts } = data;
  const quadrants = [
    { key: 'D', title: 'Como lida com desafios', data: texts.quadrante_D, natural: raw.disc_natural.D, adaptado: raw.disc_adaptado.D, color: 'border-l-red-400', bg: 'bg-red-50' },
    { key: 'I', title: 'Como lida com pessoas', data: texts.quadrante_I, natural: raw.disc_natural.I, adaptado: raw.disc_adaptado.I, color: 'border-l-amber-400', bg: 'bg-amber-50' },
    { key: 'S', title: 'Como dita o ritmo', data: texts.quadrante_S, natural: raw.disc_natural.S, adaptado: raw.disc_adaptado.S, color: 'border-l-green-400', bg: 'bg-green-50' },
    { key: 'C', title: 'Como lida com regras', data: texts.quadrante_C, natural: raw.disc_natural.C, adaptado: raw.disc_adaptado.C, color: 'border-l-teal-400', bg: 'bg-teal-50' },
  ];

  return (
    <PageWrapper pageNum={2}>
      <h2 className="text-lg font-bold text-[#1C2E4A] mb-1">Como Você Funciona</h2>
      <p className="text-[10px] text-gray-400 mb-4">Seus 4 estilos comportamentais em detalhe</p>

      <div className="grid grid-cols-2 gap-3">
        {quadrants.map(q => (
          <div key={q.key} className={`${q.bg} border-l-4 ${q.color} rounded-lg p-3.5`}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{q.title}</h3>
                <span className="text-sm font-bold text-[#1C2E4A]">{q.data.titulo_traco}</span>
              </div>
              <div className="text-right">
                <div className="text-[9px] text-gray-400">Natural</div>
                <div className="text-lg font-black text-[#1C2E4A]">{q.natural}</div>
              </div>
            </div>
            <p className="text-[10px] text-gray-600 leading-relaxed mb-1.5">{q.data.descricao}</p>
            {q.data.adaptacao && (
              <p className="text-[9px] text-gray-500 italic border-t border-gray-200 pt-1.5 mt-1.5">
                <span className="font-semibold not-italic">Adaptado: {q.adaptado}</span> — {q.data.adaptacao}
              </p>
            )}
          </div>
        ))}
      </div>
    </PageWrapper>
  );
}

// === PAGE 3: MAPA DE COMPETÊNCIAS ===
function Page3({ data }: { data: BehavioralReportData }) {
  const { raw, texts } = data;

  return (
    <PageWrapper pageNum={3}>
      <h2 className="text-lg font-bold text-[#1C2E4A] mb-1">Mapa de Competências</h2>
      <p className="text-[10px] text-gray-400 mb-3">16 competências comportamentais — natural (azul) e adaptado (vermelho tracejado)</p>

      {/* Radar chart */}
      <div className="flex justify-center mb-3">
        <RadarChart competencias={raw.competencias} />
      </div>

      {/* Legenda */}
      <div className="flex justify-center gap-6 mb-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 bg-blue-500 rounded" />
          <span className="text-[9px] text-gray-500">Natural</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 bg-red-400 rounded border-dashed" />
          <span className="text-[9px] text-gray-500">Adaptado</span>
        </div>
      </div>

      {/* Top 5 Forças + Top 5 Desenvolver */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Suas 5 maiores forças
          </h3>
          <div className="space-y-1.5">
            {texts.top5_forcas.map((f, i) => {
              const comp = raw.competencias.find(c => c.nome === f.competencia);
              return (
                <div key={i} className="bg-green-50 rounded-md px-2.5 py-1.5 flex items-start gap-2">
                  <span className="text-sm font-bold text-green-600 shrink-0 w-6 text-right">{comp?.natural ?? '—'}</span>
                  <div>
                    <span className="text-[10px] font-semibold text-gray-700">{f.competencia}</span>
                    <p className="text-[9px] text-gray-500">{f.frase}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <h3 className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" /> 5 oportunidades de desenvolvimento
          </h3>
          <div className="space-y-1.5">
            {texts.top5_desenvolver.map((d, i) => {
              const comp = raw.competencias.find(c => c.nome === d.competencia);
              return (
                <div key={i} className="bg-amber-50 rounded-md px-2.5 py-1.5 flex items-start gap-2">
                  <span className="text-sm font-bold text-amber-600 shrink-0 w-6 text-right">{comp?.natural ?? '—'}</span>
                  <div>
                    <span className="text-[10px] font-semibold text-gray-700">{d.competencia}</span>
                    <p className="text-[9px] text-gray-500">{d.frase}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}

// === PAGE 4: LIDERANÇA + TIPO PSICOLÓGICO ===
function Page4({ data }: { data: BehavioralReportData }) {
  const { raw, texts } = data;

  return (
    <PageWrapper pageNum={4}>
      {/* Liderança */}
      <h2 className="text-lg font-bold text-[#1C2E4A] mb-1">Estilo de Liderança</h2>
      <p className="text-[10px] text-gray-400 mb-3">Como você tende a liderar e influenciar sua equipe</p>

      <div className="flex gap-6 mb-4">
        <LeadershipPie data={raw.lideranca} />
        <div className="flex-1">
          <p className="text-[11px] text-gray-600 leading-relaxed mb-2">{texts.lideranca_sintese}</p>
          <div className="bg-amber-50 border-l-2 border-amber-400 rounded-r-md px-3 py-2">
            <p className="text-[10px] font-semibold text-amber-700 mb-0.5">Oportunidades</p>
            <p className="text-[10px] text-gray-600">{texts.lideranca_trabalhar}</p>
          </div>
        </div>
      </div>

      <hr className="border-gray-100 my-4" />

      {/* Tipo Psicológico */}
      <h2 className="text-lg font-bold text-[#1C2E4A] mb-1">Tipo Psicológico</h2>
      <p className="text-[10px] text-gray-400 mb-3">Baseado nos conceitos de Carl G. Jung — como você foca atenção, capta informações e tira conclusões</p>

      <div className="flex items-center gap-4 mb-4">
        <div className="bg-[#1C2E4A] text-white text-2xl font-black px-4 py-2 rounded-lg tracking-widest">
          {raw.tipo_psicologico.tipo}
        </div>
        <div className="flex-1 space-y-2.5">
          <PsychBar left="Extroversão" right="Introversão" value={raw.tipo_psicologico.extroversao} />
          <PsychBar left="Intuição" right="Sensação" value={raw.tipo_psicologico.intuicao} />
          <PsychBar left="Pensamento" right="Sentimento" value={raw.tipo_psicologico.pensamento} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Onde foca atenção', val: raw.tipo_psicologico.extroversao, 
            high: 'Extroversão — Foco no mundo exterior, pessoas e experiências', 
            low: 'Introversão — Foco no mundo interior, reflexões e emoções' },
          { label: 'Como capta informações', val: raw.tipo_psicologico.intuicao, 
            high: 'Intuição — Visão global, possibilidades e futuro', 
            low: 'Sensação — Fatos concretos, detalhes e experiência' },
          { label: 'Como tira conclusões', val: raw.tipo_psicologico.pensamento, 
            high: 'Pensamento — Lógica, análise e causa-efeito', 
            low: 'Sentimento — Valores pessoais, impacto nas pessoas' },
        ].map(item => (
          <div key={item.label} className="bg-gray-50 rounded-lg p-2.5">
            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">{item.label}</div>
            <p className="text-[10px] text-gray-600">
              {item.val > 50 ? item.high : item.val < 50 ? item.low : 'Equilíbrio entre as duas orientações'}
            </p>
          </div>
        ))}
      </div>
    </PageWrapper>
  );
}

// === PAGE 5: DESENVOLVIMENTO + PLANO ===
function Page5({ data }: { data: BehavioralReportData }) {
  const { raw, texts } = data;
  const firstName = raw.nome.split(' ')[0];

  return (
    <PageWrapper pageNum={5}>
      <h2 className="text-lg font-bold text-[#1C2E4A] mb-1">Pontos a Desenvolver</h2>
      <p className="text-[10px] text-gray-400 mb-3">
        Sob condições de pressão ou estresse, pessoas com perfil {raw.perfil_dominante} podem apresentar estes comportamentos. 
        Marque os que você reconhece em si:
      </p>

      {/* Checklist visual */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-6">
        {texts.pontos_desenvolver_pressao.map((ponto, i) => (
          <label key={i} className="flex items-start gap-2 bg-[#1C2E4A] rounded-md px-3 py-2 cursor-pointer">
            <div className="w-4 h-4 border-2 border-amber-400 rounded mt-0.5 shrink-0" />
            <span className="text-[10px] text-white/85">{ponto}</span>
          </label>
        ))}
      </div>

      {/* Plano de Ação */}
      <div className="bg-gray-50 rounded-xl p-5">
        <h3 className="text-base font-bold text-[#1C2E4A] mb-3">Meu Plano de Ação</h3>
        <p className="text-[10px] text-gray-500 mb-4">
          {firstName}, use as reflexões deste relatório para traçar seu plano de desenvolvimento.
        </p>

        <div className="space-y-4">
          {[
            { num: '1', question: 'O que vou desenvolver?', hint: 'Escolha 1 a 3 comportamentos que mais impactam sua eficácia' },
            { num: '2', question: 'Como vou fazer?', hint: 'Ações concretas, cursos, prática no dia a dia, mentoria...' },
            { num: '3', question: 'Até quando?', hint: 'Defina um prazo realista para ver os primeiros resultados' },
          ].map(item => (
            <div key={item.num}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="bg-[#0D9488] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                  {item.num}
                </span>
                <span className="text-[11px] font-semibold text-gray-700">{item.question}</span>
              </div>
              <p className="text-[9px] text-gray-400 ml-7 mb-1">{item.hint}</p>
              <div className="ml-7 border-b border-gray-300 pb-4" />
            </div>
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function BehavioralReport({ data }: { data: BehavioralReportData }) {
  return (
    <div className="bg-gray-100 print:bg-white" id="behavioral-report">
      <Page1 data={data} />
      <Page2 data={data} />
      <Page3 data={data} />
      <Page4 data={data} />
      <Page5 data={data} />
    </div>
  );
}

// ============================================================
// PDF EXPORT HELPER
// ============================================================
// Uso com html-to-pdf (ex: html2pdf.js, puppeteer, ou react-to-print)
//
// import html2pdf from 'html2pdf.js';
//
// function exportToPDF() {
//   const element = document.getElementById('behavioral-report');
//   html2pdf().set({
//     margin: 0,
//     filename: `relatorio-comportamental-${nome}.pdf`,
//     image: { type: 'jpeg', quality: 0.98 },
//     html2canvas: { scale: 2, useCORS: true },
//     jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
//     pagebreak: { mode: ['css', 'legacy'] }
//   }).from(element).save();
// }

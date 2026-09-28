// Harness dos componentes reais; só navegação/API são substituídas pelo bundler.
import {
  pontuacaoMatriz,
  relatorioPacePublico,
} from '../../lib/simulador-vendas/escala';
import {
  notaVemDaMatriz,
  resumoPublico,
  type LinhaResumo,
} from '../../lib/simulador-vendas/resumo';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { useTranslations } from 'next-intl';
import TreinoVendas from '../../components/simulador-vendas/treino';
import {
  ConfirmDialogProvider,
  useConfirm,
} from '../../components/admin/confirm-dialog';
import { estado, relatorio } from '../fixtures/simulador-vendas';
import { evolucaoPorCompetencia } from '@/lib/simulador-vendas/evolucao';
import {
  estadoDocumental,
  relatorioDocumental,
  PLANO,
} from '../fixtures/simulador-vendas-matriz';
import { visaoPublica } from '../../lib/simulador-vendas/core';
import { agregarPainel } from '../../lib/simulador-vendas/painel';
import { acessoPeloPrazo } from '../../lib/simulador-vendas/prazo';
import {
  comandoSchema,
  configSchema,
  REGUA_VERSION,
  type Estado,
} from '../../lib/simulador-vendas/schema';
import pt from '../../messages/pt-BR.json';
import ptpt from '../../messages/pt-PT.json';
import en from '../../messages/en-US.json';
import es from '../../messages/es-ES.json';
const w = window as any,
  params = new URLSearchParams(location.search);
const admin = params.has('admin'),
  empresaA = '10000000-0000-4000-8000-000000000003',
  empresaB = '10000000-0000-4000-8000-000000000004';
const locale = params.get('locale') || 'pt-BR',
  catalogo = { 'pt-BR': pt, 'pt-PT': ptpt, 'en-US': en, 'es-ES': es };
function ExclusaoPreview() {
  const confirmar = useConfirm();
  const t = useTranslations('SimuladorVendas');
  return (
    <main
      className="min-h-screen p-6 text-white"
      style={{ background: '#091D35' }}
    >
      <button
        data-testid="pace-exclusion-preview"
        className="rounded-lg border border-red-400/30 px-4 py-2 text-red-300"
        onClick={() =>
          confirmar({
            title: 'Excluir cadastro de demonstração',
            message: t('exclusionBackup', { days: 7 }),
            scopeNote: t('exclusionImpact', { sessions: 2, attempts: 5 }),
            severity: 'critical',
            typedConfirmation: 'Horizonte',
          })
        }
      >
        Excluir cadastro de demonstração
      </button>
    </main>
  );
}
let processando = params.has('processing');
const states: Record<string, Estado | null> = {
  [empresaA]: params.has('active') ? estado() : null,
  [empresaB]: null,
};
if (states[empresaA]) {
  states[empresaA]!.versaoRegua = 'pace-3';
  states[empresaA]!.mensagens = [
    {
      id: 'v1',
      turno: 1,
      autor: 'vendedor',
      texto: 'Como vocês administram o estoque hoje?',
      fase: 'preparar',
    },
    {
      id: 'c1',
      turno: 1,
      autor: 'cliente',
      texto:
        'Conferimos tudo manualmente. A falta de previsão atrasa as compras e sobrecarrega a equipe.',
      fase: 'analisar',
    },
  ];
  states[empresaA]!.fase = 'analisar';
  // V-9: conversa longa (8 turnos), para o campo no celular.
  if (params.has('longa')) {
    const s = states[empresaA]!;
    s.mensagens = Array.from({ length: 8 }, (_, i) => [
      {
        id: `v${i + 1}`,
        turno: i + 1,
        autor: 'vendedor' as const,
        texto: `Pergunta ${i + 1} do vendedor sobre o processo de compras, o estoque e o impacto na equipe de loja.`,
        fase: 'analisar' as const,
      },
      {
        id: `c${i + 1}`,
        turno: i + 1,
        autor: 'cliente' as const,
        texto: `Resposta ${i + 1} da cliente: hoje conferimos tudo manualmente, e isso atrasa as compras e sobrecarrega a equipe nas sextas-feiras.`,
        fase: 'analisar' as const,
      },
    ]).flat();
  }
  // V-14: advertência do moderador no turno 1; `aviso=depois` acrescenta um turno 2 sem advertência.
  if (params.has('aviso')) {
    const s = states[empresaA]!;
    s.moderacoes = [
      {
        violacao: true,
        categoria: 'linguagem_agressiva',
        severidade: 'leve',
        acao_sugerida: 'avisar_vendedor',
        confianca: 'alta',
        motivo: 'O vendedor usou um termo desrespeitoso ao se referir ao concorrente.',
        turno: 1,
        fase: 'preparar',
      } as Estado['moderacoes'][number],
    ];
    if (params.get('aviso') === 'depois')
      s.mensagens.push(
        { id: 'v2', turno: 2, autor: 'vendedor', texto: 'Qual é o impacto no fechamento do mês?', fase: 'analisar' },
        { id: 'c2', turno: 2, autor: 'cliente', texto: 'Atrasa as compras da semana seguinte.', fase: 'analisar' },
      );
  }
  // V-14: treino interrompido por conduta, sem devolutiva a liberar.
  if (params.has('interrompida')) {
    const s = states[empresaA]!;
    s.status = 'interrompida';
    s.encerradoEm = new Date().toISOString();
    s.moderacoes = [
      {
        violacao: true,
        categoria: 'assedio',
        severidade: 'grave',
        acao_sugerida: 'encerrar_sessao',
        confianca: 'alta',
        motivo: 'Conduta incompatível com uma negociação profissional.',
        turno: 1,
        fase: 'preparar',
      } as Estado['moderacoes'][number],
    ];
  }
  if (params.has('completed')) {
    states[empresaA]!.status = 'concluida';
    states[empresaA]!.relatorio = params.has('zero')
      ? { ...relatorio, E: 0, Media: 4.5 }
      : { ...relatorio, Media: 5.5 };
    states[empresaA]!.encerradoEm = new Date().toISOString();
    if (params.has('rated'))
      states[empresaA]!.feedback = {
        realismo: 5,
        desafio: 5,
        interacao: 5,
        utilidade: 5,
        aprendizado: 5,
        comentario: '',
      };
  }
}
if (params.has('matrix')) {
  states[empresaA] = estadoDocumental();
  if (params.has('planning')) {
    states[empresaA]!.planejamento = undefined;
    states[empresaA]!.mensagens = [];
  }
  if (params.has('completed')) {
    states[empresaA]!.status = 'concluida';
    states[empresaA]!.relatorio = {
      ...relatorioDocumental(),
      P: 7.5,
      A: 7.5,
      C: 7.5,
      E: 7.5,
      Media: 7.5,
    };
    states[empresaA]!.feedback = {
      realismo: 5,
      desafio: 5,
      interacao: 5,
      utilidade: 5,
      aprendizado: 5,
      comentario: '',
    };
    // pace-7: a mesma matriz com a regra de cobertura; `curta` = plano, abertura e uma pergunta.
    if (params.get('regua') === 'pace-7') {
      const r = relatorioDocumental();
      if (params.has('curta'))
        for (const d of r.Matriz.descritores)
          if (!['PL1', 'PL2', 'P1', 'A1'].includes(d.codigo)) {
            d.nivel = null;
            d.evidencias = [];
          }
      states[empresaA]!.versaoRegua = 'pace-7';
      states[empresaA]!.relatorio = {
        ...r,
        ...pontuacaoMatriz(r.Matriz, 'pace-7'),
        Violacoes: [],
      };
    }
    // Devolutiva pronta esperando a pesquisa de experiência (D2).
    if (params.has('pendente')) states[empresaA]!.feedback = null;
  }
}
const configs = Object.fromEntries(
  [empresaA, empresaB].map((id) => [
    id,
    {
      habilitado: false,
      briefing:
        'A Horizonte vende software de gestão de estoques para pequenas redes varejistas. Implantação assistida em 30 dias e atendimento em português.',
      revisao: 1,
      periodo_inicio: null,
      periodo_fim: null,
    },
  ]),
);
// V-7 (27/09/2026): o item de histórico sai da MESMA projeção do serviço
// (`resumoPublico`), a partir da linha como o banco a devolve (`sim_vendas_resumo`
// + projeções do participante). Antes o harness montava o item à mão e escondia
// a nota antes da pesquisa, coisa que o serviço não fazia.
const linhaDoEstado = (
  s: Estado,
  extra: Partial<LinhaResumo> = {},
): LinhaResumo => ({
  id: s.id,
  created_at: s.criadoEm,
  colaborador_id: admin ? null : 'colab-ana',
  owner_key: admin ? 'admin:1' : 'colab:colab-ana',
  resumo: {
    status: s.status,
    nivel: s.nivel,
    nome: s.cenario?.personagem.nome ?? null,
    nomeVendedor: s.nomeVendedor,
    nota: s.relatorio?.Media ?? null,
    temRelatorio: !!s.relatorio,
    versaoRegua: s.versaoRegua || 'pace-1',
  },
  pl: s.relatorio?.PL,
  p: s.relatorio?.P,
  a: s.relatorio?.A,
  c: s.relatorio?.C,
  e: s.relatorio?.E,
  liberado: s.feedback?.realismo ?? null,
  foco: s.relatorio?.Recomendacoes?.[0]?.titulo ?? null,
  ...extra,
});
// pace-4/pace-5: o serviço lê a matriz para a nota da lista (V-5).
const notasMatrizDe = (s: Estado) =>
  s.relatorio?.Matriz && notaVemDaMatriz(s.versaoRegua)
    ? new Map([[s.id, pontuacaoMatriz(s.relatorio.Matriz, s.versaoRegua)]])
    : undefined;
/** Histórico do participante, como `consultarHistorico`: nota só depois da pesquisa (D2). */
const itemParticipante = (s: Estado) => ({
  ...resumoPublico(linhaDoEstado(s), {
    participante: true,
    notasMatriz: notasMatrizDe(s),
  }),
  temRelatorio: false,
});
/** Histórico da equipe, como `historicoEquipe`: a gestão vê a nota sem depender da pesquisa. */
const itemEquipe = (s: Estado) =>
  resumoPublico(linhaDoEstado(s), { notasMatriz: notasMatrizDe(s) });
const treino = (
  i: number,
  ajustar: (s: Estado) => void,
): Estado => {
  const s = estado();
  s.id = `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  s.status = 'concluida';
  s.feedback = {
    realismo: 5,
    desafio: 5,
    interacao: 5,
    utilidade: 5,
    aprendizado: 5,
    comentario: '',
  };
  ajustar(s);
  return s;
};
// Histórico do participante: treinos pace-3 (0 a 10 convertido). O 31º, na
// segunda página, ainda espera a pesquisa.
const treinosExtra = params.has('history')
  ? Array.from({ length: 31 }, (_, i) =>
      treino(i + 1, (s) => {
        s.versaoRegua = 'pace-3';
        s.relatorio = { ...relatorio, Media: 6.5 };
        s.cenario!.personagem.nome = `Cliente ${i + 1}`;
        if (i === 30) s.feedback = null;
      }),
    )
  : [];
const historicoExtra = treinosExtra.map(itemParticipante);
// Gestão: treinos pace-7 com a matriz, como a produção gera hoje. Plano em N2 e
// conversa em N3: média 2,8 (Nível 2) na lista e na devolutiva.
const relatorioPace7Equipe = (() => {
  const r = relatorioDocumental();
  for (const d of r.Matriz.descritores) if (d.codigo.startsWith('PL')) d.nivel = 2;
  return { ...r, ...pontuacaoMatriz(r.Matriz, 'pace-7'), Violacoes: [] };
})();
const treinosEquipe = params.has('history')
  ? Array.from({ length: 31 }, (_, i) =>
      treino(i + 1, (s) => {
        s.versaoRegua = 'pace-7';
        s.relatorio = structuredClone(relatorioPace7Equipe);
      }),
    )
  : [];
// Dois treinos com devolutiva aberta: evolução por competência e foco sugerido.
const historicoEvolucao = params.has('evolucao')
  ? [
      treino(101, (s) => {
        s.versaoRegua = 'pace-7';
        s.cenario!.personagem.nome = 'Carla';
        s.relatorio = {
          ...relatorioDocumental(),
          PL: 3.1,
          P: 3.0,
          A: 3.2,
          C: 2.8,
          E: 3.0,
          Media: 3.06,
          escalaNota: '1-4',
          Recomendacoes: [
            {
              ...relatorioDocumental().Recomendacoes[0],
              titulo: 'Confirme o diagnóstico antes de propor',
            },
          ],
        };
      }),
      treino(102, (s) => {
        s.versaoRegua = 'pace-7';
        s.relatorio = {
          ...relatorioDocumental(),
          PL: 2.2,
          P: 2.9,
          A: 2.4,
          C: null,
          E: 2.6,
          Media: 2.5,
          escalaNota: '1-4',
          Recomendacoes: [
            {
              ...relatorioDocumental().Recomendacoes[0],
              titulo: 'Defina o avanço',
            },
          ],
        };
      }),
    ].map(itemParticipante)
  : [];
// Prazo pela MESMA função do serviço (`acessoPeloPrazo`): `expired=grace` venceu
// há 1 h (dentro da tolerância de 24 h para pedir a devolutiva); `expired`
// venceu há 25 h.
const HORA = 3_600_000;
const isoRel = (ms: number) => new Date(Date.now() + ms).toISOString();
const prazoHarness =
  params.get('expired') === 'grace'
    ? { periodo_inicio: isoRel(-30 * 24 * HORA), periodo_fim: isoRel(-HORA) }
    : params.has('expired')
      ? { periodo_inicio: isoRel(-30 * 24 * HORA), periodo_fim: isoRel(-25 * HORA) }
      : { periodo_inicio: isoRel(-30 * 24 * HORA), periodo_fim: isoRel(90 * 24 * HORA) };
const acessoHarness = () =>
  acessoPeloPrazo(prazoHarness, { admin, treina: true });
const dados = (id = empresaA) => ({
  evolucao: historicoEvolucao.length
    ? evolucaoPorCompetencia(historicoEvolucao)
    : null,
  focoSugerido: historicoEvolucao[0]?.foco ?? null,
  empresaId: id,
  empresaNome:
    id === empresaA ? 'Horizonte · demonstração' : 'Aurora · demonstração',
  admin,
  habilitado: !admin || configs[id].habilitado,
  configurado: true,
  podeTreinar: acessoHarness().podeTreinar,
  podeEncerrar: acessoHarness().podeEncerrar,
  podeConfigurar: admin,
  podeVerEquipe: admin || params.has('team'),
  ...(admin ? { config: configs[id] } : {}),
  prazo: {
    inicio: prazoHarness.periodo_inicio,
    fim: prazoHarness.periodo_fim,
    vigente: acessoHarness().vigente,
    encerrarAte: acessoHarness().encerrarAte,
  },
  sessao: states[id]
    ? {
        ...visaoPublica(states[id]),
        processando,
        processandoAte: processando
          ? new Date(Date.now() + 320000).toISOString()
          : null,
      }
    : null,
  historico: historicoEvolucao.length
    ? historicoEvolucao
    : historicoExtra.length
      ? historicoExtra.slice(0, 30)
      : states[id]
        ? [itemParticipante(states[id]!)]
        : [],
  proximoCursor: historicoExtra.length ? 'proxima' : null,
});
w.__paceWrites = [];
w.__pacePendentes = [];
w.__paceLeituras = [];
w.__paceFetch = async (url: string, init: RequestInit = {}) => {
  const q = new URL(url, location.origin).searchParams,
    id = q.get('empresaId') || empresaA;
  if (url.includes('/config')) {
    if (init.method === 'PUT') {
      const c = configSchema.parse(JSON.parse(String(init.body)));
      w.__paceWrites.push(c);
      configs[c.empresaId] = {
        habilitado: c.habilitado,
        briefing: c.briefing,
        revisao: c.revisao + 1,
        periodo_inicio: c.periodoInicio,
        periodo_fim: c.periodoFim,
      };
      return Response.json({ ok: true, revisao: c.revisao + 1 });
    }
    return Response.json({
      empresas: [
        { id: empresaA, nome: 'Horizonte · demonstração', slug: 'horizonte' },
        { id: empresaB, nome: 'Aurora · demonstração', slug: 'aurora' },
      ],
    });
  }
  if (url.includes('/gestao')) {
    // Visão da equipe: a agregação real sobre pessoas e treinos fictícios.
    if (q.has('painel'))
      return Response.json(
        agregarPainel(
          [
            { id: 'p-ana', nome: 'Ana Souza', cargo: 'Vendedora' },
            { id: 'p-bruno', nome: 'Bruno Lima', cargo: 'Vendedor' },
            { id: 'p-carla', nome: 'Carla', cargo: null },
            { id: 'p-diego', nome: '=Diego', cargo: 'Vendedor' },
            ...['Eva', 'Fábio', 'Gabi', 'Hugo'].map((nome) => ({
              id: `p-${nome}`,
              nome: `${nome} Ramos`,
              cargo: 'Vendedor',
            })),
          ],
          [
            // Cinco pessoas responderam à pesquisa: os comentários aparecem (D3).
            ...['Eva', 'Fábio', 'Gabi', 'Hugo'].map((nome, i) => ({
              colaboradorId: `p-${nome}`,
              criadoEm: `2026-09-2${i}T12:00:00Z`,
              status: 'concluida',
              competencias: null,
              feedback: {
                realismo: 4,
                desafio: 3,
                interacao: 4,
                utilidade: 4,
                aprendizado: 4,
                comentario: i === 0 ? 'Queria um cliente mais difícil.' : '',
              },
            })),
            {
              colaboradorId: 'p-ana',
              criadoEm: '2026-09-10T12:00:00Z',
              status: 'concluida',
              competencias: { PL: 2.4, P: 2.8, A: 3.1, C: 2.5, E: 3.2 },
              feedback: {
                realismo: 4,
                desafio: 4,
                interacao: 4,
                utilidade: 5,
                aprendizado: 4,
                comentario: '',
              },
            },
            {
              colaboradorId: 'p-ana',
              criadoEm: '2026-09-15T12:00:00Z',
              status: 'concluida',
              competencias: { PL: 3.2, P: 3.0, A: 2.9, C: null, E: 3.6 },
              feedback: {
                realismo: 5,
                desafio: 4,
                interacao: 5,
                utilidade: 4,
                aprendizado: 5,
                comentario: 'O cliente pareceu uma pessoa de verdade.',
              },
            },
            {
              colaboradorId: 'p-bruno',
              criadoEm: '2026-09-16T12:00:00Z',
              status: 'em_andamento',
              competencias: null,
              feedback: null,
            },
          ],
        ),
      );
    // Relatório da gestão como `relatorioEquipe` o entrega: a versão gravada no
    // treino e a projeção pública. Até 27/09 o harness mandava um relatório 0 a
    // 10 marcado como pace-7, combinação que o servidor não produz ("10 / 4").
    if (q.has('sessaoId')) {
      const s = treinosEquipe.find((t) => t.id === q.get('sessaoId'))!;
      return Response.json({
        id: s.id,
        nomeVendedor: s.nomeVendedor,
        versaoRegua: s.versaoRegua,
        relatorio: relatorioPacePublico(s.relatorio, s.versaoRegua),
      });
    }
    if (q.has('exportar'))
      return Response.json({
        linhas: [
          {
            ...itemEquipe(treinosEquipe[0]),
            nomeVendedor: '=FORMULA',
            PL: 2,
            P: 3,
            A: 3,
            C: 3,
            E: 3,
            Media: 2.8,
            Resumo: 'Diagnóstico',
          },
        ],
      });
    return Response.json({
      historico: treinosEquipe.map(itemEquipe),
      proximoCursor: null,
    });
  }
  if (q.has('historico'))
    return Response.json({
      historico: historicoExtra.slice(30),
      proximoCursor: null,
    });
  if (!init.method) {
    // Segura a releitura que a tela faz depois de um envio (janela entre a
    // resposta do POST e o fim do `carregar`).
    if (w.__paceSegurarLeitura)
      await new Promise((resolve) => w.__paceLeituras.push(resolve));
    const d = dados(id);
    const aberto = treinosExtra.find((t) => t.id === q.get('sessaoId'));
    if (aberto)
      d.sessao = {
        ...visaoPublica(aberto),
        processando: false,
        processandoAte: null,
      };
    return Response.json(d);
  }
  const cmd = comandoSchema.parse(JSON.parse(String(init.body))),
    target = cmd.empresaId || empresaA;
  w.__paceWrites.push(cmd);
  // V-3: o gateway devolve 504 em HTML (sem JSON) antes de o envio chegar.
  if (w.__pace504 > 0) {
    w.__pace504--;
    return new Response('<html><body>504 Gateway Timeout</body></html>', {
      status: 504,
      headers: { 'Content-Type': 'text/html' },
    });
  }
  if (w.__paceDelay)
    await new Promise((resolve) => w.__pacePendentes.push(resolve));
  if (cmd.acao === 'iniciar') {
    states[target] = estado();
    states[target]!.id = cmd.requestId;
    if (params.has('matrix')) states[target]!.versaoRegua = REGUA_VERSION;
  }
  const s = states[target];
  if (!s) throw Error('fixture sem sessão');
  if (cmd.acao === 'planejar') s.planejamento = cmd.planejamento;
  if (cmd.acao === 'responder') {
    const n = s.mensagens.filter((m) => m.autor === 'vendedor').length + 1;
    s.mensagens.push(
      {
        id: cmd.requestId + ':v',
        turno: n,
        autor: 'vendedor',
        texto: cmd.mensagem,
        fase: s.fase,
      },
      {
        id: cmd.requestId + ':c',
        turno: n,
        autor: 'cliente',
        texto:
          'Isso afeta nossas compras e o atendimento. Gostaria de organizar essas informações.',
        fase: s.fase,
      },
    );
  }
  if (cmd.acao === 'encerrar') {
    s.relatorio = params.has('matrix')
      ? { ...relatorioDocumental(), Media: 7.5 }
      : { ...relatorio, Media: 5.5 };
    s.status = 'concluida';
  }
  if (cmd.acao === 'abandonar') s.status = 'abandonada';
  if (cmd.acao === 'feedback') s.feedback = cmd.feedback;
  s.revisao++;
  return Response.json({ sessao: dados(target).sessao });
};
const root = createRoot(document.getElementById('root')!);
const render = () =>
  root.render(
    <NextIntlClientProvider
      locale={locale}
      messages={catalogo[locale]}
      timeZone="America/Sao_Paulo"
    >
      {params.has('confirmation') ? (
        <ConfirmDialogProvider>
          <ExclusaoPreview />
        </ConfirmDialogProvider>
      ) : (
        <TreinoVendas admin={admin} />
      )}
    </NextIntlClientProvider>,
  );
w.__paceContexto = (id: string) => {
  history.replaceState(null, '', `?admin=1&empresa=${id}`);
  render();
};
w.__paceLiberar = () => {
  processando = false;
};
render();

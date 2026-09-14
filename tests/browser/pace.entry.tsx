// Harness dos componentes reais; só navegação/API são substituídas pelo bundler.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import TreinoVendas from '../../components/simulador-vendas/treino';
import { estado, relatorio } from '../fixtures/simulador-vendas';
import { visaoPublica } from '../../lib/simulador-vendas/core';
import { comandoSchema, configSchema, type Estado } from '../../lib/simulador-vendas/schema';
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
let processando = params.has('processing');
const states: Record<string, Estado | null> = {
  [empresaA]: params.has('active') ? estado() : null,
  [empresaB]: null,
};
if (states[empresaA]) {
  states[empresaA]!.versaoRegua = 'pace-2';
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
      texto: 'Conferimos tudo manualmente. A falta de previsão atrasa as compras e sobrecarrega a equipe.',
      fase: 'analisar',
    },
  ];
  states[empresaA]!.fase = 'analisar';
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
const resumo = (s: Estado) => ({
  id: s.id,
  criadoEm: s.criadoEm,
  status: s.status,
  nivel: s.nivel,
  nome: 'Beatriz',
  nomeVendedor: s.nomeVendedor,
  nota: s.relatorio?.Media || null,
  temRelatorio: !!s.relatorio,
  versaoRegua: 'pace-2',
  testeAdmin: admin,
});
const historicoExtra = params.has('history')
  ? Array.from({ length: 31 }, (_, i) => ({
      ...resumo(estado()),
      id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      nome: `Cliente ${i + 1}`,
      status: 'concluida',
      nota: 6.5,
      temRelatorio: true,
    }))
  : [];
const dados = (id = empresaA) => ({
  empresaId: id,
  empresaNome: id === empresaA ? 'Horizonte · demonstração' : 'Aurora · demonstração',
  admin,
  habilitado: !admin || configs[id].habilitado,
  configurado: true,
  podeTreinar: !params.has('expired'),
  podeConfigurar: admin,
  podeVerEquipe: admin || params.has('team'),
  ...(admin ? { config: configs[id] } : {}),
  prazo: { inicio: '2026-01-01T00:00:00Z', fim: '2026-12-31T23:59:00Z', vigente: !params.has('expired') },
  sessao: states[id]
    ? {
        ...visaoPublica(states[id]),
        processando,
        processandoAte: processando ? new Date(Date.now() + 320000).toISOString() : null,
      }
    : null,
  historico: historicoExtra.length ? historicoExtra.slice(0, 30) : states[id] ? [resumo(states[id])] : [],
  proximoCursor: historicoExtra.length ? 'proxima' : null,
});
w.__paceWrites = [];
w.__pacePendentes = [];
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
    if (q.has('sessaoId'))
      return Response.json({ id: q.get('sessaoId'), nomeVendedor: 'Ana', versaoRegua: 'pace-2', relatorio });
    if (q.has('exportar'))
      return Response.json({
        linhas: [
          {
            ...historicoExtra[0],
            nomeVendedor: '=FORMULA',
            P: 7,
            A: 6,
            C: 5,
            E: 4,
            Media: 5.5,
            Resumo: 'Diagnóstico',
            versaoRegua: 'pace-2',
          },
        ],
      });
    return Response.json({ historico: historicoExtra, proximoCursor: null });
  }
  if (q.has('historico')) return Response.json({ historico: historicoExtra.slice(30), proximoCursor: null });
  if (!init.method) {
    const d = dados(id);
    if (q.has('sessaoId') && historicoExtra.some((h) => h.id === q.get('sessaoId')))
      d.sessao = {
        ...visaoPublica({ ...estado(), id: q.get('sessaoId')!, status: 'concluida', relatorio }),
        processando: false,
        processandoAte: null,
      };
    return Response.json(d);
  }
  const cmd = comandoSchema.parse(JSON.parse(String(init.body))),
    target = cmd.empresaId || empresaA;
  w.__paceWrites.push(cmd);
  if (w.__paceDelay) await new Promise((resolve) => w.__pacePendentes.push(resolve));
  if (cmd.acao === 'iniciar') {
    states[target] = estado();
    states[target]!.id = cmd.requestId;
  }
  const s = states[target];
  if (!s) throw Error('fixture sem sessão');
  if (cmd.acao === 'responder') {
    const n = s.mensagens.filter((m) => m.autor === 'vendedor').length + 1;
    s.mensagens.push(
      { id: cmd.requestId + ':v', turno: n, autor: 'vendedor', texto: cmd.mensagem, fase: s.fase },
      {
        id: cmd.requestId + ':c',
        turno: n,
        autor: 'cliente',
        texto: 'Isso afeta nossas compras e o atendimento. Gostaria de organizar essas informações.',
        fase: s.fase,
      },
    );
  }
  if (cmd.acao === 'encerrar') {
    s.relatorio = { ...relatorio, Media: 5.5 };
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
    <NextIntlClientProvider locale={locale} messages={catalogo[locale]} timeZone="America/Sao_Paulo">
      <TreinoVendas admin={admin} />
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

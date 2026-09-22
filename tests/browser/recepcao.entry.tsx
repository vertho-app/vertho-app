// Harness do simulador de atendimento: componentes e núcleo reais (abrirSessao,
// consolidar, visaoPublica); só navegação, `fetchAuth` e `node:crypto` são
// substituídos pelo bundler. Sem login, banco ou IA.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import TreinoRecepcao from '../../components/recepcao/treino';
import { catalogoLimites } from '../../lib/recepcao/catalogo-limites';
import { aplicarMatrizAtendimento } from '../../lib/recepcao/matriz-avaliacao';
import { abrirSessao, consolidar, fichaPublica, visaoPublica } from '../../lib/recepcao/core';
import { dominioAtendimento } from '../../lib/recepcao/dominio';
import { visaoPorCompetencia } from '../../lib/recepcao/painel';
import { competenciasAtendimento } from '../../lib/recepcao/matriz';
import { evolucaoPorCompetencia } from '../../lib/simuladores/evolucao';
import type { Estado, Insumos } from '../../lib/recepcao/model';
import type { Cenario } from '../../lib/recepcao/schema';
import pt from '../../messages/pt-BR.json';
import ptpt from '../../messages/pt-PT.json';
import en from '../../messages/en-US.json';
import es from '../../messages/es-ES.json';

const w = window as any;
const params = new URLSearchParams(location.search);
const locale = params.get('locale') || 'pt-BR';
const catalogo = { 'pt-BR': pt, 'pt-PT': ptpt, 'en-US': en, 'es-ES': es } as Record<string, any>;
const segmento = params.get('segmento') || 'recepcao_medica';
const admin = params.has('admin');
const semCasos = params.has('semCasos');
// Visão de quem acompanha (RH): a tela abre na aba da equipe.
const equipe = params.has('equipe');
const EMPRESA = '10000000-0000-4000-8000-000000000009';
let dominioEmpresa = segmento;

const base = structuredClone(catalogoLimites[0]);
const cenario: Cenario = aplicarMatrizAtendimento({
  ...base,
  dominio: segmento as Cenario['dominio'],
  ocorrenciasCriticas: dominioAtendimento(segmento).ocorrencias.map((o) => o.id),
});
const registros = [{ id: 'caso-1', versao: cenario.versao, ficha: fichaPublica(cenario) }];
const FALA = 'Entendo o impacto das duas alterações. Qual horário funciona para você?';

function novaSessao(): Estado {
  const s = abrirSessao(cenario, 0);
  s.id = '40000000-0000-4000-8000-000000000001';
  return s;
}
function responder(s: Estado, mensagem: string) {
  const n = s.historico.length;
  s.historico.push(
    { id: `m${n}`, role: 'user', content: mensagem },
    { id: `m${n + 1}`, role: 'assistant', content: 'Só consigo depois das 17h30, e quero manter a mesma profissional.' },
  );
  s.respostas += 1;
  s.revisao += 1;
}
/**
 * Avaliação fictícia com a forma real, consolidada pelo núcleo: Acolhimento,
 * Compreensão e Clareza com 6 observados; Resolução com 3 (fica sem nível pela
 * regra de cobertura); Procedimentos com uma citação que não confere
 * (descartada pela tolerância).
 */
function avaliar(s: Estado) {
  const oportunidade = [{ mensagemId: 'm0', trecho: s.historico[0].content }];
  const insumos: Insumos = {
    dimensoes: cenario.matriz!.competencias.flatMap((comp, ci) =>
      comp.descritores.map((d, di) => {
        const observado = ci !== 3 || di < 3;
        if (!observado)
          return { id: d.codigo, classificacao: 'nao_observavel' as const, justificativa: 'Não houve oportunidade nesta conversa.', evidencias: [], oportunidades: [] };
        const citacao = ci === 4 && di === 0 ? 'Frase que não foi dita.' : 'Qual horário funciona para você?';
        return {
          id: d.codigo,
          classificacao: (ci === 0 && di < 2 ? 'n4' : ci === 2 ? 'n2' : 'n3') as 'n2' | 'n3' | 'n4',
          justificativa: 'Você perguntou pela disponibilidade antes de propor.',
          evidencias: [{ mensagemId: 'm1', trecho: citacao }],
          oportunidades: oportunidade,
        };
      }),
    ),
    ocorrencias: [],
    desfecho: { tipo: 'nao_resolvido', justificativa: 'A conversa terminou sem um combinado.', evidencias: [] },
    feedback: {
      acerto: 'Você reconheceu o impacto e perguntou pela disponibilidade.',
      melhoria: 'Apresente as alternativas autorizadas com data, hora e profissional.',
      novaTentativa: 'Repita o caso confirmando o combinado no fim.',
    },
  };
  s.relatorio = consolidar(s, insumos);
  s.status = 'concluida';
  s.revisao += 1;
}

let sessao: Estado | null = null;
if (params.has('ativo') || params.has('concluido')) {
  sessao = novaSessao();
  responder(sessao, FALA);
  if (params.has('concluido')) avaliar(sessao);
}
const dados = () => ({
  empresaId: EMPRESA,
  empresaNome: 'Empresa de demonstração',
  habilitado: true,
  admin,
  dominio: dominioEmpresa,
  soAcompanha: equipe,
  ficha: semCasos ? null : registros[0].ficha,
  cenarios: semCasos ? [] : registros,
  nivelSugerido: 'introducao',
  sessao: sessao ? { ...visaoPublica(sessao), processando: false } : null,
  podeEquipe: equipe,
  podeCenarios: false,
  evolucao: params.has('evolucao')
    ? {
        competencias: evolucaoPorCompetencia(
          [
            { competencias: { acolhimento: 3.2, compreensao: 3.0, clareza: 2.4, resolucao: null, procedimentos: 3.4 } },
            { competencias: { acolhimento: 2.5, compreensao: 3.1, clareza: 2.2, resolucao: null, procedimentos: 2.6 } },
          ],
          competenciasAtendimento(segmento).map((c) => c.codigo),
        ),
        nomes: Object.fromEntries(competenciasAtendimento(segmento).map((c) => [c.codigo, c.nome])),
      }
    : null,
  historico: sessao
    ? [
        {
          id: sessao.id,
          data: '2026-09-18T15:00:00.000Z',
          status: sessao.status,
          titulo: cenario.publico.titulo,
          nivel: cenario.publico.nivel ?? null,
          nota: sessao.relatorio?.nota ?? null,
          escalaOriginal: null,
          situacao: sessao.relatorio?.situacao ?? null,
        },
      ]
    : [],
});
// Painel da equipe: sessões de duas pessoas, uma que subiu de nível; uma pessoa sem treino.
function sessaoDe(colaborador: string, dias: number) {
  const s = novaSessao();
  s.id = `40000000-0000-4000-8000-0000000000${10 + dias}`;
  responder(s, FALA);
  avaliar(s);
  return { id: s.id, colaborador_id: colaborador, created_at: `2026-09-${String(dias).padStart(2, '0')}T12:00:00Z`, estado: s };
}
const sessoesEquipe = [sessaoDe('p-ana', 16), sessaoDe('p-bruno', 12)];
const painel = () => {
  const competencias = competenciasAtendimento(segmento);
  const visao = visaoPorCompetencia(
    sessoesEquipe,
    [
      { id: 'p-ana', nome: 'Ana Souza', cargo: 'Recepção' },
      { id: 'p-bruno', nome: 'Bruno Lima', cargo: 'Recepção' },
      { id: 'p-carla', nome: 'Carla Dias', cargo: null },
    ],
    competencias.map((c) => c.codigo),
  );
  return {
    iniciadas: 2,
    concluidas: 2,
    pendentes: 2,
    pessoas: [],
    grupos: [{ chave: 'caso|1|r', titulo: cenario.publico.titulo, versao: cenario.versao, sessoes: 2, media: 2.83, criticas: 0, dimensoes: {} }],
    sessoes: sessoesEquipe.map((r) => ({ id: r.id, nome: r.colaborador_id === 'p-ana' ? 'Ana Souza' : 'Bruno Lima', titulo: cenario.publico.titulo, data: r.created_at, status: 'concluida', nota: r.estado.relatorio!.nota, critica: false, revisao: null })),
    dias: 30,
    operacao: null,
    visao: { ...visao, nomes: Object.fromEntries(competencias.map((c) => [c.codigo, c.nome])) },
  };
};
w.__recepcaoWrites = [];
w.__recepcaoFetch = async (url: string, init: RequestInit = {}) => {
  if (url.includes('/config')) {
    if (init.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      w.__recepcaoWrites.push(body);
      dominioEmpresa = body.dominio ?? dominioEmpresa;
      return Response.json({ ok: true });
    }
    return Response.json({
      empresas: [{ id: EMPRESA, nome: 'Empresa de demonstração', habilitado: true, dominio: dominioEmpresa }],
      podeConfigurar: true,
    });
  }
  if (url.includes('/gestao')) {
    const q = new URL(url, location.origin).searchParams;
    if (q.has('sessaoId'))
      return Response.json({ sessao: visaoPublica(sessoesEquipe.find((r) => r.id === q.get('sessaoId'))!.estado) });
    return Response.json(painel());
  }
  if (!init.method || init.method === 'GET') return Response.json(dados());
  const cmd = JSON.parse(String(init.body));
  w.__recepcaoWrites.push(cmd);
  if (cmd.acao === 'iniciar') sessao = novaSessao();
  else if (cmd.acao === 'responder') responder(sessao!, cmd.mensagem);
  else if (cmd.acao === 'encerrar') avaliar(sessao!);
  return Response.json({ sessao: { ...visaoPublica(sessao!), processando: false } });
};
createRoot(document.getElementById('root')!).render(
  <NextIntlClientProvider locale={locale} messages={catalogo[locale]} timeZone="America/Sao_Paulo">
    <TreinoRecepcao admin={admin} />
  </NextIntlClientProvider>,
);

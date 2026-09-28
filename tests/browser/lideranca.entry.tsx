import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import Treino from '../../components/simulador-lideranca/treino';
import {
  executarCore,
  episodioPublico,
  visaoPublica,
} from '../../lib/simulador-lideranca/core';
import { comandoSchema } from '../../lib/simulador-lideranca/schema';
import { sinteseDaJornada } from '../../lib/simulador-lideranca/avaliacao';
import { encontroParaEquipe } from '../../lib/simulador-lideranca/visao-equipe';
import { estado, gerarFixture } from '../fixtures/simulador-lideranca';
import pt from '../../messages/pt-BR.json';
import ptpt from '../../messages/pt-PT.json';
import en from '../../messages/en-US.json';
import es from '../../messages/es-ES.json';
const w = window as any;
const params = new URLSearchParams(location.search);
const locale = params.get('locale') || 'pt-BR';
const catalogo = { 'pt-BR': pt, 'pt-PT': ptpt, 'en-US': en, 'es-ES': es };
let s =
  JSON.parse(sessionStorage.getItem('lideranca-state') || 'null') || estado();
let revisao = Number(sessionStorage.getItem('lideranca-rev') || 0);
let historico: any[] = JSON.parse(
  sessionStorage.getItem('lideranca-history') || '[]',
);
const recibos = new Set<string>();
const repeticoes = () => historico.filter((e) => e.repeticao);
const sintese = () =>
  s.concluidos.length
    ? sinteseDaJornada([...s.concluidos, ...repeticoes()], s.matriz, s.concluidos.length)
    : null;
// A MESMA projeção do servidor (`lib/simulador-lideranca/equipe.ts` importa
// daqui): devolutiva sem conversa, e preparação e reflexão sem o texto (D1, 27/09/2026).
const paraEquipe = encontroParaEquipe;
async function aplicar(cmd: any) {
  const result = await executarCore(s, cmd, gerarFixture, ['', '', '', '', '']);
  s = result.estado;
  revisao++;
  recibos.add(cmd.requestId);
  if (result.arquivo) historico.unshift(result.arquivo);
  sessionStorage.setItem('lideranca-state', JSON.stringify(s));
  sessionStorage.setItem('lideranca-rev', String(revisao));
  sessionStorage.setItem('lideranca-history', JSON.stringify(historico));
  return result.arquivo;
}
w.__liderancaFetch = async (url: string, options?: RequestInit) => {
  const query = new URL(url, location.origin).searchParams;
  if (url.includes('/api/simulador-lideranca/equipe')) {
    if (query.get('pessoa'))
      return Response.json({
        pessoa: { id: 'p1', nome: 'Pessoa em treino', cargo: 'Analista' },
        matriz: s.matriz,
        encontros: [...s.concluidos, ...repeticoes()].map(paraEquipe),
        sintese: sintese(),
      });
    return Response.json({
      empresaId: '10000000-0000-4000-8000-000000000001',
      empresaNome: 'Empresa de demonstração',
      populacao: 2,
      iniciaram: 1,
      concluiram: s.concluidos.length >= 5 ? 1 : 0,
      pessoas: [
        { colaboradorId: 'p1', nome: 'Pessoa em treino', cargo: 'Analista', variante: 'futuro', encontrosConcluidos: s.concluidos.length, emAndamento: s.ativo ? s.ativo.indice : null, ultimaAtividade: '2026-09-18T12:00:00Z', sintese: sintese() },
        { colaboradorId: 'p2', nome: 'Pessoa sem início', cargo: 'Analista', variante: null, encontrosConcluidos: 0, emAndamento: null, ultimaAtividade: null, sintese: null },
      ],
    });
  }
  let id = query.get('episodioId');
  if (options?.method === 'POST') {
    const cmd = comandoSchema.parse(JSON.parse(options.body as string));
    w.__posts = [...(w.__posts || []), { requestId: cmd.requestId, acao: cmd.acao, texto: (cmd as any).texto }];
    if (w.__failNext) {
      w.__failNext = false;
      return Response.json(
        { error: 'Falha de conexão simulada. Tente novamente.' },
        { status: 503 },
      );
    }
    // Corrida (27/09/2026): a rede cai ANTES da resposta e o servidor segue
    // processando; o reenvio com o MESMO requestId bate no lock e recebe 423
    // (como `service.ts`), e logo depois o comando original conclui.
    if (w.__redeCaiNext) {
      w.__redeCaiNext = false;
      w.__emVoo = cmd;
      return Response.json({ error: 'Falha de conexão simulada.' }, { status: 503 });
    }
    if (w.__emVoo) {
      const emVoo = w.__emVoo;
      w.__emVoo = null;
      await aplicar(emVoo);
      return Response.json(
        { error: 'Há um envio em processamento. Aguarde e atualize o encontro.' },
        { status: 423 },
      );
    }
    if (!recibos.has(cmd.requestId)) {
      if (cmd.revisao !== revisao)
        return Response.json({ error: 'Revisão alterada' }, { status: 409 });
      const arquivo = await aplicar(cmd);
      if (arquivo) id = arquivo.id;
      if (w.__loseNext) {
        w.__loseNext = false;
        return Response.json(
          { error: 'Resposta salva; conexão perdida.' },
          { status: 503 },
        );
      }
    }
  }
  const selecionado = id
    ? historico.find((e) => e.id === id)
    : s.ativo || historico[0] || null;
  return Response.json({
    empresaId: '10000000-0000-4000-8000-000000000001',
    empresaNome: 'Empresa de demonstração',
    admin: false,
    jornada: revisao
      ? { ...visaoPublica(s), revisao, processandoAte: w.__processandoAte || null }
      : null,
    selecionado: selecionado ? episodioPublico(selecionado) : null,
    historico: historico.map((e) => ({
      id: e.id,
      indice: e.indice,
      repeticao: e.repeticao,
      created_at: e.encerradoEm,
    })),
    pagina: 0,
    temMais: false,
    sintese: sintese(),
    acompanhaEquipe: params.has('equipe'),
  });
};
createRoot(document.getElementById('root')!).render(
  <NextIntlClientProvider locale={locale} messages={catalogo[locale]}>
    <Treino podeTreinar={!params.has('soEquipe')} podeAcompanhar={params.has('equipe') || params.has('soEquipe')} />
  </NextIntlClientProvider>,
);

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
import { estado, gerarFixture } from '../fixtures/simulador-lideranca';
import pt from '../../messages/pt-BR.json';
import ptpt from '../../messages/pt-PT.json';
import en from '../../messages/en-US.json';
import es from '../../messages/es-ES.json';
const w = window as any;
const locale = new URLSearchParams(location.search).get('locale') || 'pt-BR';
const catalogo = { 'pt-BR': pt, 'pt-PT': ptpt, 'en-US': en, 'es-ES': es };
let s =
  JSON.parse(sessionStorage.getItem('lideranca-state') || 'null') || estado();
let revisao = Number(sessionStorage.getItem('lideranca-rev') || 0);
let historico: any[] = JSON.parse(
  sessionStorage.getItem('lideranca-history') || '[]',
);
const recibos = new Set<string>();
w.__liderancaFetch = async (url: string, options?: RequestInit) => {
  const query = new URL(url, location.origin).searchParams;
  let id = query.get('episodioId');
  if (options?.method === 'POST') {
    const cmd = comandoSchema.parse(JSON.parse(options.body as string));
    if (w.__failNext) {
      w.__failNext = false;
      return Response.json(
        { error: 'Falha de conexão simulada. Tente novamente.' },
        { status: 503 },
      );
    }
    if (!recibos.has(cmd.requestId)) {
      if (cmd.revisao !== revisao)
        return Response.json({ error: 'Revisão alterada' }, { status: 409 });
      const result = await executarCore(s, cmd, gerarFixture, [
        '',
        '',
        '',
        '',
        '',
      ]);
      s = result.estado;
      revisao++;
      recibos.add(cmd.requestId);
      if (result.arquivo) {
        historico.unshift(result.arquivo);
        id = result.arquivo.id;
      }
      sessionStorage.setItem('lideranca-state', JSON.stringify(s));
      sessionStorage.setItem('lideranca-rev', String(revisao));
      sessionStorage.setItem('lideranca-history', JSON.stringify(historico));
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
      ? { ...visaoPublica(s), revisao, processandoAte: null }
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
  });
};
createRoot(document.getElementById('root')!).render(
  <NextIntlClientProvider locale={locale} messages={catalogo[locale]}>
    <Treino />
  </NextIntlClientProvider>,
);

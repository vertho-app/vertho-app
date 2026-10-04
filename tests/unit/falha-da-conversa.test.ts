import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';
import {
  chamarConversa, chaveDaFalha, classificarFalhaHttp, type FalhaDaConversa, type TipoFalhaConversa,
} from '@/lib/season-engine/falha-da-conversa';
import ErroDaConversa from '@/components/temporada/erro-da-conversa';
import { checarGatesSemana } from '@/lib/season-engine/trilha-runtime';
import { slotDaConversa, contarTurnosIa } from '@/lib/season-engine/week-gating';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-91 (04/10/2026): as conversas da semana quando algo falha.
 *
 * A tela fazia `.then((r) => r.json())` sem olhar o status: 500, 429, limite diário e
 * 403 viravam "resposta sem histórico" e sumiam; a fala digitada ficava só na tela
 * (nunca foi gravada) e desaparecia no F5; e em 504 do gateway (HTML) ou queda de rede
 * o `r.json()` lançava, o "pensando" ficava eterno e o campo travava.
 *
 * Aqui: a classificação (status + código da rota), a chamada que nunca lança, o texto
 * nos 4 idiomas e o componente que o mostra.
 */

const resposta = (corpo: unknown, init: ResponseInit = {}) =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), init);

describe('classificarFalhaHttp', () => {
  const tipo = (status: number, corpo: Record<string, any> | null = {}, retry?: number) =>
    classificarFalhaHttp(status, corpo, retry);

  it('cada status e código vira a falha certa', () => {
    expect(tipo(401).tipo).toBe('sessao');
    expect(tipo(403, { codigo: 'conteudo-nao-aberto' }).tipo).toBe('conteudo-nao-aberto');
    expect(tipo(403, { codigo: 'semana-bloqueada' }).tipo).toBe('semana-bloqueada');
    // 403 sem código conhecido: a regra "só a própria pessoa responde" e afins.
    expect(tipo(403, { error: 'Só a própria pessoa...' }).tipo).toBe('sem-permissao');
    expect(tipo(500, { error: 'Erro na IA', codigo: 'ia' }).tipo).toBe('ia');
    expect(tipo(503, { codigo: 'indisponivel' }).tipo).toBe('indisponivel');
    expect(tipo(500, { error: 'qualquer coisa' }).tipo).toBe('indisponivel');
    expect(tipo(400, { error: 'campo' }).tipo).toBe('generica');
    expect(tipo(404, { error: 'trilha não encontrada' }).tipo).toBe('generica');
  });

  it('🔴 os dois 429 são diferentes: o limite do DIA traz o número, o das mensagens seguidas traz a espera', () => {
    expect(tipo(429, { codigo: 'limite-diario', limite: 10 })).toEqual({ tipo: 'limite-diario', limite: 10 });
    expect(tipo(429, {}, 7)).toEqual({ tipo: 'muitas-seguidas', esperaSegundos: 7 });
    expect(tipo(429, { codigo: 'x', esperaSegundos: 2.2 })).toEqual({ tipo: 'muitas-seguidas', esperaSegundos: 3 });
    // Sem número nenhum, a falha continua sendo uma falha dita (o texto tem reserva).
    expect(tipo(429, {})).toEqual({ tipo: 'muitas-seguidas' });
  });
});

describe('chamarConversa: nunca lança, sempre diz o que houve', () => {
  it('🔴 queda de rede (fetch rejeita): `rede`, não exceção', async () => {
    const r = await chamarConversa(async () => { throw new TypeError('Failed to fetch'); });
    expect(r).toEqual({ ok: false, falha: { tipo: 'rede' } });
  });

  it('🔴 504 do gateway em HTML (o `r.json()` lançava e travava o "pensando")', async () => {
    const r = await chamarConversa(async () => resposta('<html>504 Gateway Time-out</html>', { status: 504 }));
    expect(r).toEqual({ ok: false, falha: { tipo: 'sem-corpo' } });
  });

  it('500 com JSON: a falha vem do código da rota', async () => {
    const r = await chamarConversa(async () => resposta({ error: 'Erro na IA', codigo: 'ia' }, { status: 500 }));
    expect(r).toEqual({ ok: false, falha: { tipo: 'ia' } });
  });

  it('429 do limite diário e 403 do conteúdo: o código decide', async () => {
    const dia = await chamarConversa(async () => resposta({ codigo: 'limite-diario', limite: 10 }, { status: 429 }));
    expect(dia).toEqual({ ok: false, falha: { tipo: 'limite-diario', limite: 10 } });
    const aberto = await chamarConversa(async () => resposta({ codigo: 'conteudo-nao-aberto' }, { status: 403 }));
    expect(aberto).toEqual({ ok: false, falha: { tipo: 'conteudo-nao-aberto' } });
  });

  it('429 do limitador geral: a espera sai do cabeçalho Retry-After', async () => {
    const r = await chamarConversa(async () => resposta({ error: 'Rate limit excedido' }, { status: 429, headers: { 'Retry-After': '12' } }));
    expect(r).toEqual({ ok: false, falha: { tipo: 'muitas-seguidas', esperaSegundos: 12 } });
  });

  it('200 com JSON: devolve os dados', async () => {
    const r = await chamarConversa(async () => resposta({ message: 'oi', history: [], finished: false }));
    expect(r).toEqual({ ok: true, dados: { message: 'oi', history: [], finished: false } });
  });

  it('200 sem corpo legível também é falha (não há o que mostrar)', async () => {
    const r = await chamarConversa(async () => resposta('não é json', { status: 200 }));
    expect(r).toEqual({ ok: false, falha: { tipo: 'sem-corpo' } });
  });
});

describe('o texto: toda falha tem mensagem nos 4 idiomas', () => {
  const TIPOS: TipoFalhaConversa[] = [
    'rede', 'sem-corpo', 'sessao', 'sem-permissao', 'conteudo-nao-aberto', 'semana-bloqueada',
    'limite-diario', 'muitas-seguidas', 'indisponivel', 'ia', 'consumo-nao-gravado', 'generica',
  ];
  const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
  const mensagens = (loc: string) => JSON.parse(readFileSync(`messages/${loc}.json`, 'utf-8'));

  it('🔴 cada chave que `chaveDaFalha` devolve existe em SeasonWeek de todos os locales, sem travessão', () => {
    for (const loc of LOCALES) {
      const sw = mensagens(loc).SeasonWeek;
      for (const t of TIPOS) {
        const { chave } = chaveDaFalha({ tipo: t });
        const valor = chave.split('.').reduce((o: any, k) => o?.[k], sw);
        expect(typeof valor, `${loc} ${chave}`).toBe('string');
        expect(valor, `${loc} ${chave}`).not.toMatch(/[\u2013\u2014]/);
      }
      expect(typeof sw.chatError.retry).toBe('string');
      expect(typeof sw.qa.notSaved).toBe('string');
    }
  });

  it('os parâmetros chegam ao texto no idioma da pessoa', () => {
    for (const loc of LOCALES) {
      const t = createTranslator({ locale: loc, messages: mensagens(loc), namespace: 'SeasonWeek' }) as any;
      const dia = chaveDaFalha({ tipo: 'limite-diario', limite: 10 });
      expect(t(dia.chave, dia.params), loc).toContain('10');
      const espera = chaveDaFalha({ tipo: 'muitas-seguidas', esperaSegundos: 7 });
      expect(t(espera.chave, espera.params), loc).toContain('7');
    }
  });

  it('só oferece "tentar de novo" onde repetir pode mudar o resultado', () => {
    const repete = (f: FalhaDaConversa) => chaveDaFalha(f).repetir;
    for (const t of ['rede', 'sem-corpo', 'indisponivel', 'ia', 'consumo-nao-gravado', 'conteudo-nao-aberto', 'muitas-seguidas'] as const) {
      expect(repete({ tipo: t }), t).toBe(true);
    }
    for (const t of ['sessao', 'sem-permissao', 'semana-bloqueada', 'limite-diario'] as const) {
      expect(repete({ tipo: t }), t).toBe(false);
    }
  });
});

describe('ErroDaConversa: o que a pessoa vê', () => {
  const t = (loc: string) => createTranslator({ locale: loc, messages: JSON.parse(readFileSync(`messages/${loc}.json`, 'utf-8')), namespace: 'SeasonWeek' }) as any;
  const html = (falha: FalhaDaConversa, onRetry?: () => void, loc = 'pt-BR') =>
    renderToStaticMarkup(createElement(ErroDaConversa, { falha, onRetry, t: t(loc) }));

  it('🔴 a falha aparece como alerta, com o texto traduzido e o botão de tentar de novo', () => {
    const saida = html({ tipo: 'ia' }, () => {});
    expect(saida).toContain('role="alert"');
    expect(saida).toContain('O mentor não conseguiu responder agora');
    expect(saida).toContain('Tentar de novo');
    expect(html({ tipo: 'ia' }, () => {}, 'en-US')).toContain('Try again');
  });

  it('o limite do dia diz o número e NÃO oferece repetir', () => {
    const saida = html({ tipo: 'limite-diario', limite: 10 }, () => {});
    expect(saida).toContain('10 perguntas');
    expect(saida).not.toContain('<button');
  });

  it('sem ação de repetição não há botão, mesmo onde repetir faria sentido', () => {
    expect(html({ tipo: 'rede' })).not.toContain('<button');
  });
});

describe('checarGatesSemana: leitura que falhou não é "conclua a semana anterior"', () => {
  const TRILHA = { id: 't1', empresa_id: 'e1', data_inicio: '2020-01-01', temporada_plano: [{ semana: 1 }, { semana: 2 }] };

  it('🔴 a leitura da semana anterior que falhou vira 503 `indisponivel`, não 403', async () => {
    const sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'select', mensagem: 'timeout no pool' });
    const gate = await checarGatesSemana(sb.client, TRILHA as any, 2);
    expect(gate).toMatchObject({ status: 503, codigo: 'indisponivel' });
  });

  it('semana anterior não concluída segue sendo 403 com o código que a tela traduz', async () => {
    const sb = criarSupabaseMock({ resolver: () => ({ semana: 1, status: 'em_andamento' }) });
    const gate = await checarGatesSemana(sb.client, TRILHA as any, 2);
    expect(gate).toMatchObject({ status: 403, codigo: 'semana-bloqueada' });
  });

  it('semana concluída libera', async () => {
    const sb = criarSupabaseMock({ resolver: () => ({ semana: 1, status: 'concluido' }) });
    expect(await checarGatesSemana(sb.client, TRILHA as any, 2)).toBeNull();
  });
});

describe('slotDaConversa pela semana do Cenário B (R-124)', () => {
  it('🔴 na Jornada o fechamento é a 7 e guarda em `feedback`; o literal 14 não o enxergava', () => {
    expect(slotDaConversa(7, 'avaliacao', 7)).toBe('feedback');
    expect(slotDaConversa(7, 'avaliacao')).toBe('reflexao');
    expect(slotDaConversa(14, 'avaliacao')).toBe('feedback');
    expect(slotDaConversa(3, 'conteudo', 7)).toBe('reflexao');
    expect(slotDaConversa(4, 'aplicacao', 7)).toBe('feedback');
  });

  it('contarTurnosIa lê o slot certo do fechamento', () => {
    const progresso = { reflexao: { transcript_completo: [{ role: 'assistant' }] }, feedback: { transcript_completo: [{ role: 'assistant' }, { role: 'assistant' }] } };
    expect(contarTurnosIa(progresso, 7, 'avaliacao', 7)).toBe(2);
    expect(contarTurnosIa(progresso, 7, 'avaliacao')).toBe(1);
  });
});

describe('a página da semana usa a chamada que não trava', () => {
  const fonte = readFileSync('app/dashboard/temporada/semana/[week]/page.tsx', 'utf-8');

  it('🔴 nenhuma conversa lê `r.json()` direto da resposta (era o que lançava em 504)', () => {
    expect(fonte).not.toMatch(/\.then\(\s*\(?r\)?\s*=>\s*r\.json\(\)\s*\)/);
    expect((fonte.match(/chamarConversa\(/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('o "pensando" sai num `finally`, e a fala volta ao campo quando a rota não a aceitou', () => {
    for (const busy of ['setChatBusy(false)', 'setTdBusy(false)', 'setMissaoBusy(false)']) {
      const i = fonte.indexOf(busy);
      expect(i, busy).toBeGreaterThan(-1);
      expect(fonte.slice(Math.max(0, i - 400), i), busy).toMatch(/finally\s*\{/);
    }
    expect(fonte).toContain('setChatInput(msg)');
    expect(fonte).toContain('setTdInput(msg)');
  });

  it('o fim da temporada é o do plano, não a semana 14 (R-124)', () => {
    expect(fonte).not.toMatch(/semanaNum\s*>=\s*14/);
    expect(fonte).toMatch(/semanaNum\s*>=\s*totalSemanasDoPlano\(/);
  });

  it('o aviso de resposta não gravada e o Tira-Dúvidas que grava o consumo antes (R-140)', () => {
    expect(fonte).toContain("r.dados.salvo === false");
    expect(fonte).toContain('garantirConsumoGravado');
    // O `.catch(() => {})` mudo da marcação saiu do card do Tira-Dúvidas.
    expect(fonte).not.toMatch(/marcarConteudoConsumido\([^)]*\)\.catch\(\(\)\s*=>\s*\{\}\)\s*;\s*\n\s*setTdOpen/);
  });
});

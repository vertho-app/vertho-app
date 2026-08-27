import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { linhasDaReflexaoSemanal } from '@/lib/season-engine/evidencia-semana';

/**
 * A semana entrega 2 descritores e a conversa produzia UMA leitura, creditada só
 * ao `descritor` principal do slot. Creditar os dois dependia de
 * `evidenciaPorCobertos`, que valia `modo === 'piloto'` — só na degustação.
 *
 * 🔑 Medido em 27/08/2026, macae (jornada, 38 trilhas): dos **364** pares
 * trilha×descritor selecionados, **136 (37%)** chegavam ao fechamento com
 * "(sem evidência registrada)". São os segundos descritores de cada semana, e a
 * jornada não tem semana de missão que os alcance por outro caminho.
 *
 * O denominador importa: não é "achei um caso" — é mais de um terço da régua
 * que a acumulada avalia chegando lá sem nada para ler.
 */

const REFLEXAO_NOVA = {
  insight_principal: 'registrar mudou a conversa de lugar',
  desafio_realizado: 'parcial',
  qualidade_reflexao: 'alta',
  avaliacao_por_descritor: [
    {
      descritor: 'Sustentação do combinado',
      apareceu: true,
      forca_evidencia: 'moderada',
      observacao: 'retomou o combinado com a professora e registrou por escrito',
      trecho_sustentador: 'mandei por escrito no grupo depois da conversa',
      limite: 'não relatou o que aconteceu na semana seguinte',
    },
    {
      descritor: 'Busca de apoio e rede',
      apareceu: false,
      forca_evidencia: 'fraca',
      observacao: '',
      trecho_sustentador: '',
      limite: 'não chegou a envolver a direção nem pedir apoio a ninguém',
    },
  ],
};

const REFLEXAO_ANTIGA = {
  insight_principal: 'registrar mudou a conversa de lugar',
  desafio_realizado: 'parcial',
  qualidade_reflexao: 'alta',
  sinais_extraidos: { exemplo_concreto: true, autopercepcao: false },
};

const COBERTOS = ['Sustentação do combinado', 'Busca de apoio e rede'];

describe('leitura POR DESCRITOR (conversa nova)', () => {
  it('cada descritor recebe a leitura DELE — não a mesma linha duplicada', () => {
    const linhas = linhasDaReflexaoSemanal({
      semana: 3, reflexao: REFLEXAO_NOVA, descritorPrincipal: COBERTOS[0], descritoresCobertos: COBERTOS,
    });
    expect(linhas).toHaveLength(2);
    expect(linhas[0].texto).not.toBe(linhas[1].texto);
    expect(linhas[0].texto).toContain('registrou por escrito');
    expect(linhas[1].texto).not.toContain('registrou por escrito');
  });

  it('🔴 `apareceu: false` vira um veredito EXPLÍCITO, não uma linha vazia', () => {
    // Este é o ponto do exercício: "não apareceu" é informação para a acumulada.
    // Omitir a linha faria o descritor cair no "(sem evidência registrada)" —
    // que não distingue "a conversa não cobriu" de "a semana não aconteceu".
    const linhas = linhasDaReflexaoSemanal({
      semana: 3, reflexao: REFLEXAO_NOVA, descritoresCobertos: COBERTOS,
    });
    const busca = linhas.find((l) => l.descritor === 'Busca de apoio e rede')!;
    expect(busca.texto).toContain('NÃO apareceu na conversa');
    expect(busca.texto).toContain('não chegou a envolver a direção');
  });

  it('não vaza observação/trecho de um descritor que não apareceu', () => {
    const linhas = linhasDaReflexaoSemanal({ semana: 3, reflexao: REFLEXAO_NOVA, descritoresCobertos: COBERTOS });
    const busca = linhas.find((l) => l.descritor === 'Busca de apoio e rede')!;
    expect(busca.texto).not.toContain('força:');
    expect(busca.texto).not.toContain('trecho:');
  });

  it('descritor coberto que o extrator não devolveu não herda a leitura do outro', () => {
    const linhas = linhasDaReflexaoSemanal({
      semana: 3,
      reflexao: { avaliacao_por_descritor: [REFLEXAO_NOVA.avaliacao_por_descritor[0]] },
      descritoresCobertos: COBERTOS,
    });
    const orfao = linhas.find((l) => l.descritor === 'Busca de apoio e rede')!;
    expect(orfao.texto).toContain('sem leitura específica');
    expect(orfao.texto).not.toContain('registrou por escrito');
  });
});

describe('transcript ANTIGO (as 86 conversas já concluídas)', () => {
  it('🔴 os DOIS descritores recebem a leitura da semana — nenhum fica sem nada', () => {
    const linhas = linhasDaReflexaoSemanal({
      semana: 3, reflexao: REFLEXAO_ANTIGA, descritorPrincipal: COBERTOS[0], descritoresCobertos: COBERTOS,
    });
    expect(linhas.map((l) => l.descritor)).toEqual(COBERTOS);
    expect(linhas.every((l) => l.texto.includes('insight'))).toBe(true);
  });

  it('a linha DIZ que é leitura da semana, não do descritor', () => {
    // Sem esse aviso, a acumulada leria duas leituras independentes onde há uma
    // só — e trataria repetição como confirmação.
    const linhas = linhasDaReflexaoSemanal({
      semana: 3, reflexao: REFLEXAO_ANTIGA, descritoresCobertos: COBERTOS,
    });
    expect(linhas[0].texto).toContain('leitura da SEMANA');
  });

  it('semana de um descritor só não ganha o aviso (não há o que separar)', () => {
    const linhas = linhasDaReflexaoSemanal({
      semana: 3, reflexao: REFLEXAO_ANTIGA, descritoresCobertos: ['Sustentação do combinado'],
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].texto).not.toContain('leitura da SEMANA');
  });

  it('sem lista de cobertos, cai no descritor principal', () => {
    const linhas = linhasDaReflexaoSemanal({
      semana: 3, reflexao: REFLEXAO_ANTIGA, descritorPrincipal: 'Sustentação do combinado', descritoresCobertos: [],
    });
    expect(linhas.map((l) => l.descritor)).toEqual(['Sustentação do combinado']);
  });

  it('sem reflexão e sem descritor: nada, sem quebrar', () => {
    expect(linhasDaReflexaoSemanal({ semana: 3, reflexao: null })).toEqual([]);
    expect(linhasDaReflexaoSemanal({ semana: 3, reflexao: REFLEXAO_ANTIGA, descritoresCobertos: [] })).toEqual([]);
  });
});

describe('a régua é ÚNICA — as duas agregações passam por ela', () => {
  // Estático: as duas funções fazem I/O de Supabase. O que precisa ficar travado
  // é que nenhuma volte a ter cópia própria — elas divergiam em formatação e
  // compartilhavam o mesmo defeito.
  const FECHAMENTO = readFileSync(join(process.cwd(), 'lib/season-engine/evidencias-fechamento.ts'), 'utf-8');
  const ACUMULADA = readFileSync(join(process.cwd(), 'lib/season-engine/avaliacao-acumulada-core.ts'), 'utf-8');

  it('evidencias-fechamento usa a fonte única', () => {
    expect(FECHAMENTO).toContain('linhasDaReflexaoSemanal({');
  });

  it('avaliacao-acumulada-core usa a fonte única', () => {
    expect(ACUMULADA).toContain('linhasDaReflexaoSemanal({');
  });

  it('🔑 o gate `evidenciaPorCobertos` não volta em nenhuma das duas', () => {
    // Ele valia `modo === 'piloto'` e era a única porta para creditar os dois
    // descritores. Um parâmetro que não decide mais nada, mantido "por
    // compatibilidade", é como a régua velha reaparece.
    expect(FECHAMENTO).not.toContain('evidenciaPorCobertos:');
    expect(ACUMULADA).not.toContain('evidenciaPorCobertos');
  });

  it('nenhuma das duas monta a linha de reflexão por conta própria', () => {
    // A marca da cópia antiga: montar `insight:` na mão dentro do agregador.
    expect(FECHAMENTO).not.toContain('`insight: "${p.reflexao.insight_principal}"`');
    expect(ACUMULADA).not.toContain('`insight: "${p.reflexao.insight_principal}"`');
  });
});

describe('o extrator socrático pede a leitura por descritor', () => {
  const ROTA = readFileSync(join(process.cwd(), 'app/api/temporada/reflection/route.ts'), 'utf-8');

  it('o JSON pedido inclui `avaliacao_por_descritor`', () => {
    expect(ROTA).toContain('"avaliacao_por_descritor": [');
  });

  it('🔑 sem `nota` — a conversa de reflexão não é avaliação formal', () => {
    // Uma nota aqui viraria segunda régua ao lado de `nivelDaNota`, e a
    // evidência socrática é mais fraca por natureza que a de missão.
    const bloco = ROTA.slice(ROTA.indexOf('const avaliacaoField'), ROTA.indexOf('const user = `MODO: socratic'));
    expect(bloco).toContain('"apareceu": true|false');
    expect(bloco).not.toContain('"nota"');
  });

  it('`apareceu` só é verdadeiro quando o modelo disser exatamente true', () => {
    // Default true faria item malformado virar evidência positiva no fechamento.
    expect(ROTA).toContain('apareceu: d.apareceu === true');
  });
});

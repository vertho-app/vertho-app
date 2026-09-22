import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engagementBlocker } from '@/lib/engajamento/prioridades';

/**
 * "Quantas pessoas finalizaram?" era uma pergunta sem resposta na tela.
 *
 * `Medido em Ibipeba, 14/09/2026` (36 trilhas ativas, plano de 9 semanas): o
 * card "Onde as pessoas estão agora" mostrava **7** na semana 9 e a lista dizia
 * "Semana 9 · em curso" para todas as sete. No banco, uma havia concluído a
 * semana 9 (a última do plano), uma estava no meio da arguição e cinco não
 * tinham escrito nada. Duas coisas diferentes (chegar à última etapa e
 * terminá-la) tinham o mesmo rótulo e a mesma cor.
 *
 * Além disso, o estado terminal era `emerald` ao lado do `cyan` de "em curso":
 * hues vizinhos, e numa fatia de poucos pixels a barra lia como sólida.
 *
 * Asserções estáticas (mesmo padrão de `semana-gates-tela`): montar os painéis
 * exigiria Supabase e sessão, e o que precisa ficar travado aqui é o CONTRATO
 * entre as telas e a régua de fim de jornada. Validado por mutação.
 */

const ler = (caminho: string) => readFileSync(join(process.cwd(), caminho), 'utf-8');

const PAINEL = ler('components/engajamento/engagement-panel.tsx');
const GESTOR = ler('app/dashboard/gestor/engajamento/team-engagement.tsx');
const ROLLUP = ler('lib/engajamento/roll-up.ts');

describe('a régua de fim de jornada chega às telas', () => {
  it('o roll-up publica o veredito e o total de semanas do plano', () => {
    expect(ROLLUP).toContain('jornadaConcluida: posicao.jornadaConcluida');
    expect(ROLLUP).toContain('totalSemanasJornada: posicao.totalSemanas');
    expect(ROLLUP).toContain('finalizaramJornada:');
  });

  it('quem terminou não é contado como atrasado', () => {
    // O relógio da cadência segue andando depois do fim do plano; sem isto,
    // quem concluiu voltaria a aparecer como "etapa pendente" na semana
    // seguinte ao encerramento.
    expect(ROLLUP).toContain('jornadaAtrasada: posicao.atrasada && !posicao.jornadaConcluida');
  });

  it('as duas telas decidem pelo campo do roll-up, sem régua própria', () => {
    for (const tela of [PAINEL, GESTOR]) {
      expect(tela).toContain('function finalizouJornada(');
      expect(tela).toContain('pessoa?.jornadaConcluida');
    }
  });
});

describe('a tela DIZ quem finalizou', () => {
  it('o painel de RH tem badge, contador e recorte próprios do fim de jornada', () => {
    expect(PAINEL).toContain('Jornada concluída');
    expect(PAINEL).toContain('concluiu a jornada');
    expect(PAINEL).toContain('com a jornada concluída');
    expect(PAINEL).toContain("'finalizados'");
    expect(PAINEL).toContain("['finalizados', 'Finalizaram'");
  });

  it('o painel do gestor também nomeia o estado terminal', () => {
    expect(GESTOR).toContain('Jornada concluída');
    expect(GESTOR).toContain("['finalizados', 'Finalizaram'");
  });

  it('"Em movimento" não engorda com quem já terminou', () => {
    // Os recortes somam o total: quem fechou o plano não é alguém para
    // empurrar, é alguém para reconhecer.
    expect(PAINEL).toContain('!pedeAcompanhamento(c) && !finalizouJornada(c)');
    expect(GESTOR).toContain('pessoas.length - emAtencao - finalizaram');
  });

  it('o estado terminal é lido ANTES da posição e do atraso', () => {
    const painelBadge = PAINEL.indexOf('function SemanaBadge');
    const painelFim = PAINEL.indexOf('finalizouJornada(pessoa)', painelBadge);
    const painelAtraso = PAINEL.indexOf('pessoa.jornadaAtrasada', painelBadge);
    expect(painelFim).toBeGreaterThan(-1);
    expect(painelFim).toBeLessThan(painelAtraso);

    const gestorBadge = GESTOR.indexOf('function EtapaJornada');
    const gestorFim = GESTOR.indexOf('finalizouJornada(pessoa)', gestorBadge);
    const gestorIndisponivel = GESTOR.indexOf('semanaAcessivel == null', gestorBadge);
    expect(gestorFim).toBeGreaterThan(-1);
    expect(gestorFim).toBeLessThan(gestorIndisponivel);
  });
});

describe('a cor do estado terminal se separa do "em curso"', () => {
  it('a barra e os badges do fim de jornada não usam mais a família do cyan', () => {
    const estados = PAINEL.slice(PAINEL.indexOf('const ESTADO_JORNADA'), PAINEL.indexOf('const temSinal'));
    expect(estados).toContain("dot: 'bg-fuchsia-300'");
    expect(estados).toContain("dot: 'bg-violet-400'");
    expect(estados).not.toContain('emerald');
    expect(estados).toContain("label: 'jornada concluída'");
  });

  it('a barra pinta as fatias pelo mapa de estados, não por classe solta', () => {
    expect(PAINEL).toContain('ESTADO_JORNADA.finalizada.dot');
    expect(PAINEL).toContain('ESTADO_JORNADA.concluida.dot');
    // A fatia de 1 em 7 tinha ~8px e desaparecia ao lado da vizinha.
    expect(PAINEL).toContain('minHeight: 6');
  });

  it('a legenda sai do mapa de estados: estado novo não fica sem rótulo', () => {
    expect(PAINEL).toContain('Object.values(ESTADO_JORNADA).map');
    const estados = PAINEL.slice(PAINEL.indexOf('const ESTADO_JORNADA'), PAINEL.indexOf('const temSinal'));
    expect((estados.match(/label:/g) || []).length).toBe(4);
  });
});

describe('quem terminou não recebe pendência inventada', () => {
  it('o blocker devolve null para a jornada concluída', () => {
    expect(engagementBlocker({ jornadaConcluida: true })).toBeNull();
    // Sem o campo, a régua antiga continua valendo para todo mundo.
    expect(engagementBlocker({})).toBe('ativacao');
    expect(engagementBlocker({ consumiu: true })).toBe('evidencia');
  });

  it('a próxima ação de quem terminou não é "evidência pendente"', () => {
    const proxima = PAINEL.slice(PAINEL.indexOf('function ProximaAcao'), PAINEL.indexOf('function PessoaCard'));
    expect(proxima.indexOf('finalizouJornada(pessoa)')).toBeLessThan(proxima.indexOf('Etapa concluída'));
  });
});

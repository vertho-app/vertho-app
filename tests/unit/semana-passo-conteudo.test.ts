/**
 * O resumo da semana e o que está embaixo dele dizem A MESMA COISA?
 *
 * POR QUE ESTE ARQUIVO EXISTE (medido 27/08/2026)
 * ──────────────────────────────────────────────
 * A tela da semana respondia o passo "Conteúdo" com `podeConversar`, que inclui
 * `nadaParaAbrir`. Numa semana sem nenhum formato abrível ela anunciava
 * "Conteúdo · feito" antes de a pessoa fazer coisa alguma — e três linhas
 * abaixo mostrava um botão verde "Marcar como realizado". A mesma dobra dizia
 * que estava feito e pedia para fazer; clicar no botão não mudava o resumo,
 * porque ele já dizia "feito".
 *
 * 🔑 O `b76eb17b` (25/08) já tinha atacado exatamente isso — "a instrucao e os
 * botoes passam a falar do MESMO estado" — e corrigiu METADE: alinhou a
 * instrução e deixou o resumo de fora. Nada segurava as duas pontas juntas,
 * então a metade que faltou não apareceu. É essa lacuna que este arquivo fecha,
 * e é por isso que ele tem as duas metades: a régua (comportamento) e o
 * contrato da tela (estático).
 *
 * ⚠️ ALCANCE — o número do commit (`e8eaa762`) está ERRADO e fica registrado
 * aqui porque a mensagem de commit não se corrige. Ele diz "106 semanas, 47
 * pessoas, 6 tenants"; isso contava como defeito toda semana sem
 * `formatos_disponiveis`, e semana de APLICAÇÃO e de AVALIAÇÃO não tem conteúdo
 * por design. Recontado pelo tipo da semana:
 *
 *   · o caso que este arquivo trava: **33 semanas, 6 pessoas, 4 tenants**
 *     (`teste-piloto`, `projetomacae`, `acme-demo`, `gruposinal`);
 *   · semanas de conteúdo liberadas: 377, com **1** sem bloco — o pipeline de
 *     conteúdo está saudável, ao contrário do que o número inflado sugeria;
 *   · e sobrou um caso MAIOR, ainda aberto: em semana de `aplicacao` o resumo
 *     diz "Conteúdo · a fazer" para **61 semanas / 46 pessoas**, prometendo
 *     uma etapa que aquela semana nunca terá (ali `nadaParaAbrir` é `false`,
 *     porque não há entrega nenhuma — o defeito escapa por baixo desta régua).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estadoDoPassoConteudo } from '@/lib/season-engine/consumo-conteudo';
import ptBR from '@/messages/pt-BR.json';

const TELA = readFileSync(
  join(process.cwd(), 'app/dashboard/temporada/semana/[week]/page.tsx'),
  'utf-8',
);

describe('a régua do passo "Conteúdo"', () => {
  it('semana SEM formato abrível não conta como feita — nem como pendente', () => {
    // O defeito em uma linha: aqui a tela dizia 'feito'.
    expect(estadoDoPassoConteudo({ nadaParaAbrir: true, conteudoConsumido: false }))
      .toBe('sem-conteudo');
  });

  it('e continua "sem conteúdo" mesmo se a marcação existir', () => {
    // `startChat` grava `conteudo_consumido` ao entrar na conversa. Isso conta a
    // história da PESSOA (passo 2), não a da SEMANA: sem formato para abrir, a
    // semana segue sem conteúdo. Dizer "feito" aqui inventaria uma etapa.
    expect(estadoDoPassoConteudo({ nadaParaAbrir: true, conteudoConsumido: true }))
      .toBe('sem-conteudo');
  });

  it('com conteúdo e consumo registrado, é feito', () => {
    expect(estadoDoPassoConteudo({ nadaParaAbrir: false, conteudoConsumido: true }))
      .toBe('feito');
  });

  it('com conteúdo e sem consumo, é a fazer', () => {
    expect(estadoDoPassoConteudo({ nadaParaAbrir: false, conteudoConsumido: false }))
      .toBe('a-fazer');
  });
});

describe('a tela usa a régua única — e não uma cópia dela', () => {
  it('o resumo NÃO decide o passo por `podeConversar`', () => {
    // `podeConversar` responde "pode ir para as evidências?" (gate).
    // O passo responde "o conteúdo foi feito?" (estado). Confundir os dois é o
    // defeito inteiro — e é uma linha só de distância.
    expect(TELA).not.toMatch(/podeConversar\s*\?\s*t\('progress\.contentDone'\)/);
  });

  it('o resumo se apoia em `estadoDoPassoConteudo`', () => {
    expect(TELA).toContain('estadoDoPassoConteudo({ nadaParaAbrir, conteudoConsumido })');
  });

  it('os três rótulos do passo existem no i18n', () => {
    // O caminho é `SeasonWeek.progress`. Escrever `temporada.progress` (o que
    // eu tinha suposto) faz TODA chave voltar `undefined` — e o teste do bloco
    // abaixo, que exige `undefined`, passaria sem olhar coisa alguma.
    const p = (ptBR as any).SeasonWeek?.progress ?? {};
    expect(Object.keys(p).length, 'SeasonWeek.progress vazio — caminho errado?').toBeGreaterThan(0);
    for (const chave of ['contentDone', 'contentPending', 'contentNone']) {
      expect(typeof p[chave], `progress.${chave} ausente`).toBe('string');
      expect(p[chave].length).toBeGreaterThan(0);
    }
  });
});

describe('o botão manual não volta', () => {
  it('a tela não renderiza mais "Marcar como realizado"', () => {
    // Ele não destravava nada: `podeConversar` já inclui `nadaParaAbrir`,
    // `startChat` grava a marcação sozinho, e o gate sequencial é
    // `anterior.status === CONCLUIDO` — gravado pela CONVERSA, não por
    // `conteudo_consumido`.
    expect(TELA).not.toContain("t('content.markDone')");
  });

  it('e o rótulo dele saiu dos 4 locales, para não convidar a recriá-lo', () => {
    for (const locale of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
      const j = JSON.parse(
        readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf-8'),
      );
      const content = j?.SeasonWeek?.content ?? {};
      // 🔑 Sem esta linha o teste passa com o caminho errado: um bloco vazio
      // devolve `undefined` para tudo, e a asserção abaixo vira decoração.
      expect(
        Object.keys(content).length,
        `SeasonWeek.content vazio em ${locale} — caminho errado?`,
      ).toBeGreaterThan(0);
      expect(content.markDone, `markDone ainda em ${locale}`).toBeUndefined();
      expect(content.openBeforeComplete, `openBeforeComplete ainda em ${locale}`).toBeUndefined();
    }
  });

  it('mas `handleConsumido` continua vivo — a ABERTURA ainda marca sozinha', () => {
    // Remover o botão não pode remover o registro automático: quem abre um
    // formato tem o consumo gravado, e é isso que alimenta a métrica.
    expect(TELA).toContain('onAutoConsumido');
  });
});

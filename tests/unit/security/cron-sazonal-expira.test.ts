import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CRON SAZONAL TEM QUE SAIR SOZINHO DO AR — e quem cobra isso é a suíte.
 *
 * 🔴 O QUE ESTE ARQUIVO IMPEDE (medido 31/08/2026). Os dois crons do CONARH 52
 * continuaram agendados depois de a feira terminar em 17/08: o `conarh-followup`
 * diariamente e o `conarh_reenvio_t0` **a cada 15 minutos das 11h às 23h** — 48
 * execuções por dia disparando cadência de WhatsApp para 7 leads de um evento
 * encerrado. Duas semanas assim.
 *
 * O que fez ninguém perceber: **o sintoma é a ausência de sintoma**. Rodada sem
 * pendente é uma query que devolve zero linhas — barata, silenciosa, invisível
 * nos logs. E o comentário que justificava o intervalo curto estava CERTO
 * durante a feira, então quem lesse o código não desconfiaria.
 *
 * A lição virou regra no CLAUDE.md ("o que desliga vai no MESMO commit que
 * cria"), mas regra escrita depende de alguém lembrar. Este teste não depende:
 * ele fica VERMELHO no dia seguinte ao fim da janela, e o único jeito de voltar
 * ao verde é remover a entrada do `vercel.json`.
 *
 * ⚠️ FALHAR AQUI NÃO É TESTE INSTÁVEL. Esta é a única asserção da suíte que
 * depende do relógio de propósito. Se ela quebrar, a correção não é mexer no
 * teste: é apagar o cron que já cumpriu o seu papel.
 */

/**
 * Cada entrada: a `action` sazonal, o último dia em que ela pode estar agendada
 * (o mesmo `ate` da janela no código) e onde a trava vive.
 *
 * Job novo com data de fim entra AQUI no mesmo commit que o põe no vercel.json.
 */
const CRONS_SAZONAIS = [
  {
    action: 'encerramento_ibipeba',
    ate: '2026-09-12',
    travaEm: 'actions/cron-jobs.ts · ENCERRAMENTO_IBIPEBA_JANELA',
    porque: 'aviso de encerramento do programa de Ibipeba — disparo único, com rede de 5 dias',
  },
] as const;

const RAIZ = join(__dirname, '..', '..', '..');

function cronsAgendados(): string[] {
  const vercel = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'));
  return (vercel.crons || []).map((c: any) => String(c.path));
}

describe('cron sazonal expira', () => {
  it('nenhum cron sazonal continua agendado depois da janela', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const agendados = cronsAgendados();
    const vencidos = CRONS_SAZONAIS
      .filter((c) => hoje > c.ate && agendados.some((p) => p.includes(c.action)))
      .map((c) => `"${c.action}" venceu em ${c.ate} (${c.porque}) e SEGUE no vercel.json — remova a entrada`);

    expect(vencidos, vencidos.join('\n')).toEqual([]);
  });

  it('todo cron sazonal declarado tem a trava de janela apontada', () => {
    // A entrada do vercel.json limita os DIAS, mas `4-8 9` volta a casar em
    // setembro do ano que vem. A trava real é a janela no código; esta asserção
    // garante que ela foi declarada, e onde.
    for (const c of CRONS_SAZONAIS) {
      expect(c.travaEm, `${c.action} sem trava de janela declarada`).toMatch(/\S+\.ts/);
      expect(c.ate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('a janela declarada aqui bate com a do código', () => {
    // Duas datas em dois arquivos divergem em silêncio: se o código aceitar
    // mais tempo do que esta lista supõe, o cron seguiria ativo sem ninguém ver.
    const fonte = readFileSync(join(RAIZ, 'actions', 'cron-jobs.ts'), 'utf8');
    const m = fonte.match(/ENCERRAMENTO_IBIPEBA_JANELA\s*=\s*\{[^}]*ate:\s*'([\d-]+)'/);
    expect(m, 'ENCERRAMENTO_IBIPEBA_JANELA não encontrada em actions/cron-jobs.ts').toBeTruthy();
    expect(m![1]).toBe(CRONS_SAZONAIS.find((c) => c.action === 'encerramento_ibipeba')!.ate);
  });
});

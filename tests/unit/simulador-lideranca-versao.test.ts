/**
 * GUARD (27/09/2026): mudar os PROMPTS do Simulador de liderança exige subir a
 * VERSÃO da jornada.
 *
 * A jornada guarda os prompts com que começou (`estado.prompts`) e só os troca
 * quando a versão muda (`service.ts`, caminho de atualização). Mudar
 * `PROMPTS` sem subir `VERSAO` produz duas populações em silêncio: quem
 * começa amanhã recebe o prompt novo, as jornadas já iniciadas seguem no
 * velho, e nada avisa. Este teste falha nesse caso.
 *
 * Ao mudar os prompts de propósito:
 *   1. suba `VERSAO` em `lib/simulador-lideranca/schema.ts`;
 *   2. ponha a versão que sai em `VERSOES_ANTERIORES` (senão as jornadas dela
 *      passam a recusar "não pode ser retomada");
 *   3. registre aqui a assinatura dos prompts da versão nova.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { PROMPTS } from '@/lib/simulador-lideranca/prompts';
import { VERSAO, VERSOES_ANTERIORES, versaoAnterior } from '@/lib/simulador-lideranca/schema';

const ASSINATURA_DOS_PROMPTS: Record<string, string> = {
  // Registrada em 27/09/2026 com os prompts em produção (base 0c106308).
  'lideranca-jornada-2': 'db65b3d3e50f32426ae177dd14c73d0e0e953774b80f3b10fff4f5529c3eb3db',
};

const assinatura = () => createHash('sha256').update(JSON.stringify(PROMPTS)).digest('hex');

describe('versão da jornada × prompts', () => {
  it('🔴 os prompts são os registrados para a VERSAO atual (mudou o prompt? suba a versão)', () => {
    expect(ASSINATURA_DOS_PROMPTS[VERSAO], `VERSAO ${VERSAO} sem assinatura registrada`).toBeDefined();
    expect(assinatura()).toBe(ASSINATURA_DOS_PROMPTS[VERSAO]);
  });

  it('a versão atual não está entre as que o próximo comando atualiza', () => {
    expect(versaoAnterior(VERSAO)).toBe(false);
    expect(VERSOES_ANTERIORES).not.toContain(VERSAO as never);
  });

  it('toda versão anterior é reconhecida pelo caminho de atualização', () => {
    for (const v of VERSOES_ANTERIORES) expect(versaoAnterior(v)).toBe(true);
    expect(versaoAnterior('lideranca-jornada-inexistente')).toBe(false);
  });
});

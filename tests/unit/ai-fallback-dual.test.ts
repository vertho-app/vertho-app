/**
 * O fallback de provedor não pode quebrar o Dual-IA.
 *
 * O buraco (diagnosticado em 25/08, fechado em 26/08): `AI_FALLBACK_MODEL` é um
 * knob ÚNICO para a base inteira e vale `gpt-5.6-terra` — que é justamente o
 * AUDITOR da maioria dos pares. Num outage da Anthropic, todo gerador Claude
 * cairia na família do próprio auditor.
 *
 * O que torna isso pior que uma falha: o sistema não pararia. Ele continuaria
 * auditando, com o mesmo modelo dos dois lados, devolvendo aprovação — e o
 * único vestígio seria uma linha de `console.warn` que ninguém lê. Auditoria
 * que vira eco no exato momento em que o provedor está instável é o pior
 * momento possível para perder a segunda opinião.
 */
import { describe, it, expect } from 'vitest';
import {
  fallbackRespeitandoDual, familiaDoParceiroDual, familiaDoModelo,
  DUAL_IA_PARES, DEFAULT_TASK_MODELS,
} from '@/lib/ai-tasks';

// Mesmos valores de `actions/ai-client.ts`. Lidos do arquivo para não virar
// cópia divergente — mudar a escada lá tem que refletir aqui.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const clientSrc = readFileSync(join(process.cwd(), 'actions/ai-client.ts'), 'utf-8');
const PREFERIDO = clientSrc.match(/AI_FALLBACK_MODEL = process\.env\.AI_FALLBACK_MODEL \|\| '([^']+)'/)?.[1] as string;
const ESCADA = [...(clientSrc.match(/const AI_FALLBACK_ESCADA = \[([^\]]+)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);

describe('fallback de provedor × Dual-IA', () => {
  it('leu o preferido e a escada do ai-client (senão o teste é sobre outra coisa)', () => {
    expect(PREFERIDO).toBeTruthy();
    expect(ESCADA.length).toBeGreaterThan(0);
  });

  // Prova que o buraco era REAL, não hipotético: sem a correção, o fallback
  // padrão aterrissava na família do auditor na maioria dos pares.
  it('o knob global sozinho colidiria com o auditor na maioria dos pares', () => {
    const colidem = DUAL_IA_PARES.filter(({ auditor }) => {
      const mAud = DEFAULT_TASK_MODELS[auditor];
      return mAud && familiaDoModelo(mAud) === familiaDoModelo(PREFERIDO);
    });
    expect(colidem.length).toBeGreaterThan(DUAL_IA_PARES.length / 2);
  });

  it.each(DUAL_IA_PARES.map((p) => [p.gerador, p.auditor, p.onde]))(
    'gerador %s caindo em fallback NÃO aterrissa na família do auditor %s',
    (gerador, auditor) => {
      const mGer = DEFAULT_TASK_MODELS[gerador] ?? 'claude-sonnet-4-6';
      const mAud = DEFAULT_TASK_MODELS[auditor];
      if (!mAud) return; // par sem default declarado: coberto pelo ai-dual-familia
      const alvo = fallbackRespeitandoDual(mGer, gerador, PREFERIDO, ESCADA);
      expect(alvo, `nenhum fallback cross-família para ${gerador}`).not.toBeNull();
      expect(familiaDoModelo(alvo!), `${gerador} → ${alvo} colide com o auditor ${mAud}`)
        .not.toBe(familiaDoModelo(mAud));
      expect(familiaDoModelo(alvo!)).not.toBe(familiaDoModelo(mGer));
    },
  );

  it.each(DUAL_IA_PARES.map((p) => [p.auditor, p.gerador]))(
    'auditor %s caindo em fallback NÃO aterrissa na família do gerador %s',
    (auditor, gerador) => {
      const mAud = DEFAULT_TASK_MODELS[auditor];
      const mGer = DEFAULT_TASK_MODELS[gerador] ?? 'claude-sonnet-4-6';
      if (!mAud) return;
      const alvo = fallbackRespeitandoDual(mAud, auditor, PREFERIDO, ESCADA);
      expect(alvo).not.toBeNull();
      expect(familiaDoModelo(alvo!), `${auditor} → ${alvo} colide com o gerador ${mGer}`)
        .not.toBe(familiaDoModelo(mGer));
    },
  );

  it('task sem par Dual-IA só evita a própria família (não há parceiro a proteger)', () => {
    expect(familiaDoParceiroDual('conteudo_texto')).toBeNull();
    const alvo = fallbackRespeitandoDual('claude-sonnet-4-6', 'conteudo_texto', PREFERIDO, ESCADA);
    expect(alvo).toBe(PREFERIDO);
  });

  it('devolve null quando nada serve — quem chama tem que FALHAR, não auditar com a mesma família', () => {
    const alvo = fallbackRespeitandoDual('claude-sonnet-5', 'ia4_avaliacao', 'claude-opus-5', ['claude-sonnet-4-6']);
    expect(alvo).toBeNull();
  });

  // Guard de consumidor: a lógica em lib/ só vale se o wrapper a usar.
  it('o ai-client CONSOME o helper em vez do knob direto', () => {
    expect(clientSrc).toMatch(/const alvo = fallbackRespeitandoDual\(/);
    expect(clientSrc, 'voltou a despachar o knob global direto no fallback')
      .not.toMatch(/dispatch\(AI_FALLBACK_MODEL\)/);
  });
});

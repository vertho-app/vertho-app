// Copy das notificações push (lib/notifications/push-copy.ts).
//
// É COPY QUE SAI PARA FORA — a categoria que já vazou jargão de código para o
// usuário nesta base ("porta" no lugar de etapa; `na ${org}` virando "aí na
// teste"). Aqui o texto aparece na tela de bloqueio do aparelho, fora do app.
import { describe, expect, it } from 'vitest';
import { pushPilula, pushMissao, LIMITE_TITULO, LIMITE_CORPO } from '@/lib/notifications/push-copy';

const TEMA_LONGO =
  'Comunicação Assertiva — Dar retorno difícil mantendo a relação e o combinado, mesmo sob pressão de prazo';

describe('push-copy', () => {
  it('respeita os limites de título e corpo', () => {
    const t = pushPilula(3, TEMA_LONGO);
    expect(t.titulo.length).toBeLessThanOrEqual(LIMITE_TITULO);
    expect(t.corpo.length).toBeLessThanOrEqual(LIMITE_CORPO);
  });

  it('corta sem deixar palavra pela metade', () => {
    const { corpo } = pushPilula(3, TEMA_LONGO);
    expect(corpo.endsWith('…')).toBe(true);
    // não pode terminar em pontuação órfã antes das reticências
    expect(corpo).not.toMatch(/[,;:—-]…$/);
  });

  it('não deixa placeholder nem interpolação vazia escapar', () => {
    for (const t of [pushPilula(3, ''), pushPilula(3, TEMA_LONGO), pushMissao(4)]) {
      const texto = `${t.titulo} ${t.corpo}`;
      expect(texto).not.toMatch(/\$\{|\{\{|undefined|null|NaN/);
      expect(texto.trim()).not.toBe('');
    }
  });

  it('tema vazio cai num texto humano, não em string vazia', () => {
    const { corpo } = pushPilula(3, '');
    expect(corpo.length).toBeGreaterThan(10);
  });

  it('não repete a marca — o nome do app já aparece acima do título', () => {
    const t = pushPilula(3, TEMA_LONGO);
    expect(`${t.titulo} ${t.corpo}`.toLowerCase()).not.toContain('vertho');
  });

  it('missão tem vocabulário próprio, nunca "pílula"', () => {
    // Reaproveitar o texto da pílula misturaria duas coisas que a pessoa
    // precisa distinguir — e que a telemetria conta separado.
    const m = pushMissao(4);
    expect(m.titulo.toLowerCase()).toContain('missão');
    expect(`${m.titulo} ${m.corpo}`.toLowerCase()).not.toContain('pílula');
  });

  it('a semana aparece no título (é o que dá contexto de relance)', () => {
    expect(pushPilula(7, TEMA_LONGO).titulo).toContain('7');
    expect(pushMissao(8).titulo).toContain('8');
  });
});

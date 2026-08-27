import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizarCompromisso, rotuloOrigemCompromisso } from '@/lib/season-engine/compromisso';

/**
 * `compromisso_proxima` carregava TRÊS coisas numa string só: o compromisso que
 * a pessoa assumiu, o que o mentor propôs no fechamento, e uma meta-observação
 * dizendo que não houve nenhum. Os dois painéis de admin exibiam os três com o
 * mesmo 🎯, e quem lê é o RH.
 *
 * 🔑 Censo das 88 conversas concluídas (27/08/2026): **52 vazias, 16
 * meta-observação, 20 compromisso real** — o campo só era confiável em 23% dos
 * casos. E a tendência era piorar: com a correção do fechamento, as conversas
 * passaram a chegar ao turno 6, que SEMPRE propõe um compromisso.
 */

const norm = (compromisso: any, origem?: any) => {
  const o: any = { compromisso_proxima: compromisso, ...(origem !== undefined ? { compromisso_origem: origem } : {}) };
  normalizarCompromisso(o);
  return o;
};

describe('meta-observação não é compromisso', () => {
  it('🔴 o caso REAL que motivou isto vira vazio + ausente', () => {
    const r = norm('Nenhum compromisso foi explicitamente assumido pelo colaborador. O compromisso presente no output foi proposto pela IA, não declarado pelo colaborador.');
    expect(r.compromisso_proxima).toBe('');
    expect(r.compromisso_origem).toBe('ausente');
  });

  it('pega as variações que o extrator produz', () => {
    for (const t of [
      'Não foi assumido explicitamente pelo colaborador — o compromisso apresentado no encerramento foi proposto pela IA.',
      'Não houve compromisso declarado na conversa.',
      'Sem compromisso explícito da parte do colaborador.',
    ]) {
      expect(norm(t).compromisso_proxima, t).toBe('');
      expect(norm(t).compromisso_origem, t).toBe('ausente');
    }
  });

  it('🔑 NÃO confunde compromisso real que fala de "assumir"', () => {
    // O risco do oposto: uma regex gulosa apagaria o compromisso de quem
    // escreveu "vou assumir a condução da reunião". Isso seria pior que o bug.
    const t = 'Assumir a condução da próxima reunião de HTPC e registrar o que ficar combinado.';
    expect(norm(t, 'colaborador').compromisso_proxima).toBe(t);
    expect(norm(t, 'colaborador').compromisso_origem).toBe('colaborador');
  });
});

describe('texto e origem andam juntos', () => {
  it('sem texto, a origem é sempre ausente — não existe compromisso de ninguém', () => {
    expect(norm('', 'colaborador').compromisso_origem).toBe('ausente');
    expect(norm('   ', 'ia').compromisso_origem).toBe('ausente');
  });

  it('origem inválida com texto vira "não registrada", não um palpite', () => {
    // 'colaborador' por default carimbaria como promessa da pessoa algo que
    // ninguém verificou — é o tipo de default otimista que vira número errado.
    expect(norm('Levar o registro pra reunião.', 'sei-la').compromisso_origem).toBeNull();
    expect(norm('Levar o registro pra reunião.').compromisso_origem).toBeNull();
  });

  it('preserva o compromisso e a origem quando os dois vêm bem', () => {
    const r = norm('Conversar com a Cláudia até quinta e registrar o combinado.', 'ia');
    expect(r.compromisso_proxima).toBe('Conversar com a Cláudia até quinta e registrar o combinado.');
    expect(r.compromisso_origem).toBe('ia');
  });

  it('apara espaços do texto', () => {
    expect(norm('  Levar o registro.  ', 'colaborador').compromisso_proxima).toBe('Levar o registro.');
  });
});

describe('o rótulo diz o que precisa ser dito, e cala o resto', () => {
  it('compromisso da pessoa não ganha selo — é o caso normal', () => {
    expect(rotuloOrigemCompromisso('colaborador')).toBeNull();
  });

  it('🔑 compromisso proposto pelo mentor é MARCADO', () => {
    // Sem isto, o RH lê como promessa da pessoa algo que ela não disse.
    expect(rotuloOrigemCompromisso('ia')).toBe('proposto pelo mentor');
  });

  it('extração antiga aparece como não registrada, não como da pessoa', () => {
    expect(rotuloOrigemCompromisso(null)).toBe('origem não registrada');
    expect(rotuloOrigemCompromisso(undefined)).toBe('origem não registrada');
  });
});

describe('os consumidores distinguem os três estados', () => {
  const raiz = process.cwd();
  const EVIDENCIAS = readFileSync(join(raiz, 'app/admin/vertho/evidencias/page.tsx'), 'utf-8');
  const TEMPORADAS = readFileSync(join(raiz, 'app/admin/temporadas/page.tsx'), 'utf-8');
  const ACTION = readFileSync(join(raiz, 'app/admin/vertho/evidencias/actions.ts'), 'utf-8');
  const ROTA = readFileSync(join(raiz, 'app/api/temporada/reflection/route.ts'), 'utf-8');

  it('a rota normaliza antes de gravar', () => {
    expect(ROTA).toContain('normalizarCompromisso(parsed)');
  });

  it('🔑 a origem VIAJA da action até a tela', () => {
    // A tela pode mostrar o selo e mesmo assim receber `undefined` para sempre,
    // se a action não selecionar o campo — o defeito do gate que "existe" e
    // nunca dispara.
    expect(ACTION).toContain('compromisso_origem');
    expect(EVIDENCIAS).toContain('rotuloOrigemCompromisso(detalhe.extracao.compromisso_origem)');
  });

  it('os dois painéis usam o rótulo, nenhum exibe o campo cru sozinho', () => {
    expect(TEMPORADAS).toContain('rotuloOrigemCompromisso(p.reflexao.compromisso_origem)');
    expect(EVIDENCIAS).not.toContain('🎯 {detalhe.extracao.compromisso_proxima}</p>');
  });

  it('a ausência é DITA, não some da tela', () => {
    // "sem compromisso" é informação para quem acompanha — sumir é o mesmo que
    // a conversa não ter acontecido.
    expect(EVIDENCIAS).toContain("compromisso_origem === 'ausente'");
  });
});

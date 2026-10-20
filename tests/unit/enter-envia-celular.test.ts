/**
 * No celular, o Enter dos chats da semana quebra a linha e o envio é só pelo botão.
 *
 * `Medido: 20/10/2026`, Ibipeba: a tecla de quebra de linha do teclado da tela mandava a
 * resposta de Evidências pela metade ("...uma turma de 7÷"), a conversa contava o pedaço
 * como uma resposta e fechou sobre fragmentos; a pessoa foi ao Tira-Dúvidas escrever "Não
 * terminei de digitar". Quem ditava por voz enviava pelo botão e não sofria.
 *
 * A regra é testada direto; a página (componente de cliente com dezenas de hooks, que a
 * suíte não renderiza) por guard de FONTE: os dois campos usam a regra, e o texto de
 * exemplo do celular não manda usar um Shift+Enter que o teclado não tem.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { assinarTecladoDeToque, enterEnvia, MIDIA_TECLADO_DE_TOQUE } from '@/lib/enter-envia';

const tecla = (key: string, extra: { shiftKey?: boolean; isComposing?: boolean } = {}) => ({
  key,
  shiftKey: !!extra.shiftKey,
  nativeEvent: { isComposing: !!extra.isComposing },
});

describe('enterEnvia', () => {
  it('no computador, Enter envia e Shift+Enter quebra a linha', () => {
    expect(enterEnvia(tecla('Enter'), false)).toBe(true);
    expect(enterEnvia(tecla('Enter', { shiftKey: true }), false)).toBe(false);
  });

  it('no celular, Enter nunca envia', () => {
    expect(enterEnvia(tecla('Enter'), true)).toBe(false);
    expect(enterEnvia(tecla('Enter', { shiftKey: true }), true)).toBe(false);
  });

  it('Enter que confirma a palavra em composição não envia em aparelho nenhum', () => {
    expect(enterEnvia(tecla('Enter', { isComposing: true }), false)).toBe(false);
    expect(enterEnvia(tecla('Enter', { isComposing: true }), true)).toBe(false);
  });

  it('outra tecla não envia', () => {
    expect(enterEnvia(tecla('a'), false)).toBe(false);
    expect(enterEnvia(tecla(' '), false)).toBe(false);
  });
});

describe('assinarTecladoDeToque', () => {
  function janelaFalsa(inicial: boolean) {
    const ouvintes = new Set<() => void>();
    const midia = {
      matches: inicial,
      addEventListener: (_: string, f: () => void) => ouvintes.add(f),
      removeEventListener: (_: string, f: () => void) => ouvintes.delete(f),
    };
    const matchMedia = vi.fn(() => midia as unknown as MediaQueryList);
    const mudar = (v: boolean) => { midia.matches = v; ouvintes.forEach((f) => f()); };
    return { janela: { matchMedia }, matchMedia, mudar, ouvintes };
  }

  it('consulta o ponteiro principal e avisa o estado na hora', () => {
    const { janela, matchMedia } = janelaFalsa(true);
    const aoMudar = vi.fn();
    assinarTecladoDeToque(janela, aoMudar);
    expect(matchMedia).toHaveBeenCalledWith(MIDIA_TECLADO_DE_TOQUE);
    expect(MIDIA_TECLADO_DE_TOQUE).toBe('(pointer: coarse)');
    expect(aoMudar).toHaveBeenLastCalledWith(true);
  });

  it('acompanha a mudança e para de ouvir ao cancelar', () => {
    const { janela, mudar, ouvintes } = janelaFalsa(false);
    const aoMudar = vi.fn();
    const cancelar = assinarTecladoDeToque(janela, aoMudar);
    expect(aoMudar).toHaveBeenLastCalledWith(false);
    mudar(true);
    expect(aoMudar).toHaveBeenLastCalledWith(true);
    cancelar();
    expect(ouvintes.size).toBe(0);
  });

  it('sem matchMedia (ou no servidor) fica como computador e não quebra', () => {
    const aoMudar = vi.fn();
    expect(() => assinarTecladoDeToque(undefined, aoMudar)()).not.toThrow();
    expect(() => assinarTecladoDeToque({}, aoMudar)()).not.toThrow();
    expect(aoMudar).not.toHaveBeenCalled();
  });
});

describe('tela da semana: os dois chats seguem a regra', () => {
  const pagina = readFileSync('app/dashboard/temporada/semana/[week]/page.tsx', 'utf8');

  it('Evidências e Tira-Dúvidas decidem o envio por enterEnvia, e não sobra Enter cru', () => {
    expect(pagina).toContain('const tecladoDeToque = useTecladoDeToque();');
    expect(pagina).toContain('if (enterEnvia(e, tecladoDeToque)) { e.preventDefault(); sendMessage(); }');
    expect(pagina).toContain('if (enterEnvia(e, tecladoDeToque)) { e.preventDefault(); sendTiraDuvida(); }');
    expect(pagina).not.toMatch(/key === 'Enter'/);
  });

  it('no celular o campo mostra o texto de exemplo sem Shift+Enter', () => {
    for (const chave of ['evidence.placeholderPractice', 'evidence.placeholderScenario', 'evidence.placeholderDefault', 'qa.placeholder']) {
      expect(pagina, chave).toContain(`t(tecladoDeToque ? '${chave}Touch' : '${chave}')`);
    }
  });

  it.each(['pt-BR', 'pt-PT', 'es-ES', 'en-US'])('%s: os textos do celular existem e não citam Shift', (locale) => {
    const semana = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).SeasonWeek;
    const doCelular = [
      semana.evidence.placeholderPracticeTouch,
      semana.evidence.placeholderScenarioTouch,
      semana.evidence.placeholderDefaultTouch,
      semana.qa.placeholderTouch,
    ];
    for (const texto of doCelular) {
      expect(typeof texto, `${locale}: ${texto}`).toBe('string');
      expect(texto.length).toBeGreaterThan(3);
      expect(texto).not.toMatch(/shift/i);
    }
  });
});

describe('simulador de vendas: a mensagem ao cliente segue a regra', () => {
  const treino = readFileSync('components/simulador-vendas/treino.tsx', 'utf8');

  it('o envio decide por enterEnvia, e não sobra Enter cru', () => {
    expect(treino).toContain('const tecladoDeToque = useTecladoDeToque();');
    expect(treino).toMatch(/onKeyDown=\{\(e\) => \{\s*if \(enterEnvia\(e, tecladoDeToque\)\) \{/);
    expect(treino).not.toMatch(/key === 'Enter'/);
  });

  it('no celular a ajuda do campo não manda usar Shift + Enter', () => {
    expect(treino).toContain("t(tecladoDeToque ? 'composerHelpTouch' : 'composerHelp')");
  });

  it.each(['pt-BR', 'pt-PT', 'es-ES', 'en-US'])('%s: a ajuda do celular existe, cita o botão e não cita Shift', (locale) => {
    const vendas = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).SimuladorVendas;
    expect(typeof vendas.composerHelpTouch).toBe('string');
    expect(vendas.composerHelpTouch).toContain(vendas.send);
    expect(vendas.composerHelpTouch).not.toMatch(/shift|mayús/i);
  });
});

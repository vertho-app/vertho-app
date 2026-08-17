// O formato que a mensagem PROMETE — e por que ele não pode ser o preferido.
//
// 🔴 Medido em 17/08/2026, no pré-voo da abertura de Macaé: **35 de 38**
// diretores receberiam "Seu vídeo de hoje" numa semana que só tem case e texto.
// A causa não é cálculo errado, é promessa feita sem consultar o estoque: o
// anúncio saía de `derivarPrioridadeFormatos[0]`, e o default de quem nunca
// declarou preferência é `video`.
//
// O caso cai no primeiro contato do programa, que é onde a confiança se decide —
// e nada na tela acusaria: a mensagem sai, o link abre, o formato não está lá.
import { describe, it, expect } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { escolherFormatoAnunciado, formatosEntregaveis, temDeckPronto } from '@/lib/season-engine/formato-anunciado';

/** Colaborador que prefere vídeo (é também o default de quem não declarou). */
const QUER_VIDEO = { pref_video_curto: 5, pref_texto: 2, pref_audio: 1, pref_estudo_caso: 1 };
const SEM_PREFERENCIA = {};

describe('escolherFormatoAnunciado — prometer só o que existe', () => {
  it('🔴 quem prefere vídeo numa semana sem vídeo recebe o formato que EXISTE', () => {
    expect(escolherFormatoAnunciado(QUER_VIDEO, ['case', 'texto'])).toBe('texto');
  });

  it('a preferência vence quando ela está entre os entregáveis', () => {
    expect(escolherFormatoAnunciado(QUER_VIDEO, ['case', 'texto', 'video'])).toBe('video');
  });

  it('sem preferência declarada, o default (vídeo) também é cruzado com o estoque', () => {
    // O default `['video', 'texto', 'audio', 'case']` é o que fazia 35 pessoas
    // receberem promessa falsa — a ordem continua, o cruzamento é novo.
    expect(escolherFormatoAnunciado(SEM_PREFERENCIA, ['audio', 'case'])).toBe('audio');
    expect(escolherFormatoAnunciado(SEM_PREFERENCIA, ['video', 'texto'])).toBe('video');
  });

  it('nenhum formato entregável devolve `null` — quem chama decide o que fazer', () => {
    // `null` e não um chute: com a semana sem formato, prometer qualquer coisa é
    // repetir o defeito. O envio cai no preferido e a R1 do health acusa.
    expect(escolherFormatoAnunciado(QUER_VIDEO, [])).toBeNull();
  });

  it('a segunda preferência é respeitada, não só a primeira', () => {
    const querAudioDepoisTexto = { pref_video_curto: 1, pref_audio: 5, pref_texto: 4, pref_estudo_caso: 1 };
    expect(escolherFormatoAnunciado(querAudioDepoisTexto, ['texto', 'case'])).toBe('texto');
  });
});

describe('formatosEntregaveis — o vídeo NÃO está no plano', () => {
  const conteudo = { core_id: 'core-1', formatos_disponiveis: { texto: { id: 't' }, case: { id: 'c' }, video: { id: 'v' } } };

  it('🔴 ignora `video` do JSON e pergunta pelo DECK', async () => {
    // `formatos_disponiveis` nunca representa vídeo entregável: o deck vem do
    // pipeline de célula e é resolvido ao vivo. Confiar no JSON prometeria vídeo
    // por causa de uma chave que não significa isso.
    const semDeck = criarSupabaseMock({ resolver: () => null });
    expect(await formatosEntregaveis(semDeck.client, {
      empresaId: 'e1', conteudo, cargo: 'Diretor(a) Escolar', disc: 'D',
    })).toEqual(['texto', 'case']);
  });

  it('com deck pronto, o vídeo entra', async () => {
    const comDeck = criarSupabaseMock({
      resolver: (t) => (t === 'micro_conteudos' ? { modulo_base_id: 'mb-1' } : { id: 'deck-1' }),
    });
    const r = await formatosEntregaveis(comDeck.client, {
      empresaId: 'e1', conteudo, cargo: 'Diretor(a) Escolar', disc: 'D',
    });
    expect(r).toContain('video');
  });

  it('o cache evita repetir a consulta para a mesma célula', async () => {
    const sb = criarSupabaseMock({ resolver: () => null });
    const cacheDeck = new Map<string, boolean>();
    await formatosEntregaveis(sb.client, { empresaId: 'e1', conteudo, cargo: 'C1', disc: 'D', cacheDeck });
    const chamadasApos1 = sb.chamadas.length;
    await formatosEntregaveis(sb.client, { empresaId: 'e1', conteudo, cargo: 'C1', disc: 'D', cacheDeck });
    expect(sb.chamadas.length).toBe(chamadasApos1);
  });

  it('conteúdo sem formato nenhum devolve lista vazia (e não explode)', async () => {
    const sb = criarSupabaseMock({ resolver: () => null });
    expect(await formatosEntregaveis(sb.client, {
      empresaId: 'e1', conteudo: {}, cargo: 'C1', disc: 'D',
    })).toEqual([]);
  });
});

describe('temDeckPronto — as guardas que evitam consulta inútil', () => {
  it('sem core, sem cargo ou com DISC fora de D/I/S/C não pergunta ao banco', async () => {
    const sb = criarSupabaseMock({ resolver: () => ({ modulo_base_id: 'mb' }) });
    expect(await temDeckPronto(sb.client, 'e1', null, 'C1', 'D')).toBe(false);
    expect(await temDeckPronto(sb.client, 'e1', 'core', null, 'D')).toBe(false);
    expect(await temDeckPronto(sb.client, 'e1', 'core', 'C1', 'X')).toBe(false);
    expect(sb.chamadas).toHaveLength(0);
  });

  it('a primeira letra do DISC é o que vale (o deck é por célula, não por combo)', async () => {
    const sb = criarSupabaseMock({
      resolver: (t) => (t === 'micro_conteudos' ? { modulo_base_id: 'mb-1' } : { id: 'deck' }),
    });
    expect(await temDeckPronto(sb.client, 'e1', 'core', 'C1', 'sic')).toBe(true);
    expect(sb.usou('videos_gerados', 'eq', 'disc_dominante')).toBe(true);
  });
});

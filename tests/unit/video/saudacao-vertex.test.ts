import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

const registrarDegradacaoMock = vi.fn(async (..._a: any[]) => {});
vi.mock('@/lib/degradacao', async (orig) => ({ ...(await orig<typeof import('@/lib/degradacao')>()), registrarDegradacao: (...a: any[]) => registrarDegradacaoMock(...a) }));

import {
  avaliarDuracao, caudaConfere, duracaoDoMp3, sintetizarSaudacao, garantirSaudacoes, destinatariosDaCelula, garantirSaudacoesDaCelula,
  resumirSaudacoes, SaudacaoReprovadaError, SEG_POR_CARACTERE, TENTATIVAS_DA_SAUDACAO, type DepsDaSaudacao,
} from '@/lib/video/saudacao-vertex';
import { DEGRADACAO } from '@/lib/degradacao';
import { ELENCO } from '@/lib/tts/elenco';
// @ts-ignore .mjs puro, compartilhado com a caixa de render
import { chaveDoAudioDaSaudacao, textoDaSaudacao, primeiroNome, slugSaudacao, DEGRADACAO_SAUDACAO_AUSENTE } from '../../../worker-hetzner/saudacao-audio.mjs';

/**
 * Saudação nominal em Vertex (B, 07/10/2026). As medidas abaixo são de takes REAIS no Vertex, não inventadas: 54 sínteses,
 * 12 nomes (`scripts/_calibrar-saudacao.ts`), mais as 6 candidatas que o dono ouviu na comparação cega.
 */

const bom = (n: number) => Buffer.alloc(n);
const palavras = (frase: string) => frase.split(' ').map((word, i) => ({ word, start: i * 0.3, end: i * 0.3 + 0.25 }));
const FRASE_OK = 'Olá, Marina. Que bom ter você aqui.';

describe('a chave do áudio é UMA só, dos dois lados', () => {
  it('é determinística e leva a pessoa, o nome falado sem acento e a versão do elenco', () => {
    const k = chaveDoAudioDaSaudacao({ colaboradorId: 'c-1', nome: 'Elizângela', versao: '2026-09-05' });
    expect(k).toBe('saudacoes/c-1__elizangela__2026-09-05.mp3');
    expect(chaveDoAudioDaSaudacao({ colaboradorId: 'c-1', nome: 'Elizângela', versao: '2026-09-05' })).toBe(k);
  });

  it('mudou o nome ou a versão do elenco, é OUTRO objeto: o áudio da locutora velha nunca é servido', () => {
    const base = { colaboradorId: 'c-1', nome: 'Ana', versao: '2026-09-05' };
    expect(chaveDoAudioDaSaudacao({ ...base, nome: 'Anna' })).not.toBe(chaveDoAudioDaSaudacao(base));
    expect(chaveDoAudioDaSaudacao({ ...base, versao: '2026-11-01' })).not.toBe(chaveDoAudioDaSaudacao(base));
    expect(chaveDoAudioDaSaudacao({ ...base, colaboradorId: 'c-2' })).not.toBe(chaveDoAudioDaSaudacao(base));
  });

  it('falta de campo LANÇA em vez de montar uma chave que casa com a de outra pessoa', () => {
    expect(() => chaveDoAudioDaSaudacao({ colaboradorId: '', nome: 'Ana', versao: 'v' })).toThrow();
    expect(() => chaveDoAudioDaSaudacao({ colaboradorId: 'c', nome: '', versao: 'v' })).toThrow();
    expect(() => chaveDoAudioDaSaudacao({ colaboradorId: 'c', nome: 'Ana', versao: '' })).toThrow();
  });

  it('o primeiro nome falado e o texto são os que o dono ouviu', () => {
    expect(primeiroNome('  maria da SILVA ')).toBe('Maria');
    expect(textoDaSaudacao('Marina')).toBe(FRASE_OK);
    expect(slugSaudacao('Thaís')).toBe('thais');
  });

  it('o tipo de degradação da caixa é o mesmo do app (o literal vive nos dois)', () => {
    expect(DEGRADACAO_SAUDACAO_AUSENTE).toBe(DEGRADACAO.SAUDACAO_VERTEX_AUSENTE);
  });
});

describe('duração: separa o take defeituoso do bom (medida em take real)', () => {
  // [nome, caracteres do texto, segundos]. Bons: 46 de 54. Defeituosos: 8 de 54, todos entre 0,152 e 0,184 s/caractere.
  const BONS: [string, number, number][] = [
    ['Marina (cand6, a que o dono escolheu)', 35, 3.84], ['Ana', 32, 3.5], ['Ana lenta', 32, 4.18], ['Jô', 31, 3.16],
    ['Carlos', 35, 3.89], ['Ricardo lento', 36, 4.65], ['Elizângela', 39, 4.1], ['Luciana', 36, 4.26], ['Bernardo', 37, 4.13],
  ];
  const DEFEITUOSOS: [string, number, number][] = [
    ['Marina "Que alegria"', 35, 5.54], ['Maria "Que bom que você está aqui"', 34, 5.17], ['Luciana "…aqui comigo"', 36, 6.61],
    ['Fernanda 6,2 s com texto certo', 37, 6.24], ['Ricardo "Que prazer ter você aqui"', 36, 6.09], ['Ricardo "…está conosco"', 36, 5.85],
    ['cand2 (frase repetida)', 35, 5.85], ['cand4 (frase repetida)', 35, 5.69],
  ];
  it.each(BONS)('%s passa', (_n, chars, seg) => {
    expect(avaliarDuracao('x'.repeat(chars), seg).ok).toBe(true);
  });
  it.each(DEFEITUOSOS)('%s é reprovado', (_n, chars, seg) => {
    const v = avaliarDuracao('x'.repeat(chars), seg);
    expect(v.ok).toBe(false);
    expect(v.motivo).toContain('repetida ou acrescentada');
  });
  it('áudio cortado (curto demais) também reprova', () => {
    expect(avaliarDuracao('x'.repeat(35), 1.2).ok).toBe(false);
  });
  it('o teto fica ENTRE o pior bom (0,131) e o melhor defeituoso (0,152): é a margem que a calibração mediu', () => {
    expect(SEG_POR_CARACTERE.max).toBeGreaterThan(0.131);
    expect(SEG_POR_CARACTERE.max).toBeLessThan(0.152);
  });
  it('estima a duração do mp3 do TTS (96 kbps CBR) com erro de um quadro: 41.691 bytes eram 3,448 s', () => {
    expect(duracaoDoMp3(bom(41691))).toBeCloseTo(3.448, 1);
  });
});

describe('transcrição: só o FINAL da frase, nunca o nome', () => {
  it('frase correta passa', () => {
    expect(caudaConfere(palavras(FRASE_OK)).ok).toBe(true);
  });
  it('o ASR trocando a grafia do nome NÃO reprova take bom ("Elizângela" voltou "Elisângela" nos 3 takes medidos)', () => {
    expect(caudaConfere(palavras('Olá, Elisângela. Que bom ter você aqui.')).ok).toBe(true);
  });
  it('ASR indisponível (null ou vazio) não reprova: quem decide é a duração', () => {
    expect(caudaConfere(null).ok).toBe(true);
    expect(caudaConfere([]).ok).toBe(true);
  });
  it.each([
    ['frase acrescentada', 'Olá, Marina. Que bom ter você aqui. Que alegria'],
    ['outra frase no fim', 'Olá, Maria. Que bom ter você aqui. Que bom que você está aqui'],
    ['palavra a mais no fim', 'Olá, Luciana. Que bom ter você aqui. Que bom ter você aqui comigo'],
    ['frase inteira repetida', 'Olá, Ana. Que bom ter você aqui. Que bom ter você aqui'],
    ['não abre com Olá', 'Oi, Marina. Que bom ter você aqui.'],
    ['sem nome', 'Olá. Que bom ter você aqui.'],
  ])('%s é reprovada', (_n, frase) => {
    expect(caudaConfere(palavras(frase)).ok).toBe(false);
  });
});

describe('sintetizarSaudacao: refaz o take defeituoso, não publica o ruim', () => {
  const depsCom = (takes: { durS: number; mp3?: Buffer; erro?: string }[], transcricao: (n: number) => ReturnType<typeof palavras> | null = () => palavras(FRASE_OK)): DepsDaSaudacao & { gerar: ReturnType<typeof vi.fn> } => {
    let i = 0;
    return {
      gerar: vi.fn(async () => { const t = takes[Math.min(i++, takes.length - 1)]; if (t.erro) throw new Error(t.erro); return { mp3: t.mp3 ?? bom(40000), durS: t.durS, f0Hz: 195 }; }),
      transcrever: vi.fn(async () => transcricao(i)),
    } as any;
  };
  const A = { nome: 'Marina Souza', empresaId: 'emp-1', colaboradorId: 'c-1' };

  it('take bom de primeira: 1 tentativa, e fala o PRIMEIRO nome', async () => {
    const d = depsCom([{ durS: 3.84 }]);
    const r = await sintetizarSaudacao(A, d);
    expect(r.tentativas).toBe(1);
    expect(r.asr).toBe('conferido');
    expect(d.gerar).toHaveBeenCalledWith(FRASE_OK, { empresaId: 'emp-1', colaboradorId: 'c-1' });
  });

  it('1º take com frase acrescentada (5,5 s): refaz e entrega o 2º', async () => {
    const d = depsCom([{ durS: 5.54 }, { durS: 3.66 }]);
    const r = await sintetizarSaudacao(A, d);
    expect(r.tentativas).toBe(2);
    expect(r.durS).toBe(3.66);
    expect(d.gerar).toHaveBeenCalledTimes(2);
  });

  it('as três tentativas defeituosas: LANÇA com o motivo de cada uma, e não devolve áudio', async () => {
    const d = depsCom([{ durS: 5.54 }, { durS: 6.09 }, { durS: 5.17 }]);
    const e = await sintetizarSaudacao(A, d).catch((x) => x);
    expect(e).toBeInstanceOf(SaudacaoReprovadaError);
    expect((e as SaudacaoReprovadaError).motivos).toHaveLength(TENTATIVAS_DA_SAUDACAO);
    expect(String(e.message)).toContain('longa demais');
  });

  it('síntese que lança (Vertex fora) conta como tentativa e a seguinte pode passar', async () => {
    const d = depsCom([{ durS: 0, erro: 'Gemini TTS: timeout' }, { durS: 3.9 }]);
    const r = await sintetizarSaudacao(A, d);
    expect(r.tentativas).toBe(2);
  });

  it('duração boa mas a transcrição termina em outra frase: reprova (a 2ª opinião vale)', async () => {
    const d = depsCom([{ durS: 4.0 }, { durS: 3.9 }], (n) => (n === 1 ? palavras('Olá, Marina. Que bom ter você aqui. Que alegria') : palavras(FRASE_OK)));
    const r = await sintetizarSaudacao(A, d);
    expect(r.tentativas).toBe(2);
  });

  it('ASR fora do ar: a duração decide sozinha e o resultado diz que não conferiu', async () => {
    const d = depsCom([{ durS: 3.9 }], () => null);
    const r = await sintetizarSaudacao(A, d);
    expect(r.asr).toBe('indisponivel');
  });

  it('áudio minúsculo (bytes) não passa nem com duração "boa"', async () => {
    const d = depsCom([{ durS: 3.9, mp3: bom(300) }], () => null);
    await expect(sintetizarSaudacao({ ...A }, { ...d, gerar: vi.fn(async () => ({ mp3: bom(300), durS: 3.9, f0Hz: null })) } as any)).rejects.toBeInstanceOf(SaudacaoReprovadaError);
  });

  it('pessoa sem nome: falha sem gastar síntese', async () => {
    const d = depsCom([{ durS: 3.9 }]);
    await expect(sintetizarSaudacao({ ...A, nome: '   ' }, d)).rejects.toBeInstanceOf(SaudacaoReprovadaError);
    expect(d.gerar).not.toHaveBeenCalled();
  });

  it('o registro (F0) NÃO é veto: o take que o dono escolheu tem 190 Hz, 1,5 st abaixo do alvo, e passa', async () => {
    const d = depsCom([{ durS: 3.84 }]);
    d.gerar.mockResolvedValueOnce({ mp3: bom(40000), durS: 3.84, f0Hz: 190 });
    expect((await sintetizarSaudacao(A, d)).f0Hz).toBe(190);
  });
});

/** Storage de mentira: guarda o que foi gravado e deixa decidir o que "já existe". */
function storageFalso(existentes: Record<string, number> = {}, falhaUpload = false) {
  const gravados: { bucket: string; chave: string; tamanho: number; opts: any }[] = [];
  return {
    gravados,
    sb: {
      storage: {
        from: (bucket: string) => ({
          download: async (chave: string) => (existentes[chave] ? { data: { size: existentes[chave] }, error: null } : { data: null, error: { message: 'Object not found' } }),
          upload: async (chave: string, corpo: Buffer, opts: any) => {
            if (falhaUpload) return { error: { message: 'bucket cheio' } };
            gravados.push({ bucket, chave, tamanho: corpo.length, opts });
            return { error: null };
          },
        }),
      },
    },
  };
}

describe('garantirSaudacoes', () => {
  beforeEach(() => registrarDegradacaoMock.mockClear());
  const chaveDe = (id: string, nome: string) => chaveDoAudioDaSaudacao({ colaboradorId: id, nome, versao: ELENCO.mentora.versao });
  const depsOk = (): DepsDaSaudacao & { gerar: ReturnType<typeof vi.fn> } => ({
    gerar: vi.fn(async () => ({ mp3: bom(40000), durS: 3.8, f0Hz: 195 })),
    transcrever: vi.fn(async () => palavras(FRASE_OK)),
  }) as any;

  it('gera o que falta e grava no caminho que a caixa vai ler, como mp3, no bucket certo', async () => {
    const st = storageFalso();
    const r = await garantirSaudacoes({ empresaId: 'emp-1', pessoas: [{ colaboradorId: 'c-1', nome: 'Marina Souza' }], sb: st.sb, deps: depsOk() });
    expect(r.geradas).toEqual(['c-1']);
    expect(st.gravados).toEqual([{ bucket: 'video-assets', chave: chaveDe('c-1', 'Marina'), tamanho: 40000, opts: { contentType: 'audio/mpeg', upsert: true } }]);
  });

  it('o que já existe NÃO é sintetizado de novo (idempotente: o reaproveitamento é o que faz a escala custar centavos)', async () => {
    const st = storageFalso({ [chaveDe('c-1', 'Ana')]: 40000 });
    const d = depsOk();
    const r = await garantirSaudacoes({ empresaId: 'emp-1', pessoas: [{ colaboradorId: 'c-1', nome: 'Ana' }], sb: st.sb, deps: d });
    expect(r.jaExistiam).toEqual(['c-1']);
    expect(d.gerar).not.toHaveBeenCalled();
    expect(st.gravados).toEqual([]);
  });

  it('arquivo existente mas minúsculo (resto de upload quebrado) é refeito', async () => {
    const st = storageFalso({ [chaveDe('c-1', 'Ana')]: 120 });
    const r = await garantirSaudacoes({ empresaId: 'emp-1', pessoas: [{ colaboradorId: 'c-1', nome: 'Ana' }], sb: st.sb, deps: depsOk() });
    expect(r.geradas).toEqual(['c-1']);
  });

  it('falha de UMA pessoa não derruba as outras e deixa rastro em degradacao_log com a pessoa e a empresa', async () => {
    const st = storageFalso();
    const d = depsOk();
    d.gerar.mockImplementation(async (texto: string) => { if (texto.includes('Luciana')) return { mp3: bom(40000), durS: 6.6, f0Hz: 239 }; return { mp3: bom(40000), durS: 3.8, f0Hz: 195 }; });
    const r = await garantirSaudacoes({ empresaId: 'emp-1', pessoas: [{ colaboradorId: 'c-1', nome: 'Ana' }, { colaboradorId: 'c-2', nome: 'Luciana' }], sb: st.sb, deps: d });
    expect(r.geradas).toEqual(['c-1']);
    expect(r.falhas.map((f) => f.colaboradorId)).toEqual(['c-2']);
    expect(r.falhas[0].motivo).toContain('longa demais');
    expect(registrarDegradacaoMock).toHaveBeenCalledTimes(1);
    expect(registrarDegradacaoMock.mock.calls[0][0]).toMatchObject({ fluxo: 'video', tipo: DEGRADACAO.SAUDACAO_VERTEX_FALHOU, chave: 'c-2', empresaId: 'emp-1', colaboradorId: 'c-2', severidade: 'aviso' });
  });

  it('upload que falha é falha da pessoa (não "gerada"), com rastro', async () => {
    const st = storageFalso({}, true);
    const r = await garantirSaudacoes({ empresaId: 'emp-1', pessoas: [{ colaboradorId: 'c-1', nome: 'Ana' }], sb: st.sb, deps: depsOk() });
    expect(r.geradas).toEqual([]);
    expect(r.falhas[0].motivo).toContain('bucket cheio');
    expect(registrarDegradacaoMock).toHaveBeenCalledTimes(1);
  });

  it('passou o prazo: não começa pessoa nova (vai para adiadas) e não gasta síntese', async () => {
    const d = depsOk();
    const r = await garantirSaudacoes({ empresaId: 'emp-1', pessoas: [{ colaboradorId: 'c-1', nome: 'Ana' }], sb: storageFalso().sb, deps: d, prazoAteMs: Date.now() - 1 });
    expect(r.adiadas).toEqual(['c-1']);
    expect(d.gerar).not.toHaveBeenCalled();
  });

  it('sem nome e pessoa repetida: sem nome não é falha, e a repetida conta uma vez', async () => {
    const d = depsOk();
    const r = await garantirSaudacoes({ empresaId: 'emp-1', pessoas: [{ colaboradorId: 'c-1', nome: 'Ana' }, { colaboradorId: 'c-1', nome: 'Ana' }, { colaboradorId: 'c-2', nome: '  ' }], sb: storageFalso().sb, deps: d });
    expect(r.geradas).toEqual(['c-1']);
    expect(r.semNome).toEqual(['c-2']);
    expect(d.gerar).toHaveBeenCalledTimes(1);
  });

  it('respeita a concorrência pedida (o Vertex divide TPM com narração e podcast)', async () => {
    let ativas = 0, pico = 0;
    const d: any = {
      gerar: vi.fn(async () => { ativas++; pico = Math.max(pico, ativas); await new Promise((r) => setTimeout(r, 5)); ativas--; return { mp3: bom(40000), durS: 3.8, f0Hz: 195 }; }),
      transcrever: vi.fn(async () => palavras(FRASE_OK)),
    };
    const pessoas = Array.from({ length: 8 }, (_, i) => ({ colaboradorId: `c-${i}`, nome: `Nome${i}` }));
    await garantirSaudacoes({ empresaId: 'emp-1', pessoas, sb: storageFalso().sb, deps: d, concorrencia: 2 });
    expect(pico).toBe(2);
  });
});

describe('destinatariosDaCelula: a MESMA regra da caixa (personalizeCell)', () => {
  const colab = (id: string, perfil: string, nome = 'Pessoa ' + id, pref: any = {}) => ({ id, nome_completo: nome, perfil_dominante: perfil, cargo: 'Professor(a)', empresa_id: 'emp-1', ...pref });
  const montar = (celula: any, colabs: any[], kit: any = null) => criarSupabaseMock({
    resolver: (t) => (t === 'videos_gerados' ? celula : t === 'kits' ? kit : null),
    lista: (t) => (t === 'colaboradores' ? colabs : []),
  });

  it('cargo exato, 1ª letra do DISC e nome preenchido', async () => {
    const sb = montar({ id: 'cel', empresa_id: 'emp-1', cargo: 'Professor(a)', disc_dominante: 'S', kit_id: null },
      [colab('a', 'S'), colab('b', 'SI'), colab('c', 'I'), colab('d', 'S', '   '), colab('e', '')]);
    const r = await destinatariosDaCelula(sb.client, 'cel');
    expect(r!.pessoas.map((p) => p.colaboradorId)).toEqual(['a', 'b']);
    expect(r!.empresaId).toBe('emp-1');
  });

  it('kit nascido da regra das preferências: só quem tem vídeo entre os 2 primeiros formatos', async () => {
    const sb = montar({ id: 'cel', empresa_id: 'emp-1', cargo: 'Professor(a)', disc_dominante: 'S', kit_id: 'kit-1' },
      [colab('quer', 'S', 'Quer', { pref_video_curto: 7, pref_texto: 6 }), colab('nao', 'S', 'Nao', { pref_texto: 7, pref_estudo_caso: 6 }), colab('sem', 'S', 'Sem')],
      { desafio: { por_preferencia: true } });
    const r = await destinatariosDaCelula(sb.client, 'cel');
    expect(r!.pessoas.map((p) => p.colaboradorId)).toEqual(['quer']);
  });

  it('kit anterior à regra (sem a marca): todos da célula, como a caixa faz', async () => {
    const sb = montar({ id: 'cel', empresa_id: 'emp-1', cargo: 'Professor(a)', disc_dominante: 'S', kit_id: 'kit-1' }, [colab('a', 'S'), colab('b', 'S')], { desafio: {} });
    expect((await destinatariosDaCelula(sb.client, 'cel'))!.pessoas).toHaveLength(2);
  });

  it('célula incompleta (DISC inválido ou sem cargo) é null: a caixa também a pula', async () => {
    expect(await destinatariosDaCelula(montar({ id: 'cel', empresa_id: 'emp-1', cargo: 'Professor(a)', disc_dominante: null, kit_id: null }, []).client, 'cel')).toBeNull();
    expect(await destinatariosDaCelula(montar({ id: 'cel', empresa_id: 'emp-1', cargo: null, disc_dominante: 'S', kit_id: null }, []).client, 'cel')).toBeNull();
  });

  it('falha ao ler o kit LANÇA (tratar como "kit antigo" sintetizaria para quem a caixa não vai saudar)', async () => {
    const sb = montar({ id: 'cel', empresa_id: 'emp-1', cargo: 'Professor(a)', disc_dominante: 'S', kit_id: 'kit-1' }, [colab('a', 'S')]);
    sb.falharEm({ tabela: 'kits', op: 'select', mensagem: 'kits indisponível' });
    await expect(destinatariosDaCelula(sb.client, 'cel')).rejects.toThrow('kits indisponível');
  });

  it('falha ao ler os colaboradores LANÇA (lista parcial vira "ninguém")', async () => {
    const sb = montar({ id: 'cel', empresa_id: 'emp-1', cargo: 'Professor(a)', disc_dominante: 'S', kit_id: null }, []);
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'colaboradores indisponível' });
    await expect(destinatariosDaCelula(sb.client, 'cel')).rejects.toThrow('colaboradores indisponível');
  });

  it('garantirSaudacoesDaCelula NUNCA lança: a falha de leitura vira { erro } com rastro, e o render segue', async () => {
    registrarDegradacaoMock.mockClear();
    const sb = montar({ id: 'cel', empresa_id: 'emp-1', cargo: 'Professor(a)', disc_dominante: 'S', kit_id: null }, []);
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'colaboradores indisponível' });
    const r = await garantirSaudacoesDaCelula('cel', { sb: sb.client });
    expect(r).toMatchObject({ erro: expect.stringContaining('colaboradores indisponível') });
    expect(registrarDegradacaoMock).toHaveBeenCalledTimes(1);
    expect(resumirSaudacoes(r)).toEqual({ erro: expect.any(String) });
  });
});

/**
 * Quem consome. A regra existir num arquivo que ninguém chama é config sem consumidor, e a ausência de um sintetizador na
 * caixa só prova algo com controle positivo: o arquivo certo tem que mostrar que LÊ o áudio do app.
 */
describe('a caixa não sintetiza: lê o áudio do app, e a falta deixa rastro', () => {
  const personalizar = readFileSync('worker-hetzner/personalizar.mjs', 'utf-8');
  const worker = readFileSync('worker-hetzner/worker.mjs', 'utf-8');

  it('controle positivo: personalizar.mjs lê o áudio pela chave compartilhada e lança SaudacaoAusenteError', () => {
    expect(personalizar).toContain("from './saudacao-audio.mjs'");
    expect(personalizar).toContain('chaveDoAudioDaSaudacao(');
    expect(personalizar).toContain('class SaudacaoAusenteError');
    expect(personalizar).toContain('throw new SaudacaoAusenteError');
  });

  it('não chama nenhum sintetizador (nem o AI Studio como "plano B"): cair nele reabriria o sorteio sem rastro', () => {
    expect(personalizar).not.toContain('generativelanguage.googleapis.com');
    expect(personalizar).not.toMatch(/GEMINI_API_KEY|GEMINI_TTS_MODEL/);
    expect(personalizar).not.toContain('responseModalities');
  });

  it('o cache do vídeo da saudação leva o HASH do áudio: re-sintetizar ou trocar a voz invalida o mp4 antigo', () => {
    expect(personalizar).toMatch(/createHash\('sha1'\)\.update\(wav\)/);
    expect(personalizar).toContain('vertex-${audioId}');
  });

  it('o worker registra a ausência por pessoa e a de configuração como crítica, e não exige mais chave de TTS', () => {
    expect(worker).toContain('DEGRADACAO_SAUDACAO_AUSENTE');
    expect(worker).toContain("e?.name === 'SaudacaoAusenteError'");
    expect(worker).toMatch(/severidade: 'critico'/);
    expect(worker).not.toContain('process.env.GEMINI_API_KEY');
  });

  it('o Dockerfile copia o módulo novo (senão a box morre no import)', () => {
    expect(readFileSync('worker-hetzner/Dockerfile', 'utf-8')).toContain('saudacao-audio.mjs');
  });
});

describe('quem gera o áudio é chamado no render e na reconciliação', () => {
  it('gerar-video-modulo dispara a task das saudações logo depois de enfileirar o render, sem esperar por ela', () => {
    const src = readFileSync('trigger/gerar-video-modulo.ts', 'utf-8');
    const iFila = src.indexOf("status: 'render_queued', etapa: 'render'");
    const iDisparo = src.indexOf("tasks.trigger<typeof gerarSaudacoesCelulaTask>('gerar-saudacoes-celula'");
    expect(iFila).toBeGreaterThan(0);
    expect(iDisparo).toBeGreaterThan(iFila);
    expect(src).not.toContain('triggerAndWait<typeof gerarSaudacoesCelulaTask>');
    expect(src).toContain('DEGRADACAO.SAUDACAO_VERTEX_FALHOU');
  });

  it('a task limita a concorrência (Vertex divide TPM) e não repete a task inteira', () => {
    const src = readFileSync('trigger/gerar-saudacoes-celula.ts', 'utf-8');
    expect(src).toContain("id: 'gerar-saudacoes-celula'");
    expect(src).toMatch(/concurrencyLimit: 2/);
    expect(src).toMatch(/maxAttempts: 1/);
    expect(src).toContain('garantirSaudacoesDaCelula(');
  });
});

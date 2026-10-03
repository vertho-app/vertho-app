import { beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { criarStorageFalso } from '../helpers/storage-falso';
import {
  BUCKET_AUDIO_LEGADO,
  BUCKET_AUDIO_PERSONALIZADO,
  TTL_LINK_AUDIO_SEGUNDOS,
  caminhoAudioPersonalizado,
  caminhoAudioPersonalizadoLegado,
  listarAudiosPersonalizadosDoConteudo,
  localizarAudioPersonalizado,
  moverAudioPersonalizado,
  salvarAudioPersonalizado,
} from '@/lib/conteudo/audio-personalizado';

/**
 * Continuação do R-74 (03/10/2026): o podcast com "Olá, {nome}" morava no
 * bucket PÚBLICO `conteudos`. Estes testes fixam a régua do helper que os
 * escritores e o leitor passaram a usar.
 */
const EMP = '11111111-1111-4111-8111-111111111111';
const CONT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COLAB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CHAVE = { empresaId: EMP, conteudoId: CONT, colaboradorId: COLAB };
const NOVO = `${EMP}/audio-personalizado/${CONT}/${COLAB}.mp3`;
const ANTIGO = `final/audio-personalizado/${CONT}/${COLAB}.mp3`;

const st = criarStorageFalso();
beforeEach(() => st.reset());

describe('caminhos', () => {
  it('o novo fica no bucket PRIVADO, na pasta da empresa da pessoa', () => {
    expect(BUCKET_AUDIO_PERSONALIZADO).toBe('relatorios-pdf');
    expect(caminhoAudioPersonalizado(CHAVE)).toBe(NOVO);
  });

  it('o antigo é o formato que os escritores usavam até 03/10/2026, sem empresa', () => {
    expect(BUCKET_AUDIO_LEGADO).toBe('conteudos');
    expect(caminhoAudioPersonalizadoLegado(CHAVE)).toBe(ANTIGO);
  });

  it('sem empresa, conteúdo ou pessoa não há caminho (arquivo sem dono)', () => {
    expect(() => caminhoAudioPersonalizado({ ...CHAVE, empresaId: '' })).toThrow(/empresa/);
    expect(() => caminhoAudioPersonalizado({ ...CHAVE, empresaId: null as any })).toThrow(/empresa/);
    expect(() => caminhoAudioPersonalizado({ ...CHAVE, conteudoId: '' })).toThrow(/obrigatórios/);
    expect(() => caminhoAudioPersonalizado({ ...CHAVE, colaboradorId: '' })).toThrow(/obrigatórios/);
  });

  it('nenhum segmento sobe ou desce de pasta', () => {
    const c = caminhoAudioPersonalizado({ empresaId: '../x', conteudoId: 'a/b', colaboradorId: '..' });
    expect(c).toBe('___x/audio-personalizado/a_b/__.mp3');
    expect(c.split('/')).toHaveLength(4);
  });
});

describe('localizar: privado primeiro, antigo depois, sempre por link assinado', () => {
  it('🔴 achado no privado: link ASSINADO do bucket privado, nunca a URL pública', async () => {
    st.semear(BUCKET_AUDIO_PERSONALIZADO, NOVO);
    st.semear(BUCKET_AUDIO_LEGADO, ANTIGO);
    const r: any = await localizarAudioPersonalizado(st.storage, CHAVE);
    expect(r).toMatchObject({ bucket: 'relatorios-pdf', caminho: NOVO, legado: false });
    expect(r.url).toContain('assinado.exemplo/relatorios-pdf/');
    expect(st.chamadas.some((c) => c.metodo === 'getPublicUrl')).toBe(false);
    // achou no privado: nem pergunta ao antigo
    expect(st.chamadas.filter((c) => c.bucket === BUCKET_AUDIO_LEGADO)).toHaveLength(0);
  });

  it('só no formato antigo: assina no bucket antigo (o link expira, o público não)', async () => {
    st.semear(BUCKET_AUDIO_LEGADO, ANTIGO);
    const r: any = await localizarAudioPersonalizado(st.storage, CHAVE);
    expect(r).toMatchObject({ bucket: 'conteudos', caminho: ANTIGO, legado: true });
    expect(r.url).not.toContain('/object/public/');
  });

  it('o link dura o bastante para ouvir com pausa, e expira', async () => {
    st.semear(BUCKET_AUDIO_PERSONALIZADO, NOVO);
    await localizarAudioPersonalizado(st.storage, CHAVE);
    const [assinatura] = st.chamadas.filter((c) => c.metodo === 'createSignedUrl');
    expect(assinatura.args[1]).toBe(TTL_LINK_AUDIO_SEGUNDOS);
    expect(TTL_LINK_AUDIO_SEGUNDOS).toBeGreaterThanOrEqual(15 * 60);
    expect(TTL_LINK_AUDIO_SEGUNDOS).toBeLessThanOrEqual(3600);
  });

  it('em lugar nenhum: `ausente` (quem chama gera)', async () => {
    expect(await localizarAudioPersonalizado(st.storage, CHAVE)).toEqual({ ausente: true });
  });

  it('🔴 Storage fora NÃO vira "ausente" (seria pagar TTS por um arquivo que existe)', async () => {
    st.semear(BUCKET_AUDIO_LEGADO, ANTIGO);
    st.falhar(BUCKET_AUDIO_PERSONALIZADO, 'createSignedUrl', 'fetch failed: ECONNRESET');
    const r: any = await localizarAudioPersonalizado(st.storage, CHAVE);
    expect(r.erro).toMatch(/ECONNRESET/);
  });

  it('"Bucket not found" é configuração quebrada, não ausência', async () => {
    st.falhar(BUCKET_AUDIO_PERSONALIZADO, 'createSignedUrl', 'Bucket not found');
    const r: any = await localizarAudioPersonalizado(st.storage, CHAVE);
    expect(r.erro).toMatch(/Bucket not found/);
  });
});

describe('salvar', () => {
  it('🔴 grava no bucket PRIVADO, no caminho novo, e devolve o caminho', async () => {
    const r = await salvarAudioPersonalizado(st.storage, CHAVE, Buffer.from('mp3'), 'audio/mpeg');
    expect(r).toEqual({ caminho: NOVO });
    expect(st.existe(BUCKET_AUDIO_PERSONALIZADO, NOVO)).toBe(true);
    expect(st.caminhos(BUCKET_AUDIO_LEGADO)).toEqual([]);
    const [up] = st.chamadas.filter((c) => c.metodo === 'upload');
    expect(up.args[2]).toMatchObject({ contentType: 'audio/mpeg', upsert: true });
  });

  it('falha de upload volta como erro, não como caminho', async () => {
    st.falhar(BUCKET_AUDIO_PERSONALIZADO, 'upload', 'quota');
    expect(await salvarAudioPersonalizado(st.storage, CHAVE, Buffer.from('x'), 'audio/mpeg')).toEqual({ erro: 'quota' });
  });
});

describe('listar e mover (reset da demo)', () => {
  it('lista os dois lugares do conteúdo, com o id da pessoa', async () => {
    const OUTRA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    st.semear(BUCKET_AUDIO_PERSONALIZADO, NOVO);
    st.semear(BUCKET_AUDIO_LEGADO, `final/audio-personalizado/${CONT}/${OUTRA}.mp3`);
    st.semear(BUCKET_AUDIO_LEGADO, `final/audio-personalizado/${CONT}/leia-me.txt`);
    const { audios, erros } = await listarAudiosPersonalizadosDoConteudo(st.storage, EMP, CONT);
    expect(erros).toEqual([]);
    expect(audios.map((a) => [a.bucket, a.colaboradorId, a.legado]).sort()).toEqual([
      ['conteudos', OUTRA, true],
      ['relatorios-pdf', COLAB, false],
    ]);
  });

  it('falha de listagem volta como erro (o reset não pode concluir "nada a mover")', async () => {
    st.falhar(BUCKET_AUDIO_LEGADO, 'list', 'timeout');
    const { erros } = await listarAudiosPersonalizadosDoConteudo(st.storage, EMP, CONT);
    expect(erros.join()).toMatch(/timeout/);
  });

  it('🔴 do formato antigo para o id novo: atravessa para o PRIVADO e some do público', async () => {
    const NOVO_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    st.semear(BUCKET_AUDIO_LEGADO, ANTIGO);
    const r = await moverAudioPersonalizado(st.storage, { bucket: BUCKET_AUDIO_LEGADO, caminho: ANTIGO }, { ...CHAVE, colaboradorId: NOVO_ID });
    const destino = `${EMP}/audio-personalizado/${CONT}/${NOVO_ID}.mp3`;
    expect(r).toEqual({ caminho: destino });
    expect(st.existe(BUCKET_AUDIO_PERSONALIZADO, destino)).toBe(true);
    expect(st.caminhos(BUCKET_AUDIO_LEGADO)).toEqual([]);
  });

  it('do privado para o id novo: move dentro do privado', async () => {
    const NOVO_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    st.semear(BUCKET_AUDIO_PERSONALIZADO, NOVO);
    const r = await moverAudioPersonalizado(st.storage, { bucket: BUCKET_AUDIO_PERSONALIZADO, caminho: NOVO }, { ...CHAVE, colaboradorId: NOVO_ID });
    expect(r).toEqual({ caminho: `${EMP}/audio-personalizado/${CONT}/${NOVO_ID}.mp3` });
    expect(st.caminhos(BUCKET_AUDIO_PERSONALIZADO)).toEqual([`${EMP}/audio-personalizado/${CONT}/${NOVO_ID}.mp3`]);
  });

  it('upload que falha na travessia deixa o antigo onde está', async () => {
    st.semear(BUCKET_AUDIO_LEGADO, ANTIGO);
    st.falhar(BUCKET_AUDIO_PERSONALIZADO, 'upload', 'quota');
    const r: any = await moverAudioPersonalizado(st.storage, { bucket: BUCKET_AUDIO_LEGADO, caminho: ANTIGO }, CHAVE);
    expect(r.erro).toMatch(/quota/);
    expect(st.existe(BUCKET_AUDIO_LEGADO, ANTIGO)).toBe(true);
  });

  it('remoção do antigo que falha: a cópia nova vale, e o resto volta como aviso', async () => {
    st.semear(BUCKET_AUDIO_LEGADO, ANTIGO);
    st.falhar(BUCKET_AUDIO_LEGADO, 'remove', 'permissão');
    const r: any = await moverAudioPersonalizado(st.storage, { bucket: BUCKET_AUDIO_LEGADO, caminho: ANTIGO }, CHAVE);
    expect(r.caminho).toBe(NOVO);
    expect(r.aviso).toMatch(/permissão/);
    expect(st.existe(BUCKET_AUDIO_PERSONALIZADO, NOVO)).toBe(true);
  });
});

/**
 * Guard: nenhum código de produção volta a escrever (ou montar) o caminho
 * antigo, que mora no bucket PÚBLICO. O único lugar que o conhece é o helper,
 * e só para LER o estoque até a migração. Antes de 03/10/2026 eram quatro
 * escritores com o caminho montado à mão (rota do podcast, action de
 * pré-geração, rota interna e reset da demo), um deles por `[...].join('/')`,
 * por isso o guard procura também o segmento solto entre aspas.
 */
describe('guard: o caminho público antigo só existe no helper', () => {
  const HELPER = 'lib/conteudo/audio-personalizado.ts';
  const DIRS = ['app/', 'actions/', 'lib/', 'trigger/', 'worker-hetzner/', 'components/'];
  const PADROES = [/final\/audio-personalizado/, /['"`]audio-personalizado['"`]/];

  const rastreados = (): string[] => {
    const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0')
      .filter((f) => /\.(tsx?|mjs|js)$/.test(f))
      .filter((f) => DIRS.some((d) => f.startsWith(d)))
      .filter((f) => !f.includes('/tests/'));
  };

  it('o guard enxerga o repositório e reconhece o padrão (não passa vazio)', () => {
    expect(rastreados().length).toBeGreaterThan(300);
    const doHelper = readFileSync(HELPER, 'utf-8');
    expect(PADROES[0].test(doHelper)).toBe(true);
    expect(PADROES[1].test("['final', 'audio-personalizado', id].join('/')")).toBe(true);
  });

  it('🔴 nenhum outro arquivo de produção monta o caminho antigo', () => {
    const violacoes = rastreados()
      .filter((f) => f !== HELPER && existsSync(f))
      .filter((f) => {
        const texto = readFileSync(f, 'utf-8');
        return PADROES.some((p) => p.test(texto));
      });
    expect(violacoes, 'use lib/conteudo/audio-personalizado.ts (bucket privado + link assinado)').toEqual([]);
  });
});

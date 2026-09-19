import 'server-only';
import { randomUUID } from 'node:crypto';
import { maskTextPII } from '@/lib/pii-masker';
import { DOSSIÊS, PROMPTS } from './prompts';
import { gerador, hash, novoEstado } from './ai';
import { episodioPublico, executarCore, visaoPublica } from './core';
import { sinteseDaJornada, type SinteseJornada } from './avaliacao';
import { podeAcompanharLideranca } from './equipe';
import {
  LiderancaError,
  VERSAO,
  VERSAO_ANTERIOR,
  comandoSchema,
  type Estado,
  type Episodio,
  type Comando,
} from './schema';
import type { Contexto } from './access';

type Row = {
  id: string;
  estado: Estado;
  revisao: number;
  lock_until: string | null;
};
const owned = (c: Contexto) =>
  c.tdb
    .from('sim_lideranca_jornadas')
    .select('id,estado,revisao,lock_until')
    .eq('owner_key', c.ownerKey);
function banco(error: unknown) {
  if (error)
    throw new LiderancaError(
      503,
      'Não foi possível salvar ou recuperar o encontro. Tente novamente.',
    );
}
const publico = (r: Row) => ({
  ...visaoPublica(r.estado),
  revisao: r.revisao,
  processandoAte: r.lock_until,
});

export async function consultar(
  c: Contexto,
  episodioId?: string | null,
  pagina = 0,
) {
  const res = await owned(c).maybeSingle();
  banco(res.error);
  const row = res.data as Row | null;
  let historico: Array<{
    id: string;
    indice: number;
    repeticao: boolean;
    created_at: string;
  }> = [];
  let selecionado = row?.estado.ativo
    ? episodioPublico(row.estado.ativo)
    : null;
  let temMais = false;
  if (row) {
    const lista = await c.tdb
      .from('sim_lideranca_episodios')
      .select('id,indice,repeticao,created_at')
      .eq('jornada_id', row.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(pagina * 20, pagina * 20 + 20);
    banco(lista.error);
    historico = lista.data.slice(0, 20);
    temMais = lista.data.length > 20;
    const alvo = episodioId || (!selecionado ? historico[0]?.id : null);
    if (alvo) {
      const ep = await c.tdb
        .from('sim_lideranca_episodios')
        .select('episodio')
        .eq('jornada_id', row.id)
        .eq('id', alvo)
        .maybeSingle();
      banco(ep.error);
      if (!ep.data) throw new LiderancaError(404, 'Encontro não encontrado.');
      selecionado = episodioPublico(ep.data.episodio as Episodio);
    }
  } else if (episodioId)
    throw new LiderancaError(404, 'Encontro não encontrado.');
  // Síntese da jornada: originais (no estado) e repetições (no acervo).
  let sintese: SinteseJornada | null = null;
  if (row?.estado.concluidos.length) {
    const reps: Array<Pick<Episodio, 'indice' | 'encerradoEm' | 'avaliacao' | 'repeticao'>> = [];
    for (let de = 0; ; de += 500) {
      const lista = await c.tdb
        .from('sim_lideranca_episodios')
        .select('indice,avaliacao:episodio->avaliacao,encerradoEm:episodio->>encerradoEm')
        .eq('jornada_id', row.id)
        .eq('repeticao', true)
        .order('id')
        .range(de, de + 499);
      banco(lista.error);
      reps.push(
        ...(lista.data || []).map((r: any) => ({
          indice: r.indice,
          encerradoEm: r.encerradoEm,
          avaliacao: r.avaliacao,
          repeticao: true,
        })),
      );
      if ((lista.data || []).length < 500) break;
    }
    sintese = sinteseDaJornada(
      [...row.estado.concluidos, ...reps],
      row.estado.matriz,
      row.estado.concluidos.length,
    );
  }
  return {
    empresaId: c.empresaId,
    empresaNome: c.empresaNome,
    admin: c.auth.isPlatformAdmin,
    jornada: row ? publico(row) : null,
    selecionado,
    historico,
    pagina,
    temMais,
    sintese,
    acompanhaEquipe: await podeAcompanharLideranca(c.auth),
  };
}
export type Dados = Awaited<ReturnType<typeof consultar>>;

export async function executar(c: Contexto, entrada: Comando) {
  const deadline = Date.now() + 270000;
  const cmd = comandoSchema.parse(
    'texto' in entrada
      ? { ...entrada, texto: maskTextPII(entrada.texto).trim() }
      : entrada,
  );
  const comandoHash = hash(cmd);
  let loaded = await owned(c).maybeSingle();
  banco(loaded.error);
  if (!loaded.data) {
    if (cmd.acao !== 'iniciar')
      throw new LiderancaError(409, 'Comece sua jornada antes de continuar.');
    const estado = await novoEstado(c);
    const created = await c.tdb.from('sim_lideranca_jornadas').insert({
      id: cmd.requestId,
      owner_key: c.ownerKey,
      colaborador_id: c.colaboradorId,
      estado,
    });
    if (created.error?.code !== '23505') banco(created.error);
    loaded = await owned(c).maybeSingle();
    banco(loaded.error);
  }
  const row = loaded.data as Row | null;
  if (!row)
    throw new LiderancaError(503, 'Não foi possível começar sua jornada.');
  // Jornada v1 é atualizada no próximo comando, em vez de travar com "Atualize
  // a página" (beco sem saída: a página recarregada continuava na v1). Ela
  // ganha os prompts da v2; o que já foi concluído segue lido como foi gerado.
  if (row.estado.versao === VERSAO_ANTERIOR)
    row.estado = { ...row.estado, versao: VERSAO, prompts: { ...PROMPTS } };
  if (row.estado.versao !== VERSAO)
    throw new LiderancaError(
      409,
      'Esta jornada foi criada numa versão que não pode ser retomada. Fale com o suporte.',
    );
  const recibo = row.estado.recibos.find((r) => r.id === cmd.requestId);
  if (recibo) {
    if (recibo.hash !== comandoHash)
      throw new LiderancaError(
        409,
        'Este envio já foi usado para outro conteúdo.',
      );
    return consultar(c);
  }
  if (row.revisao !== cmd.revisao)
    throw new LiderancaError(
      409,
      'O encontro mudou em outra aba. Atualize antes de continuar.',
    );
  const token = randomUUID();
  const claimed = await c.tdb
    .from('sim_lideranca_jornadas')
    .update({
      lock_token: token,
      lock_until: new Date(Date.now() + 330000).toISOString(),
    })
    .eq('id', row.id)
    .eq('owner_key', c.ownerKey)
    .eq('revisao', row.revisao)
    .or(`lock_until.is.null,lock_until.lte.${new Date().toISOString()}`)
    .select('id')
    .maybeSingle();
  banco(claimed.error);
  if (!claimed.data)
    throw new LiderancaError(
      409,
      'Há um envio em processamento. Aguarde e atualize o encontro.',
    );
  try {
    const result = await executarCore(
      row.estado,
      cmd,
      gerador(c, row.id, row.estado, cmd.requestId, deadline),
      DOSSIÊS,
    );
    result.estado.recibos.push({ id: cmd.requestId, hash: comandoHash });
    const salvo = await c.tdb.rpc('sim_lideranca_salvar', {
      p_id: row.id,
      p_empresa: c.empresaId,
      p_owner: c.ownerKey,
      p_token: token,
      p_revisao: row.revisao,
      p_estado: result.estado,
      p_episodio: result.arquivo,
    });
    banco(salvo.error);
    if (!salvo.data)
      throw new LiderancaError(
        409,
        'A confirmação do envio expirou. Atualize e tente novamente.',
      );
    return consultar(c, result.arquivo?.id);
  } finally {
    const release = await c.tdb
      .from('sim_lideranca_jornadas')
      .update({ lock_token: null, lock_until: null })
      .eq('id', row.id)
      .eq('owner_key', c.ownerKey)
      .eq('lock_token', token);
    if (release.error) console.error('[sim-lideranca] falha ao liberar envio');
  }
}

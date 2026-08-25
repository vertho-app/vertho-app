/**
 * GRAVAÇÃO INCREMENTAL DA CENA — pura o bastante para testar sem IA.
 *
 * 🔴 MEDIDO NA FASE 0c (25/08/2026): o log dizia 10 cenas gravadas, o arquivo
 * tinha 9, e a linha "6/10" nunca saiu. O script empilhava `rodadas` em memória
 * e sobrescrevia UM json a cada cena. Três modos de falha, todos silenciosos:
 *
 *   1. `writeFileSync` TRUNCA o destino antes de escrever. Se a cena 6 morre no
 *      meio do write (JSON já grande), o arquivo fica inválido ou com a versão
 *      anterior — e o processo que continua acha que gravou.
 *   2. Sem retomada: um restart começa `rodadas = []` e o próximo gravar APAGA
 *      o que já existia.
 *   3. Dois processos no mesmo `--saida` se sobrescrevem. O último a terminar
 *      ganha; o log de ambos mente.
 *
 * Aqui cada cena vira um shard (`foo.r06.json`) escrito atomicamente
 * (tmp + rename). O combinado é só conveniência. Retomada lê os shards em
 * ordem e RECUA no primeiro buraco — r07 sem r06 é erro, não "seguir adiante".
 */

import {
  existsSync, readFileSync, writeFileSync, renameSync, unlinkSync,
  openSync, closeSync, writeSync,
} from 'node:fs';

export const shardPath = (saida: string, i: number) =>
  String(saida).replace(/\.json$/i, '') + `.r${String(i).padStart(2, '0')}.json`;

export const lockPath = (saida: string) => `${saida}.lock`;

/** Escreve num tmp e troca o nome — o destino nunca fica truncado a meio. */
export function escreverAtomico(caminho: string, dados: unknown) {
  const tmp = `${caminho}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  try {
    if (existsSync(caminho)) unlinkSync(caminho);
    renameSync(tmp, caminho);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* tmp órfão é preferível a destino truncado */ }
    throw e;
  }
}

/**
 * Lê shards 1..N. Para no primeiro arquivo ausente.
 * Se um shard MAIS ALTO existir depois do buraco, lança — seguir seria o
 * "6/10 sumiu e 7/10 apareceu" da fase 0c.
 */
export function carregarShards(saida: string, esperado: number): unknown[] {
  const rs: unknown[] = [];
  let buraco: number | null = null;
  for (let i = 1; i <= esperado; i++) {
    const p = shardPath(saida, i);
    if (!existsSync(p)) {
      buraco = buraco ?? i;
      continue;
    }
    if (buraco != null) {
      throw new Error(
        `shard ${shardPath(saida, i)} existe mas ${shardPath(saida, buraco)} não — ` +
        'buraco na gravação, não retomar no escuro. Apague os shards posteriores ou recrie o que falta.',
      );
    }
    rs.push(JSON.parse(readFileSync(p, 'utf8')));
  }
  return rs;
}

/** `wx`: falha se o lock já existe. Devolve o unlock. */
export function adquirirLock(saida: string): () => void {
  const lock = lockPath(saida);
  let fd: number;
  try {
    fd = openSync(lock, 'wx');
  } catch (e: any) {
    const pid = existsSync(lock) ? readFileSync(lock, 'utf8').trim() : '?';
    throw new Error(
      `já existe um processo gravando ${saida} (lock ${lock}, pid ${pid}). ` +
      'Se for lixo de um crash, apague o .lock e retome.',
      { cause: e },
    );
  }
  try { writeSync(fd, String(process.pid)); } finally { closeSync(fd); }
  return () => { try { unlinkSync(lock); } catch { /* já foi */ } };
}

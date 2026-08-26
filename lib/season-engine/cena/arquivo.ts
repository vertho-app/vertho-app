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

import { closeSync, existsSync, openSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync, writeSync } from 'node:fs';

export const shardPath = (saida: string, i: number) =>
  String(saida).replace(/\.json$/i, '') + `.r${String(i).padStart(2, '0')}.json`;

export const lockPath = (saida: string) => `${saida}.lock`;

/** Escreve num tmp e troca o nome — o destino nunca fica truncado a meio. */
/**
 * Quanto tempo um lock pode ficar sem batimento antes de contar como órfão.
 *
 * Uma cena leva 2 a 4 minutos e o dono toca o lock a cada shard gravado, então
 * 15 minutos é folga larga — e ainda assim destrava a retomada no mesmo dia em
 * que o processo morreu, em vez de exigir que um humano apague o arquivo.
 */
export const TETO_LOCK_PARADO_MS = 15 * 60 * 1000;

/** O dono do lock avisa que ainda está trabalhando. Barato: só toca o mtime. */
export function baterLock(saida: string) {
  const lock = lockPath(saida);
  try { utimesSync(lock, new Date(), new Date()); } catch { /* sem lock, sem batimento */ }
}

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
    /**
     * Lock órfão: o dono morreu sem soltar.
     *
     * 🔴 Medido 25/08/2026: a fase 0d foi interrompida no meio, o `finally` que
     * solta o lock nunca rodou, e a retomada seguinte morreu em EEXIST antes de
     * escrever um byte. A mensagem mandava "apague se for lixo de um crash" —
     * e quem lê não tem como saber se é. O código tem: basta perguntar se o pid
     * gravado ainda existe.
     *
     * `process.kill(pid, 0)` não mata nada — só testa se o processo está vivo.
     * Se estiver, o lock é legítimo e a falha continua sendo falha. Se não,
     * ele é lixo, e roubá-lo é correto — mas NUNCA em silêncio, porque um lock
     * roubado por engano é dois processos escrevendo no mesmo arquivo.
     */
    const bruto = existsSync(lock) ? readFileSync(lock, 'utf8').trim() : '';
    /**
     * 🔴 `process.kill(pid, 0)` NÃO É CONFIÁVEL NO WINDOWS.
     *
     * Medido em 25/08/2026, com o lock de uma rodada que tinha morrido:
     *
     *     process.kill(75772, 0)  → OK          (pid ausente do tasklist)
     *     process.kill(999999, 0) → throw ESRCH (pid que nunca existiu)
     *
     * Ou seja: pid que EXISTIU e morreu volta como "vivo", e a retomada seguinte
     * morre em EEXIST citando um dono que não existe mais. Meu teste anterior
     * validou com 4194304 — um pid que nunca existiu, o ramo FÁCIL — e por isso
     * passou verde sobre um check que não funciona no caso real.
     *
     * Então o pid vira só o caminho RÁPIDO (ESRCH = morto, com certeza), e quem
     * decide de fato é o BATIMENTO: o dono toca o lock a cada shard gravado, e
     * lock parado há mais que o teto está órfão. Isso não depende de semântica
     * de pid e vale nos dois sistemas.
     */
    const pid = Number(bruto);
    let vivo = true;
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); } catch (err: any) { if (err?.code !== 'EPERM') vivo = false; }
    } else {
      vivo = false; // lock sem pid legível
    }
    if (vivo) {
      // O pid diz vivo — mas no Windows ele diria isso de qualquer jeito.
      // O batimento é o que separa dono trabalhando de cadáver.
      let parado = Infinity;
      try { parado = Date.now() - statSync(lock).mtimeMs; } catch { /* sumiu na corrida */ }
      if (parado > TETO_LOCK_PARADO_MS) {
        console.warn(
          `[cena] lock em ${lock} sem batimento há ${Math.round(parado / 1000)}s ` +
          `(teto ${TETO_LOCK_PARADO_MS / 1000}s) — dono provavelmente morreu, assumindo`,
        );
        vivo = false;
      }
    }
    if (!vivo) {
      console.warn(`[cena] lock órfão em ${lock} (pid ${bruto || '?'}) — assumindo e seguindo`);
      try { unlinkSync(lock); } catch { /* corrida com outro que também assumiu */ }
      fd = openSync(lock, 'wx');
      try { writeSync(fd, String(process.pid)); } finally { closeSync(fd); }
      return () => { try { unlinkSync(lock); } catch { /* já foi */ } };
    }
    throw new Error(
      `já existe um processo gravando ${saida} (lock ${lock}, pid ${bruto || '?'}, VIVO). ` +
      'Espere ele terminar — apagar o lock aqui põe dois processos no mesmo arquivo.',
      { cause: e },
    );
  }
  try { writeSync(fd, String(process.pid)); } finally { closeSync(fd); }
  return () => { try { unlinkSync(lock); } catch { /* já foi */ } };
}

// Helpers e constantes compartilhados pelos módulos de actions/fase5/*.
// SEM 'use server' — nada aqui é action, apenas código interno.

import type { AIConfig } from '../ai-client';

// Configs específicas da fase 5 (estende a base com flags do check + lote)
export type Fase5Config = AIConfig & {
  checkModel?: string;
  incluirAprovados?: boolean;
};

/**
 * Upsert do relatório AGREGADO da empresa (`colaborador_id IS NULL`).
 *
 * B11 da auditoria 22/08. O código anterior fazia select + update/insert, com
 * uma justificativa correta e uma conclusão errada: UNIQUE de fato não detecta
 * conflito em NULL, mas a saída escolhida era uma CORRIDA — dois cliques no
 * botão de admin (o caso normal, não o raro) fazem os dois lados lerem
 * "não existe" e inserirem. E nem o update nem o insert capturavam `{ error }`,
 * então todos os chamadores devolviam `success: true` sem saber se gravaram.
 *
 * A mig 223 colapsa o NULL numa coluna GERADA (`colab_key`) e cria o índice
 * único `(empresa_id, tipo, colab_key)`. Com isso o upsert nativo funciona e o
 * read-modify-write desaparece — não há mais janela entre ler e escrever.
 *
 * Lança quando a escrita falha: relatório é o artefato que o RH lê e distribui;
 * "gerou mas não salvou" é pior que erro na tela.
 */
export async function upsertRelatorioAgregado(tdb: any, tipo: string, conteudo: any) {
  const { error } = await tdb.from('relatorios').upsert(
    { colaborador_id: null, tipo, conteudo, gerado_em: new Date().toISOString() },
    { onConflict: 'empresa_id,tipo,colab_key' },
  );
  if (error) {
    throw new Error(`não foi possível salvar o relatório "${tipo}": ${error.message}`);
  }
}

// ── Constantes (alinhadas com GAS) ──────────────────────────────────────────
export const TEMP = 0.4; // temperatura GAS para consistência

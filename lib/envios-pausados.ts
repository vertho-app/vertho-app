/**
 * PAUSA DE ENVIOS por empresa (pedido do dono, 16/10/2026, Amazon Bowling: "não envie os PDIs amanhã... precisamos
 * fechar todo o fluxo corretamente antes").
 *
 * Não havia como segurar uma empresa: o aviso de PDI pronto (cron `avisar_planos`, 9h) percorre todas as empresas que
 * não são demo, e a cadência diária (`trigger_diario`) atende toda empresa com envio no dia. A Amazon tinha 14 PDIs
 * novos (aviso no sábado) e 14 trilhas "ativas" com início na segunda, gerados enquanto o fluxo ainda tinha auditorias
 * reprovadas a refazer.
 *
 * `sys_config.envios_pausados = { motivo, desde, ate? }` (ou `true`). Sem `ate`, vale até alguém tirar a chave.
 * PAUSA: o aviso de PDI pronto (cron e o botão do painel do cliente), a cadência diária (o despacho e o worker) e o
 * preparo antecipado dela (cron `preparar_desafios`, que gera com IA as tarefas das semanas seguintes).
 * NÃO PAUSA: o envio manual explícito do admin (broadcast), que é decisão de quem clica.
 * NAS TELAS DA PESSOA (`pausaDaEmpresa`): o PDI fica "em preparação" (tela, download e link do PDF) e a trilha não
 * libera semana.
 */
export interface PausaEnvios { motivo: string; desde?: string; ate?: string }

/**
 * A pausa da empresa, lida do banco, para as telas da PESSOA (decisão do dono, 16/10/2026: "esconder até liberar"):
 * com a empresa pausada, o PDI aparece como "em preparação" e a trilha como "começa em breve". Falha de leitura NÃO
 * esconde: um erro passageiro do banco não pode sumir com o PDI de todas as empresas (registra no log e segue).
 */
export async function pausaDaEmpresa(sb: any, empresaId: string | null | undefined): Promise<PausaEnvios | null> {
  if (!empresaId) return null;
  const { data, error } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
  if (error) { console.error(`[envios-pausados] não li a pausa da empresa ${empresaId}: ${error.message}`); return null; }
  return pausaDeEnvios(data?.sys_config);
}

export function pausaDeEnvios(sysConfig: unknown, agoraISO: string = new Date().toISOString()): PausaEnvios | null {
  const p = (sysConfig as any)?.envios_pausados;
  if (p === true) return { motivo: 'pausa sem motivo registrado' };
  if (!p || typeof p !== 'object') return null;
  if (p.ate && String(p.ate) <= agoraISO) return null;
  return { motivo: String(p.motivo || 'pausa sem motivo registrado'), ...(p.desde ? { desde: String(p.desde) } : {}), ...(p.ate ? { ate: String(p.ate) } : {}) };
}

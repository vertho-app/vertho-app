/**
 * Pacote de clínicas: o modelo operacional da onlabel (contrato de 20/10/2026).
 *
 * Uma empresa (a onlabel) reúne muitas clínicas cadastradas. Cada secretária pertence a uma clínica
 * (a unidade, a mesma tabela `escolas` das redes de ensino), a um dos cargos fixos do projeto e a um
 * modelo de clínica do simulador. Quem cadastra é o admin da vertho.ai; o RH da empresa só recebe os
 * relatórios.
 *
 * Uma chave só, `empresas.sys_config.pacote_clinicas === true`, liga TODO o comportamento do pacote:
 *  - o RH sai dos lotes de WhatsApp das secretárias (`prepararLoteTemplate`);
 *  - (próximas etapas) listas fechadas no cadastro, clínica obrigatória e simulador por modelo.
 *
 * Uma chave só de propósito (decisão de 23/10/2026): esquecer de ligá-la num tenant novo fica VISÍVEL
 * (o cadastro não mostra os seletores), em vez de deixar metade do pacote ligada e a outra metade
 * silenciosamente desligada. Os outros tenants (redes de ensino, empresas) não mudam: sem a chave,
 * tudo segue como antes, inclusive o RH interno que recebe o convite de teste.
 *
 * Comparação estrita com `true`: `sys_config` é JSONB livre (sem CHECK), e `"true"` ou `1` vindos de
 * um script não devem ligar um comportamento que muda quem recebe mensagem.
 */
export function pacoteClinicasLigado(sysConfig: unknown): boolean {
  return !!sysConfig && typeof sysConfig === 'object' && (sysConfig as Record<string, unknown>).pacote_clinicas === true;
}

/**
 * Motivo de exclusão do lote para a conta de RH, como aparece na prévia da tela de Envios
 * ("quem NÃO recebe e por quê"). Fonte única: a tela e o teste leem daqui.
 */
export const MOTIVO_RH_FORA_DO_LOTE = 'conta de RH: recebe só os relatórios';

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
 *  - o cadastro do admin (`/admin/empresas/gerenciar`) pede clínica, cargo da lista e modelo do
 *    simulador, conferidos no servidor (`erroDoCadastroPacote`), e filtra a lista por clínica.
 *
 * O simulador por modelo NÃO depende da chave: quem tem `recepcao_modelo` vê só os casos do modelo, e
 * quem não tem vê só os casos sem modelo (lib/recepcao/cenarios.ts). Como só o cadastro do pacote grava
 * o modelo, fora dele ninguém tem modelo e nada muda.
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

/** Os campos do cadastro que o pacote exige da secretária. */
export interface CadastroPacote {
  cargo?: string | null;
  escolaId?: string | null;
  recepcaoModelo?: string | null;
}

/** O que existe NO TENANT para conferir o cadastro: cargos e clínicas lidos com `empresa_id`, modelos do código. */
export interface ReferenciaCadastroPacote {
  /** Nomes de `cargos_empresa` da empresa (os 6 cargos fixos do projeto). */
  cargos: readonly string[];
  /** Ids de `escolas` da empresa (as clínicas cadastradas). */
  clinicas: readonly string[];
  /** Códigos de `MODELOS_CLINICA` (lib/recepcao/modelos-clinica.ts). Vazio = recurso desligado. */
  modelos: readonly string[];
}

/** Só a secretária (papel colaborador) tem clínica, cargo e modelo: a conta de RH da empresa não treina. */
export function papelExigeCadastroDoPacote(role: unknown): boolean {
  return (role || 'colaborador') === 'colaborador';
}

/**
 * Confere clínica, cargo e modelo do simulador de uma secretária, no SERVIDOR (o seletor da tela é só
 * conforto). Devolve a mensagem de erro, ou null quando está tudo certo.
 *
 * - cargo: obrigatório e um dos cargos cadastrados NA EMPRESA (antes era texto livre: um erro de
 *   digitação punha a pessoa num cargo sem matriz, medido em 23/10/2026);
 * - clínica: obrigatória e uma das clínicas DA EMPRESA (o id vem do navegador; chave estrangeira simples
 *   não isola tenant);
 * - modelo: obrigatório quando há modelos no código; com a lista vazia, nenhum é aceito.
 *
 * `parcial`: na edição, só o que veio no pedido é conferido (um campo ausente não muda).
 */
export function erroDoCadastroPacote(
  dados: CadastroPacote,
  ref: ReferenciaCadastroPacote,
  opcoes: { parcial?: boolean } = {},
): string | null {
  const veio = (k: keyof CadastroPacote) => !opcoes.parcial || dados[k] !== undefined;
  if (veio('cargo')) {
    const cargo = (dados.cargo || '').trim();
    if (!cargo) return 'escolha o cargo da secretária';
    if (!ref.cargos.includes(cargo)) return `o cargo "${cargo}" não é um dos cargos cadastrados nesta empresa`;
  }
  if (veio('escolaId')) {
    if (!dados.escolaId) return 'escolha a clínica da secretária';
    if (!ref.clinicas.includes(dados.escolaId)) return 'a clínica escolhida não pertence a esta empresa';
  }
  if (veio('recepcaoModelo')) {
    const modelo = dados.recepcaoModelo || null;
    if (ref.modelos.length) {
      if (!modelo) return 'escolha o modelo de clínica do simulador';
      if (!ref.modelos.includes(modelo)) return `o modelo de simulador "${modelo}" não existe`;
    } else if (modelo) {
      return 'ainda não há modelos de clínica do simulador cadastrados';
    }
  }
  return null;
}

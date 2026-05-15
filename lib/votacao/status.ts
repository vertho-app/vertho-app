export function isPerfilComportamentalLiberado(config: any): boolean {
  if (config?.perfil_comportamental_liberado === false) return false;
  if (config?.votacao_ativa === true && config?.perfil_comportamental_liberado !== true) return false;
  return true;
}

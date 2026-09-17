/**
 * Mídias dos pacotes offline servidas pelo MESMO domínio da apresentação.
 *
 * 🔴 17/09/2026: quem tinha o pacote escolar instalado não conseguia atualizar.
 * O app offline bloqueia (503) toda URL externa que não esteja na lista de mídias
 * gravada NO BUILD dele (`__OFFLINE_MEDIA__`, em `runtime.ts`), e quem baixa a
 * versão nova é o app ANTIGO. Trocar o podcast por uma URL nova do Storage fez o
 * app instalado recusar o próprio download: "Não foi possível baixar Semana 1 ·
 * podcast da Marina", com conexão.
 *
 * O que todas as versões publicadas aceitam é arquivo do mesmo domínio dentro da
 * base do pacote (transporte, service worker e `validatePackage`). Por isso o
 * manifesto aponta para `<base>midia/<sha256>.<ext>` e este rewrite repassa para a
 * cópia imutável no Storage. `tests/unit/demo-offline.test.ts` exige isso de toda
 * mídia dos dois manifestos.
 *
 * `.mjs` porque o `next.config.mjs` importa daqui.
 */
export const STORAGE_PUBLICO = 'https://xwuqrgrvakxtphbmudwj.supabase.co/storage/v1/object/public/conteudos';

export const MIDIA_OFFLINE = [
  { base: '/apresentacao-offline/', storage: 'demo-offline/escolas' },
  { base: '/apresentacao-offline-acme/', storage: 'demo-offline/acme' },
];

/** Só nomes de conteúdo (sha256 + extensão): o rewrite não abre o bucket. */
export const ARQUIVO_MIDIA = /^[a-f0-9]{64}\.[a-z0-9]{3}$/;

export function rewritesDaMidiaOffline() {
  return MIDIA_OFFLINE.map(({ base, storage }) => ({
    source: `${base}midia/:arquivo([a-f0-9]{64}\\.[a-z0-9]{3})`,
    destination: `${STORAGE_PUBLICO}/${storage}/:arquivo`,
  }));
}

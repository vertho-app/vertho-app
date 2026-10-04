/**
 * Tradutor do namespace `EngagementWorkspace` para os testes do relatório de
 * engajamento (R-67): o `buildViews` não monta frase sem `t`, e o teste passa o
 * mesmo catálogo que a tela e o PDF usam, no idioma pedido.
 */
import { createTranslator } from 'next-intl';
import ptBR from '@/messages/pt-BR.json';
import ptPT from '@/messages/pt-PT.json';
import esES from '@/messages/es-ES.json';
import enUS from '@/messages/en-US.json';

const CATALOGOS: Record<string, any> = { 'pt-BR': ptBR, 'pt-PT': ptPT, 'es-ES': esES, 'en-US': enUS };

export function tEngajamento(locale: 'pt-BR' | 'pt-PT' | 'es-ES' | 'en-US' = 'pt-BR'): any {
  return createTranslator({ locale, messages: CATALOGOS[locale], namespace: 'EngagementWorkspace' });
}

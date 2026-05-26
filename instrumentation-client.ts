/**
 * Init do Sentry no client (Next 16 carrega este arquivo automaticamente).
 * Reusa a config existente em sentry.client.config.js (que chama Sentry.init
 * com o scrub de PII). Necessário porque os plugins de webpack do Sentry estão
 * desabilitados no next.config — sem isto, o client config não era injetado.
 */
import './sentry.client.config';
export { captureRouterTransitionStart as onRouterTransitionStart } from '@sentry/nextjs';

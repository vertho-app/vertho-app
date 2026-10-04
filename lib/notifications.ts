// lib/notifications.ts: textos de WhatsApp da cadência. Os templates de e-mail do
// diagnóstico e do PDI (`templateEmailDiagnostico`, `templateEmailPDI`) e o invólucro
// de HTML deles saíram em 04/10/2026: nenhum chamador os importava, e os e-mails da
// jornada vivem em `lib/notifications/pilula-envio.ts` e `lib/i18n-email-templates.ts`.
//
// ⚠️ As copies de WhatsApp que têm template aprovado na Meta NÃO moram mais aqui:
// vivem em `lib/whatsapp/templates.ts` e são renderizadas a partir de lá. O texto
// que a Z-API manda passa a ser o corpo do template com as variáveis
// substituídas, então os dois caminhos não podem divergir. Ver o cabeçalho
// daquele arquivo para o porquê e para o que derruba um template em MARKETING.
import { TEMPLATES, renderTemplate } from '@/lib/whatsapp/templates';

/**
 * WhatsApp text for behavioral profile link.
 */
export function templateWhatsAppCIS(nome, link) {
  return renderTemplate(TEMPLATES.perfil_disponivel, [nome, link]);
}

/**
 * WhatsApp text for weekly learning pill.
 */
export function templateWhatsAppPilula(nome, semana, conteudo) {
  return `Olá, ${nome}! 📚

*Pílula de Aprendizagem — Semana ${semana}*

${conteudo}

Continue evoluindo! Acesse a plataforma Vertho para mais conteúdos.
— Equipe Vertho`;
}

/**
 * WhatsApp text for weekly evidence reminder.
 */
export function templateWhatsAppEvidencia(nome, semana, link) {
  return renderTemplate(TEMPLATES.evidencia_semanal, [nome, String(semana), link]);
}

// Quinta: cobra o DESAFIO específico da semana (do kit, por DISC). A pessoa sabe
// exatamente o que praticar e sobre o que vai conversar com a IA. Ver Fase 3.
// (LEGADO — usado só por triggerQuinta manual; o cron diário usa o NUDGE abaixo.)
export function templateWhatsAppDesafioQuinta(nome, desafioTexto) {
  return `Olá, ${nome}! 🎯

É quinta — hora da prática da semana. Seu desafio:

_${desafioTexto}_

Já conseguiu fazer? Conta pra Mentora IA na plataforma como foi (e o que você percebeu). Se ainda não deu, dá tempo até o fim da semana!
— Equipe Vertho`;
}

// Quinta (NUDGE): a pessoa já viu o desafio no conteúdo E no card "Desafio" do week
// page durante a semana. Aqui é só a cobrança de prática + link pra rever e relatar
// à Mentora IA — SEM repetir o texto do desafio (evita a redundância do 3º envio).
export function templateWhatsAppNudgeDesafio(nome, semana, link) {
  return renderTemplate(TEMPLATES.nudge_desafio, [nome, String(semana), link]);
}

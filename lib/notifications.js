// lib/notifications.js — Email and WhatsApp notification templates for Vertho Mentor IA

const NAVY = '#0F2A4A';
const CYAN = '#00B4D8';
const TEAL = '#0D9488';

function emailWrapper(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:${NAVY};padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;letter-spacing:2px;">VERTHO</h1>
              <p style="margin:4px 0 0;color:${CYAN};font-size:13px;letter-spacing:1px;">MENTOR IA</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:${NAVY};padding:16px 32px;text-align:center;">
              <p style="margin:0;color:#8899aa;font-size:12px;">&copy; ${new Date().getFullYear()} Vertho Mentor IA. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buttonHtml(text, href) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td style="background-color:${TEAL};border-radius:6px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">${text}</a>
    </td>
  </tr>
</table>`;
}

/**
 * HTML email for assessment (diagnostico) invitation.
 */
export function templateEmailDiagnostico(nome, link) {
  const body = `
    <h2 style="color:${NAVY};margin:0 0 16px;">Olá, ${nome}!</h2>
    <p style="color:#333;font-size:15px;line-height:1.6;">
      Você foi convidado(a) a participar de uma <strong>avaliação diagnóstica</strong> na plataforma Vertho Mentor IA.
    </p>
    <p style="color:#333;font-size:15px;line-height:1.6;">
      Este diagnóstico nos ajudará a entender seu perfil de competências e criar um plano de desenvolvimento personalizado para você.
    </p>
    ${buttonHtml('Iniciar Diagnóstico', link)}
    <p style="color:#888;font-size:13px;line-height:1.5;margin-top:24px;">
      Se o botão não funcionar, copie e cole este link no seu navegador:<br/>
      <a href="${link}" style="color:${CYAN};word-break:break-all;">${link}</a>
    </p>`;
  return emailWrapper('Convite para Diagnóstico - Vertho', body);
}

/**
 * HTML email for PDI (Plano de Desenvolvimento Individual) results.
 */
export function templateEmailPDI(nome, link) {
  const body = `
    <h2 style="color:${NAVY};margin:0 0 16px;">Olá, ${nome}!</h2>
    <p style="color:#333;font-size:15px;line-height:1.6;">
      Seu <strong>Plano de Desenvolvimento Individual (PDI)</strong> está pronto! Ele foi elaborado com base nos resultados da sua avaliação e contém ações específicas para o seu crescimento profissional.
    </p>
    <p style="color:#333;font-size:15px;line-height:1.6;">
      Acesse seu PDI para conferir as competências priorizadas, trilhas de aprendizagem recomendadas e os próximos passos.
    </p>
    ${buttonHtml('Ver Meu PDI', link)}
    <p style="color:#888;font-size:13px;line-height:1.5;margin-top:24px;">
      Se o botão não funcionar, copie e cole este link no seu navegador:<br/>
      <a href="${link}" style="color:${CYAN};word-break:break-all;">${link}</a>
    </p>`;
  return emailWrapper('Seu PDI está pronto - Vertho', body);
}

/**
 * WhatsApp text for CIS (profile) link.
 */
export function templateWhatsAppCIS(nome, link) {
  return `Olá, ${nome}! 👋

Seu *perfil CIS* na plataforma Vertho Mentor IA está disponível para consulta.

Acesse agora para ver seus resultados:
${link}

Qualquer dúvida, estamos à disposição!
— Equipe Vertho`;
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
export function templateWhatsAppEvidencia(nome, semana) {
  return `Olá, ${nome}! 📝

Lembrete: esta é a *Semana ${semana}* do seu plano de desenvolvimento.

Registre suas *evidências de aprendizagem* na plataforma para que possamos acompanhar seu progresso e ajustar as próximas etapas.

Acesse a plataforma Vertho e registre sua evidência hoje!
— Equipe Vertho`;
}

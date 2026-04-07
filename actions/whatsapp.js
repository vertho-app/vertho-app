'use server';

const getBaseUrl = () => {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  if (!instanceId || !token) throw new Error('ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurados');
  return `https://api.z-api.io/instances/${instanceId}/token/${token}`;
};

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Client-Token': process.env.ZAPI_CLIENT_TOKEN || '',
});

// Format phone: ensure country code, remove non-digits
function formatPhone(telefone) {
  let phone = telefone.replace(/\D/g, '');
  // Add Brazil country code if missing
  if (phone.length <= 11) phone = `55${phone}`;
  return phone;
}

// ── Enviar mensagem de texto via WhatsApp ───────────────────────────────────

export async function enviarWhatsApp(telefone, mensagem) {
  try {
    const baseUrl = getBaseUrl();
    const phone = formatPhone(telefone);

    const res = await fetch(`${baseUrl}/send-text`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        phone,
        message: mensagem,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return { success: false, error: `Z-API ${res.status}: ${detail}` };
    }

    const data = await res.json();
    return { success: true, message: 'Mensagem enviada', data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Enviar PDF via WhatsApp ─────────────────────────────────────────────────

export async function enviarPDF(telefone, pdfBase64, filename) {
  try {
    const baseUrl = getBaseUrl();
    const phone = formatPhone(telefone);

    const res = await fetch(`${baseUrl}/send-document/${phone}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        phone,
        document: `data:application/pdf;base64,${pdfBase64}`,
        fileName: filename || 'documento.pdf',
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return { success: false, error: `Z-API ${res.status}: ${detail}` };
    }

    const data = await res.json();
    return { success: true, message: 'PDF enviado', data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Enviar link via WhatsApp ────────────────────────────────────────────────

export async function enviarLink(telefone, url, titulo) {
  try {
    const baseUrl = getBaseUrl();
    const phone = formatPhone(telefone);

    const res = await fetch(`${baseUrl}/send-link`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        phone,
        message: titulo || '',
        linkUrl: url,
        title: titulo || 'Vertho Mentor IA',
        linkDescription: '',
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return { success: false, error: `Z-API ${res.status}: ${detail}` };
    }

    const data = await res.json();
    return { success: true, message: 'Link enviado', data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

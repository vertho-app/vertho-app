'use client';

// CONARH 52 — o QR do Mapa da Evolução na tela de confirmação.
//
// 🔑 POR QUE ELE EXISTE (18/08/2026, dia 1 da feira). A entrega do recorte
// dependia inteiramente de um canal que hoje não anda: `recorte_demonstracao`
// está PENDING na Meta e o legado (Z-API) caiu em 11/08. A tela dizia "chega
// pelo WhatsApp em alguns minutos" e não chegava nada.
//
// O QR tira a entrega do caminho crítico: o visitante aponta a câmera e leva o
// Mapa embora ANTES de sair do estande. O WhatsApp vira reforço — que é o lugar
// certo dele, porque é o único que depende de terceiro.
//
// ⚠️ Sem `leadId` não há QR: o Mapa vive em `app.vertho.ai/conarh/mapa/{id}` e o
// id nasce no servidor. Quando a captura caiu na fila offline, o id ainda não
// existe — e prometer um QR que não abre é pior do que não mostrar nenhum.

import { useEffect, useState } from 'react';
import { COR, SANS } from './tema';

export function QrMapa({ url, lado = 190 }: { url: string; lado?: number }) {
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // Import dinâmico: o encoder só entra no bundle de quem chega à
        // confirmação, não no da demo inteira.
        //
        // ⚠️ `?? mod`: `qrcode` é CJS, e o interop do bundler decide se ele chega
        // em `.default` ou espalhado no namespace. Só `.default` daria `undefined`
        // exatamente onde o `catch` abaixo esconderia — o QR sumia da tela do
        // estande sem uma linha de erro em lugar nenhum.
        const mod: any = await import('qrcode');
        const QRCode = mod.default ?? mod;
        const uri = await QRCode.toDataURL(url, {
          margin: 1,
          width: lado * 2, // 2× para não serrilhar em tela de tablet
          errorCorrectionLevel: 'M',
          color: { dark: '#0f2b54', light: '#ffffff' },
        });
        if (vivo) setDataUri(uri);
      } catch (err) {
        // Falhar aqui não pode derrubar a confirmação — o link em texto continua
        // sendo caminho válido. Mas também não pode ser MUDO: sem o log, "o QR
        // não aparece" chega como relato de estande, sem nada onde olhar.
        console.error('[conarh/qr] não gerou o QR:', err);
        if (vivo) setFalhou(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [url, lado]);

  // Sem QR, o bloco NÃO some: o texto ao lado manda apontar a câmera, e apontar
  // para um buraco é pior que não ter oferecido. Aqui ele vira a instrução certa.
  if (falhou) {
    return (
      <div
        className="rounded-2xl flex items-center justify-center text-center p-4"
        style={{ background: '#ffffff', width: lado + 28, minHeight: lado + 28, flexShrink: 0 }}
      >
        <span style={{ color: '#0f2b54', fontSize: 15, fontFamily: SANS, fontWeight: 700 }}>
          Abra o endereço abaixo no seu celular
        </span>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl flex items-center justify-center"
      style={{ background: '#ffffff', width: lado + 28, height: lado + 28, flexShrink: 0 }}
    >
      {dataUri ? (
        <img src={dataUri} alt="QR code do Mapa da Evolução" width={lado} height={lado} style={{ display: 'block' }} />
      ) : (
        <span style={{ color: '#0f2b54', fontSize: 14, fontFamily: SANS }}>gerando…</span>
      )}
    </div>
  );
}

/** O link em texto, para quem prefere digitar ou quando a câmera não coopera. */
export function LinkMapa({ url }: { url: string }) {
  return (
    <p style={{ color: COR.texto3, fontSize: 15, fontFamily: SANS, margin: '10px 0 0', wordBreak: 'break-all' }}>
      {url.replace(/^https?:\/\//, '')}
    </p>
  );
}

import type { Metadata } from 'next';
import localFont from "next/font/local";
import { NextIntlClientProvider } from 'next-intl';
import { Toaster } from 'sonner';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { resolveTenantFromHeaders } from '@/lib/tenant-resolver';
import { derivarNomeCurto } from '@/lib/tenant-nome-curto';
import "./globals.css";

/**
 * Fontes SELF-HOSTED (`app/fonts/*.woff2`), não `next/font/google`.
 *
 * 🔴 POR QUE (medido 15-17/08/2026): o build do CI quebrou QUATRO vezes em dois
 * dias buscando `fonts.gstatic.com` — `Module not found:
 * @vercel/turbopack-next/internal/font/google/font` e, num teste de PDF,
 * `ECONNRESET` no meio do render. Todas passaram no re-run, ou seja: vermelho
 * que não é do diff. E vermelho intermitente é pior que vermelho — ele treina
 * quem olha a ficar re-rodando sem ler, que foi como cinco commits ficaram
 * quebrados por 3h em 13/08.
 *
 * O `next/font/google` baixa em BUILD TIME. Como o cache não sobrevive entre
 * execuções do CI, todo build depende da rede do Google. Servindo do repo, essa
 * dependência deixa de existir — e o resultado no navegador é o mesmo (o
 * `next/font` já servia do nosso domínio; o que mudou é de onde o BUILD tira o
 * arquivo).
 *
 * Subset `latin`, arquivos variáveis quando a família tem eixo de peso.
 * Licenças por família em `app/fonts/README.md` (OFL, Apache 2.0 e a do Codec).
 *
 * 🎨 Brand book (out/2026): títulos em Codec Bold, textos em Roboto. As demais
 * famílias seguem carregadas só para as superfícies que não migraram
 * (/radar, /radarbett, /imprensa, /proposta, /conarh, /copiloto).
 */

// Texto e apoio — Roboto (variável, Apache 2.0). É o corpo do `<body>`.
const roboto = localFont({
  src: [{ path: "./fonts/roboto.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-roboto",
  display: "swap",
});

// Títulos — Codec Cold EXTRA BOLD (Zetafonts). O brand book diz "Codec Bold", mas a amostra do slide é
// bem mais pesada que o corte Bold (medido 08/10/2026); o dono escolheu o Extra Bold olhando a comparação.
// ⚠️ O OTF gratuito que veio na skill `vertho-design` NÃO cobre uso em site/software; o dono atestou ter a
// licença em 08/10/2026 e o arquivo daqui deve ser o do kit licenciado. Só existe esta face (800): o navegador
// a usa para QUALQUER peso pedido. O mesmo arquivo atende `italic` de propósito: sem a face itálica o navegador
// sintetiza um oblíquo por cima do Codec, e os títulos que eram itálicos (Instrument Serif) ficariam tortos
// em vez de só retos.
const codec = localFont({
  src: [
    { path: "./fonts/codec-cold-extrabold.woff2", weight: "800", style: "normal" },
    { path: "./fonts/codec-cold-extrabold.woff2", weight: "800", style: "italic" },
  ],
  variable: "--font-codec",
  display: "swap",
});

const inter = localFont({
  src: [{ path: "./fonts/inter.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
});

const manrope = localFont({
  src: [{ path: "./fonts/manrope.woff2", weight: "200 800", style: "normal" }],
  variable: "--font-manrope",
  display: "swap",
});

const instrumentSerif = localFont({
  src: [
    { path: "./fonts/instrument-serif.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-serif",
  display: "swap",
});

// Tipografia exclusiva do /radarbett/* (handoff Bett 2026)
const jakarta = localFont({
  src: [{ path: "./fonts/jakarta.woff2", weight: "200 800", style: "normal" }],
  variable: "--font-jakarta",
  display: "swap",
});

const fraunces = localFont({
  src: [
    { path: "./fonts/fraunces.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/fraunces-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Metadata');

  return {
    title: t('title'),
    description: t('description'),
    // PWA: o manifest é pré-requisito para "Adicionar à Tela de Início" no iOS,
    // e sem app instalado o Safari nem expõe a API de push. `appleWebApp` faz o
    // app abrir sem a barra do Safari — é o que o transforma em app aos olhos
    // de quem usa (e o que faz a notificação parecer nativa).
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      // Por TENANT, mesma régua do manifest. Fixo em 'Vertho' aqui, este campo
      // sobrepunha o `short_name` do manifest justamente no iOS — a plataforma
      // onde o nome sob o ícone da tela de início importa — e anulava boa parte
      // do manifest dinâmico para clientes white-label.
      title: derivarNomeCurto((await resolveTenantFromHeaders(await headers()))?.nome),
      statusBarStyle: 'default',
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${roboto.variable} ${codec.variable} ${inter.variable} ${manrope.variable} ${instrumentSerif.variable} ${jakarta.variable} ${fraunces.variable}`}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
        <Toaster position="top-right" theme="dark" richColors closeButton />
      </body>
    </html>
  );
}

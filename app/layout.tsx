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
 * Subset `latin`, arquivos variáveis quando a família tem eixo de peso — 13
 * arquivos, ~340 KB. Todas as famílias são SIL OFL; ver `app/fonts/README.md`.
 */
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
    <html lang={locale} className={`${inter.variable} ${manrope.variable} ${instrumentSerif.variable} ${jakarta.variable} ${fraunces.variable}`}>
      <body className="font-[var(--font-inter)]">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
        <Toaster position="top-right" theme="dark" richColors closeButton />
      </body>
    </html>
  );
}

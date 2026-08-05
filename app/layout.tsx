import type { Metadata } from 'next';
import { Inter, Instrument_Serif, Manrope, Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { Toaster } from 'sonner';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

// Tipografia exclusiva do /radarbett/* (handoff Bett 2026)
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
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
      title: 'Vertho',
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

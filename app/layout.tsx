import type { Metadata } from 'next';
import { Inter, Instrument_Serif, Manrope, Plus_Jakarta_Sans, Fraunces } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Vertho",
  description: "Sua jornada de desenvolvimento",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${manrope.variable} ${instrumentSerif.variable} ${jakarta.variable} ${fraunces.variable}`}>
      <body className="font-[var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}

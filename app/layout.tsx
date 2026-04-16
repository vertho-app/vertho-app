import type { Metadata } from 'next';
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Vertho",
  description: "Sua jornada de desenvolvimento",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-[var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}

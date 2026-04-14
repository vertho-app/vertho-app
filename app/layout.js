import { Inter } from "next/font/google";
import "./globals.css";
import VersionBadge from "@/components/version-badge";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "Vertho",
  description: "Sua jornada de desenvolvimento",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-[var(--font-inter)]">
        {children}
        <VersionBadge />
      </body>
    </html>
  );
}

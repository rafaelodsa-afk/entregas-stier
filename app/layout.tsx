import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stier · Controle de Entregas",
  description: "Painel operacional de entregas — Stier",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

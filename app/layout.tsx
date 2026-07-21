import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stier · Controle de Entregas",
  description: "Painel operacional de entregas — Stier",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Stier Entregas",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Aplica o tema salvo antes da primeira pintura da página, pra
            quem já escolheu "claro" não ver um flash de tela escura no
            carregamento. Escuro continua sendo o padrão pra quem nunca
            escolheu nada. */}
        <Script id="tema-inicial" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('stier-theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#eef0f3');}}catch(e){}})();`}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}

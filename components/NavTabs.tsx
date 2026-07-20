"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Aba = { href: string; label: string };

export default function NavTabs({ abas }: { abas: Aba[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const transportador = searchParams.get("transportador");
  const sufixo = transportador ? `?transportador=${encodeURIComponent(transportador)}` : "";

  return (
    <nav className="nav-tabs">
      {abas.map((aba) => {
        const ativa = pathname === aba.href;
        return (
          <Link key={aba.href} href={aba.href + sufixo} className={`nav-tab${ativa ? " nav-tab-ativa" : ""}`}>
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Aba = { href: string; label: string };

export default function NavTabs({ abas }: { abas: Aba[] }) {
  const pathname = usePathname();

  return (
    <nav className="nav-tabs">
      {abas.map((aba) => {
        const ativa = pathname === aba.href;
        return (
          <Link key={aba.href} href={aba.href} className={`nav-tab${ativa ? " nav-tab-ativa" : ""}`}>
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}

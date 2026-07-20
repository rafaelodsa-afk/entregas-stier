"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function FiltroTransportador({ transportadores }: { transportadores: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const atual = searchParams.get("transportador") ?? "";

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const valor = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set("transportador", valor);
    else params.delete("transportador");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <select className="filtro-transportador" value={atual} onChange={onChange}>
      <option value="">Todos os transportadores</option>
      {transportadores.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

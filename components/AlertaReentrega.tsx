import Link from "next/link";

export default function AlertaReentrega({ quantidade }: { quantidade: number }) {
  if (quantidade === 0) return null;
  const plural = quantidade > 1;
  return (
    <Link href="/dashboard/admin?status=REENTREGA" className="alerta-reentrega">
      Você tem {quantidade} pedido{plural ? "s" : ""} em reentrega aguardando reatribuição.
    </Link>
  );
}

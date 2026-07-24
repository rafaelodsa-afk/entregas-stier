import Link from "next/link";

export default function AlertaProblema({ quantidade }: { quantidade: number }) {
  if (quantidade === 0) return null;
  const plural = quantidade > 1;
  return (
    <Link href="/dashboard/admin?alertaProblema=1" className="alerta-reentrega">
      Você tem {quantidade} pedido{plural ? "s" : ""} com problema sinalizado pelo transportador.
    </Link>
  );
}

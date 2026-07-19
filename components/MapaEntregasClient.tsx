"use client";

import dynamic from "next/dynamic";
import type { PontoMapa } from "@/components/MapaEntregas";

const MapaEntregas = dynamic(() => import("@/components/MapaEntregas"), {
  ssr: false,
  loading: () => <p className="muted">Carregando mapa...</p>,
});

export default function MapaEntregasClient({ pontos }: { pontos: PontoMapa[] }) {
  return <MapaEntregas pontos={pontos} />;
}

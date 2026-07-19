"use client";

import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type PontoMapa = { cidade: string; latitude: number; longitude: number; quantidade: number };

export default function MapaEntregas({ pontos }: { pontos: PontoMapa[] }) {
  if (pontos.length === 0) {
    return <p className="muted">Nenhuma coordenada disponível ainda para as cidades dos pedidos pendentes.</p>;
  }

  const centro: [number, number] = [pontos[0].latitude, pontos[0].longitude];

  return (
    <MapContainer center={centro} zoom={7} scrollWheelZoom={false} style={{ height: 360, width: "100%", borderRadius: 12 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pontos.map((p) => (
        <CircleMarker
          key={p.cidade}
          center={[p.latitude, p.longitude]}
          radius={8 + Math.min(p.quantidade, 10) * 2}
          pathOptions={{ color: "#e3a73e", fillColor: "#e3a73e", fillOpacity: 0.55 }}
        >
          <Tooltip>
            {p.cidade}: {p.quantidade} pedido(s) pendente(s)
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

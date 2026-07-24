// Rótulos e classes de status de entrega — em módulo próprio (sem "use
// client") porque Server Components não conseguem importar valores comuns
// (só componentes React) de um arquivo marcado "use client".
export const LABEL_STATUS: Record<string, string> = {
  AGUARDANDO_ACEITE: "Aguardando aceite",
  AGUARDANDO_CARREGAMENTO: "Aguardando carregamento",
  EM_ROTA: "Em rota de entrega",
  AGUARDANDO_CANHOTO: "Entregue (planilha) — aguardando canhoto",
  ENTREGUE: "Entregue",
  REENTREGA: "Reentrega",
  CANCELADO: "Cancelado",
  DEVOLVIDO: "Devolvido",
};

export const CLASSE_BADGE: Record<string, string> = {
  AGUARDANDO_CARREGAMENTO: "badge-aguardando-carregamento",
  EM_ROTA: "badge-em-rota",
  AGUARDANDO_CANHOTO: "badge-aguardando-canhoto",
  ENTREGUE: "badge-entregue",
  REENTREGA: "badge-reentrega",
  CANCELADO: "badge-cancelado",
  DEVOLVIDO: "badge-devolvido",
};

// Cores dos status pra gráficos (donut/barras) — mesmos tons das variáveis
// CSS de cada status, só que em hex fixo porque SVG não lê var(--x) direto
// em todo navegador de forma confiável no fill/stroke.
export const COR_STATUS: Record<string, string> = {
  AGUARDANDO_ACEITE: "#e3a73e",
  AGUARDANDO_CARREGAMENTO: "#f0883e",
  EM_ROTA: "#4e8fe3",
  AGUARDANDO_CANHOTO: "#e35c9e",
  ENTREGUE: "#3fbf8f",
  REENTREGA: "#a78bfa",
  CANCELADO: "#e15c4a",
  DEVOLVIDO: "#8d95a1",
};

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME, podeVerTudo, podeExcluirMes } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listarTodosOsArquivosR2 } from "@/lib/r2";
import { LIMITE_BANCO_BYTES, LIMITE_R2_BYTES } from "@/lib/limitesArmazenamento";
import GraficoUso from "@/components/GraficoUso";
import ExportarMes from "@/components/ExportarMes";
import ExcluirMes from "@/components/ExcluirMes";

export const dynamic = "force-dynamic";

function formatarMes(chave: string) {
  const [ano, mes] = chave.split("-");
  return `${mes}/${ano}`;
}

function formatarGB(bytes: number) {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

export default async function ArmazenamentoPage() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao || !podeVerTudo(sessao.papel)) redirect("/dashboard");

  const [resultadoTamanho, arquivos, pedidos, exportacoes] = await Promise.all([
    prisma.$queryRaw<{ tamanho: bigint }[]>`SELECT pg_database_size(current_database()) AS tamanho`,
    listarTodosOsArquivosR2(),
    prisma.pedido.findMany({ select: { id: true, dataPrevistaEntrega: true, dataCriacao: true } }),
    prisma.exportacaoMensal.findMany(),
  ]);

  const tamanhoBanco = Number(resultadoTamanho[0]?.tamanho ?? 0);
  const tamanhoArquivos = arquivos.reduce((soma, a) => soma + a.size, 0);
  const exportacaoPorMes = new Map(exportacoes.map((e) => [e.mes, e]));

  // Mês de referência de cada pedido: data prevista de entrega quando
  // existe, senão a data de criação — assim todo pedido cai em algum mês,
  // mesmo os antigos que nunca tiveram essa data preenchida.
  const contagemPorMes = new Map<string, number>();
  for (const p of pedidos) {
    const data = p.dataPrevistaEntrega ?? p.dataCriacao;
    const d = new Date(data);
    const chave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    contagemPorMes.set(chave, (contagemPorMes.get(chave) ?? 0) + 1);
  }
  const mesesOrdenados = [...contagemPorMes.keys()].sort();
  const primeiroMes = mesesOrdenados[0];
  const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1];
  const mesesJaExportados = mesesOrdenados.filter((m) => exportacaoPorMes.has(m));

  return (
    <div>
      <h1 className="page-title">Uso de armazenamento</h1>
      <p className="page-sub" style={{ marginBottom: 20 }}>
        Espaço usado nos planos gratuitos do banco de dados e do armazenamento de arquivos, e ferramentas pra
        exportar/arquivar pedidos antigos.
      </p>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{pedidos.length}</div>
          <div className="kpi-label">Pedidos no banco</div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-value">{arquivos.length}</div>
          <div className="kpi-label">Arquivos no R2 (canhotos + comprovantes)</div>
        </div>
        <div className="kpi-card violet">
          <div className="kpi-value">{formatarGB(tamanhoBanco + tamanhoArquivos)}</div>
          <div className="kpi-label">Total usado (banco + arquivos)</div>
        </div>
      </div>

      <div className="graficos-grid">
        <div className="form-card">
          <GraficoUso titulo="Banco de dados (Postgres/Neon)" usadoBytes={tamanhoBanco} limiteBytes={LIMITE_BANCO_BYTES} cor="#4e8fe3" />
        </div>
        <div className="form-card">
          <GraficoUso titulo="Arquivos (Cloudflare R2)" usadoBytes={tamanhoArquivos} limiteBytes={LIMITE_R2_BYTES} cor="#e3a73e" />
        </div>
      </div>

      <div className="form-card">
        <h2>Período armazenado</h2>
        {mesesOrdenados.length === 0 ? (
          <p className="muted">Nenhum pedido no banco ainda.</p>
        ) : (
          <p>
            Dados armazenados de <strong>{formatarMes(primeiroMes)}</strong> até <strong>{formatarMes(ultimoMes)}</strong>.
          </p>
        )}

        <table className="pedidos-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Mês</th>
              <th>Pedidos</th>
              <th>Exportado?</th>
            </tr>
          </thead>
          <tbody>
            {mesesOrdenados.map((chave) => {
              const exportacao = exportacaoPorMes.get(chave);
              return (
                <tr key={chave}>
                  <td>{formatarMes(chave)}</td>
                  <td>{contagemPorMes.get(chave)}</td>
                  <td>{exportacao ? `Sim, em ${exportacao.exportadoEm.toLocaleDateString("pt-BR")}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ExportarMes meses={mesesOrdenados} />

      {podeExcluirMes(sessao.papel) && <ExcluirMes mesesExportados={mesesJaExportados} />}
    </div>
  );
}

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

export default async function DashboardIndex() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao) redirect("/login");
  redirect(sessao.papel === "TRANSPORTADOR" ? "/dashboard/operador" : "/dashboard/admin");
}

import { redirect } from "next/navigation";

import { clearSession, getSessionToken } from "@/lib/auth";
import { exportDownload } from "@/lib/export-download";
import { LOGIN_PATH } from "@/lib/routes";

// GET only, like every route handler (ADR 0006): a download changes nothing.
export async function GET() {
  const token = await getSessionToken();
  if (!token) redirect(LOGIN_PATH);
  const response = await exportDownload(token);
  if (response === "unauthenticated") {
    await clearSession();
    redirect(LOGIN_PATH);
  }
  return response;
}

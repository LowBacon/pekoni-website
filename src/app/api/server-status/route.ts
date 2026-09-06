import { getServerStatus } from "@/server/serverStatus";
import { handleError, ok } from "@/server/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const status = await getServerStatus();
    return ok(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

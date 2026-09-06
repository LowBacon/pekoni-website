import { getCurrentUser } from "@/server/auth";
import { parseResults, readResults } from "@/server/results";
import { clientIp, handleError, LIMITS, ok, requireRate } from "@/server/api";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{
  const user=await getCurrentUser();
  requireRate(`results:${user?.id??clientIp(request)}`,LIMITS.read);
  return ok(await readResults(parseResults(new URL(request.url)),user?.id),{headers:{"Cache-Control":"private, no-store"}});
}catch(e){return handleError(e)}}

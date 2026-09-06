import { getCurrentUser } from "@/server/auth";
import { parseResults, readResults } from "@/server/results";
import { clientIp, handleError, requireRate } from "@/server/api";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const connections=new Map<string,number>();
export async function GET(request:Request){
 try {
  const user=await getCurrentUser();
  const key=user?.id??clientIp(request);
  requireRate(`sse:${key}`,{capacity:10,refillPerSecond:0.5});
  if((connections.get(key)??0)>=3 || [...connections.values()].reduce((a,b)=>a+b,0)>=200) return new Response("Connection limit",{status:429});
  const q=parseResults(new URL(request.url));
  if(q.view==="mine"&&!user)return new Response("Sign in required",{status:401});
  let cursor=Number(request.headers.get("last-event-id")??q.after??0);
  if(!Number.isSafeInteger(cursor)||cursor<0)return new Response("Invalid cursor",{status:400});
  connections.set(key,(connections.get(key)??0)+1);
  let done=false; let timer:ReturnType<typeof setTimeout>; const born=Date.now();
  const release=()=>{if(done)return;done=true;clearTimeout(timer);const n=(connections.get(key)??1)-1;if(n)connections.set(key,n);else connections.delete(key);};
  const stream=new ReadableStream({
   start(controller){
    const send=(s:string)=>controller.enqueue(new TextEncoder().encode(s));
    const stop=()=>{release();try{controller.close()}catch{}};
    request.signal.addEventListener("abort",stop,{once:true});
    const tick=async()=>{if(done)return;try{
      // Streams carry durable invalidation cursors, not cached identities. The client
      // refetches a privacy-checked snapshot, so identity changes are also honored.
      const data=await readResults({...q,after:undefined,before:undefined,snapshot:undefined,limit:1},user?.id);
      if(done)return;
      send(`id: ${data.cursor}\nevent: update\ndata: ${JSON.stringify({cursor:data.cursor,changed:data.cursor!==cursor})}\n\n`);
      cursor=data.cursor;
      if(Date.now()-born>45000){stop();return;}
      timer=setTimeout(tick,3000);
    }catch{stop();}};
    send("retry: 3000\n\n");void tick();
   },cancel(){release()}
  });
  return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"private, no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"}});
 }catch(e){return handleError(e)}
}

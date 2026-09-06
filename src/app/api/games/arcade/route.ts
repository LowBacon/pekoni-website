import { z } from "zod";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { fairStream,hashSeed } from "@/server/rng";
import { handleError,ok,parseBody,requireRate,LIMITS } from "@/server/api";
import { settleInstantRound,openGameSession,loadActiveSession,closeGameSession } from "@/server/games/engine";
import { claimIdempotencyKey,storeIdempotentResult } from "@/server/wallet";
import { ARCADE_GAMES,arcadeInstant,newChoice,revealChoice,type ChoiceState } from "@/lib/games/arcade";
const schema=z.object({game:z.enum(ARCADE_GAMES),action:z.enum(["play","start","choose","cashout"]),bet:z.number().int().min(10).max(10000).default(100),idempotencyKey:z.string().min(16).max(64),sessionId:z.string().max(64).optional(),choice:z.number().int().min(0).max(3).optional(),side:z.enum(["heads","tails"]).default("heads"),risk:z.enum(["low","high"]).default("low"),columns:z.union([z.literal(3),z.literal(4)]).default(3)});
/*
 * The player-visible slice of a session.
 *
 * Not exported: a route module may only export the HTTP handlers and Next's
 * own config keys, and anything else fails the build. It also must not leak
 * `safe` or `cursor` — those are the unrevealed trap layout and the RNG
 * position, which would hand the client the answer to the round it is playing.
 */
function publicChoice(s:ChoiceState){return {step:s.step,multiplier:s.multiplier,current:s.current,columns:s.columns,choices:s.choices,cards:s.cards};}
export async function GET(request:Request){try{
 const user=await requireUser(); const game=z.enum(ARCADE_GAMES).parse(new URL(request.url).searchParams.get("game"));
 const session=await prisma.gameSession.findFirst({where:{userId:user.id,game,status:"ACTIVE"}});
 return ok({session:session?{sessionId:session.id,bet:session.bet,...publicChoice(JSON.parse(session.state))}:null});
}catch(e){return handleError(e)}}
export async function POST(request:Request){try{
 const user=await requireUser();requireRate(`arcade:${user.id}`,LIMITS.game);const i=await parseBody(request,schema);
 const interactive=i.game==="tower"||i.game==="hilo";
 if(!interactive){if(i.action!=="play")throw new Error("Virheellinen toiminto.");return ok(await settleInstantRound({userId:user.id,game:i.game,bet:i.bet,idempotencyKey:i.idempotencyKey,resolve:rng=>arcadeInstant(i.game,i.bet,rng,i)}));}
 const response=await prisma.$transaction(async tx=>{
  const claim=await claimIdempotencyKey(tx,i.idempotencyKey,user.id,`arcade:${i.game}:${i.action}`);if(!claim.fresh)return claim.result;
  let result:Record<string,unknown>;
  if(i.action==="start"){
   const opened=await openGameSession({tx,userId:user.id,game:i.game,bet:i.bet,state:{}});
   const state=newChoice(i.game,fairStream(opened.serverSeed,opened.clientSeed,opened.nonce),i.columns);
   await tx.gameSession.update({where:{id:opened.id},data:{state:JSON.stringify(state)}});
   result={sessionId:opened.id,bet:i.bet,...publicChoice(state),balance:(await tx.wallet.findUniqueOrThrow({where:{userId:user.id}})).balance};
  }else{
   const s=await loadActiveSession(tx,user.id,i.sessionId??"",i.game);let state=JSON.parse(s.state) as ChoiceState;let done=false;
   if(i.action==="choose"){
    if(i.choice===undefined||i.choice>=(i.game==="hilo"?2:state.columns))throw new Error("Virheellinen valinta.");
    const next=revealChoice(i.game,state,i.choice,fairStream(s.serverSeed,s.clientSeed,s.nonce));state=next.state;done=!next.won||state.step===8;
   }else if(i.action==="cashout"){if(state.step===0)throw new Error("Tee ensin yksi valinta.");done=true;}else throw new Error("Virheellinen toiminto.");
   const payout=done?Math.floor(s.bet*state.multiplier):0;
   result={sessionId:s.id,bet:s.bet,...publicChoice(state),done,payout,profit:done?payout-s.bet:0};
   if(done){Object.assign(result,await closeGameSession({tx,userId:user.id,sessionId:s.id,game:i.game,bet:s.bet,payout,multiplier:payout/s.bet,status:payout?"CASHED_OUT":"BUSTED",result:{...state},serverSeedHash:hashSeed(s.serverSeed),clientSeed:s.clientSeed,nonce:s.nonce}));}
   else await tx.gameSession.update({where:{id:s.id},data:{state:JSON.stringify(state)}});
  }
  await storeIdempotentResult(tx,i.idempotencyKey,result);return result;
 },{timeout:15000});return ok(response);
}catch(e){return handleError(e)}}

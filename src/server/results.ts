import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, type Tx } from "./db";
import { AuthError } from "./auth";

export async function publishSettlement(tx: Tx, roundId: string) {
  const r = await tx.gameRound.findUniqueOrThrow({ where: { id: roundId } });
  return tx.liveResult.create({ data: {
    roundId, userId: r.userId, game: r.game, wager: r.bet, payout: r.payout,
    net: r.payout-r.bet, outcome: r.outcome, settledAt: r.createdAt,
  } });
}
export const resultsQuery = z.object({
  view: z.enum(["all","wins","losses","biggest","mine"]).default("all"),
  game: z.string().max(24).default("all"),
  hours: z.coerce.number().int().min(1).max(8760).default(24),
  min: z.coerce.number().int().min(0).max(100000000).default(0),
  max: z.coerce.number().int().min(0).max(100000000).default(100000000),
  before: z.coerce.number().int().min(0).optional(),
  after: z.coerce.number().int().min(0).optional(),
  snapshot: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ResultQuery = z.infer<typeof resultsQuery>;
export const parseResults = (url: URL) => resultsQuery.parse(Object.fromEntries(url.searchParams));
export function baseWhere(q: ResultQuery, userId?: string): Prisma.LiveResultWhereInput {
  if(q.view === "mine" && !userId) throw new AuthError("Sign in to view your results.",401);
  return {
    settledAt: { gte: new Date(Date.now()-q.hours*3600000) },
    wager: { gte:q.min, lte:q.max },
    ...(q.game !== "all" ? { game:q.game }:{}),
    ...(q.view === "mine" ? {userId}:{}),
  };
}
const include = { round: { select: { user: { select: { username:true, avatarUrl:true, minecraftUuid:true, publicActivity:true } } } } } satisfies Prisma.LiveResultInclude;
export async function readResults(q: ResultQuery, userId?: string) {
  return prisma.$transaction(async tx => {
    const high = q.snapshot ?? (await tx.liveResult.aggregate({_max:{sequence:true}}))._max.sequence ?? 0;
    const base = {...baseWhere(q,userId),sequence:{lte:high}};
    const where: Prisma.LiveResultWhereInput = {...base,
      sequence: {lte:high,...(q.after!==undefined?{gt:q.after}:{}),...(q.before?{lt:q.before}:{})},
      ...(q.view==="wins"||q.view==="biggest"?{net:{gt:0},outcome:"WIN"}:q.view==="losses"?{net:{lt:0},outcome:"LOSS"}:{}),
    };
    // Biggest uses a stable rank cursor encoded as the last sequence and net.
    if(q.view==="biggest" && q.before){
      const anchor=await tx.liveResult.findUnique({where:{sequence:q.before}});
      where.sequence={lte:high};
      if(anchor) where.OR=[{net:{lt:anchor.net}},{net:anchor.net,sequence:{lt:anchor.sequence}}];
    }
    const rows=await tx.liveResult.findMany({where,include,take:q.limit+1,orderBy:q.view==="biggest"?[{net:"desc"},{sequence:"desc"}]:{sequence:q.after!==undefined?"asc":"desc"}});
    const page=rows.slice(0,q.limit);
    const statsWhere={...base,outcome:{in:["WIN","LOSS","PUSH"]}};
    const [totals,players,wins]=await Promise.all([
      tx.liveResult.aggregate({where:statsWhere,_sum:{wager:true,payout:true,net:true},_count:true,_max:{net:true}}),
      tx.liveResult.groupBy({by:["userId"],where:statsWhere,_sum:{net:true}}),
      tx.liveResult.count({where:{...statsWhere,outcome:"WIN"}}),
    ]);
    return {
      cursor:high,nextCursor:rows.length>q.limit?page.at(-1)!.sequence:null,
      results:page.map(r=>({
        id:String(r.sequence),sequence:r.sequence,roundId:r.roundId,game:r.game,
        settledAt:r.settledAt.toISOString(),wager:r.wager,payout:r.payout,net:r.net,
        multiplier:r.wager>0?r.payout/r.wager:0,outcome:r.outcome,
        player:{name:r.round.user.publicActivity||r.userId===userId?r.round.user.username:"Hidden player",
          avatar:r.round.user.publicActivity||r.userId===userId?r.round.user.avatarUrl:null},
      })),
      stats:{players:players.length,positive:players.filter(p=>(p._sum.net??0)>0).length,
        negative:players.filter(p=>(p._sum.net??0)<0).length,breakEven:players.filter(p=>(p._sum.net??0)===0).length,
        rounds:totals._count,wagered:totals._sum.wager??0,paid:totals._sum.payout??0,net:totals._sum.net??0,
        winningPercent:totals._count?wins/totals._count*100:0,largestWin:Math.max(0,totals._max.net??0)},
      updatedAt:new Date().toISOString(),
    };
  });
}

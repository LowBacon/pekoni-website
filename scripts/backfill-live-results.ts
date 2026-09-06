import { PrismaClient } from '@prisma/client';
const db=new PrismaClient();
async function main(){
 let count=0;
 while(true){const rows=await db.gameRound.findMany({where:{liveResult:null},orderBy:[{createdAt:'asc'},{id:'asc'}],take:250});if(!rows.length)break;
 await db.$transaction(rows.map(r=>db.liveResult.create({data:{roundId:r.id,userId:r.userId,game:r.game,wager:r.bet,payout:r.payout,net:r.payout-r.bet,outcome:r.outcome,settledAt:r.createdAt}})));count+=rows.length;}
 console.log(`Indexed ${count} existing settled rounds. Accounts, wallets and ledger unchanged.`);
}main().finally(()=>db.$disconnect());

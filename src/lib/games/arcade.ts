import type { FairStream } from "./types";
export const ARCADE_GAMES=["coinflip","plinko","wheel","tower","hilo"] as const;
export type ArcadeGame=typeof ARCADE_GAMES[number];
export const WHEEL=[0,1.2,0,2,0,1.2,0,3.6] as const; // eight equal 12.5% segments, 100% before rounding
export const PLINKO={
  low:[4,2,1.1,0.8,0.6,0.8,1.1,2,4],
  high:[20,3,1,0.3,0.1,0.3,1,3,20],
} as const;
export const BUCKET_COUNTS=[1,8,28,56,70,56,28,8,1]; // binomial(8, 1/2), denominator 256
export function plinkoBuckets(risk:"low"|"high"){
  const raw=PLINKO[risk]; const ev=raw.reduce((n,v,i)=>n+v*BUCKET_COUNTS[i]/256,0);
  return raw.map((v,i)=>({multiplier:v*0.99/ev,probability:BUCKET_COUNTS[i]/256}));
}
export type ArcadeOptions={side?:"heads"|"tails";risk?:"low"|"high";columns?:number};
export function arcadeInstant(game:ArcadeGame,bet:number,rng:FairStream,options:ArcadeOptions={}){
  let multiplier=0; let result:Record<string,unknown>={options};
  if(game==="coinflip"){
    const side=rng.next()<0.5?"heads":"tails"; multiplier=side===(options.side??"heads")?1.98:0;
    result={...result,side,choice:options.side??"heads",probability:0.5};
  }else if(game==="wheel"){
    const segment=rng.nextInt(0,WHEEL.length-1);multiplier=WHEEL[segment]*0.99;
    result={...result,segment,probability:1/8};
  }else if(game==="plinko"){
    const path=Array.from({length:8},()=>rng.next()<0.5?0:1);
    const bucket=path.reduce((a:number,b)=>a+b,0);const buckets=plinkoBuckets(options.risk??"low");
    multiplier=buckets[bucket].multiplier;result={...result,bucket,path,probability:buckets[bucket].probability};
  }else throw new Error("This game requires a session.");
  const payout=Math.floor(bet*multiplier);
  return {payout,multiplier:payout/bet,result};
}
export type ChoiceState={columns:number;step:number;multiplier:number;current:number;choices:number[];cards:number[];safe:number[][];cursor:number};
export function newChoice(game:ArcadeGame,rng:FairStream,columns=3):ChoiceState{
 return {columns,step:0,multiplier:1,current:game==="hilo"?rng.nextInt(1,13):0,choices:[],cards:[],safe:game==="tower"?Array.from({length:8},()=>[rng.nextInt(0,columns-1)]):[],cursor:game==="hilo"?1:8};
}
export function choiceOdds(game:ArcadeGame,state:Pick<ChoiceState,"columns"|"current">,choice:number){
 return game==="tower"?(state.columns-1)/state.columns:choice===1?(13-state.current)/13:(state.current-1)/13;
}
export function revealChoice(game:ArcadeGame,state:ChoiceState,choice:number,rng:FairStream){
 const probability=choiceOdds(game,state,choice);
 if(probability<=0)throw new Error("That prediction has no winning cards.");
 let won:boolean;let card=state.current;
 if(game==="tower")won=!state.safe[state.step].includes(choice);
 else {for(let i=0;i<state.cursor;i++)rng.next();card=rng.nextInt(1,13);won=choice===1?card>state.current:card<state.current;}
 const next={...state,step:state.step+1,current:card,cursor:state.cursor+(game==="hilo"?1:0),multiplier:won?state.multiplier*0.99/probability:0,choices:[...state.choices,choice],cards:[...state.cards,card]};
 return {won,state:next,probability};
}
export const ARCADE_RULES:Record<ArcadeGame,string>={
 coinflip:"Choose heads or tails. Each has a 50% probability. A correct prediction returns 1.98× your wager, including your stake. Otherwise the payout is zero.",
 wheel:"Eight equally likely segments, each with 12.5% probability. The pointer selects exactly one segment. Labels show total payout multipliers; a return below 1× is a net loss.",
 plinko:"Eight independent left/right decisions, each 50%. Bucket probabilities follow the displayed binomial distribution. Low and high risk change payouts, not probabilities. Expected return is 99% before whole-coin rounding.",
 tower:"Each floor has exactly one trap, fixed before your first choice. With 3 columns, survival is 2/3 per floor; with 4, it is 3/4. Every successful step multiplies your current return by 0.99 / survival probability. Cash out after any safe floor; floor 8 automatically settles.",
 hilo:"Cards are drawn independently with replacement from ranks A (1) to K (13). Choose strictly higher or strictly lower. A tie loses. Higher probability is (13 − current rank)/13; lower is (current rank − 1)/13. Each success multiplies return by 0.99 / probability. Cash out after a success; 8 successes automatically settle.",
};

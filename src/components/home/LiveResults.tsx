"use client";
import { useEffect,useRef,useState } from "react";
import { apiFetch,apiUrl } from "@/lib/client/api";
import { IS_STATIC } from "@/lib/static/config";
import { GAME_CATALOG } from "@/lib/games/config";
type Row={id:string;sequence:number;roundId:string;game:string;settledAt:string;wager:number;payout:number;net:number;multiplier:number;outcome:string;player:{name:string;avatar:string|null}};
type Data={results:Row[];cursor:number;nextCursor:number|null;updatedAt:string;stats:{players:number;positive:number;negative:number;breakEven:number;rounds:number;wagered:number;paid:number;net:number;winningPercent:number;largestWin:number}};
const num=(n:number)=>n.toLocaleString("en-US");
export default function LiveResults({compact=false}:{compact?:boolean}){
 const [view,setView]=useState("all"),[game,setGame]=useState("all"),[hours,setHours]=useState("24"),[min,setMin]=useState("0"),[max,setMax]=useState("100000000");
 const [data,setData]=useState<Data|null>(null),[paused,setPaused]=useState(false),[status,setStatus]=useState("Connecting"),[error,setError]=useState(""),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[selected,setSelected]=useState<Row|null>(null);
 const dialog=useRef<HTMLDialogElement>(null);const generation=useRef(0);
 const query=new URLSearchParams({view,game,hours,min,max,limit:compact?"8":"30"}).toString();
 useEffect(()=>{const gen=++generation.current;let source:EventSource|undefined;let cancelled=false;let loading=false;
  if(IS_STATIC){setStatus("Unavailable in browser demo");return;}
  if(paused){setStatus("Paused");return;}
  const load=async()=>{if(loading)return;loading=true;try{
    const next=await apiFetch<Data>(`/api/results?${query}`);if(cancelled||gen!==generation.current)return;
    setData(next);setError("");
    if(!source){source=new EventSource(apiUrl(`/api/results/stream?${query}&after=${next.cursor}`));
      source.onopen=()=>setStatus("Connected");source.onerror=()=>setStatus("Reconnecting");
      source.addEventListener("update",(event)=>{
        setStatus("Connected");
        /*
          Only refetch when the cursor actually moved.

          The stream emits a heartbeat every few seconds so the client can tell
          a live connection from a dead one, and it already reports whether
          anything settled since the last tick. Reloading on every heartbeat
          turned that into a full query-and-render of the table every three
          seconds per open tab, forever, on a page that is usually idle. The
          heartbeat still updates the status; only a real settlement refetches.
        */
        let changed = true;
        try { changed = (JSON.parse((event as MessageEvent).data) as {changed?:boolean}).changed !== false; }
        catch { /* Malformed frame: fall back to refetching rather than going stale. */ }
        if (changed) void load();
      });
    }
  }catch(e){if(!cancelled){setError(e instanceof Error?e.message:"Unable to load results");setStatus("Disconnected");}}finally{loading=false;}};
  setData(null);void load();return()=>{cancelled=true;source?.close()};
 },[query,paused,retry]);
 useEffect(()=>{if(selected)dialog.current?.showModal()},[selected]);
 async function older(){if(!data?.nextCursor)return;setBusy(true);setPaused(true);try{const next=await apiFetch<Data>(`/api/results?${query}&before=${data.nextCursor}&snapshot=${data.cursor}`);setData({...next,results:[...data.results,...next.results].filter((r,i,a)=>a.findIndex(v=>v.id===r.id)===i).slice(-120)});}catch(e){setError(String(e))}finally{setBusy(false)}}
 return <section className={`mb-live mb-wave ${compact?"is-compact":""}`} aria-label="Live results">
  <div className="mb-section-head"><div><span className="mb-eyebrow">THE NETWORK / SETTLED ON SERVER</span><h2>Live results<span className="mb-live-dot" data-online={status==="Connected"}/></h2></div><div className="mb-status" role="status">{status}<span>{data?`Updated ${new Date(data.updatedAt).toLocaleTimeString()}`:"Waiting for server"}</span></div></div>
  {!compact&&<>
   <div className="mb-metrics mb-rise">{data?([
    ["Active players",num(data.stats.players),`${data.stats.positive} positive · ${data.stats.negative} negative · ${data.stats.breakEven} even`,"neutral"],
    ["Settled rounds",num(data.stats.rounds),"Players and rounds counted separately","neutral"],
    ["Total wagered",num(data.stats.wagered),`${num(data.stats.paid)} paid out, including stakes`,"neutral"],
    // Aggregate net is signed, so it is the one metric that must not inherit the
    // default emerald. Rendering a collective loss in the profit colour would
    // read as good news the balances flatly contradict.
    ["Player net",`${data.stats.net>0?"+":""}${num(data.stats.net)}`,`${data.stats.winningPercent.toFixed(1)}% winning rounds`,
      data.stats.net>0?"positive":data.stats.net<0?"negative":"neutral"],
   ] as const).map(([label,value,detail,tone])=><div className="mb-metric" data-tone={tone} key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>):Array.from({length:4},(_,i)=><div className="mb-metric mb-skeleton" key={i}>Loading statistics…</div>)}</div>
   <p className="mb-definition">Selected period · A winning round returns more than its wager. Winning % = winning rounds ÷ all settled rounds, including break-even. Refunds and cancellations are excluded. Largest net win: {num(data?.stats.largestWin??0)} coins. Active players means unique players with settled rounds, not online presence.</p>
  </>}
  <div className="mb-toolbar"><div className="mb-tabs">{[["all","All results"],["wins","Wins"],["losses","Losses"],["biggest","Biggest wins"],["mine","My results"]].map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>{setView(id);setPaused(false)}}>{label}</button>)}</div><button className="btn btn-ghost" onClick={()=>setPaused(!paused)}>{paused?"▶ Resume":"Ⅱ Pause"}</button></div>
  {!compact&&<div className="mb-filters"><label>Game<select value={game} onChange={e=>setGame(e.target.value)}><option value="all">All games</option>{GAME_CATALOG.filter(g=>g.category!=="cases").map(g=><option key={g.key} value={g.key}>{g.name}</option>)}</select></label><label>Time range<select value={hours} onChange={e=>setHours(e.target.value)}><option value="1">Last hour</option><option value="24">24 hours</option><option value="168">7 days</option><option value="720">30 days</option><option value="8760">365 days</option></select></label><label>Minimum wager<input type="number" min="0" value={min} onChange={e=>setMin(e.target.value||"0")}/></label><label>Maximum wager<input type="number" min="0" value={max} onChange={e=>setMax(e.target.value||"100000000")}/></label></div>}
  {error&&<div className="mb-message" role="alert">{error}<button className="btn btn-ghost" onClick={()=>setRetry(v=>v+1)}>Retry connection</button></div>}
  {!data&&!error&&<div className="mb-empty">{IS_STATIC?"Live results require the server deployment. Practice rounds never appear here.":"Loading settled results…"}</div>}
  {data&&<div className="mb-table-wrap" onScroll={e=>{if(e.currentTarget.scrollTop>20)setPaused(true)}}><table className="mb-table"><thead><tr><th>Game / time</th><th>Player</th><th>Wager</th><th>Total payout</th><th>Net result</th><th>Multiplier</th><th>Outcome</th></tr></thead><tbody>{data.results.map(r=><tr key={r.id}><td><button className="mb-result-link" onClick={()=>setSelected(r)}>{GAME_CATALOG.find(g=>g.key===r.game)?.name??r.game}<small>{new Date(r.settledAt).toLocaleTimeString()}</small></button></td><td><span className="mb-player">{r.player.avatar?<img src={r.player.avatar} width="24" height="24" alt="" referrerPolicy="no-referrer"/>:<span className="mb-avatar-mini" aria-hidden="true">{r.player.name[0]}</span>}{r.player.name}</span></td><td>{num(r.wager)}</td><td>{num(r.payout)}</td><td className={r.net>0?"mb-positive":r.net<0?"mb-negative":""}>{r.net>0?"+":""}{num(r.net)}</td><td>{r.multiplier.toFixed(2)}×</td><td><span className={`mb-outcome ${r.net>0?"mb-positive":r.net<0?"mb-negative":""}`}>{r.outcome==="PUSH"?"Break-even":r.outcome.toLowerCase()}</span></td></tr>)}</tbody></table>{!data.results.length&&<div className="mb-empty"><span>◇</span><h3>No settled results in this view</h3><p>Real results will appear here once rounds finish. Try another period or filter.</p></div>}</div>}
  {!compact&&data?.nextCursor&&<button className="btn btn-ghost mb-load" onClick={older} disabled={busy}>{busy?"Loading…":"Load older results"}</button>}
  <p className="mb-definition">Total payout includes any returned stake. Net = payout − wager. Multiplier = payout ÷ wager. {paused?"Updates paused while you inspect history. ":""}Up to 120 entries retained on screen.</p>
  <dialog ref={dialog} className="mb-dialog" onClose={()=>setSelected(null)}><button className="btn btn-ghost" onClick={()=>dialog.current?.close()} autoFocus>Close result ×</button>{selected&&<><h2>Settlement receipt</h2><dl>{Object.entries({"Event ID":selected.id,"Round ID":selected.roundId,"Settled at":new Date(selected.settledAt).toISOString(),Game:selected.game,Player:selected.player.name,Wager:selected.wager,"Total payout":selected.payout,"Net result":selected.net,Multiplier:`${selected.multiplier.toFixed(6)}×`,Outcome:selected.outcome}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p>Settlement is recorded before the result is published.</p></>}</dialog>
 </section>;
}

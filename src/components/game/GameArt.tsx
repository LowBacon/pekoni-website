import type { CSSProperties } from "react";
const colors:Record<string,string>={mines:"#52f4b0",dice:"#86b1ff",plinko:"#de9aff",coinflip:"#ffd789",wheel:"#ff9fbd",tower:"#67e1f7",hilo:"#bba6ff",crash:"#74ffcc",slots:"#ffda80"};
export default function GameArt({game,large=false}:{game:string;large?:boolean}){
 const color=colors[game]??"#78dccc";
 return <div className={`mb-art ${large?"mb-art-large":""}`} style={{"--art-color":color} as CSSProperties} aria-hidden="true"><div className="mb-art-orbit"/>
 <svg viewBox="0 0 240 180" fill="none">
  {game==="mines"?<g stroke={color} strokeWidth="2"><path d="m120 20 48 35 14 56-62 50-62-50 14-56Z" fill={color} fillOpacity=".12"/><path d="m120 20-22 66 22 75 22-75-22-66ZM72 55l26 31-40 25m110-56-26 31 40 25M98 86h44"/><path d="m120 35-9 32 15-8" strokeWidth="5"/></g>:
  game==="dice"?<g transform="rotate(-16 120 90)"><rect x="66" y="34" width="108" height="108" rx="22" fill={color} fillOpacity=".15" stroke={color} strokeWidth="2"/>{[[89,59],[151,59],[120,89],[89,119],[151,119]].map(([x,y])=><rect key={`${x}${y}`} x={x-5} y={y-5} width="10" height="10" rx="2" fill={color}/>)}</g>:
  game==="plinko"?<g>{Array.from({length:7},(_,r)=>Array.from({length:r+1},(_,c)=><circle key={`${r}-${c}`} cx={120-r*10+c*20} cy={32+r*18} r="3" fill={color} opacity=".7"/>))}<path d="m120 22 10 28-20 18 10 18-10 18 20 18" stroke={color} strokeWidth="2" strokeDasharray="3 5"/><circle cx="130" cy="122" r="8" fill={color}/><path d="M49 158h142" stroke={color}/></g>:
  game==="coinflip"?<g transform="rotate(-20 120 90)"><ellipse cx="126" cy="90" rx="51" ry="62" fill={color} fillOpacity=".17" stroke={color} strokeWidth="2"/><ellipse cx="116" cy="90" rx="51" ry="62" fill="#17221f" stroke={color} strokeWidth="3"/><path d="m116 51 24 39-24 39-24-39Z" fill={color} fillOpacity=".5"/><path d="m92 90 24 10 24-10m-24-39v78" stroke={color}/></g>:
  game==="wheel"?<g><circle cx="120" cy="90" r="63" fill={color} fillOpacity=".1" stroke={color} strokeWidth="2"/>{Array.from({length:8},(_,i)=><path key={i} d="M120 90V27" transform={`rotate(${i*45} 120 90)`} stroke={color} opacity=".6"/>)}<circle cx="120" cy="90" r="17" fill="#192224" stroke={color}/><path d="m110 16 10 23 10-23" fill={color}/></g>:
  game==="tower"?<g>{[0,1,2,3,4].map(i=><g key={i} transform={`translate(0 ${-i*24})`}><path d="m120 137 39 13-39 20-39-20Z" fill={color} fillOpacity={.12+i*.1} stroke={color}/><path d="m81 150 39 20 39-20v10l-39 20-39-20Z" fill={color} fillOpacity=".08"/></g>)}</g>:
  game==="hilo"?<g><rect x="61" y="40" width="78" height="112" rx="9" transform="rotate(-14 61 40)" fill={color} fillOpacity=".08" stroke={color}/><rect x="102" y="27" width="78" height="112" rx="9" transform="rotate(10 102 27)" fill="#212334" stroke={color} strokeWidth="2"/><path d="m136 57 18 29-18 29-18-29Z" fill={color}/></g>:
  <g><path d="M35 145h175M35 145V25" stroke={color} opacity=".25"/><path d="M40 140c80 0 85-10 145-108" stroke={color} strokeWidth="4"/><path d="m168 34 21-9-1 23" stroke={color} strokeWidth="4"/><path d="M40 140c80 0 85-10 145-108v113Z" fill={color} fillOpacity=".08"/></g>}
 </svg></div>;
}

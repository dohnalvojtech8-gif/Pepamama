// Calendar reports are derived from durable visits/events; no archive rollover can lose records.
const ZONE='Europe/Prague';
export function localDay(value){return new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}
export function shiftDay(day,amount){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10)}
export function midnight(day){const offset=new Intl.DateTimeFormat('en',{timeZone:ZONE,timeZoneName:'shortOffset'}).format(new Date(day+'T00:00:00Z')).includes('GMT+2')?'+02:00':'+01:00';return +new Date(day+'T00:00:00'+offset)}
export function shiftMonth(month,amount){const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m-1+amount,1,12)).toISOString().slice(0,7)}
export function monthLabel(month){return new Date(month+'-01T12:00:00Z').toLocaleDateString('cs-CZ',{month:'long',year:'numeric',timeZone:ZONE})}
export function monthDays(month){const end=shiftMonth(month,1)+'-01',days=[];for(let day=month+'-01';day<end;day=shiftDay(day,1))days.push(day);return days}
export function clippedHours(visit,start,end,now=Date.now()){return Math.max(0,Math.min(+new Date(visit.departed_at||now),end,now)-Math.max(+new Date(visit.arrived_at),start))/3600000}
export function reportMonths(state,id,now=Date.now()){
 const current=localDay(now).slice(0,7);let oldest=shiftMonth(current,-3);
 for(const row of [...state.visits,...state.events]){if(row.caregiver_id!==id)continue;const m=localDay(row.arrived_at||row.created_at).slice(0,7);if(m<oldest)oldest=m}
 const months=[];for(let m=current;m>=oldest;m=shiftMonth(m,-1))months.push(m);return months;
}
export function caregiverMonth(state,id,month,now=Date.now()){
 const start=midnight(month+'-01'),end=midnight(shiftMonth(month,1)+'-01');
 const visits=state.visits.filter(v=>v.caregiver_id===id&&+new Date(v.arrived_at)<Math.min(end,now)&&+new Date(v.departed_at||now)>start);
 const events=state.events.filter(e=>e.caregiver_id===id&&+new Date(e.created_at)>=start&&+new Date(e.created_at)<end&&+new Date(e.created_at)<=now);
 const tasks=events.filter(e=>e.kind==='task'),counts=new Map();
 for(const e of tasks){const key=e.task_id||e.label,previous=counts.get(key);counts.set(key,{id:key,name:e.label,count:(previous?.count||0)+1})}
 const days=monthDays(month).flatMap(day=>{const a=midnight(day),b=midnight(shiftDay(day,1));const shifts=visits.filter(v=>+new Date(v.arrived_at)<Math.min(b,now)&&+new Date(v.departed_at||now)>a).map(v=>({...v,hours:clippedHours(v,a,b,now)}));const dailyEvents=events.filter(e=>localDay(e.created_at)===day);return shifts.length||dailyEvents.length?[{day,visits:shifts,events:dailyEvents,hours:shifts.reduce((s,v)=>s+v.hours,0),tasks:dailyEvents.filter(e=>e.kind==='task').length}]:[]}).reverse();
 return {month,start,end,visits,events,days,hours:visits.reduce((s,v)=>s+clippedHours(v,start,end,now),0),shiftCount:visits.length,dayCount:days.length,taskCount:tasks.length,taskCounts:[...counts.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'cs'))};
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {caregiverMonth,reportMonths,monthDays,midnight} from '../public/reports.js';
const now=+new Date('2026-11-17T18:00:00Z');
const visit=(id,start,end,caregiver='a')=>({id,caregiver_id:caregiver,arrived_at:start,departed_at:end});
const event=(id,shift,at,kind='task',caregiver='a')=>({id,visit_id:shift,caregiver_id:caregiver,created_at:at,kind,task_id:'t',label:'Koupání'});
test('current monthly totals exclude other people/months, group multiple shifts per day, and retain tasks of removed types',()=>{
 const s={visits:[visit('v1','2026-11-01T07:00:00Z','2026-11-01T09:00:00Z'),visit('v2','2026-11-01T12:00:00Z','2026-11-01T13:00:00Z'),visit('v3','2026-10-15T07:00:00Z','2026-10-15T09:00:00Z'),visit('other','2026-11-01T07:00:00Z','2026-11-01T20:00:00Z','b')],events:[event('e1','v1','2026-11-01T08:00:00Z'),event('e2','v2','2026-11-01T12:30:00Z'),event('old','v3','2026-10-15T08:00:00Z'),event('other','other','2026-11-01T08:00:00Z','task','b')]};
 const r=caregiverMonth(s,'a','2026-11',now);assert.equal(r.hours,3);assert.equal(r.shiftCount,2);assert.equal(r.dayCount,1);assert.equal(r.taskCount,2);assert.equal(r.days[0].visits.length,2);assert.equal(r.taskCounts[0].count,2);assert.equal(r.taskCounts[0].name,'Koupání');
 const archive=caregiverMonth(s,'a','2026-10',now);assert.equal(archive.shiftCount,1);assert.equal(archive.hours,2);assert.equal(archive.days[0].day,'2026-10-15');
});
test('overnight shift splits at the month boundary and each event belongs to its actual local month',()=>{
 const s={visits:[visit('v','2026-10-31T22:00:00Z','2026-11-01T02:00:00Z')],events:[event('e1','v','2026-10-31T22:30:00Z'),event('e2','v','2026-10-31T23:30:00Z')]};
 const oct=caregiverMonth(s,'a','2026-10',now),nov=caregiverMonth(s,'a','2026-11',now);assert.equal(oct.hours,1);assert.equal(nov.hours,3);assert.equal(oct.taskCount,1);assert.equal(nov.taskCount,1);assert.equal(oct.days[0].day,'2026-10-31');assert.equal(nov.days[0].day,'2026-11-01');
});
test('calendar supports February, leap years and 23/25-hour daylight-saving days',()=>{
 assert.equal(monthDays('2026-02').length,28);assert.equal(monthDays('2028-02').length,29);assert.equal(monthDays('2026-04').length,30);assert.equal(monthDays('2026-12').length,31);
 assert.equal((midnight('2026-03-30')-midnight('2026-03-29'))/3600000,23);assert.equal((midnight('2026-10-26')-midnight('2026-10-25'))/3600000,25);
 const s={visits:[visit('spring','2026-03-28T23:00:00Z','2026-03-29T22:00:00Z'),visit('fall','2026-10-24T22:00:00Z','2026-10-25T23:00:00Z')],events:[]};assert.equal(caregiverMonth(s,'a','2026-03',now).hours,23);assert.equal(caregiverMonth(s,'a','2026-10',now).hours,25);
});
test('archive always offers current and three previous months and retains older history across year boundaries',()=>{
 assert.deepEqual(reportMonths({visits:[],events:[]},'a',+new Date('2026-01-10T10:00:00Z')),['2026-01','2025-12','2025-11','2025-10']);
 const s={visits:[visit('old','2025-06-01T08:00:00Z','2025-06-01T09:00:00Z')],events:[]};const months=reportMonths(s,'a',now);assert.equal(months[0],'2026-11');assert.equal(months.at(-1),'2025-06');assert.equal(months.length,18);
});
test('active shift accrues only until now, with no future days and no fabricated empty month data',()=>{
 const s={visits:[visit('v','2026-11-16T22:00:00Z',null)],events:[]};const r=caregiverMonth(s,'a','2026-11',now);assert.equal(r.hours,20);assert.equal(r.dayCount,2);assert.equal(r.days[0].day,'2026-11-17');assert.equal(r.days[0].hours,19);assert.equal(r.days[1].hours,1);assert.equal(caregiverMonth(s,'a','2026-10',now).shiftCount,0);
});

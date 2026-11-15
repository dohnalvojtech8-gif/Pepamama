-- Run once in a NEW Supabase project's SQL editor. Single household installation.
begin;
create table public.caregivers(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 80),created_at timestamptz not null default now());
create table public.tasks(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 80),category text not null default 'Péče',icon text not null default 'check');
create table public.visits(id uuid primary key default gen_random_uuid(),caregiver_id uuid not null references public.caregivers(id),arrived_at timestamptz not null default now(),departed_at timestamptz,check(departed_at is null or departed_at>=arrived_at));
create unique index one_active_visit on public.visits(caregiver_id) where departed_at is null;
create table public.events(id uuid primary key default gen_random_uuid(),request_id uuid unique not null,caregiver_id uuid not null references public.caregivers(id),visit_id uuid not null references public.visits(id),task_id uuid references public.tasks(id),kind text not null check(kind in ('arrival','task','departure')),label text not null,created_at timestamptz not null default now());
create index events_time on public.events(created_at desc);
create index visits_caregiver_time on public.visits(caregiver_id,arrived_at desc);
create table public.push_subscriptions(endpoint text primary key,subscription jsonb not null,created_at timestamptz not null default now());
-- Private API: browsers have no direct access. Only the authorized Node server uses service_role.
alter table public.caregivers enable row level security;
alter table public.tasks enable row level security;
alter table public.visits enable row level security;
alter table public.events enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.caregivers,public.tasks,public.visits,public.events,public.push_subscriptions from anon,authenticated;
grant select,insert,update,delete on public.caregivers,public.tasks,public.visits,public.events,public.push_subscriptions to service_role;
-- Lock each caregiver so arrivals, tasks and departures serialize atomically.
create function public.record_care_event(p_caregiver uuid,p_kind text,p_task uuid,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.visits; t public.tasks; e public.events; n text;
begin
  select name into n from public.caregivers where id=p_caregiver for update;
  if not found then raise exception 'Pečovatelka neexistuje'; end if;
  select * into e from public.events where request_id=p_request;
  if found then return to_jsonb(e)||jsonb_build_object('duplicate',true,'caregiver_name',n); end if;
  select * into v from public.visits where caregiver_id=p_caregiver and departed_at is null;
  if p_kind='arrival' then
    if v.id is not null then raise exception 'Pečovatelka je už přihlášená'; end if;
    insert into public.visits(caregiver_id) values(p_caregiver) returning * into v;
  elsif p_kind in ('task','departure') then
    if v.id is null then raise exception 'Nejdřív zaznamenejte příchod'; end if;
    if p_kind='task' then
      select * into t from public.tasks where id=p_task;
      if not found then raise exception 'Úkon neexistuje'; end if;
    else
      update public.visits set departed_at=now() where id=v.id;
    end if;
  else raise exception 'Neplatná událost'; end if;
  insert into public.events(request_id,caregiver_id,visit_id,task_id,kind,label)
  values(p_request,p_caregiver,v.id,case when p_kind='task' then t.id else null end,p_kind,case when p_kind='arrival' then 'Příchod' when p_kind='departure' then 'Odchod' else t.name end) returning * into e;
  return to_jsonb(e)||jsonb_build_object('caregiver_name',n);
end $$;
revoke all on function public.record_care_event(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_care_event(uuid,text,uuid,uuid) to service_role;
commit;
-- Configure actual people in the app. Tasks below are starter configuration, not care records.
insert into public.tasks(name,category,icon) values
('Koupání','Péče','bath'),('Podání jídla','Péče','cup'),('Podání léků','Péče','heart'),('Osobní hygiena','Péče','bath'),('Procházka','Péče','leaf'),('Úklid myčky','Domácnost','home'),('Úklid domácnosti','Domácnost','home'),('Výměna prádla','Domácnost','list'),('Nákup','Domácnost','list');

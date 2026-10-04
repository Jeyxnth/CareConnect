-- True when the signed-in user is an accepted caregiver of the given patient.
-- SECURITY DEFINER so it can read caregiver_links without being blocked by that table's RLS.
create or replace function public.is_linked_caregiver(patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from caregiver_links
    where patient_user_id = patient
      and caregiver_user_id = auth.uid()
      and accepted
  );
$$;
revoke all on function public.is_linked_caregiver(uuid) from public, anon;
grant execute on function public.is_linked_caregiver(uuid) to authenticated;

create table if not exists care_plans (
  user_id uuid primary key references auth.users,
  warning_signs jsonb default '[]',
  diet jsonb default '[]',
  activity_restrictions jsonb default '[]',
  source_document_id uuid references medical_documents on delete set null,
  updated_at timestamptz default now()
);
alter table care_plans enable row level security;

drop policy if exists "own care plan" on care_plans;
create policy "own care plan" on care_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "caregiver read care plan" on care_plans;
create policy "caregiver read care plan" on care_plans for select
  using (is_linked_caregiver(user_id));

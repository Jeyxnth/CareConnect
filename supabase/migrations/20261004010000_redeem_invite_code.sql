-- Lets a caregiver redeem a patient's invite code. The caregiver can't SELECT/UPDATE
-- the link row directly (RLS only allows the patient or an already-linked caregiver),
-- so this runs as the function owner. A code is single-use and can't be redeemed by
-- the patient who created it.
create or replace function public.redeem_invite_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_patient uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update caregiver_links
     set caregiver_user_id = auth.uid(),
         accepted = true
   where invite_code = code
     and accepted = false
     and patient_user_id <> auth.uid()
  returning patient_user_id into linked_patient;

  if linked_patient is null then
    raise exception 'Invalid or already used invite code';
  end if;

  return linked_patient;
end;
$$;

revoke all on function public.redeem_invite_code(text) from public, anon;
grant execute on function public.redeem_invite_code(text) to authenticated;

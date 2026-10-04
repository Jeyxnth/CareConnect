-- One adherence log per user per day (needed for upsert onConflict 'user_id,date').
-- Postgres has no "add constraint if not exists", so guard it explicitly.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'adherence_logs_user_date_unique'
  ) then
    alter table adherence_logs
      add constraint adherence_logs_user_date_unique unique (user_id, date);
  end if;
end $$;

-- The remote DB had an older schema (verified empty, 0 rows) using these three table
-- names. Replace them with the new schema. chat_logs / patient_documents are untouched.
drop table patients;
drop table adherence_logs;
drop table risk_assessments;

-- patients
create table patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  age int,
  primary_diagnosis text,
  condition_severity int check(condition_severity between 1 and 5),
  discharge_date date,
  role text check(role in ('patient','caregiver')),
  created_at timestamptz default now()
);
alter table patients enable row level security;
create policy "own rows" on patients for all using (auth.uid() = user_id);

-- caregiver_links
create table caregiver_links (
  id uuid primary key default gen_random_uuid(),
  patient_user_id uuid references auth.users not null,
  caregiver_user_id uuid references auth.users,
  invite_code text unique not null,
  accepted bool default false,
  created_at timestamptz default now()
);
alter table caregiver_links enable row level security;
create policy "own links" on caregiver_links for all
  using (auth.uid() = patient_user_id or auth.uid() = caregiver_user_id);

-- medical_documents
create table medical_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  patient_name text,
  filename text,
  document_text text,
  structured_data jsonb,
  created_at timestamptz default now()
);
alter table medical_documents enable row level security;
create policy "own docs" on medical_documents for all using (auth.uid() = user_id);

-- chat_sessions
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text,
  language text default 'en',
  created_at timestamptz default now()
);
alter table chat_sessions enable row level security;
create policy "own sessions" on chat_sessions for all using (auth.uid() = user_id);

-- chat_messages
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions not null,
  user_id uuid references auth.users not null,
  role text check(role in ('user','assistant')),
  content text,
  created_at timestamptz default now()
);
alter table chat_messages enable row level security;
create policy "own messages" on chat_messages for all using (auth.uid() = user_id);

-- adherence_logs
create table adherence_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  medication_taken bool default false,
  exercise_done bool default false,
  diet_followed bool default false,
  appointment_attended bool default false,
  score int,
  created_at timestamptz default now()
);
alter table adherence_logs enable row level security;
create policy "own logs" on adherence_logs for all using (auth.uid() = user_id);

-- risk_assessments
create table risk_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  risk_percent int,
  risk_label text,
  adherence_score int,
  days_post_discharge int,
  created_at timestamptz default now()
);
alter table risk_assessments enable row level security;
create policy "own risk" on risk_assessments for all using (auth.uid() = user_id);

-- medication_reminders
create table medication_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  medication_name text,
  dosage text,
  times jsonb,
  active bool default true,
  created_at timestamptz default now()
);
alter table medication_reminders enable row level security;
create policy "own meds" on medication_reminders for all using (auth.uid() = user_id);

-- reminder_logs
create table reminder_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  reminder_id uuid references medication_reminders,
  scheduled_time timestamptz,
  taken_at timestamptz,
  status text check(status in ('pending','taken','missed')),
  created_at timestamptz default now()
);
alter table reminder_logs enable row level security;
create policy "own reminder logs" on reminder_logs for all using (auth.uid() = user_id);

-- emergency_contacts
create table emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text,
  relationship text,
  phone text,
  is_primary bool default false,
  display_order int,
  created_at timestamptz default now()
);
alter table emergency_contacts enable row level security;
create policy "own contacts" on emergency_contacts for all using (auth.uid() = user_id);

-- recovery_milestones
create table recovery_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  milestone_date date,
  title text,
  description text,
  status text check(status in ('achieved','pending','missed')),
  notes text,
  created_at timestamptz default now()
);
alter table recovery_milestones enable row level security;
create policy "own milestones" on recovery_milestones for all using (auth.uid() = user_id);

-- Storage: private bucket "medical-documents", authenticated users only,
-- each user restricted to their own top-level folder (<user_id>/...).
insert into storage.buckets (id, name, public)
values ('medical-documents', 'medical-documents', false);

create policy "own documents read" on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own documents insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own documents update" on storage.objects for update to authenticated
  using (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own documents delete" on storage.objects for delete to authenticated
  using (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = auth.uid()::text);

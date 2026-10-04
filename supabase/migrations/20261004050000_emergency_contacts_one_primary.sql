-- At most one primary emergency contact per user
create unique index if not exists emergency_contacts_one_primary
  on emergency_contacts (user_id) where is_primary;

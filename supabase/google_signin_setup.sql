-- Google sign-in: a member who signs up with Google has no phone number on Echo. Run this ONCE in the Supabase SQL editor.
-- It contains "drop", which the tooling used for migrations does not run, so it is kept apart. The editor will ask you to confirm.
-- Until it is run, signing up with Google is refused with a plain message and phone sign-up carries on as before.

alter table private.identities alter column phone drop not null;

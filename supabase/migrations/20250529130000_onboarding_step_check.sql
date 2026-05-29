-- Allow SMS onboarding steps (first_name → last_name → email → city)
alter table public.onboarding_sessions
  drop constraint if exists onboarding_sessions_step_check;

alter table public.onboarding_sessions
  add constraint onboarding_sessions_step_check
  check (
    step = any (
      array[
        'first_name',
        'last_name',
        'email',
        'city',
        'name',
        'dob',
        'title',
        'passport'
      ]::text[]
    )
  );

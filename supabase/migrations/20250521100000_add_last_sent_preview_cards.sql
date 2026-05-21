alter table users
  add column if not exists last_sent_preview_cards jsonb;

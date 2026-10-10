-- Phase 5: manual payments (Easypaisa, JazzCash, bank transfer, Raast).
-- Run AFTER schema.sql and phase2-4. Safe to run more than once.
-- Starter methods are DISABLED until you add real account details in Admin -> Payment Methods.

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  account_title text,
  account_number text,
  bank_name text,
  instructions text,
  enabled boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_payment_methods_updated on public.payment_methods;
create trigger trg_payment_methods_updated before update on public.payment_methods
  for each row execute function public.set_updated_at();
alter table public.payment_methods enable row level security;
drop policy if exists "payment methods public read" on public.payment_methods;
create policy "payment methods public read" on public.payment_methods for select using (enabled or public.is_admin());
drop policy if exists "payment methods admin write" on public.payment_methods;
create policy "payment methods admin write" on public.payment_methods for all using (public.is_admin()) with check (public.is_admin());

insert into public.payment_methods (slug, name, instructions, sort_order) values
 ('easypaisa','Easypaisa','Send the amount to the Easypaisa account below, then enter the Transaction ID (TID) from the confirmation message.',10),
 ('jazzcash','JazzCash','Send the amount to the JazzCash account below, then enter the Transaction ID from the confirmation message.',20),
 ('bank-transfer','Bank transfer','Transfer the amount to the bank account below, then enter the transaction or reference number from your receipt.',30),
 ('raast','Raast','Send the amount using the Raast ID below, then enter the transaction reference from your app.',40)
on conflict (slug) do nothing;

create sequence if not exists public.payment_seq start 1001;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_code text not null unique,
  payer_name text not null,
  email text not null,
  phone text,
  purpose text not null,
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  currency text not null default 'PKR' check (currency in ('PKR','USD')),
  method_id uuid references public.payment_methods(id) on delete set null,
  method_name text not null,
  sender_account text,
  transaction_id text not null,
  note text,
  status text not null default 'Pending' check (status in ('Pending','Verified','Rejected','Refunded')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payments_txn_unique on public.payments (method_name, lower(transaction_id));
create index if not exists idx_payments_status on public.payments (status, created_at desc);
drop trigger if exists trg_payments_updated on public.payments;
create trigger trg_payments_updated before update on public.payments
  for each row execute function public.set_updated_at();
alter table public.payments enable row level security;
drop policy if exists "payments admin all" on public.payments;
create policy "payments admin all" on public.payments for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.submit_payment(payload jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_name text := public.clean_text(payload->>'payer_name', 120);
  v_email text := lower(public.clean_text(payload->>'email', 254));
  v_purpose text := public.clean_text(payload->>'purpose', 160);
  v_txn text := public.clean_text(payload->>'transaction_id', 60);
  v_cur text := upper(coalesce(public.clean_text(payload->>'currency', 3), 'PKR'));
  v_amount numeric;
  v_method public.payment_methods;
  v_code text;
  v_id uuid;
begin
  if coalesce(payload->>'website_hp','') <> '' then return 'PAY-0000'; end if;
  if v_name is null or v_purpose is null or v_txn is null or length(v_txn) < 4
     or v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_cur not in ('PKR','USD') then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    v_amount := round((payload->>'amount')::numeric, 2);
  exception when others then
    raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_amount is null or v_amount <= 0 or v_amount > 10000000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into v_method from public.payment_methods
   where id = nullif(payload->>'method_id','')::uuid and enabled;
  if v_method.id is null then raise exception 'method_unavailable' using errcode = '22023'; end if;

  if (select count(*) from public.payments where lower(email) = v_email and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.payments where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  v_code := 'PAY-' || nextval('public.payment_seq');
  begin
    insert into public.payments (payment_code, payer_name, email, phone, purpose, amount, currency,
                                 method_id, method_name, sender_account, transaction_id, note)
    values (v_code, v_name, v_email, public.clean_text(payload->>'phone', 40), v_purpose, v_amount, v_cur,
            v_method.id, v_method.name, public.clean_text(payload->>'sender_account', 60), v_txn,
            public.clean_text(payload->>'note', 1000))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'duplicate_transaction' using errcode = '23505';
  end;

  insert into public.notifications (kind, title, ref_table, ref_id)
  values ('new_payment', 'Payment ' || v_code || ' · ' || v_cur || ' ' || v_amount || ' via ' || v_method.name || ' from ' || v_name, 'payments', v_id);
  return v_code;
end $$;
grant execute on function public.submit_payment(jsonb) to anon, authenticated;

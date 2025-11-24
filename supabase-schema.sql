-- This file contains all the SQL commands needed to set up your database
-- Run these commands in your Supabase SQL Editor (https://ppcfuyvdqchfmmxyoszx.supabase.co)

-- 1. Create profiles table
create table public.profiles (
  id uuid not null references auth.users on delete cascade,
  full_name text,
  email text,
  created_at timestamp with time zone default now(),
  primary key (id)
);

alter table public.profiles enable row level security;

-- 2. Create function to handle new user signups
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email
  );
  return new;
end;
$$;

-- 3. Create trigger for new user signups
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. Create enum for user roles
create type public.app_role as enum ('admin', 'user');

-- 5. Create user_roles table
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null default 'user',
  created_at timestamp with time zone default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- 6. Create security definer function to check roles
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- 7. Create attendance_records table
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  check_in timestamp with time zone not null,
  check_out timestamp with time zone,
  created_at timestamp with time zone default now(),
  unique (user_id, date)
);

alter table public.attendance_records enable row level security;

-- 8. RLS Policies for profiles
create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- 9. RLS Policies for user_roles
create policy "Users can view their own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins can view all roles"
  on public.user_roles for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- 10. RLS Policies for attendance_records
create policy "Users can view their own attendance"
  on public.attendance_records for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own attendance"
  on public.attendance_records for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own attendance"
  on public.attendance_records for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins can view all attendance"
  on public.attendance_records for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- 11. Create function to automatically assign 'user' role to new signups
create or replace function public.handle_new_user_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'user');
  return new;
end;
$$;

-- 12. Create trigger for new user role assignment
create trigger on_auth_user_created_role
  after insert on auth.users
  for each row execute procedure public.handle_new_user_role();

-- IMPORTANT: After running all the above, you need to manually create your first admin user
-- First, sign up through the app, then run this command with your user's email:
-- 
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT id, 'admin'::app_role
-- FROM auth.users
-- WHERE email = 'your-admin-email@example.com'
-- ON CONFLICT (user_id, role) DO NOTHING;

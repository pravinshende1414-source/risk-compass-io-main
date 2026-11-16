insert into public.user_roles (user_id, role)
select id, 'admin'::app_role from auth.users where email = 'pravinshende1414@gmail.com'
on conflict (user_id, role) do nothing;

insert into public.user_roles (user_id, role)
select id, 'researcher'::app_role from auth.users where email = 'tester1787493631@researchlab.io'
on conflict (user_id, role) do nothing;
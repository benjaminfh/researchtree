-- Ensure functions run with a fixed search_path for security linting.

alter function public.rt_list_projects_v1() set search_path = public;
alter function public.rt_get_project_v1(uuid) set search_path = public;
alter function public.rt_list_project_member_ids_v1(uuid) set search_path = public;
alter function public.rt_get_project_main_ref_updates_v1(uuid[]) set search_path = public;
alter function public.rt_get_node_content_json_v1(uuid, uuid) set search_path = public;

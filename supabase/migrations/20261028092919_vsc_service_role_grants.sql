-- Hosted projects may not inherit the local CLI's default service-role DML grants.
-- The invoker reply RPC and internal draft services require explicit server rights.
revoke all on public.vsc_campaigns, public.vsc_campaign_deliveries,
  public.vsc_inbound_replies, public.vsc_imap_cursors from service_role;
grant select, insert, update on public.vsc_campaigns, public.vsc_campaign_deliveries,
  public.vsc_imap_cursors to service_role;
grant select, insert on public.vsc_inbound_replies to service_role;

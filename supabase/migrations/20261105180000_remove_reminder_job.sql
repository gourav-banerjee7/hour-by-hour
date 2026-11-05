-- Push reminders are paused until there is a mobile app.
-- Stops the 15-minute reminder job. The push_subscriptions table and its data are kept.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'hour-by-hour-reminders') then
    perform cron.unschedule('hour-by-hour-reminders');
  end if;
end $$;

import HourApp from "@/components/HourApp";

export const metadata = { title: "Demo · Hour by Hour" };

export default function Demo() {
  return (
    <HourApp
      mode="demo"
      initialProfile={{ timezone: "UTC", active_start: 8, active_end: 22, reminders_enabled: true, custom_activities: [] }}
    />
  );
}

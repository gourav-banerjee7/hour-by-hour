import HourApp from "@/components/HourApp";

export const metadata = { title: "Demo" };

export default function Demo() {
  return (
    <HourApp
      mode="demo"
      initialProfile={{ timezone: "UTC", gcal_connected: false, gcal_sync_all: false }}
    />
  );
}

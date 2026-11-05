import LegalPage, { CONTACT } from "@/components/LegalPage";

export const metadata = { title: "Privacy Policy", description: "What Hour by Hour stores, who it is shared with, and how to delete it." };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>Hour by Hour (“the app”, at hour-by-hour.xyz) is a personal journal where you note what you did each hour. This page explains what we collect, why, and the choices you have.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Your Google account basics.</b> When you sign in with Google we receive your name and email address, so we can create your account and show your first name in the app.</li>
        <li><b>What you write.</b> Your hourly pointers, the tags attached to them, your reminders, and your timezone.</li>
        <li><b>Google Calendar access (only if you connect it).</b> We ask for permission to create and edit events on your calendar. We do not read, list or delete events you did not create through the app. We store an encrypted token so the app can add events for you later.</li>
        <li><b>A session cookie</b> that keeps you signed in. We do not use advertising or tracking cookies.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To show your log, tags, reminders and insights back to you, on every device you sign in on.</li>
        <li>To suggest tags for your pointers, and to suggest reminders or calendar events from what you wrote.</li>
        <li>To create or update the Google Calendar events you ask for. If you turn on “Add all my reminders to Google Calendar”, your reminders are copied to your calendar, and edits and deletions follow.</li>
      </ul>
      <p>We do not sell your data, use it for advertising, or show it to other users.</p>

      <h2>Who processes it</h2>
      <ul>
        <li><b>Supabase</b> hosts the database. Your data is stored in the Asia-Pacific (Tokyo) region and is only readable by your own account.</li>
        <li><b>Vercel</b> hosts the website.</li>
        <li><b>Google</b> provides sign-in, Google Calendar, and the Gemini API. When you add a pointer or press “Generate actions”, the text of those pointers (and your current date and timezone) is sent to the Gemini API to produce tags and suggestions. How Google handles that content is governed by the Gemini API terms that apply to the API key used by this app.</li>
      </ul>

      <h2>Google user data</h2>
      <p>Hour by Hour’s use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. Calendar access is used only to create and edit the events you ask the app to create. It is not used for advertising, and it is not sold or shared with anyone else.</p>

      <h2>Your choices</h2>
      <ul>
        <li><b>Export:</b> Settings has an Export CSV button with all your pointers and tags.</li>
        <li><b>Disconnect Google Calendar:</b> use Disconnect in Settings. We revoke the token with Google and delete it from our database. Events already on your calendar stay there until you delete them.</li>
        <li><b>Revoke access:</b> you can also remove the app at any time from your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google Account permissions</a>.</li>
        <li><b>Delete your account and data:</b> email us at the address below and we will delete everything within 30 days.</li>
      </ul>

      <h2>Retention and security</h2>
      <p>We keep your data until you ask us to delete it. Data is encrypted in transit. Google Calendar tokens are additionally encrypted at rest and can only be read by our server. This is a small personal project, so we cannot promise perfect security, but we take reasonable care.</p>

      <h2>Children</h2>
      <p>The app is not meant for children under 13, and we do not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above, and tell you in the app if the change is significant.</p>

      <h2>Contact</h2>
      <p>Questions or deletion requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
    </LegalPage>
  );
}

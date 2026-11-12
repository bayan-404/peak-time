import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy · Streakline" };

const UPDATED = "November 11, 2026";
const REPO = "https://github.com/bayan-404/streakline";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-6 leading-relaxed">
      <header className="space-y-1">
        <Link href="/series" className="text-sm opacity-60 hover:opacity-100">← Streakline</Link>
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="text-sm opacity-60">Last updated {UPDATED}</p>
      </header>

      <p>
        Streakline helps you plan a “Day N of X” posting series and schedule it to your Buffer account.
        We keep as little data as possible, and we have no database.
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">What we access</h2>
        <p>When you connect Buffer, you grant Streakline these permissions:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><b>account:read</b> to find your organization and connected channels.</li>
          <li><b>posts:write</b> to create the scheduled posts for your series.</li>
          <li><b>posts:read</b> to show whether each day was posted, upcoming, or missed.</li>
        </ul>
        <p>We do not read your analytics, messages, or anything outside these permissions.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">What we store, and where</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <b>Buffer access tokens</b> are kept in an encrypted, HTTP-only cookie in your browser.
            Scripts on the page cannot read it, and we do not keep a copy on our servers.
          </li>
          <li>
            <b>Your series</b> (name, schedule, daily notes, and the IDs of the posts we created) are saved
            in your browser’s local storage on your device. They are not uploaded to us.
          </li>
          <li>
            <b>Post content</b> is sent to Buffer only when you click “Schedule”. From then on, Buffer’s
            own privacy policy applies to it.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">What we don’t do</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>No selling or sharing of your data with anyone.</li>
          <li>No advertising, tracking, or analytics tools.</li>
          <li>No posting without your click. We only schedule what you review and confirm.</li>
        </ul>
        <p>
          Our hosting provider may keep standard technical logs (such as IP address and request time)
          for security and reliability.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Your control</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><b>Disconnect</b> in Streakline deletes the token cookie right away.</li>
          <li>You can also revoke Streakline’s access at any time in your Buffer account settings.</li>
          <li>Deleting a series, or clearing your browser data, removes it from your device.</li>
          <li>Posts already scheduled in Buffer stay there until you edit or delete them in Buffer.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Changes and contact</h2>
        <p>
          If this policy changes, we will update the date above. Questions? Open an issue on{" "}
          <a href={`${REPO}/issues`} className="underline">GitHub</a>.
        </p>
      </section>
    </main>
  );
}

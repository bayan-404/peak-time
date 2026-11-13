import { redirect } from "next/navigation";

// Streakline lives at /series.
export default function Home() {
  redirect("/series");
}

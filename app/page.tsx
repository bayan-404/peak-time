import { redirect } from "next/navigation";

// Streakline lives at /series. The older PeakTime heatmap moved to /best-times.
export default function Home() {
  redirect("/series");
}

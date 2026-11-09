import type { Channel, PostSample } from "./types";

// Fake but realistic data so anyone can try PeakTime without a Buffer account.
// Seeded random → same output every time (stable demo, stable screenshots).

export const demoChannels: Channel[] = [
  { id: "demo-instagram", name: "@peaktime.demo", service: "instagram" },
  { id: "demo-linkedin", name: "PeakTime Demo", service: "linkedin" },
];

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

// Engagement boost per (weekday, hour): evenings + weekday lunch do best.
function boost(day: number, hour: number) {
  let b = 1;
  if (hour >= 18 && hour <= 21) b += 1.2; // evening peak
  if (hour >= 12 && hour <= 13 && day < 5) b += 0.6; // weekday lunch
  if (day === 1 || day === 3) b += 0.4; // Tue/Thu
  if (hour < 7) b -= 0.6; // night
  return b;
}

export function demoPosts(channelId: string): PostSample[] {
  const rand = seeded(channelId.length * 97);
  const posts: PostSample[] = [];
  const now = Date.now();

  for (let i = 0; i < 80; i++) {
    const daysAgo = Math.floor(rand() * 30);
    const hour = Math.floor(rand() * 24);
    const d = new Date(now - daysAgo * 86_400_000);
    d.setUTCHours(hour, Math.floor(rand() * 60), 0, 0);
    const day = (d.getUTCDay() + 6) % 7; // 0 = Mon

    const impressions = Math.round(800 + rand() * 1200);
    const rate = 0.02 * boost(day, hour) * (0.7 + rand() * 0.6);
    const engagements = Math.round(impressions * rate);

    posts.push({
      id: `demo-${i}`,
      sentAt: d.toISOString(),
      reactions: Math.round(engagements * 0.8),
      comments: Math.round(engagements * 0.15),
      shares: Math.round(engagements * 0.05),
      impressions,
    });
  }
  return posts;
}

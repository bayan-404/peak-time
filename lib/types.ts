// Shapes used across the app.
// `PostSample` is our own minimal shape, NOT Buffer's raw Post type.
// lib/buffer.ts maps Buffer's response into this, so the analysis
// code never depends on Buffer's field names.

export type Channel = {
  id: string;
  name: string;
  service: string; // e.g. "instagram", "linkedin"
  avatar?: string;
};

export type PostSample = {
  id: string;
  sentAt: string; // ISO 8601
  reactions: number;
  comments: number;
  shares?: number;
  impressions?: number; // not every network provides this
};

export type Slot = {
  day: number; // 0 = Monday … 6 = Sunday
  hour: number; // 0–23 (start hour of the block)
  score: number;
  posts: number;
};

export type BestTimesResult = {
  heatmap: (number | null)[][]; // 7 days × 24 hours
  counts: number[][]; // posts per cell
  topSlots: Slot[];
  tip: string;
  postCount: number;
  blockHours: 1 | 3; // 3 when data is sparse
  metric: "engagement rate" | "engagements";
  metricsUpdatedAt?: string | null;
};

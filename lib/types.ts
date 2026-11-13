// Our own minimal shape for a Buffer channel, NOT Buffer's raw type.
// lib/buffer.ts maps Buffer's response into this, so the pages never
// depend on Buffer's field names.

export type Channel = {
  id: string;
  name: string;
  service: string; // e.g. "instagram", "linkedin"
  avatar?: string;
};

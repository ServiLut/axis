"use client";

import { HalloweenScene } from "./halloween-scene";
import { ChristmasScene } from "./christmas-scene";

export function SeasonalScene({ variant }: { variant: "login" | "compact" | "panel" }) {
  return <><HalloweenScene variant={variant} /><ChristmasScene variant={variant} /></>;
}

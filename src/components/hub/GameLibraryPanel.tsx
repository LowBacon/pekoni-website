"use client";

import { useResource } from "@/lib/client/api";
import GameLibrary from "./GameLibrary";

/**
 * Wraps the library with its data. Play counts are a nicety — the shelf renders
 * immediately with an unordered catalogue and settles once the counts land.
 */
export default function GameLibraryPanel() {
  const { data } = useResource<{ playCounts: Record<string, number> }>("/api/games/popular");
  return <GameLibrary playCounts={data?.playCounts ?? {}} />;
}

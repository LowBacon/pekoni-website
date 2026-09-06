"use client";

import { useMemo, useState } from "react";
import { GAME_CATALOG, type GameMeta } from "@/lib/games/config";
import { EmptyState } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icons";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useFavourites, useRecentGames } from "@/lib/client/library";
import GameTile from "./GameTile";

type Filter =
  | "All"
  | "Favourites"
  | "MineBet"
  | "Arcade"
  | "Multiplayer"
  | "Cases"
  | "New"
  | "Popular";
type Sort = "played" | "newest" | "rewards";

const FILTERS: Filter[] = [
  "All",
  "Favourites",
  "MineBet",
  "Arcade",
  "Multiplayer",
  "Cases",
  "New",
  "Popular",
];

const SORT_LABELS: Record<Sort, string> = {
  played: "Most Played",
  newest: "Newest",
  rewards: "Biggest Rewards",
};

/**
 * The game library. Play counts come from the server so "Most Played" reflects
 * what the community is actually playing rather than a hand-picked order.
 */
export default function GameLibrary({
  playCounts,
}: {
  playCounts: Record<string, number>;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const [sort, setSort] = useState<Sort>("played");
  const [search, setSearch] = useState("");
  const { sound } = usePreferences();
  const { favourites, toggle, isFavourite } = useFavourites();
  const { recent } = useRecentGames();

  const games = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const matches = (game: GameMeta) => {
      // Search spans name, tagline and tags, so "cash" finds the games you can
      // cash out of and "fast" finds the short ones.
      if (needle) {
        const haystack = `${game.name} ${game.tagline} ${game.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (filter === "All") return true;
      if (filter === "Favourites") return favourites.includes(game.key);
      if (filter === "MineBet") return game.category === "originals";
      if (filter === "Cases") return game.category === "cases";
      return game.tags.includes(filter);
    };

    const list = GAME_CATALOG.filter(matches);

    return [...list].sort((a, b) => {
      if (sort === "played") return (playCounts[b.key] ?? 0) - (playCounts[a.key] ?? 0);
      if (sort === "newest") {
        const aNew = a.tags.includes("New") ? 1 : 0;
        const bNew = b.tags.includes("New") ? 1 : 0;
        return bNew - aNew;
      }
      return b.maxBet - a.maxBet;
    });
  }, [filter, sort, playCounts]);

  const recentGames = recent
    .map((key) => GAME_CATALOG.find((game) => game.key === key))
    .filter((game): game is GameMeta => Boolean(game));

  return (
    <>
      {/* Recently played, shown only once there is something to show. */}
      {recentGames.length > 0 && !search && filter === "All" && (
        <section className="mt-7" aria-label="Viimeksi pelatut">
          <p className="eyebrow mb-3">Viimeksi pelatut</p>
          <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {recentGames.map((game) => (
              <a
                key={game.key}
                href={game.href}
                className="btn btn-ghost btn-sm shrink-0"
                onClick={() => sound("navigate")}
              >
                {game.name}
              </a>
            ))}
          </div>
        </section>
      )}

      <div className="mt-5">
        <label htmlFor="game-search" className="sr-only">
          Hae peleistä
        </label>
        <div className="relative">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
          />
          <input
            id="game-search"
            type="search"
            className="field pl-10"
            placeholder="Hae peliä, kategoriaa tai ominaisuutta…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="hide-scrollbar -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-1">
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                sound("click");
                setFilter(option);
              }}
              aria-pressed={filter === option}
              className={`min-h-[36px] shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${
                filter === option
                  ? "border-[color-mix(in_oklab,var(--color-emerald-500)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-emerald-500)_13%,transparent)] text-[var(--color-emerald-300)]"
                  : "border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-dim)]"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <label className="flex shrink-0 items-center gap-2">
          <Icon name="filter" size={15} className="text-[var(--text-faint)]" />
          <span className="sr-only">Järjestys</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="field min-h-[36px] w-auto py-1.5 pr-8 text-[13px]"
          >
            {(Object.keys(SORT_LABELS) as Sort[]).map((option) => (
              <option key={option} value={option}>
                {SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {games.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon="search"
          title={search ? `Ei osumia haulle "${search}".` : "Ei pelejä tällä suodattimella."}
          description={
            filter === "Favourites" && !search
              ? "Merkitse pelejä suosikeiksi tähdellä, niin ne kerääntyvät tähän."
              : "Kokeile toista hakua tai kategoriaa — kaikki pelit löytyvät All-välilehdeltä."
          }
          action={
            <button
              type="button"
              onClick={() => {
                setFilter("All");
                setSearch("");
              }}
              className="btn btn-ghost btn-sm"
            >
              Näytä kaikki
            </button>
          }
        />
      ) : (
        <div className="stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            /*
              The tile is a single large link, so the favourite control is a
              sibling overlay rather than a child: a button nested inside an
              anchor is invalid, and browsers resolve it by making the star
              navigate instead of toggling.
            */
            <div key={game.key} className="relative">
              <GameTile game={game} />
              <button
                type="button"
                aria-pressed={isFavourite(game.key)}
                aria-label={
                  isFavourite(game.key)
                    ? `Poista ${game.name} suosikeista`
                    : `Lisää ${game.name} suosikkeihin`
                }
                onClick={() => {
                  sound("click");
                  toggle(game.key);
                }}
                className={`absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${
                  isFavourite(game.key)
                    ? "border-[color-mix(in_oklab,var(--color-amber-500)_50%,transparent)] bg-[color-mix(in_oklab,var(--color-amber-500)_18%,transparent)] text-[var(--color-amber-400)]"
                    : "border-[var(--line)] bg-[color-mix(in_oklab,var(--color-obsidian-950)_55%,transparent)] text-[var(--text-faint)] hover:text-[var(--text-dim)]"
                }`}
              >
                <Icon name="spark" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

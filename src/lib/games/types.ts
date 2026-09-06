/**
 * The shape the game maths expects from a randomness source.
 *
 * On the server this is satisfied by the provably-fair HMAC stream in
 * `src/server/rng.ts`. Declaring it structurally here keeps every payout
 * formula free of Node-only imports, so the same module can be used by the
 * client to *display* odds while only the server can *produce* outcomes.
 */
export type FairStream = {
  next(): number;
  nextInt(min: number, max: number): number;
};

/** The subset used by layout helpers that only need sequential floats. */
export type FloatStream = { next(): number };

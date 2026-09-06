/**
 * The Pekoni world content: the case catalogue, its loot tables and the
 * achievement set.
 *
 * This lives in src/lib so exactly one definition feeds both the database seed
 * (prisma/seed.ts) and the static GitHub Pages build, where the browser has to
 * build the same world locally.
 */

export type ItemSpec = {
  name: string;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY" | "MYTHIC";
  icon: string;
  value: number;
  weight: number;
};

export type CaseSpec = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  theme: string;
  kind?: "STANDARD" | "DAILY";
  /** Target return as a share of the price. */
  targetReturn?: number;
  filler: Omit<ItemSpec, "weight">;
  items: ItemSpec[];
};

/**
 * Solves the filler weight w0 so that the case's expected value equals
 * `target`:  (S + w0·v0) / (W + w0) = target  →  w0 = (target·W − S) / (v0 − target)
 */
export function solveFillerWeight(items: ItemSpec[], filler: Omit<ItemSpec, "weight">, target: number) {
  const W = items.reduce((sum, item) => sum + item.weight, 0);
  const S = items.reduce((sum, item) => sum + item.value * item.weight, 0);
  const denominator = filler.value - target;
  if (denominator >= 0) {
    throw new Error(`Filler "${filler.name}" must be worth less than the target EV (${target}).`);
  }
  const weight = Math.round((target * W - S) / denominator);
  if (weight <= 0) {
    throw new Error(
      `Case items are not valuable enough to reach the target EV — raise item values or lower the target.`,
    );
  }
  return weight;
}

export const CASE_SPECS: CaseSpec[] = [
  {
    slug: "starter-case",
    name: "Starter Case",
    tagline: "Ensimmäinen askel metsään.",
    description:
      "Vaatimaton varustelaatikko, jonka Pekonin kulkijat jättävät polun varteen uusille tulokkaille.",
    price: 100,
    theme: "starter",
    filler: { name: "Kourallinen soraa", rarity: "COMMON", icon: "gravel", value: 20 },
    items: [
      { name: "Kivikirves", rarity: "COMMON", icon: "pickaxe", value: 60, weight: 4000 },
      { name: "Hiilipala", rarity: "COMMON", icon: "coal", value: 120, weight: 2500 },
      { name: "Rautaharkko", rarity: "UNCOMMON", icon: "ingot", value: 190, weight: 1500 },
      { name: "Smaragdinsiru", rarity: "RARE", icon: "mint", value: 340, weight: 780 },
      { name: "Timanttisiru", rarity: "EPIC", icon: "diamond", value: 720, weight: 280 },
      { name: "Kultainen kompassi", rarity: "LEGENDARY", icon: "compass", value: 1_700, weight: 95 },
      { name: "Pekonin sinetti", rarity: "MYTHIC", icon: "rune", value: 5_200, weight: 18 },
    ],
  },
  {
    slug: "miner-case",
    name: "Miner Case",
    tagline: "Kaivoskäytävien vakiovarustus.",
    description:
      "Lyhty, hakku ja hieman liikaa ruutia. Kaivosmiehen laatikko tuoksuu kiveltä ja savulta.",
    price: 250,
    theme: "miner",
    filler: { name: "Rikkoutunut lyhty", rarity: "COMMON", icon: "lantern", value: 40 },
    items: [
      { name: "Terästalttа", rarity: "COMMON", icon: "chisel", value: 150, weight: 3800 },
      { name: "Kaivoslyhty", rarity: "COMMON", icon: "lantern", value: 280, weight: 2400 },
      { name: "Redstone-kimppu", rarity: "UNCOMMON", icon: "redstone", value: 470, weight: 1450 },
      { name: "Lapis-kide", rarity: "RARE", icon: "lapis", value: 880, weight: 720 },
      { name: "Timanttihakku", rarity: "EPIC", icon: "pickaxe", value: 1_900, weight: 260 },
      { name: "Syvyyksien kartta", rarity: "LEGENDARY", icon: "map", value: 4_400, weight: 88 },
      { name: "Louhijan riimu", rarity: "MYTHIC", icon: "rune", value: 13_500, weight: 16 },
    ],
  },
  {
    slug: "forest-case",
    name: "Forest Case",
    tagline: "Sammalen peittämä arkku.",
    description:
      "Kuusikon kätkemä arkku, jonka saranat ovat juurtuneet maahan. Sisältä löytyy metsän hiljaisia lahjoja.",
    price: 500,
    theme: "forest",
    filler: { name: "Kostea sammalmätäs", rarity: "COMMON", icon: "emerald", value: 80 },
    items: [
      { name: "Kuusen pihka", rarity: "COMMON", icon: "amber", value: 300, weight: 3600 },
      { name: "Metsänvartijan jousi", rarity: "COMMON", icon: "bow", value: 560, weight: 2300 },
      { name: "Lumottu omena", rarity: "UNCOMMON", icon: "apple", value: 940, weight: 1400 },
      { name: "Revontulien sulka", rarity: "RARE", icon: "feather", value: 1_750, weight: 700 },
      { name: "Ikimetsän sydän", rarity: "EPIC", icon: "heart", value: 3_800, weight: 250 },
      { name: "Sumun kruunu", rarity: "LEGENDARY", icon: "crown", value: 8_800, weight: 84 },
      { name: "Metsän riimu", rarity: "MYTHIC", icon: "rune", value: 27_000, weight: 15 },
    ],
  },
  {
    slug: "diamond-case",
    name: "Diamond Case",
    tagline: "Kristallikammion kirkkaus.",
    description:
      "Jokainen kide on hiottu käsin. Diamond Case loistaa pimeässä kuin pieni kuu.",
    price: 750,
    theme: "diamond",
    filler: { name: "Sameaa kvartsia", rarity: "COMMON", icon: "quartz", value: 110 },
    items: [
      { name: "Kirkas kvartsi", rarity: "COMMON", icon: "quartz", value: 450, weight: 3500 },
      { name: "Timanttisirpale", rarity: "COMMON", icon: "diamond", value: 840, weight: 2250 },
      { name: "Hiottu timantti", rarity: "UNCOMMON", icon: "diamond", value: 1_400, weight: 1380 },
      { name: "Kristallikruunu", rarity: "RARE", icon: "crown", value: 2_650, weight: 690 },
      { name: "Jäätynyt tähti", rarity: "EPIC", icon: "star", value: 5_700, weight: 240 },
      { name: "Ikiroudan sydän", rarity: "LEGENDARY", icon: "heart", value: 13_500, weight: 80 },
      { name: "Timanttiriimu", rarity: "MYTHIC", icon: "rune", value: 41_000, weight: 14 },
    ],
  },
  {
    slug: "nether-case",
    name: "Nether Case",
    tagline: "Tulisen syvyyden jäänteet.",
    description:
      "Laatikko on yhä lämmin. Sen sisältä kuuluu heikko humina, kuin kaukainen tuli hengittäisi.",
    price: 1_500,
    theme: "nether",
    filler: { name: "Karrelle palanut kivi", rarity: "COMMON", icon: "obsidian", value: 200 },
    items: [
      { name: "Laavakivi", rarity: "COMMON", icon: "obsidian", value: 900, weight: 3400 },
      { name: "Tulinen tomu", rarity: "COMMON", icon: "ember", value: 1_700, weight: 2200 },
      { name: "Netheriittisiru", rarity: "UNCOMMON", icon: "netherite", value: 2_900, weight: 1340 },
      { name: "Liekkiydin", rarity: "RARE", icon: "ember", value: 5_400, weight: 670 },
      { name: "Netheriittiharkko", rarity: "EPIC", icon: "netherite", value: 11_500, weight: 235 },
      { name: "Portaalin avain", rarity: "LEGENDARY", icon: "portal", value: 27_000, weight: 78 },
      { name: "Tulen riimu", rarity: "MYTHIC", icon: "rune", value: 82_000, weight: 13 },
    ],
  },
  {
    slug: "pekoni-case",
    name: "Pekoni Case",
    tagline: "Yhteisön oma laatikko.",
    description:
      "Pekonin asukkaiden itse kokoama laatikko. Kukaan ei muista, kuka lisäsi riimun pohjalle.",
    price: 2_500,
    theme: "pekoni",
    filler: { name: "Nuhjuinen reppu", rarity: "COMMON", icon: "pack", value: 320 },
    items: [
      { name: "Kylän leipä", rarity: "COMMON", icon: "apple", value: 1_500, weight: 3300 },
      { name: "Kirjailtu viitta", rarity: "COMMON", icon: "cloak", value: 2_800, weight: 2150 },
      { name: "Pekoni-tunnus", rarity: "UNCOMMON", icon: "badge", value: 4_800, weight: 1300 },
      { name: "Yhteisön malja", rarity: "RARE", icon: "chalice", value: 9_000, weight: 650 },
      { name: "Vanhimman sauva", rarity: "EPIC", icon: "staff", value: 19_500, weight: 228 },
      { name: "Pekonin kruunu", rarity: "LEGENDARY", icon: "crown", value: 45_000, weight: 76 },
      { name: "Perustajan riimu", rarity: "MYTHIC", icon: "rune", value: 140_000, weight: 12 },
    ],
  },
  {
    slug: "ancient-case",
    name: "Ancient Case",
    tagline: "Raunioiden alta kaivettu.",
    description:
      "Kansi on sinetöity merkeillä, joita kukaan ei enää osaa lukea. Se avautuu silti.",
    price: 5_000,
    theme: "ancient",
    filler: { name: "Murentunut savitaulu", rarity: "COMMON", icon: "tablet", value: 600 },
    items: [
      { name: "Muinainen kolikko", rarity: "COMMON", icon: "coin", value: 3_000, weight: 3200 },
      { name: "Kivinen totem", rarity: "COMMON", icon: "totem", value: 5_600, weight: 2100 },
      { name: "Unohdettu sinetti", rarity: "UNCOMMON", icon: "seal", value: 9_600, weight: 1260 },
      { name: "Raunioiden avain", rarity: "RARE", icon: "key", value: 18_000, weight: 630 },
      { name: "Vartijan panssari", rarity: "EPIC", icon: "shield", value: 39_000, weight: 222 },
      { name: "Ensimmäinen lyhty", rarity: "LEGENDARY", icon: "lantern", value: 92_000, weight: 74 },
      { name: "Muinainen riimu", rarity: "MYTHIC", icon: "rune", value: 285_000, weight: 11 },
    ],
  },
  {
    slug: "legendary-case",
    name: "Legendary Case",
    tagline: "Vain harvat ovat avanneet sen.",
    description:
      "Pekonin arvokkain laatikko. Se painaa enemmän kuin sen koko antaisi olettaa.",
    price: 10_000,
    theme: "legendary",
    filler: { name: "Tyhjä jalusta", rarity: "COMMON", icon: "pedestal", value: 1_200 },
    items: [
      { name: "Kultalanka", rarity: "COMMON", icon: "ingot", value: 6_200, weight: 3100 },
      { name: "Tähtikartta", rarity: "COMMON", icon: "map", value: 11_500, weight: 2050 },
      { name: "Revontulikide", rarity: "UNCOMMON", icon: "crystal", value: 19_500, weight: 1220 },
      { name: "Kuunvalon miekka", rarity: "RARE", icon: "sword", value: 37_000, weight: 610 },
      { name: "Legendan panssari", rarity: "EPIC", icon: "shield", value: 80_000, weight: 216 },
      { name: "Maailman sydän", rarity: "LEGENDARY", icon: "heart", value: 190_000, weight: 72 },
      { name: "Pekonin alkuriimu", rarity: "MYTHIC", icon: "rune", value: 600_000, weight: 10 },
    ],
  },
];

/** Free case — no filler solving, the whole table is the reward. */
export const DAILY_CASE_SPEC: CaseSpec = {
  slug: "daily-case",
  name: "Daily Case",
  tagline: "Ilmainen palkinto kerran päivässä.",
  description:
    "Metsäaukion muinainen huoltoarkku. Se täyttyy itsestään joka vuorokausi.",
  price: 0,
  theme: "daily",
  kind: "DAILY",
  filler: { name: "Kuivunut lehti", rarity: "COMMON", icon: "emerald", value: 25 },
  items: [
    { name: "Pieni muonapaketti", rarity: "COMMON", icon: "pack", value: 50, weight: 4000 },
    { name: "Retkieväät", rarity: "COMMON", icon: "apple", value: 100, weight: 3000 },
    { name: "Kaivoslyhty", rarity: "UNCOMMON", icon: "lantern", value: 250, weight: 1600 },
    { name: "Smaragdipussi", rarity: "RARE", icon: "mint", value: 500, weight: 800 },
    { name: "Timanttilipas", rarity: "EPIC", icon: "diamond", value: 1_000, weight: 250 },
    { name: "Muinainen sinetti", rarity: "LEGENDARY", icon: "seal", value: 2_500, weight: 60 },
    { name: "Pekonin jackpot", rarity: "MYTHIC", icon: "rune", value: 10_000, weight: 8 },
  ],
};

export const ACHIEVEMENT_SPECS = [
  { slug: "first-spin", title: "First Spin", description: "Pyöritä Slots-kone ensimmäisen kerran.", icon: "reel", category: "GAMES", target: 1, xpReward: 40, coinReward: 100, sortOrder: 1 },
  { slug: "first-win", title: "First Win", description: "Voita ensimmäinen pelikierroksesi.", icon: "spark", category: "GAMES", target: 1, xpReward: 60, coinReward: 150, sortOrder: 2 },
  { slug: "lucky", title: "Lucky", description: "Löydä 5 Legendary- tai Mythic-esinettä caseista.", icon: "clover", category: "CASES", target: 5, xpReward: 200, coinReward: 1_000, sortOrder: 3 },
  { slug: "unlucky", title: "Unlucky", description: "Häviä 10 kierrosta putkeen. Sekin on saavutus.", icon: "cloud", category: "GAMES", target: 10, xpReward: 80, coinReward: 250, sortOrder: 4 },
  { slug: "diamond-hands", title: "Diamond Hands", description: "Lunasta Crashissa vähintään 10.00x.", icon: "diamond", category: "GAMES", target: 1, xpReward: 250, coinReward: 1_500, sortOrder: 5 },
  { slug: "crash-master", title: "Crash Master", description: "Lunasta Crashissa vähintään 25.00x.", icon: "summit", category: "GAMES", target: 1, xpReward: 400, coinReward: 3_000, sortOrder: 6 },
  { slug: "mine-sweeper", title: "Mine Sweeper", description: "Lunasta Minesissä vähintään 10.00x kertoimella.", icon: "gem", category: "GAMES", target: 1, xpReward: 300, coinReward: 2_000, sortOrder: 7 },
  { slug: "lucky-miner", title: "Lucky Miner", description: "Kaiva 100 turvallista ruutua Minesissä.", icon: "pickaxe", category: "GAMES", target: 100, xpReward: 220, coinReward: 1_200, sortOrder: 8 },
  { slug: "high-roller", title: "High Roller", description: "Panosta 10 000 coins yhdellä kierroksella.", icon: "stack", category: "ECONOMY", target: 10_000, xpReward: 300, coinReward: 2_000, sortOrder: 9 },
  { slug: "case-collector", title: "Case Collector", description: "Avaa 50 casea.", icon: "chest", category: "CASES", target: 50, xpReward: 350, coinReward: 2_500, sortOrder: 10 },
  { slug: "battle-champion", title: "Battle Champion", description: "Voita 10 case battlea.", icon: "swords", category: "BATTLES", target: 10, xpReward: 450, coinReward: 4_000, sortOrder: 11 },
  { slug: "grinder", title: "Mob Slayer", description: "Kaada 500 mobia Mob Grinderissä.", icon: "skull", category: "GAMES", target: 500, xpReward: 400, coinReward: 3_000, sortOrder: 12 },
  { slug: "last-stand", title: "Last Stand", description: "Selvitä Last Hope kokonaan Stage 5:een asti.", icon: "shrine", category: "GAMES", target: 1, xpReward: 500, coinReward: 5_000, sortOrder: 13 },
  { slug: "og-player", title: "OG Player", description: "Kerää 14 päivän Daily Case -putki.", icon: "flame", category: "COMMUNITY", target: 14, xpReward: 400, coinReward: 3_500, sortOrder: 14 },
  { slug: "top-100", title: "Top 100", description: "Yllä sadan rikkaimman joukkoon.", icon: "banner", category: "RANKING", target: 1, xpReward: 250, coinReward: 1_500, sortOrder: 15 },
  { slug: "top-10", title: "Top 10", description: "Yllä kymmenen rikkaimman joukkoon.", icon: "laurel", category: "RANKING", target: 1, xpReward: 600, coinReward: 6_000, sortOrder: 16 },
  { slug: "number-one", title: "#1 Player", description: "Nouse Pekonin rikkaimmaksi pelaajaksi.", icon: "crownStar", category: "RANKING", target: 1, xpReward: 1_200, coinReward: 15_000, sortOrder: 17 },
];

/**
 * Expands a case spec into its final item table, solving the filler weight so
 * the expected value lands on the target return.
 */
export function buildCaseItems(spec: CaseSpec): ItemSpec[] {
  if (spec.kind === "DAILY") return [...spec.items];
  const target = spec.price * (spec.targetReturn ?? 0.95);
  const fillerWeight = solveFillerWeight(spec.items, spec.filler, target);
  return [{ ...spec.filler, weight: fillerWeight }, ...spec.items];
}

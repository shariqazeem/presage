// Presage settings for ST Quant, replacing okxtradingagent/config.json.
//
// Taken from the config ST Quant was running live in August 2026, with one
// deliberate change: hold mode is OFF. In hold mode the target was the "pump
// tip" up to +30% away and the position trailed on, which suits a trader
// managing a position but not a public signal with a fixed target that gets
// resolved by price. A published call needs the first level that actually
// rejects price, so its record is honest about what a subscriber could take.
export const SETTINGS = {
  holdMode: true,
  minArmConviction: 4,
  minRR: 1.75,
  maxMfiAbsoluteAtArm: 25,
  marketEntryProximityPct: 0.003,
  minStopPct: 0.06,
  maxDistToPatternSupport: 0.05,
  mfiBottomPercentile: 0.15,
  structureOverrideEnabled: false,
  maxChaseAfterTestPct: 0.05,
};

// How long a published setup lives. A limit entry that has not filled in a day
// is stale, and a filled setup that has reached neither stop nor target in two
// days is closed at market and marked flat.
export const SIGNAL = {
  fillWindowSec: 24 * 3600,
  maxHoldSec: 48 * 3600,
  revealGraceSec: 2 * 3600,
  cooldownSec: 3 * 3600,
};

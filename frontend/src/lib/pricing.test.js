import { TIERS, FEATURES, quote, priceLabel, limitState, tierFor, tierById, comparison } from "./pricing";

test("price and limits only grow from tier to tier", () => {
  for (let i = 1; i < TIERS.length; i++) {
    expect(TIERS[i].monthly).toBeGreaterThan(TIERS[i - 1].monthly);
    const a = TIERS[i - 1].limits, b = TIERS[i].limits;
    ["resources", "founders"].forEach((k) => { if (b[k] != null) expect(b[k]).toBeGreaterThan(a[k]); });
  }
});
test("each tier keeps every feature of the tier below it", () => {
  for (let i = 1; i < TIERS.length; i++) {
    Object.keys(TIERS[i - 1].features).forEach((f) => expect(TIERS[i].features[f]).toBeTruthy());
  }
});
test("every feature id used by a tier exists in FEATURES", () => {
  const ids = FEATURES.map((f) => f.id);
  TIERS.forEach((t) => Object.keys(t.features).forEach((f) => expect(ids).toContain(f)));
});
test("quote: flat monthly price, annual bills 10 months, per-resource cost", () => {
  const q = quote({ resources: 60, founders: 40 });
  expect(q.tier.id).toBe("community");
  expect(q.monthly).toBe(249);
  expect(q.annual).toBe(2490);
  expect(Math.round(q.perResource * 100) / 100).toBe(4.15);
  expect(quote({ resources: 10 }).monthly).toBe(0);
  expect(quote({ resources: 9999, founders: 99999 }).custom).toBe(true);
});
test("labels", () => {
  expect(priceLabel(tierById("starter"))).toBe("Free");
  expect(priceLabel(tierById("hub"))).toBe("$749/mo");
  expect(priceLabel(tierById("network"))).toBe("From $1,999/mo");
});
test("limit states: ok, warn at 90%, over inside grace, upgrade past grace, unlimited", () => {
  expect(limitState(20, 25).state).toBe("ok");
  expect(limitState(23, 25).state).toBe("warn");
  expect(limitState(26, 25).state).toBe("over");
  expect(limitState(30, 25).state).toBe("upgrade");
  expect(limitState(99999, null).state).toBe("ok");
});
test("tierFor picks the smallest tier that fits resources and founders", () => {
  expect(tierFor({ resources: 20, founders: 10 }).id).toBe("starter");
  expect(tierFor({ resources: 27, founders: 10 }).id).toBe("starter");     // 10% grace
  expect(tierFor({ resources: 60, founders: 10 }).id).toBe("community");
  expect(tierFor({ resources: 60, founders: 400 }).id).toBe("hub");        // founders push it up
  expect(tierFor({ resources: 300, founders: 10 }).id).toBe("hub");        // resources push it up
  expect(tierFor({ resources: 5000 }).id).toBe("network");
});
test("comparison table has one value per tier on every row", () => {
  comparison().forEach((r) => expect(r.values).toHaveLength(TIERS.length));
});

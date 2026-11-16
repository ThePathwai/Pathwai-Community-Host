import { TIERS, annualPrice, priceLabel, limitState, tierFor, tierById } from "./pricing";

test("tiers are ordered by price and limits only grow", () => {
  for (let i = 1; i < TIERS.length; i++) {
    expect(TIERS[i].monthly).toBeGreaterThan(TIERS[i - 1].monthly);
    const a = TIERS[i - 1].limits, b = TIERS[i].limits;
    ["members", "resources", "admins"].forEach((k) => { if (b[k] != null) expect(b[k]).toBeGreaterThanOrEqual(a[k]); });
  }
});
test("annual billing is 10 months", () => {
  expect(annualPrice(tierById("community"))).toBe(1790);
  expect(annualPrice(tierById("hub"))).toBe(4990);
  expect(annualPrice(tierById("starter"))).toBe(0);
});
test("labels", () => {
  expect(priceLabel(tierById("starter"))).toBe("Free");
  expect(priceLabel(tierById("hub"))).toBe("$499/mo");
  expect(priceLabel(tierById("hub"), "annual")).toBe("$4,990/yr");
  expect(priceLabel(tierById("network"))).toBe("From $1,500/mo");
});
test("limit states: ok, warn at 90%, over inside grace, upgrade past grace, unlimited", () => {
  expect(limitState(40, 50).state).toBe("ok");
  expect(limitState(45, 50).state).toBe("warn");
  expect(limitState(52, 50).state).toBe("over");
  expect(limitState(56, 50).state).toBe("upgrade");
  expect(limitState(99999, null).state).toBe("ok");
});
test("tierFor picks the smallest tier that fits members and resources", () => {
  expect(tierFor({ members: 30, resources: 10 }).id).toBe("starter");
  expect(tierFor({ members: 54, resources: 10 }).id).toBe("starter");      // 10% grace
  expect(tierFor({ members: 60, resources: 10 }).id).toBe("community");
  expect(tierFor({ members: 100, resources: 400 }).id).toBe("hub");        // resources push it up
  expect(tierFor({ members: 5000, resources: 10 }).id).toBe("network");
  expect(tierFor({ members: 100, resources: 10, admins: 4 }).id).toBe("hub");
});

import { pickMove, whyFirst, thenPicks, prepFor, prepHeading, daysLeft } from "./nextMove";

const TODAY = "2026-11-26";
const res = (id, o = {}) => ({ id, name: id, status: "open", deadline: { kind: "none_published" }, checks: [], ...o });
const fixed = (date) => ({ kind: "fixed", date });
const step = (need, resources, more = 0) => ({ need, label: need, title: "To get " + need, resources, more });

test("with nothing urgent, the first thing you asked for comes first and says so", () => {
  const steps = [step("funding", [res("a"), res("b")]), step("mentors", [res("c")])];
  const m = pickMove(steps, TODAY);
  expect(m.r.id).toBe("a");
  expect(m.reason).toBe("first");
  const why = whyFirst(m, steps);
  expect(why[0]).toMatch(/first thing you asked for/);
  expect(why).toHaveLength(1);
});

test("a close deadline in a later need beats the first need, and says why", () => {
  const steps = [step("funding", [res("a", { deadline: fixed("2027-03-01") })]), step("mentors", [res("c", { deadline: fixed("2026-12-05") })])];
  const m = pickMove(steps, TODAY);
  expect(m.r.id).toBe("c");
  expect(m.reason).toBe("urgent");
  expect(m.days).toBe(9);
  const why = whyFirst(m, steps).join(" ");
  expect(why).toMatch(/closes in 9 days/);
  expect(why).toMatch(/listed funding first/);
});

test("the soonest of several close deadlines wins", () => {
  const steps = [step("funding", [res("a", { deadline: fixed("2026-12-10") }), res("b", { deadline: fixed("2026-12-01") })])];
  expect(pickMove(steps, TODAY).r.id).toBe("b");
});

test("something you are already doing beats a far deadline but not a close one", () => {
  const far = [step("funding", [res("a", { deadline: fixed("2027-06-01") })]), step("mentors", [res("c", { mine: "in" })])];
  expect(pickMove(far, TODAY).r.id).toBe("c");
  expect(pickMove(far, TODAY).reason).toBe("going");
  const close = [step("funding", [res("a", { deadline: fixed("2026-12-02") })]), step("mentors", [res("c", { mine: "in" })])];
  expect(pickMove(close, TODAY).r.id).toBe("a");
});

test("a closed or past-deadline resource is never the urgent pick", () => {
  const steps = [step("funding", [res("a", { status: "closed", deadline: fixed("2026-12-02") }), res("b")])];
  expect(daysLeft(steps[0].resources[0], TODAY)).toBeNull();
  expect(pickMove(steps, TODAY).r.id).toBe("b");
  expect(daysLeft(res("p", { deadline: fixed("2026-11-01") }), TODAY)).toBeNull();
});

test("when the first need only has closed resources, an open one from the next need is chosen", () => {
  const steps = [step("funding", [res("a", { status: "closed" })]), step("mentors", [res("c")])];
  expect(pickMove(steps, TODAY).r.id).toBe("c");
});

test("no resources means no move", () => {
  expect(pickMove([step("funding", [])], TODAY)).toBeNull();
  expect(pickMove([], TODAY)).toBeNull();
});

test("the other needs show their next resource with a timing note", () => {
  const steps = [step("funding", [res("a", { deadline: fixed("2026-12-02") })]), step("mentors", [res("c", { deadline: fixed("2027-03-01") })]), step("space", [res("d", { status: "rolling" })])];
  const m = pickMove(steps, TODAY);
  const then = thenPicks(steps, m, TODAY);
  expect(then.map((t) => t.r.id)).toEqual(["c", "d"]);
  expect(then[0].note).toMatch(/so you have time/);
  expect(then[1].note).toMatch(/rolling/);
});

test("before you apply: profile gaps first, a short list, and the true total", () => {
  const r = res("a", {
    verified: "unconfirmed",
    checks: [
      { key: "apply", state: "yes", items: [{ state: "yes", text: "Open to founders in ON." }, { state: "maybe", text: "Needs at least 3 employees; add your team size to check", ask: "employees" }], unchecked: ["Full-time founder", "Full-time founder", "Check the site for intake; its footer is dated 2021", "Working prototype"] },
      { key: "timing", state: "maybe", text: "No deadline" },
    ],
  });
  const prep = prepFor(r);
  expect(prep.total).toBe(5);                         // employees gap, 2 requirements, no deadline, unconfirmed (the catalog note and the repeat are dropped)
  expect(prep.items).toHaveLength(3);
  expect(prep.items[0]).toMatchObject({ kind: "profile", ask: "employees" });
  expect(prep.items.map((p) => p.text)).toContain("Confirm: Full-time founder");
  expect(prep.items.some((p) => /footer is dated/.test(p.text))).toBe(false);
  expect(prepHeading(prep.total)).toBe("5 things to check before you apply");
});

test("nothing to check says ready, and a resource with no checks is ready", () => {
  expect(prepFor(res("a", { checks: [{ key: "apply", state: "yes", items: [{ state: "yes", text: "ok" }] }, { key: "timing", state: "yes" }] }))).toEqual({ total: 0, items: [] });
  expect(prepFor(res("b")).total).toBe(0);
  expect(prepHeading(0)).toMatch(/^Ready to apply/);
  expect(prepHeading(1)).toBe("1 thing to check before you apply");
});

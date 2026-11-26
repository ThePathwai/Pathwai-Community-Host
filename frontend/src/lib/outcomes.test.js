import fs from "fs";
import path from "path";
import { FUNDING_LABEL, MAX_OUTCOMES, OUTCOME_LABEL, updateOutcome } from "./navigator";

// The practice copy's record must behave like the server's (backend/navigator.py update_outcome).
const TODAY = "2026-11-26";
const py = () => fs.readFileSync(path.resolve(process.cwd(), "../backend/navigator.py"), "utf8");
const pairs = (name) => Object.fromEntries([...py().match(new RegExp(`${name} = \\{(.*?)\\}\\n`, "s"))[1].matchAll(/"([a-z0-9_]+)": "([^"]+)"/g)].map((m) => [m[1], m[2]]));

describe("how it went (updateOutcome)", () => {
  test("adds, updates (keeping the first date) and removes", () => {
    const a = updateOutcome([], { id: "irap", name: "NRC IRAP", type: "grant", status: "applied" }, TODAY);
    expect(a).toEqual([{ id: "irap", name: "NRC IRAP", org: "", type: "grant", status: "applied", funding: "", at: TODAY, updated_at: TODAY }]);
    const b = updateOutcome(a, { id: "irap", name: "NRC IRAP", status: "accepted", funding: "25k_100k" }, "2026-12-20");
    expect(b.length).toBe(1);
    expect(b[0].at).toBe(TODAY);
    expect(b[0].updated_at).toBe("2026-12-20");
    expect(b[0].funding).toBe("25k_100k");
    expect(updateOutcome(b, { id: "irap", status: "none" }, TODAY)).toEqual([]);
  });

  test("funding is kept only when the founder got in", () => {
    expect(updateOutcome([], { id: "x", name: "Program X", status: "withdrew", funding: "over_500k" }, TODAY)[0].funding).toBe("");
    expect(updateOutcome([], { id: "x", name: "Program X", status: "completed", funding: "under_25k" }, TODAY)[0].funding).toBe("under_25k");
  });

  test("bad input is refused with a readable message", () => {
    const fails = (body, word) => { let msg = ""; try { updateOutcome([], body, TODAY); } catch (e) { msg = e.message; } expect(msg).toContain(word); };
    fails({ id: "x", name: "Program X", status: "won" }, "Choose");
    fails({ id: "", name: "Program X", status: "applied" }, "Which program");
    fails({ id: "x", name: "P", status: "applied" }, "name");
    fails({ id: "x", name: "Program X", status: "accepted", funding: "a lot" }, "funding");
    const many = Array.from({ length: MAX_OUTCOMES }, (_, i) => ({ id: `p${i}`, name: `Program ${i}`, status: "applied" }));
    fails2(many);
    function fails2(items) { let msg = ""; try { updateOutcome(items, { id: "one-more", name: "One more", status: "applied" }, TODAY); } catch (e) { msg = e.message; } expect(msg).toContain("up to"); }
  });

  test("the labels match the server's", () => {
    expect(OUTCOME_LABEL).toEqual(pairs("OUTCOME_LABEL"));
    expect(FUNDING_LABEL).toEqual(pairs("FUNDING_LABEL"));
  });
});

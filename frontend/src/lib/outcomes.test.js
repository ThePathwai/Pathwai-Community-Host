import fs from "fs";
import path from "path";
import { MAX_OUTCOMES, OUTCOME_LABEL, updateOutcome } from "./navigator";

// The practice copy's record must behave like the server's (backend/navigator.py update_outcome).
const TODAY = "2026-11-26";
const py = () => fs.readFileSync(path.resolve(process.cwd(), "../backend/navigator.py"), "utf8");
const pairs = (name) => Object.fromEntries([...py().match(new RegExp(`${name} = \\{(.*?)\\}\\n`, "s"))[1].matchAll(/"([a-z0-9_]+)": "([^"]+)"/g)].map((m) => [m[1], m[2]]));

describe("applications (updateOutcome)", () => {
  test("marks a program as applied (keeping the first date) and removes the mark", () => {
    const a = updateOutcome([], { id: "irap", name: "NRC IRAP", type: "grant", status: "applied" }, TODAY);
    expect(a).toEqual([{ id: "irap", name: "NRC IRAP", org: "", type: "grant", status: "applied", at: TODAY, updated_at: TODAY }]);
    const b = updateOutcome(a, { id: "irap", name: "NRC IRAP", status: "applied" }, "2026-12-20");
    expect(b.length).toBe(1);
    expect(b[0].at).toBe(TODAY);
    expect(b[0].updated_at).toBe("2026-12-20");
    expect(updateOutcome(b, { id: "irap", status: "none" }, TODAY)).toEqual([]);
  });

  test("only applied or none is accepted, so how it went is never stored", () => {
    for (const status of ["accepted", "not_selected", "withdrew", "completed", "won"]) {
      expect(() => updateOutcome([], { id: "x", name: "Program X", status }, TODAY)).toThrow("Choose");
    }
    expect(updateOutcome([], { id: "x", name: "Program X", status: "applied", funding: "over_500k" }, TODAY)[0].funding).toBeUndefined();
  });

  test("bad input is refused with a readable message", () => {
    expect(() => updateOutcome([], { id: "", name: "Program X", status: "applied" }, TODAY)).toThrow("Which program");
    expect(() => updateOutcome([], { id: "x", name: "P", status: "applied" }, TODAY)).toThrow("name");
    const many = Array.from({ length: MAX_OUTCOMES }, (_, i) => ({ id: `p${i}`, name: `Program ${i}`, status: "applied" }));
    expect(() => updateOutcome(many, { id: "one-more", name: "One more", status: "applied" }, TODAY)).toThrow("up to");
  });

  test("the label matches the server's", () => {
    expect(OUTCOME_LABEL).toEqual(pairs("OUTCOME_LABEL"));
  });
});

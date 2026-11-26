import fs from "fs";
import path from "path";
import { sampleMetrics, metricsTable, metricsCsv } from "./sampleReport";

// The practice copy's export must match the real one (backend/impact.py): same columns, same measures in the same order,
// formulas defused, and nothing that looks like a person.
const impactPy = () => fs.readFileSync(path.resolve(process.cwd(), "../backend/impact.py"), "utf8");
const table = () => metricsTable(sampleMetrics({ members: 40, seed: "demo", days: 90, eventTitles: ['=HYPERLINK("http://x.example")', "Mixer"] }), "Demo Hub");

describe("metrics export (practice copy)", () => {
  test("the CSV has the server's columns, a byte-order mark and no formulas or emails", () => {
    const csv = metricsCsv(table());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const cols = impactPy().match(/CSV_COLUMNS = \[(.*?)\]/s)[1].replace(/["\s]/g, "");
    expect(csv.slice(1).split("\r\n")[0]).toBe(cols);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.includes("@")).toBe(false);
  });

  test("it measures the same things, in the same order, as the server", () => {
    const py = [...impactPy().matchAll(/^\s+\("([^"]+)", f?"([^"]+)", "([a-z_]+)", "([^"]+)"\),$/gm)].map((x) => [x[1], x[2].replace("{ACTIVE_DAYS}", "30"), x[3], x[4]]);
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/sampleReport.js"), "utf8");
    const block = src.slice(src.indexOf("const EXPORT_ROWS"), src.indexOf("const SAMPLE_NEEDS"));
    const js = [...block.matchAll(/\["([^"]+)", "([^"]+)", "([a-z_]+)", "([^"]+)"\]/g)].map((x) => [x[1], x[2], x[3], x[4]]);
    expect(py.length).toBe(24);
    expect(js).toEqual(py);
  });

  test("small groups show as <5 and the table says it is sample data", () => {
    const t = table();
    expect(t.sample).toBe(true);
    const needs = t.rows.filter((r) => r.section === "What members said they need").map((r) => r.value);
    expect(needs.every((v) => (typeof v === "number" ? v >= 5 : v === "<5"))).toBe(true);
  });
});

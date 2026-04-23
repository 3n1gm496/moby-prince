import { describe, expect, it } from "vitest";
import {
  buildPdfUrl,
  parsePageIdentifier,
  parseTimeIdentifier,
  resolveSourceUri,
} from "./sourceUtils";

describe("sourceUtils", () => {
  it("resolves gs:// URIs through the storage API", () => {
    expect(resolveSourceUri("gs://bucket/path/to/file.pdf")).toBe(
      "/api/storage/file?name=path%2Fto%2Ffile.pdf",
    );
  });

  it("extracts page information from pageReference strings", () => {
    expect(parsePageIdentifier({ pageReference: "p. 47" })).toBe("47");
    expect(parsePageIdentifier({ pageIdentifier: 12 })).toBe("12");
  });

  it("parses time identifiers in both seconds and mm:ss formats", () => {
    expect(parseTimeIdentifier({ timeIdentifier: "95s" })).toBe(95);
    expect(parseTimeIdentifier({ timeIdentifier: "02:15" })).toBe(135);
  });

  it("builds anchored PDF URLs when a page is available", () => {
    expect(buildPdfUrl("gs://bucket/path/report.pdf", "22")).toBe(
      "/api/storage/file?name=path%2Freport.pdf#page=22",
    );
  });
});

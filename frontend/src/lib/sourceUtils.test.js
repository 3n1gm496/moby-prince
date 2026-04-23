import { describe, expect, it } from "vitest";
import {
  dateAccuracyLabel,
  buildPdfUrl,
  getPrimaryAnchor,
  parsePageIdentifier,
  parseTimeIdentifier,
  resolveSourceUri,
  sourceLocationLabel,
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
    expect(parsePageIdentifier({ anchors: [{ pageNumber: 81 }] })).toBe("81");
  });

  it("parses time identifiers in both seconds and mm:ss formats", () => {
    expect(parseTimeIdentifier({ timeIdentifier: "95s" })).toBe(95);
    expect(parseTimeIdentifier({ timeIdentifier: "02:15" })).toBe(135);
    expect(parseTimeIdentifier({ anchors: [{ timeStartSeconds: 42 }] })).toBe(42);
  });

  it("builds anchored PDF URLs when a page is available", () => {
    expect(buildPdfUrl("gs://bucket/path/report.pdf", "22")).toBe(
      "/api/storage/file?name=path%2Freport.pdf#page=22",
    );
  });

  it("returns the first structured anchor as primary source anchor", () => {
    expect(getPrimaryAnchor({ anchors: [{ id: "a1" }, { id: "a2" }] })).toEqual({ id: "a1" });
  });

  it("renders location labels from structured anchors before fallback strings", () => {
    expect(sourceLocationLabel({ anchors: [{ pageNumber: 12 }] })).toBe("p. 12");
    expect(sourceLocationLabel({ anchors: [{ timeStartSeconds: 95 }] })).toBe("01:35");
    expect(sourceLocationLabel({ pageReference: "p. 47" })).toBe("p. 47");
  });

  it("maps date accuracy enums to human labels", () => {
    expect(dateAccuracyLabel("exact")).toBe("Data esatta");
    expect(dateAccuracyLabel("month")).toBe("Mese noto");
    expect(dateAccuracyLabel("inferred")).toBe("Data inferita");
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_CHUNK_BYTES,
  MAX_FILE_BYTES,
  SupportClient,
  chunkRanges,
  parseScope,
  planChunks,
  sanitizeFileName,
} from "@/lib/azure-support";
import { SUB, mockArm } from "./mock-arm";

describe("planChunks", () => {
  it("uses one chunk up to 2.5 MB", () => {
    expect(planChunks(41423)).toEqual({ fileSize: 41423, chunkSize: 41423, numberOfChunks: 1 });
    expect(planChunks(MAX_CHUNK_BYTES).numberOfChunks).toBe(1);
  });

  it("uses two chunks above 2.5 MB, never more", () => {
    expect(planChunks(MAX_CHUNK_BYTES + 1)).toEqual({
      fileSize: MAX_CHUNK_BYTES + 1,
      chunkSize: MAX_CHUNK_BYTES,
      numberOfChunks: 2,
    });
    expect(planChunks(MAX_FILE_BYTES).numberOfChunks).toBe(2);
  });

  it("rejects empty and oversized files", () => {
    expect(() => planChunks(0)).toThrow(/empty/);
    expect(() => planChunks(MAX_FILE_BYTES + 1)).toThrow(/at most/);
  });

  it("splits into contiguous byte ranges covering the whole file", () => {
    expect(chunkRanges(planChunks(10))).toEqual([[0, 10]]);
    expect(chunkRanges(planChunks(MAX_CHUNK_BYTES + 5))).toEqual([
      [0, MAX_CHUNK_BYTES],
      [MAX_CHUNK_BYTES, MAX_CHUNK_BYTES + 5],
    ]);
  });
});

describe("sanitizeFileName", () => {
  it("keeps safe names unchanged", () => {
    expect(sanitizeFileName("network trace_01.har")).toBe("network trace_01.har");
  });

  it("drops directories and replaces unsafe characters", () => {
    expect(sanitizeFileName("C:\\logs\\boot#1?.log")).toBe("boot_1_.log");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("relatório.txt")).toBe("relat_rio.txt");
  });

  it("never returns an empty or hidden name", () => {
    expect(sanitizeFileName("...")).toBe("attachment");
    expect(sanitizeFileName(".env")).toBe("env");
  });

  it("caps length but keeps the extension", () => {
    const name = sanitizeFileName(`${"a".repeat(150)}.json`);
    expect(name).toHaveLength(100);
    expect(name.endsWith(".json")).toBe(true);
  });
});

describe("SupportClient files", () => {
  const sub = parseScope(SUB);

  it("creates the file then uploads base64 chunks in order", async () => {
    const data = new Uint8Array(MAX_CHUNK_BYTES + 3).fill(65); // "A"
    const arm = mockArm(
      { status: 201, body: { name: "big.log", properties: {} } },
      { status: 204 },
      { status: 204 },
    );
    await new SupportClient(arm.options).uploadFile(sub, "2300000000000358", "big.log", data);

    const base = `https://management.azure.com/subscriptions/${SUB}/providers/Microsoft.Support/fileWorkspaces/2300000000000358/files/big.log`;
    expect(arm.requests.map((r) => `${r.method} ${r.url.split("?")[0]}`)).toEqual([
      `PUT ${base}`,
      `POST ${base}/upload`,
      `POST ${base}/upload`,
    ]);
    expect(arm.requests[0].body).toEqual({
      properties: { fileSize: MAX_CHUNK_BYTES + 3, chunkSize: MAX_CHUNK_BYTES, numberOfChunks: 2 },
    });
    const [first, second] = arm.requests.slice(1).map((r) => r.body as { chunkIndex: number; content: string });
    expect(first.chunkIndex).toBe(0);
    expect(Buffer.from(first.content, "base64")).toHaveLength(MAX_CHUNK_BYTES);
    expect(second).toEqual({ chunkIndex: 1, content: Buffer.from("AAA").toString("base64") });
  });

  it("plans the same requests without sending or embedding content", () => {
    const arm = mockArm();
    const plans = new SupportClient(arm.options).planUploadFile(parseScope("tenant"), "ws1", "a b.txt", 12);
    expect(plans.map((p) => p.method)).toEqual(["PUT", "POST"]);
    expect(plans[0].url).toBe(
      "https://management.azure.com/providers/Microsoft.Support/fileWorkspaces/ws1/files/a%20b.txt?api-version=2024-04-01",
    );
    expect(plans[1].body).toEqual({ chunkIndex: 0, content: "<base64 of bytes 0–11 (12 bytes)>" });
    expect(arm.requests).toHaveLength(0);
  });

  it("lists files in a workspace across pages", async () => {
    const f = (n: string) => ({ id: n, name: n, type: "Microsoft.Support/files", properties: {} });
    const arm = mockArm(
      { body: { value: [f("a")], nextLink: "https://management.azure.com/p2" } },
      { body: { value: [f("b")] } },
    );
    const files = await new SupportClient(arm.options).listFiles(sub, "2300000000000358");
    expect(files.map((x) => x.name)).toEqual(["a", "b"]);
  });
});

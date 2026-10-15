import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCompatibility } from "../../src/modules/plugins/compatibility.js";
test("Cloudflare rejects host capabilities, unknown features, absent bindings and insecure endpoints", () => {
  const valid = {
    id: "sample.collector",
    version: "1.0.0",
    targets: ["node", "cloudflare"],
    runtime: "remote-https",
    capabilities: ["https"],
    endpoint: "https://example.org/plugin",
  };
  assert.deepEqual(checkCompatibility(valid, "cloudflare"), []);
  assert(
    checkCompatibility(
      { ...valid, capabilities: ["filesystem"] },
      "cloudflare",
    ).includes("unsupported_capability:filesystem"),
  );
  assert(
    checkCompatibility({ ...valid, capabilities: ["filesystem"] }, "node")
      .length === 0,
  );
  assert(
    checkCompatibility(
      { ...valid, runtime: "node-process" },
      "cloudflare",
    ).includes("node_process_unavailable"),
  );
  assert(
    checkCompatibility(
      { ...valid, required_bindings: ["MEDIA"] },
      "cloudflare",
    ).includes("missing_binding:MEDIA"),
  );
  assert.deepEqual(
    checkCompatibility({ ...valid, capabilities: ["unknown"] }, "cloudflare"),
    ["invalid_manifest"],
  );
  assert(
    checkCompatibility(
      { ...valid, endpoint: "http://localhost/plugin" },
      "cloudflare",
    ).includes("invalid_endpoint"),
  );
});

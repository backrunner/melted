// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile } from "node:fs/promises";
import { startGateway } from "../agent-gateway/service.js";
try {
  const file = process.argv[2];
  if (!file) throw new Error();
  const gateway = await startGateway(JSON.parse(await readFile(file, "utf8")));
  console.error("Melted ACP gateway ready");
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void gateway.close().then(() => process.exit(0));
    });
} catch {
  // Configuration exceptions may include secrets; only a stable diagnostic leaves startup.
  console.error(
    "ACP gateway startup failed; check configuration, runtime version and secret environment",
  );
  process.exitCode = 1;
}

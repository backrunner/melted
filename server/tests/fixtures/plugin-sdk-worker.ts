// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { ExampleCollector } from "../../templates/collector/plugin.js";
import { PluginRegistry } from "../../src/modules/plugins/registry.js";
import { PluginService } from "../../src/modules/plugins/service.js";
import { newSource } from "../../src/modules/sources/lifecycle.js";
import { validateResult } from "../../src/modules/ingest/result.js";
export default {
  async fetch() {
    const plugin = new ExampleCollector(async () =>
      Response.json({
        items: [
          { id: "one", title: "Culture", text: "A note" },
          { invalid: true },
        ],
      }),
    );
    const registry = new PluginRegistry([plugin], {
      plugins: [{ enabled: true, manifest: plugin.manifest }],
    });
    const config = {
      [plugin.descriptor.id]: {
        base_url: "https://feeds.example.org",
        allowed_topics: ["culture"],
      },
    };
    const source = newSource(
      new PluginService(registry, config).create({
        plugin: plugin.descriptor.id,
        config_version: 1,
        name: "Notes",
        configuration: { topic: "culture" },
      }),
      Date.now(),
    );
    return Response.json(
      await validateResult(
        await registry.resolve(source.plugin, config).poll(source),
      ),
    );
  },
};

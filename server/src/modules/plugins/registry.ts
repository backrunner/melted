// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { Problem } from "../../shared/problem.js";
import { pluginSettingsSchema, type Manifest } from "./compatibility.js";
import { descriptorSchema, sourceForm, validateSettings } from "./dsl.js";
import type { CollectorPlugin, ConfiguredCollector } from "./definition.js";

export class PluginRegistry {
  private readonly installed = new Map<string, CollectorPlugin>();
  private readonly enabled = new Set<string>();
  constructor(plugins: CollectorPlugin[], settings: unknown) {
    for (const plugin of plugins) {
      const descriptor = descriptorSchema.parse(plugin.descriptor);
      if (
        this.installed.has(descriptor.id) ||
        descriptor.id !== plugin.manifest.id ||
        descriptor.version !== plugin.manifest.version
      )
        throw new Error("Invalid installed plugin identity");
      for (const field of descriptor.form.fields)
        if (field.default !== undefined)
          validateSettings({ fields: [field] }, {});
      this.installed.set(descriptor.id, plugin);
    }
    for (const entry of pluginSettingsSchema.parse(settings).plugins) {
      if (!entry.enabled) continue;
      if (!this.matches(entry.manifest))
        throw new Error("Unregistered plugin implementation");
      this.enabled.add(entry.manifest.id);
    }
  }
  matches(manifest: Manifest): boolean {
    const installed = this.installed.get(manifest.id)?.manifest;
    return Boolean(
      installed &&
      installed.version === manifest.version &&
      installed.runtime === manifest.runtime &&
      JSON.stringify([...installed.targets].sort()) ===
        JSON.stringify([...manifest.targets].sort()) &&
      JSON.stringify([...installed.capabilities].sort()) ===
        JSON.stringify([...manifest.capabilities].sort()) &&
      JSON.stringify([...installed.required_bindings].sort()) ===
        JSON.stringify([...manifest.required_bindings].sort()) &&
      installed.endpoint === manifest.endpoint,
    );
  }
  resolve(
    id: string,
    configuration: Record<string, unknown>,
  ): ConfiguredCollector {
    const plugin = this.installed.get(id);
    if (!plugin || !this.enabled.has(id))
      throw new Problem(503, "plugin_unavailable");
    if (configuration[id] === undefined)
      throw new Problem(503, "collector_unconfigured");
    try {
      const configured = plugin.configure(configuration[id]);
      const descriptor = descriptorSchema.parse(configured.descriptor);
      if (
        descriptor.id !== plugin.descriptor.id ||
        descriptor.version !== plugin.descriptor.version ||
        descriptor.config_version !== plugin.descriptor.config_version ||
        !Array.isArray(configured.destinations) ||
        !configured.destinations.length ||
        configured.destinations.length > 50
      )
        throw new Error("Invalid configured plugin descriptor");
      const destinations = configured.destinations.map((destination) => {
        const origin = new URL(destination.origin);
        if (
          destination.id !== descriptor.id ||
          destination.purpose !== "public_feed_collection" ||
          !["http:", "https:"].includes(origin.protocol) ||
          origin.username ||
          origin.password ||
          origin.search ||
          origin.hash ||
          origin.pathname !== "/" ||
          !Array.isArray(destination.data_categories) ||
          destination.data_categories.length > 40 ||
          destination.data_categories.some(
            (value) =>
              typeof value !== "string" ||
              !/^[a-z][a-z0-9_]{0,99}$/.test(value),
          )
        )
          throw new Error("Invalid configured plugin destination");
        return { ...destination, origin: origin.origin };
      });
      if (
        new Set(destinations.map((d) => d.origin)).size !== destinations.length
      )
        throw new Error("Duplicate plugin destination");
      for (const field of descriptor.form.fields)
        if (field.default !== undefined)
          validateSettings({ fields: [field] }, {});
      return {
        ...configured,
        descriptor,
        destinations,
      };
    } catch {
      throw new Problem(503, "plugin_configuration_invalid");
    }
  }
  catalog(configuration: Record<string, unknown>) {
    return {
      dsl_version: 1,
      source_form: sourceForm,
      plugins: [...this.installed.values()].map((plugin) => {
        try {
          return {
            ...this.resolve(plugin.descriptor.id, configuration).descriptor,
            available: true,
            unavailable_reason: null,
          };
        } catch (error) {
          return {
            ...plugin.descriptor,
            available: false,
            unavailable_reason:
              error instanceof Problem ? error.code : "plugin_unavailable",
          };
        }
      }),
    };
  }
  configured(configuration: Record<string, unknown>) {
    return [...this.enabled].flatMap((id) => {
      try {
        return [this.resolve(id, configuration)];
      } catch {
        return [];
      }
    });
  }
  deploymentErrors(
    configuration: Record<string, unknown>,
    target: "node" | "cloudflare",
  ) {
    return [...this.enabled].flatMap((id) => {
      if (configuration[id] === undefined) return [];
      try {
        return this.installed
          .get(id)!
          .deploymentErrors(configuration[id], target)
          .map((message) => `${id}: ${message}`);
      } catch {
        return [`${id}: invalid_operator_configuration`];
      }
    });
  }
}

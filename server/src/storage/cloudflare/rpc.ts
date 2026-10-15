// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { Problem } from "../../shared/problem.js";

export async function call<T>(
  namespace: DurableObjectNamespace,
  name: string,
  operation: string,
  payload: unknown,
): Promise<T> {
  const response = await namespace
    .get(namespace.idFromName(name))
    .fetch("https://internal.melted/invoke", {
      method: "POST",
      body: JSON.stringify({ name, operation, payload }),
    });
  if (!response.ok) {
    const problem = (await response.json()) as { code: string };
    throw new Problem(response.status as Problem["status"], problem.code);
  }
  return (await response.json()) as T;
}

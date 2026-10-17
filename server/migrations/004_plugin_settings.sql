-- SPDX-FileCopyrightText: 2026 Melted contributors
-- SPDX-License-Identifier: GPL-3.0-or-later
-- Preserve source identities, revisions, generation and in-flight run fences.
UPDATE sources SET document = (document - 'route') || jsonb_build_object(
  'config_version', 1, 'configuration', jsonb_build_object('route', document->'route'))
WHERE document->>'plugin' = 'rsshub' AND NOT document ? 'configuration';
UPDATE source_requests SET response = (response - 'route') || jsonb_build_object(
  'config_version', 1, 'configuration', jsonb_build_object('route', response->'route'))
WHERE operation = 'create' AND response->>'plugin' = 'rsshub' AND NOT response ? 'configuration';

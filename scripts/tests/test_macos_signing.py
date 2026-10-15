# SPDX-FileCopyrightText: 2026 Melted contributors
# SPDX-License-Identifier: GPL-3.0-or-later
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('signing', Path(__file__).resolve().parents[1] / 'macos-signing.py')
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)


class SigningTests(unittest.TestCase):
    dev = {'identity': 'A' * 40, 'name': 'Apple Development: Example'}
    other = {'identity': 'B' * 40, 'name': 'Apple Development: Another'}
    distribution = {'identity': 'C' * 40, 'name': 'Developer ID Application: Example'}

    def test_first_build_picks_only_development_identity(self):
        self.assertEqual(signing.resolve([self.dev, self.distribution]), self.dev)

    def test_pin_survives_additional_certificates(self):
        self.assertEqual(signing.resolve([self.other, self.dev], self.dev), self.dev)

    def test_missing_pin_never_silently_changes_identity(self):
        with self.assertRaises(ValueError):
            signing.resolve([self.other], self.dev)

    def test_ambiguous_or_missing_identity_requires_configuration(self):
        for identities in ([], [self.dev, self.other], [self.distribution]):
            with self.assertRaises(ValueError):
                signing.resolve(identities)

    def test_explicit_certificate_change(self):
        self.assertEqual(signing.resolve([self.dev, self.other], self.dev, self.other['identity']), self.other)

    def test_ad_hoc_requires_explicit_opt_in(self):
        pinned = signing.resolve([], requested='-')
        self.assertEqual(signing.resolve([self.dev], pinned)['identity'], '-')


if __name__ == '__main__':
    unittest.main()

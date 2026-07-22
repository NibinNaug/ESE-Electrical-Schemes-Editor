import assert from "node:assert/strict";
import test from "node:test";
import { compareAppVersions, normalizeAppVersion } from "../src/app-version.ts";

test("compare les versions stables et préliminaires selon SemVer", () => {
  assert.ok(compareAppVersions("0.1.0-beta.2", "0.1.0-beta.1") > 0);
  assert.ok(compareAppVersions("0.1.0", "0.1.0-beta.9") > 0);
  assert.ok(compareAppVersions("1.0.0-alpha.2", "1.0.0-alpha.10") < 0);
  assert.equal(compareAppVersions("v2.3.4", "2.3.4"), 0);
});

test("normalise le préfixe v et refuse les versions non SemVer", () => {
  assert.equal(normalizeAppVersion("v0.1.0-beta.1"), "0.1.0-beta.1");
  assert.throws(() => normalizeAppVersion("version finale"), /Version invalide/);
});

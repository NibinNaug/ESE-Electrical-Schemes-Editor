type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

const parseVersion = (value: string): ParsedVersion | null => {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? []
  };
};

const comparePrereleaseIdentifier = (left: string, right: string): number => {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left.localeCompare(right, "en");
};

/** Compare two SemVer strings. Returns a positive value when `left` is newer. */
export const compareAppVersions = (left: string, right: string): number => {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  if (!leftVersion || !rightVersion) throw new Error(`Version invalide : ${!leftVersion ? left : right}`);

  for (const key of ["major", "minor", "patch"] as const) {
    const difference = leftVersion[key] - rightVersion[key];
    if (difference) return difference;
  }

  if (!leftVersion.prerelease.length || !rightVersion.prerelease.length) {
    if (leftVersion.prerelease.length === rightVersion.prerelease.length) return 0;
    return leftVersion.prerelease.length ? -1 : 1;
  }

  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === undefined ? -1 : 1;
    }
    const difference = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
    if (difference) return difference;
  }
  return 0;
};

export const normalizeAppVersion = (value: string): string => {
  const normalized = value.trim().replace(/^v/, "");
  if (!parseVersion(normalized)) throw new Error(`Version invalide : ${value}`);
  return normalized;
};

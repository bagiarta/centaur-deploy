export function parseIpAddress(ip?: string | null): number[] {
  if (!ip) return [];

  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return [];
  }

  return parts;
}

export function getSubnetLabel(ip?: string | null): string {
  const parts = parseIpAddress(ip);
  if (parts.length !== 4) return "Unknown";
  return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
}

export function compareIpAddresses(a?: string | null, b?: string | null): number {
  const ipA = parseIpAddress(a);
  const ipB = parseIpAddress(b);

  if (ipA.length !== 4 && ipB.length !== 4) {
    return (a || "").localeCompare(b || "");
  }
  if (ipA.length !== 4) return 1;
  if (ipB.length !== 4) return -1;

  for (let index = 0; index < 4; index += 1) {
    if (ipA[index] !== ipB[index]) {
      return ipA[index] - ipB[index];
    }
  }

  return 0;
}

export function compareSubnetLabels(a: string, b: string): number {
  const ipA = parseIpAddress(a.replace(/\.x$/i, ".0"));
  const ipB = parseIpAddress(b.replace(/\.x$/i, ".0"));

  if (ipA.length !== 4 && ipB.length !== 4) {
    return a.localeCompare(b);
  }
  if (ipA.length !== 4) return 1;
  if (ipB.length !== 4) return -1;

  for (let index = 0; index < 3; index += 1) {
    if (ipA[index] !== ipB[index]) {
      return ipA[index] - ipB[index];
    }
  }

  return 0;
}

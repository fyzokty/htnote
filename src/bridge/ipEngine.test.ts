import { describe, expect, it } from "vitest";
import "./ipEngine.js";

const { parseIPv4, calculateIpBlock } = globalThis.HTNOTE_IP_ENGINE;
describe("IPv4 block engine", () => {
  it("excludes network, broadcast and GW in ascending order", () => {
    const result = calculateIpBlock(" 10.67.106.14 ", 28);
    expect(result).toEqual({ error: null, network: "10.67.106.0", broadcast: "10.67.106.15", hosts: Array.from({ length: 13 }, (_, i) => `10.67.106.${i + 1}`) });
    expect(calculateIpBlock("10.67.106.14", 30).hosts).toEqual(["10.67.106.13"]);
    const full = calculateIpBlock("10.67.106.14", 24);
    expect(full.hosts).toHaveLength(253);
    expect(full.hosts[0]).toBe("10.67.106.1"); expect(full.hosts[full.hosts.length - 1]).toBe("10.67.106.254");
    expect(full.hosts).not.toContain("10.67.106.14");
  });
  it.each([24, 25, 26, 27, 28, 29, 30])("rejects network/broadcast GW for /%s and handles unsigned extremes", (prefix) => {
    expect(calculateIpBlock("0.0.0.0", prefix).error).toBe("gatewayBoundary");
    expect(calculateIpBlock("255.255.255.255", prefix).error).toBe("gatewayBoundary");
    const result = calculateIpBlock("255.255.255.254", prefix);
    expect(result.error).toBeNull(); expect(result.hosts).toHaveLength(2 ** (32 - prefix) - 3);
    expect(result.broadcast).toBe("255.255.255.255");
  });
  it.each(["", "1.2.3", "1.2.3.4.5", "01.2.3.4", "1.02.3.4", "1.2.3.256", "-1.2.3.4", "+1.2.3.4", "1.2.3.4/28", "1. 2.3.4", "1e1.2.3.4", "0x1.2.3.4", "１.2.3.4"])("rejects malformed IPv4 %s", (gateway) => {
    expect(parseIPv4(gateway)).toBeNull();
    expect(calculateIpBlock(gateway, 28)).toEqual({ error: "invalidIPv4", network: null, broadcast: null, hosts: [] });
  });
  it.each([23, 31, 0, -1, 28.5, NaN, Infinity])("rejects unsupported prefix %s", (prefix) => {
    expect(calculateIpBlock("10.67.106.14", prefix).error).toBe("invalidPrefix");
    expect(calculateIpBlock("10.67.106.14", prefix).hosts).toEqual([]);
  });
});

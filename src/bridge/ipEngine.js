// Editör ve iframe aynı sınırlı IPv4 hesap motorunu kullanır.
(function () {
  "use strict";
  function parseIPv4(value) {
    if (typeof value !== "string") return null;
    const parts = value.trim().split(".");
    if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return null;
    return parts.reduce((address, part) => address * 256 + Number(part), 0);
  }
  function formatIPv4(value) {
    return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");
  }
  function calculateIpBlock(gateway, prefix) {
    const fail = (error) => ({ error, network: null, broadcast: null, hosts: [] });
    if (typeof gateway !== "string" || !gateway.trim()) return fail("empty");
    const address = parseIPv4(gateway);
    if (address === null) return fail("invalidIPv4");
    if (!Number.isInteger(prefix) || prefix < 24 || prefix > 30) return fail("invalidPrefix");
    const size = 2 ** (32 - prefix), network = Math.floor(address / size) * size, broadcast = network + size - 1;
    if (address === network || address === broadcast) return fail("gatewayBoundary");
    const hosts = [];
    for (let host = network + 1; host < broadcast; host++) if (host !== address) hosts.push(formatIPv4(host));
    return { error: null, network: formatIPv4(network), broadcast: formatIPv4(broadcast), hosts };
  }
  globalThis.HTNOTE_IP_ENGINE = Object.freeze({ parseIPv4, calculateIpBlock });
})();

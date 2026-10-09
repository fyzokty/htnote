export type IpError = "empty" | "invalidIPv4" | "invalidPrefix" | "gatewayBoundary";
export interface IpResult { error: IpError | null; network: string | null; broadcast: string | null; hosts: string[] }
declare global {
  var HTNOTE_IP_ENGINE: Readonly<{ parseIPv4(value: string): number | null; calculateIpBlock(gateway: string, prefix: number): IpResult }>;
}

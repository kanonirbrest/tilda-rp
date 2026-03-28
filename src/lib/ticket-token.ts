import { randomBytes } from "crypto";

export function createPublicTicketToken(): string {
  return randomBytes(24).toString("base64url");
}

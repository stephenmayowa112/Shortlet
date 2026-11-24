export interface InboundWhatsAppMessage {
  providerMessageId: string;
  fromPhone: string;
  customerName: string;
  text: string;
  receivedAtIso: string;
}

export interface ParsedEnquiryHint {
  detectedListingId?: string;
  needsManualLookup: boolean;
}

export interface WhatsAppProvider {
  parseListingIdFromText(text: string): ParsedEnquiryHint;
  isDuplicateMessage(providerMessageId: string, seenIds: string[]): boolean;
  isWithin24HourSessionWindow(lastCustomerMessageIso: string, nowIso?: string): boolean;
  pickNextRoundRobinAdmin(activeAdminUids: string[], lastIndex: number): {
    adminUid: string | null;
    nextIndex: number;
  };
}

/**
 * Offline-testable WhatsApp Business Platform adapter (MSG-01 to MSG-04).
 * Never assumes the customer sent the prefilled message; flags manual lookup when edited or omitted.
 */
export class SandboxWhatsAppAdapter implements WhatsAppProvider {
  public parseListingIdFromText(text: string): ParsedEnquiryHint {
    const idMatch =
      text.match(/Listing ID:\s*([a-zA-Z0-9_\-]+)/i) ??
      text.match(/[?&]listing=([a-zA-Z0-9_\-]+)/i);

    if (idMatch?.[1]) {
      return {
        detectedListingId: idMatch[1],
        needsManualLookup: false,
      };
    }

    return {
      detectedListingId: undefined,
      needsManualLookup: true,
    };
  }

  public isDuplicateMessage(providerMessageId: string, seenIds: string[]): boolean {
    return seenIds.includes(providerMessageId);
  }

  public isWithin24HourSessionWindow(
    lastCustomerMessageIso: string,
    nowIso: string = new Date().toISOString()
  ): boolean {
    const diffMs = new Date(nowIso).getTime() - new Date(lastCustomerMessageIso).getTime();
    return diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;
  }

  public pickNextRoundRobinAdmin(
    activeAdminUids: string[],
    lastIndex: number
  ): { adminUid: string | null; nextIndex: number } {
    if (activeAdminUids.length === 0) {
      return { adminUid: null, nextIndex: 0 };
    }
    const nextIndex = (lastIndex + 1) % activeAdminUids.length;
    return {
      adminUid: activeAdminUids[nextIndex],
      nextIndex,
    };
  }
}

export const whatsappAdapter = new SandboxWhatsAppAdapter();

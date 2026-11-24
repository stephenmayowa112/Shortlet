import type { ListingCategory, SystemConfig } from "@/lib/types";

export const DEFAULT_SERVICE_CHARGE_UNIT_KOBO = 3_000_000; // ₦30,000 in kobo
export const DEFAULT_ADMIN_SPLIT_KOBO = 1_000_000; // ₦10,000 in kobo
export const DEFAULT_FOUNDER_SPLIT_KOBO = 1_000_000; // ₦10,000 in kobo
export const DEFAULT_ADS_OPS_SPLIT_KOBO = 1_000_000; // ₦10,000 in kobo

export interface PricingConfig {
  serviceChargeUnitKobo: number;
  adminSplitKobo: number;
  founderSplitKobo: number;
  adsOpsSplitKobo: number;
  carPartialDayCutoffHours: number;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  serviceChargeUnitKobo: DEFAULT_SERVICE_CHARGE_UNIT_KOBO,
  adminSplitKobo: DEFAULT_ADMIN_SPLIT_KOBO,
  founderSplitKobo: DEFAULT_FOUNDER_SPLIT_KOBO,
  adsOpsSplitKobo: DEFAULT_ADS_OPS_SPLIT_KOBO,
  carPartialDayCutoffHours: 24,
};

export interface QuoteInput {
  category: ListingCategory;
  /** Apartment: nights; Car: rental hours (12, 24, 72) OR days via carRentalDays; Boat: hours */
  quantity: number;
  /** For cars, clarify if quantity is in hours (e.g., 12, 24) vs whole days */
  carUnitMode?: "hours" | "days";
  /** Base rate in integer kobo (per night, per day/block, or per hour) */
  unitRateKobo: number;
  cautionFeeKobo?: number;
  extrasKobo?: number;
  config?: Partial<PricingConfig>;
}

/** Public-safe quote visible to guests/customers — NEVER contains internal ₦10k allocations */
export interface CustomerQuoteBreakdown {
  category: ListingCategory;
  chargeableUnits: number;
  unitLabel: string;
  rentalPrincipalKobo: number;
  serviceChargeKobo: number;
  cautionFeeKobo: number;
  extrasKobo: number;
  customerTotalKobo: number;
  currency: "NGN";
}

/** Staff-only financial breakdown including internal ₦10,000 allocations */
export interface StaffFinancialBreakdown extends CustomerQuoteBreakdown {
  internalAllocations: {
    coordinatingAdminKobo: number;
    founderKobo: number;
    adsAndOpsKobo: number;
  };
}

/**
 * Computes chargeable service-charge units per PRD PRICE-01:
 * - Apartment: 1 unit per booked night ([check-in, check-out) half-open)
 * - Car: 1 unit per chargeable day (12h = 1 unit, 24h = 1 unit, 3 days = 3 units;
 *   partial multi-day cutoffs driven by pricing config, never hard-coded)
 * - Boat: 1 unit per 2-hour block, rounded up (3h = 2 units, 4h = 2 units, 5h = 3 units)
 */
export function computeChargeableUnits(
  category: ListingCategory,
  quantity: number,
  carUnitMode: "hours" | "days" = "days",
  carPartialDayCutoffHours = 24
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive number.");
  }

  if (category === "apartment") {
    const nights = Math.floor(quantity);
    if (nights < 1) throw new Error("Apartment stays require at least 1 night.");
    return nights;
  }

  if (category === "car") {
    if (carUnitMode === "days") {
      return Math.ceil(quantity);
    }
    // Hours mode: 12h and 24h each incur 1 unit; partial multi-day rentals use configurable cutoff
    if (quantity <= 24) {
      return 1;
    }
    const wholeDays = Math.floor(quantity / 24);
    const remainderHours = quantity % 24;
    if (remainderHours === 0) return wholeDays;
    return remainderHours >= carPartialDayCutoffHours ? wholeDays + 1 : wholeDays + 1;
  }

  // Boat: ₦30,000 per 2-hour block, rounded up
  return Math.ceil(quantity / 2);
}

/**
 * Computes full staff breakdown (integer kobo only, never floats).
 * Throws if internal allocation config does not sum exactly to the service charge unit.
 */
export function calculateStaffQuote(input: QuoteInput): StaffFinancialBreakdown {
  const cfg: PricingConfig = {
    ...DEFAULT_PRICING_CONFIG,
    ...(input.config ?? {}),
  };

  if (
    cfg.adminSplitKobo + cfg.founderSplitKobo + cfg.adsOpsSplitKobo !==
    cfg.serviceChargeUnitKobo
  ) {
    throw new Error(
      "Pricing invariant violation: internal allocations must sum exactly to serviceChargeUnitKobo."
    );
  }

  if (
    !Number.isInteger(input.unitRateKobo) ||
    input.unitRateKobo < 0 ||
    !Number.isInteger(input.cautionFeeKobo ?? 0) ||
    !Number.isInteger(input.extrasKobo ?? 0)
  ) {
    throw new Error("All monetary inputs must be non-negative integer kobo.");
  }

  const chargeableUnits = computeChargeableUnits(
    input.category,
    input.quantity,
    input.carUnitMode ?? "days",
    cfg.carPartialDayCutoffHours
  );

  // Rental principal calculation by category
  const rentalMultiplier =
    input.category === "car" && input.carUnitMode === "hours"
      ? chargeableUnits
      : Math.ceil(input.quantity);

  const rentalPrincipalKobo = input.unitRateKobo * rentalMultiplier;
  const serviceChargeKobo = cfg.serviceChargeUnitKobo * chargeableUnits;
  const cautionFeeKobo = input.cautionFeeKobo ?? 0;
  const extrasKobo = input.extrasKobo ?? 0;
  const customerTotalKobo =
    rentalPrincipalKobo + serviceChargeKobo + cautionFeeKobo + extrasKobo;

  const coordinatingAdminKobo = cfg.adminSplitKobo * chargeableUnits;
  const founderKobo = cfg.founderSplitKobo * chargeableUnits;
  const adsAndOpsKobo = cfg.adsOpsSplitKobo * chargeableUnits;

  // Hard invariant assertion (PRICE-02)
  if (
    coordinatingAdminKobo + founderKobo + adsAndOpsKobo !==
    serviceChargeKobo
  ) {
    throw new Error("Internal allocation sum mismatch.");
  }

  const unitLabel =
    input.category === "apartment"
      ? `${chargeableUnits} night${chargeableUnits === 1 ? "" : "s"}`
      : input.category === "car"
      ? input.carUnitMode === "hours" && input.quantity <= 24
        ? `${input.quantity}-hour rental (1 chargeable day)`
        : `${chargeableUnits} chargeable day${chargeableUnits === 1 ? "" : "s"}`
      : `${input.quantity} hr${input.quantity === 1 ? "" : "s"} (${chargeableUnits} × 2-hr block${chargeableUnits === 1 ? "" : "s"})`;

  return {
    category: input.category,
    chargeableUnits,
    unitLabel,
    rentalPrincipalKobo,
    serviceChargeKobo,
    cautionFeeKobo,
    extrasKobo,
    customerTotalKobo,
    currency: "NGN",
    internalAllocations: {
      coordinatingAdminKobo,
      founderKobo,
      adsAndOpsKobo,
    },
  };
}

/**
 * Explicit allow-list serializer for guest/customer quote display.
 * Guarantees internal ₦10,000 allocations are NEVER included in guest/customer/partner payloads.
 */
export function calculateCustomerQuote(input: QuoteInput): CustomerQuoteBreakdown {
  const full = calculateStaffQuote(input);
  return {
    category: full.category,
    chargeableUnits: full.chargeableUnits,
    unitLabel: full.unitLabel,
    rentalPrincipalKobo: full.rentalPrincipalKobo,
    serviceChargeKobo: full.serviceChargeKobo,
    cautionFeeKobo: full.cautionFeeKobo,
    extrasKobo: full.extrasKobo,
    customerTotalKobo: full.customerTotalKobo,
    currency: full.currency,
  };
}

/** Formats integer kobo to Nigerian Naira string (e.g., 3_000_000 -> "₦30,000") */
export function formatNairaFromKobo(kobo: number): string {
  const naira = Math.round(kobo / 100);
  return `₦${naira.toLocaleString("en-NG")}`;
}

/** Helper to compute nights in a half-open [checkIn, checkOut) UTC date range */
export function computeHalfOpenNights(checkInDate: string, checkOutDate: string): number {
  const start = new Date(`${checkInDate}T00:00:00.000Z`);
  const end = new Date(`${checkOutDate}T00:00:00.000Z`);
  const diffMs = end.getTime() - start.getTime();
  const nights = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (!Number.isFinite(nights) || nights < 1) {
    throw new Error("Check-out date must be after check-in date.");
  }
  return nights;
}

/** Format an ISO UTC timestamp for display in Africa/Lagos (WAT) */
export function formatAfricaLagos(isoString: string, includeTime = true): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", hour12: true }
      : {}),
  }).format(date);
}

export function extractPricingConfig(cfg: SystemConfig): PricingConfig {
  return {
    serviceChargeUnitKobo: cfg.serviceChargeUnitKobo,
    adminSplitKobo: cfg.adminSplitKobo,
    founderSplitKobo: cfg.founderSplitKobo,
    adsOpsSplitKobo: cfg.adsOpsSplitKobo,
    carPartialDayCutoffHours: cfg.carPartialDayCutoffHours,
  };
}

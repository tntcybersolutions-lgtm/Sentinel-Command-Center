// Seed function for statutory lien waiver templates.
//
// Strategy:
//   • California has documented statutory text in Civil Code §8132,
//     §8134, §8136, §8138 — those four templates are seeded verbatim
//     (with {{placeholders}} for runtime substitution).
//   • All other US states/territories receive a generic per-type
//     template marked `statutory:false`. Production deployments SHOULD
//     replace these with the actual state-specific statutory text after
//     legal review — they exist so the autofill engine has a fallback
//     for every (state, waiverType) tuple.
//
// The seed is idempotent: an existing (state, waiverType) row is left
// alone. Re-runs only insert missing combinations. Safe to invoke on
// every boot or via the admin route.

import { db } from "../db";
import { lienWaiverTemplates } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

export const ALL_STATES: string[] = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
  "DC",
];

export const WAIVER_TYPE_KEYS = [
  "conditional_progress",
  "unconditional_progress",
  "conditional_final",
  "unconditional_final",
] as const;
export type TemplateWaiverType = (typeof WAIVER_TYPE_KEYS)[number];

const CA_STATUTORY: Record<TemplateWaiverType, string> = {
  // California Civil Code §8132
  conditional_progress: `CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT

NOTICE: THIS DOCUMENT WAIVES THE CLAIMANT'S LIEN, STOP PAYMENT NOTICE,
AND PAYMENT BOND RIGHTS EFFECTIVE ON RECEIPT OF PAYMENT. A PERSON SHOULD
NOT RELY ON THIS DOCUMENT UNLESS SATISFIED THAT THE CLAIMANT HAS RECEIVED
PAYMENT.

Identifying Information
Name of Claimant:        {{claimantName}}
Name of Customer:        {{vendorName}}
Job Location:            {{propertyDescription}}
Owner:                   {{ownerName}}
Through Date:            {{throughDate}}

Conditional Waiver and Release
This document waives and releases lien, stop payment notice, and payment
bond rights the claimant has for labor and service provided, and
equipment and material delivered, to the customer on this job through
the Through Date. Rights based upon labor or service provided, or
equipment or material delivered, pursuant to a written change order that
has been fully executed by the parties prior to the date that this
document is signed by the claimant, are waived and released by this
document, unless listed as an Exception below. This document is effective
only on the claimant's receipt of payment from the financial institution
on which the following check is drawn:

  Maker of Check:        {{ownerName}}
  Amount of Check:       \${{amount}}
  Check Payable to:      {{claimantName}}

Exceptions
This document does not affect any of the following:
  (1) Retentions.
  (2) Extras for which the claimant has not received payment.
  (3) The following progress payments for which the claimant has
      previously given a conditional waiver and release but has not
      received payment:
      Date(s) of waiver and release: {{exceptions}}
  (4) Contract rights, including (A) a right based on rescission,
      abandonment, or breach of contract, and (B) the right to recover
      compensation for work not compensated by the payment.

Signature
  Claimant's Signature:  {{signature}}
  Claimant's Title:      {{signerTitle}}
  Date of Signature:     {{signedDate}}`,

  // California Civil Code §8134
  unconditional_progress: `UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT

NOTICE TO CLAIMANT: THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT
NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND STATES THAT YOU HAVE
BEEN PAID FOR GIVING UP THOSE RIGHTS. THIS DOCUMENT IS ENFORCEABLE
AGAINST YOU IF YOU SIGN IT, EVEN IF YOU HAVE NOT BEEN PAID. IF YOU HAVE
NOT BEEN PAID, USE A CONDITIONAL WAIVER AND RELEASE FORM.

Identifying Information
Name of Claimant:        {{claimantName}}
Name of Customer:        {{vendorName}}
Job Location:            {{propertyDescription}}
Owner:                   {{ownerName}}
Through Date:            {{throughDate}}

Unconditional Waiver and Release
This document waives and releases lien, stop payment notice, and payment
bond rights the claimant has for labor and service provided, and
equipment and material delivered, to the customer on this job through
the Through Date. Rights based upon labor or service provided, or
equipment or material delivered, pursuant to a written change order that
has been fully executed by the parties prior to the date that this
document is signed by the claimant, are waived and released by this
document, unless listed as an Exception below. The claimant has received
the following progress payment:

  Amount of Payment:     \${{amount}}

Exceptions
This document does not affect any of the following:
  (1) Retentions.
  (2) Extras for which the claimant has not received payment.
  (3) Contract rights, including (A) a right based on rescission,
      abandonment, or breach of contract, and (B) the right to recover
      compensation for work not compensated by the payment.

Signature
  Claimant's Signature:  {{signature}}
  Claimant's Title:      {{signerTitle}}
  Date of Signature:     {{signedDate}}`,

  // California Civil Code §8136
  conditional_final: `CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT

NOTICE: THIS DOCUMENT WAIVES THE CLAIMANT'S LIEN, STOP PAYMENT NOTICE,
AND PAYMENT BOND RIGHTS EFFECTIVE ON RECEIPT OF PAYMENT. A PERSON SHOULD
NOT RELY ON THIS DOCUMENT UNLESS SATISFIED THAT THE CLAIMANT HAS RECEIVED
PAYMENT.

Identifying Information
Name of Claimant:        {{claimantName}}
Name of Customer:        {{vendorName}}
Job Location:            {{propertyDescription}}
Owner:                   {{ownerName}}

Conditional Waiver and Release
This document waives and releases lien, stop payment notice, and payment
bond rights the claimant has for all labor and service provided, and
equipment and material delivered, to the customer on this job. Rights
based upon labor or service provided, or equipment or material delivered,
pursuant to a written change order that has been fully executed by the
parties prior to the date that this document is signed by the claimant,
are waived and released by this document, unless listed as an Exception
below. This document is effective only on the claimant's receipt of
payment from the financial institution on which the following check is
drawn:

  Maker of Check:        {{ownerName}}
  Amount of Check:       \${{amount}}
  Check Payable to:      {{claimantName}}

Exceptions
This document does not affect any of the following:
  Disputed claims for extras in the amount of: {{exceptions}}

Signature
  Claimant's Signature:  {{signature}}
  Claimant's Title:      {{signerTitle}}
  Date of Signature:     {{signedDate}}`,

  // California Civil Code §8138
  unconditional_final: `UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT

NOTICE TO CLAIMANT: THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT
NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND STATES THAT YOU HAVE
BEEN PAID FOR GIVING UP THOSE RIGHTS. THIS DOCUMENT IS ENFORCEABLE
AGAINST YOU IF YOU SIGN IT, EVEN IF YOU HAVE NOT BEEN PAID. IF YOU HAVE
NOT BEEN PAID, USE A CONDITIONAL WAIVER AND RELEASE FORM.

Identifying Information
Name of Claimant:        {{claimantName}}
Name of Customer:        {{vendorName}}
Job Location:            {{propertyDescription}}
Owner:                   {{ownerName}}

Unconditional Waiver and Release
This document waives and releases lien, stop payment notice, and payment
bond rights the claimant has for all labor and service provided, and
equipment and material delivered, to the customer on this job. Rights
based upon labor or service provided, or equipment or material delivered,
pursuant to a written change order that has been fully executed by the
parties prior to the date that this document is signed by the claimant,
are waived and released by this document, unless listed as an Exception
below. The claimant has been paid in full.

Exceptions
This document does not affect the following:
  Disputed claims for extras in the amount of: {{exceptions}}

Signature
  Claimant's Signature:  {{signature}}
  Claimant's Title:      {{signerTitle}}
  Date of Signature:     {{signedDate}}`,
};

const TYPE_TITLES: Record<TemplateWaiverType, string> = {
  conditional_progress: "CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT",
  unconditional_progress: "UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT",
  conditional_final: "CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT",
  unconditional_final: "UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT",
};

function genericTemplate(state: string, type: TemplateWaiverType): string {
  const isConditional = type === "conditional_progress" || type === "conditional_final";
  const isFinal = type === "conditional_final" || type === "unconditional_final";
  const conditionalNotice = isConditional
    ? `\nNOTICE: This waiver is effective only upon claimant's actual receipt of the payment referenced below.\n`
    : `\nNOTICE: This is an UNCONDITIONAL waiver. By signing, claimant attests that payment has been received.\n`;
  const scope = isFinal
    ? `all labor, services, equipment, and material furnished to the property through completion of the contract`
    : `labor, services, equipment, and material furnished to the property through the Through Date stated below`;

  return `${TYPE_TITLES[type]}
(${state} — generic template; replace with state statutory text after legal review)

Identifying Information
  Claimant:              {{claimantName}}
  Claimant Address:      {{claimantAddress}}
  Customer (vendor):     {{vendorName}}
  Owner:                 {{ownerName}}
  Project:               {{projectDescription}}
  Property Description:  {{propertyDescription}}
  Through Date:          {{throughDate}}
  Payment Amount:        \${{amount}}
${conditionalNotice}
Waiver and Release
The claimant waives and releases any lien, stop notice, or payment bond
right that the claimant has for ${scope}, except as listed under
Exceptions below.

Exceptions
  {{exceptions}}

Signature
  Signed by:             {{signature}}
  Title:                 {{signerTitle}}
  Date:                  {{signedDate}}
  State of Jurisdiction: ${state}
`;
}

export interface SeedResult {
  inserted: number;
  skipped: number;
  totalCombinations: number;
}

/**
 * Seed statutory templates for every (state × waiverType) combination.
 * Idempotent — existing rows are left untouched.
 */
export async function seedLienWaiverTemplates(): Promise<SeedResult> {
  let inserted = 0;
  let skipped = 0;

  for (const state of ALL_STATES) {
    for (const waiverType of WAIVER_TYPE_KEYS) {
      const existing = await db
        .select({ id: lienWaiverTemplates.id })
        .from(lienWaiverTemplates)
        .where(
          and(
            eq(lienWaiverTemplates.state, state),
            eq(lienWaiverTemplates.waiverType, waiverType),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const isCa = state === "CA";
      const body = isCa ? CA_STATUTORY[waiverType] : genericTemplate(state, waiverType);

      await db.insert(lienWaiverTemplates).values({
        state,
        waiverType,
        templateBody: body,
        statutory: isCa,
      });
      inserted++;
    }
  }

  return {
    inserted,
    skipped,
    totalCombinations: ALL_STATES.length * WAIVER_TYPE_KEYS.length,
  };
}

/**
 * Substitute {{placeholder}} tokens in a template body using a key→value
 * map. Unknown placeholders are left in place so the renderer can spot
 * gaps. Values are not HTML-escaped — caller decides display context.
 */
export function fillTemplate(
  body: string,
  values: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/{{\s*(\w+)\s*}}/g, (match, key: string) => {
    const v = values[key];
    if (v === undefined || v === null || v === "") return match;
    return String(v);
  });
}

/**
 * Look up the best template for a (state, waiverType) tuple. Returns
 * null when no template is seeded.
 */
export async function findTemplate(
  state: string,
  waiverType: TemplateWaiverType,
) {
  const [row] = await db
    .select()
    .from(lienWaiverTemplates)
    .where(
      and(
        eq(lienWaiverTemplates.state, state),
        eq(lienWaiverTemplates.waiverType, waiverType),
      ),
    )
    .orderBy(sql`${lienWaiverTemplates.statutory} DESC`)
    .limit(1);
  return row ?? null;
}

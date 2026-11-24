/**
 * Pure helpers for the MenuItemCard selection/price rules (Feature 2). Kept
 * separate from the component so they are unit-testable directly (the component
 * imports and uses these exact functions — not a re-implementation).
 *
 * All amounts are integer cents.
 */

/**
 * Is double meat offerable for the current selection?
 * Requires BOTH: the group carries a non-null `doubleMeat` surcharge, AND the
 * selected option exists and has `doubleMeatAvailable === true`.
 */
export function doubleMeatOffered(group, selectedOptionId) {
  if (!group || !group.doubleMeat) return false
  const opt = group.options?.find(o => o.id === selectedOptionId)
  return opt?.doubleMeatAvailable === true
}

/**
 * The next double-meat checkbox state after selecting `optionId`. Switching to an
 * option that cannot take double meat clears it; switching to an eligible meat does
 * NOT auto-enable it (the user must opt in again) — so the only transition that
 * changes the flag here is clearing it to false when the option is ineligible.
 */
export function doubleMeatAfterSelect(group, optionId, currentDoubleMeat) {
  const opt = group?.options?.find(o => o.id === optionId)
  if (!opt || opt.doubleMeatAvailable !== true) return false
  return currentDoubleMeat
}

/**
 * Configured price in integer cents:
 *   base + selected option delta + (eligible, checked double-meat surcharge).
 * Double meat only contributes when it is offerable AND checked. Returns null if
 * there is no base price.
 */
export function configuredPriceCents(group, basePriceCents, selectedOptionId, doubleMeatChecked) {
  if (typeof basePriceCents !== 'number' || !Number.isFinite(basePriceCents)) return null
  const opt = group?.options?.find(o => o.id === selectedOptionId) ?? null
  const optionDelta = opt?.priceDeltaCents ?? 0
  const dmActive = doubleMeatChecked && doubleMeatOffered(group, selectedOptionId)
  const dmDelta = dmActive ? (group.doubleMeat.priceDeltaCents ?? 0) : 0
  return basePriceCents + optionDelta + dmDelta
}

import { useId, useState } from 'react'
import './MenuItemCard.css'
import { formatCents } from '../utils/formatPrice'
import { configuredPriceCents, doubleMeatAfterSelect, doubleMeatOffered } from '../utils/configurePrice'

/**
 * Reusable, API-backed menu-item card for a catalog item (Feature 2).
 *
 * Compact row (matching the existing menu styling) with an expandable, accessible
 * "Choose options" control. Renders the required single-choice protein group and
 * the optional "Double meat" surcharge, driven entirely by the API data
 * (`item.apiItem`). Presentation metadata (image, popular) comes from the local
 * static entry carried on `item` (image/popular), which the API does not supply.
 *
 * Selection is per-card local state, so tacos are independent. Collapsing the
 * options does NOT reset the selection (state persists across the collapse).
 *
 * Double meat is offered ONLY when BOTH the group has a non-null `doubleMeat`
 * surcharge AND the selected option has `doubleMeatAvailable === true`. Switching
 * to an ineligible option (e.g. grilled veggies) clears double meat and its
 * surcharge; switching back to a meat does NOT auto-re-enable it.
 *
 * Display-only: no submit/cart. Integer cents throughout; dollars only for display.
 */
export default function MenuItemCard({ item }) {
  const api = item.apiItem
  const group = api?.modifierGroups?.[0] ?? null
  const [expanded, setExpanded] = useState(false)
  const [selectedOptionId, setSelectedOptionId] = useState(null)
  const [doubleMeat, setDoubleMeat] = useState(false)

  const reactId = useId()
  const panelId = `opts-${reactId}`
  const radioName = `protein-${api?.id ?? reactId}`

  // Double meat is offerable only when BOTH conditions hold (pure helper).
  const dmOffered = doubleMeatOffered(group, selectedOptionId)

  function selectProtein(optionId) {
    setSelectedOptionId(optionId)
    // Clear double meat when the new option is ineligible; selecting an eligible
    // meat does NOT auto-re-enable it (pure helper encodes this rule).
    setDoubleMeat(prev => doubleMeatAfterSelect(group, optionId, prev))
  }

  // Prices (integer cents). Base is authoritative for filtering; configured adds
  // the selected option delta and the eligible, checked double-meat surcharge.
  const baseCents = api?.basePriceCents ?? null
  const configuredCents = configuredPriceCents(group, baseCents, selectedOptionId, doubleMeat)
  const baseLabel = formatCents(baseCents)
  const configuredLabel = formatCents(configuredCents)
  const priceChanged = baseCents != null && configuredCents !== baseCents

  return (
    <article className={`menuRow ${item.image ? 'withImage' : 'withoutImage'}`}>
      {item.image && <img src={item.image} alt="" className="menuRowImage" loading="lazy" />}
      <div className="menuRowContent">
        <div className="menuRowTop">
          <h4>{api?.name ?? item.name}</h4>
          <div className="menuRowMeta">
            {item.popular && <span className="popularTag">Popular</span>}
            {/* Base price alone when nothing adds a surcharge. When options add
                a surcharge, show both clearly LABELLED (no strikethrough): a quiet
                "Base $X.XX" and a prominent "With options $Y.YY" total. */}
            {baseLabel && (
              priceChanged
                ? <span className="price priceWithOptions">
                    <span className="priceBase">Base {baseLabel}</span>
                    <span className="priceConfigured">With options {configuredLabel}</span>
                  </span>
                : <span className="price">{baseLabel}</span>
            )}
          </div>
        </div>
        {(api?.description ?? item.description) && <p>{api?.description ?? item.description}</p>}

        {group && (
          <div className="itemOptions">
            <button
              type="button"
              className="chooseOptionsBtn"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setExpanded(e => !e)}
            >
              Choose options
              <span className="chooseOptionsCaret" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
            </button>

            {/* Rendered only when expanded; selection state lives above this in
                component state, so collapsing/reopening preserves it. */}
            {expanded && (
              <div id={panelId} className="itemOptionsPanel">
                <fieldset className="proteinGroup">
                  <legend>{group.label}</legend>
                  <div className="proteinOptionList">
                    {group.options.map(option => {
                      const delta = formatCents(option.priceDeltaCents)
                      const showDelta = option.priceDeltaCents > 0 && delta
                      return (
                        <label key={option.id} className="proteinOption">
                          <input
                            type="radio"
                            name={radioName}
                            value={option.id}
                            checked={selectedOptionId === option.id}
                            onChange={() => selectProtein(option.id)}
                          />
                          <span>{option.name}</span>
                          {showDelta && <span className="optionDelta">+{delta}</span>}
                        </label>
                      )
                    })}
                  </div>
                </fieldset>

                {/* Double meat only when BOTH the group offers it AND the selected
                    option is eligible. Adds an extra portion of the SAME meat. */}
                {dmOffered && (
                  <label className="doubleMeat">
                    <input
                      type="checkbox"
                      checked={doubleMeat}
                      onChange={e => setDoubleMeat(e.target.checked)}
                    />
                    <span>Double meat</span>
                    <span className="optionDelta">+{formatCents(group.doubleMeat.priceDeltaCents)}</span>
                  </label>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

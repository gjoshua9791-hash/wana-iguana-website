import { useState } from 'react'
import './TacoSuaveCard.css'
import { formatCents } from '../utils/formatPrice'

/**
 * API-backed Taco Suave card (Tasks E2 + E3).
 *
 * Renders the four request states and, on success, the live item plus a
 * "Choose one" protein radio group. Fetch state is OWNED by MenuPage (via the
 * useTacoSuave hook) and passed in as props, so the exact same fetched data
 * drives both the menu's search/price filtering + result count AND this card's
 * display — displayed values and filter results cannot disagree.
 *
 * Presentation metadata that is NOT supplied by the API (image, popular tag)
 * comes from the local static entry via `fallbackItem`; the API supplies name,
 * description, price (cents), and the protein options (design: API owns catalog
 * content, local owns image/category/popularity).
 *
 * States:
 *   loading  → spinner + text; never shows a stale/empty item (AC6).
 *   error    → friendly message + Retry that re-requests (AC7).
 *   notFound → "currently unavailable" message, no crash (AC8).
 *   success  → name + currency price + description + protein radios
 *              (AC5, AC9–AC12).
 */
export default function TacoSuaveCard({ status, data, onRetry, fallbackItem }) {
  // Temporary UI state only (AC10): nothing pre-selected. The exactly-one
  // business rule lives in the catalog (minSelect/maxSelect); it is not enforced
  // here because this display-only feature has no submission action (AC13).
  const [selectedOptionId, setSelectedOptionId] = useState(null)

  if (status === 'loading') {
    return (
      <article className="menuRow withoutImage tacoSuaveState" aria-busy="true">
        <div className="menuRowContent">
          <span className="tacoSuaveLoading" role="status">
            <span className="tacoSuaveSpinner" aria-hidden="true" />
            Loading Taco Suave…
          </span>
        </div>
      </article>
    )
  }

  if (status === 'error') {
    return (
      <article className="menuRow withoutImage tacoSuaveState tacoSuaveMessage" role="alert">
        <div className="menuRowContent">
          <h4>Taco Suave</h4>
          <p>We couldn’t load Taco Suave right now. Please check your connection and try again.</p>
          <button type="button" className="tacoSuaveRetry" onClick={onRetry}>
            Retry
          </button>
        </div>
      </article>
    )
  }

  if (status === 'notFound') {
    return (
      <article className="menuRow withoutImage tacoSuaveState tacoSuaveMessage">
        <div className="menuRowContent">
          <h4>Taco Suave</h4>
          <p>This item is currently unavailable.</p>
        </div>
      </article>
    )
  }

  // success
  const priceLabel = formatCents(data?.basePriceCents)
  const image = fallbackItem?.image
  const popular = fallbackItem?.popular === true
  const proteinGroup = data?.modifierGroups?.[0] ?? null

  return (
    <article className={`menuRow ${image ? 'withImage' : 'withoutImage'}`}>
      {image && <img src={image} alt="" className="menuRowImage" loading="lazy" />}
      <div className="menuRowContent">
        <div className="menuRowTop">
          <h4>{data.name}</h4>
          <div className="menuRowMeta">
            {popular && <span className="popularTag">Popular</span>}
            {priceLabel && <span className="price">{priceLabel}</span>}
          </div>
        </div>
        {data.description && <p>{data.description}</p>}

        {proteinGroup && (
          <fieldset className="tacoSuaveOptions">
            <legend>{proteinGroup.label}</legend>
            <div className="tacoSuaveOptionList">
              {proteinGroup.options.map(option => {
                const delta = formatCents(option.priceDeltaCents)
                const showDelta = option.priceDeltaCents > 0 && delta
                return (
                  <label key={option.id} className="tacoSuaveOption">
                    <input
                      type="radio"
                      name={`taco-suave-${proteinGroup.id}`}
                      value={option.id}
                      checked={selectedOptionId === option.id}
                      onChange={() => setSelectedOptionId(option.id)}
                    />
                    <span>{option.name}</span>
                    {showDelta && <span className="tacoSuaveOptionDelta">+{delta}</span>}
                  </label>
                )
              })}
            </div>
          </fieldset>
        )}
      </div>
    </article>
  )
}

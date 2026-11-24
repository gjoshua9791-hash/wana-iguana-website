import MenuItem from './MenuItem'
import TacoSuaveCard from './TacoSuaveCard'
import { categoryId } from '../utils/categoryId'

/**
 * Render one menu category.
 *
 * Taco Suave is special: wherever the `taco-suave` entry appears in this
 * section's items, it is rendered by the API-backed <TacoSuaveCard/> instead of
 * the static <MenuItem/> (in-place swap, no double display — AC16). When Taco
 * Suave has not yet loaded successfully it is absent from the filtered items;
 * in that case, if the parent asks (`showPendingTacoCard`) and this is the
 * Original Tacos category, we re-insert the card at the top (its original slot)
 * so its loading/error/not-found state is visible in place. That injected card
 * is a NOTICE, not a counted menu item: the header count and the top-level
 * "N matching items" both tally only loaded items, so they never disagree.
 *
 * `taco` is the fetch state from useTacoSuave ({ status, data, retry }).
 */
export default function MenuSection({ section, taco, showPendingTacoCard = false }) {
  const id = categoryId(section.category)

  const hasTaco = Boolean(taco) && section.items.some(item => item.id === 'taco-suave')
  const injectPendingTaco =
    Boolean(taco) && showPendingTacoCard && section.category === 'Original Tacos' && !hasTaco

  // The header count reflects only loaded/available items. A pending Taco Suave
  // card (loading / error / not-found) is a NOTICE, not an available item, so it
  // is NOT counted here — this keeps the per-section count equal to the sum the
  // top-level "N matching items" uses (both count only `section.items`), so the
  // two can never report contradictory totals.
  const itemCount = section.items.length

  // The local static entry (for image/popular presentation metadata the API
  // does not supply). Falls back to a minimal shape when it was filtered out.
  const staticTaco = section.items.find(item => item.id === 'taco-suave') ??
    { image: '/images/taco-suave.jpeg', popular: true }

  return <section className="menuCategory" id={id} aria-labelledby={`${id}-title`} tabIndex={-1}>
    <div className="menuCategoryHeader">
      <div><h3 id={`${id}-title`}>{section.category}</h3>{section.note && <p>{section.note}</p>}</div>
      <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
    </div>
    <div className="menuRows">
      {injectPendingTaco && <TacoSuaveCard
        key="taco-suave"
        status={taco.status}
        data={taco.data}
        onRetry={taco.retry}
        fallbackItem={staticTaco} />}
      {section.items.map(item => (
        item.id === 'taco-suave' && taco
          ? <TacoSuaveCard
              key="taco-suave"
              status={taco.status}
              data={taco.data}
              onRetry={taco.retry}
              fallbackItem={item} />
          : <MenuItem key={item.name} item={item} />
      ))}
    </div>
  </section>
}

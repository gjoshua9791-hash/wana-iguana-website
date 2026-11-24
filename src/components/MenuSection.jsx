import MenuItem from './MenuItem'
import MenuItemCard from './MenuItemCard'
import { categoryId } from '../utils/categoryId'

/**
 * Render one menu category.
 *
 * An item reconciled from the API carries an `apiItem` payload (see
 * `menuWithCategory`); such items render through the API-backed <MenuItemCard/>
 * (compact row + expandable options). Plain static items render through
 * <MenuItem/> unchanged. The header count reflects only the items actually in
 * `section.items` (the reconcile layer already dropped API-omitted and
 * not-yet-loaded items), so the count matches what is rendered and agrees with
 * the page's "N matching items" total.
 *
 * Category-level loading / error / empty states for an API-backed category are
 * handled by the Menu page (they mean the section has no filterable items), not
 * here.
 */
export default function MenuSection({ section }) {
  const id = categoryId(section.category)
  const itemCount = section.items.length

  return <section className="menuCategory" id={id} aria-labelledby={`${id}-title`} tabIndex={-1}>
    <div className="menuCategoryHeader">
      <div><h3 id={`${id}-title`}>{section.category}</h3>{section.note && <p>{section.note}</p>}</div>
      <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
    </div>
    <div className="menuRows">
      {section.items.map(item => (
        item.apiItem
          ? <MenuItemCard key={item.id} item={item} />
          : <MenuItem key={item.name} item={item} />
      ))}
    </div>
  </section>
}

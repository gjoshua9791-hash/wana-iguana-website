import MenuItem from './MenuItem'

import { categoryId } from '../utils/categoryId'

export default function MenuSection({ section }) {
  const id = categoryId(section.category)
  return <section className="menuCategory" id={id} aria-labelledby={`${id}-title`}>
    <div className="menuCategoryHeader">
      <div><h3 id={`${id}-title`}>{section.category}</h3>{section.note && <p>{section.note}</p>}</div>
      <span>{section.items.length} items</span>
    </div>
    <div className="menuRows">{section.items.map(item => <MenuItem key={item.name} item={item} />)}</div>
  </section>
}

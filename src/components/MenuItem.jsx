export default function MenuItem({ item }) {
  return <article className={`menuRow ${item.image ? 'withImage' : 'withoutImage'}`}>
    {item.image && <img src={item.image} alt="" className="menuRowImage" loading="lazy" />}
    <div className="menuRowContent">
      <div className="menuRowTop">
        <h4>{item.name}</h4>
        <div className="menuRowMeta">
          {item.popular && <span className="popularTag">Popular</span>}
          {item.price && <span className="price">{item.price}</span>}
        </div>
      </div>
      {item.description && <p>{item.description}</p>}
    </div>
  </article>
}

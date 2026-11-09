import { restaurant } from '../data/restaurant'

export default function Footer() {
  return <footer className="siteFooter">
    <div className="footerBrand">
      <strong>Wana Iguana</strong>
      <p>Fresh Mexican Grill · Valencia, California</p>
    </div>
    <div className="footerContact">
      <h2>Visit us</h2>
      <span>{restaurant.address}</span>
      <a href={restaurant.mapHref} target="_blank" rel="noopener noreferrer">Get directions ↗</a>
    </div>
    <div className="footerContact">
      <h2>Call us</h2>
      <a href={restaurant.phoneHref}>{restaurant.phoneDisplay}</a>
      <span>Questions about hours or ordering? Give us a call.</span>
    </div>
    <small>Menu prices and availability may change. Please confirm with the restaurant.</small>
  </footer>
}

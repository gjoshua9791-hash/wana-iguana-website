export default function Header() {
  return <header className="siteHeader">
    <a href="#main" className="logo" aria-label="Wana Iguana, back to top">Wana Iguana</a>
    <nav className="navLinks" aria-label="Main navigation">
      <a href="#menu">Menu</a><a href="#specials">Specials</a>
      <a href="#about">About</a><a href="#contact">Contact</a>
    </nav>
    <a className="headerCall" href="tel:+16612979222">Call us ↗</a>
  </header>
}

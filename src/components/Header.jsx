const links = [
  ['home', 'Home'],
  ['menu', 'Menu'],
  ['assistant', 'Assistant'],
  ['account', 'Account'],
]

export default function Header({ page }) {
  return <header className="siteHeader">
    <a href="#/home" className="logo" aria-label="Wana Iguana, home page">Wana Iguana</a>
    <nav className="navLinks" aria-label="Main navigation">
      {links.map(([route, label]) => <a key={route} href={`#/${route}`}
        aria-current={page === route ? 'page' : undefined}>{label}</a>)}
    </nav>
  </header>
}

import { useState } from 'react'
import './App.css'
import Header from './components/Header'
import Footer from './components/Footer'
import MenuSection, { categoryId } from './components/MenuSection'
import { menu } from './data/menu'
import { restaurant } from './data/restaurant'

function App() {
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const filteredMenu = menu.map(section => ({
    ...section,
    items: section.items.filter(item =>
      [section.category, item.name, item.description].filter(Boolean)
        .some(value => value.toLowerCase().includes(query))
    ),
  })).filter(section => section.items.length > 0)
  const resultCount = filteredMenu.reduce((total, section) => total + section.items.length, 0)

  return (
    <>
      <a href="#main" className="skipLink">Skip to content</a>
      <Header />
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="heroContent">
            <p className="eyebrow">Fresh Mexican Food · Valencia, CA</p>
            <h1 id="hero-title">Come hungry.<br /><em>Leave happy.</em></h1>
            <p className="heroText">Discover Wana Iguana’s tacos, burritos and local favorites. Browse the menu and call us with questions about ordering.</p>
            <div className="heroButtons">
              <a href="#menu" className="primaryButton">Explore the menu ↗</a>
              <a href={restaurant.phoneHref} className="secondaryButton">Call the restaurant</a>
            </div>
          </div>
          <img className="heroPhoto" src="/images/taco-suave.jpeg" alt="Taco Suave from Wana Iguana" />
        </section>
        <div className="introStrip"><span>Fresh Mexican grill</span><span aria-hidden="true">✦</span><span>Valencia, California</span><span aria-hidden="true">✦</span><a href="#contact">Find us ↗</a></div>
        <section id="menu" className="menuSection" aria-labelledby="menu-title">
          <div className="sectionIntro">
            <p className="eyebrow">Find your favorite</p>
            <h2 id="menu-title">Explore the menu</h2>
            <p>Browse by category or search for a dish. Confirm current prices and availability with the restaurant.</p>
          </div>
          <div className="menuTools">
            <label htmlFor="menu-search">Search the menu</label>
            <input id="menu-search" type="search" value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Try tacos, shrimp, or burrito" />
          </div>
          <nav className="categoryNav" aria-label="Menu categories">
            {(query ? filteredMenu : menu).map(section => <a key={section.category} href={'#' + categoryId(section.category)}>{section.category}</a>)}
          </nav>
          <p className="resultsCount" role="status" aria-live="polite">
            {query ? resultCount + ' matching items' : 'All menu categories'}
          </p>
          {filteredMenu.length ? <div className="menuList">
            {filteredMenu.map(section => <MenuSection key={section.category} section={section} />)}
          </div> : <p className="emptyMessage">No dishes match your search. Try another name or category.</p>}
        </section>
        <section id="specials" className="specialsSection" aria-labelledby="specials-title">
          <p className="eyebrow">Something extra</p>
          <h2 id="specials-title">Wana Specials</h2>
          <p>Explore the Wana Specials category. Call us to ask about today’s specials and availability.</p>
          <a href="#menu" className="textLink" onClick={() => setSearch('')}>Browse the full menu ↗</a>
        </section>
        <section id="about" className="infoSection" aria-labelledby="about-title">
          <p className="eyebrow">Get to know us</p>
          <h2 id="about-title">Family-owned flavor in Valencia.</h2>
          <p>Wana Iguana serves fresh Mexican food including tacos, burritos and enchiladas. There’s something for the whole table.</p>
        </section>
        <section id="contact" className="contactSection" aria-labelledby="contact-title">
          <div className="sectionIntro">
            <p className="eyebrow">Stop by or say hello</p>
            <h2 id="contact-title">Come find us.</h2>
            <p>For current hours, menu availability or ordering questions, please call the restaurant.</p>
          </div>
          <div className="contactGrid">
            <a href={restaurant.mapHref} target="_blank" rel="noopener noreferrer" className="contactCard">
              <span>Visit</span><strong>{restaurant.address}</strong><small>Open directions ↗</small>
            </a>
            <a href={restaurant.phoneHref} className="contactCard">
              <span>Call</span><strong>{restaurant.phoneDisplay}</strong><small>Tap to call ↗</small>
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

export default App

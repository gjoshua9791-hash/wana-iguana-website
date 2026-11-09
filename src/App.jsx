import { useEffect, useState } from 'react'
import './App.css'
import Header from './components/Header'
import Footer from './components/Footer'
import MenuSection from './components/MenuSection'
import { categoryId } from './utils/categoryId'
import { parseRoute } from './utils/routes'
import { menu } from './data/menu'

function HomePage() {
  return <>
    <section className="hero" aria-labelledby="home-title">
      <div className="heroContent">
        <p className="eyebrow">Beach mural spirit · Valencia, CA</p>
        <h1 id="home-title">Wana Iguana<br /><em>Fresh Mexican Grill.</em></h1>
        <p className="heroText">Enjoy the colorful, laid-back feel of Wana Iguana while exploring tacos, burritos and local favorites.</p>
        <div className="heroButtons" aria-label="Explore the website">
          <a href="#/menu" className="primaryButton">View the menu ↗</a>
          <a href="#/assistant" className="secondaryButton">Assistant ↗</a>
          <a href="#/account" className="secondaryButton">My account ↗</a>
        </div>
      </div>
      <img className="heroPhoto" src="/images/taco-suave.jpeg" alt="Taco Suave from Wana Iguana" />
    </section>
    <div className="introStrip"><span>Fresh Mexican grill</span><span aria-hidden="true">✦</span><span>Valencia, California</span><span aria-hidden="true">✦</span><span>A little sunshine in every visit</span></div>
    <section className="homeOrders" aria-labelledby="past-orders-title">
      <div>
        <p className="eyebrow">Your favorites, one tap away</p>
        <h2 id="past-orders-title">Past orders</h2>
        <p>Your previous orders will appear here when customer accounts and online ordering are connected.</p>
      </div>
      <div className="orderEmptyCard">
        <span className="orderEmptyIcon" aria-hidden="true">↺</span>
        <h3>No past orders yet</h3>
        <p>Once order history is available, you’ll be able to pick a previous order and order it again.</p>
        <button type="button" disabled title="Order history and online ordering are not available yet">Order again · Coming soon</button>
        <a href="#/menu">Browse the menu ↗</a>
      </div>
    </section>
    <section className="specialsSection" aria-labelledby="specials-title">
      <p className="eyebrow">Something extra</p>
      <h2 id="specials-title">Wana Specials</h2>
      <p>Explore the Wana Specials category. Call us to ask about today’s specials and availability.</p>
      <a href="#/menu/wana-specials" className="textLink">See Wana Specials ↗</a>
    </section>
    <section className="infoSection" aria-labelledby="about-title">
      <p className="eyebrow">Get to know us</p>
      <h2 id="about-title">Family-owned flavor in Valencia.</h2>
      <p>Wana Iguana serves fresh Mexican food including tacos, burritos and enchiladas. There’s something for the whole table.</p>
    </section>
  </>
}

function MenuPage() {
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

  return <div className="menuPage">
    <div className="pageBanner menuBanner">
      <p className="eyebrow">A little something for everyone</p>
      <h1>Our menu</h1>
      <p>All your Wana Iguana favorites, in one place.</p>
    </div>
    <section className="menuSection" aria-labelledby="menu-title">
      <div className="sectionIntro">
        <p className="eyebrow">Find your favorite</p>
        <h2 id="menu-title">Explore the menu</h2>
        <p>Browse our chalkboard-inspired menu by category or search for a dish. Confirm current prices and availability with the restaurant.</p>
      </div>
      <div className="menuTools">
        <label htmlFor="menu-search">Search the menu</label>
        <input id="menu-search" type="search" value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Try tacos, shrimp, or burrito" />
      </div>
      <nav className="categoryNav" aria-label="Menu categories">
        {(query ? filteredMenu : menu).map(section => <a key={section.category}
          href={'#/menu/' + categoryId(section.category)}>{section.category}</a>)}
      </nav>
      <p className="resultsCount" role="status" aria-live="polite">
        {query ? resultCount + ' matching items' : 'All menu categories'}
      </p>
      {filteredMenu.length ? <div className="menuList">
        {filteredMenu.map(section => <MenuSection key={section.category} section={section} />)}
      </div> : <p className="emptyMessage">No dishes match your search. Try another name or category.</p>}
    </section>
  </div>
}

function AssistantPage() {
  return <section className="placeholderPage" aria-labelledby="assistant-title">
    <p className="eyebrow">A space for what’s next</p>
    <h1 id="assistant-title">Assistant</h1>
    <p>The Wana Iguana assistant is coming soon.</p>
    <div className="assistantCanvas" aria-hidden="true" />
  </section>
}

function AccountPage() {
  return <section className="accountPage" aria-labelledby="account-title">
    <div className="sectionIntro">
      <p className="eyebrow">Your place at the table</p>
      <h1 id="account-title">Your account</h1>
      <p>Account features are being built. Your details will appear here when sign-in and the customer backend are available.</p>
    </div>
    <div className="accountGrid">
      <section className="accountCard" aria-labelledby="profile-title">
        <h2 id="profile-title">Name</h2>
        <p>Not signed in</p>
        <small>Your name will appear here after you sign in.</small>
      </section>
      <section className="accountCard" aria-labelledby="payment-title">
        <h2 id="payment-title">Payment methods</h2>
        <p>No saved payment methods</p>
        <small>Secure payment management is coming later. Please don’t enter payment information here.</small>
      </section>
      <section className="accountCard" aria-labelledby="notifications-title">
        <h2 id="notifications-title">Notifications</h2>
        <p>No notification preferences yet</p>
        <small>You’ll be able to choose which updates you receive after account setup is available.</small>
      </section>
      <section className="accountCard" aria-labelledby="history-title">
        <h2 id="history-title">Order history</h2>
        <p>No past orders yet</p>
        <small>Previous orders and the option to order again will appear here when online ordering is connected.</small>
      </section>
      <section className="accountCard" aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>
        <p>Account settings are coming soon</p>
        <small>Profile and privacy controls will be available with customer accounts.</small>
      </section>
    </div>
  </section>
}

function App() {
  const [hash, setHash] = useState(() => window.location.hash)
  const { page, category } = parseRoute(hash)

  useEffect(() => {
    function onHashChange() { setHash(window.location.hash) }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    document.title = `${page === 'home' ? 'Home' : page === 'menu' ? 'Menu' : page === 'assistant' ? 'Assistant' : 'Account'} | Wana Iguana`
    const frame = window.requestAnimationFrame(() => {
      const categorySection = page === 'menu' && category ? document.getElementById(category) : null
      if (categorySection) {
        categorySection.scrollIntoView()
        categorySection.focus({ preventScroll: true })
      } else {
        window.scrollTo(0, 0)
        document.getElementById('main')?.focus({ preventScroll: true })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [page, category])

  function skipToContent(event) {
    event.preventDefault()
    document.getElementById('main')?.focus()
  }

  return <>
    <a href="#main" className="skipLink" onClick={skipToContent}>Skip to content</a>
    <Header page={page} />
    <main id="main" tabIndex={-1}>
      {page === 'home' && <HomePage />}
      {page === 'menu' && <MenuPage />}
      {page === 'assistant' && <AssistantPage />}
      {page === 'account' && <AccountPage />}
    </main>
    <Footer />
  </>
}

export default App

import { useEffect, useState } from 'react'
import './App.css'
import Header from './components/Header'
import Footer from './components/Footer'
import MenuItem from './components/MenuItem'
import MenuSection from './components/MenuSection'
import { filterMenuItems, menuWithCategory } from './utils/menuExplorer'
import { parseRoute } from './utils/routes'
import { menu } from './data/menu'
import { useOriginalTacos } from './utils/useOriginalTacos'
import { categoryId } from './utils/categoryId'

const ORIGINAL_TACOS = 'Original Tacos'

const specials = menu.find(section => section.category === 'Wana Specials')

const originalTacosNote = menu.find(section => section.category === ORIGINAL_TACOS)?.note

/**
 * Category-level notice for the API-backed Original Tacos category when it has not
 * successfully loaded: loading, error + Retry, or a (valid) empty category. Rendered
 * in the Original Tacos slot by the Menu page so the rest of the menu stays usable.
 * We never show stale static tacos as a substitute for a failed/pending request.
 */
function OriginalTacosNotice({ status, onRetry }) {
  const id = categoryId(ORIGINAL_TACOS)
  return (
    <section className="menuCategory" id={id} aria-labelledby={`${id}-title`} tabIndex={-1}>
      <div className="menuCategoryHeader">
        <div><h3 id={`${id}-title`}>{ORIGINAL_TACOS}</h3>{originalTacosNote && <p>{originalTacosNote}</p>}</div>
      </div>
      <div className="menuRows">
        {status === 'loading' && (
          <div className="categoryNotice" role="status" aria-busy="true">
            <p>Loading Original Tacos…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="categoryNotice" role="alert">
            <p className="categoryNoticeTitle">We couldn’t load Original Tacos.</p>
            <p>Please check your connection and try again. The rest of the menu is still available.</p>
            <button type="button" className="categoryRetry" onClick={onRetry}>Retry</button>
          </div>
        )}
        {status === 'empty' && (
          <div className="categoryNotice">
            <p className="categoryNoticeTitle">No Original Tacos are available right now.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function HomePage() {
  return <>
    <section className="hero" aria-labelledby="home-title">
      <div className="heroContent">
        <p className="eyebrow">Valencia, CA</p>
        <h1 id="home-title">Wana Iguana<br /><em>Fresh Mexican Grill.</em></h1>
        <div className="heroAbout" aria-labelledby="about-title">
          <p className="eyebrow">Get to know us</p>
          <h2 id="about-title">Family-owned flavor in Valencia.</h2>
          <p className="heroText">Wana Iguana serves fresh Mexican food including tacos, burritos and enchiladas. There’s something for the whole table.</p>
        </div>
      </div>
      <img className="heroPhoto" src="/images/taco-suave.jpeg" alt="Taco Suave from Wana Iguana" />
    </section>
    <div className="introStrip"><span>Fresh Mexican Grill</span><span aria-hidden="true">✦</span><span>Valencia, California</span><span aria-hidden="true">✦</span><span>A little sunshine in every visit</span></div>
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
      </div>
    </section>
    <section className="specialsSection" aria-labelledby="specials-title">
      <p className="eyebrow">Something Different To Try</p>
      <h2 id="specials-title">Wana Specials</h2>
      <p>These items are from the Wana Specials. Call the restaurant about today’s specials, prices and availability.</p>
      <div className="menuCategory homeSpecialsBoard">
        <div className="menuRows">
          {specials.items.map(item => <MenuItem key={item.name} item={item} />)}
        </div>
      </div>
    </section>
  </>
}

function MenuPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [maxPrice, setMaxPrice] = useState('any')
  const [popularOnly, setPopularOnly] = useState(false)
  // Single source for the whole Original Tacos category. Its data feeds both the
  // reconcile-before-filter step and the in-place cards (no divergence).
  const tacos = useOriginalTacos()

  const filtersActive = Boolean(search.trim()) || category !== 'all' || maxPrice !== 'any' || popularOnly
  // Reconcile the API category into the static menu before filtering so displayed
  // name/price and filter matches/counts agree (on success); on any other status
  // the Original Tacos items are excluded from filtering so stale static tacos
  // never match or inflate the count. Other categories pass through unchanged.
  const reconciledMenu = menuWithCategory(menu, tacos, ORIGINAL_TACOS)
  const filteredMenu = filterMenuItems(reconciledMenu, { search, category, maxPrice, popularOnly })
  const resultCount = filteredMenu.reduce((total, section) => total + section.items.length, 0)

  // When the category has not successfully loaded, its items are absent from
  // `filteredMenu`. We render a category-level notice (loading / error+Retry /
  // empty) in the Original Tacos slot — but only when that category would be
  // visible in the current view: the category filter is All or Original Tacos,
  // and no text/price filter is active (which the pending items couldn't be known
  // to satisfy). This keeps filtered views honest and other categories usable.
  const tacosPending = tacos.status !== 'success'
  const tacosCategoryVisible = category === 'all' || category === ORIGINAL_TACOS
  const textOrPriceFilterActive = Boolean(search.trim()) || maxPrice !== 'any'
  const showTacosNotice = tacosPending && tacosCategoryVisible && !textOrPriceFilterActive

  function clearFilters() {
    setSearch('')
    setCategory('all')
    setMaxPrice('any')
    setPopularOnly(false)
  }

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
      <div className="menuFilters" role="group" aria-label="Filter menu items">
        <div className="filterField">
          <label htmlFor="menu-category">Category</label>
          <select id="menu-category" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {menu.map(section => <option key={section.category} value={section.category}>{section.category}</option>)}
          </select>
        </div>
        <div className="filterField">
          <label htmlFor="menu-price">Maximum price</label>
          <select id="menu-price" value={maxPrice} onChange={event => setMaxPrice(event.target.value)}>
            <option value="any">Any price</option>
            <option value="10">$10 or less</option>
            <option value="15">$15 or less</option>
            <option value="20">$20 or less</option>
          </select>
        </div>
        <label className="filterCheckbox" htmlFor="menu-popular">
          <input id="menu-popular" type="checkbox" checked={popularOnly}
            onChange={event => setPopularOnly(event.target.checked)} /> Popular items only
        </label>
        <button className="clearFilters" type="button" onClick={clearFilters} disabled={!filtersActive}>Clear filters</button>
      </div>
      <p className="resultsCount" role="status" aria-live="polite">
        {filtersActive
          ? `${resultCount} matching ${resultCount === 1 ? 'item' : 'items'}`
          : 'All menu categories'}
      </p>
      {(filteredMenu.length || showTacosNotice) ? <div className="menuList">
        {showTacosNotice && <OriginalTacosNotice status={tacos.status} onRetry={tacos.retry} />}
        {filteredMenu.map(section => <MenuSection key={section.category} section={section} />)}
      </div> : <p className="emptyMessage">No dishes match these filters. Try changing your search, price, or category, or clear the filters.</p>}
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

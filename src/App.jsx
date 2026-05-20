
import './App.css'
import { menu } from "./data/menu";

const compactCategories = ["Drinks", "Beer"];

function App() {
  return (
    <main className="app">
      <header className="siteHeader">
        <a href="#" className="logo">Wana Iguana</a>
        <nav className="navLinks">
          <a href="#menu">Menu</a>
          <a href="#specials">Specials</a>
          <a href="#about">About Us</a>
          <a href="#contact">Contact Us</a>
        </nav>
      </header>

      <section className="hero">
        <div className="heroContent">
          <p className="eyebrow">Fresh Mexican Food</p>
        <h1>Wana Iguana Fresh Mexican Grill</h1>
        <p className="heroText">Fresh Mexican food, homemade recipes, and local favorites made for dine-in or takeout.</p>

        <div className="heroButtons">
          <a href="#menu" className="primaryButton">View Menu</a>
          <a href="tel:6612979222" className="secondaryButton">Call Us</a>
        </div>
        </div>
      </section>

      <section id="menu" className="menuSection">
        <div className="sectionIntro">
          <p className="eyebrow">Our Menu</p>
          <h2>Browse the Menu</h2>
          <p>Choose a category below or scroll through the full menu. Prices are subject to change.</p>
        </div>

        <div className="categoryNav">
          {menu.map((section) => (
            <a key={section.category} href={`#${createId(section.category)}`}>{section.category}</a>
          ))}
        </div>

        <div className="menuList">
          {menu.map((section) => {
            const isCompact = compactCategories.includes(section.category);
            return (
              <section className="menuCategory" id={createId(section.category)} key={section.category}>
                <div className="menuCategoryHeader">
                  <div>
                    <h3>{section.category}</h3>
                    {section.note && <p>{section.note}</p>}
                  </div>
                </div>

                {isCompact ? (<div className="compactItems">
                  {section.items.map((item) => (
                    <span key={item.name}>{item.name}</span>
                  ))}
                </div>) : (
                  <div className="menuRows">
                    {section.items.map((item) => (
                      <article className={`menuRow ${item.image ? "withImage" : "withoutImage"}`} key={item.name}>
                      {item.image && (<img src={item.image} alt={item.name} className="menuRowImage" />
                    )}

                    <div className="menuRowContent">
                      <div className="menuRowTop">
                        <h4>{item.name}</h4>

                        <div className="menuRowMeta">
                          {item.popular && ( <span className="popularTag">Popular</span>)}
                          {item.price && (<span className="price">{item.price}</span>)}
                        </div>
                      </div>

                      {item.description && <p>{item.description}</p>}
                    </div>
                    </article>
                    ))}
                  </div>
                )}
                
              </section>
            );

          })}
        </div>

      </section>

      <section id="about" className="infoSection">
        <p className="eyebrow">About Us</p>
        <h2>Family owned flavor in Valencia</h2>
        <p>Wana Iguana serves fresh, authentic Mexican food including delicious tacos, burritos, enchiladas, and many more items that you're 
          sure to love. We have a menu made for everyone.</p>

      </section>

      <section id="contact" className="contactSection">
        <p className="eyebrow">Contact</p>
        <h2>Visit or call us.</h2>

        <div className="contactGrid">
        <a href="tel:6612979222" className="contactCard">
          <span>Call</span>
          <strong>(661)297-9222</strong>
        </a>
        <a href="https://www.google.com/maps/search/?api=1&query=27750+McBean+Pkwy+Valencia+CA+91354"
        target="_blank" rel="noreferrer" className="contactCard">
          <span>Address</span>
          <strong>27750 McBean Pkwy, Valencia, CA 91354</strong>

        </a>
        </div>
      </section>

    </main>

  );

}
function createId(text) {
  return text.toLowerCase().replaceAll(" ", "-");
}

export default App

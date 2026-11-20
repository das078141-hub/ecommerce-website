import { useEffect, useMemo, useState } from 'react';
import { products as demoProducts } from './products';

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const categories = ['All objects', 'Furniture', 'Lighting', 'Dining', 'Decor', 'Textiles'];

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
    bag: <><path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
    user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-1.5a7 7 0 0 1 14 0V21"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    minus: <path d="M5 12h14"/>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    heart: <path d="M20.8 8.7c0 5.2-8.8 10-8.8 10s-8.8-4.8-8.8-10A4.7 4.7 0 0 1 12 6.5a4.7 4.7 0 0 1 8.8 2.2Z"/>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function App() {
  const [products, setProducts] = useState(demoProducts);
  const [category, setCategory] = useState('All objects');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem('forma-cart') || '[]'));
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('forma-user') || 'null'));
  const [token, setToken] = useState(() => localStorage.getItem('forma-token'));
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    fetch('/api/products').then((response) => response.ok ? response.json() : Promise.reject()).then((items) => {
      if (items.length) setProducts(items);
    }).catch(() => {});
  }, []);

  useEffect(() => { localStorage.setItem('forma-cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const visibleProducts = useMemo(() => products.filter((item) => {
    const matchesCategory = category === 'All objects' || item.category === category;
    const matchesSearch = `${item.name} ${item.category} ${item.color || ''}`.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [products, category, search]);
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);

  function addToCart(product) {
    setCart((current) => {
      const found = current.find((item) => item._id === product._id);
      return found ? current.map((item) => item._id === product._id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { ...product, quantity: 1 }];
    });
    setNotice(`${product.name} added to your bag`);
  }

  function changeQuantity(productId, amount) {
    setCart((current) => current.map((item) => item._id === productId ? { ...item, quantity: item.quantity + amount } : item).filter((item) => item.quantity > 0));
  }

  async function submitAuth(event) {
    event.preventDefault();
    setBusy(true);
    setAuthError('');
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authMode === 'register' ? authForm : { email: authForm.email, password: authForm.password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not sign in. Check your details and try again.');
      localStorage.setItem('forma-token', data.token);
      localStorage.setItem('forma-user', JSON.stringify(data.user));
      setToken(data.token); setUser(data.user); setAuthOpen(false); setAuthForm({ name: '', email: '', password: '' });
      setNotice(`Welcome${data.user.name ? `, ${data.user.name.split(' ')[0]}` : ''}`);
    } catch (error) { setAuthError(error.message || 'The API is not available. Start the server and connect MongoDB.'); }
    finally { setBusy(false); }
  }

  function signOut() {
    localStorage.removeItem('forma-token'); localStorage.removeItem('forma-user');
    setToken(null); setUser(null); setNotice('You have signed out');
  }

  async function checkout() {
    if (!token) { setCartOpen(false); setAuthOpen(true); setAuthMode('login'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/payments/create-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: cart.map(({ _id, quantity }) => ({ productId: _id, quantity })) }),
      });
      const order = await response.json();
      if (!response.ok) throw new Error(order.message || 'Could not start checkout.');
      const keyResponse = await fetch('/api/payments/key');
      const { key } = await keyResponse.json();
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = resolve; script.onerror = reject; document.body.appendChild(script);
        });
      }
      const checkoutWidget = new window.Razorpay({
        key, amount: order.amount, currency: order.currency, name: 'Forma', description: 'A little more considered.', order_id: order.id,
        prefill: { name: user?.name, email: user?.email }, theme: { color: '#293c32' },
        handler: async (payment) => {
          const verify = await fetch('/api/payments/verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payment),
          });
          const result = await verify.json();
          if (!verify.ok) { setNotice(result.message || 'Payment verification failed'); return; }
          setCart([]); setCartOpen(false); setNotice('Order placed. Thank you for choosing Forma.');
        },
      });
      checkoutWidget.on('payment.failed', () => setNotice('Payment was not completed. Your bag is saved.'));
      checkoutWidget.open();
    } catch (error) { setNotice(error.message || 'Checkout could not start.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="site-shell">
      <div className="announcement">A slower kind of good living <span>·</span> Complimentary shipping over ₹3,000</div>
      <header className="site-header">
        <button className="icon-button menu-toggle" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}><Icon name="menu" /></button>
        <nav className={`main-nav ${mobileNav ? 'nav-open' : ''}`} aria-label="Main navigation">
          <a href="#shop" onClick={() => setMobileNav(false)}>Shop all</a>
          <a href="#shop" onClick={() => { setCategory('Furniture'); setMobileNav(false); }}>Furniture</a>
          <a href="#story" onClick={() => setMobileNav(false)}>Our story</a>
        </nav>
        <a className="wordmark" href="#top" aria-label="Forma home">forma<span>.</span></a>
        <div className="header-actions">
          <label className="search-control"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search objects" aria-label="Search products" /></label>
          {user ? <button className="account-button signed-in" onClick={signOut} title="Sign out"><Icon name="user" size={18} /><span>{user.name?.split(' ')[0] || 'Account'}</span></button> : <button className="icon-button account-button" aria-label="Sign in" onClick={() => { setAuthOpen(true); setAuthMode('login'); }}><Icon name="user" /></button>}
          <button className="icon-button bag-button" aria-label={`Shopping bag with ${cartCount} items`} onClick={() => setCartOpen(true)}><Icon name="bag" /><span className="bag-count">{cartCount}</span></button>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <img className="hero-image" src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=2200&q=90" alt="Sunlit, thoughtfully furnished living room" />
          <div className="hero-shade" />
          <div className="hero-content">
            <span className="eyebrow light-eyebrow">Made for the everyday</span>
            <h1>Less, but<br /><em>so much better.</em></h1>
            <p>Objects with a quiet point of view.<br />Made to live with, and love for longer.</p>
            <a className="button button-light" href="#shop">Explore the collection <Icon name="arrow" size={17} /></a>
          </div>
          <div className="hero-caption"><span>01 / 03</span><span>Pieces that feel like home</span></div>
        </section>

        <section className="trust-strip" aria-label="Store benefits">
          <div><span className="trust-mark">✳</span><span>Thoughtfully sourced</span></div><i />
          <div><span className="trust-mark">↗</span><span>Made to last</span></div><i />
          <div><span className="trust-mark">♡</span><span>Delivered with care</span></div>
        </section>

        <section id="shop" className="shop-section">
          <div className="section-heading">
            <div><span className="eyebrow">The considered collection</span><h2>Good things, <em>well made.</em></h2></div>
            <p>Useful, beautiful objects for the rituals<br className="desktop-break" /> that make a life feel like yours.</p>
          </div>
          <div className="shop-toolbar">
            <div className="category-tabs" role="tablist" aria-label="Product categories">
              {categories.map((item) => <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            <span className="product-count">{visibleProducts.length} objects</span>
          </div>
          {visibleProducts.length ? <div className="product-grid">{visibleProducts.map((product, index) => (
            <article className="product-card" key={product._id} style={{ '--delay': `${index * 45}ms` }}>
              <div className="product-image-wrap">
                <img src={product.image} alt={product.name} loading="lazy" />
                {product.badge && <span className="product-badge">{product.badge}</span>}
                <button className="quick-add" onClick={() => addToCart(product)}>Add to bag <Icon name="plus" size={15} /></button>
                <button className="wishlist" aria-label={`Save ${product.name}`} onClick={(event) => { event.currentTarget.classList.toggle('saved'); setNotice('Saved to your wishlist'); }}><Icon name="heart" size={18} /></button>
              </div>
              <div className="product-info"><div><h3>{product.name}</h3><p>{product.color}</p></div><div className="product-price">{product.oldPrice && <del>{money(product.oldPrice)}</del>}<strong>{money(product.price)}</strong></div></div>
              <div className="product-rating"><Icon name="star" size={12} /><span>{product.rating || '4.8'}</span><span className="rating-separator">·</span><span>Made for everyday</span></div>
            </article>
          ))}</div> : <div className="empty-search"><span>Nothing on this shelf</span><p>Try another search or browse all objects.</p><button className="text-link" onClick={() => { setSearch(''); setCategory('All objects'); }}>Clear filters <Icon name="arrow" size={15} /></button></div>}
        </section>

        <section className="story-section" id="story">
          <div className="story-image"><img src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=85" alt="Natural textures and calm interior details" /></div>
          <div className="story-copy"><span className="eyebrow">A little more intentional</span><h2>Buy less.<br /><em>Choose well.</em></h2><p>We believe the things around us should earn their place. Forma brings together useful objects, honest materials, and thoughtful makers — pieces that make ordinary days feel a little more considered.</p><a className="text-link" href="#shop">Find your forever pieces <Icon name="arrow" size={16} /></a><span className="story-stamp">Thoughtful by nature<br />Forma, est. 2024</span></div>
        </section>

        <section className="newsletter"><span className="eyebrow light-eyebrow">A note from us, now and then</span><h2>A little good<br /><em>in your inbox.</em></h2><p>New pieces, thoughtful ideas, and the occasional lovely thing.</p><form onSubmit={(event) => { event.preventDefault(); setNotice('You’re on the list. See you in your inbox.'); event.currentTarget.reset(); }}><input type="email" placeholder="Your email address" required aria-label="Your email address" /><button type="submit" aria-label="Subscribe"><Icon name="arrow" /></button></form><small>No noise, just the good stuff.</small></section>
      </main>

      <footer className="site-footer"><a className="wordmark footer-wordmark" href="#top">forma<span>.</span></a><span>Objects for living, chosen with care.</span><div><a href="#shop">Shop</a><a href="#story">Our story</a><a href="mailto:hello@forma.store">Contact</a></div><small>© 2025 Forma Studio</small></footer>

      {notice && <div className="toast" role="status"><Icon name="check" size={17} />{notice}</div>}

      {cartOpen && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}><aside className="cart-drawer" aria-label="Shopping bag"><div className="drawer-head"><div><span className="eyebrow">Your selection</span><h2>Your bag <span>({cartCount})</span></h2></div><button className="icon-button" aria-label="Close bag" onClick={() => setCartOpen(false)}><Icon name="close" /></button></div>
        {cart.length === 0 ? <div className="empty-cart"><span className="empty-bag"><Icon name="bag" size={30} /></span><h3>A little space for something good.</h3><p>Your bag is waiting for its first find.</p><button className="button button-dark" onClick={() => setCartOpen(false)}>Explore the collection <Icon name="arrow" size={16} /></button></div> : <>
          <div className="cart-items">{cart.map((item) => <div className="cart-item" key={item._id}><img src={item.image} alt="" /><div className="cart-item-main"><h3>{item.name}</h3><span>{item.color}</span><div className="quantity-control"><button aria-label="Decrease quantity" onClick={() => changeQuantity(item._id, -1)}><Icon name="minus" size={13} /></button><span>{item.quantity}</span><button aria-label="Increase quantity" onClick={() => changeQuantity(item._id, 1)}><Icon name="plus" size={13} /></button></div></div><strong>{money(item.price * item.quantity)}</strong></div>)}</div>
          <div className="cart-summary"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><p>Shipping and taxes calculated at checkout.</p><button className="button button-dark checkout-button" disabled={busy} onClick={checkout}>{busy ? 'Preparing checkout…' : `Continue to checkout · ${money(subtotal)}`} <Icon name="arrow" size={17} /></button><span className="secure-note">Secure payments by Razorpay</span></div>
        </>}</aside></div>}

      {authOpen && <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}><section className="auth-modal" aria-label="Account access"><button className="icon-button modal-close" aria-label="Close" onClick={() => setAuthOpen(false)}><Icon name="close" /></button><span className="eyebrow">Welcome to Forma</span><h2>{authMode === 'login' ? 'Good to see you.' : 'Make yourself at home.'}</h2><p>{authMode === 'login' ? 'Sign in to continue to your bag.' : 'Create an account for a more considered shop.'}</p><form onSubmit={submitAuth}>{authMode === 'register' && <label>Your name<input autoComplete="name" value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} required minLength="2" /></label>}<label>Email address<input type="email" autoComplete="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} required /></label><label>Password<input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} required minLength="8" /></label>{authError && <div className="form-error" role="alert">{authError}</div>}<button className="button button-dark auth-submit" disabled={busy}>{busy ? 'One moment…' : authMode === 'login' ? 'Sign in' : 'Create account'} <Icon name="arrow" size={16} /></button></form><div className="auth-switch">{authMode === 'login' ? 'New to Forma?' : 'Already have an account?'} <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}> {authMode === 'login' ? 'Create an account' : 'Sign in'}</button></div><span className="auth-security"><Icon name="check" size={14} /> Your details are encrypted and secure</span></section></div>}
    </div>
  );
}

export default App;

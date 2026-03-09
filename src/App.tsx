import { useState, useEffect, useCallback, useRef } from 'react';
import BottomNav from './components/BottomNav';
import InstallGuide from './components/InstallGuide';
import type { Shop, Item, CartProfile } from './types';
import { INITIAL_SHOPS, ITEM_TEMPLATES, DEFAULT_CATEGORIES } from './types';
import './index.css';

type Tab = 'settings' | 'cart' | 'shop' | 'welcome';

// Hjælpefunktion: generér unikt ID
const uid = () => Math.random().toString(36).slice(2, 10);

// Hjælpefunktion: generér BrugerID (8 tegn)
const generateUserId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789><@()!';
  let r = '';
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
};

// SHA-256 hashing
const hashPassword = async (pwd: string) => {
  const data = new TextEncoder().encode(pwd);
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// Types for localStorage persistence
const USERS_STORAGE_KEY = 'handl_users';
const SESSION_STORAGE_KEY = 'handl_session';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('welcome');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [version] = useState('v1.0.0');

  // Login view toggle
  const [isLoginView, setIsLoginView] = useState(false);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Bruger status og Admin mock data
  const [userStatus, setUserStatus] = useState<'guest' | 'pending' | 'approved'>('guest');
  const [currentUserId, setCurrentUserId] = useState('');
  const [isAdminView, setIsAdminView] = useState(false);

  // Hent pending brugere fra localStorage (hvis admin skal kunne se dem og godkende)
  const [pendingUsers, setPendingUsers] = useState<Array<{ id: string, name: string, phone: string, time: string, status?: string }>>([]);

  const [userName, setUserName] = useState('');
  const [userSurname, setUserSurname] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [password, setPassword] = useState('');

  // Skift adgangskode
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  // Notifikationer
  const [notificationStatus, setNotificationStatus] = useState<string>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationStatus(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = () => {
    if (!('Notification' in window)) {
      alert('Din browser understøtter ikke notifikationer.');
      return;
    }
    Notification.requestPermission().then(permission => {
      setNotificationStatus(permission);
      if (permission === 'granted') {
        alert('Notifikationer er nu slået til! (Der kræves en backend for at sende dem).');
      }
    });
  };

  // Persisterede data med initiale værdier og lazy init
  const loadData = <T,>(key: string, defaultValue: T): T => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  };

  // Butikker (redigerbare)
  const [shops, setShops] = useState<Shop[]>(() => loadData('handl_shops', INITIAL_SHOPS));
  const [newShopName, setNewShopName] = useState('');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  // Skabelon (varer + kategorier)
  const [templateItems, setTemplateItems] = useState<Item[]>(() => loadData('handl_templates', ITEM_TEMPLATES));
  const [categories, setCategories] = useState<string[]>(() => loadData('handl_categories', DEFAULT_CATEGORIES));
  const [newItemName, setNewItemName] = useState('');
  const [newItemCat, setNewItemCat] = useState(DEFAULT_CATEGORIES[0] || '');
  const [newCatName, setNewCatName] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState('');

  // Varer til stede i butiksvisningen (fjernes fra skabelon når valgt)
  const [availableItems, setAvailableItems] = useState<Item[]>(templateItems);

  // Flere indkøbskurve
  const [carts, setCarts] = useState<CartProfile[]>(() => loadData('handl_carts', [{ id: 'mine', name: 'Min kurv', userId: '', items: [] }]));
  const [activeCartId, setActiveCartId] = useState(() => loadData('handl_activeCartId', 'mine'));
  const [newCartName, setNewCartName] = useState('');

  // Fælles indkøbskurv (del BrugerID)
  const [sharedUserId, setSharedUserId] = useState('');

  // Sorter loginError når der skiftes view
  useEffect(() => {
    setLoginError('');
  }, [isLoginView]);

  // Sync state to local storage
  useEffect(() => { localStorage.setItem('handl_shops', JSON.stringify(shops)); }, [shops]);
  useEffect(() => { localStorage.setItem('handl_templates', JSON.stringify(templateItems)); }, [templateItems]);
  useEffect(() => { localStorage.setItem('handl_categories', JSON.stringify(categories)); }, [categories]);
  useEffect(() => { localStorage.setItem('handl_carts', JSON.stringify(carts)); }, [carts]);
  useEffect(() => { localStorage.setItem('handl_activeCartId', JSON.stringify(activeCartId)); }, [activeCartId]);

  // Check for active session on load
  useEffect(() => {
    try {
      const usersRaw = localStorage.getItem(USERS_STORAGE_KEY) || '[]';
      const users = JSON.parse(usersRaw);

      const pending = users.filter((u: any) => u.status === 'pending');
      setPendingUsers(pending);

      const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
      if (savedSession) {
        const user = users.find((u: any) => u.id === savedSession);
        if (user) {
          setCurrentUserId(user.id);
          setUserStatus(user.status || 'guest'); // pending or approved
          if (user.status === 'approved') setActiveTab('shop');
        }
      }
    } catch (e) {
      console.error("Local storage error:", e);
    }
  }, []);

  // Timeout refs for kurv-items (så de kan annulleres)
  const checkTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Antal pr. vare (i butik, inden tilføjelse)
  const [itemQuantities, setItemQuantities] = useState<Record<string, string>>({});

  // Filter i kurv
  const [filterShop, setFilterShop] = useState<string | 'all'>('all');

  // ─── Tema ───
  useEffect(() => {
    document.body.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // ─── 10-sekunders auto-opdatering ───
  useEffect(() => {
    const interval = setInterval(() => {
      // I prototype opdaterer vi blot state-timestamp for at trigge re-render
      // I produktion ville dette være en fetch til serveren
      console.log('[handl] Auto-opdatering...', new Date().toLocaleTimeString('da-DK'));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // ─── Hjælpefunktioner ───
  const activeCart = carts.find(c => c.id === activeCartId) || carts[0];

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userSurname.trim() || !userPhone.trim() || !password.trim()) return;
    const hashed = await hashPassword(password);
    setPassword('');
    const newUserId = generateUserId();
    setCurrentUserId(newUserId);
    setCarts(prev => prev.map(c => c.id === 'mine' ? { ...c, userId: newUserId } : c));

    // Gem bruger i lokal databasen (localStorage)
    const newUser = {
      id: newUserId,
      name: `${userName} ${userSurname}`,
      phone: userPhone,
      hashedPassword: hashed,
      time: new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }),
      status: 'pending' // Default ny bruger
    };

    try {
      const usersRaw = localStorage.getItem(USERS_STORAGE_KEY) || '[]';
      const users = JSON.parse(usersRaw);
      users.push(newUser);
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (e) { console.error('Failed to save user', e); }

    // Start session
    localStorage.setItem(SESSION_STORAGE_KEY, newUserId);

    setPendingUsers(prev => [...prev, newUser]);
    setUserStatus('pending');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginPhone.trim() || !loginPassword.trim()) return;

    try {
      const usersRaw = localStorage.getItem(USERS_STORAGE_KEY) || '[]';
      const users = JSON.parse(usersRaw);
      const user = users.find((u: any) => u.phone === loginPhone);

      if (!user) {
        setLoginError('Brugeren blev ikke fundet.');
        return;
      }

      const inputHash = await hashPassword(loginPassword);
      if (user.hashedPassword !== inputHash) {
        setLoginError('Forkert adgangskode.');
        return;
      }

      // Login succesfuldt
      localStorage.setItem(SESSION_STORAGE_KEY, user.id);
      setCurrentUserId(user.id);
      setUserStatus(user.status || 'guest');
      if (user.status === 'approved') setActiveTab('shop');

    } catch (e) { console.error('Error logging in', e); }
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setUserStatus('guest');
    setCurrentUserId('');
    setActiveTab('welcome');
    setIsLoginView(true); // Gør det let at logge ind igen
    setLoginPhone('');
    setLoginPassword('');
  };

  const handleChangePassword = useCallback(async () => {
    if (!oldPw.trim() || !newPw.trim()) return;
    const inputHash = await hashPassword(oldPw);

    // Find nuværende gemte hash
    const usersRaw = localStorage.getItem(USERS_STORAGE_KEY) || '[]';
    const users = JSON.parse(usersRaw);
    const currentUser = users.find((u: any) => u.id === currentUserId);

    if (inputHash !== currentUser?.hashedPassword) {
      setPwMsg('Forkert nuværende adgangskode');
      return;
    }

    const newHash = await hashPassword(newPw);

    // Opdater databasen
    const updatedUsers = users.map((u: any) => {
      if (u.id === currentUserId) return { ...u, hashedPassword: newHash };
      return u;
    });
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));

    setOldPw('');
    setNewPw('');
    setPwMsg('Adgangskode ændret!');
    setTimeout(() => setPwMsg(''), 3000);
  }, [oldPw, newPw, currentUserId]);

  // Tilføj vare til kurv fra butik
  const addItemToCart = (item: Item) => {
    if (!selectedShop) return;
    const qty = itemQuantities[item.id] || '';
    const cartItem = { ...item, shopId: selectedShop.id, checked: false, quantity: qty || undefined };
    setCarts(prev => prev.map(c =>
      c.id === activeCartId
        ? { ...c, items: [...c.items, cartItem] }
        : c
    ));
    setAvailableItems(prev => prev.filter(i => i.id !== item.id));
    // Ryd antal-input for denne vare
    setItemQuantities(prev => { const n = { ...prev }; delete n[item.id]; return n; });
  };

  // Toggle flueben i kurv (kan annulleres inden 3 sek.)
  const toggleItemInCart = (itemId: string) => {
    // Tjek om varen allerede er markeret
    const item = activeCart.items.find(i => i.id === itemId);
    if (!item) return;

    if (item.checked) {
      // Fjern fluebenet → annullér timeout
      if (checkTimers.current[itemId]) {
        clearTimeout(checkTimers.current[itemId]);
        delete checkTimers.current[itemId];
      }
      setCarts(prev => prev.map(c =>
        c.id === activeCartId
          ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, checked: false, lastCheckedAt: undefined } : i) }
          : c
      ));
    } else {
      // Sæt flueben → start 3 sek. timer
      setCarts(prev => prev.map(c =>
        c.id === activeCartId
          ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, checked: true, lastCheckedAt: Date.now() } : i) }
          : c
      ));
      const timer = setTimeout(() => {
        setCarts(prev => prev.map(c => {
          if (c.id !== activeCartId) return c;
          const removedItem = c.items.find(i => i.id === itemId);
          // Kun fjern hvis den stadig er markeret
          if (removedItem && removedItem.checked) {
            setAvailableItems(ai => {
              // Undgå dubletter: kun tilføj hvis den ikke allerede er der
              if (ai.some(existing => existing.id === removedItem.id)) return ai;
              return [...ai, { ...removedItem, checked: false, shopId: undefined }];
            });
            return { ...c, items: c.items.filter(i => i.id !== itemId) };
          }
          return c;
        }));
        delete checkTimers.current[itemId];
      }, 3000);
      checkTimers.current[itemId] = timer;
    }
  };

  // Tilføj ny kurv
  const addCart = () => {
    if (!newCartName.trim()) return;
    const newCart: CartProfile = { id: uid(), name: newCartName, userId: generateUserId(), items: [] };
    setCarts(prev => [...prev, newCart]);
    setNewCartName('');
  };

  // Slet kurv
  const deleteCart = (cartId: string) => {
    if (cartId === 'mine') return; // Kan ikke slette primær kurv
    setCarts(prev => prev.filter(c => c.id !== cartId));
    if (activeCartId === cartId) setActiveCartId('mine');
  };

  // Tilføj butik
  const addShop = () => {
    if (!newShopName.trim()) return;
    setShops(prev => [...prev, { id: uid(), name: newShopName }]);
    setNewShopName('');
  };

  // Slet butik
  const deleteShop = (shopId: string) => {
    if (shopId === 'random') return; // "Tilfældig" kan ikke slettes
    setShops(prev => prev.filter(s => s.id !== shopId));
  };

  // Tilføj vare til skabelon
  const addTemplateItem = () => {
    if (!newItemName.trim()) return;
    const newItem: Item = { id: uid(), name: newItemName, category: newItemCat, checked: false };
    setTemplateItems(prev => [...prev, newItem]);
    setAvailableItems(prev => [...prev, newItem]);
    setNewItemName('');
  };

  // Slet vare fra skabelon
  const deleteTemplateItem = (itemId: string) => {
    setTemplateItems(prev => prev.filter(i => i.id !== itemId));
    setAvailableItems(prev => prev.filter(i => i.id !== itemId));
  };

  // Redigér vare i skabelon
  const saveEditItem = (itemId: string) => {
    if (!editItemName.trim()) return;
    setTemplateItems(prev => prev.map(i => i.id === itemId ? { ...i, name: editItemName } : i));
    setAvailableItems(prev => prev.map(i => i.id === itemId ? { ...i, name: editItemName } : i));
    setEditingItem(null);
    setEditItemName('');
  };

  // Tilføj kategori
  const addCategory = () => {
    if (!newCatName.trim() || categories.includes(newCatName)) return;
    setCategories(prev => [...prev, newCatName]);
    setNewCatName('');
  };

  // Slet kategori
  const deleteCategory = (cat: string) => {
    setCategories(prev => prev.filter(c => c !== cat));
  };

  // ─── RENDER: Velkomstside ───
  const renderWelcome = () => (
    <div className="container" style={{ textAlign: 'center', paddingTop: '80px' }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '0.5rem' }}>handl.</h1>
      <p style={{ opacity: 0.7, fontSize: '1.2rem', marginBottom: '40px' }}>Din personlige indkøbsliste</p>

      {isLoginView ? (
        <form onSubmit={handleLogin} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {loginError && <p style={{ color: 'var(--danger)', margin: 0, fontSize: '0.9rem', textAlign: 'center' }}>{loginError}</p>}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', opacity: 0.7, fontSize: '0.9rem' }}>Telefonnummer</label>
            <input type="tel" placeholder="+45 00 00 00 00" value={loginPhone} onChange={e => setLoginPhone(e.target.value)} required />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', opacity: 0.7, fontSize: '0.9rem' }}>Adgangskode</label>
            <input type="password" placeholder="Din adgangskode..." value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '16px', borderRadius: '40px', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: 600, marginTop: '8px' }}>
            Log ind
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', opacity: 0.7, fontSize: '0.9rem' }}>Navn</label>
            <input type="text" placeholder="Fornavn..." value={userName} onChange={e => setUserName(e.target.value)} required />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', opacity: 0.7, fontSize: '0.9rem' }}>Efternavn</label>
            <input type="text" placeholder="Efternavn..." value={userSurname} onChange={e => setUserSurname(e.target.value)} required />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', opacity: 0.7, fontSize: '0.9rem' }}>Telefonnummer (inkl. landekode)</label>
            <input type="tel" placeholder="+45 00 00 00 00" value={userPhone} onChange={e => setUserPhone(e.target.value)} required />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', opacity: 0.7, fontSize: '0.9rem' }}>Adgangskode (bliver krypteret)</label>
            <input type="password" placeholder="Din adgangskode..." value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '16px', borderRadius: '40px', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: 600, marginTop: '8px' }}>
            Opret profil
          </button>
        </form>
      )}

      <button
        onClick={() => setIsLoginView(!isLoginView)}
        style={{
          background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600,
          marginTop: '20px', cursor: 'pointer', fontSize: '0.95rem'
        }}
      >
        {isLoginView ? 'Ny her? Opret profil' : 'Har du allerede en konto? Log ind'}
      </button>

      <div style={{ position: 'fixed', bottom: '40px', width: '100%', left: 0 }}>
        <p style={{ opacity: 0.4, fontSize: '0.9rem' }}>{version} | handl.junkerne.dk</p>
      </div>
    </div>
  );

  // ─── RENDER: Indstillinger ───
  const renderSettings = () => (
    <div className="container">
      <h2 style={{ marginBottom: '20px' }}>Indstillinger</h2>

      {/* Tema */}
      <div className="glass settings-section">
        <h3>Udseende</h3>
        <div className="toggle-row">
          <span>Mørk tilstand</span>
          <button className="toggle-btn" onClick={() => setIsDarkMode(!isDarkMode)} style={{ background: isDarkMode ? 'var(--primary)' : '#ccc' }}>
            <div className="toggle-knob" style={{ left: isDarkMode ? '27px' : '3px' }} />
          </button>
        </div>
      </div>

      {/* Fælles indkøbskurv */}
      <div className="glass settings-section">
        <h3>Fælles indkøbskurv</h3>
        <p style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: 0 }}>Del dit BrugerID med andre for at dele din indkøbskurv</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <code style={{ background: 'rgba(0,0,0,0.05)', padding: '10px 14px', borderRadius: '10px', flex: 1, fontSize: '1.1rem', letterSpacing: '1px' }}>
            {activeCart.userId || 'Opret profil først'}
          </code>
          <button onClick={() => navigator.clipboard.writeText(activeCart.userId)} className="glass" style={{ padding: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer' }} title="Kopier ID">
            📋
          </button>
        </div>
        <hr className="separator" />
        <p style={{ fontSize: '0.85rem', opacity: 0.6, margin: '12px 0 8px' }}>Tilføj en anden persons BrugerID for at se deres kurv</p>
        <div className="inline-form">
          <input type="text" placeholder="Indsæt BrugerID..." value={sharedUserId} onChange={e => setSharedUserId(e.target.value)} />
          <button className="btn-primary" onClick={() => { if (sharedUserId.trim()) { alert(`BrugerID '${sharedUserId}' tilføjet! (Kræver backend)`); setSharedUserId(''); } }}>Tilføj</button>
        </div>
      </div>

      {/* Flere indkøbskurve */}
      <div className="glass settings-section">
        <h3>Mine indkøbskurve</h3>
        <p style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: 0 }}>Vælg aktiv kurv eller opret en ny (f.eks. til din mor)</p>
        <div className="chip-list">
          {carts.map(c => (
            <div key={c.id} className={`chip glass ${c.id === activeCartId ? 'btn-primary' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setActiveCartId(c.id)}>
              <span>{c.name}</span>
              {c.id !== 'mine' && <button className="delete-chip" onClick={e => { e.stopPropagation(); deleteCart(c.id); }}>×</button>}
            </div>
          ))}
        </div>
        {activeCartId !== 'mine' && activeCart && (
          <div style={{ marginTop: '12px', fontSize: '0.85rem', opacity: 0.6 }}>
            BrugerID for "{activeCart.name}": <code>{activeCart.userId}</code>
            <button onClick={() => navigator.clipboard.writeText(activeCart.userId)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '4px' }}>📋</button>
          </div>
        )}
        <div className="inline-form">
          <input type="text" placeholder="Ny kurv (f.eks. Mors kurv)..." value={newCartName} onChange={e => setNewCartName(e.target.value)} />
          <button className="btn-primary" onClick={addCart}>Opret</button>
        </div>
      </div>

      {/* Skift adgangskode */}
      <div className="glass settings-section">
        <h3>Skift adgangskode</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input type="password" placeholder="Nuværende adgangskode" value={oldPw} onChange={e => setOldPw(e.target.value)} />
          <input type="password" placeholder="Ny adgangskode" value={newPw} onChange={e => setNewPw(e.target.value)} />
          <button className="btn-primary" onClick={handleChangePassword} style={{ padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Skift adgangskode</button>
          {pwMsg && <p style={{ margin: 0, fontSize: '0.85rem', color: pwMsg.includes('ændret') ? 'var(--success)' : 'var(--danger)' }}>{pwMsg}</p>}
        </div>
      </div>

      {/* Notifikationer */}
      <div className="glass settings-section">
        <h3>Notifikationer</h3>
        <p style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: 0 }}>Modtag besked når andre tilføjer varer til kurven</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.05)', padding: '12px 16px', borderRadius: '12px' }}>
          <span style={{ fontWeight: 500 }}>
            Status: {notificationStatus === 'granted' ? 'Slået til ✅' : notificationStatus === 'denied' ? 'Blokeret ❌' : 'Ikke spurgt'}
          </span>
          {notificationStatus !== 'granted' && (
            <button
              className="btn-primary"
              onClick={requestNotificationPermission}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              Slå til
            </button>
          )}
        </div>
      </div>

      {/* Log ud */}
      <div className="glass settings-section" style={{ textAlign: 'center' }}>
        <button
          onClick={handleLogout}
          style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--danger)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
          Log ud
        </button>
      </div>

      {/* Butiksstyring */}
      <div className="glass settings-section">
        <h3>Butikker</h3>
        <div className="chip-list">
          {shops.map(s => (
            <div key={s.id} className="chip glass">
              <span>{s.name}</span>
              {s.id !== 'random' && <button className="delete-chip" onClick={() => deleteShop(s.id)}>×</button>}
            </div>
          ))}
        </div>
        <div className="inline-form">
          <input type="text" placeholder="Ny butik..." value={newShopName} onChange={e => setNewShopName(e.target.value)} />
          <button className="btn-primary" onClick={addShop}>Tilføj</button>
        </div>
      </div>

      {/* Skabelonstyring: Kategorier */}
      <div className="glass settings-section">
        <h3>Varegrupper</h3>
        <div className="chip-list">
          {categories.map(cat => (
            <div key={cat} className="chip glass">
              <span>{cat}</span>
              <button className="delete-chip" onClick={() => deleteCategory(cat)}>×</button>
            </div>
          ))}
        </div>
        <div className="inline-form">
          <input type="text" placeholder="Ny varegruppe..." value={newCatName} onChange={e => setNewCatName(e.target.value)} />
          <button className="btn-primary" onClick={addCategory}>Tilføj</button>
        </div>
      </div>

      {/* Skabelonstyring: Varer */}
      <div className="glass settings-section">
        <h3>Vareskabelon</h3>
        {categories.map(cat => {
          const catItems = templateItems.filter(i => i.category === cat);
          if (catItems.length === 0) return null;
          return (
            <div key={cat} style={{ marginBottom: '16px' }}>
              <p style={{ fontWeight: 600, fontSize: '0.9rem', opacity: 0.7, marginBottom: '8px' }}>{cat}</p>
              {catItems.map(item => (
                <div key={item.id} className="template-item glass">
                  {editingItem === item.id ? (
                    <div className="inline-form" style={{ flex: 1, marginTop: 0 }}>
                      <input value={editItemName} onChange={e => setEditItemName(e.target.value)} autoFocus />
                      <button className="btn-primary" onClick={() => saveEditItem(item.id)}>Gem</button>
                    </div>
                  ) : (
                    <>
                      <div className="item-info">
                        <span>{item.name}</span>
                      </div>
                      <div className="item-actions">
                        <button onClick={() => { setEditingItem(item.id); setEditItemName(item.name); }}>✏️</button>
                        <button onClick={() => deleteTemplateItem(item.id)}>🗑️</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        <hr className="separator" />
        <p style={{ fontSize: '0.85rem', opacity: 0.6, margin: '8px 0' }}>Tilføj ny vare</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input type="text" placeholder="Varenavn..." value={newItemName} onChange={e => setNewItemName(e.target.value)} />
          <select value={newItemCat} onChange={e => setNewItemCat(e.target.value)}>
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <button className="btn-primary" onClick={addTemplateItem} style={{ padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Tilføj vare</button>
        </div>
      </div>

      {/* Bunden justeret */}

      <div style={{ textAlign: 'center', opacity: 0.3, fontSize: '0.75rem', marginTop: '30px' }}>
        Handl {version}
      </div>
    </div>
  );

  // ─── RENDER: Butik ───
  const renderShop = () => (
    <div className="container">
      <h2 style={{ marginBottom: '20px' }}>Butikker</h2>

      {/* Kurv-vælger */}
      {carts.length > 1 && (
        <div className="cart-selector">
          {carts.map(c => (
            <button key={c.id} className={`glass ${c.id === activeCartId ? 'btn-primary' : ''}`} onClick={() => setActiveCartId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '28px' }}>
        {shops.map(shop => (
          <button key={shop.id} className={`glass ${selectedShop?.id === shop.id ? 'btn-primary' : ''}`}
            style={{ padding: '22px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '1.05rem', fontWeight: 600 }}
            onClick={() => setSelectedShop(shop)}
          >
            {shop.name}
          </button>
        ))}
      </div>

      {selectedShop && (
        <>
          <h3 style={{ marginBottom: '14px' }}>Varer i {selectedShop.name}</h3>
          {availableItems.length === 0 ? (
            <div className="glass" style={{ padding: '30px', borderRadius: '20px', textAlign: 'center', opacity: 0.6 }}>Alle varer er allerede i kurven</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {categories.map(cat => {
                const catItems = availableItems.filter(i => i.category === cat);
                if (catItems.length === 0) return null;
                return (
                  <div key={cat}>
                    <p style={{ fontWeight: 600, fontSize: '0.8rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{cat}</p>
                    {catItems.map(item => (
                      <div key={item.id} className="glass"
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}
                      >
                        <span style={{ fontWeight: 500, flex: 1 }}>{item.name}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Antal"
                          value={itemQuantities[item.id] || ''}
                          onChange={e => setItemQuantities(prev => ({ ...prev, [item.id]: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '60px', padding: '6px 8px', borderRadius: '8px', textAlign: 'center', fontSize: '0.85rem' }}
                        />
                        <button
                          onClick={() => addItemToCart(item)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', opacity: 0.5, padding: '4px 8px' }}
                        >+</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );

  // ─── RENDER: Indkøbskurv ───
  const renderCart = () => {
    const cartItems = activeCart.items;

    const filteredItems = filterShop === 'all'
      ? cartItems
      : cartItems.filter(i => i.shopId === filterShop);

    const grouped = filteredItems.reduce((acc, item) => {
      const shopName = shops.find(s => s.id === item.shopId)?.name || 'Ukendt';
      if (!acc[shopName]) acc[shopName] = [];
      acc[shopName].push(item);
      return acc;
    }, {} as Record<string, Item[]>);

    return (
      <div className="container">
        <h2 style={{ marginBottom: '20px' }}>Indkøbskurv</h2>

        {/* Kurv-vælger */}
        {carts.length > 1 && (
          <div className="cart-selector">
            {carts.map(c => (
              <button key={c.id} className={`glass ${c.id === activeCartId ? 'btn-primary' : ''}`} onClick={() => setActiveCartId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Butiks-filter */}
        <div className="filter-pills">
          <button className={`filter-pill glass ${filterShop === 'all' ? 'btn-primary' : ''}`} onClick={() => setFilterShop('all')}>Alle</button>
          {shops.map(s => (
            <button key={s.id} className={`filter-pill glass ${filterShop === s.id ? 'btn-primary' : ''}`} onClick={() => setFilterShop(s.id)}>
              {s.name}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 ? (
          <div className="glass" style={{ padding: '40px', borderRadius: '20px', textAlign: 'center', opacity: 0.6 }}>
            {filterShop === 'all' ? 'Din kurv er tom' : `Ingen varer fra ${shops.find(s => s.id === filterShop)?.name}`}
          </div>
        ) : (
          Object.entries(grouped).map(([shopName, shopItems]) => (
            <div key={shopName} style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '0.9rem', opacity: 0.5, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>{shopName}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {shopItems.map(item => (
                  <div key={item.id} className="glass"
                    style={{ padding: '14px 18px', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: item.checked ? 0.4 : 1, transition: '0.3s', textDecoration: item.checked ? 'line-through' : 'none' }}
                  >
                    <span style={{ fontWeight: 500 }}>
                      {item.name}{item.quantity ? <span style={{ opacity: 0.5, marginLeft: '8px', fontSize: '0.85rem' }}>({item.quantity})</span> : ''}
                    </span>
                    <input type="checkbox" checked={item.checked} onChange={() => toggleItemInCart(item.id)}
                      style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  // ─── RENDER: Afventer Godkendelse ───
  const renderPending = () => (
    <div className="container" style={{ textAlign: 'center', paddingTop: '15vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: '20px', animation: 'spin 4s linear infinite' }}>⏳</div>
      <h2 style={{ marginBottom: '15px' }}>Afventer godkendelse</h2>
      <p style={{ opacity: 0.6, lineHeight: 1.5, maxWidth: '280px', marginBottom: '40px' }}>
        Din profil er oprettet og afventer admin-godkendelse. Du får besked via WhatsApp, når du kan handle.
      </p>

      {/* Skjult Admin-adgang (mock) for at kunne teste flowet */}
      <button
        style={{
          background: 'none', border: 'none', color: 'inherit', opacity: 0.1,
          fontSize: '0.8rem', cursor: 'pointer', padding: '20px'
        }}
        onClick={() => setIsAdminView(true)}
      >
        [ Åbn Prototype Admin Panel ]
      </button>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );

  // ─── RENDER: Admin Panel (Mock) ───
  const renderAdminPanel = () => (
    <div className="container" style={{ paddingTop: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Admin Panel</h2>
        <button
          className="glass"
          style={{ padding: '8px 16px', borderRadius: '12px', border: 'none', cursor: 'pointer' }}
          onClick={() => setIsAdminView(false)}
        >
          Luk
        </button>
      </div>

      <p style={{ opacity: 0.6, marginBottom: '30px' }}>
        Godkend eller afvis nye brugere. (Når du godkender din egen nyoprettede testbruger, får du adgang til appen).
      </p>

      {pendingUsers.length === 0 ? (
        <div className="glass" style={{ padding: '40px', borderRadius: '20px', textAlign: 'center', opacity: 0.6 }}>
          Ingen brugere afventer just nu
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {pendingUsers.map(u => (
            <div key={u.id} className="glass" style={{ padding: '20px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 600, margin: '0 0 4px 0', fontSize: '1.1rem' }}>
                  {u.name} {u.id === currentUserId && <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--primary)', padding: '2px 6px', borderRadius: '6px', marginLeft: '6px' }}>Dig</span>}
                </p>
                <p style={{ opacity: 0.6, margin: 0, fontSize: '0.85rem' }}>{u.phone} • {u.time}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  style={{ background: 'var(--danger)', color: 'white', border: 'none', width: '40px', height: '40px', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                  onClick={() => setPendingUsers(prev => prev.filter(user => user.id !== u.id))}
                >
                  ✕
                </button>
                <button
                  style={{ background: 'var(--success)', color: 'white', border: 'none', height: '40px', padding: '0 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => {
                    // Åbn WhatsApp med forudfyldt besked
                    const cleanPhone = u.phone.replace(/[^0-9]/g, '');
                    const msg = encodeURIComponent(`Hej ${u.name}! Din profil på 'handl' er nu godkendt. ✅\nDu kan nu handle videre på: https://handl.junkerne.dk`);
                    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');

                    // Opdater localStorage database at denne bruger er approved
                    try {
                      const usersRaw = localStorage.getItem(USERS_STORAGE_KEY) || '[]';
                      const users = JSON.parse(usersRaw);
                      const updatedUsers = users.map((dbUser: any) => {
                        if (dbUser.id === u.id) return { ...dbUser, status: 'approved' };
                        return dbUser;
                      });
                      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
                    } catch (e) { console.error(e); }

                    setPendingUsers(prev => prev.filter(user => user.id !== u.id));
                    if (u.id === currentUserId) {
                      setUserStatus('approved');
                      setActiveTab('shop');
                      setIsAdminView(false);
                    }
                  }}
                >
                  Godkend
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (isAdminView) return <main>{renderAdminPanel()}</main>;
  if (userStatus === 'pending') return <main>{renderPending()}</main>;

  return (
    <>
      <main>
        {userStatus === 'guest' && renderWelcome()}
        {userStatus === 'approved' && activeTab === 'settings' && renderSettings()}
        {userStatus === 'approved' && activeTab === 'cart' && renderCart()}
        {userStatus === 'approved' && activeTab === 'shop' && renderShop()}
      </main>

      {userStatus === 'approved' && (
        <BottomNav
          activeTab={activeTab as 'settings' | 'cart' | 'shop'}
          onTabChange={tab => setActiveTab(tab)}
        />
      )}

      {/* PWA Install Guide for iOS */}
      <InstallGuide />
    </>
  );
}

export default App;

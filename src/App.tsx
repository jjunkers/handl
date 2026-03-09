import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import BottomNav from './components/BottomNav';
import InstallGuide from './components/InstallGuide';
import type { Shop, Item, CartProfile, User } from './types';
import { INITIAL_SHOPS, ITEM_TEMPLATES, DEFAULT_CATEGORIES } from './types';
import './index.css';

type Tab = 'settings' | 'cart' | 'shop' | 'welcome' | 'admin';

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
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'user'>('user');

  // Alle brugere (kun relevant for admin, men vi henter dem)
  const [allUsers, setAllUsers] = useState<User[]>([]);

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

  // Mellem-state under editering
  const [newItemName, setNewItemName] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [newShopName, setNewShopName] = useState('');

  // Flere indkøbskurve
  const [carts, setCarts] = useState<CartProfile[]>(() => loadData('handl_carts', [{
    id: 'mine',
    name: 'Min kurv',
    userId: '',
    items: [],
    shops: INITIAL_SHOPS,
    categories: DEFAULT_CATEGORIES,
    templateItems: ITEM_TEMPLATES
  }]));
  const [activeCartId, setActiveCartId] = useState(() => loadData('handl_activeCartId', 'mine'));
  const [newCartName, setNewCartName] = useState('');

  // Fælles indkøbskurv (del BrugerID)
  const [sharedUserId, setSharedUserId] = useState('');

  // Sorter loginError når der skiftes view
  useEffect(() => {
    setLoginError('');
  }, [isLoginView]);

  // Active cart references
  const activeCart = useMemo(() => carts.find(c => c.id === activeCartId) || carts[0], [carts, activeCartId]);

  // Derived state from active cart
  const shops = activeCart?.shops || INITIAL_SHOPS;
  const templateItems = activeCart?.templateItems || ITEM_TEMPLATES;
  const categories = activeCart?.categories || DEFAULT_CATEGORIES;

  const [newItemCat, setNewItemCat] = useState(categories[0] || '');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  // Varer til stede i butiksvisningen (fjernes fra skabelon når valgt)
  const [availableItems, setAvailableItems] = useState<Item[]>(activeCart?.templateItems || ITEM_TEMPLATES);

  // Sync state to local storage
  useEffect(() => { localStorage.setItem('handl_carts', JSON.stringify(carts)); }, [carts]);
  useEffect(() => { localStorage.setItem('handl_activeCartId', JSON.stringify(activeCartId)); }, [activeCartId]);

  // Check for active session on load
  useEffect(() => {
    try {
      const usersRaw = localStorage.getItem(USERS_STORAGE_KEY) || '[]';
      const users: User[] = JSON.parse(usersRaw);

      setAllUsers(users);

      const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
      if (savedSession) {
        const user = users.find((u: any) => u.id === savedSession);
        if (user) {
          setCurrentUserId(user.id);
          setUserStatus(user.status || 'guest'); // pending or approved
          setCurrentUserRole(user.role || 'user');
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

  // ─── Synkroniser 'mine' kurv userId med currentUserId ───
  useEffect(() => {
    if (currentUserId) {
      setCarts(prev => prev.map(c => c.id === 'mine' ? { ...c, userId: currentUserId } : c));
    }
  }, [currentUserId]);

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userSurname.trim() || !userPhone.trim() || !password.trim()) return;
    const hashed = await hashPassword(password);
    setPassword('');
    const newUserId = generateUserId();
    setCurrentUserId(newUserId);
    setCarts(prev => prev.map(c => c.id === 'mine' ? { ...c, userId: newUserId } : c));

    // Gør den første testbruger med navn "Admin" til administrator
    const role = userName.toLowerCase() === 'admin' ? 'admin' : 'user';

    // Gem bruger i lokal databasen (localStorage)
    const newUser: User = {
      id: newUserId,
      name: `${userName} ${userSurname} `,
      phone: userPhone,
      hashedPassword: hashed,
      time: new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }),
      status: role === 'admin' ? 'approved' : 'pending',
      role: role
    };

    try {
      const usersRaw = localStorage.getItem(USERS_STORAGE_KEY) || '[]';
      const users: User[] = JSON.parse(usersRaw);
      users.push(newUser);
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
      setAllUsers(users);
    } catch (e) { console.error('Failed to save user', e); }

    // Start session
    localStorage.setItem(SESSION_STORAGE_KEY, newUserId);

    setCurrentUserRole(role);
    setUserStatus(newUser.status);
    if (newUser.status === 'approved') {
      setActiveTab('shop');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginPhone.trim() || !loginPassword.trim()) return;

    try {
      const usersRaw = localStorage.getItem(USERS_STORAGE_KEY) || '[]';
      const users = JSON.parse(usersRaw);
      const user = users.find((u: any) => u.phone.trim() === loginPhone.trim());

      if (!user) {
        setLoginError('Brugeren blev ikke fundet.');
        return;
      }

      const inputHash = await hashPassword(loginPassword.trim());
      if (user.hashedPassword !== inputHash) {
        setLoginError('Forkert adgangskode.');
        return;
      }

      // Login succesfuldt
      localStorage.setItem(SESSION_STORAGE_KEY, user.id);
      setCurrentUserId(user.id);
      setUserStatus(user.status || 'guest');
      setCurrentUserRole(user.role || 'user');

      if (user.status === 'approved') {
        setActiveTab('shop');
      } else {
        setActiveTab('welcome'); // Show pending view
      }

    } catch (e) { console.error('Error logging in', e); }
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setUserStatus('guest');
    setCurrentUserId('');
    setCurrentUserRole('user');
    setActiveTab('welcome');
    setIsLoginView(true); // Gør det let at logge ind igen
    setLoginPhone('');
    setLoginPassword('');
    setAllUsers([]);
  };

  // ─── Forbindelser (Deling) ───
  const handleSubscribe = () => {
    const trimmedId = sharedUserId.trim();
    if (!trimmedId) return;

    // Find brugeren vi prøver at abonnere på (ignorér whitespace)
    const targetUser = allUsers.find(u => u.id === trimmedId);
    if (!targetUser) {
      alert(`Kunne ikke finde bruger med ID: "${trimmedId}"`);
      return;
    }

    if (targetUser.id === currentUserId) {
      alert("Du kan ikke abonnere på dig selv 🙂");
      return;
    }

    // Tjek om vi allerede abonnerer
    const currentUser = allUsers.find(u => u.id === currentUserId);
    if (currentUser?.connectedTo?.includes(targetUser.id)) {
      alert("Du følger allerede denne kurv.");
      return;
    }

    // Opdater begge profiler (aktuel bruger får connectedTo, targetUser får subscriber)
    const updatedUsers = allUsers.map(u => {
      if (u.id === currentUserId) {
        return { ...u, connectedTo: [...(u.connectedTo || []), targetUser.id] };
      }
      if (u.id === targetUser.id) {
        return { ...u, subscribers: [...(u.subscribers || []), currentUserId] };
      }
      return u;
    });

    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
    setAllUsers(updatedUsers);

    // Opret en lokal kurv specielt til dette link (mock)
    const newCart: CartProfile = { id: uid(), name: `${targetUser.name.split(' ')[0]}s kurv`, userId: targetUser.id, items: [] };
    setCarts(prev => [...prev, newCart]);

    setSharedUserId('');
    alert(`Du følger nu ${targetUser.name} !`);
  };

  const handleRemoveSubscriber = (subscriberId: string) => {
    const subscriber = allUsers.find(u => u.id === subscriberId);
    if (!window.confirm(`Er du sikker på at du vil fjerne adgangen for ${subscriber?.name} ? `)) return;

    // Fjern forbindelsen
    const updatedUsers = allUsers.map(u => {
      if (u.id === currentUserId) {
        return { ...u, subscribers: (u.subscribers || []).filter(id => id !== subscriberId) };
      }
      if (u.id === subscriberId) {
        return { ...u, connectedTo: (u.connectedTo || []).filter(id => id !== currentUserId) };
      }
      return u;
    });

    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
    setAllUsers(updatedUsers);
  };

  const handleUnsubscribe = (targetUserId: string) => {
    const targetUser = allUsers.find(u => u.id === targetUserId);
    if (!window.confirm(`Er du sikker på at du vil stoppe med at følge ${targetUser?.name}?`)) return;

    // Fjern forbindelsen
    const updatedUsers = allUsers.map(u => {
      if (u.id === currentUserId) {
        return { ...u, connectedTo: (u.connectedTo || []).filter(id => id !== targetUserId) };
      }
      if (u.id === targetUserId) {
        return { ...u, subscribers: (u.subscribers || []).filter(id => id !== currentUserId) };
      }
      return u;
    });

    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
    setAllUsers(updatedUsers);

    // Fjern også den lokale kurv
    const cartToRemove = carts.find(c => c.userId === targetUserId && c.id !== 'mine');
    if (cartToRemove) {
      setCarts(prev => prev.filter(c => c.id !== cartToRemove.id));
      if (activeCartId === cartToRemove.id) setActiveCartId('mine');
    }
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

    const cartToDelete = carts.find(c => c.id === cartId);
    if (cartToDelete && cartToDelete.userId) {
      const me = allUsers.find(u => u.id === currentUserId);
      if (me?.connectedTo?.includes(cartToDelete.userId)) {
        if (window.confirm('Dette er en delt kurv. Vil du stoppe med at følge denne kurv?')) {
          handleUnsubscribe(cartToDelete.userId);
        }
        return;
      }
    }

    setCarts(prev => prev.filter(c => c.id !== cartId));
    if (activeCartId === cartId) setActiveCartId('mine');
  };

  // ─── Opsætning (nu bundet til aktiv kurv) ───

  const updateActiveCartConfig = (updater: (cart: CartProfile) => CartProfile) => {
    setCarts(prev => prev.map(c => c.id === activeCartId ? updater(c) : c));
  };

  // Tilføj butik
  const addShop = () => {
    if (!newShopName.trim()) return;
    const newShop = { id: uid(), name: newShopName };
    updateActiveCartConfig(c => ({ ...c, shops: [...(c.shops || INITIAL_SHOPS), newShop] }));
    setNewShopName('');
  };

  // Slet butik
  const deleteShop = (shopId: string) => {
    if (shopId === 'random') return; // "Tilfældig" kan ikke slettes
    updateActiveCartConfig(c => ({ ...c, shops: (c.shops || INITIAL_SHOPS).filter((s: Shop) => s.id !== shopId) }));
  };

  // Tilføj vare til skabelon
  const addTemplateItem = () => {
    if (!newItemName.trim()) return;
    const newItem: Item = { id: uid(), name: newItemName, category: newItemCat, checked: false };
    updateActiveCartConfig(c => ({ ...c, templateItems: [...(c.templateItems || ITEM_TEMPLATES), newItem] }));
    setAvailableItems(prev => [...prev, newItem]);
    setNewItemName('');
  };

  // Slet vare fra skabelon
  const deleteTemplateItem = (itemId: string) => {
    updateActiveCartConfig(c => ({ ...c, templateItems: (c.templateItems || ITEM_TEMPLATES).filter((i: Item) => i.id !== itemId) }));
    setAvailableItems(prev => prev.filter((i: Item) => i.id !== itemId));
  };

  // Redigér vare i skabelon
  const saveEditItem = (itemId: string) => {
    if (!editItemName.trim()) return;
    updateActiveCartConfig(c => ({
      ...c,
      templateItems: (c.templateItems || ITEM_TEMPLATES).map((i: Item) => i.id === itemId ? { ...i, name: editItemName } : i)
    }));
    setAvailableItems(prev => prev.map((i: Item) => i.id === itemId ? { ...i, name: editItemName } : i));
    setEditingItem(null);
    setEditItemName('');
  };

  // Tilføj kategori
  const addCategory = () => {
    if (!newCatName.trim() || categories.includes(newCatName)) return;
    updateActiveCartConfig(c => ({ ...c, categories: [...(c.categories || DEFAULT_CATEGORIES), newCatName] }));
    setNewCatName('');
  };

  // Slet kategori
  const deleteCategory = (cat: string) => {
    updateActiveCartConfig(c => ({ ...c, categories: (c.categories || DEFAULT_CATEGORIES).filter((cCat: string) => cCat !== cat) }));
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
            {activeCart.id === 'mine' ? currentUserId : (activeCart.userId || 'Opret profil først')}
          </code>
          <button onClick={() => navigator.clipboard.writeText(activeCart.id === 'mine' ? currentUserId : activeCart.userId)} className="glass" style={{ padding: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer' }} title="Kopier ID">
            📋
          </button>
        </div>
        <hr className="separator" />
        <p style={{ fontSize: '0.85rem', opacity: 0.6, margin: '12px 0 8px' }}>Tilføj en anden persons BrugerID for at se deres kurv</p>
        <div className="inline-form">
          <input type="text" placeholder="Indsæt BrugerID..." value={sharedUserId} onChange={e => setSharedUserId(e.target.value)} />
          <button className="btn-primary" onClick={handleSubscribe}>Tilføj</button>
        </div>

        {/* Listen over folk der har adgang til MIN kurv */}
        {(() => {
          const me = allUsers.find(u => u.id === currentUserId);
          const mySubscribers = (me?.subscribers || []).map(id => allUsers.find(u => u.id === id)).filter(Boolean) as User[];

          return (
            <div style={{ marginTop: '24px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem' }}>Folk der kigger med i din kurv:</h4>
              {mySubscribers.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {mySubscribers.map(sub => (
                    <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.05)', padding: '10px 14px', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{sub.name}</span>
                        <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{sub.phone}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveSubscriber(sub.id)}
                        style={{ border: 'none', background: 'var(--danger)', color: 'white', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Fjern
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ opacity: 0.5, fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>Ingen kigger med endnu.</p>
              )}
            </div>
          );
        })()}

        {/* Listen over folk JEG følger */}
        {(() => {
          const me = allUsers.find(u => u.id === currentUserId);
          const iFollow = (me?.connectedTo || []).map(id => allUsers.find(u => u.id === id)).filter(Boolean) as User[];

          return (
            <div style={{ marginTop: '24px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem' }}>Kurve du følger:</h4>
              {iFollow.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {iFollow.map(target => (
                    <div key={target.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.05)', padding: '10px 14px', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{target.name}</span>
                        <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{target.phone}</span>
                      </div>
                      <button
                        onClick={() => handleUnsubscribe(target.id)}
                        style={{ border: 'none', background: 'var(--danger)', color: 'white', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Stop følg
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ opacity: 0.5, fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>Du følger ikke nogen kurve endnu.</p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Flere indkøbskurve */}
      <div className="glass settings-section">
        <h3>Mine indkøbskurve</h3>
        <p style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: 0 }}>Vælg aktiv kurv eller opret en ny (f.eks. til din mor)</p>
        <div className="chip-list">
          {carts.map(c => (
            <div key={c.id} className={`chip glass ${c.id === activeCartId ? 'btn-primary' : ''} `} style={{ cursor: 'pointer' }} onClick={() => setActiveCartId(c.id)}>
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
            <button key={c.id} className={`glass ${c.id === activeCartId ? 'btn-primary' : ''} `} onClick={() => setActiveCartId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '28px' }}>
        {shops.map(shop => (
          <button key={shop.id} className={`glass ${selectedShop?.id === shop.id ? 'btn-primary' : ''} `}
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
              <button key={c.id} className={`glass ${c.id === activeCartId ? 'btn-primary' : ''} `} onClick={() => setActiveCartId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Butiks-filter */}
        <div className="filter-pills">
          <button className={`filter - pill glass ${filterShop === 'all' ? 'btn-primary' : ''} `} onClick={() => setFilterShop('all')}>Alle</button>
          {shops.map(s => (
            <button key={s.id} className={`filter - pill glass ${filterShop === s.id ? 'btn-primary' : ''} `} onClick={() => setFilterShop(s.id)}>
              {s.name}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 ? (
          <div className="glass" style={{ padding: '40px', borderRadius: '20px', textAlign: 'center', opacity: 0.6 }}>
            {filterShop === 'all' ? 'Din kurv er tom' : `Ingen varer fra ${shops.find(s => s.id === filterShop)?.name} `}
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

      {currentUserRole === 'admin' && (
        <button
          style={{
            background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600,
            fontSize: '0.9rem', cursor: 'pointer', padding: '10px'
          }}
          onClick={() => {
            setUserStatus('approved');
            setActiveTab('admin');
          }}
        >
          Åbn Admin Panel
        </button>
      )}

      <button
        onClick={handleLogout}
        style={{
          background: 'none', border: 'none', color: 'inherit', opacity: 0.4,
          fontSize: '0.8rem', cursor: 'pointer', padding: '20px'
        }}
      >
        Log ud
      </button>

      <style>{`
@keyframes spin { 100 % { transform: rotate(360deg); } }
`}</style>
    </div>
  );

  // ─── RENDER: Admin Panel ───
  const renderAdminPanel = () => {
    const pending = allUsers.filter(u => u.status === 'pending');
    const approved = allUsers.filter(u => u.status === 'approved');

    const updateDB = (users: User[]) => {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
      setAllUsers(users);
    };

    const handleApprove = (user: User) => {
      const cleanPhone = user.phone.replace(/[^0-9]/g, '');
      const msg = encodeURIComponent(`Hej ${user.name} !Din profil på 'handl' er nu godkendt. ✅\nDu kan nu handle videre på: https://handl.junkerne.dk`);
      window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');

      const updated = allUsers.map(u => u.id === user.id ? { ...u, status: 'approved' as const } : u);
      updateDB(updated);
    };

    const handleDelete = (id: string, name: string) => {
      if (!window.confirm(`Er du sikker på at du vil slette ${name}?`)) return;
      const updated = allUsers.filter(u => u.id !== id);
      updateDB(updated);
    };

    const handleEdit = (user: User) => {
      const newName = window.prompt("Nyt navn:", user.name);
      if (!newName) return;
      const newPhone = window.prompt("Nyt tlf:", user.phone);
      if (!newPhone) return;

      const updated = allUsers.map(u => u.id === user.id ? { ...u, name: newName, phone: newPhone } : u);
      updateDB(updated);
    };

    const handleResetPw = async (id: string) => {
      const newPw = window.prompt("Indtast ny adgangskode for brugeren:");
      if (!newPw) return;
      const hashed = await hashPassword(newPw);
      const updated = allUsers.map(u => u.id === id ? { ...u, hashedPassword: hashed } : u);
      updateDB(updated);
      alert("Adgangskode nulstillet!");
    };

    const handleCreateUser = async () => {
      const name = window.prompt("Fuldt navn:");
      if (!name) return;
      const phone = window.prompt("Telefonnummer:");
      if (!phone) return;
      const pw = window.prompt("Adgangskode:");
      if (!pw) return;

      const hashed = await hashPassword(pw);
      const newUser: User = {
        id: generateUserId(),
        name,
        phone,
        hashedPassword: hashed,
        time: new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }),
        status: 'approved',
        role: 'user'
      };

      updateDB([...allUsers, newUser]);
      alert("Bruger oprettet og godkendt automatisk.");
    };

    const displayUserRow = (u: User) => (
      <div key={u.id} className="glass" style={{ padding: '16px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontWeight: 600, margin: '0 0 4px 0', fontSize: '1.05rem' }}>
              {u.name} {u.id === currentUserId && <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--primary)', padding: '2px 6px', borderRadius: '6px', marginLeft: '6px' }}>Dig</span>}
              {u.role === 'admin' && <span style={{ fontSize: '0.75rem', backgroundColor: '#666', color: 'white', padding: '2px 6px', borderRadius: '6px', marginLeft: '6px' }}>Admin</span>}
            </p>
            <p style={{ opacity: 0.6, margin: 0, fontSize: '0.85rem' }}>{u.phone} • {u.time}</p>
            {/* Netværksindblik for admin */}
            {((u.subscribers && u.subscribers.length > 0) || (u.connectedTo && u.connectedTo.length > 0)) && (
              <div style={{ marginTop: '8px', fontSize: '0.8rem', background: 'rgba(0,0,0,0.03)', padding: '8px', borderRadius: '8px' }}>
                {u.connectedTo && u.connectedTo.length > 0 && (
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ opacity: 0.6 }}>Følger:</span> {u.connectedTo.map(id => allUsers.find(a => a.id === id)?.name || 'Slettet').join(', ')}
                  </div>
                )}
                {u.subscribers && u.subscribers.length > 0 && (
                  <div>
                    <span style={{ opacity: 0.6 }}>Følges af:</span> {u.subscribers.map(id => allUsers.find(a => a.id === id)?.name || 'Slettet').join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {u.status === 'pending' && <button className="btn-primary" style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }} onClick={() => handleApprove(u)}>Godkend</button>}
          <button className="glass" style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }} onClick={() => handleEdit(u)}>✏️ Ret</button>
          <button className="glass" style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }} onClick={() => handleResetPw(u.id)}>🔑 Kode</button>
          <button style={{ flex: 1, padding: '8px', fontSize: '0.85rem', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }} onClick={() => handleDelete(u.id, u.name)}>Slet</button>
        </div>
      </div>
    );

    return (
      <div className="container" style={{ paddingTop: '20px', paddingBottom: '80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Brugere ({allUsers.length})</h2>
          <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.9rem' }} onClick={handleCreateUser}>
            + Opret
          </button>
        </div>

        {/* ─── NETVÆRKSKORT ─── */}
        <div style={{ marginBottom: '30px', background: 'rgba(0,0,0,0.03)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '0.9rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 16px 0' }}>Netværk / Fælles kurve</h3>

          {approved.filter(u => u.subscribers && u.subscribers.length > 0).length === 0 ? (
            <p style={{ opacity: 0.5, fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>Ingen aktive delinger endnu.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {approved.filter(u => u.subscribers && u.subscribers.length > 0).map(host => (
                <div key={`net-${host.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Ejeren af kurven */}
                  <div style={{ background: 'var(--primary)', color: 'white', padding: '10px 16px', borderRadius: '12px', width: 'fit-content', fontWeight: 600, fontSize: '0.9rem' }}>
                    🛒 {host.name}'s kurv
                  </div>

                  {/* Pile og abonnenter */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginLeft: '20px', borderLeft: '2px solid rgba(0,0,0,0.1)', paddingLeft: '16px' }}>
                    {host.subscribers!.map(subId => {
                      const sub = allUsers.find(u => u.id === subId);
                      return sub ? (
                        <div key={`sub-${host.id}-${subId}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'rgba(0,0,0,0.3)', fontSize: '1.2rem' }}>↳</span>
                          <div style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.05)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            👀 <span style={{ fontWeight: 500 }}>{sub.name}</span> kigger med
                          </div>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {pending.length > 0 && (
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '0.9rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Afventer Godkendelse ({pending.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {pending.map(displayUserRow)}
            </div>
          </div>
        )}

        <div style={{ marginBottom: '40px' }}>
          <h3 style={{ fontSize: '0.9rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Godkendte Brugere ({approved.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {approved.map(displayUserRow)}
          </div>
        </div>
      </div>
    );
  };

  if (userStatus === 'pending') return <main>{renderPending()}</main>;

  const currentUser = allUsers.find(u => u.id === currentUserId);

  return (
    <>
      <main>
        {userStatus === 'approved' && currentUser && (
          <div style={{ maxWidth: '600px', margin: '0 auto', padding: '15px 20px 0', display: 'flex', justifyContent: 'flex-end', opacity: 0.5, fontSize: '0.8rem' }}>
            <span>Logget ind som <strong>{currentUser.name.trim()}</strong></span>
          </div>
        )}
        {userStatus === 'guest' && renderWelcome()}
        {userStatus === 'approved' && activeTab === 'settings' && renderSettings()}
        {userStatus === 'approved' && activeTab === 'cart' && renderCart()}
        {userStatus === 'approved' && activeTab === 'shop' && renderShop()}
        {userStatus === 'approved' && activeTab === 'admin' && currentUserRole === 'admin' && renderAdminPanel()}
      </main>

      {userStatus === 'approved' && (
        <BottomNav
          activeTab={activeTab as 'settings' | 'cart' | 'shop' | 'admin'}
          onTabChange={tab => setActiveTab(tab)}
          isAdmin={currentUserRole === 'admin'}
        />
      )}

      {/* PWA Install Guide for iOS */}
      <InstallGuide />
    </>
  );
}

export default App;

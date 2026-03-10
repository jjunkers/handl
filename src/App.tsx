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

const DEFAULT_CART_KEY = 'handl_default_cart';
const SESSION_STORAGE_KEY = 'handl_session';

function App() {
  const lastAdminAction = useRef(0);
  const [activeTab, setActiveTab] = useState<Tab>('welcome');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [version] = useState('v1.1.19');

  // Default cart state
  const [defaultCartId, setDefaultCartId] = useState<string>('mine');
  const [isInitialized, setIsInitialized] = useState(false);

  // Login view toggle
  const [isLoginView, setIsLoginView] = useState(false);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [shopSearchQuery, setShopSearchQuery] = useState('');
  const [cartSearchQuery, setCartSearchQuery] = useState('');
  const [cartCategoryFilter, setCartCategoryFilter] = useState('all');

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

  // Sorter loginError når der skiftes view
  useEffect(() => {
    setLoginError('');
  }, [isLoginView]);

  // ─── Filterede kurve (Isolation pr. bruger) ───
  const visibleCarts = useMemo(() => {
    const me = allUsers.find(u => u.id === currentUserId);
    const following = me?.connectedTo || [];

    return carts.filter(c => {
      // 1. Altid vis ens egen private hovedkurv
      if (c.id === 'mine' || c.id === `private_${currentUserId}`) return true;
      // 2. Vis sekundære kurve man selv ejer
      if (c.userId === currentUserId || c.userId === `private_${currentUserId}`) return true;
      // 3. Vis kurve fra folk man følger
      if (following.includes(c.userId)) return true;
      return false;
    });
  }, [carts, currentUserId, allUsers]);

  // Active cart references
  const activeCart = useMemo(() => visibleCarts.find(c => c.id === activeCartId) || visibleCarts[0], [visibleCarts, activeCartId]);

  // Derived state from active cart
  const shops = activeCart?.shops || INITIAL_SHOPS;
  const templateItems = activeCart?.templateItems || ITEM_TEMPLATES;
  const categories = activeCart?.categories || DEFAULT_CATEGORIES;

  const [newItemCat, setNewItemCat] = useState(categories[0] || '');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  // Varer til stede i butiksvisningen (fjernes fra skabelon når valgt)
  // Dynamisk beregnet pr. aktiv kurv (så tilføjelser i én kurv ikke påvirker de andre!)
  const availableItems = useMemo(() => {
    const currentCartItemIds = new Set(activeCart?.items.map(i => i.id) || []);
    return templateItems.filter(t => !currentCartItemIds.has(t.id) && !currentCartItemIds.has(`${activeCart?.id}_${t.id}`));
  }, [activeCart, templateItems]);

  // Filtrerede skabeloner baseret på søgning
  const filteredTemplates = useMemo(() => {
    if (!shopSearchQuery.trim()) return templateItems;
    return templateItems.filter(i =>
      i.name.toLowerCase().includes(shopSearchQuery.toLowerCase())
    );
  }, [templateItems, shopSearchQuery]);

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

  // Kø for slettede varer (for at undgå sync race-conditions)
  const deletedItemsQueue = useRef<string[]>([]);

  // Dødsliste for nyligt slettede varer (forhindrer stale D1 read-replica resurrection i 30s)
  const deadItemsList = useRef<Record<string, number>>({});

  // Antal pr. vare (i butik, inden tilføjelse)
  const [itemQuantities, setItemQuantities] = useState<Record<string, string>>({});

  // Filter i kurv
  const [filterShop, setFilterShop] = useState<string | 'all'>('all');

  // ─── Tema ───
  useEffect(() => {
    document.body.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // ─── Migrer den gamle 'mine' kurv til en personlig D1 kurv ───
  useEffect(() => {
    if (currentUserId && carts.some(c => c.id === 'mine')) {
      const myUniqueId = `private_${currentUserId}`;
      setCarts(prev => prev.map(c => {
        if (c.id === 'mine') {
          return {
            ...c,
            id: myUniqueId,
            userId: myUniqueId,
            items: c.items.map(i => ({
              ...i,
              id: i.id.startsWith('mine_') ? i.id.replace('mine_', `${myUniqueId}_`) : i.id
            }))
          };
        }
        return c;
      }));
      if (activeCartId === 'mine') setActiveCartId(myUniqueId);
      if (defaultCartId === 'mine') setDefaultCartId(myUniqueId);
    }
  }, [currentUserId, carts, activeCartId, defaultCartId]);

  // Den "Personlige" kurv ID (gæstefaldback vs logget ind)
  const myCartId = currentUserId ? `private_${currentUserId}` : 'mine';

  // ─── Cloud Sync ───
  const handleSync = useCallback(async (pushData?: { carts?: CartProfile[], items?: Item[], connections?: any[], deletedConnections?: any[], deletedCarts?: string[], deletedItems?: string[], users?: User[] }) => {
    if (!currentUserId || userStatus !== 'approved') return;

    try {
      // 1. Hvis vi har pushData, så send det op
      if (pushData) {
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUserId, ...pushData })
        });
      }

      // 2. Hent de nyeste data fra skyen
      const res = await fetch(`/api/sync?userId=${currentUserId}`);
      if (!res.ok) return;

      const cloudData = await res.json() as any;
      if (cloudData.users) {
        // Kun opdatér allUsers hvis der ikke har været en admin handling for nylig (15 sekunder)
        if (Date.now() - lastAdminAction.current > 15000) {
          setAllUsers(() => {
            // Opbyg connectedTo og subscribers kort fra forbindelserne
            const connections = cloudData.connections || [];
            return cloudData.users.map((u: any) => {
              const connectedTo = connections
                .filter((c: any) => c.follower_id === u.id)
                .map((c: any) => c.followed_id);
              const subscribers = connections
                .filter((c: any) => c.followed_id === u.id)
                .map((c: any) => c.follower_id);
              return { ...u, connectedTo, subscribers };
            });
          });
        }
      }

      // Merge kurve: Vi prioriterer skyen for delte kurve, 
      // men beholder 'mine' indtil vi er sikre på den er i skyen.
      if (cloudData.carts) {
        setCarts(prev => {
          const newCarts = [...prev];
          cloudData.carts.forEach((cloudCart: any) => {
            const idx = newCarts.findIndex(c => c.id === cloudCart.id);
            const formattedCart: CartProfile = {
              id: cloudCart.id,
              name: cloudCart.name,
              userId: cloudCart.owner_id,
              items: [], // Items hentes separat herunder
              ...cloudCart.config
            };
            if (idx === -1) newCarts.push(formattedCart);
            else newCarts[idx] = { ...newCarts[idx], ...formattedCart };
          });
          return newCarts;
        });
      }

      // Merge items
      if (cloudData.items) {
        setCarts(prev => prev.map(cart => {
          let cloudItems = cloudData.items.filter((i: any) => i.cart_id === cart.id);

          // Beskyttelse: Undlad at genindlæse varer, der er blevet slettet lokalt inden for de sidste 30 sekunder.
          // Dette løser race-conditions med auto-sync samt enhver D1 forsinkelse.
          cloudItems = cloudItems.filter((i: any) => {
            const deadSince = deadItemsList.current[i.id];
            if (deadSince && (Date.now() - deadSince < 30000)) {
              return false;
            }
            return true;
          });

          return {
            ...cart,
            items: cloudItems.map((i: any) => {
              // Bevar lokal state for varen, hvis en 3-sekunders-timer kører på den.
              // Dette modvirker race-conditions hvor auto-sync overskriver brugerens friske flueben med 0.
              const isBeingChecked = !!checkTimers.current[i.id];
              const localItem = cart.items.find(li => li.id === i.id);

              return {
                id: i.id,
                name: i.name,
                category: i.category,
                checked: (isBeingChecked && localItem) ? localItem.checked : (i.checked === 1 || i.checked === true),
                shopId: i.shop_id,
                lastCheckedAt: (isBeingChecked && localItem) ? localItem.lastCheckedAt : i.last_checked_at,
                quantity: i.quantity
              }
            })
          };
        }));
      }

    } catch (err) {
      console.error("Sync fejlede", err);
      throw err; // Rethrow så kaldere kan fange fejlen
    }
  }, [currentUserId, userStatus]);

  // ─── Initial Data Fetch ───
  useEffect(() => {
    if (userStatus === 'approved' && currentUserId && !isInitialized) {
      handleSync().then(() => {
        setIsInitialized(true);
      });
    }
  }, [userStatus, currentUserId, isInitialized]);

  // ─── Apply Default Cart after Initial Sync ───
  useEffect(() => {
    if (isInitialized && carts.length > 0) {
      const storedDefault = localStorage.getItem(DEFAULT_CART_KEY);
      if (storedDefault) {
        setDefaultCartId(storedDefault);
        const cartExists = carts.some(c => c.id === storedDefault);
        if (cartExists) {
          setActiveCartId(storedDefault);
        }
      }
    }
  }, [isInitialized]); // Kun når isInitialized skifter til true (og carts er landet)

  // ─── Automatisk push til skyen ved ændringer ───
  useEffect(() => {
    if (userStatus === 'approved' && currentUserId) {
      const timer = setTimeout(() => {
        // Fladgør items til DB format
        const allItems: any[] = [];
        carts.forEach(c => {
          c.items.forEach(i => {
            allItems.push({ ...i, cartId: c.id });
          });
        });
        // Fladgør forbindelser til DB format
        const allConnections: any[] = [];
        allUsers.forEach(u => {
          if (u.connectedTo) {
            u.connectedTo.forEach(targetId => {
              allConnections.push({ follower_id: u.id, followed_id: targetId });
            });
          }
        });

        // Hent og tøm slettede-varer køen
        const itemsToDelete = [...deletedItemsQueue.current];
        deletedItemsQueue.current = [];

        handleSync({
          carts,
          items: allItems,
          connections: allConnections,
          deletedItems: itemsToDelete.length > 0 ? itemsToDelete : undefined
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [carts, allUsers, currentUserId, userStatus, handleSync]);

  // ─── 10-sekunders auto-opdatering ───
  useEffect(() => {
    if (userStatus === 'approved') {
      handleSync(); // Kør straks
    }
    const interval = setInterval(() => {
      handleSync();
    }, 10000);
    return () => clearInterval(interval);
  }, [userStatus, handleSync]);

  // ─── Hjælpefunktioner ───

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userSurname.trim() || !userPhone.trim() || !password.trim()) return;
    const hashed = await hashPassword(password);
    setPassword('');
    const newUserId = generateUserId();
    setCurrentUserId(newUserId);
    setCarts(prev => prev.map(c => c.id === 'mine' ? { ...c, id: `private_${newUserId}`, userId: `private_${newUserId}` } : c));

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
      // 1. Gem i D1 via API
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });

      if (!res.ok) {
        const err = await res.json() as any;
        alert(err.error || "Fejl ved oprettelse");
        return;
      }

      // 2. Gem også lokalt (fallback/speed)
      const usersRaw = localStorage.getItem(USERS_STORAGE_KEY) || '[]';
      const users: User[] = JSON.parse(usersRaw);
      users.push(newUser);
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
      setAllUsers(users);

      localStorage.setItem(SESSION_STORAGE_KEY, newUserId);
      setCurrentUserRole(role);
      setUserStatus(newUser.status);

      // Push 'mine' kurv til skyen med det samme
      handleSync({ carts: carts.map(c => c.id === 'mine' ? { ...c, id: `private_${newUserId}`, userId: `private_${newUserId}` } : c) });

      if (newUser.status === 'approved') {
        setActiveTab('shop');
      }
    } catch (e) { console.error('Failed to register', e); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginPhone.trim() || !loginPassword.trim()) return;

    try {
      const inputHash = await hashPassword(loginPassword.trim());

      // 1. Prøv først D1 API
      let res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone.trim(), hashedPassword: inputHash })
      });

      let user: User | null = null;

      if (!res.ok) {
        // Hvis ikke fundet i D1, tjek localStorage (Migration Fallback)
        const usersRaw = localStorage.getItem(USERS_STORAGE_KEY) || '[]';
        const localUsers: User[] = JSON.parse(usersRaw);
        const localUser = localUsers.find(u => u.phone.trim() === loginPhone.trim() && u.hashedPassword === inputHash);

        if (localUser) {
          // Migrér brugeren til D1 med det samme
          await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localUser)
          });
          user = localUser;
        } else {
          const err = await res.json() as any;
          setLoginError(err.error || "Login fejlede");
          return;
        }
      } else {
        user = await res.json();
      }

      if (!user) return;

      // Login succesfuldt
      localStorage.setItem(SESSION_STORAGE_KEY, user.id);
      setCurrentUserId(user.id);
      setUserStatus(user.status || 'guest');
      setCurrentUserRole(user.role || 'user');

      if (user.status === 'approved') {
        setActiveTab('shop');
        setActiveCartId(`private_${user.id}`);
        handleSync(); // Hent data med det samme
      } else {
        setActiveTab('welcome');
      }
    } catch (e) {
      console.error('Error logging in', e);
      setLoginError("Der skete en fejl. Prøv igen.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setUserStatus('guest');
    setCurrentUserId('');
    setCurrentUserRole('user');
    setActiveTab('welcome');
    setActiveCartId('mine'); // Reset til ens egen kurv ved logout
    setIsLoginView(true); // Gør det let at logge ind igen
    setLoginPhone('');
    setLoginPassword('');
    setAllUsers([]);
  };

  // ─── Forbindelser (Deling) ───
  // Slet koden for sharedUserId da vi nu bruger addCart til dette

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

    // Sync deletion til skyen
    handleSync({ deletedConnections: [{ follower_id: subscriberId, followed_id: currentUserId }] });
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

    // Sync deletion til skyen
    handleSync({ deletedConnections: [{ follower_id: currentUserId, followed_id: targetUserId }] });

    // Fjern også den lokale kurv
    const cartToRemove = carts.find(c => c.userId === targetUserId && c.id !== myCartId);
    if (cartToRemove) {
      setCarts(prev => prev.filter(c => c.id !== cartToRemove.id));
      if (activeCartId === cartToRemove.id) setActiveCartId(myCartId);
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

    // Brug prefix så ID'et er unikt i databasen pr. kurv, 
    // men vi bevarer linket til den oprindelige skabelon
    const uniqueId = item.id.startsWith(`${activeCartId}_`) ? item.id : `${activeCartId}_${item.id}`;

    const cartItem = { ...item, id: uniqueId, shopId: selectedShop.id, checked: false, quantity: qty || undefined };
    setCarts(prev => prev.map(c =>
      c.id === activeCartId
        ? { ...c, items: [...c.items, cartItem] }
        : c
    ));
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
            // Sæt i slettekøen, så den faktisk slettes i skyen
            if (!deletedItemsQueue.current.includes(itemId)) {
              deletedItemsQueue.current.push(itemId);
            }
            deadItemsList.current[itemId] = Date.now();

            return { ...c, items: c.items.filter(i => i.id !== itemId) };
          }
          return c;
        }));
        delete checkTimers.current[itemId];
      }, 3000);
      checkTimers.current[itemId] = timer;
    }
  };

  // Slet vare helt fra kurven (uden at 'købe' den)
  const deleteItemFromCart = (itemId: string) => {
    // Slet timer hvis der var en
    if (checkTimers.current[itemId]) {
      clearTimeout(checkTimers.current[itemId]);
      delete checkTimers.current[itemId];
    }
    setCarts(prev => prev.map(c =>
      c.id === activeCartId
        ? { ...c, items: c.items.filter(i => i.id !== itemId) }
        : c
    ));

    // Sæt i kø til auto-sync, i stedet for at affyre direkte.
    // Det dæmmer op for the race condition mellem slet-kaldet og auto-sync opdateringen bagefter.
    if (!deletedItemsQueue.current.includes(itemId)) {
      deletedItemsQueue.current.push(itemId);
    }
    deadItemsList.current[itemId] = Date.now();
  };

  // Tilføj ny kurv
  const addCart = () => {
    const trimmedInput = newCartName.trim();
    if (!trimmedInput) return;

    // Tjek om inputtet faktisk er et gyldigt BrugerID for en delt kurv
    const targetUser = allUsers.find(u => u.id === trimmedInput);

    if (targetUser) {
      if (targetUser.id === currentUserId) {
        alert("Du kan ikke tilføje dig selv som din egen eksterne kurv 🙂");
        return;
      }
      const currentUser = allUsers.find(u => u.id === currentUserId);
      if (currentUser?.connectedTo?.includes(targetUser.id)) {
        alert("Du følger allerede denne persons kurv.");
        return;
      }
      // Opret forbindelse
      const updatedUsers = allUsers.map(u => {
        if (u.id === currentUserId) return { ...u, connectedTo: [...(u.connectedTo || []), targetUser.id] };
        if (u.id === targetUser.id) return { ...u, subscribers: [...(u.subscribers || []), currentUserId] };
        return u;
      });
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
      setAllUsers(updatedUsers);

      const newSharedCart: CartProfile = { id: uid(), name: `${targetUser.name.split(' ')[0]}s kurv`, userId: targetUser.id, items: [] };
      setCarts(prev => [...prev, newSharedCart]);
      setNewCartName('');

      // Sync forbindelsen til skyen med det samme
      handleSync({ connections: [{ follower_id: currentUserId, followed_id: targetUser.id }] });

      alert(`Du følger nu ${targetUser.name} !`);
      return;
    }

    // Ellers opret en almindelig lokal kurv (som deles offentligt under dit ID *hvis* andre følger dig)
    const newCart: CartProfile = {
      id: uid(),
      name: trimmedInput,
      userId: currentUserId, // Brug det "offentlige" ID, så følgere kan se denne sekundære kurv
      items: [],
      shops: INITIAL_SHOPS,
      categories: DEFAULT_CATEGORIES,
      templateItems: ITEM_TEMPLATES
    };
    setCarts(prev => [...prev, newCart]);
    setActiveCartId(newCart.id);
    setNewCartName('');
  };

  // Slet kurv
  const deleteCart = (cartId: string) => {
    if (cartId === myCartId) return; // Kan ikke slette primær kurv

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
    if (activeCartId === cartId) setActiveCartId(myCartId);

    // Sync sletning til skyen
    handleSync({ deletedCarts: [cartId] });
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
    setNewItemName('');
  };

  // Slet vare fra skabelon (og kaskadér til aktive kurve)
  const deleteTemplateItem = (itemId: string) => {
    updateActiveCartConfig(c => ({
      ...c,
      templateItems: (c.templateItems || ITEM_TEMPLATES).filter((i: Item) => i.id !== itemId)
    }));

    // Slet også varen fra alle aktive kurve (hvis den ligger der)
    setCarts(prev => prev.map(c => ({
      ...c,
      items: c.items.filter(i => i.id !== itemId && i.id !== `${c.id}_${itemId}`)
    })));
  };

  // Redigér vare i skabelon
  const saveEditItem = (itemId: string) => {
    if (!editItemName.trim()) return;
    updateActiveCartConfig(c => ({
      ...c,
      templateItems: (c.templateItems || ITEM_TEMPLATES).map((i: Item) => i.id === itemId ? { ...i, name: editItemName } : i)
    }));
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
      <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '0.5rem' }}>handl</h1>
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
  const handleResetToDefaults = () => {
    if (!window.confirm("Vil du nulstille alle varegrupper og vareskabeloner til de nye standarder? Dette letter din personlige opsætning, men fjerner eventuelle egne rettelser i vareskabelonerne.")) return;

    setCarts(prev => prev.map(c => {
      if (c.id === myCartId || c.userId === currentUserId || c.userId === `private_${currentUserId}`) {
        return {
          ...c,
          categories: DEFAULT_CATEGORIES,
          templateItems: ITEM_TEMPLATES
        };
      }
      return c;
    }));

    alert("Varegrupper og skabeloner er nu nulstillet til de nye standarder. Du kan se dem under 'Butik' næste gang du tilføjer en vare.");
  };

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

      {/* Varedatabase */}
      <div className="glass settings-section">
        <h3>Varedatabase</h3>
        <p style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: '16px', lineHeight: 1.4 }}>
          Hvis du mangler de nyeste standard varegrupper (Mælkeprodukter, Frost, Snacks osv.) eller de nye vareskabeloner, kan du nulstille din personlige opsætning herunder.
        </p>
        <button className="glass" style={{ width: '100%', padding: '12px', fontWeight: 600, color: 'var(--primary)' }} onClick={() => {
          handleResetToDefaults();
          handleSync();
        }}>
          🔄 Nulstil til nye standarder
        </button>
      </div>

      {/* Fælles indkøbskurv */}
      <div className="glass settings-section">
        <h3>Fælles indkøbskurv</h3>
        <p style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: 0 }}>Del dit BrugerID med andre for at dele din indkøbskurv</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <code style={{ background: 'rgba(0,0,0,0.05)', padding: '10px 14px', borderRadius: '10px', flex: 1, fontSize: '1.1rem', letterSpacing: '1px' }}>
            {activeCart.id === myCartId ? currentUserId : (activeCart.userId || 'Opret profil først')}
          </code>
          <button onClick={() => navigator.clipboard.writeText(activeCart.id === myCartId ? currentUserId : activeCart.userId)} className="glass" style={{ padding: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer' }} title="Kopier ID">
            📋
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem' }}>Tilføj en delt kurv:</h4>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Indtast BrugerID her"
              value={newCartName}
              onChange={(e) => setNewCartName(e.target.value)}
              style={{ flex: 1, padding: '12px 14px', borderRadius: '14px', border: '1px solid rgba(0,0,0,0.1)', outline: 'none', background: 'white' }}
            />
            <button onClick={addCart} className="btn-primary" style={{ padding: '0 20px', borderRadius: '14px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Følg
            </button>
          </div>
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
          {visibleCarts.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className={`chip glass ${c.id === activeCartId ? 'btn-primary' : ''} `} style={{ cursor: 'pointer', flex: 1, display: 'flex', justifyContent: 'space-between' }} onClick={() => setActiveCartId(c.id)}>
                <span>{c.name}</span>
                {c.id !== myCartId && <button className="delete-chip" onClick={e => { e.stopPropagation(); deleteCart(c.id); }}>×</button>}
              </div>
              <button
                onClick={() => {
                  setDefaultCartId(c.id);
                  localStorage.setItem(DEFAULT_CART_KEY, c.id);
                }}
                style={{
                  background: defaultCartId === c.id ? 'var(--primary)' : 'rgba(0,0,0,0.05)',
                  color: defaultCartId === c.id ? 'white' : 'inherit',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap'
                }}
                title="Sæt som standard opstartskurv"
              >
                {defaultCartId === c.id ? 'Standard ✓' : 'Sæt som standard'}
              </button>
            </div>
          ))}
        </div>
        {activeCartId !== myCartId && activeCart && (
          <div style={{ marginTop: '12px', fontSize: '0.85rem', opacity: 0.6 }}>
            BrugerID for "{activeCart.name}": <code>{activeCart.userId}</code>
            <button onClick={() => navigator.clipboard.writeText(activeCart.userId)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '4px' }}>📋</button>
          </div>
        )}
        <div className="inline-form">
          <input type="text" placeholder="Nyt kurvnavn ELLER BrugerID" value={newCartName} onChange={e => setNewCartName(e.target.value)} />
          <button className="btn-primary" onClick={addCart}>Tilføj</button>
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
  const renderShop = () => {
    // Filtrerede varer baseret på søgning eller valgt kategori
    const baseItems = shopSearchQuery ? filteredTemplates : availableItems;

    // Yderligere filtrering hvis man har valgt en specifik kategori (og ikke søger)
    const filteredByCat = (!shopSearchQuery && newItemCat !== 'all')
      ? baseItems.filter(i => i.category === newItemCat)
      : baseItems;

    // Gruppér varer
    const grouped = filteredByCat.reduce((acc, item) => {
      const catName = item.category || 'Andet';
      if (!acc[catName]) acc[catName] = [];
      acc[catName].push(item);
      return acc;
    }, {} as Record<string, Item[]>);

    // Sortér kategorier
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
      const indexA = categories.indexOf(a);
      const indexB = categories.indexOf(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    return (
      <div className="container">
        <h2 style={{ marginBottom: '20px' }}>Butikker</h2>

        {/* Kurv-vælger */}
        {visibleCarts.length > 1 && (
          <div className="cart-selector">
            {visibleCarts.map(c => (
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

            {/* Søgefelt */}
            <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: '16px', marginBottom: '15px', border: '1px solid rgba(0,0,0,0.05)' }}>
              <span style={{ marginRight: '10px', fontSize: '1.2rem', opacity: 0.5 }}>🔎</span>
              <input
                type="text"
                placeholder="Søg i varer..."
                value={shopSearchQuery}
                onChange={(e) => setShopSearchQuery(e.target.value)}
                style={{ background: 'none', border: 'none', color: 'inherit', width: '100%', outline: 'none', fontSize: '1rem' }}
              />
              {shopSearchQuery && (
                <button onClick={() => setShopSearchQuery('')} style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.5, fontSize: '1.2rem', cursor: 'pointer', padding: '0 5px' }}>✕</button>
              )}
            </div>

            {/* Kategori-vælger */}
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', marginBottom: '20px', paddingBottom: '10px', scrollbarWidth: 'none' }}>
              <button
                className={`glass ${newItemCat === 'all' && !shopSearchQuery ? 'active' : ''}`}
                style={{
                  padding: '10px 18px',
                  borderRadius: '14px',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  border: (newItemCat === 'all' && !shopSearchQuery) ? '2px solid var(--primary)' : '1px solid rgba(0,0,0,0.05)',
                  color: (newItemCat === 'all' && !shopSearchQuery) ? 'var(--primary)' : 'inherit'
                }}
                onClick={() => {
                  setNewItemCat('all');
                  setShopSearchQuery('');
                }}
              >
                Alle varer
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`glass ${newItemCat === cat && !shopSearchQuery ? 'active' : ''}`}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '14px',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    border: (newItemCat === cat && !shopSearchQuery) ? '2px solid var(--primary)' : '1px solid rgba(0,0,0,0.05)',
                    color: (newItemCat === cat && !shopSearchQuery) ? 'var(--primary)' : 'inherit'
                  }}
                  onClick={() => {
                    setNewItemCat(cat);
                    setShopSearchQuery('');
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {filteredByCat.length === 0 ? (
              <div className="glass" style={{ padding: '30px', borderRadius: '20px', textAlign: 'center', opacity: 0.6 }}>Alle varer er allerede i kurven</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {sortedCategories.map(catName => {
                  const catItems = grouped[catName];
                  return (
                    <div key={catName}>
                      <h4 style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>{catName}</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {catItems.map(item => {
                          const isInCart = activeCart.items.some(ci => ci.id === item.id);
                          if (isInCart) return null;
                          return (
                            <div key={item.id} className="glass"
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <span style={{ fontWeight: 500 }}>{item.name}</span>
                                {shopSearchQuery && <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{item.category}</span>}
                              </div>
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
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ─── RENDER: Indkøbskurv ───
  const renderCart = () => {
    const cartItems = activeCart.items;

    const filteredItems = cartItems.filter(i => {
      const shopMatch = filterShop === 'all' || i.shopId === filterShop;
      const categoryMatch = cartCategoryFilter === 'all' || i.category === cartCategoryFilter;
      const searchMatch = !cartSearchQuery.trim() || i.name.toLowerCase().includes(cartSearchQuery.toLowerCase());
      return shopMatch && categoryMatch && searchMatch;
    });

    const grouped = filteredItems.reduce((acc, item) => {
      const catName = item.category || 'Andet';
      if (!acc[catName]) acc[catName] = [];
      acc[catName].push(item);
      return acc;
    }, {} as Record<string, Item[]>);

    // Sort categories based on their original order in the settings
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
      const indexA = categories.indexOf(a);
      const indexB = categories.indexOf(b);
      // If a category isn't in the list, push it to the end
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    return (
      <div className="container">
        <h2 style={{ marginBottom: '20px' }}>Indkøbskurv</h2>

        {/* Kurv-vælger */}
        {visibleCarts.length > 1 && (
          <div className="cart-selector">
            {visibleCarts.map(c => (
              <button key={c.id} className={`glass ${c.id === activeCartId ? 'btn-primary' : ''} `} onClick={() => setActiveCartId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Søgefelt */}
        <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: '16px', marginBottom: '15px', border: '1px solid rgba(0,0,0,0.05)' }}>
          <span style={{ marginRight: '10px', fontSize: '1.2rem', opacity: 0.5 }}>🔎</span>
          <input
            type="text"
            placeholder="Søg i kurv..."
            value={cartSearchQuery}
            onChange={(e) => setCartSearchQuery(e.target.value)}
            style={{ background: 'none', border: 'none', color: 'inherit', width: '100%', outline: 'none', fontSize: '1rem' }}
          />
          {cartSearchQuery && (
            <button onClick={() => setCartSearchQuery('')} style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.5, fontSize: '1.2rem', cursor: 'pointer', padding: '0 5px' }}>✕</button>
          )}
        </div>

        {/* Butiks-filter (vandret scroll) */}
        <div className="filter-pills" style={{ display: 'flex', gap: '10px', overflowX: 'auto', marginBottom: '20px', paddingBottom: '10px', scrollbarWidth: 'none' }}>
          <button
            className={`glass ${filterShop === 'all' ? 'active' : ''}`}
            style={{
              padding: '10px 18px', borderRadius: '14px', whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.9rem',
              border: filterShop === 'all' ? '2px solid var(--primary)' : '1px solid rgba(0,0,0,0.05)',
              color: filterShop === 'all' ? 'var(--primary)' : 'inherit'
            }}
            onClick={() => setFilterShop('all')}
          >
            Alle butikker
          </button>
          {shops.map(shop => (
            <button
              key={shop.id}
              className={`glass ${filterShop === shop.id ? 'active' : ''}`}
              style={{
                padding: '10px 18px', borderRadius: '14px', whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.9rem',
                border: filterShop === shop.id ? '2px solid var(--primary)' : '1px solid rgba(0,0,0,0.05)',
                color: filterShop === shop.id ? 'var(--primary)' : 'inherit'
              }}
              onClick={() => setFilterShop(shop.id)}
            >
              {shop.name}
            </button>
          ))}
        </div>

        {/* Kategori-filter (vandret scroll) */}
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', marginBottom: '20px', paddingBottom: '10px', scrollbarWidth: 'none' }}>
          <button
            className={`glass ${cartCategoryFilter === 'all' ? 'active' : ''}`}
            style={{
              padding: '10px 18px', borderRadius: '14px', whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.9rem',
              border: cartCategoryFilter === 'all' ? '2px solid var(--primary)' : '1px solid rgba(0,0,0,0.05)',
              color: cartCategoryFilter === 'all' ? 'var(--primary)' : 'inherit'
            }}
            onClick={() => setCartCategoryFilter('all')}
          >
            Alle varer
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`glass ${cartCategoryFilter === cat ? 'active' : ''}`}
              style={{
                padding: '10px 18px', borderRadius: '14px', whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.9rem',
                border: cartCategoryFilter === cat ? '2px solid var(--primary)' : '1px solid rgba(0,0,0,0.05)',
                color: cartCategoryFilter === cat ? 'var(--primary)' : 'inherit'
              }}
              onClick={() => setCartCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 ? (
          <div className="glass" style={{ padding: '40px', borderRadius: '20px', textAlign: 'center', opacity: 0.6 }}>
            {filterShop === 'all' ? 'Din kurv er tom' : `Ingen varer fra ${shops.find(s => s.id === filterShop)?.name}`}
          </div>
        ) : (
          sortedCategories.map(catName => {
            const catItems = grouped[catName];
            return (
              <div key={catName} style={{ marginBottom: '28px' }}>
                <h3 style={{ fontSize: '0.9rem', opacity: 0.5, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>{catName}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {catItems.map(item => {
                    const shopPrefix = filterShop === 'all' && item.shopId !== 'random'
                      ? shops.find(s => s.id === item.shopId)?.name
                      : null;
                    return (
                      <div key={item.id} className="glass"
                        style={{ padding: '14px 18px', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: item.checked ? 0.4 : 1, transition: '0.3s', textDecoration: item.checked ? 'line-through' : 'none' }}
                      >
                        <span style={{ fontWeight: 500 }}>
                          {item.name}
                          {shopPrefix && <span style={{ opacity: 0.5, marginLeft: '6px', fontSize: '0.85rem' }}>({shopPrefix})</span>}
                          {item.quantity ? <span style={{ opacity: 0.5, marginLeft: '8px', fontSize: '0.85rem' }}>[{item.quantity}]</span> : ''}
                        </span>
                        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                          <button
                            onClick={() => deleteItemFromCart(item.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '1.2rem', cursor: 'pointer', opacity: 0.6 }}
                            title="Fjern vare fra kurven"
                          >✕</button>
                          <input type="checkbox" checked={item.checked} onChange={() => toggleItemInCart(item.id)}
                            style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
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

    const updateDB = async (users: User[], changedUserIds?: string[]) => {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
      setAllUsers(users);
      lastAdminAction.current = Date.now();

      // Sync kun de ændrede brugere med D1 via bulk sync
      const toSync = changedUserIds
        ? users.filter(u => changedUserIds.includes(u.id))
        : users;

      handleSync({ users: toSync });
    };

    const syncAllLegacyConnections = () => {
      if (!window.confirm("Vil du synkronisere alle lokalt gemte forbindelser (subscribers/connectedTo) op i skyen? Dette gøres normalt kun én gang efter migration.")) return;
      const connections: { follower_id: string, followed_id: string }[] = [];
      allUsers.forEach(u => {
        if (u.connectedTo && Array.isArray(u.connectedTo)) {
          u.connectedTo.forEach(targetId => {
            connections.push({ follower_id: u.id, followed_id: targetId });
          });
        }
      });
      if (connections.length > 0) {
        handleSync({ connections });
        alert(`${connections.length} forbindelser sendt til skyen!`);
      } else {
        alert("Ingen legacy forbindelser at synkronisere.");
      }
    };

    const handleApprove = async (user: User) => {
      const cleanPhone = user.phone.replace(/[^0-9]/g, '');
      const msg = encodeURIComponent(`Hej ${user.name} !Din profil på 'handl' er nu godkendt. ✅\nDu kan nu handle videre på: https://handl.junkerne.dk`);
      window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');

      const updated = allUsers.map(u => u.id === user.id ? { ...u, status: 'approved' as const } : u);
      await updateDB(updated, [user.id]);
    };

    const handleDelete = async (id: string, name: string) => {
      if (!window.confirm(`Er du sikker på at du vil slette ${name}?`)) return;

      try {
        await fetch('/api/auth/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const updated = allUsers.filter(u => u.id !== id);
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
        setAllUsers(updated);
      } catch (e) { console.error("Kunne ikke slette", e); }
    };

    const handleEdit = async (user: User) => {
      const newName = window.prompt("Nyt navn:", user.name);
      if (!newName) return;
      const newPhone = window.prompt("Nyt tlf:", user.phone);
      if (!newPhone) return;

      const updated = allUsers.map(u => u.id === user.id ? { ...u, name: newName, phone: newPhone } : u);
      await updateDB(updated, [user.id]);
    };

    const handleResetPw = async (id: string) => {
      const newPw = window.prompt("Indtast ny adgangskode for brugeren:");
      if (!newPw) return;
      const hashed = await hashPassword(newPw);
      const updated = allUsers.map(u => u.id === id ? { ...u, hashedPassword: hashed } : u);
      await updateDB(updated, [id]);
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

    const handleToggleRole = (user: User) => {
      if (user.id === currentUserId) {
        alert("Du kan ikke fjerne din egen admin-rolle herfra.");
        return;
      }
      const newRole = user.role === 'admin' ? 'user' : 'admin';
      const updated = allUsers.map(u => u.id === user.id ? { ...u, role: newRole as any } : u);
      updateDB(updated, [user.id]);
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
          <button className="glass" style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }} onClick={() => handleToggleRole(u)}>🛡️ {u.role === 'admin' ? 'Gør til Bruger' : 'Gør til Admin'}</button>
          <button className="glass" style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }} onClick={() => handleResetPw(u.id)}>🔑 Kode</button>
          <button style={{ flex: 1, padding: '8px', fontSize: '0.85rem', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }} onClick={() => handleDelete(u.id, u.name)}>Slet</button>
        </div>
      </div>
    );

    return (
      <div className="container" style={{ paddingTop: '20px', paddingBottom: '80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '10px' }}>
          <h2 style={{ margin: 0 }}>Brugere ({allUsers.length})</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="glass" style={{ padding: '8px 16px', fontSize: '0.9rem', opacity: 0.7 }} onClick={syncAllLegacyConnections} title="Synkroniser lokale forbindelser til skyen">
              🔄 Sync Forbindelser
            </button>
            <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.9rem' }} onClick={handleCreateUser}>
              + Opret
            </button>
          </div>
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

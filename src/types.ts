export interface User {
    id: string;
    name: string;
    phone: string;
    hashedPassword?: string;
    time: string;
    status: 'guest' | 'pending' | 'approved';
    role?: 'admin' | 'user';
    connectedTo?: string[];
    subscribers?: string[];
}

export interface Item {
    id: string;
    cartId?: string;
    userId?: string;
    name: string;
    category: string;
    checked: boolean;
    shop?: string;
    amount?: string;
    time?: string;
    // For bagudkompatibilitet under migration
    shopId?: string;
    lastCheckedAt?: number;
    quantity?: string;
}

export interface Shop {
    id: string;
    name: string;
}

export interface CartProfile {
    id: string;
    name: string;
    userId: string;
    items: Item[];
    shops?: Shop[];
    templateItems?: Item[];
    categories?: string[];
}

export const DEFAULT_CATEGORIES = [
    'Mælkeprodukter',
    'Bager',
    'Rengøringsartikler',
    'Grønt',
    'Kød',
    'Andet'
];

export const INITIAL_SHOPS: Shop[] = [
    { id: 'random', name: 'Tilfældig' },
    { id: 'netto', name: 'Netto' },
    { id: 'fotex', name: 'Føtex' }
];

export const ITEM_TEMPLATES: Item[] = [
    { id: '1', name: 'Mælk', category: 'Mælkeprodukter', checked: false },
    { id: '2', name: 'Smør', category: 'Mælkeprodukter', checked: false },
    { id: '3', name: 'Ost', category: 'Mælkeprodukter', checked: false },
    { id: '4', name: 'Rugbrød', category: 'Bager', checked: false },
    { id: '5', name: 'Franskbrød', category: 'Bager', checked: false },
    { id: '6', name: 'Opvaskemiddel', category: 'Rengøringsartikler', checked: false },
    { id: '7', name: 'Køkkenrulle', category: 'Rengøringsartikler', checked: false },
    { id: '8', name: 'Æbler', category: 'Grønt', checked: false },
    { id: '9', name: 'Bananer', category: 'Grønt', checked: false },
    { id: '10', name: 'Gulerødder', category: 'Grønt', checked: false },
    { id: '11', name: 'Hakket oksekød', category: 'Kød', checked: false },
    { id: '12', name: 'Kyllingebryst', category: 'Kød', checked: false },
];

export interface Item {
    id: string;
    name: string;
    category: string;
    checked: boolean;
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

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
    'Brød',
    'Frugt',
    'Grønt',
    'Kød',
    'Frost',
    'Diverse madvarer',
    'Snacks',
    'Drikkevarer',
    'Hygiejne',
    'Rengørings artikler',
    'Andet'
];

export const INITIAL_SHOPS: Shop[] = [
    { id: 'random', name: 'Tilfældig' },
    { id: 'netto', name: 'Netto' },
    { id: 'fotex', name: 'Føtex' }
];

export const ITEM_TEMPLATES: Item[] = [
    // Mælkeprodukter
    { id: 'm1', name: 'Mælk', category: 'Mælkeprodukter', checked: false },
    { id: 'm2', name: 'Stegesmør', category: 'Mælkeprodukter', checked: false },
    { id: 'm3', name: 'Mozzarella', category: 'Mælkeprodukter', checked: false },
    { id: 'm4', name: 'Ost', category: 'Mælkeprodukter', checked: false },
    { id: 'm5', name: 'Feta tern', category: 'Mælkeprodukter', checked: false },
    { id: 'm6', name: 'Kefir', category: 'Mælkeprodukter', checked: false },
    { id: 'm7', name: 'Brie', category: 'Mælkeprodukter', checked: false },
    { id: 'm8', name: 'Flødeost', category: 'Mælkeprodukter', checked: false },
    { id: 'm9', name: 'Fløde', category: 'Mælkeprodukter', checked: false },
    { id: 'm10', name: 'Revet ost', category: 'Mælkeprodukter', checked: false },
    { id: 'm11', name: 'Creme fraiche', category: 'Mælkeprodukter', checked: false },
    { id: 'm12', name: 'Actimel med jordbær', category: 'Mælkeprodukter', checked: false },
    { id: 'm13', name: 'Smør', category: 'Mælkeprodukter', checked: false },
    { id: 'm14', name: 'Oste tern', category: 'Mælkeprodukter', checked: false },
    { id: 'm15', name: 'Camembert', category: 'Mælkeprodukter', checked: false },
    { id: 'm16', name: 'Parmesan', category: 'Mælkeprodukter', checked: false },
    { id: 'm17', name: 'Bechamel', category: 'Mælkeprodukter', checked: false },

    // Brød
    { id: 'b1', name: 'Flutes', category: 'Brød', checked: false },
    { id: 'b2', name: 'Pølsebrød', category: 'Brød', checked: false },
    { id: 'b3', name: 'Morgenbrød', category: 'Brød', checked: false },
    { id: 'b4', name: 'Toast (Hvidt brød)', category: 'Brød', checked: false },
    { id: 'b5', name: 'Burger brød', category: 'Brød', checked: false },
    { id: 'b6', name: 'Glutenfri', category: 'Brød', checked: false },
    { id: 'b7', name: 'Pita', category: 'Brød', checked: false },
    { id: 'b8', name: 'Rugbrød', category: 'Brød', checked: false },

    // Frugt
    { id: 'f1', name: 'Bananer', category: 'Frugt', checked: false },
    { id: 'f2', name: 'Æbler', category: 'Frugt', checked: false },
    { id: 'f3', name: 'Rosiner', category: 'Frugt', checked: false },
    { id: 'f4', name: 'Blåbær', category: 'Frugt', checked: false },
    { id: 'f5', name: 'Vindruer', category: 'Frugt', checked: false },
    { id: 'f6', name: 'Jordbær', category: 'Frugt', checked: false },
    { id: 'f7', name: 'Guld kiwi', category: 'Frugt', checked: false },
    { id: 'f8', name: 'Pærer', category: 'Frugt', checked: false },

    // Grønt
    { id: 'g1', name: 'Rødpeber', category: 'Grønt', checked: false },
    { id: 'g2', name: 'Tomater', category: 'Grønt', checked: false },
    { id: 'g3', name: 'Avokado', category: 'Grønt', checked: false },
    { id: 'g4', name: 'Agurk', category: 'Grønt', checked: false },
    { id: 'g5', name: 'Rucola', category: 'Grønt', checked: false },
    { id: 'g6', name: 'Hvidløg', category: 'Grønt', checked: false },
    { id: 'g7', name: 'Lime', category: 'Grønt', checked: false },
    { id: 'g8', name: 'Bagekartofler', category: 'Grønt', checked: false },
    { id: 'g9', name: 'Ærter', category: 'Grønt', checked: false },
    { id: 'g10', name: 'Porrer', category: 'Grønt', checked: false },
    { id: 'g11', name: 'Gulerødder', category: 'Grønt', checked: false },
    { id: 'g12', name: 'Citron', category: 'Grønt', checked: false },
    { id: 'g13', name: 'Salat', category: 'Grønt', checked: false },
    { id: 'g14', name: 'Løg', category: 'Grønt', checked: false },
    { id: 'g15', name: 'Kartofler', category: 'Grønt', checked: false },

    // Kød
    { id: 'k1', name: 'Skinke (ikke det billigste)', category: 'Kød', checked: false },
    { id: 'k2', name: 'Bacon', category: 'Kød', checked: false },
    { id: 'k3', name: 'Pålæg', category: 'Kød', checked: false },
    { id: 'k4', name: 'Kylling', category: 'Kød', checked: false },
    { id: 'k5', name: 'Hakket okse', category: 'Kød', checked: false },
    { id: 'k6', name: 'Mørbrad', category: 'Kød', checked: false },
    { id: 'k7', name: 'Kyllingebryst', category: 'Kød', checked: false },
    { id: 'k8', name: 'Skinkekød', category: 'Kød', checked: false },

    // Frost
    { id: 'fr1', name: 'Frugt (Frost)', category: 'Frost', checked: false },
    { id: 'fr2', name: 'Ærter (Frost)', category: 'Frost', checked: false },
    { id: 'fr3', name: 'Is', category: 'Frost', checked: false },
    { id: 'fr4', name: 'Pommes', category: 'Frost', checked: false },

    // Diverse madvarer
    { id: 'd1', name: 'Groft salt', category: 'Diverse madvarer', checked: false },
    { id: 'd2', name: 'Agurkesalat', category: 'Diverse madvarer', checked: false },
    { id: 'd3', name: 'Sovsekulør', category: 'Diverse madvarer', checked: false },
    { id: 'd4', name: 'Remoulade', category: 'Diverse madvarer', checked: false },
    { id: 'd5', name: 'Cups of Noodles', category: 'Diverse madvarer', checked: false },
    { id: 'd6', name: 'Havregryn', category: 'Diverse madvarer', checked: false },
    { id: 'd7', name: 'Tun mojo', category: 'Diverse madvarer', checked: false },
    { id: 'd8', name: 'Sardiner', category: 'Diverse madvarer', checked: false },
    { id: 'd9', name: 'Flagesalt', category: 'Diverse madvarer', checked: false },
    { id: 'd10', name: 'Marmelade', category: 'Diverse madvarer', checked: false },
    { id: 'd11', name: 'Grøntsagsbouillon', category: 'Diverse madvarer', checked: false },
    { id: 'd12', name: 'Sukker', category: 'Diverse madvarer', checked: false },
    { id: 'd13', name: 'Hasselnødder', category: 'Diverse madvarer', checked: false },
    { id: 'd14', name: 'Æg', category: 'Diverse madvarer', checked: false },
    { id: 'd15', name: 'Nachos', category: 'Diverse madvarer', checked: false },
    { id: 'd16', name: 'Hummus', category: 'Diverse madvarer', checked: false },
    { id: 'd17', name: 'Pasta', category: 'Diverse madvarer', checked: false },
    { id: 'd18', name: 'Tærtedej', category: 'Diverse madvarer', checked: false },
    { id: 'd19', name: 'Sennep', category: 'Diverse madvarer', checked: false },
    { id: 'd20', name: 'Ketchup', category: 'Diverse madvarer', checked: false },
    { id: 'd21', name: 'Ris', category: 'Diverse madvarer', checked: false },
    { id: 'd22', name: 'Rødkål', category: 'Diverse madvarer', checked: false },
    { id: 'd23', name: 'Dressing', category: 'Diverse madvarer', checked: false },
    { id: 'd24', name: 'Tomatsovs', category: 'Diverse madvarer', checked: false },
    { id: 'd25', name: 'Ristede løg', category: 'Diverse madvarer', checked: false },

    // Snacks
    { id: 's1', name: 'Saltstænger', category: 'Snacks', checked: false },
    { id: 's2', name: 'Oliven', category: 'Snacks', checked: false },
    { id: 's3', name: 'Pringles', category: 'Snacks', checked: false },
    { id: 's4', name: 'Brunkager', category: 'Snacks', checked: false },
    { id: 's5', name: 'Franske kartofler', category: 'Snacks', checked: false },

    // Drikkevarer
    { id: 'dr1', name: 'Ice tea', category: 'Drikkevarer', checked: false },
    { id: 'dr2', name: 'Fanta', category: 'Drikkevarer', checked: false },
    { id: 'dr3', name: 'Juice', category: 'Drikkevarer', checked: false },
    { id: 'dr4', name: 'PepsiMax', category: 'Drikkevarer', checked: false },
    { id: 'dr5', name: 'Cola', category: 'Drikkevarer', checked: false },
    { id: 'dr6', name: 'Hvidvin', category: 'Drikkevarer', checked: false },
    { id: 'dr7', name: 'Aquarius', category: 'Drikkevarer', checked: false },
    { id: 'dr8', name: 'Rosé', category: 'Drikkevarer', checked: false },
    { id: 'dr9', name: 'Vand', category: 'Drikkevarer', checked: false },
    { id: 'dr10', name: 'Øl', category: 'Drikkevarer', checked: false },
    { id: 'dr11', name: 'Cointreau', category: 'Drikkevarer', checked: false },
    { id: 'dr12', name: 'Gin', category: 'Drikkevarer', checked: false },
    { id: 'dr13', name: 'Danskvand', category: 'Drikkevarer', checked: false },

    // Hygiejne
    { id: 'h1', name: 'Vatpinde', category: 'Hygiejne', checked: false },
    { id: 'h2', name: 'Sanex', category: 'Hygiejne', checked: false },
    { id: 'h3', name: 'Toiletpapir', category: 'Hygiejne', checked: false },
    { id: 'h4', name: 'Køkkenrulle', category: 'Hygiejne', checked: false },
    { id: 'h5', name: 'Deodorant JJ', category: 'Hygiejne', checked: false },
    { id: 'h6', name: 'Afspændingsmiddel', category: 'Hygiejne', checked: false },
    { id: 'h7', name: 'Håndsæbe', category: 'Hygiejne', checked: false },
    { id: 'h8', name: 'Deodorant MJ', category: 'Hygiejne', checked: false },
    { id: 'h9', name: 'Tandpasta', category: 'Hygiejne', checked: false },
    { id: 'h10', name: 'Hårlak', category: 'Hygiejne', checked: false },
    { id: 'h11', name: 'Voks', category: 'Hygiejne', checked: false },
    { id: 'h12', name: 'Curl', category: 'Hygiejne', checked: false },

    // Rengørings artikler
    { id: 'ra1', name: 'Toiletrens', category: 'Rengørings artikler', checked: false },
    { id: 'ra2', name: 'Opvasketabs', category: 'Rengørings artikler', checked: false },
    { id: 'ra3', name: 'Myggedimser', category: 'Rengørings artikler', checked: false },
    { id: 'ra4', name: 'Vaskemiddel', category: 'Rengørings artikler', checked: false },
    { id: 'ra5', name: 'Affaldsposer', category: 'Rengørings artikler', checked: false },
    { id: 'ra6', name: 'Afløbsrens', category: 'Rengørings artikler', checked: false },
    { id: 'ra7', name: 'Gummikost', category: 'Rengørings artikler', checked: false },
    { id: 'ra8', name: 'Gulvsæbe (Las 3 Brujas)', category: 'Rengørings artikler', checked: false },
    { id: 'ra9', name: 'Opvaskemiddel', category: 'Rengørings artikler', checked: false },
    { id: 'ra10', name: 'Kalkfjerner', category: 'Rengørings artikler', checked: false },
    { id: 'ra11', name: 'Sorte sække', category: 'Rengørings artikler', checked: false },

    // Andet
    { id: 'a1', name: 'Insektgift', category: 'Andet', checked: false },
    { id: 'a2', name: 'Bagepapir', category: 'Andet', checked: false },
];

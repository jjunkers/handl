// Cloudflare D1 types for the compiler
interface D1Database {
    prepare: (query: string) => any;
    batch: (statements: any[]) => Promise<any>;
}

type PagesFunction<T = any> = (context: {
    request: Request;
    env: T;
    next: () => Promise<Response>;
}) => Promise<Response>;

interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context: any) => {
    try {
        const url = new URL(context.request.url);
        const userId = url.searchParams.get("userId");

        if (!userId) {
            return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400 });
        }

        // 1. Hent alle brugere (bruges til admin og forbindelser)
        const users = await context.env.DB.prepare("SELECT * FROM users").all();

        // 2. Hent ALLE forbindelser (til admin og netværksgraf)
        const allConnections = await context.env.DB.prepare("SELECT * FROM user_connections").all();

        // 3. Find forbindelser for denne bruger specifikt (til at finde kurve)
        const connections = await context.env.DB.prepare(
            "SELECT followed_id FROM user_connections WHERE follower_id = ?"
        ).bind(userId).all();
        const followedIds = connections.results.map((c: any) => c.followed_id);

        // 4. Find alle kurve der er relevante
        const carts = await context.env.DB.prepare(`
      SELECT * FROM carts 
      WHERE owner_id = ? 
      OR owner_id IN (${followedIds.length ? followedIds.map(() => '?').join(',') : "''"})
    `).bind(userId, ...followedIds).all();

        // 5. Hent items til disse kurve
        const cartIds = carts.results.map((c: any) => c.id);
        const items = cartIds.length
            ? await context.env.DB.prepare(`
          SELECT * FROM cart_items WHERE cart_id IN (${cartIds.map(() => '?').join(',')})
        `).bind(...cartIds).all()
            : { results: [] };

        return new Response(JSON.stringify({
            users: users.results,
            connections: allConnections.results,
            carts: carts.results.map((c: any) => ({
                ...c,
                config: c.config ? JSON.parse(c.config) : {}
            })),
            items: items.results.map((i: any) => ({
                ...i,
                checked: i.checked === 1
            }))
        }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context: any) => {
    try {
        const { userId, carts, items, connections, deletedConnections, deletedCarts, deletedItems, users } = await context.request.json() as any;

        if (!userId) return new Response("Missing userId", { status: 400 });

        const statements = [];

        // Check afsenderens rolle
        const sender = await context.env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first() as any;
        const isAdmin = sender?.role === 'admin';

        // Opdater brugere
        for (const user of (users || [])) {
            if (isAdmin) {
                statements.push(
                    context.env.DB.prepare(`
              INSERT INTO users (id, name, phone, hashedPassword, status, role, time) 
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET 
                name=excluded.name, 
                phone=excluded.phone, 
                hashedPassword=excluded.hashedPassword, 
                status=excluded.status, 
                role=excluded.role, 
                time=excluded.time
            `).bind(
                        user.id,
                        user.name,
                        user.phone,
                        user.hashedPassword,
                        user.status,
                        user.role,
                        user.time
                    )
                );
            }
        }

        // 1. Udfør SLETNINGER først for at undgå at genindsætte slettede data fra forældet klient-state

        // Slet kurve
        for (const cartId of (deletedCarts || [])) {
            // Tjek ejerskab eller admin før sletning
            const cart = await context.env.DB.prepare("SELECT owner_id FROM carts WHERE id = ?").bind(cartId).first() as any;
            if (isAdmin || (cart && cart.owner_id === userId)) {
                statements.push(
                    context.env.DB.prepare("DELETE FROM carts WHERE id = ?").bind(cartId)
                );
            }
        }

        // Slet enkelte varer
        for (const itemId of (deletedItems || [])) {
            // Hent varen for at tjekke rettigheder (vi tjekker ud fra kurvens ejer)
            const item = await context.env.DB.prepare("SELECT cart_id FROM cart_items WHERE id = ?").bind(itemId).first() as any;
            if (!item) continue;

            let isCartOwner = false;
            let isSubscriber = false;

            if (!isAdmin) {
                const cart = await context.env.DB.prepare("SELECT owner_id FROM carts WHERE id = ?").bind(item.cart_id).first() as any;
                if (cart) {
                    isCartOwner = cart.owner_id === userId || cart.owner_id === `private_${userId}`;
                    if (!isCartOwner) {
                        const sub = await context.env.DB.prepare("SELECT 1 FROM user_connections WHERE follower_id = ? AND followed_id = ?").bind(userId, cart.owner_id.replace('private_', '')).first();
                        isSubscriber = !!sub;
                    }
                }
            }

            if (isAdmin || isCartOwner || isSubscriber) {
                statements.push(
                    context.env.DB.prepare("DELETE FROM cart_items WHERE id = ?").bind(itemId)
                );
            }
        }

        // Slet fjernede forbindelser
        for (const conn of (deletedConnections || [])) {
            // Tillad admin at slette hvad som helst, eller kun dem brugeren selv ejer
            if (isAdmin || conn.follower_id === userId || conn.followed_id === userId) {
                statements.push(
                    context.env.DB.prepare(`
                        DELETE FROM user_connections 
                        WHERE follower_id = ? AND followed_id = ?
                    `).bind(conn.follower_id, conn.followed_id)
                );
            }
        }

        // 2. Udfør INDSÆTTELSER / OPDATERINGER derefter

        // Opdater kurve
        for (const cart of (carts || [])) {
            const isOwner = cart.userId === userId || cart.userId === `private_${userId}`;
            if (isOwner || isAdmin) {
                // Ved migration bruger vi cart.userId som owner_id
                const ownerId = isAdmin ? (cart.userId?.replace('private_', '') || userId) : userId;

                statements.push(
                    context.env.DB.prepare(`
            INSERT INTO carts (id, name, owner_id, config) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, config=excluded.config, owner_id=excluded.owner_id
          `).bind(
                        cart.id,
                        cart.name,
                        ownerId,
                        JSON.stringify({
                            shops: cart.shops,
                            categories: cart.categories,
                            templateItems: cart.templateItems
                        })
                    )
                );
            }
        }

        // Opdater varer
        for (const item of (items || [])) {
            // Vi antager at hvis man har lov til at pushe kurven, har man også lov til at pushe dens varer
            statements.push(
                context.env.DB.prepare(`
            INSERT INTO cart_items (id, cart_id, name, shop_id, quantity, category, checked, last_checked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              cart_id=excluded.cart_id,
              name=excluded.name,
              shop_id=excluded.shop_id,
              quantity=excluded.quantity,
              category=excluded.category,
              checked=excluded.checked,
              last_checked_at=excluded.last_checked_at
          `).bind(
                    item.id,
                    item.cartId,
                    item.name,
                    item.shopId || null,
                    item.quantity || null,
                    item.category || null,
                    item.checked ? 1 : 0,
                    item.lastCheckedAt || null
                )
            );
        }

        // Opdater forbindelser
        for (const conn of (connections || [])) {
            statements.push(
                context.env.DB.prepare(`
          INSERT OR REPLACE INTO user_connections (follower_id, followed_id)
          VALUES (?, ?)
        `).bind(conn.follower_id, conn.followed_id)
            );
        }
        if (statements.length > 0) {
            await context.env.DB.batch(statements);
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};

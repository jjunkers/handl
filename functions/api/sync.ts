interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const { userId, carts, items, connections, users } = await context.request.json() as any;

        if (!userId) return new Response("Missing userId", { status: 400 });

        const statements = [];

        // Opdater brugere
        for (const user of (users || [])) {
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

        // Opdater kurve
        // ... (uforandret logic herunder)
        for (const cart of (carts || [])) {
            if (cart.userId === userId || cart.userId === `private_${userId}`) {
                statements.push(
                    context.env.DB.prepare(`
            INSERT INTO carts (id, name, owner_id, config) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, config=excluded.config
          `).bind(
                        cart.id,
                        cart.name,
                        userId,
                        JSON.stringify({
                            shops: cart.shops,
                            categories: cart.categories,
                            templateItems: cart.templateItems
                        })
                    )
                );
            }
        }

        // Opdater items
        for (const item of (items || [])) {
            statements.push(
                context.env.DB.prepare(`
          INSERT INTO cart_items (id, cart_id, name, category, checked, shop_id, last_checked_at, quantity)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            name=excluded.name, 
            category=excluded.category, 
            checked=excluded.checked, 
            shop_id=excluded.shop_id, 
            last_checked_at=excluded.last_checked_at, 
            quantity=excluded.quantity
        `).bind(
                    item.id,
                    item.cartId || item.shopId, // Midlertidig fix hvis frontend sender shopId som cartId ref
                    item.name,
                    item.category,
                    item.checked ? 1 : 0,
                    item.shopId,
                    item.lastCheckedAt || null,
                    item.quantity || null
                )
            );
        }

        // Opdater forbindelser
        for (const conn of (connections || [])) {
            statements.push(
                context.env.DB.prepare(`
          INSERT OR IGNORE INTO user_connections (follower_id, followed_id)
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

interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const user = await context.request.json() as any;

        // Tjek om telefonnummer allerede findes
        const existing = await context.env.DB.prepare(
            "SELECT id FROM users WHERE phone = ?"
        ).bind(user.phone).first();

        if (existing) {
            return new Response(JSON.stringify({ error: "Telefonnummeret er allerede registreret." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Gem eller opdatér brugeren
        await context.env.DB.prepare(
            "INSERT INTO users (id, name, phone, hashedPassword, status, role, time) VALUES (?, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, hashedPassword=excluded.hashedPassword, status=excluded.status, role=excluded.role, time=excluded.time"
        ).bind(
            user.id,
            user.name,
            user.phone,
            user.hashedPassword,
            user.status,
            user.role || 'user',
            user.time
        ).run();

        // ─── Migrér forbindelser ───
        if (user.connectedTo && Array.isArray(user.connectedTo)) {
            const statements = user.connectedTo.map((targetId: string) =>
                context.env.DB.prepare(
                    "INSERT INTO user_connections (follower_id, followed_id) VALUES (?, ?) " +
                    "ON CONFLICT(follower_id, followed_id) DO NOTHING"
                ).bind(user.id, targetId)
            );
            if (statements.length > 0) {
                await context.env.DB.batch(statements);
            }
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};

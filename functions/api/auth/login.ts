interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const { phone, hashedPassword } = await context.request.json() as any;

        const user = await context.env.DB.prepare(
            "SELECT * FROM users WHERE phone = ?"
        ).bind(phone).first() as any;

        if (!user) {
            return new Response(JSON.stringify({ error: "Brugeren blev ikke fundet." }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (user.hashedPassword !== hashedPassword) {
            return new Response(JSON.stringify({ error: "Forkert adgangskode." }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Returner bruger-data (undtagen password)
        const { hashedPassword: _, ...safeUser } = user;

        return new Response(JSON.stringify(safeUser), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};

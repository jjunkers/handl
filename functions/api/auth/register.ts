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

        // Gem brugeren
        await context.env.DB.prepare(
            "INSERT INTO users (id, name, phone, hashedPassword, status, role, time) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(
            user.id,
            user.name,
            user.phone,
            user.hashedPassword,
            user.status,
            user.role || 'user',
            user.time
        ).run();

        // Opret standard "Min kurv" i DB hvis den ikke findes (valgfrit, normalt håndteres det på sync)

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

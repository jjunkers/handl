interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const { id } = await context.request.json() as any;
        if (!id) return new Response("Missing id", { status: 400 });

        await context.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};

import 'dotenv/config';
import { db } from './database';

async function initDatabase() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS members (
                discord_id TEXT PRIMARY KEY,
                discord_username TEXT NOT NULL,
                character_name TEXT NOT NULL,
                character_class TEXT NOT NULL,
                level INTEGER NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        console.log('✅ Tabela members criada/verificada com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao inicializar a base de dados:', error);
    } finally {
        await db.end();
    }
}

initDatabase();
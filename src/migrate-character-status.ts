import 'dotenv/config';

import { db } from './database';

async function migrate() {
    try {
        console.log(
            '⏳ A adicionar estado PvM/PvP às personagens...',
        );

        await db.query(`
            ALTER TABLE characters
            ADD COLUMN IF NOT EXISTS character_status TEXT
        `);

        await db.query(`
            ALTER TABLE characters
            DROP CONSTRAINT IF EXISTS characters_character_status_check
        `);

        await db.query(`
            ALTER TABLE characters
            ADD CONSTRAINT characters_character_status_check
            CHECK (
                character_status IS NULL
                OR character_status IN ('pvm', 'pvp')
            )
        `);

        console.log(
            '✅ Coluna character_status criada.',
        );
    } catch (error) {
        console.error(
            '❌ Erro na migração:',
            error,
        );

        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

migrate();
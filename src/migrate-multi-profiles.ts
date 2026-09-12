import 'dotenv/config';
import { db } from './database';

async function migrate() {
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        console.log('⏳ A migrar base de dados...');

        // Tabela antiga passa temporariamente para outro nome
        await client.query(`
            ALTER TABLE members
            RENAME TO members_old;
        `);

        // Nova tabela de membros Discord
        await client.query(`
            CREATE TABLE members (
                discord_id TEXT PRIMARY KEY,
                discord_username TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // Personagens
        await client.query(`
            CREATE TABLE characters (
                id BIGSERIAL PRIMARY KEY,

                discord_id TEXT NOT NULL
                    REFERENCES members(discord_id)
                    ON DELETE CASCADE,

                character_name TEXT NOT NULL,
                character_class TEXT NOT NULL,

                level INTEGER NOT NULL
                    CHECK (level >= 1 AND level <= 999),

                is_main BOOLEAN NOT NULL DEFAULT FALSE,

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // Recuperar membros existentes
        await client.query(`
            INSERT INTO members (
                discord_id,
                discord_username,
                created_at,
                updated_at
            )
            SELECT
                discord_id,
                discord_username,
                created_at,
                updated_at
            FROM members_old;
        `);

        // Transformar os antigos perfis em personagens
        await client.query(`
            INSERT INTO characters (
                discord_id,
                character_name,
                character_class,
                level,
                is_main,
                created_at,
                updated_at
            )
            SELECT
                discord_id,
                character_name,
                character_class,
                level,
                TRUE,
                created_at,
                updated_at
            FROM members_old;
        `);

        // Não permitir nomes de personagens repetidos
        await client.query(`
            CREATE UNIQUE INDEX characters_name_unique
            ON characters (LOWER(character_name));
        `);

        // Apenas uma personagem principal por utilizador
        await client.query(`
            CREATE UNIQUE INDEX characters_one_main_per_user
            ON characters (discord_id)
            WHERE is_main = TRUE;
        `);

        // Remover tabela antiga
        await client.query(`
            DROP TABLE members_old;
        `);

        await client.query('COMMIT');

        console.log('✅ Migração concluída.');
    } catch (error) {
        await client.query('ROLLBACK');

        console.error(
            '❌ Erro durante a migração:',
            error,
        );
    } finally {
        client.release();
        await db.end();
    }
}

migrate();
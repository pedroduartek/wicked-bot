import 'dotenv/config';

import { db } from './database';

async function main() {
    console.log('🔄 A criar/atualizar tabela bets...');

    await db.query(`
        CREATE TABLE IF NOT EXISTS bets (
            id BIGSERIAL PRIMARY KEY,

            discord_id TEXT NOT NULL,
            discord_username TEXT NOT NULL,

            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,

            bet_text TEXT NOT NULL,

            duration_days INTEGER NOT NULL
                CHECK (
                    duration_days >= 1
                    AND duration_days <= 365
                ),

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            due_at TIMESTAMPTZ NOT NULL,

            reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
            reminder_sent_at TIMESTAMPTZ,
            reminder_message_id TEXT,

            resolved BOOLEAN NOT NULL DEFAULT FALSE,
            result TEXT,

            resolved_at TIMESTAMPTZ,

            CONSTRAINT bets_result_check
                CHECK (
                    result IS NULL
                    OR result IN (
                        'won',
                        'lost'
                    )
                )
        );
    `);

    // Para instalações onde a tabela já existia
    await db.query(`
        ALTER TABLE bets
        ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
    `);

    await db.query(`
        CREATE INDEX IF NOT EXISTS bets_due_at_idx
        ON bets (
            due_at
        )
        WHERE
            resolved = FALSE
            AND reminder_sent = FALSE;
    `);

    await db.query(`
        CREATE INDEX IF NOT EXISTS bets_discord_id_idx
        ON bets (
            discord_id
        );
    `);

    console.log('✅ Migration de bets concluída.');
}

main()
    .catch(error => {
        console.error(
            '❌ Erro na migration de bets:',
            error,
        );

        process.exitCode = 1;
    })
    .finally(async () => {
        await db.end();
    });
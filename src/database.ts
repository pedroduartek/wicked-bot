import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error(
        'DATABASE_URL não está definido no ficheiro .env',
    );
}

export const db = new Pool({
    connectionString: databaseUrl,
    max: 5,
    enableChannelBinding: true,
});

db.on('error', error => {
    console.error(
        '❌ Erro inesperado na ligação PostgreSQL:',
        error,
    );
});
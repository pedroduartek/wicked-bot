import 'dotenv/config';
import { db } from './database';
import {
    Client,
    Events,
    GatewayIntentBits,
} from 'discord.js';

const token = process.env.DISCORD_TOKEN;

if (!token) {
    throw new Error('DISCORD_TOKEN não está definido no ficheiro .env');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ Bot online como ${readyClient.user.tag}`);

    try {
        const result = await db.query(
            'SELECT NOW() AS current_time'
        );

        console.log(
            '✅ PostgreSQL ligado:',
            result.rows[0].current_time
        );
    } catch (error) {
        console.error(
            '❌ Não foi possível ligar ao PostgreSQL:',
            error
        );
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) {
        return;
    }

    if (interaction.commandName === 'ping') {
        await interaction.reply('🏓 Pong!');
    }
});

client.login(token);
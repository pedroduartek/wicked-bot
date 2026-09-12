import 'dotenv/config';

import {
    REST,
    Routes,
    SlashCommandBuilder,
} from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
    throw new Error(
        'DISCORD_TOKEN, DISCORD_CLIENT_ID ou DISCORD_GUILD_ID não estão definidos.',
    );
}

const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Verifica se o Wicked Bot está online'),

    new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Regista ou atualiza a tua personagem no roster'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

async function deployCommands() {
    try {
        console.log('⏳ A registar comandos...');

        await rest.put(
            Routes.applicationGuildCommands(clientId!, guildId!),
            {
                body: commands,
            },
        );

        console.log('✅ Comandos registados.');
    } catch (error) {
        console.error('❌ Erro ao registar comandos:', error);
    }
}

deployCommands();
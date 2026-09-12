import 'dotenv/config';

import {
    REST,
    Routes,
    SlashCommandBuilder,
} from 'discord.js';

const token =
    process.env.DISCORD_TOKEN;

const clientId =
    process.env.DISCORD_CLIENT_ID;

const guildId =
    process.env.DISCORD_GUILD_ID;

if (
    !token ||
    !clientId ||
    !guildId
) {
    throw new Error(
        'Faltam DISCORD_TOKEN, DISCORD_CLIENT_ID ou DISCORD_GUILD_ID no .env.',
    );
}

const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription(
            'Testa se o bot está online',
        ),

    new SlashCommandBuilder()
        .setName('perfil')
        .setDescription(
            'Gere as tuas personagens',
        )
        .addSubcommand(
            subcommand =>
                subcommand
                    .setName(
                        'adicionar',
                    )
                    .setDescription(
                        'Adiciona uma personagem',
                    ),
        )
        .addSubcommand(
            subcommand =>
                subcommand
                    .setName(
                        'listar',
                    )
                    .setDescription(
                        'Lista as tuas personagens',
                    ),
        )
        .addSubcommand(
            subcommand =>
                subcommand
                    .setName(
                        'editar',
                    )
                    .setDescription(
                        'Edita uma personagem',
                    ),
        )
        .addSubcommand(
            subcommand =>
                subcommand
                    .setName(
                        'remover',
                    )
                    .setDescription(
                        'Remove uma personagem',
                    ),
        ),

    new SlashCommandBuilder()
        .setName('roster')
        .setDescription(
            'Mostra o roster atual da guild',
        ),

    new SlashCommandBuilder()
        .setName('composicao')
        .setDescription(
            'Mostra a composição PvP atual da guild',
        ),

    new SlashCommandBuilder()
        .setName(
            'composicao-pvm',
        )
        .setDescription(
            'Mostra a composição PvM atual da guild',
        ),

    new SlashCommandBuilder()
        .setName('aposto')
        .setDescription(
            'Regista uma aposta para cobrar mais tarde',
        )
        .addStringOption(
            option =>
                option
                    .setName(
                        'aposta',
                    )
                    .setDescription(
                        'O que estás a apostar',
                    )
                    .setRequired(
                        true,
                    )
                    .setMinLength(
                        3,
                    )
                    .setMaxLength(
                        500,
                    ),
        )
        .addIntegerOption(
            option =>
                option
                    .setName(
                        'dias',
                    )
                    .setDescription(
                        'Daqui a quantos dias o bot deve relembrar',
                    )
                    .setRequired(
                        true,
                    )
                    .setMinValue(
                        1,
                    )
                    .setMaxValue(
                        365,
                    ),
        ),

    new SlashCommandBuilder()
        .setName('apostas')
        .setDescription(
            'Mostra as apostas pendentes',
        ),
].map(
    command =>
        command.toJSON(),
);

async function main() {
    const rest =
        new REST({
            version: '10',
        }).setToken(
            token!,
        );

    console.log(
        '🔄 A atualizar slash commands...',
    );

    await rest.put(
        Routes.applicationGuildCommands(
            clientId!,
            guildId!,
        ),
        {
            body:
                commands,
        },
    );

    console.log(
        `✅ ${commands.length} comandos atualizados.`,
    );
}

main().catch(
    error => {
        console.error(
            '❌ Erro ao atualizar comandos:',
            error,
        );

        process.exitCode = 1;
    },
);
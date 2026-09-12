import 'dotenv/config';

import {
    Client,
    Events,
    GatewayIntentBits,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';

import { db } from './database';

const token = process.env.DISCORD_TOKEN;

if (!token) {
    throw new Error('DISCORD_TOKEN não está definido.');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

const VALID_CLASSES = [
    'Guerreiro Corpo',
    'Guerreiro Mental',
    'Ninja Adagas',
    'Ninja Arco',
    'Sura Armas',
    'Sura Magia',
    'Xamã Dragão',
    'Xamã Cura',
    'Lycan',
];

client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ Bot online como ${readyClient.user.tag}`);

    try {
        const result = await db.query(
            'SELECT NOW() AS current_time',
        );

        console.log(
            '✅ PostgreSQL ligado:',
            result.rows[0].current_time,
        );
    } catch (error) {
        console.error(
            '❌ Não foi possível ligar ao PostgreSQL:',
            error,
        );
    }
});

client.on(Events.InteractionCreate, async interaction => {
    // ==========================================
    // SLASH COMMANDS
    // ==========================================

    if (interaction.isChatInputCommand()) {
        console.log(
            `➡️ Comando recebido: /${interaction.commandName}`,
        );

        if (interaction.commandName === 'ping') {
            await interaction.reply('🏓 Pong!');
            return;
        }

        if (interaction.commandName === 'perfil') {
            const modal = new ModalBuilder()
                .setCustomId('perfil-modal')
                .setTitle('Perfil Wicked');

            // Nome da personagem
            const characterNameInput =
                new TextInputBuilder()
                    .setCustomId('character-name')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ex: Pedro')
                    .setMinLength(2)
                    .setMaxLength(24)
                    .setRequired(true);

            const characterNameLabel =
                new LabelBuilder()
                    .setLabel('Nome da personagem')
                    .setDescription(
                        'Nome da tua personagem principal no Azuria',
                    )
                    .setTextInputComponent(
                        characterNameInput,
                    );

            // Classe
            const classSelect =
                new StringSelectMenuBuilder()
                    .setCustomId('character-class')
                    .setPlaceholder(
                        'Seleciona a tua classe',
                    )
                    .setRequired(true)
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Guerreiro Corpo')
                            .setValue('Guerreiro Corpo'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('Guerreiro Mental')
                            .setValue('Guerreiro Mental'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('Ninja Adagas')
                            .setValue('Ninja Adagas'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('Ninja Arco')
                            .setValue('Ninja Arco'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('Sura Armas')
                            .setValue('Sura Armas'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('Sura Magia')
                            .setValue('Sura Magia'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('Xamã Dragão')
                            .setValue('Xamã Dragão'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('Xamã Cura')
                            .setValue('Xamã Cura'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('Lycan')
                            .setValue('Lycan'),
                    );

            const classLabel =
                new LabelBuilder()
                    .setLabel('Classe')
                    .setDescription(
                        'Seleciona a classe da personagem',
                    )
                    .setStringSelectMenuComponent(
                        classSelect,
                    );

            // Nível
            const levelInput =
                new TextInputBuilder()
                    .setCustomId('character-level')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ex: 120')
                    .setMinLength(1)
                    .setMaxLength(3)
                    .setRequired(true);

            const levelLabel =
                new LabelBuilder()
                    .setLabel('Nível')
                    .setTextInputComponent(levelInput);

            modal.addLabelComponents(
                characterNameLabel,
                classLabel,
                levelLabel,
            );

            await interaction.showModal(modal);
            return;
        }
    }

    // ==========================================
    // PERFIL MODAL
    // ==========================================

    if (
        interaction.isModalSubmit() &&
        interaction.customId === 'perfil-modal'
    ) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral,
        });

        const characterName =
            interaction.fields
                .getTextInputValue('character-name')
                .trim();

        const selectedClasses =
            interaction.fields.getStringSelectValues(
                'character-class',
            );

        const characterClass = selectedClasses[0];

        const levelText =
            interaction.fields
                .getTextInputValue('character-level')
                .trim();

        const level = Number(levelText);

        // Validação do nome
        if (
            characterName.length < 2 ||
            characterName.length > 24
        ) {
            await interaction.editReply(
                '❌ O nome da personagem não é válido.',
            );
            return;
        }

        // Validação da classe
        if (
            !characterClass ||
            !VALID_CLASSES.includes(characterClass)
        ) {
            await interaction.editReply(
                '❌ A classe selecionada não é válida.',
            );
            return;
        }

        // Validação do nível
        if (
            !Number.isInteger(level) ||
            level < 1 ||
            level > 999
        ) {
            await interaction.editReply(
                '❌ O nível tem de ser um número entre 1 e 999.',
            );
            return;
        }

        try {
            await db.query(
                `
                INSERT INTO members (
                    discord_id,
                    discord_username,
                    character_name,
                    character_class,
                    level
                )
                VALUES ($1, $2, $3, $4, $5)

                ON CONFLICT (discord_id)
                DO UPDATE SET
                    discord_username = EXCLUDED.discord_username,
                    character_name = EXCLUDED.character_name,
                    character_class = EXCLUDED.character_class,
                    level = EXCLUDED.level,
                    updated_at = NOW()
                `,
                [
                    interaction.user.id,
                    interaction.user.username,
                    characterName,
                    characterClass,
                    level,
                ],
            );

            console.log(
                `✅ Perfil atualizado: ${interaction.user.username} → ${characterName}`,
            );

            await interaction.editReply(
                [
                    '✅ **Perfil guardado!**',
                    '',
                    `**Personagem:** ${characterName}`,
                    `**Classe:** ${characterClass}`,
                    `**Nível:** ${level}`,
                ].join('\n'),
            );
        } catch (error) {
            console.error(
                '❌ Erro ao guardar perfil:',
                error,
            );

            await interaction.editReply(
                '❌ Ocorreu um erro ao guardar o teu perfil.',
            );
        }

        return;
    }
});

client.login(token);
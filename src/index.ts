import 'dotenv/config';

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Client,
    Events,
    GatewayIntentBits,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    StringSelectMenuBuilder,
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

type CharacterData = {
    id: string;
    character_name: string;
    character_class: string;
    level: number;
    is_main: boolean;
};

// =====================================================
// HELPERS
// =====================================================

function buildCharacterModal(
    customId: string,
    title: string,
    character?: CharacterData,
) {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title);

    // Nome
    const nameInput = new TextInputBuilder()
        .setCustomId('character-name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: PedroWar')
        .setMinLength(2)
        .setMaxLength(24)
        .setRequired(true);

    if (character) {
        nameInput.setValue(character.character_name);
    }

    const nameLabel = new LabelBuilder()
        .setLabel('Nome da personagem')
        .setDescription('Nome exato da personagem no Azuria')
        .setTextInputComponent(nameInput);

    // Classe
    const classSelect = new StringSelectMenuBuilder()
        .setCustomId('character-class')
        .setPlaceholder('Seleciona a classe')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true)
        .addOptions(
            ...VALID_CLASSES.map(characterClass => ({
                label: characterClass,
                value: characterClass,
                default:
                    character?.character_class === characterClass,
            })),
        );

    const classLabel = new LabelBuilder()
        .setLabel('Classe')
        .setStringSelectMenuComponent(classSelect);

    // Nível
    const levelInput = new TextInputBuilder()
        .setCustomId('character-level')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 120')
        .setMinLength(1)
        .setMaxLength(3)
        .setRequired(true);

    if (character) {
        levelInput.setValue(String(character.level));
    }

    const levelLabel = new LabelBuilder()
        .setLabel('Nível')
        .setTextInputComponent(levelInput);

    // Main
    const mainSelect = new StringSelectMenuBuilder()
        .setCustomId('character-main')
        .setPlaceholder('É a tua personagem principal?')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true)
        .addOptions(
            {
                label: 'Sim',
                description: 'Definir como personagem principal',
                value: 'yes',
                default: character?.is_main === true,
            },
            {
                label: 'Não',
                description: 'Personagem secundária',
                value: 'no',
                default: character?.is_main === false,
            },
        );

    const mainLabel = new LabelBuilder()
        .setLabel('Personagem principal')
        .setDescription(
            'Só podes ter uma personagem principal',
        )
        .setStringSelectMenuComponent(mainSelect);

    modal.addLabelComponents(
        nameLabel,
        classLabel,
        levelLabel,
        mainLabel,
    );

    return modal;
}

function readCharacterModal(
    interaction: ModalSubmitInteraction,
) {
    const characterName = interaction.fields
        .getTextInputValue('character-name')
        .trim();

    const characterClass =
        interaction.fields
            .getStringSelectValues('character-class')[0];

    const levelText = interaction.fields
        .getTextInputValue('character-level')
        .trim();

    const requestedMain =
        interaction.fields
            .getStringSelectValues('character-main')[0] ===
        'yes';

    return {
        characterName,
        characterClass,
        level: Number(levelText),
        requestedMain,
    };
}

function validateCharacter(
    characterName: string,
    characterClass: string,
    level: number,
) {
    if (
        characterName.length < 2 ||
        characterName.length > 24
    ) {
        return '❌ Nome da personagem inválido.';
    }

    if (
        !characterClass ||
        !VALID_CLASSES.includes(characterClass)
    ) {
        return '❌ Classe inválida.';
    }

    if (
        !Number.isInteger(level) ||
        level < 1 ||
        level > 999
    ) {
        return '❌ O nível tem de ser um número entre 1 e 999.';
    }

    return null;
}

function buildCharacterSelect(
    customId: string,
    characters: CharacterData[],
) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder('Seleciona uma personagem')
        .addOptions(
            characters.map(character => ({
                label:
                    `${character.is_main ? '⭐ ' : ''}` +
                    character.character_name,
                description:
                    `${character.character_class} • Lv. ${character.level}`,
                value: String(character.id),
            })),
        );

    return new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(select);
}

// =====================================================
// BOT READY
// =====================================================

client.once(Events.ClientReady, async readyClient => {
    console.log(
        `✅ Bot online como ${readyClient.user.tag}`,
    );

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

// =====================================================
// INTERACTIONS
// =====================================================

client.on(Events.InteractionCreate, async interaction => {

    // =================================================
    // SLASH COMMANDS
    // =================================================

    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === 'ping') {
            await interaction.reply('🏓 Pong!');
            return;
        }

        if (interaction.commandName !== 'perfil') {
            return;
        }

        const subcommand =
            interaction.options.getSubcommand();

        // =============================================
        // /perfil adicionar
        // =============================================

        if (subcommand === 'adicionar') {
            await interaction.showModal(
                buildCharacterModal(
                    'perfil-add-modal',
                    'Adicionar personagem',
                ),
            );

            return;
        }

        // =============================================
        // /perfil listar
        // =============================================

        if (subcommand === 'listar') {
            await interaction.deferReply({
                flags: MessageFlags.Ephemeral,
            });

            try {
                const result = await db.query(
                    `
                    SELECT
                        id,
                        character_name,
                        character_class,
                        level,
                        is_main
                    FROM characters
                    WHERE discord_id = $1
                    ORDER BY
                        is_main DESC,
                        character_name ASC
                    `,
                    [interaction.user.id],
                );

                if (result.rows.length === 0) {
                    await interaction.editReply(
                        'Ainda não tens nenhuma personagem registada.\n\nUsa `/perfil adicionar`.',
                    );

                    return;
                }

                const characters =
                    result.rows.map(character => {
                        return (
                            `${character.is_main ? '⭐ ' : ''}` +
                            `**${character.character_name}**\n` +
                            `${character.character_class} • Lv. ${character.level}`
                        );
                    });

                await interaction.editReply(
                    [
                        `## Personagens de ${
                            interaction.user.globalName ??
                            interaction.user.username
                        }`,
                        '',
                        ...characters,
                    ].join('\n\n'),
                );
            } catch (error) {
                console.error(
                    '❌ Erro ao listar personagens:',
                    error,
                );

                await interaction.editReply(
                    '❌ Ocorreu um erro ao consultar as tuas personagens.',
                );
            }

            return;
        }

        // =============================================
        // /perfil editar
        // =============================================

        if (subcommand === 'editar') {
            const result = await db.query(
                `
                SELECT
                    id,
                    character_name,
                    character_class,
                    level,
                    is_main
                FROM characters
                WHERE discord_id = $1
                ORDER BY
                    is_main DESC,
                    character_name ASC
                `,
                [interaction.user.id],
            );

            if (result.rows.length === 0) {
                await interaction.reply({
                    content:
                        'Ainda não tens nenhuma personagem registada.',
                    flags: MessageFlags.Ephemeral,
                });

                return;
            }

            await interaction.reply({
                content:
                    '**Qual personagem queres editar?**',
                components: [
                    buildCharacterSelect(
                        'perfil-edit-select',
                        result.rows,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        // =============================================
        // /perfil remover
        // =============================================

        if (subcommand === 'remover') {
            const result = await db.query(
                `
                SELECT
                    id,
                    character_name,
                    character_class,
                    level,
                    is_main
                FROM characters
                WHERE discord_id = $1
                ORDER BY
                    is_main DESC,
                    character_name ASC
                `,
                [interaction.user.id],
            );

            if (result.rows.length === 0) {
                await interaction.reply({
                    content:
                        'Ainda não tens nenhuma personagem registada.',
                    flags: MessageFlags.Ephemeral,
                });

                return;
            }

            await interaction.reply({
                content:
                    '**Qual personagem queres remover?**',
                components: [
                    buildCharacterSelect(
                        'perfil-remove-select',
                        result.rows,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            return;
        }
    }

    // =================================================
    // SELECT: EDITAR
    // =================================================

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId === 'perfil-edit-select'
    ) {
        const characterId = interaction.values[0];

        const result = await db.query(
            `
            SELECT
                id,
                character_name,
                character_class,
                level,
                is_main
            FROM characters
            WHERE
                id = $1
                AND discord_id = $2
            `,
            [
                characterId,
                interaction.user.id,
            ],
        );

        if (result.rows.length === 0) {
            await interaction.reply({
                content:
                    '❌ Essa personagem já não existe.',
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        const character = result.rows[0];

        await interaction.showModal(
            buildCharacterModal(
                `perfil-edit-modal:${character.id}`,
                'Editar personagem',
                character,
            ),
        );

        return;
    }

    // =================================================
    // SELECT: REMOVER
    // =================================================

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId === 'perfil-remove-select'
    ) {
        const characterId = interaction.values[0];

        const result = await db.query(
            `
            SELECT
                id,
                character_name,
                character_class,
                level,
                is_main
            FROM characters
            WHERE
                id = $1
                AND discord_id = $2
            `,
            [
                characterId,
                interaction.user.id,
            ],
        );

        if (result.rows.length === 0) {
            await interaction.update({
                content:
                    '❌ Essa personagem já não existe.',
                components: [],
            });

            return;
        }

        const character = result.rows[0];

        const buttons =
            new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `perfil-remove-confirm:${character.id}`,
                        )
                        .setLabel('Remover')
                        .setStyle(ButtonStyle.Danger),

                    new ButtonBuilder()
                        .setCustomId(
                            'perfil-remove-cancel',
                        )
                        .setLabel('Cancelar')
                        .setStyle(ButtonStyle.Secondary),
                );

        await interaction.update({
            content:
                `⚠️ Tens a certeza de que queres remover **${character.character_name}**?`,
            components: [buttons],
        });

        return;
    }

    // =================================================
    // BOTÃO: CANCELAR REMOÇÃO
    // =================================================

    if (
        interaction.isButton() &&
        interaction.customId ===
            'perfil-remove-cancel'
    ) {
        await interaction.update({
            content: '✅ Remoção cancelada.',
            components: [],
        });

        return;
    }

    // =================================================
    // BOTÃO: CONFIRMAR REMOÇÃO
    // =================================================

    if (
        interaction.isButton() &&
        interaction.customId.startsWith(
            'perfil-remove-confirm:',
        )
    ) {
        await interaction.deferUpdate();

        const characterId =
            interaction.customId.split(':')[1];

        const dbClient = await db.connect();

        try {
            await dbClient.query('BEGIN');

            const result = await dbClient.query(
                `
                SELECT
                    id,
                    character_name,
                    is_main
                FROM characters
                WHERE
                    id = $1
                    AND discord_id = $2
                FOR UPDATE
                `,
                [
                    characterId,
                    interaction.user.id,
                ],
            );

            if (result.rows.length === 0) {
                await dbClient.query('ROLLBACK');

                await interaction.editReply({
                    content:
                        '❌ Essa personagem já não existe.',
                    components: [],
                });

                return;
            }

            const character = result.rows[0];

            await dbClient.query(
                `
                DELETE FROM characters
                WHERE
                    id = $1
                    AND discord_id = $2
                `,
                [
                    characterId,
                    interaction.user.id,
                ],
            );

            let newMainName: string | null = null;

            // Se removemos a Main, escolher outra
            if (character.is_main) {
                const replacement =
                    await dbClient.query(
                        `
                        SELECT
                            id,
                            character_name
                        FROM characters
                        WHERE discord_id = $1
                        ORDER BY
                            created_at ASC,
                            id ASC
                        LIMIT 1
                        `,
                        [interaction.user.id],
                    );

                if (replacement.rows.length > 0) {
                    await dbClient.query(
                        `
                        UPDATE characters
                        SET
                            is_main = TRUE,
                            updated_at = NOW()
                        WHERE id = $1
                        `,
                        [replacement.rows[0].id],
                    );

                    newMainName =
                        replacement.rows[0]
                            .character_name;
                }
            }

            await dbClient.query('COMMIT');

            let response =
                `✅ **${character.character_name}** foi removida.`;

            if (newMainName) {
                response +=
                    `\n\n⭐ **${newMainName}** passou a ser a tua personagem principal.`;
            }

            await interaction.editReply({
                content: response,
                components: [],
            });

        } catch (error) {
            await dbClient.query('ROLLBACK');

            console.error(
                '❌ Erro ao remover personagem:',
                error,
            );

            await interaction.editReply({
                content:
                    '❌ Ocorreu um erro ao remover a personagem.',
                components: [],
            });
        } finally {
            dbClient.release();
        }

        return;
    }

    // =================================================
    // MODAL: ADICIONAR
    // =================================================

    if (
        interaction.isModalSubmit() &&
        interaction.customId ===
            'perfil-add-modal'
    ) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral,
        });

        const {
            characterName,
            characterClass,
            level,
            requestedMain,
        } = readCharacterModal(interaction);

        const validationError =
            validateCharacter(
                characterName,
                characterClass,
                level,
            );

        if (validationError) {
            await interaction.editReply(
                validationError,
            );

            return;
        }

        const dbClient = await db.connect();

        try {
            await dbClient.query('BEGIN');

            await dbClient.query(
                `
                INSERT INTO members (
                    discord_id,
                    discord_username
                )
                VALUES ($1, $2)

                ON CONFLICT (discord_id)
                DO UPDATE SET
                    discord_username =
                        EXCLUDED.discord_username,
                    updated_at = NOW()
                `,
                [
                    interaction.user.id,
                    interaction.user.username,
                ],
            );

            const countResult =
                await dbClient.query(
                    `
                    SELECT COUNT(*)::INTEGER AS count
                    FROM characters
                    WHERE discord_id = $1
                    `,
                    [interaction.user.id],
                );

            const characterCount =
                countResult.rows[0].count;

            const makeMain =
                characterCount === 0 ||
                requestedMain;

            if (makeMain) {
                await dbClient.query(
                    `
                    UPDATE characters
                    SET
                        is_main = FALSE,
                        updated_at = NOW()
                    WHERE
                        discord_id = $1
                        AND is_main = TRUE
                    `,
                    [interaction.user.id],
                );
            }

            await dbClient.query(
                `
                INSERT INTO characters (
                    discord_id,
                    character_name,
                    character_class,
                    level,
                    is_main
                )
                VALUES ($1, $2, $3, $4, $5)
                `,
                [
                    interaction.user.id,
                    characterName,
                    characterClass,
                    level,
                    makeMain,
                ],
            );

            await dbClient.query('COMMIT');

            await interaction.editReply(
                [
                    '✅ **Personagem adicionada!**',
                    '',
                    `**Nome:** ${characterName}`,
                    `**Classe:** ${characterClass}`,
                    `**Nível:** ${level}`,
                    `**Principal:** ${
                        makeMain ? 'Sim ⭐' : 'Não'
                    }`,
                ].join('\n'),
            );

        } catch (error: any) {
            await dbClient.query('ROLLBACK');

            console.error(
                '❌ Erro ao adicionar personagem:',
                error,
            );

            if (error.code === '23505') {
                await interaction.editReply(
                    `❌ Já existe uma personagem chamada **${characterName}** registada.`,
                );

                return;
            }

            await interaction.editReply(
                '❌ Ocorreu um erro ao guardar a personagem.',
            );
        } finally {
            dbClient.release();
        }

        return;
    }

    // =================================================
    // MODAL: EDITAR
    // =================================================

    if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
            'perfil-edit-modal:',
        )
    ) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral,
        });

        const characterId =
            interaction.customId.split(':')[1];

        const {
            characterName,
            characterClass,
            level,
            requestedMain,
        } = readCharacterModal(interaction);

        const validationError =
            validateCharacter(
                characterName,
                characterClass,
                level,
            );

        if (validationError) {
            await interaction.editReply(
                validationError,
            );

            return;
        }

        const dbClient = await db.connect();

        try {
            await dbClient.query('BEGIN');

            const currentResult =
                await dbClient.query(
                    `
                    SELECT
                        id,
                        character_name,
                        is_main
                    FROM characters
                    WHERE
                        id = $1
                        AND discord_id = $2
                    FOR UPDATE
                    `,
                    [
                        characterId,
                        interaction.user.id,
                    ],
                );

            if (currentResult.rows.length === 0) {
                await dbClient.query('ROLLBACK');

                await interaction.editReply(
                    '❌ Essa personagem já não existe.',
                );

                return;
            }

            const current =
                currentResult.rows[0];

            const countResult =
                await dbClient.query(
                    `
                    SELECT COUNT(*)::INTEGER AS count
                    FROM characters
                    WHERE discord_id = $1
                    `,
                    [interaction.user.id],
                );

            const characterCount =
                countResult.rows[0].count;

            let finalMain = requestedMain;

            // Se só há uma personagem, é sempre Main
            if (characterCount === 1) {
                finalMain = true;
            }

            // Queremos tornar esta Main
            if (finalMain) {
                await dbClient.query(
                    `
                    UPDATE characters
                    SET
                        is_main = FALSE,
                        updated_at = NOW()
                    WHERE
                        discord_id = $1
                        AND id <> $2
                        AND is_main = TRUE
                    `,
                    [
                        interaction.user.id,
                        characterId,
                    ],
                );

                await dbClient.query(
                    `
                    UPDATE characters
                    SET
                        character_name = $1,
                        character_class = $2,
                        level = $3,
                        is_main = TRUE,
                        updated_at = NOW()
                    WHERE
                        id = $4
                        AND discord_id = $5
                    `,
                    [
                        characterName,
                        characterClass,
                        level,
                        characterId,
                        interaction.user.id,
                    ],
                );
            }

            // Main atual passa para secundária
            else if (current.is_main) {

                // Primeiro retirar Main
                await dbClient.query(
                    `
                    UPDATE characters
                    SET
                        character_name = $1,
                        character_class = $2,
                        level = $3,
                        is_main = FALSE,
                        updated_at = NOW()
                    WHERE
                        id = $4
                        AND discord_id = $5
                    `,
                    [
                        characterName,
                        characterClass,
                        level,
                        characterId,
                        interaction.user.id,
                    ],
                );

                // Escolher substituta
                const replacement =
                    await dbClient.query(
                        `
                        SELECT id
                        FROM characters
                        WHERE
                            discord_id = $1
                            AND id <> $2
                        ORDER BY
                            created_at ASC,
                            id ASC
                        LIMIT 1
                        `,
                        [
                            interaction.user.id,
                            characterId,
                        ],
                    );

                if (replacement.rows.length > 0) {
                    await dbClient.query(
                        `
                        UPDATE characters
                        SET
                            is_main = TRUE,
                            updated_at = NOW()
                        WHERE id = $1
                        `,
                        [replacement.rows[0].id],
                    );
                }
            }

            // Era secundária e continua secundária
            else {
                await dbClient.query(
                    `
                    UPDATE characters
                    SET
                        character_name = $1,
                        character_class = $2,
                        level = $3,
                        updated_at = NOW()
                    WHERE
                        id = $4
                        AND discord_id = $5
                    `,
                    [
                        characterName,
                        characterClass,
                        level,
                        characterId,
                        interaction.user.id,
                    ],
                );
            }

            await dbClient.query('COMMIT');

            await interaction.editReply(
                [
                    '✅ **Personagem atualizada!**',
                    '',
                    `**Nome:** ${characterName}`,
                    `**Classe:** ${characterClass}`,
                    `**Nível:** ${level}`,
                    `**Principal:** ${
                        finalMain ? 'Sim ⭐' : 'Não'
                    }`,
                ].join('\n'),
            );

        } catch (error: any) {
            await dbClient.query('ROLLBACK');

            console.error(
                '❌ Erro ao editar personagem:',
                error,
            );

            if (error.code === '23505') {
                await interaction.editReply(
                    `❌ Já existe uma personagem chamada **${characterName}** registada.`,
                );

                return;
            }

            await interaction.editReply(
                '❌ Ocorreu um erro ao editar a personagem.',
            );
        } finally {
            dbClient.release();
        }

        return;
    }
});

client.login(token);
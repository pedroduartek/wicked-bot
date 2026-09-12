import 'dotenv/config';

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    EmbedBuilder,
    Events,
    GatewayIntentBits,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    TextChannel,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';

import { db } from './database';

// =====================================================
// CONFIG
// =====================================================

const token = process.env.DISCORD_TOKEN;

if (!token) {
    throw new Error(
        'DISCORD_TOKEN não está definido.',
    );
}

// =====================================================
// AZURIA
// =====================================================

const AZURIA_ROLE_ID =
    '1547612647736746074';

const AZURIA_PVP_ROLE_ID =
    '1548260956860325959';

const AZURIA_PVM_ROLE_ID =
    '1548261013550276648';

const AZURIA_CHANNEL_ID =
    '1548265183053357146';

const AZURIA_PANEL_MARKER =
    'Wicked Bot • Azuria Status';

const COMMANDS_HELP_MARKER =
    'Wicked Bot • Commands Help';

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

// =====================================================
// GENERAL CONFIG
// =====================================================

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

const ROSTER_MEMBERS_PER_PAGE = 5;

// =====================================================
// TYPES
// =====================================================

type CharacterData = {
    id: string;
    character_name: string;
    character_class: string;
    level: number;
    is_main: boolean;
};

type RosterMember = {
    discord_id: string;
    discord_username: string;
    azuria_status:
        | 'pvm'
        | 'pvp'
        | null;
    characters: CharacterData[];
};

// =====================================================
// PROFILE HELPERS
// =====================================================

function buildCharacterModal(
    customId: string,
    title: string,
    character?: CharacterData,
) {
    const modal =
        new ModalBuilder()
            .setCustomId(customId)
            .setTitle(title);

    const nameInput =
        new TextInputBuilder()
            .setCustomId(
                'character-name',
            )
            .setStyle(
                TextInputStyle.Short,
            )
            .setPlaceholder(
                'Ex: PedroWar',
            )
            .setMinLength(2)
            .setMaxLength(24)
            .setRequired(true);

    if (character) {
        nameInput.setValue(
            character.character_name,
        );
    }

    const nameLabel =
        new LabelBuilder()
            .setLabel(
                'Nome da personagem',
            )
            .setDescription(
                'Nome exato da personagem no Azuria',
            )
            .setTextInputComponent(
                nameInput,
            );

    const classSelect =
        new StringSelectMenuBuilder()
            .setCustomId(
                'character-class',
            )
            .setPlaceholder(
                'Seleciona a classe',
            )
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true)
            .addOptions(
                ...VALID_CLASSES.map(
                    characterClass => ({
                        label:
                            characterClass,

                        value:
                            characterClass,

                        default:
                            character
                                ?.character_class ===
                            characterClass,
                    }),
                ),
            );

    const classLabel =
        new LabelBuilder()
            .setLabel('Classe')
            .setStringSelectMenuComponent(
                classSelect,
            );

    const levelInput =
        new TextInputBuilder()
            .setCustomId(
                'character-level',
            )
            .setStyle(
                TextInputStyle.Short,
            )
            .setPlaceholder('Ex: 120')
            .setMinLength(1)
            .setMaxLength(3)
            .setRequired(true);

    if (character) {
        levelInput.setValue(
            String(character.level),
        );
    }

    const levelLabel =
        new LabelBuilder()
            .setLabel('Nível')
            .setTextInputComponent(
                levelInput,
            );

    const mainSelect =
        new StringSelectMenuBuilder()
            .setCustomId(
                'character-main',
            )
            .setPlaceholder(
                'É a tua personagem principal?',
            )
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true)
            .addOptions(
                {
                    label: 'Sim',
                    description:
                        'Definir como personagem principal',
                    value: 'yes',
                    default:
                        character?.is_main ===
                        true,
                },
                {
                    label: 'Não',
                    description:
                        'Personagem secundária',
                    value: 'no',
                    default:
                        character?.is_main ===
                        false,
                },
            );

    const mainLabel =
        new LabelBuilder()
            .setLabel(
                'Personagem principal',
            )
            .setDescription(
                'Só podes ter uma personagem principal',
            )
            .setStringSelectMenuComponent(
                mainSelect,
            );

    modal.addLabelComponents(
        nameLabel,
        classLabel,
        levelLabel,
        mainLabel,
    );

    return modal;
}

function readCharacterModal(
    interaction:
        ModalSubmitInteraction,
) {
    const characterName =
        interaction.fields
            .getTextInputValue(
                'character-name',
            )
            .trim();

    const characterClass =
        interaction.fields
            .getStringSelectValues(
                'character-class',
            )[0];

    const levelText =
        interaction.fields
            .getTextInputValue(
                'character-level',
            )
            .trim();

    const requestedMain =
        interaction.fields
            .getStringSelectValues(
                'character-main',
            )[0] === 'yes';

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
        !VALID_CLASSES.includes(
            characterClass,
        )
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
    const select =
        new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder(
                'Seleciona uma personagem',
            )
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                characters.map(
                    character => ({
                        label:
                            `${
                                character.is_main
                                    ? '⭐ '
                                    : ''
                            }${
                                character
                                    .character_name
                            }`,

                        description:
                            `${character.character_class} • ` +
                            `Lv. ${character.level}`,

                        value:
                            String(
                                character.id,
                            ),
                    }),
                ),
            );

    return new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(select);
}

// =====================================================
// AZURIA PANEL
// =====================================================

function buildAzuriaEmbed() {
    return new EmbedBuilder()
        .setTitle(
            '⚔️ Estado no Azuria',
        )
        .setDescription(
            [
                'Seleciona o teu estado atual no servidor.',
                '',
                '🐉 **PvM** — Estás a jogar no Azuria, mas ainda estás em progressão PvM.',
                '',
                '⚔️ **PvP** — Já estás preparado para PvP.',
                '',
                '**Só podes ter um dos dois estados.**',
                '',
                'A role **Azuria** é atribuída automaticamente.',
                '',
                'Se deixares de jogar no servidor, usa **Sair do Azuria**.',
            ].join('\n'),
        )
        .setFooter({
            text:
                AZURIA_PANEL_MARKER,
        });
}

function buildAzuriaButtons() {
    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    'azuria-pvm',
                )
                .setLabel('PvM')
                .setEmoji('🐉')
                .setStyle(
                    ButtonStyle.Secondary,
                ),

            new ButtonBuilder()
                .setCustomId(
                    'azuria-pvp',
                )
                .setLabel('PvP')
                .setEmoji('⚔️')
                .setStyle(
                    ButtonStyle.Primary,
                ),

            new ButtonBuilder()
                .setCustomId(
                    'azuria-leave',
                )
                .setLabel(
                    'Sair do Azuria',
                )
                .setEmoji('❌')
                .setStyle(
                    ButtonStyle.Danger,
                ),
        );
}

// =====================================================
// COMMANDS HELP
// =====================================================

function buildCommandsHelpEmbed() {
    return new EmbedBuilder()
        .setTitle(
            '📖 Como usar o Wicked Bot',
        )
        .setDescription(
            [
                'Usa os comandos abaixo para gerir as tuas personagens e consultar o roster da guild.',
                '',
                '### 👤 Perfil',
                '',
                '`/perfil adicionar`',
                'Adiciona uma nova personagem ao teu perfil.',
                '',
                '`/perfil listar`',
                'Mostra todas as personagens que tens registadas.',
                '',
                '`/perfil editar`',
                'Permite alterar o nome, classe, nível ou personagem principal.',
                '',
                '`/perfil remover`',
                'Remove uma personagem do teu perfil.',
                '',
                '⭐ A tua primeira personagem fica automaticamente definida como principal.',
                'Só podes ter uma personagem principal de cada vez.',
                '',
                '### ⚔️ Roster',
                '',
                '`/roster`',
                'Mostra o roster atual da guild, incluindo as personagens registadas e o estado de cada jogador no Azuria.',
                '',
                '### 🐉 Estado no Azuria',
                '',
                'Usa os botões da mensagem abaixo para escolher entre **PvM** e **PvP**.',
                '',
                'A role **Azuria** é atribuída automaticamente.',
            ].join('\n'),
        )
        .setFooter({
            text:
                COMMANDS_HELP_MARKER,
        });
}

// =====================================================
// ENSURE MESSAGES
// =====================================================

async function ensureCommandsHelpMessage() {
    const channel =
        await client.channels.fetch(
            AZURIA_CHANNEL_ID,
        );

    if (
        !channel ||
        channel.type !==
            ChannelType.GuildText
    ) {
        throw new Error(
            `O canal ${AZURIA_CHANNEL_ID} não existe ou não é um canal de texto.`,
        );
    }

    const textChannel =
        channel as TextChannel;

    const messages =
        await textChannel.messages.fetch({
            limit: 100,
        });

    let helpMessage =
        messages.find(
            message =>
                message.author.id ===
                    client.user?.id &&
                message.embeds.some(
                    embed =>
                        embed.footer
                            ?.text ===
                        COMMANDS_HELP_MARKER,
                ),
        );

    if (!helpMessage) {
        helpMessage =
            await textChannel.send({
                embeds: [
                    buildCommandsHelpEmbed(),
                ],
            });

        console.log(
            '✅ Mensagem de ajuda criada.',
        );
    } else {
        await helpMessage.edit({
            embeds: [
                buildCommandsHelpEmbed(),
            ],
        });

        console.log(
            '✅ Mensagem de ajuda atualizada.',
        );
    }
}

async function ensureAzuriaPanel() {
    const channel =
        await client.channels.fetch(
            AZURIA_CHANNEL_ID,
        );

    if (
        !channel ||
        channel.type !==
            ChannelType.GuildText
    ) {
        throw new Error(
            `O canal ${AZURIA_CHANNEL_ID} não existe ou não é um canal de texto.`,
        );
    }

    const textChannel =
        channel as TextChannel;

    const messages =
        await textChannel.messages.fetch({
            limit: 100,
        });

    let panelMessage =
        messages.find(
            message =>
                message.author.id ===
                    client.user?.id &&
                message.embeds.some(
                    embed =>
                        embed.footer
                            ?.text ===
                        AZURIA_PANEL_MARKER,
                ),
        );

    if (!panelMessage) {
        panelMessage =
            await textChannel.send({
                embeds: [
                    buildAzuriaEmbed(),
                ],
                components: [
                    buildAzuriaButtons(),
                ],
            });

        console.log(
            '✅ Painel Azuria criado.',
        );
    } else {
        await panelMessage.edit({
            embeds: [
                buildAzuriaEmbed(),
            ],
            components: [
                buildAzuriaButtons(),
            ],
        });

        console.log(
            '✅ Painel Azuria atualizado.',
        );
    }
}

// =====================================================
// PERMISSION DEBUG
// =====================================================

async function logBotPermissionDiagnostics() {
    console.log('');
    console.log(
        '============================================================',
    );
    console.log(
        '🔎 WICKED BOT — PERMISSION DIAGNOSTICS',
    );
    console.log(
        '============================================================',
    );

    try {
        const channel =
            await client.channels.fetch(
                AZURIA_CHANNEL_ID,
            );

        if (
            !channel ||
            channel.type !==
                ChannelType.GuildText
        ) {
            console.log(
                `❌ Canal ${AZURIA_CHANNEL_ID} inválido.`,
            );

            return;
        }

        const textChannel =
            channel as TextChannel;

        const guild =
            textChannel.guild;

        await guild.roles.fetch();

        const botMember =
            await guild.members.fetchMe();

        console.log('');
        console.log('🤖 BOT');
        console.log(
            '------------------------------------------------------------',
        );

        console.log(
            `User: ${botMember.user.tag}`,
        );

        console.log(
            `User ID: ${botMember.id}`,
        );

        console.log(
            `Guild: ${guild.name}`,
        );

        console.log('');
        console.log(
            '🧪 CHECKS IMPORTANTES',
        );
        console.log(
            '------------------------------------------------------------',
        );

        const checks = [
            {
                name: 'Administrator',
                permission:
                    PermissionFlagsBits
                        .Administrator,
            },
            {
                name: 'ManageRoles',
                permission:
                    PermissionFlagsBits
                        .ManageRoles,
            },
            {
                name: 'ManageMessages',
                permission:
                    PermissionFlagsBits
                        .ManageMessages,
            },
            {
                name: 'ViewChannel',
                permission:
                    PermissionFlagsBits
                        .ViewChannel,
            },
            {
                name: 'SendMessages',
                permission:
                    PermissionFlagsBits
                        .SendMessages,
            },
            {
                name: 'EmbedLinks',
                permission:
                    PermissionFlagsBits
                        .EmbedLinks,
            },
        ];

        for (const check of checks) {
            console.log(
                `${
                    botMember.permissions.has(
                        check.permission,
                    )
                        ? '✅'
                        : '❌'
                } ${check.name}`,
            );
        }

        console.log('');
        console.log(
            '📊 HIERARQUIA DE ROLES',
        );
        console.log(
            '------------------------------------------------------------',
        );

        console.log(
            `Role mais alta do bot: ${botMember.roles.highest.name}`,
        );

        console.log(
            `Position: ${botMember.roles.highest.position}`,
        );

        const targetRoles = [
            {
                label: 'Azuria',
                id: AZURIA_ROLE_ID,
            },
            {
                label: 'Azuria PvP',
                id: AZURIA_PVP_ROLE_ID,
            },
            {
                label: 'Azuria PvM',
                id: AZURIA_PVM_ROLE_ID,
            },
        ];

        for (
            const target
            of targetRoles
        ) {
            const role =
                guild.roles.cache.get(
                    target.id,
                );

            if (!role) {
                console.log(
                    `❌ ${target.label}: não encontrada`,
                );

                continue;
            }

            console.log('');
            console.log(
                `${target.label}`,
            );

            console.log(
                `Position: ${role.position}`,
            );

            console.log(
                `Editable: ${
                    role.editable
                        ? '✅ SIM'
                        : '❌ NÃO'
                }`,
            );
        }

        console.log('');
        console.log(
            '============================================================',
        );
        console.log(
            '🔎 FIM DO DIAGNÓSTICO',
        );
        console.log(
            '============================================================',
        );
        console.log('');
    } catch (error) {
        console.error(
            '❌ Erro no diagnóstico:',
            error,
        );
    }
}

// =====================================================
// ROSTER
// =====================================================

async function getRosterMembers():
    Promise<RosterMember[]> {
    const result =
        await db.query(`
            SELECT
                m.discord_id,
                m.discord_username,
                c.id,
                c.character_name,
                c.character_class,
                c.level,
                c.is_main
            FROM members m
            INNER JOIN characters c
                ON c.discord_id =
                    m.discord_id
            ORDER BY
                LOWER(
                    m.discord_username
                ) ASC,
                c.is_main DESC,
                LOWER(
                    c.character_name
                ) ASC
        `);

    const members =
        new Map<
            string,
            RosterMember
        >();

    for (
        const row
        of result.rows
    ) {
        let member =
            members.get(
                row.discord_id,
            );

        if (!member) {
            member = {
                discord_id:
                    row.discord_id,

                discord_username:
                    row.discord_username,

                azuria_status: null,

                characters: [],
            };

            members.set(
                row.discord_id,
                member,
            );
        }

        member.characters.push({
            id: row.id,

            character_name:
                row.character_name,

            character_class:
                row.character_class,

            level: row.level,

            is_main:
                row.is_main,
        });
    }

    const guildId =
        process.env.DISCORD_GUILD_ID;

    if (!guildId) {
        throw new Error(
            'DISCORD_GUILD_ID não está definido.',
        );
    }

    const guild =
        await client.guilds.fetch(
            guildId,
        );

    for (
        const member
        of members.values()
    ) {
        try {
            const discordMember =
                await guild.members.fetch(
                    member.discord_id,
                );

            if (
                discordMember.roles.cache.has(
                    AZURIA_PVP_ROLE_ID,
                )
            ) {
                member.azuria_status =
                    'pvp';
            } else if (
                discordMember.roles.cache.has(
                    AZURIA_PVM_ROLE_ID,
                )
            ) {
                member.azuria_status =
                    'pvm';
            }
        } catch {
            member.azuria_status =
                null;
        }
    }

    return Array.from(
        members.values(),
    );
}

function buildRosterPage(
    members: RosterMember[],
    requestedPage: number,
) {
    const totalPages =
        Math.max(
            1,
            Math.ceil(
                members.length /
                    ROSTER_MEMBERS_PER_PAGE,
            ),
        );

    const page =
        Math.max(
            0,
            Math.min(
                requestedPage,
                totalPages - 1,
            ),
        );

    const start =
        page *
        ROSTER_MEMBERS_PER_PAGE;

    const pageMembers =
        members.slice(
            start,
            start +
                ROSTER_MEMBERS_PER_PAGE,
        );

    const totalCharacters =
        members.reduce(
            (
                total,
                member,
            ) =>
                total +
                member
                    .characters
                    .length,

            0,
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                '⚔️ Wicked — Roster',
            )
            .setDescription(
                `**${members.length} membros** • ` +
                `**${totalCharacters} personagens**`,
            )
            .setFooter({
                text:
                    `Página ${
                        page + 1
                    }/${totalPages}`,
            })
            .setTimestamp();

    for (
        const member
        of pageMembers
    ) {
        let statusText =
            '⚪ Sem estado Azuria';

        if (
            member.azuria_status ===
            'pvm'
        ) {
            statusText =
                '🐉 PvM';
        }

        if (
            member.azuria_status ===
            'pvp'
        ) {
            statusText =
                '⚔️ PvP';
        }

        const characterLines =
            member.characters.map(
                character => {
                    const icon =
                        character.is_main
                            ? '⭐'
                            : '•';

                    return (
                        `${icon} **${character.character_name}**` +
                        ` — ${character.character_class}` +
                        ` • Lv. ${character.level}`
                    );
                },
            );

        let value =
            characterLines.join(
                '\n',
            );

        if (
            value.length > 1000
        ) {
            value =
                value.substring(
                    0,
                    997,
                ) + '...';
        }

        embed.addFields({
            name:
                `👤 ${member.discord_username} — ${statusText}`,
            value,
            inline: false,
        });
    }

    return {
        embed,
        page,
        totalPages,
    };
}

function buildRosterButtons(
    userId: string,
    page: number,
    totalPages: number,
) {
    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `roster-page:${userId}:${
                        page - 1
                    }`,
                )
                .setLabel('Anterior')
                .setStyle(
                    ButtonStyle.Secondary,
                )
                .setDisabled(
                    page === 0,
                ),

            new ButtonBuilder()
                .setCustomId(
                    `roster-page:${userId}:${
                        page + 1
                    }`,
                )
                .setLabel('Seguinte')
                .setStyle(
                    ButtonStyle.Secondary,
                )
                .setDisabled(
                    page >=
                        totalPages - 1,
                ),
        );
}

// =====================================================
// READY
// =====================================================

client.once(
    Events.ClientReady,
    async readyClient => {
        console.log(
            `✅ Bot online como ${readyClient.user.tag}`,
        );

        try {
            const result =
                await db.query(
                    'SELECT NOW() AS current_time',
                );

            console.log(
                '✅ PostgreSQL ligado:',
                result.rows[0]
                    .current_time,
            );
        } catch (error) {
            console.error(
                '❌ PostgreSQL:',
                error,
            );
        }

        await logBotPermissionDiagnostics();

        try {
            // Esta ordem garante:
            // ajuda em cima
            // painel Azuria por baixo
            await ensureCommandsHelpMessage();
            await ensureAzuriaPanel();
        } catch (error) {
            console.error(
                '❌ Erro ao configurar mensagens:',
                error,
            );
        }
    },
);

// =====================================================
// INTERACTIONS
// =====================================================

client.on(
    Events.InteractionCreate,
    async interaction => {

        // =============================================
        // AZURIA BUTTONS
        // =============================================

        if (
            interaction.isButton() &&
            (
                interaction.customId ===
                    'azuria-pvm' ||
                interaction.customId ===
                    'azuria-pvp' ||
                interaction.customId ===
                    'azuria-leave'
            )
        ) {
            if (!interaction.guild) {
                return;
            }

            await interaction.deferReply({
                flags:
                    MessageFlags.Ephemeral,
            });

            try {
                const member =
                    await interaction.guild
                        .members.fetch(
                            interaction
                                .user.id,
                        );

                // =====================================
                // PvM
                // =====================================

                if (
                    interaction.customId ===
                    'azuria-pvm'
                ) {
                    await member.roles.remove(
                        AZURIA_PVP_ROLE_ID,
                    );

                    await member.roles.add([
                        AZURIA_ROLE_ID,
                        AZURIA_PVM_ROLE_ID,
                    ]);

                    await interaction.editReply({
                        content: [
                            '✅ **Estado atualizado para PvM.**',
                            '',
                            'Roles atribuídas:',
                            '- `Azuria`',
                            '- `Azuria PvM`',
                        ].join('\n'),
                    });

                    console.log(
                        `🐉 ${interaction.user.username} → Azuria PvM`,
                    );

                    return;
                }

                // =====================================
                // PvP
                // =====================================

                if (
                    interaction.customId ===
                    'azuria-pvp'
                ) {
                    await member.roles.remove(
                        AZURIA_PVM_ROLE_ID,
                    );

                    await member.roles.add([
                        AZURIA_ROLE_ID,
                        AZURIA_PVP_ROLE_ID,
                    ]);

                    await interaction.editReply({
                        content: [
                            '✅ **Estado atualizado para PvP.**',
                            '',
                            'Roles atribuídas:',
                            '- `Azuria`',
                            '- `Azuria PvP`',
                        ].join('\n'),
                    });

                    console.log(
                        `⚔️ ${interaction.user.username} → Azuria PvP`,
                    );

                    return;
                }

                // =====================================
                // SAIR DO AZURIA
                // =====================================

                if (
                    interaction.customId ===
                    'azuria-leave'
                ) {
                    await member.roles.remove([
                        AZURIA_ROLE_ID,
                        AZURIA_PVM_ROLE_ID,
                        AZURIA_PVP_ROLE_ID,
                    ]);

                    await interaction.editReply({
                        content: [
                            '✅ **Estado Azuria removido.**',
                            '',
                            'Foram removidas:',
                            '- `Azuria`',
                            '- `Azuria PvM`',
                            '- `Azuria PvP`',
                        ].join('\n'),
                    });

                    console.log(
                        `❌ ${interaction.user.username} saiu do Azuria`,
                    );

                    return;
                }
            } catch (error) {
                console.error(
                    '❌ Erro ao alterar roles Azuria:',
                    error,
                );

                await interaction.editReply({
                    content:
                        '❌ Não foi possível atualizar as tuas roles.',
                });
            }

            return;
        }

        // =============================================
        // SLASH COMMANDS
        // =============================================

        if (
            interaction.isChatInputCommand()
        ) {

            // =========================================
            // /ping
            // =========================================

            if (
                interaction.commandName ===
                'ping'
            ) {
                await interaction.reply(
                    '🏓 Pong!',
                );

                return;
            }

            // =========================================
            // /roster
            // =========================================

            if (
                interaction.commandName ===
                'roster'
            ) {
                await interaction.deferReply();

                try {
                    const members =
                        await getRosterMembers();

                    if (
                        members.length === 0
                    ) {
                        await interaction.editReply(
                            'Ainda não existem personagens registadas no roster.',
                        );

                        return;
                    }

                    const {
                        embed,
                        page,
                        totalPages,
                    } =
                        buildRosterPage(
                            members,
                            0,
                        );

                    await interaction.editReply({
                        embeds: [embed],

                        components:
                            totalPages > 1
                                ? [
                                    buildRosterButtons(
                                        interaction
                                            .user
                                            .id,

                                        page,

                                        totalPages,
                                    ),
                                ]
                                : [],
                    });
                } catch (error) {
                    console.error(
                        '❌ Erro roster:',
                        error,
                    );

                    await interaction.editReply(
                        '❌ Ocorreu um erro ao gerar o roster.',
                    );
                }

                return;
            }

            // =========================================
            // /perfil
            // =========================================

            if (
                interaction.commandName !==
                'perfil'
            ) {
                return;
            }

            const subcommand =
                interaction.options
                    .getSubcommand();

            // =========================================
            // ADICIONAR
            // =========================================

            if (
                subcommand ===
                'adicionar'
            ) {
                await interaction.showModal(
                    buildCharacterModal(
                        'perfil-add-modal',
                        'Adicionar personagem',
                    ),
                );

                return;
            }

            // =========================================
            // LISTAR
            // =========================================

            if (
                subcommand ===
                'listar'
            ) {
                await interaction.deferReply({
                    flags:
                        MessageFlags.Ephemeral,
                });

                try {
                    const result =
                        await db.query(
                            `
                            SELECT
                                id,
                                character_name,
                                character_class,
                                level,
                                is_main

                            FROM characters

                            WHERE
                                discord_id = $1

                            ORDER BY
                                is_main DESC,
                                LOWER(
                                    character_name
                                ) ASC
                            `,
                            [
                                interaction
                                    .user.id,
                            ],
                        );

                    if (
                        result.rows
                            .length === 0
                    ) {
                        await interaction.editReply(
                            'Ainda não tens nenhuma personagem registada.\n\n' +
                            'Usa `/perfil adicionar`.',
                        );

                        return;
                    }

                    const characters =
                        result.rows.map(
                            character =>
                                (
                                    `${
                                        character
                                            .is_main
                                            ? '⭐ '
                                            : ''
                                    }` +
                                    `**${character.character_name}**\n` +
                                    `${character.character_class} • ` +
                                    `Lv. ${character.level}`
                                ),
                        );

                    await interaction.editReply(
                        [
                            `## Personagens de ${
                                interaction
                                    .user
                                    .globalName ??
                                interaction
                                    .user
                                    .username
                            }`,
                            '',
                            ...characters,
                        ].join('\n\n'),
                    );
                } catch (error) {
                    console.error(
                        '❌ Erro ao listar:',
                        error,
                    );

                    await interaction.editReply(
                        '❌ Ocorreu um erro ao consultar as tuas personagens.',
                    );
                }

                return;
            }

            // =========================================
            // EDITAR
            // =========================================

            if (
                subcommand ===
                'editar'
            ) {
                try {
                    const result =
                        await db.query(
                            `
                            SELECT
                                id,
                                character_name,
                                character_class,
                                level,
                                is_main

                            FROM characters

                            WHERE
                                discord_id = $1

                            ORDER BY
                                is_main DESC,
                                LOWER(
                                    character_name
                                ) ASC
                            `,
                            [
                                interaction
                                    .user.id,
                            ],
                        );

                    if (
                        result.rows
                            .length === 0
                    ) {
                        await interaction.reply({
                            content:
                                'Ainda não tens nenhuma personagem registada.',

                            flags:
                                MessageFlags.Ephemeral,
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

                        flags:
                            MessageFlags.Ephemeral,
                    });
                } catch (error) {
                    console.error(
                        '❌ Erro ao preparar edição:',
                        error,
                    );

                    await interaction.reply({
                        content:
                            '❌ Ocorreu um erro ao consultar as tuas personagens.',

                        flags:
                            MessageFlags.Ephemeral,
                    });
                }

                return;
            }

            // =========================================
            // REMOVER
            // =========================================

            if (
                subcommand ===
                'remover'
            ) {
                try {
                    const result =
                        await db.query(
                            `
                            SELECT
                                id,
                                character_name,
                                character_class,
                                level,
                                is_main

                            FROM characters

                            WHERE
                                discord_id = $1

                            ORDER BY
                                is_main DESC,
                                LOWER(
                                    character_name
                                ) ASC
                            `,
                            [
                                interaction
                                    .user.id,
                            ],
                        );

                    if (
                        result.rows
                            .length === 0
                    ) {
                        await interaction.reply({
                            content:
                                'Ainda não tens nenhuma personagem registada.',

                            flags:
                                MessageFlags.Ephemeral,
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

                        flags:
                            MessageFlags.Ephemeral,
                    });
                } catch (error) {
                    console.error(
                        '❌ Erro ao preparar remoção:',
                        error,
                    );

                    await interaction.reply({
                        content:
                            '❌ Ocorreu um erro ao consultar as tuas personagens.',

                        flags:
                            MessageFlags.Ephemeral,
                    });
                }

                return;
            }
        }

        // =============================================
        // ROSTER PAGINATION
        // =============================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                'roster-page:',
            )
        ) {
            const [
                ,
                ownerId,
                pageText,
            ] =
                interaction.customId
                    .split(':');

            if (
                interaction.user.id !==
                ownerId
            ) {
                await interaction.reply({
                    content:
                        '❌ Só quem executou `/roster` pode mudar esta página.',

                    flags:
                        MessageFlags.Ephemeral,
                });

                return;
            }

            await interaction.deferUpdate();

            try {
                const members =
                    await getRosterMembers();

                const {
                    embed,
                    page,
                    totalPages,
                } =
                    buildRosterPage(
                        members,
                        Number(pageText),
                    );

                await interaction.editReply({
                    embeds: [embed],

                    components:
                        totalPages > 1
                            ? [
                                buildRosterButtons(
                                    ownerId,
                                    page,
                                    totalPages,
                                ),
                            ]
                            : [],
                });
            } catch (error) {
                console.error(
                    '❌ Erro paginação roster:',
                    error,
                );
            }

            return;
        }

        // =============================================
        // SELECT EDITAR
        // =============================================

        if (
            interaction.isStringSelectMenu() &&
            interaction.customId ===
                'perfil-edit-select'
        ) {
            const characterId =
                interaction.values[0];

            const result =
                await db.query(
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

            if (
                result.rows.length ===
                0
            ) {
                await interaction.reply({
                    content:
                        '❌ Essa personagem já não existe.',

                    flags:
                        MessageFlags.Ephemeral,
                });

                return;
            }

            await interaction.showModal(
                buildCharacterModal(
                    `perfil-edit-modal:${characterId}`,
                    'Editar personagem',
                    result.rows[0],
                ),
            );

            return;
        }

        // =============================================
        // SELECT REMOVER
        // =============================================

        if (
            interaction.isStringSelectMenu() &&
            interaction.customId ===
                'perfil-remove-select'
        ) {
            const characterId =
                interaction.values[0];

            const result =
                await db.query(
                    `
                    SELECT
                        id,
                        character_name

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

            if (
                result.rows.length ===
                0
            ) {
                await interaction.update({
                    content:
                        '❌ Essa personagem já não existe.',

                    components: [],
                });

                return;
            }

            const character =
                result.rows[0];

            const buttons =
                new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                `perfil-remove-confirm:${character.id}`,
                            )
                            .setLabel(
                                'Remover',
                            )
                            .setStyle(
                                ButtonStyle.Danger,
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                'perfil-remove-cancel',
                            )
                            .setLabel(
                                'Cancelar',
                            )
                            .setStyle(
                                ButtonStyle.Secondary,
                            ),
                    );

            await interaction.update({
                content:
                    `⚠️ Tens a certeza de que queres remover **${character.character_name}**?`,

                components: [
                    buttons,
                ],
            });

            return;
        }

        // =============================================
        // CANCELAR REMOÇÃO
        // =============================================

        if (
            interaction.isButton() &&
            interaction.customId ===
                'perfil-remove-cancel'
        ) {
            await interaction.update({
                content:
                    '✅ Remoção cancelada.',

                components: [],
            });

            return;
        }

        // =============================================
        // CONFIRMAR REMOÇÃO
        // =============================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                'perfil-remove-confirm:',
            )
        ) {
            await interaction.deferUpdate();

            const characterId =
                interaction.customId
                    .split(':')[1];

            const dbClient =
                await db.connect();

            try {
                await dbClient.query(
                    'BEGIN',
                );

                const result =
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

                if (
                    result.rows.length ===
                    0
                ) {
                    await dbClient.query(
                        'ROLLBACK',
                    );

                    await interaction.editReply({
                        content:
                            '❌ Essa personagem já não existe.',

                        components: [],
                    });

                    return;
                }

                const character =
                    result.rows[0];

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

                let newMainName:
                    string | null =
                    null;

                if (
                    character.is_main
                ) {
                    const replacement =
                        await dbClient.query(
                            `
                            SELECT
                                id,
                                character_name

                            FROM characters

                            WHERE
                                discord_id = $1

                            ORDER BY
                                created_at ASC,
                                id ASC

                            LIMIT 1
                            `,
                            [
                                interaction.user.id,
                            ],
                        );

                    if (
                        replacement.rows
                            .length > 0
                    ) {
                        await dbClient.query(
                            `
                            UPDATE characters

                            SET
                                is_main = TRUE,
                                updated_at = NOW()

                            WHERE
                                id = $1
                            `,
                            [
                                replacement
                                    .rows[0].id,
                            ],
                        );

                        newMainName =
                            replacement
                                .rows[0]
                                .character_name;
                    }
                }

                await dbClient.query(
                    'COMMIT',
                );

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
                await dbClient.query(
                    'ROLLBACK',
                );

                console.error(
                    '❌ Erro remover personagem:',
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

        // =============================================
        // MODAL ADICIONAR
        // =============================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId ===
                'perfil-add-modal'
        ) {
            await interaction.deferReply({
                flags:
                    MessageFlags.Ephemeral,
            });

            const {
                characterName,
                characterClass,
                level,
                requestedMain,
            } =
                readCharacterModal(
                    interaction,
                );

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

            const dbClient =
                await db.connect();

            try {
                await dbClient.query(
                    'BEGIN',
                );

                await dbClient.query(
                    `
                    INSERT INTO members (
                        discord_id,
                        discord_username
                    )
                    VALUES ($1, $2)

                    ON CONFLICT (
                        discord_id
                    )
                    DO UPDATE SET
                        discord_username =
                            EXCLUDED.discord_username,
                        updated_at =
                            NOW()
                    `,
                    [
                        interaction.user.id,
                        interaction.user
                            .username,
                    ],
                );

                const countResult =
                    await dbClient.query(
                        `
                        SELECT
                            COUNT(*)::INTEGER AS count

                        FROM characters

                        WHERE
                            discord_id = $1
                        `,
                        [
                            interaction.user.id,
                        ],
                    );

                const makeMain =
                    countResult.rows[0]
                        .count === 0 ||
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
                        [
                            interaction.user.id,
                        ],
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
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5
                    )
                    `,
                    [
                        interaction.user.id,
                        characterName,
                        characterClass,
                        level,
                        makeMain,
                    ],
                );

                await dbClient.query(
                    'COMMIT',
                );

                await interaction.editReply(
                    [
                        '✅ **Personagem adicionada!**',
                        '',
                        `**Nome:** ${characterName}`,
                        `**Classe:** ${characterClass}`,
                        `**Nível:** ${level}`,
                        `**Principal:** ${
                            makeMain
                                ? 'Sim ⭐'
                                : 'Não'
                        }`,
                    ].join('\n'),
                );
            } catch (error: any) {
                await dbClient.query(
                    'ROLLBACK',
                );

                if (
                    error.code ===
                    '23505'
                ) {
                    await interaction.editReply(
                        `❌ Já existe uma personagem chamada **${characterName}** registada.`,
                    );

                    return;
                }

                console.error(
                    error,
                );

                await interaction.editReply(
                    '❌ Ocorreu um erro ao guardar a personagem.',
                );
            } finally {
                dbClient.release();
            }

            return;
        }

        // =============================================
        // MODAL EDITAR
        // =============================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith(
                'perfil-edit-modal:',
            )
        ) {
            await interaction.deferReply({
                flags:
                    MessageFlags.Ephemeral,
            });

            const characterId =
                interaction.customId
                    .split(':')[1];

            const {
                characterName,
                characterClass,
                level,
                requestedMain,
            } =
                readCharacterModal(
                    interaction,
                );

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

            const dbClient =
                await db.connect();

            try {
                await dbClient.query(
                    'BEGIN',
                );

                const currentResult =
                    await dbClient.query(
                        `
                        SELECT
                            id,
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

                if (
                    currentResult.rows
                        .length === 0
                ) {
                    await dbClient.query(
                        'ROLLBACK',
                    );

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
                        SELECT
                            COUNT(*)::INTEGER AS count

                        FROM characters

                        WHERE
                            discord_id = $1
                        `,
                        [
                            interaction.user.id,
                        ],
                    );

                const characterCount =
                    countResult.rows[0]
                        .count;

                let finalMain =
                    requestedMain;

                if (
                    characterCount === 1
                ) {
                    finalMain = true;
                }

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
                } else if (
                    current.is_main
                ) {
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

                    if (
                        replacement.rows
                            .length > 0
                    ) {
                        await dbClient.query(
                            `
                            UPDATE characters

                            SET
                                is_main = TRUE,
                                updated_at = NOW()

                            WHERE
                                id = $1
                            `,
                            [
                                replacement
                                    .rows[0].id,
                            ],
                        );
                    }
                } else {
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

                await dbClient.query(
                    'COMMIT',
                );

                await interaction.editReply(
                    [
                        '✅ **Personagem atualizada!**',
                        '',
                        `**Nome:** ${characterName}`,
                        `**Classe:** ${characterClass}`,
                        `**Nível:** ${level}`,
                        `**Principal:** ${
                            finalMain
                                ? 'Sim ⭐'
                                : 'Não'
                        }`,
                    ].join('\n'),
                );
            } catch (error: any) {
                await dbClient.query(
                    'ROLLBACK',
                );

                if (
                    error.code ===
                    '23505'
                ) {
                    await interaction.editReply(
                        `❌ Já existe uma personagem chamada **${characterName}** registada.`,
                    );

                    return;
                }

                console.error(
                    error,
                );

                await interaction.editReply(
                    '❌ Ocorreu um erro ao editar a personagem.',
                );
            } finally {
                dbClient.release();
            }

            return;
        }
    },
);

// =====================================================
// LOGIN
// =====================================================

client.login(token);
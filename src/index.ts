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
    GuildMember,
    LabelBuilder,
    Message,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    Partials,
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

const AZURIA_PVM_EMOJI = '🐉';
const AZURIA_PVP_EMOJI = '⚔️';

const AZURIA_PANEL_MARKER =
    'Wicked Bot • Azuria Status';

let azuriaPanelMessageId: string | null =
    null;

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],

    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
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
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title);

    // -------------------------------------------------
    // Nome
    // -------------------------------------------------

    const nameInput =
        new TextInputBuilder()
            .setCustomId('character-name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: PedroWar')
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
            .setLabel('Nome da personagem')
            .setDescription(
                'Nome exato da personagem no Azuria',
            )
            .setTextInputComponent(nameInput);

    // -------------------------------------------------
    // Classe
    // -------------------------------------------------

    const classSelect =
        new StringSelectMenuBuilder()
            .setCustomId('character-class')
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

    // -------------------------------------------------
    // Nível
    // -------------------------------------------------

    const levelInput =
        new TextInputBuilder()
            .setCustomId('character-level')
            .setStyle(TextInputStyle.Short)
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

    // -------------------------------------------------
    // Main
    // -------------------------------------------------

    const mainSelect =
        new StringSelectMenuBuilder()
            .setCustomId('character-main')
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
    interaction: ModalSubmitInteraction,
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
                            }` +
                            character.character_name,

                        description:
                            `${character.character_class} • ` +
                            `Lv. ${character.level}`,

                        value: String(
                            character.id,
                        ),
                    }),
                ),
            );

    return new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(select);
}

// =====================================================
// AZURIA HELPERS
// =====================================================

function buildAzuriaEmbed() {
    return new EmbedBuilder()
        .setTitle('⚔️ Estado no Azuria')
        .setDescription(
            [
                'Seleciona o teu estado atual no servidor através das reações abaixo.',
                '',
                `${AZURIA_PVM_EMOJI} **PvM** — Estás a jogar no Azuria, mas ainda estás em progressão PvM.`,
                '',
                `${AZURIA_PVP_EMOJI} **PvP** — Já estás preparado para PvP.`,
                '',
                '**Só podes ter um dos dois estados.**',
                '',
                'A role **Azuria** é atribuída automaticamente a todos os jogadores que selecionem PvM ou PvP.',
                '',
                'Para deixares de estar marcado como jogador de Azuria, remove a tua reação.',
            ].join('\n'),
        )
        .setFooter({
            text: AZURIA_PANEL_MARKER,
        });
}

async function syncAzuriaRole(
    member: GuildMember,
) {
    const hasPvm =
        member.roles.cache.has(
            AZURIA_PVM_ROLE_ID,
        );

    const hasPvp =
        member.roles.cache.has(
            AZURIA_PVP_ROLE_ID,
        );

    const hasAzuria =
        member.roles.cache.has(
            AZURIA_ROLE_ID,
        );

    const shouldHaveAzuria =
        hasPvm || hasPvp;

    if (
        shouldHaveAzuria &&
        !hasAzuria
    ) {
        await member.roles.add(
            AZURIA_ROLE_ID,
        );
    }

    if (
        !shouldHaveAzuria &&
        hasAzuria
    ) {
        await member.roles.remove(
            AZURIA_ROLE_ID,
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
                `❌ O canal ${AZURIA_CHANNEL_ID} não foi encontrado ou não é um canal de texto.`,
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

        // =============================================
        // BOT
        // =============================================

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
        console.log(
            `Guild ID: ${guild.id}`,
        );

        // =============================================
        // ROLES
        // =============================================

        console.log('');
        console.log('🏷️ ROLES DO BOT');
        console.log(
            '------------------------------------------------------------',
        );

        const botRoles =
            [
                ...botMember.roles.cache.values(),
            ].sort(
                (a, b) =>
                    b.position -
                    a.position,
            );

        for (const role of botRoles) {
            console.log('');
            console.log(
                `Role: ${role.name}`,
            );
            console.log(
                `ID: ${role.id}`,
            );
            console.log(
                `Position: ${role.position}`,
            );
            console.log(
                `Managed: ${role.managed}`,
            );

            const permissions =
                role.permissions.toArray();

            console.log(
                `Permissions (${permissions.length}):`,
            );

            if (
                permissions.length === 0
            ) {
                console.log(
                    '  - nenhuma',
                );
            } else {
                for (
                    const permission
                    of permissions
                ) {
                    console.log(
                        `  - ${permission}`,
                    );
                }
            }
        }

        // =============================================
        // EFFECTIVE GUILD PERMISSIONS
        // =============================================

        console.log('');
        console.log(
            '🌐 PERMISSÕES EFETIVAS NO SERVIDOR',
        );
        console.log(
            '------------------------------------------------------------',
        );

        const guildPermissions =
            botMember.permissions
                .toArray()
                .sort();

        for (
            const permission
            of guildPermissions
        ) {
            console.log(
                `✅ ${permission}`,
            );
        }

        // =============================================
        // IMPORTANT GUILD CHECKS
        // =============================================

        console.log('');
        console.log(
            '🧪 CHECKS IMPORTANTES — SERVIDOR',
        );
        console.log(
            '------------------------------------------------------------',
        );

        const guildChecks = [
            {
                name: 'Administrator',
                permission:
                    PermissionFlagsBits.Administrator,
            },
            {
                name: 'ManageRoles',
                permission:
                    PermissionFlagsBits.ManageRoles,
            },
            {
                name: 'ManageMessages',
                permission:
                    PermissionFlagsBits.ManageMessages,
            },
            {
                name: 'ViewChannel',
                permission:
                    PermissionFlagsBits.ViewChannel,
            },
            {
                name: 'SendMessages',
                permission:
                    PermissionFlagsBits.SendMessages,
            },
            {
                name: 'EmbedLinks',
                permission:
                    PermissionFlagsBits.EmbedLinks,
            },
            {
                name: 'AddReactions',
                permission:
                    PermissionFlagsBits.AddReactions,
            },
            {
                name: 'ReadMessageHistory',
                permission:
                    PermissionFlagsBits.ReadMessageHistory,
            },
        ];

        for (
            const check of guildChecks
        ) {
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

        // =============================================
        // CHANNEL
        // =============================================

        console.log('');
        console.log(
            `💬 CANAL #${textChannel.name}`,
        );
        console.log(
            '------------------------------------------------------------',
        );
        console.log(
            `Channel ID: ${textChannel.id}`,
        );

        const channelPermissions =
            textChannel.permissionsFor(
                botMember,
            );

        if (!channelPermissions) {
            console.log(
                '❌ Não foi possível calcular as permissões efetivas do canal.',
            );
        } else {
            console.log('');
            console.log(
                'Permissões efetivas no canal:',
            );

            const permissionNames =
                channelPermissions
                    .toArray()
                    .sort();

            for (
                const permission
                of permissionNames
            ) {
                console.log(
                    `✅ ${permission}`,
                );
            }

            console.log('');
            console.log(
                '🧪 CHECKS IMPORTANTES — CANAL',
            );
            console.log(
                '------------------------------------------------------------',
            );

            const channelChecks = [
                {
                    name: 'ViewChannel',
                    permission:
                        PermissionFlagsBits.ViewChannel,
                },
                {
                    name: 'SendMessages',
                    permission:
                        PermissionFlagsBits.SendMessages,
                },
                {
                    name: 'EmbedLinks',
                    permission:
                        PermissionFlagsBits.EmbedLinks,
                },
                {
                    name: 'AddReactions',
                    permission:
                        PermissionFlagsBits.AddReactions,
                },
                {
                    name: 'ReadMessageHistory',
                    permission:
                        PermissionFlagsBits.ReadMessageHistory,
                },
                {
                    name: 'ManageMessages',
                    permission:
                        PermissionFlagsBits.ManageMessages,
                },
                {
                    name: 'ManageRoles',
                    permission:
                        PermissionFlagsBits.ManageRoles,
                },
            ];

            for (
                const check
                of channelChecks
            ) {
                console.log(
                    `${
                        channelPermissions.has(
                            check.permission,
                        )
                            ? '✅'
                            : '❌'
                    } ${check.name}`,
                );
            }
        }

        // =============================================
        // CHANNEL OVERWRITES
        // =============================================

        console.log('');
        console.log(
            '📝 OVERWRITES RELEVANTES DO CANAL',
        );
        console.log(
            '------------------------------------------------------------',
        );

        const relevantIds =
            new Set<string>([
                guild.id,
                botMember.id,
                ...botMember.roles.cache.keys(),
            ]);

        const relevantOverwrites =
            [
                ...textChannel
                    .permissionOverwrites
                    .cache.values(),
            ].filter(overwrite =>
                relevantIds.has(
                    overwrite.id,
                ),
            );

        if (
            relevantOverwrites.length ===
            0
        ) {
            console.log(
                'ℹ️ Nenhum overwrite específico relevante.',
            );
        }

        for (
            const overwrite
            of relevantOverwrites
        ) {
            let name =
                overwrite.id;

            if (
                overwrite.id ===
                guild.id
            ) {
                name = '@everyone';
            } else if (
                overwrite.id ===
                botMember.id
            ) {
                name =
                    `${botMember.user.tag} (user)`;
            } else {
                const role =
                    guild.roles.cache.get(
                        overwrite.id,
                    );

                if (role) {
                    name =
                        `${role.name} (role)`;
                }
            }

            console.log('');
            console.log(
                `Overwrite: ${name}`,
            );

            const allowed =
                overwrite.allow
                    .toArray()
                    .sort();

            const denied =
                overwrite.deny
                    .toArray()
                    .sort();

            console.log('ALLOW:');

            if (
                allowed.length === 0
            ) {
                console.log(
                    '  - nenhum',
                );
            } else {
                for (
                    const permission
                    of allowed
                ) {
                    console.log(
                        `  ✅ ${permission}`,
                    );
                }
            }

            console.log('DENY:');

            if (
                denied.length === 0
            ) {
                console.log(
                    '  - nenhum',
                );
            } else {
                for (
                    const permission
                    of denied
                ) {
                    console.log(
                        `  ❌ ${permission}`,
                    );
                }
            }
        }

        // =============================================
        // ROLE HIERARCHY
        // =============================================

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
            `Role ID: ${botMember.roles.highest.id}`,
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

            console.log('');

            if (!role) {
                console.log(
                    `❌ ${target.label}: ROLE NÃO ENCONTRADA`,
                );
                console.log(
                    `ID procurado: ${target.id}`,
                );

                continue;
            }

            console.log(
                `Role: ${target.label}`,
            );
            console.log(
                `ID: ${role.id}`,
            );
            console.log(
                `Position: ${role.position}`,
            );
            console.log(
                `Managed: ${
                    role.managed
                        ? '⚠️ SIM'
                        : '✅ NÃO'
                }`,
            );
            console.log(
                `Editable pelo bot: ${
                    role.editable
                        ? '✅ SIM'
                        : '❌ NÃO'
                }`,
            );

            const botAbove =
                botMember.roles.highest
                    .position >
                role.position;

            console.log(
                `Bot está acima: ${
                    botAbove
                        ? '✅ SIM'
                        : '❌ NÃO'
                }`,
            );

            console.log(
                `Diferença de posição: ${
                    botMember.roles.highest
                        .position -
                    role.position
                }`,
            );
        }

        // =============================================
        // FINAL SUMMARY
        // =============================================

        console.log('');
        console.log('📋 RESUMO');
        console.log(
            '------------------------------------------------------------',
        );

        const canManageRoles =
            botMember.permissions.has(
                PermissionFlagsBits.ManageRoles,
            );

        const canManageMessages =
            channelPermissions?.has(
                PermissionFlagsBits.ManageMessages,
            ) ?? false;

        const canAddReactions =
            channelPermissions?.has(
                PermissionFlagsBits.AddReactions,
            ) ?? false;

        const canReadHistory =
            channelPermissions?.has(
                PermissionFlagsBits.ReadMessageHistory,
            ) ?? false;

        console.log(
            `Manage Roles: ${
                canManageRoles
                    ? '✅'
                    : '❌'
            }`,
        );

        console.log(
            `Manage Messages em #${textChannel.name}: ${
                canManageMessages
                    ? '✅'
                    : '❌'
            }`,
        );

        console.log(
            `Add Reactions em #${textChannel.name}: ${
                canAddReactions
                    ? '✅'
                    : '❌'
            }`,
        );

        console.log(
            `Read Message History em #${textChannel.name}: ${
                canReadHistory
                    ? '✅'
                    : '❌'
            }`,
        );

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
                    `${target.label}: ❌ inexistente`,
                );

                continue;
            }

            console.log(
                `${target.label}: ${
                    role.editable
                        ? '✅ bot consegue gerir'
                        : '❌ bot NÃO consegue gerir'
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
            '❌ Erro ao gerar diagnóstico de permissões:',
            error,
        );
    }
}

// =====================================================
// AZURIA RECONCILIATION
// =====================================================

async function reconcileAzuriaPanel(
    message: Message<true>,
) {
    console.log(
        '⏳ A sincronizar reactions do Azuria...',
    );

    const pvmReaction =
        message.reactions.cache.find(
            reaction =>
                reaction.emoji.name ===
                AZURIA_PVM_EMOJI,
        );

    const pvpReaction =
        message.reactions.cache.find(
            reaction =>
                reaction.emoji.name ===
                AZURIA_PVP_EMOJI,
        );

    const pvmUserIds =
        new Set<string>();

    const pvpUserIds =
        new Set<string>();

    if (pvmReaction) {
        const users =
            await pvmReaction.users.fetch();

        for (const user of users.values()) {
            if (!user.bot) {
                pvmUserIds.add(
                    user.id,
                );
            }
        }
    }

    if (pvpReaction) {
        const users =
            await pvpReaction.users.fetch();

        for (const user of users.values()) {
            if (!user.bot) {
                pvpUserIds.add(
                    user.id,
                );
            }
        }
    }

    const guildMembers =
        await message.guild.members.fetch();

    for (
        const member
        of guildMembers.values()
    ) {
        if (member.user.bot) {
            continue;
        }

        // Discord não permite ao bot gerir
        // membros cuja role máxima esteja
        // acima/igual à role máxima do bot.
        if (!member.manageable) {
            console.log(
                `⚠️ Não posso gerir ${member.user.username}; hierarquia do membro está acima da do bot.`,
            );

            continue;
        }

        const hasPvmReaction =
            pvmUserIds.has(
                member.id,
            );

        const hasPvpReaction =
            pvpUserIds.has(
                member.id,
            );

        try {
            // -----------------------------------------
            // PvP tem prioridade se existirem as duas
            // -----------------------------------------

            if (hasPvpReaction) {
                await member.roles.remove(
                    AZURIA_PVM_ROLE_ID,
                );

                await member.roles.add([
                    AZURIA_ROLE_ID,
                    AZURIA_PVP_ROLE_ID,
                ]);

                if (
                    hasPvmReaction &&
                    pvmReaction
                ) {
                    await pvmReaction.users
                        .remove(
                            member.id,
                        )
                        .catch(
                            () => {},
                        );
                }

                continue;
            }

            // -----------------------------------------
            // PvM
            // -----------------------------------------

            if (hasPvmReaction) {
                await member.roles.remove(
                    AZURIA_PVP_ROLE_ID,
                );

                await member.roles.add([
                    AZURIA_ROLE_ID,
                    AZURIA_PVM_ROLE_ID,
                ]);

                continue;
            }

            // -----------------------------------------
            // Sem reação
            // -----------------------------------------

            const hasAnyAzuriaRole =
                member.roles.cache.has(
                    AZURIA_ROLE_ID,
                ) ||
                member.roles.cache.has(
                    AZURIA_PVM_ROLE_ID,
                ) ||
                member.roles.cache.has(
                    AZURIA_PVP_ROLE_ID,
                );

            if (hasAnyAzuriaRole) {
                await member.roles.remove([
                    AZURIA_ROLE_ID,
                    AZURIA_PVM_ROLE_ID,
                    AZURIA_PVP_ROLE_ID,
                ]);
            }
        } catch (error) {
            console.error(
                `❌ Erro ao sincronizar Azuria para ${member.user.username}:`,
                error,
            );
        }
    }

    console.log(
        '✅ Reactions do Azuria sincronizadas.',
    );
}

// =====================================================
// AZURIA PANEL
// =====================================================

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
            `O canal Azuria (${AZURIA_CHANNEL_ID}) não existe ou não é um canal de texto.`,
        );
    }

    const textChannel =
        channel as TextChannel;

    const messages =
        await textChannel.messages.fetch({
            limit: 100,
        });

    let panelMessage =
        messages.find(message => {
            if (
                message.author.id !==
                client.user?.id
            ) {
                return false;
            }

            return message.embeds.some(
                embed =>
                    embed.footer?.text ===
                    AZURIA_PANEL_MARKER,
            );
        });

    if (!panelMessage) {
        panelMessage =
            await textChannel.send({
                embeds: [
                    buildAzuriaEmbed(),
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
        });

        console.log(
            '✅ Painel Azuria encontrado.',
        );
    }

    azuriaPanelMessageId =
        panelMessage.id;

    await panelMessage.react(
        AZURIA_PVM_EMOJI,
    );

    await panelMessage.react(
        AZURIA_PVP_EMOJI,
    );

    console.log(
        '✅ Reactions 🐉 e ⚔️ configuradas.',
    );

    const freshMessage =
        await textChannel.messages.fetch(
            panelMessage.id,
        );

    await reconcileAzuriaPanel(
        freshMessage,
    );
}

// =====================================================
// ROSTER HELPERS
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
        const row of result.rows
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
        const member of pageMembers
    ) {
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
                `👤 ${member.discord_username}`,
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
    const previous =
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
            );

    const next =
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
            );

    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            previous,
            next,
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

        // ---------------------------------------------
        // PostgreSQL
        // ---------------------------------------------

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
                '❌ Não foi possível ligar ao PostgreSQL:',
                error,
            );
        }

        // ---------------------------------------------
        // Permission diagnostics
        // ---------------------------------------------

        await logBotPermissionDiagnostics();

        // ---------------------------------------------
        // Painel Azuria
        // ---------------------------------------------

        try {
            await ensureAzuriaPanel();
        } catch (error) {
            console.error(
                '❌ Não foi possível configurar o painel Azuria:',
                error,
            );
        }
    },
);

// =====================================================
// AZURIA REACTION ADD
// =====================================================

client.on(
    Events.MessageReactionAdd,

    async (reaction, user) => {
        try {
            if (reaction.partial) {
                await reaction.fetch();
            }

            const fullUser =
                user.partial
                    ? await user.fetch()
                    : user;

            if (fullUser.bot) {
                return;
            }

            if (
                reaction.message.id !==
                    azuriaPanelMessageId ||
                reaction.message.channelId !==
                    AZURIA_CHANNEL_ID
            ) {
                return;
            }

            const emoji =
                reaction.emoji.name;

            if (
                emoji !==
                    AZURIA_PVM_EMOJI &&
                emoji !==
                    AZURIA_PVP_EMOJI
            ) {
                return;
            }

            const guild =
                reaction.message.guild;

            if (!guild) {
                return;
            }

            const member =
                await guild.members.fetch(
                    fullUser.id,
                );

            if (!member.manageable) {
                console.log(
                    `⚠️ Não posso gerir ${fullUser.username}; hierarquia superior à do bot.`,
                );

                return;
            }

            // =========================================
            // PvM
            // =========================================

            if (
                emoji ===
                AZURIA_PVM_EMOJI
            ) {
                await member.roles.remove(
                    AZURIA_PVP_ROLE_ID,
                );

                await member.roles.add([
                    AZURIA_ROLE_ID,
                    AZURIA_PVM_ROLE_ID,
                ]);

                const pvpReaction =
                    reaction.message
                        .reactions.cache
                        .find(
                            item =>
                                item.emoji
                                    .name ===
                                AZURIA_PVP_EMOJI,
                        );

                if (pvpReaction) {
                    await pvpReaction.users
                        .remove(
                            fullUser.id,
                        )
                        .catch(
                            error => {
                                console.error(
                                    `⚠️ Não consegui remover reação PvP de ${fullUser.username}:`,
                                    error,
                                );
                            },
                        );
                }

                console.log(
                    `🐉 ${fullUser.username} → Azuria PvM`,
                );

                return;
            }

            // =========================================
            // PvP
            // =========================================

            if (
                emoji ===
                AZURIA_PVP_EMOJI
            ) {
                await member.roles.remove(
                    AZURIA_PVM_ROLE_ID,
                );

                await member.roles.add([
                    AZURIA_ROLE_ID,
                    AZURIA_PVP_ROLE_ID,
                ]);

                const pvmReaction =
                    reaction.message
                        .reactions.cache
                        .find(
                            item =>
                                item.emoji
                                    .name ===
                                AZURIA_PVM_EMOJI,
                        );

                if (pvmReaction) {
                    await pvmReaction.users
                        .remove(
                            fullUser.id,
                        )
                        .catch(
                            error => {
                                console.error(
                                    `⚠️ Não consegui remover reação PvM de ${fullUser.username}:`,
                                    error,
                                );
                            },
                        );
                }

                console.log(
                    `⚔️ ${fullUser.username} → Azuria PvP`,
                );

                return;
            }
        } catch (error) {
            console.error(
                '❌ Erro ao processar reaction Azuria:',
                error,
            );
        }
    },
);

// =====================================================
// AZURIA REACTION REMOVE
// =====================================================

client.on(
    Events.MessageReactionRemove,

    async (reaction, user) => {
        try {
            if (reaction.partial) {
                await reaction.fetch();
            }

            const fullUser =
                user.partial
                    ? await user.fetch()
                    : user;

            if (fullUser.bot) {
                return;
            }

            if (
                reaction.message.id !==
                    azuriaPanelMessageId ||
                reaction.message.channelId !==
                    AZURIA_CHANNEL_ID
            ) {
                return;
            }

            const emoji =
                reaction.emoji.name;

            if (
                emoji !==
                    AZURIA_PVM_EMOJI &&
                emoji !==
                    AZURIA_PVP_EMOJI
            ) {
                return;
            }

            const guild =
                reaction.message.guild;

            if (!guild) {
                return;
            }

            const member =
                await guild.members.fetch(
                    fullUser.id,
                );

            if (!member.manageable) {
                console.log(
                    `⚠️ Não posso gerir ${fullUser.username}; hierarquia superior à do bot.`,
                );

                return;
            }

            // =========================================
            // Removeu PvM
            // =========================================

            if (
                emoji ===
                AZURIA_PVM_EMOJI
            ) {
                await member.roles.remove(
                    AZURIA_PVM_ROLE_ID,
                );

                await syncAzuriaRole(
                    member,
                );

                console.log(
                    `➖ ${fullUser.username} removeu Azuria PvM`,
                );

                return;
            }

            // =========================================
            // Removeu PvP
            // =========================================

            if (
                emoji ===
                AZURIA_PVP_EMOJI
            ) {
                await member.roles.remove(
                    AZURIA_PVP_ROLE_ID,
                );

                await syncAzuriaRole(
                    member,
                );

                console.log(
                    `➖ ${fullUser.username} removeu Azuria PvP`,
                );

                return;
            }
        } catch (error) {
            console.error(
                '❌ Erro ao processar remoção de reaction Azuria:',
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
        // SLASH COMMANDS
        // =============================================

        if (
            interaction.isChatInputCommand()
        ) {

            // -----------------------------------------
            // /ping
            // -----------------------------------------

            if (
                interaction.commandName ===
                'ping'
            ) {
                await interaction.reply(
                    '🏓 Pong!',
                );

                return;
            }

            // -----------------------------------------
            // /roster
            // -----------------------------------------

            if (
                interaction.commandName ===
                'roster'
            ) {
                await interaction.deferReply();

                try {
                    const members =
                        await getRosterMembers();

                    if (
                        members.length ===
                        0
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
                        '❌ Erro ao gerar roster:',
                        error,
                    );

                    await interaction.editReply(
                        '❌ Ocorreu um erro ao gerar o roster.',
                    );
                }

                return;
            }

            // -----------------------------------------
            // /perfil
            // -----------------------------------------

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
            // /perfil adicionar
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
            // /perfil listar
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
                        '❌ Erro ao listar personagens:',
                        error,
                    );

                    await interaction.editReply(
                        '❌ Ocorreu um erro ao consultar as tuas personagens.',
                    );
                }

                return;
            }

            // =========================================
            // /perfil editar
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
            // /perfil remover
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

                if (
                    members.length === 0
                ) {
                    await interaction.editReply({
                        content:
                            'Ainda não existem personagens registadas no roster.',

                        embeds: [],
                        components: [],
                    });

                    return;
                }

                const requestedPage =
                    Number(pageText);

                const {
                    embed,
                    page,
                    totalPages,
                } =
                    buildRosterPage(
                        members,
                        requestedPage,
                    );

                await interaction.editReply({
                    content: null,

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
                    '❌ Erro ao mudar página do roster:',
                    error,
                );
            }

            return;
        }

        // =============================================
        // SELECT: EDITAR
        // =============================================

        if (
            interaction.isStringSelectMenu() &&
            interaction.customId ===
                'perfil-edit-select'
        ) {
            const characterId =
                interaction.values[0];

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
                            id = $1
                            AND discord_id = $2
                        `,
                        [
                            characterId,
                            interaction.user.id,
                        ],
                    );

                if (
                    result.rows
                        .length === 0
                ) {
                    await interaction.reply({
                        content:
                            '❌ Essa personagem já não existe.',

                        flags:
                            MessageFlags.Ephemeral,
                    });

                    return;
                }

                const character =
                    result.rows[0];

                await interaction.showModal(
                    buildCharacterModal(
                        `perfil-edit-modal:${character.id}`,
                        'Editar personagem',
                        character,
                    ),
                );
            } catch (error) {
                console.error(
                    '❌ Erro ao abrir edição:',
                    error,
                );

                await interaction.reply({
                    content:
                        '❌ Ocorreu um erro ao carregar a personagem.',

                    flags:
                        MessageFlags.Ephemeral,
                });
            }

            return;
        }

        // =============================================
        // SELECT: REMOVER
        // =============================================

        if (
            interaction.isStringSelectMenu() &&
            interaction.customId ===
                'perfil-remove-select'
        ) {
            const characterId =
                interaction.values[0];

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
                            id = $1
                            AND discord_id = $2
                        `,
                        [
                            characterId,
                            interaction.user.id,
                        ],
                    );

                if (
                    result.rows
                        .length === 0
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
                        `⚠️ Tens a certeza de que queres remover ` +
                        `**${character.character_name}**?`,

                    components: [
                        buttons,
                    ],
                });
            } catch (error) {
                console.error(
                    '❌ Erro ao preparar remoção:',
                    error,
                );

                await interaction.update({
                    content:
                        '❌ Ocorreu um erro ao carregar a personagem.',

                    components: [],
                });
            }

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
                    result.rows
                        .length === 0
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

        // =============================================
        // MODAL: ADICIONAR
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
                            COUNT(*)::INTEGER
                                AS count

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

                console.error(
                    '❌ Erro ao adicionar personagem:',
                    error,
                );

                if (
                    error.code === '23505'
                ) {
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

        // =============================================
        // MODAL: EDITAR
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
                            COUNT(*)::INTEGER
                                AS count

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
                            SELECT
                                id

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

                console.error(
                    '❌ Erro ao editar personagem:',
                    error,
                );

                if (
                    error.code === '23505'
                ) {
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
    },
);

// =====================================================
// LOGIN
// =====================================================

client.login(token);
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
    throw new Error('DISCORD_TOKEN não está definido.');
}

// =====================================================
// AZURIA
// =====================================================

const AZURIA_ROLE_ID = '1547612647736746074';
const AZURIA_PVP_ROLE_ID = '1548260956860325959';
const AZURIA_PVM_ROLE_ID = '1548261013550276648';

const AZURIA_CHANNEL_ID = '1548265183053357146';

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

type CharacterStatus =
    | 'pvm'
    | 'pvp';

type CharacterData = {
    id: string;
    character_name: string;
    character_class: string;
    character_status:
        | CharacterStatus
        | null;
    level: number;
    is_main: boolean;
};

type RosterMember = {
    discord_id: string;
    discord_username: string;

    azuria_status:
        | CharacterStatus
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

    // =================================================
    // NOME
    // =================================================

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

    // =================================================
    // CLASSE
    // =================================================

    const classSelect =
        new StringSelectMenuBuilder()
            .setCustomId(
                'character-class',
            )
            .setPlaceholder(
                'Seleciona a classe',
            )
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
            .setLabel(
                'Classe',
            )
            .setStringSelectMenuComponent(
                classSelect,
            );

    // =================================================
    // ESTADO PvM / PvP
    // =================================================

	const currentStatus =
		character?.character_status;

	const statusSelect =
		new StringSelectMenuBuilder()
			.setCustomId(
				'character-status',
			)
			.setPlaceholder(
				'Seleciona PvM ou PvP',
			)
			.setRequired(true)
			.addOptions(
				{
					label: 'PvP',
					description:
						'Personagem pronta para PvP',
					value: 'pvp',

					default:
						currentStatus ===
						'pvp',
				},
				{
					label: 'PvM',
					description:
						'Personagem em progressão ou usada para PvM',
					value: 'pvm',

					default:
						currentStatus ===
						'pvm',
				},
			);

    const statusLabel =
        new LabelBuilder()
            .setLabel(
                'Estado da personagem',
            )
            .setDescription(
                'Define se esta personagem é PvM ou PvP',
            )
            .setStringSelectMenuComponent(
                statusSelect,
            );

    // =================================================
    // NÍVEL
    // =================================================

    const levelInput =
        new TextInputBuilder()
            .setCustomId(
                'character-level',
            )
            .setStyle(
                TextInputStyle.Short,
            )
            .setPlaceholder(
                'Ex: 120',
            )
            .setMinLength(1)
            .setMaxLength(3)
            .setRequired(true);

    if (character) {
        levelInput.setValue(
            String(
                character.level,
            ),
        );
    }

    const levelLabel =
        new LabelBuilder()
            .setLabel(
                'Nível',
            )
            .setTextInputComponent(
                levelInput,
            );

    // =================================================
    // MAIN
    // =================================================

    const mainSelect =
        new StringSelectMenuBuilder()
            .setCustomId(
                'character-main',
            )
            .setPlaceholder(
                'É a tua personagem principal?',
            )
            .setRequired(true)
            .addOptions(
                {
                    label:
                        'Sim',

                    description:
                        'Definir como personagem principal',

                    value:
                        'yes',

                    default:
                        character
                            ?.is_main ===
                        true,
                },
                {
                    label:
                        'Não',

                    description:
                        'Personagem secundária',

                    value:
                        'no',

                    default:
                        character
                            ?.is_main !==
                        true,
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

    // =================================================
    // MODAL
    // =================================================

    modal.addLabelComponents(
        nameLabel,
        classLabel,
        statusLabel,
        levelLabel,
        mainLabel,
    );

    return modal;
}

// =====================================================
// READ MODAL
// =====================================================

function readCharacterModal(
    interaction:
        ModalSubmitInteraction,
) {
    console.log(
        '📨 Modal recebido:',
        interaction.customId,
    );

    const characterName =
        interaction.fields
            .getTextInputValue(
                'character-name',
            )
            .trim();

    const characterClassValues =
        interaction.fields
            .getStringSelectValues(
                'character-class',
            );

    const characterStatusValues =
        interaction.fields
            .getStringSelectValues(
                'character-status',
            );

    const mainValues =
        interaction.fields
            .getStringSelectValues(
                'character-main',
            );

    const levelText =
        interaction.fields
            .getTextInputValue(
                'character-level',
            )
            .trim();

    console.log(
        '📋 Dados modal:',
        {
            characterName,
            characterClassValues,
            characterStatusValues,
            levelText,
            mainValues,
        },
    );

    const characterClass =
        characterClassValues[0];

    const characterStatus =
        characterStatusValues[0] as
            CharacterStatus |
            undefined;

    const requestedMain =
        mainValues[0] ===
        'yes';

    if (!characterClass) {
        throw new Error(
            'character-class não foi preenchido.',
        );
    }

    if (
        characterStatus !== 'pvm' &&
        characterStatus !== 'pvp'
    ) {
        throw new Error(
            'character-status não foi preenchido corretamente.',
        );
    }

    if (
        mainValues.length === 0
    ) {
        throw new Error(
            'character-main não foi preenchido.',
        );
    }

    return {
        characterName,
        characterClass,
        characterStatus,
        level:
            Number(levelText),
        requestedMain,
    };
}

// =====================================================
// VALIDATION
// =====================================================

function validateCharacter(
    characterName: string,
    characterClass: string,
    characterStatus: string,
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
        characterStatus !== 'pvm' &&
        characterStatus !== 'pvp'
    ) {
        return '❌ Estado PvM/PvP inválido.';
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

// =====================================================
// CHARACTER SELECT
// =====================================================

function buildCharacterSelect(
    customId: string,
    characters: CharacterData[],
) {
    const select =
        new StringSelectMenuBuilder()
            .setCustomId(
                customId,
            )
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
                                character
                                    .is_main
                                    ? '⭐ '
                                    : ''
                            }${
                                character
                                    .character_name
                            }`,

                        description:
                            `${character.character_class} • ` +
                            `Lv. ${character.level} • ` +
                            `${
                                character
                                    .character_status ===
                                'pvp'
                                    ? 'PvP'
                                    : character
                                          .character_status ===
                                      'pvm'
                                    ? 'PvM'
                                    : 'Sem estado'
                            }`,

                        value:
                            String(
                                character.id,
                            ),
                    }),
                ),
            );

    return new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(
            select,
        );
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
                'Seleciona o teu estado geral atual no servidor.',
                '',
                '🐉 **PvM** — Ainda estás em progressão PvM.',
                '',
                '⚔️ **PvP** — Já estás preparado para PvP.',
                '',
                '**Este estado é relativo ao jogador, não às personagens individualmente.**',
                '',
                'Podes ter estado geral PvP e continuar a registar personagens PvM no teu perfil.',
                '',
                'A role **Azuria** é atribuída automaticamente.',
                '',
                'Se deixares de jogar no servidor, usa **Sair do Azuria**.',
            ].join(
                '\n',
            ),
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
                .setLabel(
                    'PvM',
                )
                .setEmoji(
                    '🐉',
                )
                .setStyle(
                    ButtonStyle.Secondary,
                ),

            new ButtonBuilder()
                .setCustomId(
                    'azuria-pvp',
                )
                .setLabel(
                    'PvP',
                )
                .setEmoji(
                    '⚔️',
                )
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
                .setEmoji(
                    '❌',
                )
                .setStyle(
                    ButtonStyle.Danger,
                ),
        );
}

// =====================================================
// HELP
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
                'Adiciona uma personagem e permite definir nome, classe, nível, estado PvM/PvP e se é a tua personagem principal.',
                '',
                '`/perfil listar`',
                'Mostra todas as personagens que tens registadas.',
                '',
                '`/perfil editar`',
                'Permite alterar os dados de uma personagem.',
                '',
                '`/perfil remover`',
                'Remove uma personagem do teu perfil.',
                '',
                '⭐ A primeira personagem fica automaticamente definida como principal.',
                '',
                '### ⚔️ Roster',
                '',
                '`/roster`',
                'Mostra todos os membros e personagens registadas.',
                '',
                '### 🛡️ Composição',
                '',
                '`/composicao`',
                'Mostra todas as personagens marcadas como PvP, agrupadas por classe.',
                '',
                '`/composicao-pvm`',
                'Mostra todas as personagens marcadas como PvM, agrupadas por classe.',
                '',
                '### 🐉 Estado geral no Azuria',
                '',
                'Usa os botões da mensagem abaixo para definir o teu estado geral como **PvM** ou **PvP**.',
                '',
                'O estado de cada personagem é definido separadamente através de `/perfil adicionar` ou `/perfil editar`.',
            ].join(
                '\n',
            ),
        )
        .setFooter({
            text:
                COMMANDS_HELP_MARKER,
        });
}

// =====================================================
// CHANNEL
// =====================================================

async function getAzuriaChannel() {
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

    return channel as TextChannel;
}

// =====================================================
// ENSURE HELP
// =====================================================

async function ensureCommandsHelpMessage() {
    const textChannel =
        await getAzuriaChannel();

    const messages =
        await textChannel.messages.fetch({
            limit:
                100,
        });

    const helpMessage =
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
        await textChannel.send({
            embeds: [
                buildCommandsHelpEmbed(),
            ],
        });

        console.log(
            '✅ Mensagem de ajuda criada.',
        );

        return;
    }

    await helpMessage.edit({
        embeds: [
            buildCommandsHelpEmbed(),
        ],
    });

    console.log(
        '✅ Mensagem de ajuda atualizada.',
    );
}

// =====================================================
// ENSURE AZURIA
// =====================================================

async function ensureAzuriaPanel() {
    const textChannel =
        await getAzuriaChannel();

    const messages =
        await textChannel.messages.fetch({
            limit:
                100,
        });

    const panelMessage =
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

        return;
    }

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

// =====================================================
// PERMISSIONS
// =====================================================

async function logBotPermissionDiagnostics() {
    try {
        const textChannel =
            await getAzuriaChannel();

        const guild =
            textChannel.guild;

        await guild.roles.fetch();

        const botMember =
            await guild.members.fetchMe();

        console.log(
            '============================================================',
        );

        console.log(
            '🔎 WICKED BOT — PERMISSION DIAGNOSTICS',
        );

        console.log(
            '============================================================',
        );

        console.log(
            `Bot: ${botMember.user.tag}`,
        );

        console.log(
            `Role mais alta: ${botMember.roles.highest.name}`,
        );

        const checks = [
            {
                name:
                    'Administrator',

                permission:
                    PermissionFlagsBits
                        .Administrator,
            },

            {
                name:
                    'ManageRoles',

                permission:
                    PermissionFlagsBits
                        .ManageRoles,
            },

            {
                name:
                    'ManageMessages',

                permission:
                    PermissionFlagsBits
                        .ManageMessages,
            },

            {
                name:
                    'ViewChannel',

                permission:
                    PermissionFlagsBits
                        .ViewChannel,
            },

            {
                name:
                    'SendMessages',

                permission:
                    PermissionFlagsBits
                        .SendMessages,
            },

            {
                name:
                    'EmbedLinks',

                permission:
                    PermissionFlagsBits
                        .EmbedLinks,
            },
        ];

        for (
            const check
            of checks
        ) {
            console.log(
                `${
                    botMember
                        .permissions
                        .has(
                            check.permission,
                        )
                        ? '✅'
                        : '❌'
                } ${check.name}`,
            );
        }

        const targetRoles = [
            {
                label:
                    'Azuria',

                id:
                    AZURIA_ROLE_ID,
            },

            {
                label:
                    'Azuria PvP',

                id:
                    AZURIA_PVP_ROLE_ID,
            },

            {
                label:
                    'Azuria PvM',

                id:
                    AZURIA_PVM_ROLE_ID,
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

            console.log(
                `${target.label}: position=${role.position}, editable=${role.editable}`,
            );
        }

        console.log(
            '============================================================',
        );
    } catch (error) {
        console.error(
            '❌ Erro no diagnóstico:',
            error,
        );
    }
}

// =====================================================
// STATUS TEXT
// =====================================================

function getCharacterStatusText(
    status:
        CharacterStatus |
        null,
) {
    if (
        status === 'pvp'
    ) {
        return '⚔️ PvP';
    }

    if (
        status === 'pvm'
    ) {
        return '🐉 PvM';
    }

    return '⚪ Por definir';
}

// =====================================================
// ROSTER DATA
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
                c.character_status,
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

                azuria_status:
                    null,

                characters:
                    [],
            };

            members.set(
                row.discord_id,
                member,
            );
        }

        member.characters.push({
            id:
                row.id,

            character_name:
                row.character_name,

            character_class:
                row.character_class,

            character_status:
                row.character_status,

            level:
                row.level,

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

// =====================================================
// ROSTER EMBED
// =====================================================

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
        let memberStatus =
            '⚪ Sem estado Azuria';

        if (
            member.azuria_status ===
            'pvm'
        ) {
            memberStatus =
                '🐉 PvM';
        }

        if (
            member.azuria_status ===
            'pvp'
        ) {
            memberStatus =
                '⚔️ PvP';
        }

        const characterLines =
            member.characters.map(
                character => {
                    const icon =
                        character.is_main
                            ? '⭐'
                            : '•';

                    const status =
                        getCharacterStatusText(
                            character
                                .character_status,
                        );

                    return (
                        `${icon} **${character.character_name}**` +
                        ` — ${character.character_class}` +
                        ` • Lv. ${character.level}` +
                        ` • ${status}`
                    );
                },
            );

        let value =
            characterLines.join(
                '\n',
            );

        if (
            value.length >
            1000
        ) {
            value =
                value.substring(
                    0,
                    997,
                ) +
                '...';
        }

        embed.addFields({
            name:
                `👤 ${member.discord_username} — ${memberStatus}`,

            value,

            inline:
                false,
        });
    }

    return {
        embed,
        page,
        totalPages,
    };
}

// =====================================================
// ROSTER BUTTONS
// =====================================================

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
                .setLabel(
                    'Anterior',
                )
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
                .setLabel(
                    'Seguinte',
                )
                .setStyle(
                    ButtonStyle.Secondary,
                )
                .setDisabled(
                    page >=
                        totalPages -
                            1,
                ),
        );
}

// =====================================================
// COMPOSIÇÃO
// =====================================================

async function buildCompositionEmbed(
    status:
        CharacterStatus,
) {
    const result =
        await db.query(
            `
            SELECT
                c.character_name,
                c.character_class,
                c.level,
                c.is_main,
                m.discord_username

            FROM characters c

            INNER JOIN members m
                ON m.discord_id =
                    c.discord_id

            WHERE
                c.character_status = $1

            ORDER BY
                c.character_class ASC,
                c.is_main DESC,
                LOWER(
                    c.character_name
                ) ASC
            `,
            [
                status,
            ],
        );

    const isPvp =
        status ===
        'pvp';

    const embed =
        new EmbedBuilder()
            .setTitle(
                isPvp
                    ? '⚔️ Wicked — Composição PvP'
                    : '🐉 Wicked — Composição PvM',
            )
            .setDescription(
                `**${result.rows.length} personagens**`,
            )
            .setTimestamp();

    if (
        result.rows.length ===
        0
    ) {
        embed.addFields({
            name:
                'Sem personagens',

            value:
                isPvp
                    ? 'Ainda não existem personagens marcadas como PvP.'
                    : 'Ainda não existem personagens marcadas como PvM.',
        });

        return embed;
    }

    for (
        const characterClass
        of VALID_CLASSES
    ) {
        const characters =
            result.rows.filter(
                character =>
                    character
                        .character_class ===
                    characterClass,
            );

        if (
            characters.length ===
            0
        ) {
            continue;
        }

        const lines =
            characters.map(
                character => {
                    const main =
                        character.is_main
                            ? '⭐ '
                            : '• ';

                    return (
                        `${main}**${character.character_name}**` +
                        ` • Lv. ${character.level}` +
                        ` • ${character.discord_username}`
                    );
                },
            );

        let value =
            lines.join(
                '\n',
            );

        if (
            value.length >
            1000
        ) {
            value =
                value.substring(
                    0,
                    997,
                ) +
                '...';
        }

        embed.addFields({
            name:
                `${characterClass} (${characters.length})`,

            value,

            inline:
                false,
        });
    }

    return embed;
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

        // =================================================
        // AZURIA BUTTONS
        // =================================================

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
            if (
                !interaction.guild
            ) {
                return;
            }

            await interaction.deferReply({
                flags:
                    MessageFlags.Ephemeral,
            });

            try {
                const member =
                    await interaction
                        .guild
                        .members
                        .fetch(
                            interaction
                                .user.id,
                        );

                // PvM

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
                        content:
                            [
                                '✅ **Estado geral atualizado para PvM.**',
                                '',
                                'Roles atribuídas:',
                                '- `Azuria`',
                                '- `Azuria PvM`',
                                '',
                                'O estado PvM/PvP das tuas personagens é definido separadamente através do `/perfil`.',
                            ].join(
                                '\n',
                            ),
                    });

                    return;
                }

                // PvP

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
                        content:
                            [
                                '✅ **Estado geral atualizado para PvP.**',
                                '',
                                'Roles atribuídas:',
                                '- `Azuria`',
                                '- `Azuria PvP`',
                                '',
                                'Podes continuar a ter personagens individuais marcadas como PvM.',
                            ].join(
                                '\n',
                            ),
                    });

                    return;
                }

                // SAIR

                await member.roles.remove([
                    AZURIA_ROLE_ID,
                    AZURIA_PVM_ROLE_ID,
                    AZURIA_PVP_ROLE_ID,
                ]);

                await interaction.editReply({
                    content:
                        [
                            '✅ **Estado Azuria removido.**',
                            '',
                            'Foram removidas:',
                            '- `Azuria`',
                            '- `Azuria PvM`',
                            '- `Azuria PvP`',
                        ].join(
                            '\n',
                        ),
                });
            } catch (error) {
                console.error(
                    '❌ Erro ao alterar roles Azuria:',
                    error,
                );

                await interaction.editReply(
                    '❌ Não foi possível atualizar as tuas roles.',
                );
            }

            return;
        }

        // =================================================
        // SLASH COMMANDS
        // =================================================

        if (
            interaction.isChatInputCommand()
        ) {

            // /ping

            if (
                interaction.commandName ===
                'ping'
            ) {
                await interaction.reply(
                    '🏓 Pong!',
                );

                return;
            }

            // /composicao

            if (
                interaction.commandName ===
                'composicao'
            ) {
                await interaction.deferReply();

                try {
                    const embed =
                        await buildCompositionEmbed(
                            'pvp',
                        );

                    await interaction.editReply({
                        embeds: [
                            embed,
                        ],
                    });
                } catch (error) {
                    console.error(
                        '❌ Erro composição PvP:',
                        error,
                    );

                    await interaction.editReply(
                        '❌ Ocorreu um erro ao gerar a composição PvP.',
                    );
                }

                return;
            }

            // /composicao-pvm

            if (
                interaction.commandName ===
                'composicao-pvm'
            ) {
                await interaction.deferReply();

                try {
                    const embed =
                        await buildCompositionEmbed(
                            'pvm',
                        );

                    await interaction.editReply({
                        embeds: [
                            embed,
                        ],
                    });
                } catch (error) {
                    console.error(
                        '❌ Erro composição PvM:',
                        error,
                    );

                    await interaction.editReply(
                        '❌ Ocorreu um erro ao gerar a composição PvM.',
                    );
                }

                return;
            }

            // /roster

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
                        embeds: [
                            embed,
                        ],

                        components:
                            totalPages >
                            1
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

            // Apenas /perfil a partir daqui

            if (
                interaction.commandName !==
                'perfil'
            ) {
                return;
            }

            const subcommand =
                interaction.options
                    .getSubcommand();

            // =================================================
            // /perfil adicionar
            // =================================================

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

            // =================================================
            // /perfil listar
            // =================================================

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
                                character_status,
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
                        result.rows.length ===
                        0
                    ) {
                        await interaction.editReply(
                            'Ainda não tens nenhuma personagem registada.\n\n' +
                            'Usa `/perfil adicionar`.',
                        );

                        return;
                    }

                    const characters =
                        result.rows.map(
                            character => {
                                const status =
                                    getCharacterStatusText(
                                        character
                                            .character_status,
                                    );

                                return (
                                    `${
                                        character
                                            .is_main
                                            ? '⭐ '
                                            : ''
                                    }` +
                                    `**${character.character_name}**\n` +
                                    `${character.character_class} • ` +
                                    `Lv. ${character.level} • ` +
                                    status
                                );
                            },
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
                        ].join(
                            '\n\n',
                        ),
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

            // =================================================
            // /perfil editar
            // =================================================

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
                                character_status,
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
                        result.rows.length ===
                        0
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

            // =================================================
            // /perfil remover
            // =================================================

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
                                character_status,
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
                        result.rows.length ===
                        0
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

        // =================================================
        // ROSTER PAGINATION
        // =================================================

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
                    members.length ===
                    0
                ) {
                    await interaction.editReply({
                        content:
                            'Ainda não existem personagens registadas no roster.',

                        embeds:
                            [],

                        components:
                            [],
                    });

                    return;
                }

                const {
                    embed,
                    page,
                    totalPages,
                } =
                    buildRosterPage(
                        members,
                        Number(
                            pageText,
                        ),
                    );

                await interaction.editReply({
                    content:
                        null,

                    embeds: [
                        embed,
                    ],

                    components:
                        totalPages >
                        1
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

        // =================================================
        // SELECT EDIT
        // =================================================

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
                            character_status,
                            level,
                            is_main

                        FROM characters

                        WHERE
                            id = $1
                            AND discord_id = $2
                        `,
                        [
                            characterId,
                            interaction
                                .user.id,
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

        // =================================================
        // SELECT REMOVE
        // =================================================

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
                            character_name

                        FROM characters

                        WHERE
                            id = $1
                            AND discord_id = $2
                        `,
                        [
                            characterId,
                            interaction
                                .user.id,
                        ],
                    );

                if (
                    result.rows.length ===
                    0
                ) {
                    await interaction.update({
                        content:
                            '❌ Essa personagem já não existe.',

                        components:
                            [],
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
            } catch (error) {
                console.error(
                    '❌ Erro ao preparar remoção:',
                    error,
                );
            }

            return;
        }

        // =================================================
        // CANCEL REMOVE
        // =================================================

        if (
            interaction.isButton() &&
            interaction.customId ===
                'perfil-remove-cancel'
        ) {
            await interaction.update({
                content:
                    '✅ Remoção cancelada.',

                components:
                    [],
            });

            return;
        }

        // =================================================
        // CONFIRM REMOVE
        // =================================================

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
                            interaction
                                .user.id,
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

                        components:
                            [],
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
                        interaction
                            .user.id,
                    ],
                );

                let newMainName:
                    string |
                    null =
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
                                interaction
                                    .user.id,
                            ],
                        );

                    if (
                        replacement.rows.length >
                        0
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
                                    .rows[0]
                                    .id,
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

                if (
                    newMainName
                ) {
                    response +=
                        `\n\n⭐ **${newMainName}** passou a ser a tua personagem principal.`;
                }

                await interaction.editReply({
                    content:
                        response,

                    components:
                        [],
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

                    components:
                        [],
                });
            } finally {
                dbClient.release();
            }

            return;
        }

        // =================================================
        // ADD MODAL
        // =================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId ===
                'perfil-add-modal'
        ) {
            await interaction.deferReply({
                flags:
                    MessageFlags.Ephemeral,
            });

            try {
                const {
                    characterName,
                    characterClass,
                    characterStatus,
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
                        characterStatus,
                        level,
                    );

                if (
                    validationError
                ) {
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

                        VALUES (
                            $1,
                            $2
                        )

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
                            interaction
                                .user.id,

                            interaction
                                .user
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
                                interaction
                                    .user.id,
                            ],
                        );

                    const makeMain =
                        countResult
                            .rows[0]
                            .count ===
                            0 ||
                        requestedMain;

                    if (
                        makeMain
                    ) {
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
                                interaction
                                    .user.id,
                            ],
                        );
                    }

                    await dbClient.query(
                        `
                        INSERT INTO characters (
                            discord_id,
                            character_name,
                            character_class,
                            character_status,
                            level,
                            is_main
                        )

                        VALUES (
                            $1,
                            $2,
                            $3,
                            $4,
                            $5,
                            $6
                        )
                        `,
                        [
                            interaction
                                .user.id,

                            characterName,
                            characterClass,
                            characterStatus,
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
                            `**Estado:** ${getCharacterStatusText(characterStatus)}`,
                            `**Nível:** ${level}`,
                            `**Principal:** ${
                                makeMain
                                    ? 'Sim ⭐'
                                    : 'Não'
                            }`,
                        ].join(
                            '\n',
                        ),
                    );
                } catch (
                    error: any
                ) {
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
                        '❌ Erro DB ao adicionar personagem:',
                        error,
                    );

                    await interaction.editReply(
                        '❌ Ocorreu um erro ao guardar a personagem.',
                    );
                } finally {
                    dbClient.release();
                }
            } catch (error) {
                console.error(
                    '❌ Erro ao ler modal:',
                    error,
                );

                await interaction.editReply(
                    '❌ Não foi possível ler os dados da personagem. Confirma todos os campos e tenta novamente.',
                );
            }

            return;
        }

        // =================================================
        // EDIT MODAL
        // =================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith(
                'perfil-edit-modal:',
            )
        ) {
            console.log(
                '📨 SUBMIT DE EDIÇÃO RECEBIDO:',
                interaction.customId,
            );

            await interaction.deferReply({
                flags:
                    MessageFlags.Ephemeral,
            });

            const characterId =
                interaction.customId
                    .split(':')[1];

            try {
                const {
                    characterName,
                    characterClass,
                    characterStatus,
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
                        characterStatus,
                        level,
                    );

                if (
                    validationError
                ) {
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
                                interaction
                                    .user.id,
                            ],
                        );

                    if (
                        currentResult.rows.length ===
                        0
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
                        currentResult
                            .rows[0];

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
                                interaction
                                    .user.id,
                            ],
                        );

                    const characterCount =
                        countResult
                            .rows[0]
                            .count;

                    let finalMain =
                        requestedMain;

                    if (
                        characterCount ===
                        1
                    ) {
                        finalMain =
                            true;
                    }

                    // =====================================
                    // PASSA A MAIN
                    // =====================================

                    if (
                        finalMain
                    ) {
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
                                interaction
                                    .user.id,

                                characterId,
                            ],
                        );

                        await dbClient.query(
                            `
                            UPDATE characters

                            SET
                                character_name = $1,
                                character_class = $2,
                                character_status = $3,
                                level = $4,
                                is_main = TRUE,
                                updated_at = NOW()

                            WHERE
                                id = $5
                                AND discord_id = $6
                            `,
                            [
                                characterName,
                                characterClass,
                                characterStatus,
                                level,
                                characterId,
                                interaction
                                    .user.id,
                            ],
                        );
                    }

                    // =====================================
                    // ERA MAIN E DEIXA DE SER
                    // =====================================

                    else if (
                        current.is_main
                    ) {
                        await dbClient.query(
                            `
                            UPDATE characters

                            SET
                                character_name = $1,
                                character_class = $2,
                                character_status = $3,
                                level = $4,
                                is_main = FALSE,
                                updated_at = NOW()

                            WHERE
                                id = $5
                                AND discord_id = $6
                            `,
                            [
                                characterName,
                                characterClass,
                                characterStatus,
                                level,
                                characterId,
                                interaction
                                    .user.id,
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
                                    interaction
                                        .user.id,

                                    characterId,
                                ],
                            );

                        if (
                            replacement.rows.length >
                            0
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
                                        .rows[0]
                                        .id,
                                ],
                            );
                        }
                    }

                    // =====================================
                    // CONTINUA SECUNDÁRIA
                    // =====================================

                    else {
                        await dbClient.query(
                            `
                            UPDATE characters

                            SET
                                character_name = $1,
                                character_class = $2,
                                character_status = $3,
                                level = $4,
                                updated_at = NOW()

                            WHERE
                                id = $5
                                AND discord_id = $6
                            `,
                            [
                                characterName,
                                characterClass,
                                characterStatus,
                                level,
                                characterId,
                                interaction
                                    .user.id,
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
                            `**Estado:** ${getCharacterStatusText(characterStatus)}`,
                            `**Nível:** ${level}`,
                            `**Principal:** ${
                                finalMain
                                    ? 'Sim ⭐'
                                    : 'Não'
                            }`,
                        ].join(
                            '\n',
                        ),
                    );

                    console.log(
                        `✅ Personagem ${characterName} atualizada para ${characterStatus}.`,
                    );
                } catch (
                    error: any
                ) {
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
                        '❌ Erro DB ao editar personagem:',
                        error,
                    );

                    await interaction.editReply(
                        '❌ Ocorreu um erro ao editar a personagem.',
                    );
                } finally {
                    dbClient.release();
                }
            } catch (error) {
                console.error(
                    '❌ Erro ao ler modal de edição:',
                    error,
                );

                await interaction.editReply(
                    '❌ Não foi possível ler os dados da personagem. Confirma todos os campos e tenta novamente.',
                );
            }

            return;
        }
    },
);

// =====================================================
// LOGIN
// =====================================================

client.login(token);
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

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN não está definido.');

const AZURIA_ROLE_ID = '1547612647736746074';
const AZURIA_PVP_ROLE_ID = '1548260956860325959';
const AZURIA_PVM_ROLE_ID = '1548261013550276648';
const AZURIA_CHANNEL_ID = '1548265183053357146';
const AZURIA_PANEL_MARKER = 'Wicked Bot • Azuria Status';
const COMMANDS_HELP_MARKER = 'Wicked Bot • Commands Help';

const BET_CHECK_INTERVAL_MS = 60_000;
const MAX_PENDING_BETS = 100;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
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

type CharacterStatus = 'pvm' | 'pvp';
type BetResult = 'won' | 'lost';

type CharacterData = {
    id: string;
    character_name: string;
    character_class: string;
    character_status: CharacterStatus | null;
    level: number;
    is_main: boolean;
};

type RosterMember = {
    discord_id: string;
    discord_username: string;
    azuria_status: CharacterStatus | null;
    characters: CharacterData[];
};

type BetRow = {
    id: string;
    discord_id: string;
    discord_username: string;
    guild_id: string;
    channel_id: string;
    message_id: string | null;
    bet_text: string;
    duration_days: number;
    created_at: Date | string;
    due_at: Date | string;
    reminder_sent_at: Date | string | null;
    reminder_message_id: string | null;
    resolved: boolean;
    result: BetResult | null;
    resolved_at: Date | string | null;
    resolved_by: string | null;
};

function buildCharacterModal(
    customId: string,
    title: string,
    character?: CharacterData,
) {
    const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

    const nameInput = new TextInputBuilder()
        .setCustomId('character-name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: PedroWar')
        .setMinLength(2)
        .setMaxLength(24)
        .setRequired(true);

    if (character) nameInput.setValue(character.character_name);

    const nameLabel = new LabelBuilder()
        .setLabel('Nome da personagem')
        .setDescription('Nome exato da personagem no Azuria')
        .setTextInputComponent(nameInput);

    const classSelect = new StringSelectMenuBuilder()
        .setCustomId('character-class')
        .setPlaceholder('Seleciona a classe')
        .setRequired(true)
        .addOptions(
            ...VALID_CLASSES.map(characterClass => ({
                label: characterClass,
                value: characterClass,
                default: character?.character_class === characterClass,
            })),
        );

    const classLabel = new LabelBuilder()
        .setLabel('Classe')
        .setStringSelectMenuComponent(classSelect);

    const currentStatus = character?.character_status;

    const statusSelect = new StringSelectMenuBuilder()
        .setCustomId('character-status')
        .setPlaceholder('Seleciona PvM ou PvP')
        .setRequired(true)
        .addOptions(
            {
                label: 'PvP',
                description: 'Personagem pronta para PvP',
                value: 'pvp',
                default: currentStatus === 'pvp',
            },
            {
                label: 'PvM',
                description: 'Personagem em progressão ou usada para PvM',
                value: 'pvm',
                default: currentStatus === 'pvm',
            },
        );

    const statusLabel = new LabelBuilder()
        .setLabel('Estado da personagem')
        .setDescription('Define se esta personagem é PvM ou PvP')
        .setStringSelectMenuComponent(statusSelect);

    const levelInput = new TextInputBuilder()
        .setCustomId('character-level')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 120')
        .setMinLength(1)
        .setMaxLength(3)
        .setRequired(true);

    if (character) levelInput.setValue(String(character.level));

    const levelLabel = new LabelBuilder()
        .setLabel('Nível')
        .setTextInputComponent(levelInput);

    const mainSelect = new StringSelectMenuBuilder()
        .setCustomId('character-main')
        .setPlaceholder('É a tua personagem principal?')
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
        .setDescription('Só podes ter uma personagem principal')
        .setStringSelectMenuComponent(mainSelect);

    modal.addLabelComponents(
        nameLabel,
        classLabel,
        statusLabel,
        levelLabel,
        mainLabel,
    );

    return modal;
}

function readCharacterModal(interaction: ModalSubmitInteraction) {
    const characterName = interaction.fields
        .getTextInputValue('character-name')
        .trim();
    const characterClassValues = interaction.fields.getStringSelectValues(
        'character-class',
    );
    const characterStatusValues = interaction.fields.getStringSelectValues(
        'character-status',
    );
    const mainValues = interaction.fields.getStringSelectValues('character-main');
    const levelText = interaction.fields
        .getTextInputValue('character-level')
        .trim();

    const characterClass = characterClassValues[0];
    const characterStatus = characterStatusValues[0] as
        | CharacterStatus
        | undefined;
    const requestedMain = mainValues[0] === 'yes';

    if (!characterClass) {
        throw new Error('character-class não foi preenchido.');
    }
    if (characterStatus !== 'pvm' && characterStatus !== 'pvp') {
        throw new Error('character-status não foi preenchido corretamente.');
    }
    if (mainValues.length === 0) {
        throw new Error('character-main não foi preenchido.');
    }

    return {
        characterName,
        characterClass,
        characterStatus,
        level: Number(levelText),
        requestedMain,
    };
}

function validateCharacter(
    characterName: string,
    characterClass: string,
    characterStatus: string,
    level: number,
) {
    if (characterName.length < 2 || characterName.length > 24) {
        return '❌ Nome da personagem inválido.';
    }
    if (!characterClass || !VALID_CLASSES.includes(characterClass)) {
        return '❌ Classe inválida.';
    }
    if (characterStatus !== 'pvm' && characterStatus !== 'pvp') {
        return '❌ Estado PvM/PvP inválido.';
    }
    if (!Number.isInteger(level) || level < 1 || level > 999) {
        return '❌ O nível tem de ser um número entre 1 e 999.';
    }
    return null;
}

function buildCharacterSelect(customId: string, characters: CharacterData[]) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder('Seleciona uma personagem')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            characters.map(character => ({
                label: `${character.is_main ? '⭐ ' : ''}${character.character_name}`,
                description:
                    `${character.character_class} • Lv. ${character.level} • ` +
                    (character.character_status === 'pvp'
                        ? 'PvP'
                        : character.character_status === 'pvm'
                          ? 'PvM'
                          : 'Sem estado'),
                value: String(character.id),
            })),
        );

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buildAzuriaEmbed() {
    return new EmbedBuilder()
        .setTitle('⚔️ Estado no Azuria')
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
            ].join('\n'),
        )
        .setFooter({ text: AZURIA_PANEL_MARKER });
}

function buildAzuriaButtons() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('azuria-pvm')
            .setLabel('PvM')
            .setEmoji('🐉')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('azuria-pvp')
            .setLabel('PvP')
            .setEmoji('⚔️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('azuria-leave')
            .setLabel('Sair do Azuria')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger),
    );
}

function buildCommandsHelpEmbed() {
    return new EmbedBuilder()
        .setTitle('📖 Como usar o Wicked Bot')
        .setDescription(
            [
                'Usa os comandos abaixo para gerir as tuas personagens, consultar a guild e deixar apostas para o futuro.',
                '',
                '### 👤 Perfil',
                '`/perfil adicionar` — adiciona uma personagem.',
                '`/perfil listar` — mostra as tuas personagens.',
                '`/perfil editar` — altera uma personagem.',
                '`/perfil remover` — remove uma personagem.',
                '',
                '⭐ A primeira personagem fica automaticamente definida como principal.',
                '',
                '### ⚔️ Roster',
                '`/roster` — mostra todos os jogadores que escolheram PvM ou PvP, incluindo quem ainda não adicionou personagens.',
                '',
                '### 🛡️ Composição',
                '`/composicao` — mostra as personagens PvP agrupadas por classe.',
                '`/composicao-pvm` — mostra as personagens PvM agrupadas por classe.',
                '',
                '### 🎲 Apostas',
                '`/aposto` — regista uma aposta e define em quantos dias deve ser relembrada.',
                '`/apostas` — mostra as apostas ainda por resolver.',
                '',
                'Quando uma aposta chegar à data, o bot relembra-a automaticamente e permite marcar **Ganhou** ou **Perdeu**.',
                '',
                '### 🐉 Estado geral no Azuria',
                'Usa os botões da mensagem abaixo para definir o teu estado geral como **PvM** ou **PvP**.',
                '',
                'O estado de cada personagem é definido separadamente através de `/perfil adicionar` ou `/perfil editar`.',
            ].join('\n'),
        )
        .setFooter({ text: COMMANDS_HELP_MARKER });
}

async function getAzuriaChannel() {
    const channel = await client.channels.fetch(AZURIA_CHANNEL_ID);
    if (!channel || channel.type !== ChannelType.GuildText) {
        throw new Error(
            `O canal ${AZURIA_CHANNEL_ID} não existe ou não é um canal de texto.`,
        );
    }
    return channel as TextChannel;
}

async function ensureCommandsHelpMessage() {
    const textChannel = await getAzuriaChannel();
    const messages = await textChannel.messages.fetch({ limit: 100 });
    const helpMessage = messages.find(
        message =>
            message.author.id === client.user?.id &&
            message.embeds.some(
                embed => embed.footer?.text === COMMANDS_HELP_MARKER,
            ),
    );

    if (!helpMessage) {
        await textChannel.send({ embeds: [buildCommandsHelpEmbed()] });
        console.log('✅ Mensagem de ajuda criada.');
        return;
    }

    await helpMessage.edit({ embeds: [buildCommandsHelpEmbed()] });
    console.log('✅ Mensagem de ajuda atualizada.');
}

async function ensureAzuriaPanel() {
    const textChannel = await getAzuriaChannel();
    const messages = await textChannel.messages.fetch({ limit: 100 });
    const panelMessage = messages.find(
        message =>
            message.author.id === client.user?.id &&
            message.embeds.some(embed => embed.footer?.text === AZURIA_PANEL_MARKER),
    );

    if (!panelMessage) {
        await textChannel.send({
            embeds: [buildAzuriaEmbed()],
            components: [buildAzuriaButtons()],
        });
        console.log('✅ Painel Azuria criado.');
        return;
    }

    await panelMessage.edit({
        embeds: [buildAzuriaEmbed()],
        components: [buildAzuriaButtons()],
    });
    console.log('✅ Painel Azuria atualizado.');
}

async function logBotPermissionDiagnostics() {
    try {
        const textChannel = await getAzuriaChannel();
        const guild = textChannel.guild;
        await guild.roles.fetch();
        const botMember = await guild.members.fetchMe();

        console.log('============================================================');
        console.log('🔎 WICKED BOT — PERMISSION DIAGNOSTICS');
        console.log('============================================================');
        console.log(`Bot: ${botMember.user.tag}`);
        console.log(`Role mais alta: ${botMember.roles.highest.name}`);

        const checks = [
            { name: 'Administrator', permission: PermissionFlagsBits.Administrator },
            { name: 'ManageRoles', permission: PermissionFlagsBits.ManageRoles },
            { name: 'ManageMessages', permission: PermissionFlagsBits.ManageMessages },
            { name: 'ViewChannel', permission: PermissionFlagsBits.ViewChannel },
            { name: 'SendMessages', permission: PermissionFlagsBits.SendMessages },
            { name: 'EmbedLinks', permission: PermissionFlagsBits.EmbedLinks },
        ];

        for (const check of checks) {
            console.log(
                `${botMember.permissions.has(check.permission) ? '✅' : '❌'} ${check.name}`,
            );
        }

        const targetRoles = [
            { label: 'Azuria', id: AZURIA_ROLE_ID },
            { label: 'Azuria PvP', id: AZURIA_PVP_ROLE_ID },
            { label: 'Azuria PvM', id: AZURIA_PVM_ROLE_ID },
        ];

        for (const target of targetRoles) {
            const role = guild.roles.cache.get(target.id);
            if (!role) {
                console.log(`❌ ${target.label}: não encontrada`);
                continue;
            }
            console.log(
                `${target.label}: position=${role.position}, editable=${role.editable}`,
            );
        }

        console.log('============================================================');
    } catch (error) {
        console.error('❌ Erro no diagnóstico:', error);
    }
}

function getCharacterStatusText(status: CharacterStatus | null) {
    if (status === 'pvp') return '⚔️ PvP';
    if (status === 'pvm') return '🐉 PvM';
    return '⚪ Por definir';
}

async function getRosterMembers(): Promise<RosterMember[]> {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) throw new Error('DISCORD_GUILD_ID não está definido.');

    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Guild não encontrada na cache.');

    const discordMembers = guild.members.cache;
    const result = await db.query(`
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
        LEFT JOIN characters c ON c.discord_id = m.discord_id
        ORDER BY
            LOWER(m.discord_username) ASC,
            c.is_main DESC,
            LOWER(c.character_name) ASC
    `);

    const charactersByMember = new Map<string, CharacterData[]>();

    for (const row of result.rows) {
        if (!row.id) continue;
        if (!charactersByMember.has(row.discord_id)) {
            charactersByMember.set(row.discord_id, []);
        }
        charactersByMember.get(row.discord_id)!.push({
            id: row.id,
            character_name: row.character_name,
            character_class: row.character_class,
            character_status: row.character_status,
            level: row.level,
            is_main: row.is_main,
        });
    }

    const rosterMembers: RosterMember[] = [];

    for (const discordMember of discordMembers.values()) {
        if (discordMember.user.bot) continue;

        let azuriaStatus: CharacterStatus | null = null;
        if (discordMember.roles.cache.has(AZURIA_PVP_ROLE_ID)) {
            azuriaStatus = 'pvp';
        } else if (discordMember.roles.cache.has(AZURIA_PVM_ROLE_ID)) {
            azuriaStatus = 'pvm';
        }

        if (!azuriaStatus) continue;

        rosterMembers.push({
            discord_id: discordMember.id,
            discord_username: discordMember.user.username,
            azuria_status: azuriaStatus,
            characters: charactersByMember.get(discordMember.id) ?? [],
        });
    }

    rosterMembers.sort((a, b) =>
        a.discord_username.localeCompare(b.discord_username, 'pt', {
            sensitivity: 'base',
        }),
    );

    return rosterMembers;
}

function buildRosterEmbeds(members: RosterMember[]) {
    const totalCharacters = members.reduce(
        (total, member) => total + member.characters.length,
        0,
    );
    const membersWithoutCharacters = members.filter(
        member => member.characters.length === 0,
    ).length;

    const chunks: RosterMember[][] = [];
    for (let i = 0; i < members.length; i += 20) {
        chunks.push(members.slice(i, i + 20));
    }

    return chunks.map((chunk, index) => {
        const embed = new EmbedBuilder()
            .setTitle(
                index === 0
                    ? '⚔️ Wicked — Roster'
                    : `⚔️ Wicked — Roster (${index + 1})`,
            )
            .setTimestamp();

        if (index === 0) {
            const description = [
                `**${members.length} jogadores** • **${totalCharacters} personagens**`,
            ];
            if (membersWithoutCharacters > 0) {
                description.push(
                    `**${membersWithoutCharacters}** ainda sem personagem registada`,
                );
            }
            embed.setDescription(description.join('\n'));
        }

        for (const member of chunk) {
            const memberStatus =
                member.azuria_status === 'pvp'
                    ? '⚔️ PvP'
                    : member.azuria_status === 'pvm'
                      ? '🐉 PvM'
                      : '⚪ Sem estado Azuria';

            const characterLines = member.characters.map(character => {
                const icon = character.is_main ? '⭐' : '•';
                return (
                    `${icon} **${character.character_name}**` +
                    ` — ${character.character_class}` +
                    ` • Lv. ${character.level}` +
                    ` • ${getCharacterStatusText(character.character_status)}`
                );
            });

            let value =
                characterLines.length > 0
                    ? characterLines.join('\n')
                    : '*Ainda não adicionou nenhuma personagem.*';

            if (value.length > 1000) value = `${value.substring(0, 997)}...`;

            embed.addFields({
                name: `👤 ${member.discord_username} — ${memberStatus}`,
                value,
                inline: false,
            });
        }

        return embed;
    });
}

async function buildCompositionEmbed(status: CharacterStatus) {
    const result = await db.query(
        `
        SELECT
            c.character_name,
            c.character_class,
            c.level,
            c.is_main,
            m.discord_username
        FROM characters c
        INNER JOIN members m ON m.discord_id = c.discord_id
        WHERE c.character_status = $1
        ORDER BY
            c.character_class ASC,
            c.is_main DESC,
            LOWER(c.character_name) ASC
        `,
        [status],
    );

    const isPvp = status === 'pvp';
    const embed = new EmbedBuilder()
        .setTitle(
            isPvp
                ? '⚔️ Wicked — Composição PvP'
                : '🐉 Wicked — Composição PvM',
        )
        .setDescription(`**${result.rows.length} personagens**`)
        .setTimestamp();

    if (result.rows.length === 0) {
        embed.addFields({
            name: 'Sem personagens',
            value: isPvp
                ? 'Ainda não existem personagens marcadas como PvP.'
                : 'Ainda não existem personagens marcadas como PvM.',
        });
        return embed;
    }

    for (const characterClass of VALID_CLASSES) {
        const characters = result.rows.filter(
            character => character.character_class === characterClass,
        );
        if (characters.length === 0) continue;

        let value = characters
            .map(character => {
                const main = character.is_main ? '⭐ ' : '• ';
                return (
                    `${main}**${character.character_name}**` +
                    ` • Lv. ${character.level}` +
                    ` • ${character.discord_username}`
                );
            })
            .join('\n');

        if (value.length > 1000) value = `${value.substring(0, 997)}...`;

        embed.addFields({
            name: `${characterClass} (${characters.length})`,
            value,
            inline: false,
        });
    }

    return embed;
}

function toDiscordTimestamp(value: Date | string) {
    return Math.floor(new Date(value).getTime() / 1000);
}

function truncateBetText(text: string, max = 500) {
    return text.length <= max ? text : `${text.substring(0, max - 3)}...`;
}

function buildBetCreatedEmbed(bet: BetRow) {
    const dueUnix = toDiscordTimestamp(bet.due_at);
    return new EmbedBuilder()
        .setTitle('🎲 Nova aposta registada')
        .setDescription(`> ${truncateBetText(bet.bet_text, 1000)}`)
        .addFields(
            { name: 'Apostador', value: `<@${bet.discord_id}>`, inline: true },
            { name: 'Duração', value: `${bet.duration_days} dias`, inline: true },
            { name: 'Relembrar', value: `<t:${dueUnix}:F>\n<t:${dueUnix}:R>`, inline: false },
        )
        .setFooter({ text: `Aposta #${bet.id}` })
        .setTimestamp(new Date(bet.created_at));
}

function buildBetReminderEmbed(bet: BetRow) {
    const createdUnix = toDiscordTimestamp(bet.created_at);
    return new EmbedBuilder()
        .setTitle('⏰ Está na hora de cobrar esta aposta')
        .setDescription(`> ${truncateBetText(bet.bet_text, 1000)}`)
        .addFields(
            { name: 'Apostador', value: `<@${bet.discord_id}>`, inline: true },
            {
                name: 'Feita há',
                value: `<t:${createdUnix}:R>`,
                inline: true,
            },
            {
                name: 'Então?',
                value: 'A aposta bateu? Marca o resultado abaixo.',
                inline: false,
            },
        )
        .setFooter({ text: `Aposta #${bet.id}` })
        .setTimestamp();
}

function buildBetResolvedEmbed(bet: BetRow, result: BetResult) {
    const won = result === 'won';
    return new EmbedBuilder()
        .setTitle(won ? '🏆 APOSTA GANHA' : '💀 APOSTA PERDIDA')
        .setDescription(`> ${truncateBetText(bet.bet_text, 1000)}`)
        .addFields(
            { name: 'Apostador', value: `<@${bet.discord_id}>`, inline: true },
            {
                name: 'Resultado',
                value: won ? '✅ Tinha razão.' : '❌ Envelheceu mal.',
                inline: true,
            },
        )
        .setFooter({ text: `Aposta #${bet.id} • Resolvida` })
        .setTimestamp();
}

function buildBetResolutionButtons(betId: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`bet-resolve:${betId}:won`)
            .setLabel('Ganhou')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`bet-resolve:${betId}:lost`)
            .setLabel('Perdeu')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger),
    );
}

function buildPendingBetsEmbeds(bets: BetRow[]) {
    const chunks: BetRow[][] = [];
    for (let i = 0; i < bets.length; i += 10) {
        chunks.push(bets.slice(i, i + 10));
    }

    return chunks.map((chunk, index) => {
        const embed = new EmbedBuilder()
            .setTitle(
                index === 0
                    ? '🎲 Apostas pendentes'
                    : `🎲 Apostas pendentes (${index + 1})`,
            )
            .setTimestamp();

        if (index === 0) {
            embed.setDescription(`**${bets.length} aposta(s) por resolver**`);
        }

        for (const bet of chunk) {
            const dueUnix = toDiscordTimestamp(bet.due_at);
            embed.addFields({
                name: `#${bet.id} • ${bet.discord_username}`,
                value:
                    `> ${truncateBetText(bet.bet_text, 250)}\n` +
                    `⏳ <t:${dueUnix}:R>`,
                inline: false,
            });
        }

        return embed;
    });
}

let checkingDueBets = false;

async function checkDueBets() {
    if (checkingDueBets) return;
    checkingDueBets = true;

    try {
        const dueResult = await db.query(`
            SELECT *
            FROM bets
            WHERE
                resolved = FALSE
                AND reminder_sent_at IS NULL
                AND due_at <= NOW()
            ORDER BY due_at ASC
            LIMIT 20
        `);

        for (const row of dueResult.rows as BetRow[]) {
            const claimResult = await db.query(
                `
                UPDATE bets
                SET reminder_sent_at = NOW()
                WHERE
                    id = $1
                    AND resolved = FALSE
                    AND reminder_sent_at IS NULL
                RETURNING *
                `,
                [row.id],
            );

            if (claimResult.rows.length === 0) continue;
            const bet = claimResult.rows[0] as BetRow;

            try {
                const channel = await client.channels.fetch(bet.channel_id);
                if (!channel || !channel.isTextBased()) {
                    throw new Error(`Canal ${bet.channel_id} não está disponível.`);
                }

                const reminderMessage = await channel.send({
                    content: `<@${bet.discord_id}>`,
                    embeds: [buildBetReminderEmbed(bet)],
                    components: [buildBetResolutionButtons(String(bet.id))],
                });

                await db.query(
                    `
                    UPDATE bets
                    SET reminder_message_id = $1
                    WHERE id = $2
                    `,
                    [reminderMessage.id, bet.id],
                );

                console.log(`⏰ Lembrete enviado para a aposta #${bet.id}.`);
            } catch (error) {
                await db.query(
                    `
                    UPDATE bets
                    SET
                        reminder_sent_at = NULL,
                        reminder_message_id = NULL
                    WHERE id = $1 AND resolved = FALSE
                    `,
                    [bet.id],
                );
                console.error(`❌ Erro ao enviar aposta #${bet.id}:`, error);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao verificar apostas pendentes:', error);
    } finally {
        checkingDueBets = false;
    }
}

client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ Bot online como ${readyClient.user.tag}`);

    try {
        const result = await db.query('SELECT NOW() AS current_time');
        console.log('✅ PostgreSQL ligado:', result.rows[0].current_time);
    } catch (error) {
        console.error('❌ PostgreSQL:', error);
    }

    try {
        const guildId = process.env.DISCORD_GUILD_ID;
        if (!guildId) throw new Error('DISCORD_GUILD_ID não está definido.');
        const guild = await client.guilds.fetch(guildId);
        await guild.members.fetch();
        console.log(`✅ ${guild.members.cache.size} membros carregados para cache.`);
    } catch (error) {
        console.error('❌ Não foi possível carregar os membros para cache:', error);
    }

    await logBotPermissionDiagnostics();

    try {
        await ensureCommandsHelpMessage();
        await ensureAzuriaPanel();
    } catch (error) {
        console.error('❌ Erro ao configurar mensagens:', error);
    }

    await checkDueBets();
    setInterval(() => void checkDueBets(), BET_CHECK_INTERVAL_MS);
});

client.on(Events.InteractionCreate, async interaction => {
    if (
        interaction.isButton() &&
        ['azuria-pvm', 'azuria-pvp', 'azuria-leave'].includes(
            interaction.customId,
        )
    ) {
        if (!interaction.guild) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);

            if (interaction.customId === 'azuria-pvm') {
                await member.roles.remove(AZURIA_PVP_ROLE_ID);
                await member.roles.add([AZURIA_ROLE_ID, AZURIA_PVM_ROLE_ID]);
                await interaction.editReply({
                    content: [
                        '✅ **Estado geral atualizado para PvM.**',
                        '',
                        'Roles atribuídas:',
                        '- `Azuria`',
                        '- `Azuria PvM`',
                        '',
                        'O estado PvM/PvP das tuas personagens é definido separadamente através do `/perfil`.',
                    ].join('\n'),
                });
                return;
            }

            if (interaction.customId === 'azuria-pvp') {
                await member.roles.remove(AZURIA_PVM_ROLE_ID);
                await member.roles.add([AZURIA_ROLE_ID, AZURIA_PVP_ROLE_ID]);
                await interaction.editReply({
                    content: [
                        '✅ **Estado geral atualizado para PvP.**',
                        '',
                        'Roles atribuídas:',
                        '- `Azuria`',
                        '- `Azuria PvP`',
                        '',
                        'Podes continuar a ter personagens individuais marcadas como PvM.',
                    ].join('\n'),
                });
                return;
            }

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
        } catch (error) {
            console.error('❌ Erro ao alterar roles Azuria:', error);
            await interaction.editReply('❌ Não foi possível atualizar as tuas roles.');
        }
        return;
    }

    if (
        interaction.isButton() &&
        interaction.customId.startsWith('bet-resolve:')
    ) {
        const [, betId, resultText] = interaction.customId.split(':');
        const betResult: BetResult | null =
            resultText === 'won' ? 'won' : resultText === 'lost' ? 'lost' : null;

        if (!betId || !betResult) {
            await interaction.reply({
                content: '❌ Resultado inválido.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        try {
            const existingResult = await db.query(
                'SELECT * FROM bets WHERE id = $1',
                [betId],
            );

            if (existingResult.rows.length === 0) {
                await interaction.reply({
                    content: '❌ Esta aposta já não existe.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const existingBet = existingResult.rows[0] as BetRow;

            if (existingBet.discord_id !== interaction.user.id) {
                await interaction.reply({
                    content: '❌ Só quem criou a aposta pode marcar o resultado.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            if (existingBet.resolved) {
                await interaction.reply({
                    content: 'ℹ️ Esta aposta já foi resolvida.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const updateResult = await db.query(
                `
                UPDATE bets
                SET
                    resolved = TRUE,
                    result = $1,
                    resolved_at = NOW(),
                    resolved_by = $2
                WHERE id = $3 AND resolved = FALSE
                RETURNING *
                `,
                [betResult, interaction.user.id, betId],
            );

            if (updateResult.rows.length === 0) {
                await interaction.reply({
                    content: 'ℹ️ Esta aposta já foi resolvida.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const resolvedBet = updateResult.rows[0] as BetRow;
            await interaction.update({
                embeds: [buildBetResolvedEmbed(resolvedBet, betResult)],
                components: [],
            });
        } catch (error) {
            console.error('❌ Erro ao resolver aposta:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Ocorreu um erro ao resolver a aposta.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
        return;
    }

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ping') {
            await interaction.reply('🏓 Pong!');
            return;
        }

        if (interaction.commandName === 'aposto') {
            await interaction.deferReply();

            try {
                if (!interaction.guildId || !interaction.channelId) {
                    await interaction.editReply(
                        '❌ Este comando só pode ser usado num servidor.',
                    );
                    return;
                }

                const betText = interaction.options.getString('aposta', true).trim();
                const durationDays = interaction.options.getInteger('dias', true);

                if (betText.length < 3 || betText.length > 500) {
                    await interaction.editReply(
                        '❌ A aposta tem de ter entre 3 e 500 caracteres.',
                    );
                    return;
                }

                if (durationDays < 1 || durationDays > 365) {
                    await interaction.editReply(
                        '❌ A duração tem de ser entre 1 e 365 dias.',
                    );
                    return;
                }

                const insertResult = await db.query(
                    `
                    INSERT INTO bets (
                        discord_id,
                        discord_username,
                        guild_id,
                        channel_id,
                        bet_text,
                        duration_days,
                        due_at
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        NOW() + ($6::INTEGER * INTERVAL '1 day')
                    )
                    RETURNING *
                    `,
                    [
                        interaction.user.id,
                        interaction.user.username,
                        interaction.guildId,
                        interaction.channelId,
                        betText,
                        durationDays,
                    ],
                );

                const bet = insertResult.rows[0] as BetRow;
                const message = await interaction.editReply({
                    embeds: [buildBetCreatedEmbed(bet)],
                });

                await db.query('UPDATE bets SET message_id = $1 WHERE id = $2', [
                    message.id,
                    bet.id,
                ]);
            } catch (error) {
                console.error('❌ Erro ao criar aposta:', error);
                await interaction.editReply('❌ Ocorreu um erro ao registar a aposta.');
            }
            return;
        }

        if (interaction.commandName === 'apostas') {
            await interaction.deferReply();

            try {
                const result = await db.query(
                    `
                    SELECT *
                    FROM bets
                    WHERE resolved = FALSE
                    ORDER BY due_at ASC
                    LIMIT $1
                    `,
                    [MAX_PENDING_BETS],
                );

                const bets = result.rows as BetRow[];
                if (bets.length === 0) {
                    await interaction.editReply('🎲 Não há apostas pendentes.');
                    return;
                }

                await interaction.editReply({
                    embeds: buildPendingBetsEmbeds(bets),
                });
            } catch (error) {
                console.error('❌ Erro ao listar apostas:', error);
                await interaction.editReply('❌ Ocorreu um erro ao listar as apostas.');
            }
            return;
        }

        if (interaction.commandName === 'composicao') {
            await interaction.deferReply();
            try {
                const embed = await buildCompositionEmbed('pvp');
                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error('❌ Erro composição PvP:', error);
                await interaction.editReply(
                    '❌ Ocorreu um erro ao gerar a composição PvP.',
                );
            }
            return;
        }

        if (interaction.commandName === 'composicao-pvm') {
            await interaction.deferReply();
            try {
                const embed = await buildCompositionEmbed('pvm');
                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error('❌ Erro composição PvM:', error);
                await interaction.editReply(
                    '❌ Ocorreu um erro ao gerar a composição PvM.',
                );
            }
            return;
        }

        if (interaction.commandName === 'roster') {
            await interaction.deferReply();
            try {
                const members = await getRosterMembers();
                if (members.length === 0) {
                    await interaction.editReply(
                        'Ainda ninguém selecionou PvM ou PvP no Azuria.',
                    );
                    return;
                }

                await interaction.editReply({ embeds: buildRosterEmbeds(members) });
            } catch (error) {
                console.error('❌ Erro roster:', error);
                await interaction.editReply('❌ Ocorreu um erro ao gerar o roster.');
            }
            return;
        }

        if (interaction.commandName !== 'perfil') return;

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'adicionar') {
            await interaction.showModal(
                buildCharacterModal('perfil-add-modal', 'Adicionar personagem'),
            );
            return;
        }

        if (subcommand === 'listar') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                const result = await db.query(
                    `
                    SELECT
                        id,
                        character_name,
                        character_class,
                        character_status,
                        level,
                        is_main
                    FROM characters
                    WHERE discord_id = $1
                    ORDER BY is_main DESC, LOWER(character_name) ASC
                    `,
                    [interaction.user.id],
                );

                if (result.rows.length === 0) {
                    await interaction.editReply(
                        'Ainda não tens nenhuma personagem registada.\n\nUsa `/perfil adicionar`.',
                    );
                    return;
                }

                const characters = result.rows.map(character => {
                    const status = getCharacterStatusText(
                        character.character_status,
                    );
                    return (
                        `${character.is_main ? '⭐ ' : ''}**${character.character_name}**\n` +
                        `${character.character_class} • Lv. ${character.level} • ${status}`
                    );
                });

                await interaction.editReply(
                    [
                        `## Personagens de ${interaction.user.globalName ?? interaction.user.username}`,
                        '',
                        ...characters,
                    ].join('\n\n'),
                );
            } catch (error) {
                console.error('❌ Erro ao listar:', error);
                await interaction.editReply(
                    '❌ Ocorreu um erro ao consultar as tuas personagens.',
                );
            }
            return;
        }

        if (subcommand === 'editar' || subcommand === 'remover') {
            try {
                const result = await db.query(
                    `
                    SELECT
                        id,
                        character_name,
                        character_class,
                        character_status,
                        level,
                        is_main
                    FROM characters
                    WHERE discord_id = $1
                    ORDER BY is_main DESC, LOWER(character_name) ASC
                    `,
                    [interaction.user.id],
                );

                if (result.rows.length === 0) {
                    await interaction.reply({
                        content: 'Ainda não tens nenhuma personagem registada.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const isEdit = subcommand === 'editar';
                await interaction.reply({
                    content: isEdit
                        ? '**Qual personagem queres editar?**'
                        : '**Qual personagem queres remover?**',
                    components: [
                        buildCharacterSelect(
                            isEdit ? 'perfil-edit-select' : 'perfil-remove-select',
                            result.rows,
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (error) {
                console.error('❌ Erro ao preparar perfil:', error);
                await interaction.reply({
                    content: '❌ Ocorreu um erro ao consultar as tuas personagens.',
                    flags: MessageFlags.Ephemeral,
                });
            }
            return;
        }
    }

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId === 'perfil-edit-select'
    ) {
        const characterId = interaction.values[0];
        try {
            const result = await db.query(
                `
                SELECT
                    id,
                    character_name,
                    character_class,
                    character_status,
                    level,
                    is_main
                FROM characters
                WHERE id = $1 AND discord_id = $2
                `,
                [characterId, interaction.user.id],
            );

            if (result.rows.length === 0) {
                await interaction.reply({
                    content: '❌ Essa personagem já não existe.',
                    flags: MessageFlags.Ephemeral,
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
            console.error('❌ Erro ao abrir edição:', error);
            await interaction.reply({
                content: '❌ Ocorreu um erro ao carregar a personagem.',
                flags: MessageFlags.Ephemeral,
            });
        }
        return;
    }

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId === 'perfil-remove-select'
    ) {
        const characterId = interaction.values[0];
        try {
            const result = await db.query(
                `
                SELECT id, character_name
                FROM characters
                WHERE id = $1 AND discord_id = $2
                `,
                [characterId, interaction.user.id],
            );

            if (result.rows.length === 0) {
                await interaction.update({
                    content: '❌ Essa personagem já não existe.',
                    components: [],
                });
                return;
            }

            const character = result.rows[0];
            const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`perfil-remove-confirm:${character.id}`)
                    .setLabel('Remover')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('perfil-remove-cancel')
                    .setLabel('Cancelar')
                    .setStyle(ButtonStyle.Secondary),
            );

            await interaction.update({
                content: `⚠️ Tens a certeza de que queres remover **${character.character_name}**?`,
                components: [buttons],
            });
        } catch (error) {
            console.error('❌ Erro ao preparar remoção:', error);
        }
        return;
    }

    if (
        interaction.isButton() &&
        interaction.customId === 'perfil-remove-cancel'
    ) {
        await interaction.update({
            content: '✅ Remoção cancelada.',
            components: [],
        });
        return;
    }

    if (
        interaction.isButton() &&
        interaction.customId.startsWith('perfil-remove-confirm:')
    ) {
        await interaction.deferUpdate();
        const characterId = interaction.customId.split(':')[1];
        const dbClient = await db.connect();

        try {
            await dbClient.query('BEGIN');
            const result = await dbClient.query(
                `
                SELECT id, character_name, is_main
                FROM characters
                WHERE id = $1 AND discord_id = $2
                FOR UPDATE
                `,
                [characterId, interaction.user.id],
            );

            if (result.rows.length === 0) {
                await dbClient.query('ROLLBACK');
                await interaction.editReply({
                    content: '❌ Essa personagem já não existe.',
                    components: [],
                });
                return;
            }

            const character = result.rows[0];
            await dbClient.query(
                'DELETE FROM characters WHERE id = $1 AND discord_id = $2',
                [characterId, interaction.user.id],
            );

            let newMainName: string | null = null;
            if (character.is_main) {
                const replacement = await dbClient.query(
                    `
                    SELECT id, character_name
                    FROM characters
                    WHERE discord_id = $1
                    ORDER BY created_at ASC, id ASC
                    LIMIT 1
                    `,
                    [interaction.user.id],
                );

                if (replacement.rows.length > 0) {
                    await dbClient.query(
                        `
                        UPDATE characters
                        SET is_main = TRUE, updated_at = NOW()
                        WHERE id = $1
                        `,
                        [replacement.rows[0].id],
                    );
                    newMainName = replacement.rows[0].character_name;
                }
            }

            await dbClient.query('COMMIT');
            let response = `✅ **${character.character_name}** foi removida.`;
            if (newMainName) {
                response += `\n\n⭐ **${newMainName}** passou a ser a tua personagem principal.`;
            }

            await interaction.editReply({ content: response, components: [] });
        } catch (error) {
            await dbClient.query('ROLLBACK');
            console.error('❌ Erro remover personagem:', error);
            await interaction.editReply({
                content: '❌ Ocorreu um erro ao remover a personagem.',
                components: [],
            });
        } finally {
            dbClient.release();
        }
        return;
    }

    if (
        interaction.isModalSubmit() &&
        interaction.customId === 'perfil-add-modal'
    ) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const {
                characterName,
                characterClass,
                characterStatus,
                level,
                requestedMain,
            } = readCharacterModal(interaction);

            const validationError = validateCharacter(
                characterName,
                characterClass,
                characterStatus,
                level,
            );

            if (validationError) {
                await interaction.editReply(validationError);
                return;
            }

            const dbClient = await db.connect();
            try {
                await dbClient.query('BEGIN');
                await dbClient.query(
                    `
                    INSERT INTO members (discord_id, discord_username)
                    VALUES ($1, $2)
                    ON CONFLICT (discord_id)
                    DO UPDATE SET
                        discord_username = EXCLUDED.discord_username,
                        updated_at = NOW()
                    `,
                    [interaction.user.id, interaction.user.username],
                );

                const countResult = await dbClient.query(
                    `
                    SELECT COUNT(*)::INTEGER AS count
                    FROM characters
                    WHERE discord_id = $1
                    `,
                    [interaction.user.id],
                );

                const makeMain = countResult.rows[0].count === 0 || requestedMain;
                if (makeMain) {
                    await dbClient.query(
                        `
                        UPDATE characters
                        SET is_main = FALSE, updated_at = NOW()
                        WHERE discord_id = $1 AND is_main = TRUE
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
                        character_status,
                        level,
                        is_main
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    `,
                    [
                        interaction.user.id,
                        characterName,
                        characterClass,
                        characterStatus,
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
                        `**Estado:** ${getCharacterStatusText(characterStatus)}`,
                        `**Nível:** ${level}`,
                        `**Principal:** ${makeMain ? 'Sim ⭐' : 'Não'}`,
                    ].join('\n'),
                );
            } catch (error: any) {
                await dbClient.query('ROLLBACK');
                if (error.code === '23505') {
                    await interaction.editReply(
                        `❌ Já existe uma personagem chamada **${characterName}** registada.`,
                    );
                    return;
                }
                console.error('❌ Erro DB ao adicionar personagem:', error);
                await interaction.editReply(
                    '❌ Ocorreu um erro ao guardar a personagem.',
                );
            } finally {
                dbClient.release();
            }
        } catch (error) {
            console.error('❌ Erro ao ler modal:', error);
            await interaction.editReply(
                '❌ Não foi possível ler os dados da personagem. Confirma todos os campos e tenta novamente.',
            );
        }
        return;
    }

    if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith('perfil-edit-modal:')
    ) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const characterId = interaction.customId.split(':')[1];

        try {
            const {
                characterName,
                characterClass,
                characterStatus,
                level,
                requestedMain,
            } = readCharacterModal(interaction);

            const validationError = validateCharacter(
                characterName,
                characterClass,
                characterStatus,
                level,
            );
            if (validationError) {
                await interaction.editReply(validationError);
                return;
            }

            const dbClient = await db.connect();
            try {
                await dbClient.query('BEGIN');
                const currentResult = await dbClient.query(
                    `
                    SELECT id, is_main
                    FROM characters
                    WHERE id = $1 AND discord_id = $2
                    FOR UPDATE
                    `,
                    [characterId, interaction.user.id],
                );

                if (currentResult.rows.length === 0) {
                    await dbClient.query('ROLLBACK');
                    await interaction.editReply('❌ Essa personagem já não existe.');
                    return;
                }

                const current = currentResult.rows[0];
                const countResult = await dbClient.query(
                    `
                    SELECT COUNT(*)::INTEGER AS count
                    FROM characters
                    WHERE discord_id = $1
                    `,
                    [interaction.user.id],
                );

                let finalMain = requestedMain;
                if (countResult.rows[0].count === 1) finalMain = true;

                if (finalMain) {
                    await dbClient.query(
                        `
                        UPDATE characters
                        SET is_main = FALSE, updated_at = NOW()
                        WHERE discord_id = $1 AND id <> $2 AND is_main = TRUE
                        `,
                        [interaction.user.id, characterId],
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
                        WHERE id = $5 AND discord_id = $6
                        `,
                        [
                            characterName,
                            characterClass,
                            characterStatus,
                            level,
                            characterId,
                            interaction.user.id,
                        ],
                    );
                } else if (current.is_main) {
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
                        WHERE id = $5 AND discord_id = $6
                        `,
                        [
                            characterName,
                            characterClass,
                            characterStatus,
                            level,
                            characterId,
                            interaction.user.id,
                        ],
                    );

                    const replacement = await dbClient.query(
                        `
                        SELECT id
                        FROM characters
                        WHERE discord_id = $1 AND id <> $2
                        ORDER BY created_at ASC, id ASC
                        LIMIT 1
                        `,
                        [interaction.user.id, characterId],
                    );

                    if (replacement.rows.length > 0) {
                        await dbClient.query(
                            `
                            UPDATE characters
                            SET is_main = TRUE, updated_at = NOW()
                            WHERE id = $1
                            `,
                            [replacement.rows[0].id],
                        );
                    }
                } else {
                    await dbClient.query(
                        `
                        UPDATE characters
                        SET
                            character_name = $1,
                            character_class = $2,
                            character_status = $3,
                            level = $4,
                            updated_at = NOW()
                        WHERE id = $5 AND discord_id = $6
                        `,
                        [
                            characterName,
                            characterClass,
                            characterStatus,
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
                        `**Estado:** ${getCharacterStatusText(characterStatus)}`,
                        `**Nível:** ${level}`,
                        `**Principal:** ${finalMain ? 'Sim ⭐' : 'Não'}`,
                    ].join('\n'),
                );
            } catch (error: any) {
                await dbClient.query('ROLLBACK');
                if (error.code === '23505') {
                    await interaction.editReply(
                        `❌ Já existe uma personagem chamada **${characterName}** registada.`,
                    );
                    return;
                }
                console.error('❌ Erro DB ao editar personagem:', error);
                await interaction.editReply(
                    '❌ Ocorreu um erro ao editar a personagem.',
                );
            } finally {
                dbClient.release();
            }
        } catch (error) {
            console.error('❌ Erro ao ler modal de edição:', error);
            await interaction.editReply(
                '❌ Não foi possível ler os dados da personagem. Confirma todos os campos e tenta novamente.',
            );
        }
        return;
    }
});

client.login(token);

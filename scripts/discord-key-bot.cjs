/**
 * Bot de Tomz Boost (solo vos lo corres, no va en el instalador).
 *
 * Comandos:
 *   /setup       categorias, roles, textos y botones de compra
 *   /comprar     genera QR / link de pago y entrega la key al acreditar
 *   /key         genera una key a mano (admin)
 *   /pagado      marca un pago como cobrado si el poller no lo vio (admin)
 *   /pendientes  lista pagos abiertos (admin)
 */
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
  MessageType,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js')
require('./lib/load-env.cjs')
const { generateLicenseKey } = require('./lib/license-key.cjs')
const { LANGS, LAYOUT, postsFor, lobbyEmbed } = require('./lib/discord-locale.cjs')
const { METHODS, copyFor } = require('./lib/pay-copy.cjs')
const payments = require('./lib/payments.cjs')
const { ensureEmojis, emojiFor, emojiMention } = require('./lib/discord-emojis.cjs')

const token = process.env.DISCORD_BOT_TOKEN || ''
const clientId = process.env.DISCORD_CLIENT_ID || process.env.TOMZ_DISCORD_CLIENT_ID || '1548162530260684810'
const guildId = process.env.DISCORD_GUILD_ID || ''
const adminIds = new Set(
  String(process.env.DISCORD_ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
)

if (!token || !guildId) {
  console.error('Faltan DISCORD_BOT_TOKEN o DISCORD_GUILD_ID.')
  console.error('Copia .env.example a .env y completa el token y el ID del server.')
  process.exit(1)
}

function canRunUser(userId, guild, member, memberPermissions) {
  if (adminIds.has(userId)) return true
  if (guild?.ownerId === userId) return true
  if (memberPermissions?.has(PermissionFlagsBits.Administrator)) return true
  if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return true
  return false
}

function langOf(member) {
  if (!member?.roles?.cache) return 'es'
  for (const [code, spec] of Object.entries(LANGS)) {
    if (member.roles.cache.some((r) => r.name === spec.role)) return code
  }
  return 'es'
}

const commands = [
  new SlashCommandBuilder()
    .setName('key')
    .setDescription('Genera una key de Tomz Boost.')
    .addUserOption((opt) =>
      opt.setName('usuario').setDescription('Si lo pones, el bot le manda la key por DM').setRequired(false)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Crea categorias, roles de idioma y el selector.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('comprar')
    .setDescription('Pagar Tomz Boost (Pix, Mercado Pago, Stripe o crypto).')
    .addStringOption((opt) =>
      opt
        .setName('metodo')
        .setDescription('Medio de pago')
        .setRequired(true)
        .addChoices(
          { name: 'Argentina · Mercado Pago', value: 'ar' },
          { name: 'Brasil · Pix', value: 'br' },
          { name: 'Internacional · Stripe', value: 'stripe' },
          { name: 'Crypto · USDT/BTC', value: 'crypto' }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName('producto')
        .setDescription('Que esta comprando')
        .setRequired(false)
        .addChoices({ name: 'App Tomz Boost', value: 'app' }, { name: 'Optimizacion 1 a 1', value: 'custom' })
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('pagado')
    .setDescription('Marca un pago como cobrado y manda la key (admin).')
    .addStringOption((opt) => opt.setName('id').setDescription('ID del pago').setRequired(false))
    .addUserOption((opt) => opt.setName('usuario').setDescription('Ultimo pago pendiente de este usuario').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('pendientes')
    .setDescription('Lista pagos abiertos (admin).')
    .toJSON()
]

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token)
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
  console.log('Comandos /key /setup /comprar /pagado /pendientes registrados.')
}

async function ensureRole(guild, name) {
  const existing = guild.roles.cache.find((r) => r.name === name)
  if (existing) return existing
  return guild.roles.create({
    name,
    mentionable: false,
    hoist: false,
    reason: 'Idioma Tomz Boost'
  })
}

async function ensureLangRoles(guild) {
  const roles = {}
  for (const [code, spec] of Object.entries(LANGS)) {
    roles[code] = await ensureRole(guild, spec.role)
  }
  return roles
}

function withEmoji(button, key) {
  const emoji = emojiFor(key)
  if (emoji) button.setEmoji(emoji)
  return button
}

function langButtons() {
  const row = new ActionRowBuilder()
  for (const [code, spec] of Object.entries(LANGS)) {
    row.addComponents(
      withEmoji(
        new ButtonBuilder().setCustomId(`lang:${code}`).setLabel(spec.button).setStyle(ButtonStyle.Primary),
        code
      )
    )
  }
  return row
}

function payMethod(id) {
  return id === 'usdt' ? 'crypto' : id
}

function parseBuy(customId) {
  const parts = String(customId).split(':')
  if (parts[0] !== 'buy') return null
  if (parts.length === 3) {
    return { product: parts[1] === 'custom' ? 'custom' : 'app', method: payMethod(parts[2]) }
  }
  return { product: 'app', method: payMethod(parts[1]) }
}

function payRow(product) {
  const ready = payments.configured(product)
  const row = new ActionRowBuilder()
  const buttons = [
    { key: 'ar', method: 'ar', label: 'Mercado Pago' },
    { key: 'br', method: 'br', label: 'Pix' },
    { key: 'stripe', method: 'stripe', label: 'Stripe' },
    { key: 'crypto', method: 'crypto', label: 'Bitcoin' },
    { key: 'usdt', method: 'crypto', label: 'USDT' }
  ]
  for (const btn of buttons) {
    row.addComponents(
      withEmoji(
        new ButtonBuilder()
          .setCustomId(`buy:${product}:${btn.key}`)
          .setLabel(btn.label)
          .setStyle(product === 'custom' ? ButtonStyle.Primary : ButtonStyle.Success)
          .setDisabled(!ready[btn.method]),
        btn.key
      )
    )
  }
  return row
}

function priceLines(product) {
  const ready = payments.configured(product)
  return ['ar', 'br', 'stripe', 'crypto'].map((method) => {
    const spec = METHODS[method]
    const quote = payments.money(method, product)
    const icons = method === 'crypto' ? `${emojiMention('crypto')} ${emojiMention('usdt')}` : emojiMention(method)
    if (!ready[method]) return `${icons} ${spec.label} · no configurado`
    return `${icons} ${spec.label} · **${quote.label}**`
  })
}

function flowLang(code) {
  return code === 'en' || code === 'pt' ? code : 'es'
}

function quoteFor(lang, product) {
  const preferred = lang === 'pt' ? 'br' : lang === 'en' ? 'stripe' : 'ar'
  const first = payments.money(preferred, product)
  if (first.amount) return first.label
  for (const method of ['ar', 'br', 'stripe', 'crypto']) {
    const alt = payments.money(method, product)
    if (alt.amount) return alt.label
  }
  return '—'
}

function flowLangRow() {
  const row = new ActionRowBuilder()
  for (const [code, spec] of Object.entries(LANGS)) {
    row.addComponents(
      withEmoji(
        new ButtonBuilder().setCustomId(`flow:lang:${code}`).setLabel(spec.button).setStyle(ButtonStyle.Primary),
        code
      )
    )
  }
  return row
}

function flowEmbed() {
  return new EmbedBuilder()
    .setColor(0x0080ff)
    .setTitle('TOMZ BOOST · Agendar')
    .setDescription(
      [
        'Elegi tu idioma para empezar.',
        'Choose your language to start.',
        'Escolha seu idioma para começar.',
        '',
        'Requisito: Windows original. Sesion 1 a 1: AnyDesk.'
      ].join('\n')
    )
}

function serviceRow(lang) {
  const code = flowLang(lang)
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`svc:app:${code}`).setLabel('App').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`svc:custom:${code}`).setLabel('1 a 1').setStyle(ButtonStyle.Primary)
  )
}

function serviceEmbed(lang) {
  const copy = copyFor(lang)
  return new EmbedBuilder()
    .setColor(0x0080ff)
    .setTitle(copy.pickService)
    .setDescription(
      [
        `**1. ${copy.productApp} — ${quoteFor(lang, 'app')}**`,
        copy.productAppDesc,
        '',
        `**2. ${copy.productCustom} — ${quoteFor(lang, 'custom')}**`,
        copy.productCustomDesc,
        '',
        copy.req
      ].join('\n')
    )
}

function productPayEmbed(product, copy) {
  const custom = product === 'custom'
  return new EmbedBuilder()
    .setColor(0x0080ff)
    .setTitle(custom ? copy.productCustom : copy.productApp)
    .setDescription([custom ? copy.payHintCustom : copy.payHintApp, '', ...priceLines(product)].join('\n'))
}

function ticketRow() {
  return new ActionRowBuilder().addComponents(
    withEmoji(new ButtonBuilder().setCustomId('ticket:pt').setLabel('Abrir ticket').setStyle(ButtonStyle.Primary), 'pt'),
    withEmoji(new ButtonBuilder().setCustomId('ticket:en').setLabel('Open ticket').setStyle(ButtonStyle.Secondary), 'en'),
    withEmoji(new ButtonBuilder().setCustomId('ticket:es').setLabel('Abrir ticket').setStyle(ButtonStyle.Secondary), 'es')
  )
}

function ticketEmbed() {
  return new EmbedBuilder()
    .setColor(0x0080ff)
    .setTitle('TOMZ BOOST · Soporte')
    .setDescription(
      [
        '¿Duda? Abrí un ticket.',
        'Need help? Open a ticket.',
        'Precisa de ajuda? Abra um ticket.',
        '',
        'Antes: **faq**',
        'Para contratar: **agendar**'
      ].join('\n')
    )
}

function publicOverwrites(guild, readonly) {
  return [
    {
      id: guild.roles.everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        ...(readonly ? [] : [PermissionFlagsBits.SendMessages])
      ],
      deny: readonly ? [PermissionFlagsBits.SendMessages] : []
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ]
}

function communityOverwrites(guild, langRole) {
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: langRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages
      ]
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ]
}

async function refreshPosts(ch, key) {
  const pricesByLang = {
    es: { app: quoteFor('es', 'app'), custom: quoteFor('es', 'custom') },
    en: { app: quoteFor('en', 'app'), custom: quoteFor('en', 'custom') },
    pt: { app: quoteFor('pt', 'app'), custom: quoteFor('pt', 'custom') }
  }
  const packs = postsFor(key, pricesByLang)
  if (!packs.length) return
  const mine = (await ch.messages.fetch({ limit: 40 })).filter(
    (m) => m.author.id === guildClientId(ch) || m.type === MessageType.ChannelPinnedMessage
  )
  for (const old of mine.values()) await old.delete().catch(() => undefined)
  for (const pack of packs) {
    const msg = await ch.send({ content: pack.content, embeds: pack.embeds })
    await msg.pin().catch(() => undefined)
  }
  const noise = (await ch.messages.fetch({ limit: 15 })).filter((m) => m.type === MessageType.ChannelPinnedMessage)
  for (const old of noise.values()) await old.delete().catch(() => undefined)
}

async function pinBotMessage(ch, payload) {
  const mine = (await ch.messages.fetch({ limit: 40 })).filter(
    (m) => m.author.id === guildClientId(ch) || m.type === MessageType.ChannelPinnedMessage
  )
  for (const old of mine.values()) await old.delete().catch(() => undefined)
  const msg = await ch.send(payload)
  await msg.pin().catch(() => undefined)
  const noise = (await ch.messages.fetch({ limit: 15 })).filter((m) => m.type === MessageType.ChannelPinnedMessage)
  for (const old of noise.values()) await old.delete().catch(() => undefined)
}

async function postFlowMessage(ch) {
  await pinBotMessage(ch, { embeds: [flowEmbed()], components: [flowLangRow()] })
}

async function postTicketMessage(ch) {
  await pinBotMessage(ch, { embeds: [ticketEmbed()], components: [ticketRow()] })
}

function guildClientId(ch) {
  return ch.client.user.id
}

async function setupLobby(guild) {
  let cat = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === 'Welcome')
  if (!cat) {
    cat = await guild.channels.create({ name: 'Welcome', type: ChannelType.GuildCategory })
  }
  let ch = guild.channels.cache.find((c) => c.parentId === cat.id && c.name === '🌐・idioma')
  if (!ch) {
    ch = await guild.channels.create({
      name: '🌐・idioma',
      type: ChannelType.GuildText,
      parent: cat.id,
      topic: 'Elegi tu idioma / Choose your language / Escolha seu idioma',
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          deny: [PermissionFlagsBits.SendMessages]
        },
        {
          id: guild.members.me.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages]
        }
      ]
    })
  }
  const mine = (await ch.messages.fetch({ limit: 20 })).filter((m) => m.author.id === ch.client.user.id)
  for (const old of mine.values()) await old.delete().catch(() => undefined)
  await ch.send({ embeds: [lobbyEmbed()], components: [langButtons()] })
}

async function setupGuild(guild) {
  await guild.members.fetchMe()
  const rest = new REST({ version: '10' }).setToken(token)
  await ensureEmojis({ rest, clientId, guild })
  const roles = await ensureLangRoles(guild)
  const created = []
  await setupLobby(guild)
  const retired = ['📄・tos', '🛠️・personalizado', '💰・precios', '📋・changelog']
  for (const name of retired) {
    const old = guild.channels.cache.find((c) => c.name === name)
    if (old) await old.delete().catch(() => undefined)
  }

  for (const category of LAYOUT) {
    let cat = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === category.name)
    if (!cat) {
      cat = await guild.channels.create({ name: category.name, type: ChannelType.GuildCategory })
    }
    for (const channel of category.channels) {
      let ch = guild.channels.cache.find((c) => c.parentId === cat.id && c.name === channel.name)
      if (!ch) {
        ch = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === channel.name)
        if (ch && ch.parentId !== cat.id) {
          await ch.setParent(cat.id).catch(() => undefined)
          created.push(`#${channel.name} (movido)`)
        }
      }
      if (!ch) {
        ch = await guild.channels.create({
          name: channel.name,
          type: ChannelType.GuildText,
          parent: cat.id,
          topic: channel.topic,
          permissionOverwrites: publicOverwrites(guild, channel.readonly)
        })
        created.push(`#${channel.name}`)
      } else {
        await ch.permissionOverwrites.set(publicOverwrites(guild, channel.readonly))
      }
      if (channel.post) await refreshPosts(ch, channel.post)
      if (channel.flow) await postFlowMessage(ch)
      if (channel.tickets) await postTicketMessage(ch)
    }
  }

  let community = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === 'Comunidad')
  if (!community) {
    community = await guild.channels.create({ name: 'Comunidad', type: ChannelType.GuildCategory })
  }
  for (const [code, spec] of Object.entries(LANGS)) {
    let ch = guild.channels.cache.find((c) => c.parentId === community.id && c.name === spec.community)
    if (!ch) {
      ch = await guild.channels.create({
        name: spec.community,
        type: ChannelType.GuildText,
        parent: community.id,
        topic: spec.topic,
        permissionOverwrites: communityOverwrites(guild, roles[code])
      })
      created.push(`#${spec.community}`)
    } else {
      await ch.permissionOverwrites.set(communityOverwrites(guild, roles[code]))
    }
  }

  return created
}

async function assignLang(guild, userId, code) {
  const spec = LANGS[code]
  if (!spec) return null
  const member = await guild.members.fetch(userId)
  const roles = await ensureLangRoles(guild)
  for (const [lang, role] of Object.entries(roles)) {
    if (lang === code) await member.roles.add(role).catch(() => undefined)
    else await member.roles.remove(role).catch(() => undefined)
  }
  return spec
}

async function setMemberLang(interaction, code) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const spec = await assignLang(interaction.guild, interaction.user.id, code)
  if (!spec) return
  await interaction.editReply(spec.picked)
}

async function openTicket(interaction, lang) {
  const copy = copyFor(lang)
  const guild = interaction.guild
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  let cat = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === 'Tickets')
  if (!cat) cat = await guild.channels.create({ name: 'Tickets', type: ChannelType.GuildCategory })
  const existing = guild.channels.cache.find(
    (c) => c.parentId === cat.id && String(c.topic || '') === `ticket:${interaction.user.id}`
  )
  if (existing) {
    await interaction.editReply(`${copy.ticketExists} ${existing}`)
    return
  }
  const allow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory
  ]
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow },
    {
      id: guild.members.me.id,
      allow: [...allow, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages]
    }
  ]
  if (guild.ownerId) overwrites.push({ id: guild.ownerId, allow })
  for (const id of adminIds) overwrites.push({ id, allow })
  const name = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90)
  const ch = await guild.channels.create({
    name: name || 'ticket',
    type: ChannelType.GuildText,
    parent: cat.id,
    topic: `ticket:${interaction.user.id}`,
    permissionOverwrites: overwrites
  })
  await ch.send({ content: `${copy.ticketHello} <@${interaction.user.id}>` })
  await interaction.editReply(`${copy.ticketOpen} ${ch}`)
}

async function replySetupResult(send, guild) {
  const created = await setupGuild(guild)
  const extra = created.length ? `\nCreados: ${created.join(', ')}` : '\nCanales listos. Textos y permisos actualizados.'
  const appPays = Object.entries(payments.configured('app'))
    .filter(([, on]) => on)
    .map(([id]) => METHODS[id].label)
  const customPays = Object.entries(payments.configured('custom'))
    .filter(([, on]) => on)
    .map(([id]) => METHODS[id].label)
  const payLine = [
    appPays.length ? `App: ${appPays.join(' · ')}` : 'App: completa PRICE_* y tokens.',
    customPays.length
      ? `Sesion 1 a 1: ${customPays.join(' · ')}`
      : 'Sesion 1 a 1: completa PRICE_CUSTOM_* (otro precio).'
  ].join('\n')
  await send(
    `Listo. En cada canal oficial hay 3 mensajes (español, english, português). Comunidad: 3 chats.${extra}\n${payLine}`
  )
}

async function notifyAdmins(text) {
  const ids = new Set(adminIds)
  try {
    const guild = await client.guilds.fetch(guildId)
    if (guild.ownerId) ids.add(guild.ownerId)
  } catch {
    /* seguir con DISCORD_ADMIN_IDS */
  }
  for (const id of ids) {
    try {
      const user = await client.users.fetch(id)
      await user.send(text)
    } catch {
      /* DMs cerrados */
    }
  }
}

const delivering = new Set()

async function deliverPaidOrder(order) {
  if (!order) return
  if (order.status !== 'paid' || (order.product !== 'custom' && !order.licenseKey)) payments.fulfill(order)
  if (order.delivered || delivering.has(order.id)) return
  delivering.add(order.id)
  try {
    await finishDelivery(order)
  } finally {
    delivering.delete(order.id)
  }
}

async function finishDelivery(order) {
  if (order.delivered) return
  const copy = copyFor(order.lang)
  const custom = order.product === 'custom'
  const dmText = custom ? copy.paidCustomDm : copy.paidDm.replace('{key}', order.licenseKey || '')
  let dmOk = false
  try {
    const user = await client.users.fetch(order.userId)
    await user.send(dmText)
    dmOk = true
  } catch {
    dmOk = false
  }
  payments.markDelivered(order, dmOk)
  const spec = METHODS[order.method] || { label: order.method }
  const productLabel = custom ? 'Optimizacion 1 a 1' : 'App'
  await notifyAdmins(
    [
      `Pago acreditado · ${productLabel} · ${spec.label}`,
      `<@${order.userId}> · ${order.quoteLabel || `${order.currency} ${order.amount}`}`,
      custom ? 'Sesion 1 a 1. Coordinar horario.' : '```' + (order.licenseKey || '') + '```',
      dmOk ? 'Aviso enviado por DM.' : 'No se pudo mandar DM.'
    ].join('\n')
  )
}

async function sendPayment(interaction, method, product) {
  const lang = langOf(interaction.member)
  const copy = copyFor(lang)
  const kind = product === 'custom' ? 'custom' : 'app'
  if (!payments.configured(kind)[method]) {
    await interaction.editReply(copy.missingMethod)
    return
  }
  try {
    const { order, quote, qrBuffer } = await payments.createPayment({
      method,
      userId: interaction.user.id,
      lang,
      product: kind
    })
    const methodCopy = copy[method]
    const pix = order.copyPaste ? `Pix Copia e Cola:\n\`\`\`${order.copyPaste}\`\`\`` : ''
    const embed = new EmbedBuilder()
      .setColor(0x0080ff)
      .setTitle(`${kind === 'custom' ? copy.productCustom : copy.productApp} · ${methodCopy.title}`)
      .setDescription(
        [
          methodCopy.body,
          '',
          `**${quote.label}**`,
          order.url ? `[Pagar](${order.url})` : '',
          kind === 'custom' ? copy.pendingCustom : copy.pendingApp,
          `\`${order.id}\``
        ]
          .filter(Boolean)
          .join('\n')
      )
    const files = []
    if (qrBuffer) {
      files.push(new AttachmentBuilder(qrBuffer, { name: 'pago.png' }))
      embed.setImage('attachment://pago.png')
    }
    await interaction.editReply({ content: pix || null, embeds: [embed], files })
  } catch (err) {
    await interaction.editReply(`No pude generar el pago.\n${String(err.message || err)}`)
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
})

client.on('ready', async () => {
  console.log(`Bot listo: ${client.user?.tag}`)
  console.log('Corre /setup para textos, idioma y botones de compra.')
  const appReady = payments.configured('app')
  const customReady = payments.configured('custom')
  console.log(
    'Pagos app:',
    Object.entries(appReady)
      .map(([k, on]) => `${k}:${on ? 'on' : 'off'}`)
      .join(' · ')
  )
  console.log(
    'Pagos sesion 1 a 1:',
    Object.entries(customReady)
      .map(([k, on]) => `${k}:${on ? 'on' : 'off'}`)
      .join(' · ')
  )
  try {
    const rest = new REST({ version: '10' }).setToken(token)
    const guild = await client.guilds.fetch(guildId)
    await ensureEmojis({ rest, clientId, guild })
  } catch (err) {
    console.warn('Emojis PNG:', err.message || err)
  }
  payments.startPoller((order) => deliverPaidOrder(order))
  payments.startWebhookServer((order) => deliverPaidOrder(order))
})

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return
  const mentioned = client.user ? msg.mentions.has(client.user) : false
  const text = String(msg.content || '')
    .replace(/<@!?\d+>/g, '')
    .trim()
    .toLowerCase()
  if (!(mentioned && (text === 'setup' || text === '!setup' || text === '/setup'))) return
  if (!canRunUser(msg.author.id, msg.guild, msg.member)) {
    await msg.reply(`No tenes permiso para este comando.\nTu ID es \`${msg.author.id}\`.`)
    return
  }
  const pending = await msg.reply('Creando canales…')
  try {
    await replySetupResult((text) => pending.edit(text), msg.guild)
  } catch (err) {
    await pending.edit(
      `Fallo el setup. El bot necesita Administrar canales y Administrar roles.\n${String(err)}`
    )
  }
})

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith('lang:')) {
      await setMemberLang(interaction, interaction.customId.slice(5))
      return
    }

    if (interaction.isButton() && interaction.customId.startsWith('flow:lang:')) {
      const lang = flowLang(interaction.customId.slice(10))
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      await assignLang(interaction.guild, interaction.user.id, lang)
      await interaction.editReply({ embeds: [serviceEmbed(lang)], components: [serviceRow(lang)] })
      return
    }

    if (interaction.isButton() && interaction.customId.startsWith('svc:')) {
      const parts = interaction.customId.split(':')
      const product = parts[1] === 'custom' ? 'custom' : 'app'
      const lang = flowLang(parts[2] || langOf(interaction.member))
      const copy = copyFor(lang)
      const ready = payments.configured(product)
      if (!Object.values(ready).some(Boolean)) {
        await interaction.reply({ content: copy.missingMethod, flags: MessageFlags.Ephemeral })
        return
      }
      await interaction.reply({
        embeds: [productPayEmbed(product, copy)],
        components: [payRow(product)],
        flags: MessageFlags.Ephemeral
      })
      return
    }

    if (interaction.isButton() && interaction.customId.startsWith('ticket:')) {
      await openTicket(interaction, flowLang(interaction.customId.slice(7)))
      return
    }

    if (interaction.isButton() && interaction.customId.startsWith('buy:')) {
      const parsed = parseBuy(interaction.customId)
      const lang = langOf(interaction.member)
      if (!parsed || !payments.configured(parsed.product)[parsed.method]) {
        await interaction.reply({ content: copyFor(lang).missingMethod, flags: MessageFlags.Ephemeral })
        return
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      await sendPayment(interaction, parsed.method, parsed.product)
      return
    }

    if (!interaction.isChatInputCommand()) return

    if (interaction.commandName === 'comprar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      await sendPayment(
        interaction,
        interaction.options.getString('metodo', true),
        interaction.options.getString('producto') || 'app'
      )
      return
    }

    if (!canRunUser(interaction.user.id, interaction.guild, interaction.member, interaction.memberPermissions)) {
      await interaction.reply({
        content: `No tenes permiso para este comando.\nTu ID es \`${interaction.user.id}\`.`,
        flags: MessageFlags.Ephemeral
      })
      return
    }

    if (interaction.commandName === 'setup') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      await replySetupResult((text) => interaction.editReply(text), interaction.guild)
      return
    }

    if (interaction.commandName === 'pendientes') {
      const rows = payments.listPending()
      if (!rows.length) {
        await interaction.reply({ content: 'No hay pagos abiertos.', flags: MessageFlags.Ephemeral })
        return
      }
      const text = rows
        .slice(0, 15)
        .map((o) => `• \`${o.id}\` · ${o.product || 'app'} · ${o.method} · <@${o.userId}> · ${o.currency} ${o.amount}`)
        .join('\n')
      await interaction.reply({ content: text, flags: MessageFlags.Ephemeral })
      return
    }

    if (interaction.commandName === 'pagado') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const id = interaction.options.getString('id')
      const user = interaction.options.getUser('usuario')
      let order = id ? payments.getOrder(id) || payments.findByExternal(id) : null
      if (!order && user) order = payments.latestPendingForUser(user.id)
      if (!order) {
        await interaction.editReply('No encontre ese pago. Pasa el ID o el usuario.')
        return
      }
      payments.fulfill(order)
      order.delivered = false
      await deliverPaidOrder(order)
      await interaction.editReply(
        order.product === 'custom'
          ? 'Marcado como pagado. Sesion 1 a 1: coordina por DM.'
          : `Marcado como pagado. Key:\n\`\`\`${order.licenseKey}\`\`\``
      )
      return
    }

    if (interaction.commandName !== 'key') return

    const key = generateLicenseKey()
    const target = interaction.options.getUser('usuario')

    if (target) {
      try {
        await target.send(`Tu key de **Tomz Boost**:\n\`\`\`${key}\`\`\`\nPegala en la app y listo.`)
        await interaction.reply({
          content: `Key generada y enviada por DM a ${target}.\n\`\`\`${key}\`\`\``,
          flags: MessageFlags.Ephemeral
        })
      } catch {
        await interaction.reply({
          content: `No pude mandarle DM a ${target}. Key para que se la pases vos:\n\`\`\`${key}\`\`\``,
          flags: MessageFlags.Ephemeral
        })
      }
      return
    }

    await interaction.reply({ content: `\`\`\`${key}\`\`\``, flags: MessageFlags.Ephemeral })
  } catch (err) {
    const text = `Error: ${String(err.message || err)}`
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(text).catch(() => undefined)
    } else {
      await interaction.reply({ content: text, flags: MessageFlags.Ephemeral }).catch(() => undefined)
    }
  }
})

registerCommands()
  .then(() => client.login(token))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

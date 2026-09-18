const { EmbedBuilder } = require('discord.js')

const ACCENT = 0x0080ff

function embed(title, description, footer) {
  const e = new EmbedBuilder().setColor(ACCENT).setTitle(title).setDescription(description)
  if (footer) e.setFooter({ text: footer })
  return e
}

function fields(title, description, items, footer) {
  const e = new EmbedBuilder().setColor(ACCENT).setTitle(title)
  if (description) e.setDescription(description)
  if (items?.length) e.addFields(items)
  if (footer) e.setFooter({ text: footer })
  return e
}

const LANGS = {
  es: {
    role: 'Español',
    button: 'Español',
    emoji: '🇪🇸',
    picked: 'Listo. Ya podes escribir en el canal de comunidad en español.',
    community: '🇪🇸・español',
    topic: 'Chat de la comunidad en español'
  },
  en: {
    role: 'English',
    button: 'English',
    emoji: '🇺🇸',
    picked: 'Done. You can chat in the English community channel.',
    community: '🇺🇸・english',
    topic: 'English community chat'
  },
  pt: {
    role: 'Português',
    button: 'Português',
    emoji: '🇧🇷',
    picked: 'Pronto. Já podes falar no canal da comunidade em português.',
    community: '🇧🇷・portugues',
    topic: 'Chat da comunidade em português'
  }
}

const LAYOUT = [
  {
    name: 'Inicio',
    channels: [
      { name: '📜・reglas', topic: 'Reglas / Rules / Regras', readonly: true, post: 'reglas' },
      { name: '❓・faq', topic: 'FAQ', readonly: true, post: 'faq' }
    ]
  },
  {
    name: 'Producto',
    channels: [
      { name: '⚡・como-funciona', topic: 'Como funciona / How it works / Como funciona', readonly: true, post: 'como' },
      { name: '📅・agendar', topic: 'Elegi y paga', readonly: true, flow: true },
      { name: '💿・descargas', topic: 'Descargas / Downloads', readonly: true, post: 'descargas' },
      { name: '🎫・ticket', topic: 'Soporte / Support / Suporte', readonly: true, tickets: true },
      { name: '⭐・reviews', topic: 'Reviews', readonly: false }
    ]
  },
  {
    name: 'Novedades',
    channels: [
      { name: '📢・anuncios', topic: 'Anuncios / Announcements / Anúncios', readonly: true, post: 'anuncios' }
    ]
  }
]

const POSTS = {
  es: {
    reglas: [
      fields(
        'TOMZ BOOST · Reglas',
        '',
        [
          {
            name: 'COMPRA',
            value: [
              '1. El precio es final y no se negocia.',
              '2. Un pago equivale a un servicio. Sin compartir, revender ni transferir.',
              '3. Sin reembolso despues de entregar.',
              '4. Chargeback o disputa = ban permanente.'
            ].join('\n')
          },
          {
            name: 'SESION',
            value: [
              '5. En la 1 a 1 tenes que estar en la PC durante toda la sesion (AnyDesk).',
              '6. Windows original.',
              '7. Problema de hardware no esta cubierto: esto es software.',
              '8. Si cambias lo aplicado y se rompe, el retrabajo no es gratis.'
            ].join('\n')
          },
          {
            name: 'CONVIVENCIA',
            value: [
              '9. Respeto con todos. Sin ofensas, spam ni discriminacion.',
              '10. Duda general va al chat, no abras ticket para eso.',
              '11. Cero soporte a cheats.',
              '12. Prohibido compartir, revender o filtrar la app y los metodos.',
              '13. No compartas datos personales de otro miembro.'
            ].join('\n')
          }
        ],
        'Romper una regla = ban. Sin excepcion.'
      )
    ],
    faq: [
      embed(
        'TOMZ BOOST · FAQ',
        [
          '**Como activo?** Pagas, te llega la key, la pegas en la app.',
          '**Que es la sesion 1 a 1?** Sesion conmigo por AnyDesk. Se pide en **agendar**.',
          '**La key es por HWID?** Si. Entra en ese PC. Si cambia placa/CPU o usa spoofer, no entra.',
          '**Requisito?** Windows original.',
          '**Mejora el ping?** No. Eso es ISP.'
        ].join('\n')
      )
    ],
    como: [],
    anuncios: [embed('TOMZ BOOST', 'Lee **reglas**, **como-funciona** y **agendar**.')],
    descargas: [embed('TOMZ BOOST · Descargas', 'Cuando este el instalador, el link va aca.')]
  },
  en: {
    reglas: [
      fields(
        'TOMZ BOOST · Rules',
        '',
        [
          {
            name: 'PURCHASE',
            value: [
              '1. The price is final and not negotiable.',
              '2. One payment = one service. No sharing, reselling, or transferring.',
              '3. No refund after delivery.',
              '4. Chargeback or dispute = permanent ban.'
            ].join('\n')
          },
          {
            name: 'SESSION',
            value: [
              '5. For 1-to-1 you must be at the PC for the whole session (AnyDesk).',
              '6. Original Windows.',
              '7. Hardware issues are not covered — this is software.',
              '8. If you change what was applied and it breaks, rework is not free.'
            ].join('\n')
          },
          {
            name: 'CONDUCT',
            value: [
              '9. Respect everyone. No insults, spam, or discrimination.',
              '10. General questions go in chat — don’t open a ticket for that.',
              '11. Zero cheat support.',
              '12. Sharing, reselling, or leaking the app or methods is forbidden.',
              '13. Don’t share another member’s personal data.'
            ].join('\n')
          }
        ],
        'Breaking a rule = ban. No exceptions.'
      )
    ],
    faq: [
      embed(
        'TOMZ BOOST · FAQ',
        [
          '**How do I activate?** Pay, get the key, paste it in the app.',
          '**What’s the 1-to-1 session?** A session with me over AnyDesk. Start in **agendar**.',
          '**Is the key HWID-bound?** Yes. It works on that PC. Motherboard/CPU swap or a spoofer cuts access.',
          '**Requirement?** Original Windows.',
          '**Does ping improve?** No. That’s your ISP.'
        ].join('\n')
      )
    ],
    como: [],
    anuncios: [embed('TOMZ BOOST', 'Read **rules**, **how-it-works**, and **agendar**.')],
    descargas: [embed('TOMZ BOOST · Downloads', 'The installer link goes here when it’s ready.')]
  },
  pt: {
    reglas: [
      fields(
        'TOMZ BOOST · Regras',
        '',
        [
          {
            name: 'COMPRA',
            value: [
              '1. O preço é final e não se negocia.',
              '2. Um pagamento equivale a um serviço. Sem compartilhar, revender ou transferir.',
              '3. Sem reembolso depois da entrega.',
              '4. Chargeback ou disputa = ban permanente.'
            ].join('\n')
          },
          {
            name: 'SESSÃO',
            value: [
              '5. Na 1 a 1 você precisa estar no PC durante toda a sessão (AnyDesk).',
              '6. Windows original.',
              '7. Problema de hardware não é coberto: isto é software.',
              '8. Se você alterar o que foi aplicado e quebrar, o retrabalho não é gratuito.'
            ].join('\n')
          },
          {
            name: 'CONVIVÊNCIA',
            value: [
              '9. Respeito com todos. Sem ofensa, spam ou discriminação.',
              '10. Dúvida geral vai no chat, não abra ticket pra isso.',
              '11. Sem suporte a cheat.',
              '12. Compartilhar, revender ou vazar o app e os métodos é proibido.',
              '13. Não compartilhe dados pessoais de outro membro.'
            ].join('\n')
          }
        ],
        'Quebrar uma regra = ban. Sem exceção.'
      )
    ],
    faq: [
      embed(
        'TOMZ BOOST · FAQ',
        [
          '**Como ativo?** Paga, chega a key, cola no app.',
          '**O que é a sessão 1 a 1?** Sessão comigo pelo AnyDesk. Se pede em **agendar**.',
          '**A key é por HWID?** Sim. Entra nesse PC. Troca de placa/CPU ou spoofer corta o acesso.',
          '**Requisito?** Windows original.',
          '**Melhora o ping?** Não. Isso é operadora.'
        ].join('\n')
      )
    ],
    como: [],
    anuncios: [embed('TOMZ BOOST', 'Leia **regras**, **como-funciona** e **agendar**.')],
    descargas: [embed('TOMZ BOOST · Downloads', 'Quando tiver o instalador, o link vai aqui.')]
  }
}

function lobbyEmbed() {
  return embed(
    'TOMZ BOOST',
    [
      'Elegí tu idioma para el **chat de comunidad**.',
      'Choose your language for the **community chat**.',
      'Escolha seu idioma para o **chat da comunidade**.',
      '',
      '🇪🇸 Español   ·   🇺🇸 English   ·   🇧🇷 Português'
    ].join('\n')
  )
}

function langLabel(code) {
  const spec = LANGS[code]
  return `${spec.emoji} **${spec.button}**`
}

function comoPost(lang, prices) {
  const app = prices?.app || '—'
  const custom = prices?.custom || '—'
  if (lang === 'en') {
    return fields(
      'TOMZ BOOST · How it works',
      [
        'Pick a service in **agendar** and pay. For 1-to-1 we set a time and I connect to your PC with AnyDesk.',
        '',
        '> Session via AnyDesk · original Windows',
        '',
        '**THE SERVICES**',
        `**App Tomz Boost** · ${app}`,
        'Real tweaks, Recommended, and profiles.',
        '╰ Key by DM',
        '',
        `**1-to-1 optimization** · ${custom}`,
        'A session with me on your PC, via AnyDesk.',
        '╰ App + what your setup actually needs',
        '',
        '**THE SESSION**',
        'Restore point before anything is changed.',
        'You see every click. Close AnyDesk and the session ends.',
        'I don’t open your files, folders, or browser.',
        '',
        '**THE APP**',
        'Pay, get the key, paste it.',
        'The key is HWID-bound: it works while that hardware stays the same. Motherboard/CPU swap or a spoofer cuts access. After a format, the same key.'
      ].join('\n'),
      [
        {
          name: 'What I don’t do',
          value: 'I don’t promise an FPS number or turn weak hardware into good parts. If the machine is limited by the parts, I say so.',
          inline: true
        },
        {
          name: 'To start',
          value: 'Original Windows.\nAnyDesk installed for the 1-to-1.\nPick the service in **agendar**.',
          inline: true
        }
      ],
      'No prices over DM — the listed price is the price.'
    )
  }
  if (lang === 'pt') {
    return fields(
      'TOMZ BOOST · Como funciona',
      [
        'Escolha o serviço em **agendar** e pague. Na 1 a 1 marcamos o horário e eu entro no seu PC pelo AnyDesk.',
        '',
        '> Sessão via AnyDesk · Windows original',
        '',
        '**OS SERVIÇOS**',
        `**App Tomz Boost** · ${app}`,
        'Tweaks reais, Recomendados e perfis.',
        '╰ Key no DM',
        '',
        `**Otimização 1 a 1** · ${custom}`,
        'Sessão comigo no seu PC, pelo AnyDesk.',
        '╰ App + o que o seu setup precisa',
        '',
        '**A SESSÃO**',
        'Ponto de restauração antes de mexer em qualquer coisa.',
        'Você vê cada clique. Fechou o AnyDesk, acabou o acesso.',
        'Não abro arquivo, pasta nem navegador.',
        '',
        '**O APP**',
        'Paga, chega a key, cola.',
        'A key é por HWID: entra enquanto o hardware for o mesmo. Troca de placa/CPU ou spoofer corta o acesso. Se formatar, a mesma key.'
      ].join('\n'),
      [
        {
          name: 'O que eu não faço',
          value: 'Não prometo número de FPS nem transformo hardware fraco em bom. Se a máquina é limitada pelas peças, eu digo.',
          inline: true
        },
        {
          name: 'Pra começar',
          value: 'Windows original.\nAnyDesk instalado pra 1 a 1.\nEscolha o serviço em **agendar**.',
          inline: true
        }
      ],
      'Sem preço por DM — o preço listado é o preço.'
    )
  }
  return fields(
    'TOMZ BOOST · Como funciona',
    [
      'Elegi el servicio en **agendar** y paga. Si es 1 a 1, coordinamos el horario y entro a tu PC por AnyDesk.',
      '',
      '> Sesion por AnyDesk · Windows original',
      '',
      '**LOS SERVICIOS**',
      `**App Tomz Boost** · ${app}`,
      'Tweaks reales, Recomendados y perfiles.',
      '╰ Key por DM',
      '',
      `**Optimizacion 1 a 1** · ${custom}`,
      'Sesion conmigo en tu PC, por AnyDesk.',
      '╰ App + lo que corresponda a tu setup',
      '',
      '**COMO ES LA SESION**',
      'Punto de restauracion antes de tocar nada.',
      'Ves cada click. Cerras AnyDesk y se corta el acceso.',
      'No abro archivos, carpetas ni el navegador.',
      '',
      '**LA APP**',
      'Pagas, te llega la key, la pegas.',
      'La key es por HWID: entra mientras el hardware sea el mismo. Cambio de placa/CPU o spoofer corta el acceso. Si formatea, la misma key.'
    ].join('\n'),
    [
      {
        name: 'Que no hago',
        value: 'No prometo un numero de FPS ni convierto hardware flojo en bueno. Si la maquina esta limitada por las piezas, te lo digo.',
        inline: true
      },
      {
        name: 'Para empezar',
        value: 'Windows original.\nAnyDesk instalado para la 1 a 1.\nElegi el servicio en **agendar**.',
        inline: true
      }
    ],
    'Sin precio por DM — es el publicado.'
  )
}

function postsFor(key, pricesByLang) {
  return ['es', 'en', 'pt']
    .map((lang) => ({
      lang,
      content: langLabel(lang),
      embeds: key === 'como' ? [comoPost(lang, pricesByLang?.[lang])] : POSTS[lang][key] || []
    }))
    .filter((pack) => pack.embeds.length)
}

module.exports = { LANGS, LAYOUT, POSTS, lobbyEmbed, postsFor, ACCENT }

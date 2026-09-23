const METHODS = {
  ar: { id: 'ar', emoji: '🇦🇷', label: 'Argentina · Mercado Pago' },
  br: { id: 'br', emoji: '🇧🇷', label: 'Brasil · Pix' },
  stripe: { id: 'stripe', emoji: '🌍', label: 'Internacional · Stripe' },
  crypto: { id: 'crypto', emoji: '🪙', label: 'Crypto · BTC / USDT' }
}

const PRODUCTS = {
  app: { id: 'app', label: 'Tomz Boost · App' },
  custom: { id: 'custom', label: 'Optimizacion 1 a 1' }
}

const COPY = {
  es: {
    paidDm: 'Pago confirmado. Tu key de **Tomz Boost**:\n```{key}```\nPegala en la app.',
    paidCustomDm: 'Pago confirmado. **Optimizacion 1 a 1**\nTe contacto para el horario. Tené AnyDesk instalado.',
    pendingApp: 'Cuando el pago entre, te mando la key por DM.',
    pendingCustom: 'Cuando el pago entre, te contacto para el horario.',
    pickLang: 'Elegi tu idioma para empezar.',
    pickService: 'Elegi tu servicio.',
    payHintApp: 'Elegi como pagar.',
    payHintCustom: 'Elegi como pagar.',
    productApp: 'App Tomz Boost',
    productAppDesc: 'La app. Te llega la key por DM.',
    productCustom: 'Optimizacion 1 a 1',
    productCustomDesc: 'Sesion conmigo por AnyDesk.',
    req: 'Requisito: Windows original.',
    ticketBtn: 'Abrir ticket',
    ticketHello: 'Contame que pasa.',
    ticketOpen: 'Ticket abierto:',
    ticketExists: 'Ya tenes un ticket abierto:',
    expired: 'Este pago vencio. Genera uno nuevo.',
    missingMethod: 'Ese medio de pago no esta configurado todavia.',
    ar: {
      title: 'Mercado Pago · Argentina',
      body: 'Escanea el QR o abre el link de Checkout Pro.'
    },
    br: {
      title: 'Pix · Brasil',
      body: 'Escaneie o QR ou use Pix Copia e Cola.'
    },
    stripe: {
      title: 'Stripe',
      body: 'Paga con tarjeta en el link o el QR.'
    },
    crypto: {
      title: 'Crypto',
      body: 'Abre el link o escanea el QR.'
    }
  },
  en: {
    paidDm: 'Payment confirmed. Your **Tomz Boost** key:\n```{key}```\nPaste it in the app.',
    paidCustomDm: 'Payment confirmed. **1-to-1 optimization**\nI’ll message you to set a time. Have AnyDesk installed.',
    pendingApp: 'When the payment clears, I DM the key.',
    pendingCustom: 'When the payment clears, I’ll message you to set a time.',
    pickLang: 'Choose your language to start.',
    pickService: 'Pick your service.',
    payHintApp: 'Choose how to pay.',
    payHintCustom: 'Choose how to pay.',
    productApp: 'Tomz Boost app',
    productAppDesc: 'The app. The key is DMed.',
    productCustom: '1-to-1 optimization',
    productCustomDesc: 'A session with me over AnyDesk.',
    req: 'Requirement: original Windows.',
    ticketBtn: 'Open ticket',
    ticketHello: 'Tell me what’s going on.',
    ticketOpen: 'Ticket opened:',
    ticketExists: 'You already have an open ticket:',
    expired: 'This payment expired. Generate a new one.',
    missingMethod: 'That payment method is not configured yet.',
    ar: {
      title: 'Mercado Pago · Argentina',
      body: 'Scan the QR or open the Checkout Pro link.'
    },
    br: {
      title: 'Pix · Brazil',
      body: 'Scan the QR or use Pix copy-and-paste.'
    },
    stripe: {
      title: 'Stripe',
      body: 'Pay by card via the link or the QR.'
    },
    crypto: {
      title: 'Crypto',
      body: 'Open the link or scan the QR.'
    }
  },
  pt: {
    paidDm: 'Pagamento confirmado. Sua key do **Tomz Boost**:\n```{key}```\nCola no app.',
    paidCustomDm: 'Pagamento confirmado. **Otimização 1 a 1**\nTe chamo pra marcar o horário. Tenha o AnyDesk instalado.',
    pendingApp: 'Quando o pagamento entrar, mando a key no DM.',
    pendingCustom: 'Quando o pagamento entrar, te chamo pra marcar o horário.',
    pickLang: 'Escolha seu idioma para começar.',
    pickService: 'Escolha seu serviço.',
    payHintApp: 'Escolha como pagar.',
    payHintCustom: 'Escolha como pagar.',
    productApp: 'App Tomz Boost',
    productAppDesc: 'O app. A key chega no DM.',
    productCustom: 'Otimização 1 a 1',
    productCustomDesc: 'Sessão comigo pelo AnyDesk.',
    req: 'Requisito: Windows original.',
    ticketBtn: 'Abrir ticket',
    ticketHello: 'Conta o que está acontecendo.',
    ticketOpen: 'Ticket aberto:',
    ticketExists: 'Você já tem um ticket aberto:',
    expired: 'Esse pagamento venceu. Gera outro.',
    missingMethod: 'Esse meio de pagamento ainda não está configurado.',
    ar: {
      title: 'Mercado Pago · Argentina',
      body: 'Escaneie o QR ou abra o link do Checkout Pro.'
    },
    br: {
      title: 'Pix · Brasil',
      body: 'Escaneie o QR ou use Pix Copia e Cola.'
    },
    stripe: {
      title: 'Stripe',
      body: 'Pague com cartão pelo link ou pelo QR.'
    },
    crypto: {
      title: 'Crypto',
      body: 'Abra o link ou escaneie o QR.'
    }
  }
}

function copyFor(lang) {
  return COPY[lang] || COPY.es
}

module.exports = { METHODS, PRODUCTS, COPY, copyFor }

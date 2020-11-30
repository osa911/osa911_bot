const dotenv = require('dotenv')
const { Telegraf } = require('telegraf')
const { Keyboard } = require('telegram-keyboard')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const CoinGecko = require('coingecko-api')

dotenv.config()

const CoinGeckoClient = new CoinGecko()
const adapter = new FileSync('XRP_invest_db.json')
const db = low(adapter)
db.defaults({ users: [], xrpPrice: 0 }).write()

const bot = new Telegraf(process.env.BOT_TOKEN)

const greenCircle = '🟢'
const redCircle = '🔴'
let interval

function startSender () {
  if (!interval) {
    interval = setInterval(async () => {
      const price = await getXRPCurrency()
      let prevPrice = db.get(`xrpPrice`).value()
      if (prevPrice === 0) {
        db.set(`xrpPrice`, price).write()
        prevPrice = price
      }
      const diffPercent = (price / prevPrice - 1) * 100
      if (diffPercent > 3 || diffPercent < -3) {
        db.set(`xrpPrice`, price).write()
        db.get('users').value().forEach(({ chatId }) => {
          const circle = diffPercent >= 0 ? greenCircle : redCircle
          const text = `${circle} Price has been changed: ${round(diffPercent)}%${circle}
Look at actual information:${renderShortPortfolio(price)}`
          sendMsg(chatId, text)
        })
      }
    }, 10000)
  }
}

function sendMsg (chatId, text) {
  bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' })
}

function round (number) {
  return Math.floor(number * 100) / 100
}

function renderShortPortfolio (price) {
  const currentDeposit = round(5488 * price)
  const diff = round(currentDeposit - 3527.60)
  return `
Депозит, USD: <b>$3527,60</b>
Кол-во XRP: <b>5488 шт.</b>
Депозит на сейчас: <b>$${currentDeposit}.</b>
Курс на сейчас: <b>$${price}</b>
${diff >= 0
    ? `Доход: <b>$${diff}.</b>`
    : `Убыток: <b>$${diff * -1}</b>
`}
`
}

function renderPortfolio (price) {
  const currentDeposit = round(5488 * price)
  const diff = round(currentDeposit - 3527.60)
  return `
Бюджет, евро: <b>€3000,00</b>
Бюджет, грн: <b>101000,00 грн.</b>
Комисия, грн: <b>895,00 грн.</b>
Депозит, грн: <b>100105,00 грн.</b>
Депозит, USD: <b>$3527,60</b>
Курс покупки, USD: <b>28,38 грн.</b>
Кол-во XRP: <b>5488 шт.</b>
Курс покупки: <b>$0,64215</b>
Депозит на сейчас: <b>$${currentDeposit}.</b>
Курс на сейчас: <b>$${price}</b>
${diff >= 0
    ? `Доход: <b>$${diff}.</b>`
    : `Убыток: <b>$${diff * -1}</b>
`}
`
}

async function getXRPCurrency () {
  let { data } = await CoinGeckoClient.coins.fetch('ripple')
  const { usd } = data.market_data.current_price
  return usd || 0
}

function createNewUser (ctx) {
  db.get(`users`)
    .push({ ...ctx.from, chatId: ctx.chat.id })
    .write()
}

const mainMenu = (ctx, str) => {
  if (!db.get(`users`).find({ chatId: ctx.chat.id }).value()) {
    createNewUser(ctx)
  }

  return ctx.replyWithHTML(
    str || `Hello ${ctx.from.first_name}, use menu for navigation.`,
    Keyboard.builtIn(['🤪 Short status', '😎 Get me full information'], { columns: 1 })
  )
}

bot.start((ctx) => {
  startSender()
  return mainMenu(ctx)
})

bot.hears('🤪 Short status', async (ctx) => {
  const price = await getXRPCurrency()
  const res = await renderShortPortfolio(price)
  return mainMenu(ctx, res)
})

bot.hears('😎 Get me full information', async (ctx) => {
  const price = await getXRPCurrency()
  const res = renderPortfolio(price)
  return mainMenu(ctx, res)
})

bot.command('show', async (ctx) => {
  const price = await getXRPCurrency()
  const res = await renderShortPortfolio(price)
  return ctx.replyWithHTML(res)
})

bot.command('show_all', async (ctx) => {
  const price = await getXRPCurrency()
  const res = await renderPortfolio(price)
  return ctx.replyWithHTML(res)
})

// bot.on('text', async (ctx) => {
//   await ctx.answerCbQuery("I don't want to speak with you human")
//   return false
// })

bot.catch(error => {
  console.log('telegraf error', error.response, error.parameters, error.on || error)
})

bot.use(Telegraf.log())

bot.launch()

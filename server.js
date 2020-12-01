const dotenv = require('dotenv')
const { Telegraf } = require('telegraf')
const { Keyboard } = require('telegram-keyboard')
const { Client } = require('pg')
const CoinGecko = require('coingecko-api')
const express = require('express')
const app = express()

dotenv.config()

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(process.env.PORT || 3000, () => {
  console.log(`App started on http://localhost:${port}`)

  const dbClient = new Client({ connectionString: process.env.DATABASE_URL })
  dbClient.connect()
  const CoinGeckoClient = new CoinGecko()
  const bot = new Telegraf(process.env.BOT_TOKEN)

  const greenCircle = '🟢'
  const redCircle = '🔴'

  let interval

  async function startSender () {
    if (!interval) {
      await sender()
      interval = setInterval(async () => {
        await sender()
      }, 1000 * 60 * 60)
    }
  }

  async function sender () {
    const price = await getXRPCurrency()
    try {
      const { rows } = await dbClient.query('SELECT price FROM "public"."Xrp";', [])
      const { price: dbPrice } = rows[0] || {}
      let prevPrice = +dbPrice
      if (!prevPrice || prevPrice === 0) {
        await dbClient.query('INSERT INTO "public"."Xrp" (price) values ($1);', [price])
        prevPrice = price
      }
      const diffPercent = (price / prevPrice - 1) * 100
      if (diffPercent > 3 || diffPercent < -3) {
        await dbClient.query('Update "public"."Xrp" SET price = $1;', [price])
        const { rows } = await dbClient.query('SELECT chatid FROM "public"."Users";', [])
        rows.forEach(({ chatid: chatId }) => {
          const circle = diffPercent >= 0 ? greenCircle : redCircle
          const text = `${circle} Price has been changed: ${round(diffPercent)}%${circle}
Look at actual information:${renderShortPortfolio(price)}`
          sendMsg(chatId, text)
        })
      }
    } catch (err) {
      console.log('sender db Error', err)
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
    const diffPercent = round((currentDeposit / 3527.60 - 1) * 100)

    return `
Депозит, USD: <b>$3527,60</b>
Депозит на сейчас: <b>$${currentDeposit}.</b>
Курс на сейчас: <b>$${price}</b>
${diff >= 0
      ? `Доход: <b>$${diff} или ${diffPercent}%.</b>`
      : `Убыток: <b>$${diff * -1} или ${diffPercent}%</b>
`}
`
  }

  function renderPortfolio (price) {
    const currentDeposit = round(5488 * price)
    const diff = round(currentDeposit - 3527.60)
    const diffPercent = round((currentDeposit / 3527.60 - 1) * 100)

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
      ? `Доход: <b>$${diff} или ${diffPercent}%.</b>`
      : `Убыток: <b>$${diff * -1} или ${diffPercent}%</b>
`}
`
  }

  async function getXRPCurrency () {
    let { data } = await CoinGeckoClient.coins.fetch('ripple')
    const { usd } = data.market_data.current_price
    return usd || 0
  }

  async function updateUserVisit (ctx) {
    try {
      const { rows } = await dbClient.query('SELECT request_count FROM "public"."Users" where id = $1;', [ctx.from.id])
      const { request_count } = rows[0]
      await dbClient.query('Update "public"."Users" SET request_count = $1 WHERE id = $2;', [+request_count + 1, ctx.from.id])
    } catch (err) {
      console.log('updateUserVisit db Error', err)
    }
  }

  async function createNewUser (ctx) {
    try {
      await dbClient.query('INSERT INTO "public"."Users" (id, is_bot, first_name, username, language_code, chatId, request_count) VALUES ($1, $2, $3, $4, $5, $6, $7);', [ctx.from.id, ctx.from.is_bot, ctx.from.first_name, ctx.from.username, ctx.from.language_code, ctx.chat.id, 0])
    } catch (err) {
      console.log('createNewUser db Error', err)
    }
  }

  async function isChatPresent (id) {
    try {
      const { rowCount } = await dbClient.query('SELECT * FROM "public"."Users" where chatId = $1;', [id])
      return rowCount
    } catch (err) {
      console.log('getUser db Error', err)
    }
  }

  const mainMenu = async (ctx, str) => {
    const isPresent = await isChatPresent(ctx.chat.id)
    if (!isPresent) {
      createNewUser(ctx)
    }

    return ctx.replyWithHTML(
      str || `Hello ${ctx.from.first_name}, use menu for navigation.`,
      Keyboard.builtIn(['🤪 Short status', '😎 Get me full information'], { columns: 1 }),
    )
  }

  bot.start((ctx) => {
    startSender()
    return mainMenu(ctx)
  })

  bot.hears('🤪 Short status', async (ctx) => {
    const price = await getXRPCurrency()
    const res = await renderShortPortfolio(price)
    await updateUserVisit(ctx)
    return mainMenu(ctx, res)
  })

  bot.hears('😎 Get me full information', async (ctx) => {
    const price = await getXRPCurrency()
    const res = renderPortfolio(price)
    await updateUserVisit(ctx)
    return mainMenu(ctx, res)
  })

  bot.command('show', async (ctx) => {
    const price = await getXRPCurrency()
    const res = await renderShortPortfolio(price)
    await updateUserVisit(ctx)
    return ctx.replyWithHTML(res)
  })

  bot.command('show_all', async (ctx) => {
    const price = await getXRPCurrency()
    const res = await renderPortfolio(price)
    await updateUserVisit(ctx)
    return ctx.replyWithHTML(res)
  })

  bot.catch(error => {
    console.log('telegraf error', error.response, error.parameters, error.on || error)
  })

  bot.use(Telegraf.log())

  bot.launch()
})

require('dotenv').config({path: require('path').join(process.cwd(), '/.env')})

const TelegramBot = require('node-telegram-bot-api')
const { sendSms } = require('./lib/sendSms')
const { fetchPsql } = require('./lib/pg')
const express = require('express')

const app = express()

app.use(express.json())

const bot = new TelegramBot(process.env.BOTTOKEN, {
    polling: true
})

bot.onText(/\/statistics/, async (msg) => {
    const id = msg.chat.id
    
    const users = await fetchPsql('select count(*) as all from users')
    const contracts_count = await fetchPsql('select sum(contract_count::int) as all from contracts')
    const querySort = `
    select
    distinct contract_phone_number,
    sum(contract_count::int) as allCount,
    (
        select
        jsonb_build_object(
            'user_tg_name', u.user_tg_name,
            'user_tg_username', u.user_tg_username
        ) as user
        from users as u
        where u.user_phone_number ilike '%' || c.contract_phone_number || '%'
        limit 1
    )
    from contracts as c
    group by contract_phone_number
    order by allCount desc, contract_phone_number desc
    limit 5;
    `
    const sortedContracts = await fetchPsql(querySort)


    let message = `📊 Statistika\n\n👤 Jami foydalanuvchilar: <b>${users[0].all}</b> ta\n🎁 Jami imkoniyatlar: <b>${contracts_count[0].all}</b> ta`
    for (const data of sortedContracts) {
        message = message + `\n\n👤 Mijoz: ${data.user ? `@${data.user.user_tg_username}` : `<b>Ro'yhatdan o'tmagan</b>`}\n📞 Telefon raqam: <b>+${data.contract_phone_number}</b>\n🎁 Imkoniyatlar: <b>${data.allcount}</b> ta`
    }

    await bot.sendMessage(id, message, {
        parse_mode: 'HTML'
    })
})

bot.on('message', async msg => {
    const id = msg.chat.id

    let user = await fetchPsql('select * from users where user_tg_id = $1', id)
    if (!user.length) {
        user = await fetchPsql('insert into users (user_tg_name, user_tg_username, user_tg_id) values ($1, $2, $3) returning *', msg.chat.first_name, msg.chat.username, id)
    }

    if (user[0].user_tg_step == 1) {
        const wellcomeMsg = `${msg.chat.first_name}, Raqamni +998********* shaklida kiriting yoki yuboring.`
        const option = {
            parse_mode: 'HTML',
            reply_markup: {
                one_time_keyboard: true,
                resize_keyboard: true,
                keyboard: [[{
                    text: '📞 Mening raqamim',
                    request_contact: true
                }]]
            }
        };
        const requestPhoneNumber = await bot.sendMessage(id, wellcomeMsg, option)
        if (requestPhoneNumber.message_id) {
            await fetchPsql('update users set user_tg_step = 2 where user_tg_id = $1', requestPhoneNumber.chat.id)
        }
    } else if (user[0].user_tg_step == 2) {
        const check = msg.contact ? (msg.contact.phone_number.includes('+') ? /^\+998[389582704][012345789][0-9]{7}$/.test(msg.contact.phone_number) : /^998[389582704][012345789][0-9]{7}$/.test(msg.contact.phone_number)) : false
        if (check || /^\+998[389582704][012345789][0-9]{7}$/.test(msg.text)) {
            await fetchPsql('update users set user_phone_number = $1, user_tg_step = 3 where user_tg_id = $2', msg.contact ? msg.contact.phone_number : msg.text, id)
            sendSms(msg.contact ? msg.contact.phone_number : msg.text, user[0])
            await bot.sendMessage(id, '♻️ Sms xabar yuborildi', {
                reply_markup: {
                    remove_keyboard: true
                }
            })
        } else {
            bot.sendMessage(id, `${msg.chat.first_name}, Raqam +998********* ushbu formatda bo'lishi kerak.`)
        }
    } else if (user[0].user_tg_step == 3) {
        if (msg.text !== '✉️ Qayta yuborish') {
            const checkCode = await fetchPsql(`select * from activation_codes where user_id = $1 order by ac_createdat desc`, user[0].user_id)
            if (checkCode.length) {
                if ((new Date() - checkCode[0].ac_createdat) > 180000) {
                    const option = {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            one_time_keyboard: true,
                            resize_keyboard: true,
                            keyboard: [[{
                                text: `✉️ Qayta yuborish`
                            }]]
                        }
                    };
                    bot.sendMessage(id, `Tasdiqlash vaqti tugadi, iltimos qayta urunib ko'ring!`, option)
                } else {
                    if (msg.text == checkCode[0].ac_code) {
                        const option = {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                one_time_keyboard: true,
                                resize_keyboard: true,
                                keyboard: [[{
                                    text: `🎁 Imkoniyatlar soni`
                                }]]
                            }
                        };
                        await fetchPsql('update users set user_tg_step = 4 where user_tg_id = $1', id)
                        bot.sendMessage(id, '✅ Tasdiqlandi', option)
                    } else {
                        bot.sendMessage(id, `Tasdiqlash kodi noto'g'ri, iltimos qayta urunib ko'ring!`)
                    }
                }
            } else {
                bot.sendMessage(id, `Tasdiqlash kodi noto'g'ri, iltimos qayta urunib ko'ring!`)
            }
        } else {
            await fetchPsql('delete from activation_codes where user_id = $1', user[0].user_id)
            sendSms(user[0].user_phone_number, user[0])
            await fetchPsql('update users set user_tg_step = 3 where user_tg_id = $1', id)
            await bot.sendMessage(id, '♻️ Sms xabar yuborildi', {
                reply_markup: {
                    remove_keyboard: true
                }
            })
        }   
    } else if (user[0].user_tg_step == 4) {
        if (msg.text == '🎁 Imkoniyatlar soni') {
            const userr = await fetchPsql('select * from users where user_tg_id = $1', id)
            const datas = await fetchPsql('select * from contracts where contract_phone_number = $1', userr[0].user_phone_number.includes('+') ? userr[0].user_phone_number.substring(1) : userr[0].user_phone_number)
            let tracker2 = 0
            let cobaltvivo = 0
            let cobalt2 = 0
            let brand = 0
            for (const item of datas) {
                if (item.contract_type == 'Cobalt vivo') {
                    cobaltvivo = cobaltvivo + +item.contract_count
                } else if (item.contract_type == 'Cobalt 2') {
                    cobalt2 = cobalt2 + +item.contract_count
                } else if (item.contract_type == 'Tracker') {
                    tracker2 = tracker2 + +item.contract_count
                } else if (item.contract_type == 'brand') {
                    brand = brand + +item.contract_count
                }
            }
            const option = {
                parse_mode: 'HTML',
                reply_markup: {
                    one_time_keyboard: true,
                    resize_keyboard: true,
                    keyboard: [[{
                        text: `🎁 Imkoniyatlar soni`
                    }]]
                }
            };
            const message = `✅ Tracker 2 - 1 ta (Artel, Shivaki, Avalon, Royal mahsulotlarini xarid qilgan mijozlar o'rtasida) - <strong>${tracker2}</strong> ta imkoniyat\n\n✅ Cobalt - 1 ta (Honor va Vivo brendidan mahsulotlar xarid qilgan mijozlar o'rtasida) - ${cobaltvivo} ta imkoniyat\n\n✅ Cobalt - 2 ta (barcha turdagi mahsulotlarni xarid qilgan mijozlar o'rtasida) - ${cobalt2} ta imkoniyat`
            bot.sendMessage(id, message, option)
        } else {
            const option = {
                parse_mode: 'Markdown',
                reply_markup: {
                    one_time_keyboard: true,
                    resize_keyboard: true,
                    keyboard: [[{
                        text: `🎁 Imkoniyatlar soni`
                    }]]
                }
            };
            bot.sendMessage(id, '✅ Tasdiqlandi', option)
        }
    }
})

app.post('/api/contract/send', async (req, res) => {
    console.log(req.body);

    if (req.body.login == 'qalesizakamangashunijunatin' && req.body.password == 'buparolakafayzullohnisochiborsochlarininozibor') {
        const {contract_number, contract_phone_number, contract_type, contract_count} = req.body
        const checkContact = await fetchPsql('select * from contracts where contract_number = $1 and contract_type = $2', contract_number, contract_type)

        if (!checkContact.length) {
            await fetchPsql('insert into contracts (contract_number, contract_phone_number, contract_type, contract_count) values ($1, $2, $3, $4)', contract_number, contract_phone_number, contract_type, contract_count)
        }
        res.json('ok')
    } else {
        res.json('parol hato')
    }
})

app.listen(10001, console.log(10001))
console.log('BOT ISHLADI');
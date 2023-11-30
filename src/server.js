require('dotenv').config({path: require('path').join(process.cwd(), '/.env')})

const TelegramBot = require('node-telegram-bot-api')
const { sendSms } = require('./lib/sendSms')
const { fetchPsql } = require('./lib/pg')
const express = require('express')

const app = express()

const bot = new TelegramBot(process.env.BOTTOKEN, {
    polling: true
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
                if ((new Date() - checkCode[0].ac_createdat) > 20000) {
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
})

app.post('/api/contract/send', async (req, res) => {

    if (req.body.login == 'qalesizakamangashunijunatin' && req.body.password == 'buparolakafayzullohnisochiborsochlarininozibor') {
        const {contact_number, contact_phone_number, contact_type, contact_count} = req.body
        const checkContact = await fetchPsql('select * from contacts where contract_number = $1 and contract_type = $2', contact_number, contact_type)
        if (!checkContact.length) {
            await fetchPsql('insert into contracts (contact_number, contact_phone_number, contact_type, contact_count) values ($1, $2, $3, $4)', contact_number, contact_phone_number, contact_type, contact_count)
        }
    }
})

console.log('BOT ISHLADI');